import CyberComSubscription from '../models/CyberComSubscription.js';
import { hasPremiumAccess, premiumEvents } from '../utils/premiumCheck.js';

/**
 * Who has RPM CyberCom. It is its own subscription, $9.99 a month, and it
 * sits on top of Premium: it extends the AI dispatcher, which is Premium.
 */
export const CYBERCOM_PRICE_CENTS = 999;
const ACTIVE = ['active', 'trialing', 'past_due', 'cancelling'];
const cache = new Map();
const TTL = 60 * 1000;

export async function cyberComSubscribed(guildId) {
  const sub = await CyberComSubscription.findOne({ guildId }).lean();
  return !!sub && ACTIVE.includes(sub.status);
}

/** Bought and backed by Premium (paid, or the free trial). */
export async function isCyberComActive(guildId) {
  if (!guildId) return false;
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = false;
  try {
    const [sub, premium] = await Promise.all([cyberComSubscribed(guildId), hasPremiumAccess(guildId)]);
    value = sub && premium;
  } catch {}
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearCyberComCache(guildId) {
  if (guildId) cache.delete(guildId); else cache.clear();
}

// Premium starting or ending changes CyberCom too.
premiumEvents.on('changed', (guildId) => clearCyberComCache(guildId));
