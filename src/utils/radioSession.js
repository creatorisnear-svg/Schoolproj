/**
 * Per-guild radio session log.
 *
 * Stores the rolling conversation history so the AI dispatcher knows what
 * officers said earlier in the same voice session. Cleared automatically
 * whenever the bot disconnects from voice, so the AI only ever knows things
 * from the CURRENT session — nothing from yesterday.
 */

const _radioLog = new Map(); // guildId → Array<{ officer, said, response }>
const RADIO_LOG_MAX = 8;     // keep last 8 exchanges per session

export function addToRadioLog(guildId, officerName, said, response) {
  if (!_radioLog.has(guildId)) _radioLog.set(guildId, []);
  const log = _radioLog.get(guildId);
  log.push({ officer: officerName, said, response });
  if (log.length > RADIO_LOG_MAX) log.shift();
}

export function getRadioLog(guildId) {
  return _radioLog.get(guildId) || [];
}

/**
 * Clear the session log for a guild.
 * Called by voiceListener when the bot disconnects from voice.
 */
export function clearRadioLog(guildId) {
  _radioLog.delete(guildId);
  console.log(`[RadioSession] Session log cleared for guild ${guildId}`);
}
