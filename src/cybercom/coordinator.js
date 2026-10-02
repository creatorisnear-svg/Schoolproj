import CyberComConfig from '../models/CyberComConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { Session } from './session.js';
import { startHelpers, freeHelper, everyHelper } from './helpers.js';
import { isCyberComActive } from './access.js';
import { hasPremiumAccess } from '../utils/premiumCheck.js';
import { handleUtterance, GREETING } from './brain.js';
import { setMainClient, setSessionLookup } from './stops.js';

/**
 * Where the helper bots sit. When someone is in a channel RPM CyberCom
 * covers, a free helper joins it; when the channel has been empty for 15
 * seconds, the helper leaves and is free for another channel.
 *
 * Covered channels: civilian channels and extra police radios
 * (CyberComConfig), and traffic stop channels (DispatchConfig). The
 * dispatcher's own patrol channels are the main bot's on Premium servers,
 * and the helpers' radios on servers without Premium.
 */

const sessions = new Map();     // `${guildId}:${channelId}` → Session
const releases = new Map();
const configs = new Map();
const warned = new Map();
let mainClient = null;

const keyOf = (guildId, channelId) => guildId + ':' + channelId;
const humans = (channel) => (channel ? channel.members.filter((m) => !m.user.bot).size : 0);

export function sessionFor(guildId, channelId) {
  return channelId ? sessions.get(keyOf(guildId, channelId)) || null : null;
}
export function sessionsInGuild(guildId) {
  return [...sessions.values()].filter((s) => s.guildId === guildId);
}

export async function coveredChannels(guildId) {
  const hit = configs.get(guildId);
  if (hit && Date.now() - hit.at < 30000) return hit;
  const [cc, dc] = await Promise.all([
    CyberComConfig.findOne({ guildId }).lean(),
    DispatchConfig.findOne({ guildId }).lean(),
  ]);
  const map = new Map();
  for (const id of cc?.civilianChannelIds || []) map.set(id, 'civilian');
  for (const id of cc?.radioChannelIds || []) map.set(id, 'radio');
  for (const id of dc?.trafficStopChannelIds || []) map.set(id, 'stop');
  // With Premium the AI dispatcher listens on the patrol channels, so they
  // are the main bot's. Without it nothing listens there, so the helpers
  // cover them as police radios.
  const premium = await hasPremiumAccess(guildId).catch(() => false);
  for (const id of dc?.patrolChannelIds || []) {
    if (premium) map.delete(id); else map.set(id, 'radio');
  }
  const entry = { at: Date.now(), map, greet: cc?.greet !== false };
  configs.set(guildId, entry);
  return entry;
}

export function forgetConfig(guildId) { configs.delete(guildId); }

function drop(key) {
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(releases.get(key));
  releases.delete(key);
  sessions.delete(key);
  session.leave();
  if (session.helper.busy.get(session.guildId) === session.channelId) session.helper.busy.delete(session.guildId);
}

async function ensureSession(guild, channelId, role) {
  const key = keyOf(guild.id, channelId);
  clearTimeout(releases.get(key));
  releases.delete(key);
  const existing = sessions.get(key);
  if (existing) {
    existing.role = role;
    return existing;
  }
  const helper = freeHelper(guild.id);
  if (!helper) {
    if (Date.now() - (warned.get(guild.id) || 0) > 10 * 60000) {
      warned.set(guild.id, Date.now());
      console.log(`[CyberCom] ${guild.name}: no free helper bot for another channel`);
    }
    return null;
  }
  // Claimed before anything is awaited, so two people joining at once cannot
  // send the same helper to the same channel twice.
  const tts = async (line) => (await import('../handlers/dispatchHandler.js')).generateDispatchTTSPublic(line);
  const session = new Session({ helper, guildId: guild.id, channelId, role, handler: handleUtterance, tts });
  sessions.set(key, session);
  helper.busy.set(guild.id, channelId);
  session.whenReady = session.join().catch((err) => {
    console.error(`[CyberCom] helper ${helper.index} could not join ${channelId}:`, err.message);
    drop(key);
    throw err;
  });
  session.whenReady.catch(() => {});
  return session;
}

function scheduleRelease(guildId, channelId) {
  const key = keyOf(guildId, channelId);
  if (!sessions.has(key) || releases.has(key)) return;
  releases.set(key, setTimeout(() => {
    releases.delete(key);
    const channel = mainClient?.guilds.cache.get(guildId)?.channels.cache.get(channelId);
    if (humans(channel) === 0) drop(key);
  }, 15000));
}

/** The main bot's voiceStateUpdate, for people (bots are filtered before this). */
export async function onVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild;
  if (!guild || !(await isCyberComActive(guild.id))) return;
  const { map, greet } = await coveredChannels(guild.id);
  for (const id of new Set([oldState.channelId, newState.channelId])) {
    if (!id || !map.has(id)) continue;
    if (humans(guild.channels.cache.get(id)) > 0) await ensureSession(guild, id, map.get(id));
    else scheduleRelease(guild.id, id);
  }
  const joined = newState.channelId && newState.channelId !== oldState.channelId;
  if (joined && greet && map.has(newState.channelId)) {
    const session = sessionFor(guild.id, newState.channelId);
    session?.whenReady?.then(() => session.greet(newState.id, GREETING[session.role])).catch(() => {});
  }
}

/** Put helpers where people are, and take them out of channels no longer covered. */
export async function scan() {
  if (!mainClient) return;
  for (const guild of mainClient.guilds.cache.values()) {
    if (!(await isCyberComActive(guild.id))) {
      for (const s of sessionsInGuild(guild.id)) drop(keyOf(s.guildId, s.channelId));
      continue;
    }
    const { map } = await coveredChannels(guild.id);
    for (const s of sessionsInGuild(guild.id)) {
      if (!map.has(s.channelId)) drop(keyOf(s.guildId, s.channelId));
    }
    for (const [id, role] of map) {
      if (humans(guild.channels.cache.get(id)) > 0) await ensureSession(guild, id, role);
    }
  }
}

export async function startCyberCom(client) {
  mainClient = client;
  setMainClient(client);
  setSessionLookup(sessionFor, (guildId) => sessionsInGuild(guildId).filter((s) => s.role === 'radio'));
  const count = await startHelpers();
  if (!count) return;
  // A helper moved or disconnected by someone: that session is over.
  for (const helper of everyHelper()) {
    helper.client.on('voiceStateUpdate', (oldState, newState) => {
      if (newState.id !== helper.client.user?.id || !oldState.channelId || oldState.channelId === newState.channelId) return;
      const key = keyOf(newState.guild.id, oldState.channelId);
      if (sessions.get(key)?.helper === helper) drop(key);
    });
  }
  setTimeout(() => scan().catch((err) => console.error('[CyberCom] scan:', err.message)), 15000).unref?.();
  setInterval(() => scan().catch((err) => console.error('[CyberCom] scan:', err.message)), 2 * 60000).unref?.();
}
