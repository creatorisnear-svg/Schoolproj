import CyberComSubscription from '../models/CyberComSubscription.js';

/**
 * Who has RPM CyberCom: its own subscription, $9.99 a month, with or without
 * Premium. Without Premium the helper bots also cover the police radio,
 * which Premium's AI dispatcher covers otherwise (coordinator.js).
 */
export const CYBERCOM_PRICE_CENTS = 999;
const ACTIVE = ['active', 'trialing', 'past_due', 'cancelling'];
const cache = new Map();
const TTL = 60 * 1000;

export async function cyberComSubscribed(guildId) {
  const sub = await CyberComSubscription.findOne({ guildId }).lean();
  return !!sub && ACTIVE.includes(sub.status);
}

export async function isCyberComActive(guildId) {
  if (!guildId) return false;
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = false;
  try { value = await cyberComSubscribed(guildId); } catch {}
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearCyberComCache(guildId) {
  if (guildId) cache.delete(guildId); else cache.clear();
}
