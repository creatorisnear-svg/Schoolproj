import {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} from '@discordjs/voice';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import prism from 'prism-media';

/**
 * Per-guild dispatch state.
 * Discord only allows one VoiceConnection per guild, so we maintain ONE connection
 * and move it between patrol channels as officers become active in them.
 *
 * Map<guildId, {
 *   connection:       VoiceConnection | null,
 *   currentChannelId: string | null,
 *   patrolChannelIds: Set<string>,
 *   options:          { onTranscription, userFilter }
 * }>
 */
const dispatchState = new Map();

/** "guildId:userId" pairs currently being recorded — prevents parallel subscriptions */
const recordingUsers = new Set();

/** Guild IDs currently in the process of joining a channel — prevents concurrent joins */
const joiningGuilds = new Set();

/** Tracks the last time a join was attempted per guild (ms timestamp) */
const lastJoinTime = new Map();

/**
 * Store patrol config for a guild without joining any channel yet.
 * Call this on startup / when config is first loaded.
 */
export function setupDispatchForGuild(guildId, patrolChannelIds, options, joinAudioBuffer = null) {
  const existing = dispatchState.get(guildId);
  if (existing) {
    existing.patrolChannelIds = new Set(patrolChannelIds);
    existing.options = options;
    if (joinAudioBuffer) existing.joinAudioBuffer = joinAudioBuffer;
  } else {
    dispatchState.set(guildId, {
      connection: null,
      currentChannelId: null,
      patrolChannelIds: new Set(patrolChannelIds),
      options,
      joinAudioBuffer,
    });
  }
}

/**
 * Register an additional patrol channel for a guild that already has state.
 * Used when the admin adds a new patrol channel via /dispatchsetup.
 */
export function addPatrolChannel(guildId, channelId, options) {
  const state = dispatchState.get(guildId);
  if (state) {
    state.patrolChannelIds.add(channelId);
    if (options) state.options = options;
  } else {
    dispatchState.set(guildId, {
      connection: null,
      currentChannelId: null,
      patrolChannelIds: new Set([channelId]),
      options: options || {},
    });
  }
}

/**
 * Join (or switch to) a voice channel.
 * Only acts if the channel is in the guild's patrol list.
 * Destroys any existing connection for that guild before creating a new one.
 */
