import VoiceTranscript from '../models/VoiceTranscript.js';

/**
 * Everything said in channels RPM CyberCom covers, for /voicemoderation.
 * Kept for the server's retention (3, 7 or 14 days), and checked for flags.
 */

const NOISE = new Set(['', 'thank you', 'thanks', 'you', 'thank you for watching', 'thanks for watching', 'bye', 'uh', 'um']);

export function isNoise(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length < 2 || NOISE.has(t);
}

export async function saveTranscript({ guildId, channelId, channelName, userId, username, text, at = new Date() }) {
  if (!guildId || !channelId || !userId || isNoise(text)) return null;
  const flags = await import('./flags.js');
  const days = await flags.retentionDays(guildId).catch(() => 14);
  const doc = await VoiceTranscript.create({
    guildId, channelId, channelName: channelName || null, userId, username: username || null,
    text: String(text).trim().slice(0, 1000), at, expireAt: new Date(new Date(at).getTime() + days * 86400000),
  }).catch((err) => { console.warn('[CyberCom] transcript not saved:', err.message); return null; });
  // Flagged in the background: saying something never waits on the check.
  if (doc) flags.checkLine(doc).catch(() => {});
  return doc;
}

/** One UTC day of a channel, optionally one member. day is YYYY-MM-DD. */
export async function readTranscript({ guildId, channelId, day, userId = null }) {
  const from = new Date(day + 'T00:00:00.000Z');
  const to = new Date(from.getTime() + 86400000);
  const query = { guildId, channelId, at: { $gte: from, $lt: to } };
  if (userId) query.userId = userId;
  return VoiceTranscript.find(query).sort({ at: 1 }).limit(5000).lean();
}

/** The transcript as a text file people can read and keep. */
export function transcriptText({ guildName, channelName, day, memberName, lines }) {
  const head = [
    'RPM CyberCom transcript',
    'Server: ' + (guildName || ''),
    'Channel: ' + (channelName || ''),
    'Day: ' + day + ' (times are UTC)',
    memberName ? 'Member: ' + memberName : 'Member: everyone',
    'Lines: ' + lines.length,
    '',
  ];
  const body = lines.map((l) => '[' + new Date(l.at).toISOString().slice(11, 19) + '] ' + (l.username || l.userId) + ': ' + l.text);
  return head.concat(body).join('\n') + '\n';
}
