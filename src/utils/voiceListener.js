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
import { createSocket as createUdpSocket } from 'dgram';
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
 *   guild:            Guild | null,
 *   options:          { onTranscription, userFilter }
 * }>
 */
const dispatchState = new Map();

/** "guildId:userId" pairs currently being recorded — prevents parallel subscriptions */
const recordingUsers = new Set();

/** Guild IDs currently in the process of joining a channel — prevents concurrent joins */
const joiningGuilds = new Set();

/** Per-guild reconnect tracking for exponential backoff */
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 300000;

/** Per-guild log throttling — suppress repetitive voice state logs */
const lastLoggedState = new Map();
const logThrottleCounts = new Map();

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
      guild: null,
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
      guild: null,
      options: options || {},
    });
  }
}

/**
 * Find the first patrol channel in the guild that currently has human members.
 * Used to decide where to reconnect after a connection failure.
 */
function _findActivePatrolChannel(guildId) {
  const state = dispatchState.get(guildId);
  if (!state?.guild) return null;
  for (const channelId of state.patrolChannelIds) {
    const channel = state.guild.channels.cache.get(channelId);
    if (channel?.members?.size > 0) return channel;
  }
  return null;
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

  if (state.currentChannelId === channel.id &&
      state.connection?.state.status === VoiceConnectionStatus.Ready) {
    return state.connection;
  }

  // Prevent concurrent joins for the same guild
  if (joiningGuilds.has(guildId)) return null;
  joiningGuilds.add(guildId);

  // Store the guild reference so watchdog/reconnect can find active channels later
  state.guild = channel.guild;

  if (state.connection) {
    try { state.connection.destroy(); } catch {}
    state.connection = null;
    state.currentChannelId = null;
    // Let Discord process the leave before we request to rejoin — this forces a fresh
    // VOICE_STATE_UPDATE + VOICE_SERVER_UPDATE on the next join, avoiding stale tokens.
    await new Promise(r => setTimeout(r, 1500));
  }

  let connection;
  try {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
      debug: false,
    });
  } catch (err) {
    console.error(`[Dispatch] Failed to join "${channel.name}":`, err.message);
    joiningGuilds.delete(guildId);
    return null;
  }

  state.connection = connection;
  state.currentChannelId = channel.id;
  joiningGuilds.delete(guildId);

  connection.on('error', (err) => {
    const errKey = `err:${guildId}`;
    const cnt = (logThrottleCounts.get(errKey) || 0) + 1;
    logThrottleCounts.set(errKey, cnt);
    if (cnt <= 3 || cnt % 10 === 0) {
      console.error(`[Voice] Connection error in guild ${guildId}: ${err.message} (x${cnt})`);
    }
  });

  connection.on('stateChange', (oldState, newState) => {
    const transition = `${oldState.status}→${newState.status}`;
    const stateKey = `state:${guildId}`;
    const last = lastLoggedState.get(stateKey);
    if (last === transition) {
      const cnt = (logThrottleCounts.get(stateKey) || 0) + 1;
      logThrottleCounts.set(stateKey, cnt);
      if (cnt % 20 === 0) {
        console.log(`[Voice] ${transition} (repeated ${cnt} times, suppressing)`);
      }
    } else {
      lastLoggedState.set(stateKey, transition);
      logThrottleCounts.set(stateKey, 0);
      console.log(`[Voice] ${oldState.status} → ${newState.status}`);
    }
    const net = newState.networking;
    if (net && net !== oldState.networking) {
      net.once('close', (code) => {
        const netKey = `net:${guildId}`;
        const cnt = (logThrottleCounts.get(netKey) || 0) + 1;
        logThrottleCounts.set(netKey, cnt);
        if (cnt <= 3 || cnt % 20 === 0) {
          console.log(`[Voice Networking] closed code: ${code} (x${cnt})`);
        }
        if (code === 4006) {
          connectionFailCount++;
          if (connectionFailCount >= CONNECTION_FAIL_LIMIT && !watchdogTriggered && state.connection === connection) {
            console.log(`[Voice] ${CONNECTION_FAIL_LIMIT} consecutive 4006 closes — destroying connection early (watchdog will reconnect)`);
            watchdogTriggered = true;
            clearTimeout(watchdog);
            try { connection.destroy(); } catch {}
            const attempts = (reconnectAttempts.get(guildId) || 0) + 1;
            reconnectAttempts.set(guildId, attempts);
            const backoff = attempts > MAX_RECONNECT_ATTEMPTS
              ? Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempts - MAX_RECONNECT_ATTEMPTS))
              : Math.min(30000, BASE_BACKOFF_MS * attempts);
            console.log(`[Dispatch] Reconnect attempt ${attempts}, waiting ${Math.round(backoff / 1000)}s...`);
            setTimeout(async () => {
              if (state.connection) return;
              if (attempts > MAX_RECONNECT_ATTEMPTS) reconnectAttempts.set(guildId, 0);
              const targetChannel = _findActivePatrolChannel(guildId);
              if (targetChannel) {
                console.log(`[Dispatch] Reconnecting to "${targetChannel.name}"`);
                moveToChannel(targetChannel);
              }
            }, backoff);
          }
        }
      });
      let udpBypassFired = false;
      let udpBypassAttempts = 0;
      net.on('stateChange', (_oNS, nNS) => {
        if (nNS.code === 2 && nNS.udp && !udpBypassFired) {
          udpBypassFired = true;
          udpBypassAttempts++;
          const udp = nNS.udp;
          const ssrc = nNS.connectionData?.ssrc || 0;
          if (udpBypassAttempts <= 2) {
            console.log(`[UDP Bypass] code:2 reached, ssrc=${ssrc}. Waiting 3s for real UDP discovery...`);
          }

          setTimeout(async () => {
            if (connection.state.status === VoiceConnectionStatus.Ready) {
              return;
            }
            if (udpBypassAttempts <= 2) {
              console.log('[UDP Bypass] Connection still not Ready after 3s — faking discovery response');
            }

            let externalIp = '127.0.0.1';
            try {
              const resp = await fetch('https://api.ipify.org?format=json');
              const json = await resp.json();
              externalIp = json.ip;
            } catch (e) {
              if (udpBypassAttempts <= 2) console.warn('[UDP Bypass] ipify failed:', e.message);
            }

            const localPort = await new Promise(res => {
              const start = Date.now();
              const tryPort = () => {
                if (connection.state.status === VoiceConnectionStatus.Ready ||
                    state.connection !== connection ||
                    Date.now() - start > 2000) {
                  res(0);
                  return;
                }
                try {
                  const p = udp.socket.address().port;
                  if (p > 0) { res(p); return; }
                } catch {}
                setImmediate(tryPort);
              };
              tryPort();
            });
            if (localPort === 0) {
              return;
            }

            const fake = Buffer.alloc(74);
            fake.writeUInt16BE(2, 0);
            fake.writeUInt16BE(70, 2);
            fake.writeUInt32BE(ssrc, 4);
            fake.write(externalIp, 8, 'utf8');
            fake.writeUInt16BE(localPort, 72);
            udp.socket.emit('message', fake);
          }, 3000);
        }
      });
    }
  });

  _setupReceiver(connection, channel.guild, state, guildId);

  const onConnectionReady = () => {
    console.log(`[Dispatch] Connection ready in "${channel.name}"`);
    setTimeout(async () => {
      if (state.connection !== connection) return;
      if (state.joinAudioBuffer) {
        console.log('[Dispatch] Playing cached join audio');
        playDispatchVoice(guildId, state.joinAudioBuffer);
      } else {
        console.log('[Dispatch] No join audio cached — generating now...');
        try {
          const { generateDispatchTTSPublic } = await import('../handlers/dispatchHandler.js');
          const buf = await generateDispatchTTSPublic('Dispatch online, ready to serve.');
          state.joinAudioBuffer = buf;
          if (state.connection === connection) {
            playDispatchVoice(guildId, buf);
          }
        } catch (err) {
          console.error('[Dispatch] Join TTS retry failed:', err.message);
          if (state.options?.onJoin) {
            state.options.onJoin(guildId).catch(e => {
              console.error('[Dispatch] onJoin callback error:', e.message);
            });
          }
        }
      }
    }, 500);
  };

  if (connection.state.status === VoiceConnectionStatus.Ready) {
    onConnectionReady();
  } else {
    connection.once(VoiceConnectionStatus.Ready, onConnectionReady);
  }

  // Watchdog: Discord voice sessions can be rejected with 4006 (session no longer valid)
  // on the very first attempt. The internal retry loop reuses the same stale token, so it
  // never recovers on its own. After 20 seconds, we fully leave and re-join to get fresh
  // credentials from Discord (new VOICE_STATE_UPDATE + VOICE_SERVER_UPDATE).
  let connectionFailCount = 0;
  const CONNECTION_FAIL_LIMIT = 3;
  let watchdogTriggered = false;
  const watchdog = setTimeout(async () => {
    if (state.connection !== connection) return;
    const status = connection.state.status;
    if (status === VoiceConnectionStatus.Ready) {
      reconnectAttempts.set(guildId, 0);
      return;
    }

    watchdogTriggered = true;
    const attempts = (reconnectAttempts.get(guildId) || 0) + 1;
    reconnectAttempts.set(guildId, attempts);

    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      const cooldown = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempts - MAX_RECONNECT_ATTEMPTS));
      console.log(`[Dispatch] Watchdog: ${attempts} failed attempts — cooling down for ${Math.round(cooldown / 1000)}s before next try`);
      try { connection.destroy(); } catch {}

      setTimeout(async () => {
        if (state.connection) return;
        reconnectAttempts.set(guildId, 0);
        const targetChannel = _findActivePatrolChannel(guildId);
        if (targetChannel) {
          console.log(`[Dispatch] Watchdog: cooldown ended, retrying "${targetChannel.name}"`);
          moveToChannel(targetChannel);
        }
      }, cooldown);
      return;
    }

    const backoff = Math.min(30000, BASE_BACKOFF_MS * attempts);
    console.log(`[Dispatch] Watchdog: connection stuck in "${status}" — attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS}, reconnecting in ${Math.round(backoff / 1000)}s`);
    try { connection.destroy(); } catch {}

    await new Promise(r => setTimeout(r, backoff));
    if (state.connection) return;

    const targetChannel = _findActivePatrolChannel(guildId);
    if (targetChannel) {
      console.log(`[Dispatch] Watchdog: rejoining "${targetChannel.name}"`);
      moveToChannel(targetChannel);
    }
  }, 25000);

  connection.once(VoiceConnectionStatus.Ready, () => {
    clearTimeout(watchdog);
    reconnectAttempts.set(guildId, 0);
    for (const key of [...logThrottleCounts.keys()]) {
      if (key.endsWith(`:${guildId}`)) logThrottleCounts.delete(key);
    }
    for (const key of [...lastLoggedState.keys()]) {
      if (key.endsWith(`:${guildId}`)) lastLoggedState.delete(key);
    }
  });

  connection.once(VoiceConnectionStatus.Destroyed, () => {
    clearTimeout(watchdog);
    if (state.connection === connection) {
      state.connection = null;
      state.currentChannelId = null;
    }

    if (!watchdogTriggered) {
      const attempts = reconnectAttempts.get(guildId) || 0;
      const backoff = Math.min(30000, BASE_BACKOFF_MS * Math.max(1, attempts));
      setTimeout(async () => {
        if (state.connection) return;
        const targetChannel = _findActivePatrolChannel(guildId);
        if (targetChannel) {
          console.log(`[Dispatch] Auto-reconnecting to "${targetChannel.name}" after disconnect`);
          moveToChannel(targetChannel);
        }
      }, backoff);
    }
  });

  // If Discord explicitly disconnects the bot (4014 kick), destroy and schedule re-join
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
    } catch {
      if (state.connection === connection) {
        state.connection = null;
        state.currentChannelId = null;
      }
      try { connection.destroy(); } catch {}
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
  reconnectAttempts.delete(guildId);
  for (const key of [...logThrottleCounts.keys()]) {
    if (key.endsWith(`:${guildId}`)) logThrottleCounts.delete(key);
  }
  for (const key of [...lastLoggedState.keys()]) {
    if (key.endsWith(`:${guildId}`)) lastLoggedState.delete(key);
  }
}

