import PremiumKey from '../models/PremiumKey.js';
import FeatureFlag from '../models/FeatureFlag.js';

const premiumCache = new Map();
const featureFlagCache = new Map();
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

export async function isFeaturePremiumGated(featureKey) {
  const cached = featureFlagCache.get(featureKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const flag = await FeatureFlag.findOne({ feature: featureKey });
  const result = flag ? flag.premium : featureKey === 'dispatch';
  featureFlagCache.set(featureKey, { value: result, ts: Date.now() });
  return result;
}

export function clearFeatureFlagCache(featureKey) {
  if (featureKey) featureFlagCache.delete(featureKey);
  else featureFlagCache.clear();
}

export async function checkFeatureAccess(guildId, featureKey) {
  const premiumGated = await isFeaturePremiumGated(featureKey);
  if (!premiumGated) return { allowed: true };
  const hasPremium = await isPremiumGuild(guildId);
  return { allowed: hasPremium, premiumRequired: true };
}

export const LIMITS = {
  free: {
    characters: 100,
    vehicles: 200,
    firearms: 100,
    bolos: 20,
    stickyMessages: 5,
    ticketTypes: 3,
    roleIncomeRoles: 2,
    leaderboardSize: 10,
  },
  premium: {
    characters: Infinity,
    vehicles: Infinity,
    firearms: Infinity,
    bolos: Infinity,
    stickyMessages: Infinity,
    ticketTypes: Infinity,
    roleIncomeRoles: Infinity,
    leaderboardSize: 25,
  },
};

export async function getGuildLimits(guildId) {
  const premium = await isPremiumGuild(guildId);
  return premium ? LIMITS.premium : LIMITS.free;
}

export async function getPremiumUpsellEmbed(featureName) {
  const { EmbedBuilder } = await import('discord.js');
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Premium Required')
    .setDescription(
      `**${featureName}** is a Premium feature.\n\n` +
      `Upgrade your server to unlock:\n` +
      `> AI Voice Dispatch\n` +
      `> Advanced gambling (Blackjack & Roulette)\n` +
      `> Unlimited CAD characters, vehicles, firearms & BOLOs\n` +
      `> Unlimited sticky messages & ticket types\n` +
      `> Unlimited role income entries\n` +
      `> Extended leaderboard (top 25)\n\n` +
      `To get Premium, join our support server and use \`/activatepremium\` once you have a key.`
    )
    .addFields({ name: 'Get Premium', value: '[discord.gg/cSdhfGPeV2](https://discord.gg/cSdhfGPeV2)', inline: true })
    .setFooter({ text: 'RPM' });
}
