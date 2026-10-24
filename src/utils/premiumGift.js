import PremiumGift from '../models/PremiumGift.js';

/**
 * Free time given to a server (models/PremiumGift.js), counted by the access
 * checks next to paid Premium and trials: checkFeatureAccess, getGuildLimits
 * and hasPremiumAccess in premiumCheck.js, isCyberComActive in cybercom/access.js.
 * It is not a trial, so the server's own free trials stay unused.
 *
 * Cached a minute, but the end time is compared on every call, so a gift
 * stops at its end time exactly. utils/giftCampaign.js then tells dispatch,
 * branding and the CyberCom helpers.
 */
const cache = new Map();
const TTL = 60 * 1000;

/** When this server's running gift of this kind ends, or null when there is none. */
export async function giftUntil(guildId, kind) {
  if (!guildId) return null;
  const key = guildId + ':' + kind;
  const hit = cache.get(key);
  let until;
  if (hit && Date.now() - hit.at < TTL) {
    until = hit.until;
  } else {
    until = null;
    try {
      const gift = await PremiumGift.findOne({ guildId, kind, endsAt: { $gt: new Date() } }).sort({ endsAt: -1 }).lean();
      until = gift?.endsAt || null;
    } catch {}
    cache.set(key, { at: Date.now(), until });
  }
  return until && new Date(until) > new Date() ? new Date(until) : null;
}

/** For the places that start the free trial: why not now, while a gift runs. */
export function giftTrialMessage(until) {
  return `Premium is already on here, free until <t:${Math.floor(until.getTime() / 1000)}:F>, as a thank you for your patience after the outage. Start your own 7 day trial after that, so none of it is wasted.`;
}

export function clearGiftCache(guildId) {
  if (!guildId) { cache.clear(); return; }
  for (const key of cache.keys()) if (key.startsWith(guildId + ':')) cache.delete(key);
}