/**
 * Play a TTS audio buffer through the guild's active voice connection.
 * Stops any currently playing audio first so the dispatcher never overlaps itself.
 * Only plays if the connection is in the Ready state.
 */
export async function playDispatchVoice(guildId, audioBuffer) {
  const state = dispatchState.get(guildId);
  const conn = state?.connection;
  if (!conn) {
    console.error('[Dispatch TTS] No active connection for guild:', guildId);
    return;
  }

  const connStatus = conn.state?.status;
  if (connStatus !== VoiceConnectionStatus.Ready) {
    console.warn(`[Dispatch TTS] Connection not Ready (${connStatus}) — waiting for Ready state`);
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      console.error('[Dispatch TTS] Connection never reached Ready — skipping audio');
      return;
    }
    if (state.connection !== conn) return;
  }

  try {
    if (state.audioPlayer) {
      try { state.audioPlayer.stop(true); } catch {}
    }

    const player = createAudioPlayer();
    state.audioPlayer = player;

    const bufferStream = new Readable();
    bufferStream.push(audioBuffer);
    bufferStream.push(null);

    const isOgg = audioBuffer.length >= 4 && audioBuffer.toString('ascii', 0, 4) === 'OggS';
    const resource = createAudioResource(bufferStream, {
      inputType: isOgg ? StreamType.OggOpus : StreamType.Arbitrary,
    });

    conn.subscribe(player);
    player.play(resource);

    console.log(`[Dispatch TTS] Playing audio (${audioBuffer.length} bytes) for guild ${guildId}`);

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
