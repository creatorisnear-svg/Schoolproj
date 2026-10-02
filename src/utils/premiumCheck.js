import PremiumKey from '../models/PremiumKey.js';
import FeatureFlag from '../models/FeatureFlag.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_PREMIUM_FEATURES } from '../config/features.js';
import { recordFunnel } from './funnel.js';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';

/**
 * Tells the rest of the bot that a server's Premium, or its trial, may have
 * changed. index.js listens and re-checks what AI dispatch may do there,
 * which used to change only at the next deploy.
 */
export const premiumEvents = new EventEmitter();
premiumEvents.setMaxListeners(20);

const premiumCache = new Map();
const featureFlagCache = new Map();
const trialCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export const TOPGG_VOTE_URL = `https://top.gg/bot/${process.env.TOPGG_BOT_ID || '0'}/vote`;
export const TRIAL_DAYS = 7;
const VOTE_CREDIT_DAYS = 7;

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'cancelling'];

/**
 * Whether one Premium key is switched on right now. A month paid for by the
 * server's members (plan 'fund', utils/premiumFund.js) runs until its expiry.
 * The directory and the dev panel ask this too, so they cannot disagree.
 */
export function keyIsLive(key, now = new Date()) {
  if (!key) return false;
  if (key.plan === 'fund') return !!key.expiresAt && new Date(key.expiresAt) > now;
  return key.plan === 'lifetime' || key.plan === 'manual' || ACTIVE_STATUSES.includes(key.subscriptionStatus);
}

/** Premium the server pays for itself: a subscription, lifetime or manual key, not a members' month. */
export async function hasPaidPlan(guildId) {
  const keys = await PremiumKey.find({ guildId, plan: { $ne: 'fund' } }).lean();
  return keys.some((key) => keyIsLive(key));
}

