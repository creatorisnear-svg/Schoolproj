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
  if (guildId) {
    for (const key of grandfatherCache.keys()) {
      if (key.startsWith(guildId + ':')) grandfatherCache.delete(key);
    }
  } else {
    grandfatherCache.clear();
  }
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

/**
 * Features that became Premium after servers were already using them.
 *
 * Each entry says how to tell whether a given server was already relying on it
 * before the change. If it was, it keeps working forever and nobody there ever
 * learns anything changed.
 *
 * This is not generosity. The blacklist is what keeps banned members out at the
 * verification wall, and switching it off under a server mid use lets those
 * people back in. That is an incident, not a sale, and the reasonable response
 * to it is to remove the bot.
 */
const GRANDFATHERED = {
  blacklist: async (guildId) => {
    try {
      const { default: BlacklistConfig } = await import('../models/BlacklistConfig.js');
      return !!(await BlacklistConfig.exists({ guildId, enabled: true }));
    } catch {
      // If the check itself fails, err toward letting them keep it. A false
      // lock on a moderation feature is worse than a false unlock.
      return true;
    }
  },
};

/** Cached per guild+feature, because this sits in front of every gated action. */
const grandfatherCache = new Map();

async function isGrandfathered(guildId, featureKey) {
  const check = GRANDFATHERED[featureKey];
  if (!check) return false;

  const key = guildId + ':' + featureKey;
  const cached = grandfatherCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const value = await check(guildId);
  grandfatherCache.set(key, { value, ts: Date.now() });
  return value;
}

export async function checkFeatureAccess(guildId, featureKey) {
  const premiumGated = await isFeaturePremiumGated(featureKey);
  if (!premiumGated) return { allowed: true };
  const hasPremium = await isPremiumGuild(guildId);
  if (hasPremium) return { allowed: true };
  const onTrial = await isGuildOnTrial(guildId);
  if (onTrial) return { allowed: true, viaTrial: true };

  // Last, because it costs a query and the three above answer most calls.
  if (await isGrandfathered(guildId, featureKey)) {
    return { allowed: true, grandfathered: true };
  }

  return { allowed: false, premiumRequired: true };
}

export const LIMITS = {
  // Set so a small server never notices and a growing one does. A cap that
  // bites on day one reads as crippleware; one that bites when somebody has
  // invested real effort reads as a reason to upgrade.
  free: {
    characters: 100,
    vehicles: 200,
    firearms: 100,
    bolos: 20,
    stickyMessages: 5,
    ticketTypes: 5,
    roleIncomeRoles: 2,
    leaderboardSize: 10,
    roleRequestRoles: 5,
    shopItems: 100,
    civilianJobs: 5,
    appyTypes: 2,
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
    roleRequestRoles: Infinity,
    shopItems: Infinity,
    civilianJobs: Infinity,
    appyTypes: Infinity,
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
      `Press the button below and it unlocks immediately, no card, no signup, ` +
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
/**
 * What to send when somebody hits a free tier cap.
 *
 * Being stopped is the moment somebody is most willing to try Premium, and
 * every one of these used to end at a price list. Offering the free week here
 * costs nothing and asks for no decision they are not ready to make.
 *
 * @param {string} what   plural noun, as the person would say it: "ticket types"
 * @param {number} limit  the cap they just hit
 * @param {string} [gain] what Premium gives instead, defaults to unlimited
 */
export function limitReply(what, limit, gain) {
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('You have used all ' + limit + ' of your ' + what)
    .setDescription(
      'The free plan includes ' + limit + ' ' + what + ' and this server has them all.\n\n' +
      '**With Premium:** ' + (gain || 'unlimited ' + what) + '.\n\n' +
      'You can have Premium free for ' + TRIAL_DAYS + ' days. Nothing to pay, no card, and your settings stay exactly as they are when it ends.'
    )
    .setFooter({ text: 'RPM' });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('premium_start_trial')
          .setLabel('Start the free ' + TRIAL_DAYS + ' day trial')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setLabel('See pricing')
          .setStyle(ButtonStyle.Link)
          .setURL('https://roleplaymanager.xyz/pricing')
      ),
    ],
  };
}

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
