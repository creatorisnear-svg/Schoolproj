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

/**
 * Store patrol config for a guild without joining any channel yet.
 * Call this on startup / when config is first loaded.
 */
export function setupDispatchForGuild(guildId, patrolChannelIds, options) {
  const existing = dispatchState.get(guildId);
  if (existing) {
    existing.patrolChannelIds = new Set(patrolChannelIds);
    existing.options = options;
  } else {
    dispatchState.set(guildId, {
      connection: null,
      currentChannelId: null,
      patrolChannelIds: new Set(patrolChannelIds),
      options,
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

  if (state.connection) {
    try { state.connection.destroy(); } catch {}
    state.connection = null;
    state.currentChannelId = null;
  }

  let connection;
  try {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  } catch (err) {
    console.error(`[Dispatch] Failed to join "${channel.name}":`, err.message);
    return null;
  }

  state.connection = connection;
  state.currentChannelId = channel.id;

  _setupReceiver(connection, channel.guild, state, guildId);

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
export function playDispatchVoice(guildId, audioBuffer) {
  const state = dispatchState.get(guildId);
  if (!state?.connection) return;

  try {
    // Stop and clean up any previous player
    if (state.audioPlayer) {
      try { state.audioPlayer.stop(true); } catch {}
    }

    const player = createAudioPlayer();
    state.audioPlayer = player;

    const resource = createAudioResource(Readable.from(audioBuffer), {
      inputType: StreamType.OggOpus,
    });

    state.connection.subscribe(player);
    player.play(resource);

    player.on('error', err => {
      console.error('[Dispatch TTS] Audio player error:', err.message);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      if (state.audioPlayer === player) state.audioPlayer = null;
    });
  } catch (err) {
    console.error('[Dispatch TTS] Failed to play voice:', err.message);
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