export async function isPremiumGuild(guildId) {
  const cached = premiumCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  // Every key, not the first one found: a server can hold a lapsed key and a
  // live one (bought again, or bought inside Discord as well as on the site),
  // and findOne could return the lapsed one.
  const keys = await PremiumKey.find({ guildId }).lean();
  const result = keys.some((key) => keyIsLive(key));
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

/**
 * Premium or a running trial: what the bot actually unlocks. The dashboard,
 * the free caps and the games used to check paid Premium only, so a server
 * on its trial was told everything was unlocked and then found it was not.
 */
export async function hasPremiumAccess(guildId) {
  if (await isPremiumGuild(guildId)) return true;
  return isGuildOnTrial(guildId);
}

export function clearPremiumCache(guildId) {
  if (guildId) {
    for (const key of grandfatherCache.keys()) {
      if (key.startsWith(guildId + ':')) grandfatherCache.delete(key);
    }
  } else {
    grandfatherCache.clear();
  }
  if (guildId) { premiumCache.delete(guildId); trialCache.delete(guildId); trialUsedCache.delete(guildId); }
  else { premiumCache.clear(); trialCache.clear(); trialUsedCache.clear(); }
  // Every place that changes Premium clears this cache, so it is also the
  // one place to announce the change.
  if (guildId) premiumEvents.emit('changed', guildId);
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
// When the blacklist became Premium (commit f1d0ae6). Configs created before
// this belong to servers that were already relying on it.
const BLACKLIST_PREMIUM_SINCE = Date.parse('2026-09-06T08:20:13Z');

const GRANDFATHERED = {
  blacklist: async (guildId) => {
    try {
      const { default: BlacklistConfig } = await import('../models/BlacklistConfig.js');
      // Only servers that were running it before it became Premium. The
      // check used to be "enabled right now", so any server that switched it
      // on during a trial, or later, kept it free forever.
      return !!(await BlacklistConfig.exists({
        guildId,
        enabled: true,
        _id: { $lt: mongoose.Types.ObjectId.createFromTime(Math.floor(BLACKLIST_PREMIUM_SINCE / 1000)) },
      }));
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

  // RPM CyberCom includes the AI voice dispatcher, with or without Premium.
  if (featureKey === 'dispatch') {
    const { isCyberComActive } = await import('../cybercom/access.js');
    if (await isCyberComActive(guildId)) return { allowed: true, viaCyberCom: true };
  }

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

const SITE = 'https://roleplaymanager.xyz';

/** The pricing page, saying where the visit came from and for which server. */
export function pricingUrl(from, guildId) {
  return SITE + '/pricing?from=' + encodeURIComponent(from) + (guildId ? '&guild=' + guildId : '');
}

/** The chip-in page, where members put money toward this server's Premium. */
export function chipInUrl(from, guildId) {
  return SITE + '/pricing?chipin=1&from=' + encodeURIComponent(from) + (guildId ? '&guild=' + guildId : '');
}

/**
 * Has this server had its one free trial? Cached briefly, because it is
 * asked every time a wall is shown.
 */
const trialUsedCache = new Map();
export async function trialUsed(guildId) {
  if (!guildId) return false;
  const cached = trialUsedCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;
  const { default: GuildTrial } = await import('../models/GuildTrial.js');
  const value = !!(await GuildTrial.exists({ guildId }));
  trialUsedCache.set(guildId, { value, ts: Date.now() });
  return value;
}

/**
 * The buttons under a wall. Before the trial: start it here, or see pricing.
 * After it: buy Premium for this server, through the site's Stripe checkout.
 */
function wallRows({ trialUsed: used, guildId }) {
  const row = new ActionRowBuilder();
  if (!used) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('premium_start_trial')
        .setLabel(`Start the free ${TRIAL_DAYS} day trial`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel('See pricing')
        .setStyle(ButtonStyle.Link)
        .setURL(pricingUrl('wall', guildId))
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Get Premium for this server')
        .setStyle(ButtonStyle.Link)
        .setURL(pricingUrl('wall', guildId))
    );
    // Members see walls too, and most cannot pay $5 alone. Together they can.
    if (guildId) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Chip in with members')
          .setStyle(ButtonStyle.Link)
          .setURL(chipInUrl('wall', guildId))
      );
    }
  }
  return [row];
}

export function buildPremiumEmbed(featureName, opts = {}) {
  const url = pricingUrl('wall', opts.guildId);
  const body = opts.trialUsed
    ? `**${featureName}** is a Premium feature.\n\n` +
      `This server has already had its free trial, so the next step is Premium itself. ` +
      `It is $5 a month, cancel any time, and it switches on for this server the moment the payment goes through. ` +
      `Everything you set up during the trial is still saved.\n\n` +
      `[Get Premium for this server](${url})\n` +
      `-# Already have a key? Use \`/activatepremium\`.`
    : `**${featureName}** is a Premium feature.\n\n` +
      `### Try it free for ${TRIAL_DAYS} days\n` +
      `Press the button below and it unlocks immediately, no card, no signup, ` +
      `nothing to install. Every Premium feature is included.\n\n` +
      `### Or buy Premium\n` +
      `[roleplaymanager.xyz/pricing](${url})\n` +
      `-# Already have a key? Use \`/activatepremium\`. One free trial per server.`;
  return new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Premium Feature')
    .setDescription(body)
    .setFooter({ text: 'RPM' });
}

/**
 * The premium wall, as a full interaction payload.
 *
 * The wall used to be a dead end: a pricing link plus instructions to go vote
 * on Top.gg and come back. It now starts the trial in place, or once the trial
 * is spent, buys Premium for this server in one step. The __wall marker lets
 * the dispatch point (utils/funnelHook.js) rebuild it for the server it is in.
 */
export function premiumReply(featureName, opts = {}) {
  return {
    embeds: [buildPremiumEmbed(featureName, opts)],
    components: wallRows(opts),
    __wall: { type: 'feature', featureName },
  };
}

/**
 * What to send when somebody hits a free tier cap.
 *
 * Being stopped is the moment somebody is most willing to try Premium. Before
 * the trial it offers the free week; after it, Premium itself.
 *
 * @param {string} what   plural noun, as the person would say it: "ticket types"
 * @param {number} limit  the cap they just hit
 * @param {string} [gain] what Premium gives instead, defaults to unlimited
 */
export function limitReply(what, limit, gain, opts = {}) {
  const tail = opts.trialUsed
    ? 'This server has already had its free trial. Premium is $5 a month and switches on the moment you pay. Nothing you have set up changes.'
    : 'You can have Premium free for ' + TRIAL_DAYS + ' days. Nothing to pay, no card, and your settings stay exactly as they are when it ends.';
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('You have used all ' + limit + ' of your ' + what)
    .setDescription(
      'The free plan includes ' + limit + ' ' + what + ' and this server has them all.\n\n' +
      '**With Premium:** ' + (gain || 'unlimited ' + what) + '.\n\n' + tail
    )
    .setFooter({ text: 'RPM' });

  return {
    embeds: [embed],
    components: wallRows(opts),
    __wall: { type: 'limit', what, limit, gain: gain || null },
  };
}

/** Rebuild a marked wall for a given server. Used by the dispatch point. */
export function rebuildWall(marker, opts = {}) {
  if (marker && marker.type === 'limit') {
    const { __wall, ...payload } = limitReply(marker.what, marker.limit, marker.gain || undefined, opts);
    return payload;
  }
  const { __wall, ...payload } = premiumReply((marker && marker.featureName) || 'This', opts);
  return payload;
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
  // Clears every cache and tells index.js, which switches AI dispatch to full
  // mode now rather than at the next deploy.
  clearPremiumCache(guildId);
  recordFunnel({ kind: 'trial', guildId, userId: activatedByUserId });
  return { success: true, expiresAt };
}
