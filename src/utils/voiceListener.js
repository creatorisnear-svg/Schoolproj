import { joinVoiceChannel, EndBehaviorType, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import prism from 'prism-media';

const connections = new Map();
const recordingUsers = new Set();

export function joinDispatchChannel(channel, options = {}) {
  const { onTranscription, userFilter } = options;
  const guildId = channel.guild.id;

  const existing = connections.get(guildId);
  if (existing) {
    const channels = existing._patrolChannelIds || new Set();
    channels.add(channel.id);
    existing._patrolChannelIds = channels;
    return existing;
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
    console.error(`[Dispatch] Failed to join voice channel ${channel.name}:`, err.message);
    return null;
  }

  connection._patrolChannelIds = new Set([channel.id]);

  const receiver = connection.receiver;

  receiver.speaking.on('start', async (userId) => {
    const key = `${guildId}:${userId}`;
    if (recordingUsers.has(key)) return;

    if (userFilter) {
      try {
        const allowed = await userFilter(userId);
        if (!allowed) return;
      } catch {
        return;
      }
    }

    recordingUsers.add(key);

    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1500 },
    });

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

    decoder.on('data', (chunk) => pcmChunks.push(chunk));

    decoder.on('end', async () => {
      recordingUsers.delete(key);
      if (pcmChunks.length < 8) return;

      const wavBuffer = createWavBuffer(pcmChunks);
      if (onTranscription) {
        try {
          await onTranscription(wavBuffer, userId, channel.guild);
        } catch (err) {
          console.error('[Dispatch] onTranscription error:', err.message);
        }
      }
    });

    decoder.on('error', (err) => {
      recordingUsers.delete(key);
      console.error('[Dispatch] Decoder error:', err.message);
    });

    stream.on('error', (err) => {
      recordingUsers.delete(key);
      console.error('[Dispatch] Audio stream error:', err.message);
    });
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      try { connection.destroy(); } catch {}
      connections.delete(guildId);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    connections.delete(guildId);
  });

  connections.set(guildId, connection);
  console.log(`[Dispatch] Joined voice channel "${channel.name}" in ${channel.guild.name}`);
  return connection;
}

export function leaveDispatchChannel(guildId) {
  const connection = connections.get(guildId);
  if (connection) {
    try { connection.destroy(); } catch {}
    connections.delete(guildId);
  }
}

export function getDispatchConnection(guildId) {
  return connections.get(guildId) || null;
}

export function isListeningToChannel(guildId, channelId) {
  const conn = connections.get(guildId);
  return conn?._patrolChannelIds?.has(channelId) ?? false;
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
