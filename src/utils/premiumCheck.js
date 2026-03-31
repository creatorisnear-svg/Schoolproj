import PremiumKey from '../models/PremiumKey.js';

const premiumCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function isPremiumGuild(guildId) {
  const cached = premiumCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const key = await PremiumKey.findOne({ guildId });
  const result = !!key;
  premiumCache.set(guildId, { value: result, ts: Date.now() });
  return result;
}

export function clearPremiumCache(guildId) {
  if (guildId) premiumCache.delete(guildId);
  else premiumCache.clear();
}

export const LIMITS = {
  free: {
    characters: 100,
    vehicles: 200,
    firearms: 100,
    bolos: 20,
  },
  premium: {
    characters: Infinity,
    vehicles: Infinity,
    firearms: Infinity,
    bolos: Infinity,
  },
};

export async function getGuildLimits(guildId) {
  const premium = await isPremiumGuild(guildId);
  return premium ? LIMITS.premium : LIMITS.free;
}