export async function moveToChannel(channel) {
  const guildId = channel.guild.id;
  const state = dispatchState.get(guildId);
  if (!state) return null;

  if (!state.patrolChannelIds.has(channel.id)) return null;

  if (state.currentChannelId === channel.id && state.connection) {
    return state.connection;
  }

  // Prevent concurrent joins for the same guild
  if (joiningGuilds.has(guildId)) return null;

  // Cooldown: don't rejoin within 8 seconds of the last attempt
  const now = Date.now();
  const last = lastJoinTime.get(guildId) || 0;
  if (now - last < 8000) return null;

  joiningGuilds.add(guildId);
  lastJoinTime.set(guildId, now);

  if (state.connection) {
    try { state.connection.destroy(); } catch {}
    state.connection = null;
    state.currentChannelId = null;
  }

  let connection;
  try {
    // Wrap the adapterCreator to log when voice events are forwarded to the connection
    const wrappedAdapterCreator = (methods) => {
      const origOnVoiceStateUpdate = methods.onVoiceStateUpdate;
      const origOnVoiceServerUpdate = methods.onVoiceServerUpdate;
      methods.onVoiceStateUpdate = (data) => {
        console.log(`[Voice Adapter] onVoiceStateUpdate: session=${data.session_id}, channel=${data.channel_id}`);
        return origOnVoiceStateUpdate(data);
      };
      methods.onVoiceServerUpdate = (data) => {
        console.log(`[Voice Adapter] onVoiceServerUpdate: endpoint=${data.endpoint}`);
        return origOnVoiceServerUpdate(data);
      };
      return channel.guild.voiceAdapterCreator(methods);
    };

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: wrappedAdapterCreator,
      selfDeaf: false,
      selfMute: false,
      debug: true,
    });
  } catch (err) {
    console.error(`[Dispatch] Failed to join "${channel.name}":`, err.message);
    joiningGuilds.delete(guildId);
    return null;
  }

  state.connection = connection;
  state.currentChannelId = channel.id;
  joiningGuilds.delete(guildId);

  connection.on('debug', msg => {
    console.log(`[Voice Debug] ${msg.substring(0, 300)}`);
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[Voice State] ${oldState.status} → ${newState.status}`);
  });

  _setupReceiver(connection, channel.guild, state, guildId);

  // Play the join audio once the connection is fully ready.
  // If it's already in Ready state (session resumed), fire right away.
  const onConnectionReady = () => {
    console.log(`[Dispatch] Connection ready in "${channel.name}" — scheduling join audio`);
    setTimeout(() => {
      if (state.connection === connection && state.joinAudioBuffer) {
        playDispatchVoice(guildId, state.joinAudioBuffer);
      } else if (state.options?.onJoin) {
        state.options.onJoin(guildId).catch(err => {
          console.error('[Dispatch] onJoin callback error:', err.message);
        });
      }
    }, 500);
  };

  console.log(`[Dispatch] Connection state after join: ${connection.state.status}`);
  if (connection.state.status === VoiceConnectionStatus.Ready) {
    onConnectionReady();
  } else {
    connection.once(VoiceConnectionStatus.Ready, onConnectionReady);

    // Fallback: play audio after 3 seconds even if Ready hasn't fired yet —
    // Discord sometimes skips the event when resuming an existing session.
    setTimeout(() => {
      const status = connection.state.status;
      console.log(`[Dispatch] Connection state after 3s: ${status}`);
      if (status !== VoiceConnectionStatus.Destroyed && state.connection === connection) {
        if (state.joinAudioBuffer) {
          console.log('[Dispatch] Fallback: playing join audio without waiting for Ready');
          playDispatchVoice(guildId, state.joinAudioBuffer);
        }
      }
    }, 3000);
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (state.connection === connection) {
        state.connection = null;
        state.currentChannelId = null;
      }
      try { connection.destroy(); } catch {}
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (state.connection === connection) {
      state.connection = null;
      state.currentChannelId = null;
    }
  });

  console.log(`[Dispatch] Joined voice channel "${channel.name}" in ${channel.guild.name}`);
  return connection;
}

function _setupReceiver(connection, guild, state, guildId) {
  const { onTranscription, userFilter } = state.options;
  const receiver = connection.receiver;

  receiver.speaking.on('start', async (userId) => {
    const key = `${guildId}:${userId}`;
    if (recordingUsers.has(key)) return;

    if (userFilter) {
      const allowed = await userFilter(userId).catch(() => false);
      if (!allowed) return;
    }

    recordingUsers.add(key);

    let stream;
    try {
      stream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
      });
    } catch (err) {
      recordingUsers.delete(key);
      return;
    }

    let decoder;
    try {
      decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    } catch (err) {
      console.error('[Dispatch] Failed to create Opus decoder:', err.message);
      recordingUsers.delete(key);
      stream.destroy();
      return;
    }

    const pcmChunks = [];
    stream.pipe(decoder);

    decoder.on('data', chunk => pcmChunks.push(chunk));

    decoder.on('end', async () => {
      recordingUsers.delete(key);
      if (pcmChunks.length < 8) return;
      const wav = createWavBuffer(pcmChunks);
      if (onTranscription) {
        try { await onTranscription(wav, userId, guild); }
        catch (err) { console.error('[Dispatch] onTranscription error:', err.message); }
      }
    });

    decoder.on('error', (err) => {
      recordingUsers.delete(key);
      console.error('[Dispatch] Decoder error:', err.message);
    });

    stream.on('error', (err) => {
      recordingUsers.delete(key);
      console.error('[Dispatch] Stream error:', err.message);
    });
  });
}

/**
 * Idle disconnect: destroy the voice connection but keep patrol config in memory.
 * Use this when all patrol channels are temporarily empty so the bot can rejoin
 * automatically when officers next enter a patrol channel (via voiceStateUpdate).
 */
export function disconnectDispatchChannel(guildId) {
  const state = dispatchState.get(guildId);
  if (!state) return;
  if (state.connection) {
    try { state.connection.destroy(); } catch {}
    state.connection = null;
    state.currentChannelId = null;
  }
}

/**
 * Full teardown: destroy the voice connection AND remove all state for this guild.
 * Use this only for explicit unconfigure flows (e.g., system disabled via /dispatchsetup).
 */
export function leaveDispatchChannel(guildId) {
  const state = dispatchState.get(guildId);
  if (!state) return;
  if (state.connection) {
    try { state.connection.destroy(); } catch {}
  }
  dispatchState.delete(guildId);
}

/**
 * Play a TTS audio buffer (OGG Opus format) through the guild's active voice connection.
 * Stops any currently playing audio first so the dispatcher never overlaps itself.
 */
export async function playDispatchVoice(guildId, audioBuffer) {
  const state = dispatchState.get(guildId);
  if (!state?.connection) {
    console.error('[Dispatch TTS] No active connection for guild:', guildId);
    return;
  }

  const tempPath = join(tmpdir(), `tts_${guildId}_${Date.now()}.wav`);

  try {
    if (state.audioPlayer) {
      try { state.audioPlayer.stop(true); } catch {}
    }

    writeFileSync(tempPath, audioBuffer);

    const player = createAudioPlayer();
    state.audioPlayer = player;

    const resource = createAudioResource(createReadStream(tempPath), {
      inputType: StreamType.Arbitrary,
    });

    state.connection.subscribe(player);
    player.play(resource);

    const connState = state.connection.state?.status ?? 'unknown';
    console.log(`[Dispatch TTS] Playing audio (${audioBuffer.length} bytes) for guild ${guildId} — connection: ${connState}`);

    player.on('error', err => {
      console.error('[Dispatch TTS] Audio player error:', err.message);
      try { unlinkSync(tempPath); } catch {}
    });

    player.on(AudioPlayerStatus.Idle, () => {
      if (state.audioPlayer === player) state.audioPlayer = null;
      try { unlinkSync(tempPath); } catch {}
    });
  } catch (err) {
    console.error('[Dispatch TTS] Failed to play voice:', err.message);
    try { unlinkSync(tempPath); } catch {}
  }
}

/** Returns the dispatch state object for a guild, or null if not configured. */
export function getDispatchState(guildId) {
  return dispatchState.get(guildId) || null;
}

/** True if the given channelId is in this guild's patrol list. */
export function isPatrolChannel(guildId, channelId) {
  return dispatchState.get(guildId)?.patrolChannelIds.has(channelId) ?? false;
}

/** Returns the voice channel ID the bot is currently listening in (or null). */
export function getCurrentChannelId(guildId) {
  return dispatchState.get(guildId)?.currentChannelId ?? null;
}

function createWavBuffer(pcmChunks) {
  const pcmData = Buffer.concat(pcmChunks);
  const numChannels = 2;
  const sampleRate = 48000;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  let o = 0;
  header.write('RIFF', o); o += 4;
  header.writeUInt32LE(36 + pcmData.length, o); o += 4;
  header.write('WAVE', o); o += 4;
  header.write('fmt ', o); o += 4;
  header.writeUInt32LE(16, o); o += 4;
  header.writeUInt16LE(1, o); o += 2;
  header.writeUInt16LE(numChannels, o); o += 2;
  header.writeUInt32LE(sampleRate, o); o += 4;
  header.writeUInt32LE(byteRate, o); o += 4;
  header.writeUInt16LE(blockAlign, o); o += 2;
  header.writeUInt16LE(bitsPerSample, o); o += 2;
  header.write('data', o); o += 4;
  header.writeUInt32LE(pcmData.length, o);

  return Buffer.concat([header, pcmData]);
}
