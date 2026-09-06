import PremiumKey from '../models/PremiumKey.js';
import FeatureFlag from '../models/FeatureFlag.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_PREMIUM_FEATURES } from '../config/features.js';

const premiumCache = new Map();
const featureFlagCache = new Map();
const trialCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export const TOPGG_VOTE_URL = `https://top.gg/bot/${process.env.TOPGG_BOT_ID || '0'}/vote`;
export const TRIAL_DAYS = 7;
const VOTE_CREDIT_DAYS = 7;

export async function isPremiumGuild(guildId) {
  const cached = premiumCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const key = await PremiumKey.findOne({ guildId });
  let result = false;
  if (key) {
    if (key.plan === 'lifetime' || key.plan === 'manual') {
      result = true;
    } else {
      const activeStatuses = ['active', 'trialing', 'past_due', 'cancelling'];
      result = activeStatuses.includes(key.subscriptionStatus);
    }
  }
  premiumCache.set(guildId, { value: result, ts: Date.now() });
  return result;
}

export async function isGuildOnTrial(guildId) {
  const cached = trialCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  try {
    const { default: GuildTrial } = await import('../models/GuildTrial.js');
    const trial = await GuildTrial.findOne({ guildId, active: true });
    const result = trial ? trial.expiresAt > new Date() : false;
    trialCache.set(guildId, { value: result, ts: Date.now() });
    return result;
  } catch {
    return false;
  }
}

export function clearPremiumCache(guildId) {
  if (guildId) { premiumCache.delete(guildId); trialCache.delete(guildId); }
  else { premiumCache.clear(); trialCache.clear(); }
}

export async function isFeaturePremiumGated(featureKey) {
  const cached = featureFlagCache.get(featureKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const flag = await FeatureFlag.findOne({ feature: featureKey });
  const result = flag ? flag.premium : DEFAULT_PREMIUM_FEATURES.includes(featureKey);
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
  if (hasPremium) return { allowed: true };
  const onTrial = await isGuildOnTrial(guildId);
  if (onTrial) return { allowed: true, viaTrial: true };
  return { allowed: false, premiumRequired: true };
}

export const LIMITS = {
  free: {
    characters: 100,
    vehicles: 200,
    firearms: 100,
    bolos: 20,
    stickyMessages: 5,
    ticketTypes: 5,
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
  if (premium) return LIMITS.premium;
  const trial = await isGuildOnTrial(guildId);
  return trial ? LIMITS.premium : LIMITS.free;
}

export function buildPremiumEmbed(featureName) {
  return new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Premium Feature')
    .setDescription(
      `**${featureName}** is a Premium feature.\n\n` +
      `### Try it free for ${TRIAL_DAYS} days\n` +
      `Press the button below and it unlocks immediately — no card, no signup, ` +
      `nothing to install. Every Premium feature is included.\n\n` +
      `### Or buy Premium\n` +
      `[roleplaymanager.xyz/pricing](https://roleplaymanager.xyz/pricing)\n` +
      `-# Already have a key? Use \`/activatepremium\`. One free trial per server.`
    )
    .setFooter({ text: 'RPM' });
}

/**
 * The premium wall, as a full interaction payload with a Start Free Trial button.
 *
 * The wall used to be a dead end - a pricing link plus instructions to go vote on
 * Top.gg and come back. That asked someone to leave Discord at the exact moment
 * they had just discovered they wanted the feature. Two servers out of 115 had
 * ever bought Premium.
 */
export function premiumReply(featureName) {
  return {
    embeds: [buildPremiumEmbed(featureName)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('premium_start_trial')
          .setLabel(`Start free ${TRIAL_DAYS}-day trial`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setLabel('See pricing')
          .setStyle(ButtonStyle.Link)
          .setURL('https://roleplaymanager.xyz/pricing')
      ),
    ],
  };
}

export async function recordVote(userId) {
  const { default: VoteTrial } = await import('../models/VoteTrial.js');
  const creditExpiresAt = new Date(Date.now() + VOTE_CREDIT_DAYS * 24 * 60 * 60 * 1000);
  await VoteTrial.findOneAndUpdate(
    { userId },
    { votedAt: new Date(), creditExpiresAt, used: false, usedForGuildId: null, usedAt: null },
    { upsert: true, new: true }
  );
}

export async function activateTrialForGuild(guildId, activatedByUserId) {
  const { default: VoteTrial } = await import('../models/VoteTrial.js');
  const { default: GuildTrial } = await import('../models/GuildTrial.js');

  const existingTrial = await GuildTrial.findOne({ guildId });
  if (existingTrial) {
    return { success: false, reason: 'used' };
  }

  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await GuildTrial.create({ guildId, activatedAt: new Date(), expiresAt, activatedBy: activatedByUserId, active: true });
  await VoteTrial.updateOne(
    { userId: activatedByUserId, used: false },
    { used: true, usedForGuildId: guildId, usedAt: new Date() }
  ).catch(() => {});
  trialCache.delete(guildId);
  return { success: true, expiresAt };
}
