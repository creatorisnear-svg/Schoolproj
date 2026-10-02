import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import DirectoryListing from '../../models/DirectoryListing.js';
import { bearerToken, identifyWithDiscord } from '../../utils/siteIdentity.js';
import { PROMOTIONS, MAX_FEATURED, featuredCount, nextFeaturedOpening, applyPromotion } from '../../utils/directory.js';
import { recordFunnel } from '../../utils/funnel.js';
import { attachKeyToGuild } from '../../utils/premiumKeys.js';
import { CHIP_AMOUNTS, FUND_GOAL_CENTS, applyContribution, fundStatus, dollars } from '../../utils/premiumFund.js';
import CyberComSubscription from '../../models/CyberComSubscription.js';
import { cyberComSubscribed, clearCyberComCache, CYBERCOM_PRICE_CENTS } from '../../cybercom/access.js';
import {
  premiumContacts, dmUsers,
  paymentFailedMessage, subscriptionEndedMessage, premiumActivatedMessage,
} from '../../utils/premiumNotify.js';

/**
 * Buying Premium.
 *
 * The road is: pricing page, Stripe Checkout, back here. What this file adds
 * on top of Stripe:
 *
 *   - If the buyer signed in on the site, the checkout knows who they are and
 *     which server they picked, and Premium switches on the moment the
 *     payment lands. Nobody has to find a key and paste it anywhere. Without
 *     a sign-in the old key flow still works.
 *   - The people who pay are told when a card fails, with the invoice to pay,
 *     and when the subscription ends. The bot's only subscriber was lost to
 *     a declined card over two silent weeks.
 *   - Each step is counted (see utils/funnel.js), because Stripe can only see
 *     the last two of them.
 *   - Prices are found before they are created. Six sets of identical
 *     products were created over two months by checkouts that did not.
 */

// ── Rate limiting (in-memory, per IP) ────────────────────────────────────────
// Max 10 checkout attempts per IP per hour - prevents abuse / carding attacks
const _rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;
// Pricing page views are counted through a looser gate of their own: a
// visitor reloading is not a carding attack.
const _trackLimitMap = new Map();
const TRACK_MAX = 60;
// quarterly is no longer offered on the pricing page but still honoured for
// links and keys that exist.
const VALID_PLANS = new Set(['monthly', 'quarterly', 'yearly', 'lifetime']);
const ID = /^\d{17,20}$/;

// Purge expired entries every 30 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateLimitMap) {
    if (now > entry.resetAt) _rateLimitMap.delete(ip);
  }
  for (const [ip, entry] of _trackLimitMap) {
    if (now > entry.resetAt) _trackLimitMap.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function limited(map, ip, max) {
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= max) return true;
  entry.count++;
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateKey() {
  const seg = () => uuidv4().replace(/-/g, '').toUpperCase().slice(0, 4);
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function isSubscriptionPlan(plan) {
  return plan === 'monthly' || plan === 'quarterly' || plan === 'yearly';
}

function getDomain(req) {
  const envDomain = process.env.DOMAIN;
  if (envDomain) {
    const clean = envDomain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    return `https://${clean}`;
  }
  return `${req.protocol}://${req.headers.host}`;
}

async function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const { default: Stripe } = await import('stripe');
  return new Stripe(key, { apiVersion: '2024-04-10' });
}

const clip = (v, n = 100) => (v === null || v === undefined ? null : String(v).slice(0, n));

// Who is signed in comes from utils/siteIdentity.js, shared with the server
// directory, which needs the same answer.

// ── Directory featured spots ─────────────────────────────────────────────────

const PROMO_NICK = (days) => 'RPM Directory Featured ' + days + ' days v1';
const _promoPrices = new Map();

/** The Stripe price for a featured spot: found by nickname, else created once. */
async function getOrCreatePromoPrice(stripe, spec) {
  if (_promoPrices.has(spec.days)) return _promoPrices.get(spec.days);
  let id = null;
  try {
    const list = await stripe.prices.list({ active: true, limit: 100 });
    const found = (list.data || []).find((p) => p.nickname === PROMO_NICK(spec.days)
      && p.unit_amount === spec.amount && p.currency === 'usd' && !p.recurring);
    if (found) id = found.id;
  } catch (err) {
    console.warn('[Stripe] could not list prices for promotions:', err.message);
  }
  if (!id) {
    const product = await stripe.products.create({
      name: 'RolePlayManager Directory: Featured for ' + spec.label,
      description: 'Your server featured at the top of the RolePlayManager console GTA RP server directory for ' + spec.label + '.',
    });
    const price = await stripe.prices.create({ product: product.id, unit_amount: spec.amount, currency: 'usd', nickname: PROMO_NICK(spec.days) });
    id = price.id;
    console.log('[Stripe] Auto-created directory promotion price for ' + spec.label + ': ' + id);
  }
  _promoPrices.set(spec.days, id);
  return id;
}

/**
 * Apply a paid featured spot from a completed Stripe session. Idempotent,
 * like the Premium key: the webhook and the success page may both call it.
 */
export async function applyPromotionFromSession(session, ctx = {}) {
  if (!session || session.status !== 'complete' || session.payment_status !== 'paid' || session.mode !== 'payment') return null;
  const m = session.metadata || {};
  const spec = PROMOTIONS[Number(m.days)];
  if (m.kind !== 'promotion' || !spec || !ID.test(m.guildId || '')) return null;

  const buyer = ID.test(m.discordId || '') ? m.discordId : null;
  const result = await applyPromotion({
    stripeSessionId: session.id,
    guildId: m.guildId,
    buyerId: buyer,
    days: spec.days,
    amount: session.amount_total || spec.amount,
  });
  const guildName = ctx.client?.guilds?.cache?.get(m.guildId)?.name || m.guildName || 'Your server';

  if (result.applied) {
    console.log('[Directory] ' + m.guildId + ' featured for ' + spec.days + ' days (session ' + session.id + ')');
    if (ctx.client && buyer) {
      const until = new Date(result.featuredUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const { EmbedBuilder } = await import('discord.js');
      dmUsers(ctx.client, [buyer], { embeds: [new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle('Your server is featured')
        .setDescription('**' + guildName + '** is featured at the top of the RolePlayManager server directory until ' + until + '.\n\nSee it at roleplaymanager.xyz/servers')
        .setFooter({ text: 'RPM' })] }).catch(() => {});
    }
  }
  return { ...result, guildId: m.guildId, guildName, days: spec.days };
}

// ── Chip in: members put money toward their server's Premium ────────────────

const FUND_NICK = (cents) => 'RPM Premium Chip In ' + cents + ' v1';
const _fundPrices = new Map();

/** The Stripe price for one chip-in amount: found by nickname, else created once. */
async function getOrCreateFundPrice(stripe, cents) {
  if (_fundPrices.has(cents)) return _fundPrices.get(cents);
  let id = null;
  try {
    const list = await stripe.prices.list({ active: true, limit: 100 });
    const found = (list.data || []).find((p) => p.nickname === FUND_NICK(cents)
      && p.unit_amount === cents && p.currency === 'usd' && !p.recurring);
    if (found) id = found.id;
  } catch (err) {
    console.warn('[Stripe] could not list prices for chip-ins:', err.message);
  }
  if (!id) {
    const product = await stripe.products.create({
      name: 'RolePlayManager Premium: chip in ' + dollars(cents),
      description: "Money toward a server's RolePlayManager Premium. Every $5 raised turns Premium on for a month.",
    });
    const price = await stripe.prices.create({ product: product.id, unit_amount: cents, currency: 'usd', nickname: FUND_NICK(cents) });
    id = price.id;
    console.log('[Stripe] Auto-created chip-in price for ' + dollars(cents) + ': ' + id);
  }
  _fundPrices.set(cents, id);
  return id;
}

/**
 * Count a completed chip-in (utils/premiumFund.js). Idempotent, like the
 * others: the webhook and the success page may both call it.
 */
export async function applyFundFromSession(session, ctx = {}) {
  if (!session || session.status !== 'complete' || session.payment_status !== 'paid' || session.mode !== 'payment') return null;
  const m = session.metadata || {};
  if (m.kind !== 'fund' || !ID.test(m.guildId || '')) return null;
  const amount = Number(session.amount_total) || 0;
  if (amount <= 0) return null;

  const client = ctx.client || null;
  const guild = client?.guilds?.cache?.get(m.guildId) || null;
  const guildName = guild?.name || m.guildName || 'your server';
  const buyer = ID.test(m.discordId || '') ? m.discordId : null;

  const result = await applyContribution({
    guildId: m.guildId, userId: buyer, amountCents: amount, stripeSessionId: session.id, guildName,
  });

  if (result.applied) {
    console.log('[Fund] ' + dollars(amount) + ' toward Premium for ' + m.guildId
      + (result.months ? ', ' + result.months + ' month(s) switched on' : '') + ' (session ' + session.id + ')');
    recordFunnel({ kind: 'paid', guildId: m.guildId, userId: buyer, plan: 'fund', source: clip(m.source, 40) });

    // The owner hears about every chip-in: it is money for their server.
    const owner = guild?.ownerId;
    if (client && owner && owner !== buyer) {
      const { EmbedBuilder } = await import('discord.js');
      const who = buyer ? '<@' + buyer + '>' : 'A member';
      const embed = new EmbedBuilder().setFooter({ text: 'RPM' });
      if (result.months) {
        embed.setColor(0x43b581)
          .setTitle('Your members switched Premium on')
          .setDescription(who + ' chipped in ' + dollars(amount) + ' and that made ' + dollars(FUND_GOAL_CENTS)
            + ': **' + guildName + '** has Premium until <t:' + Math.floor(new Date(result.until).getTime() / 1000) + ':f>, with every Premium feature unlocked.');
      } else {
        embed.setColor(0x2d2d2d)
          .setTitle('A member chipped in for Premium')
          .setDescription(who + ' put ' + dollars(amount) + ' toward Premium for **' + guildName + '**.\n\n**'
            + dollars(result.balanceCents) + ' of ' + dollars(FUND_GOAL_CENTS) + '** raised. At ' + dollars(FUND_GOAL_CENTS) + ', Premium turns on for a month.');
      }
      dmUsers(client, [owner], { embeds: [embed] }).catch(() => {});
    }
  }
  return { ...result, guildId: m.guildId, guildName, amount };
}

// ── RPM CyberCom: the voice add-on, $9.99 a month on top of Premium ─────────

const CYBERCOM_NICK = 'RPM CyberCom monthly v1';
let _cyberComPrice = null;

/** The monthly CyberCom price: found by nickname, else created once. */
async function getOrCreateCyberComPrice(stripe) {
  if (_cyberComPrice) return _cyberComPrice;
  let id = null;
  try {
    const list = await stripe.prices.list({ active: true, limit: 100, type: 'recurring' });
    const found = (list.data || []).find((p) => p.nickname === CYBERCOM_NICK && p.unit_amount === CYBERCOM_PRICE_CENTS
      && p.currency === 'usd' && p.recurring?.interval === 'month');
    if (found) id = found.id;
  } catch (err) {
    console.warn('[Stripe] could not list prices for CyberCom:', err.message);
  }
  if (!id) {
    const product = await stripe.products.create({
      name: 'RPM CyberCom',
      description: 'A RolePlayManager bot in every voice channel: traffic stops, 10-80s, civilian moves and voice transcripts for staff. Works on top of Premium.',
    });
    const price = await stripe.prices.create({
      product: product.id, unit_amount: CYBERCOM_PRICE_CENTS, currency: 'usd', recurring: { interval: 'month' }, nickname: CYBERCOM_NICK,
    });
    id = price.id;
    console.log('[Stripe] Auto-created the RPM CyberCom price: ' + id);
  }
  _cyberComPrice = id;
  return id;
}

/** Switch CyberCom on from a completed checkout. Idempotent: webhook and success page both call it. */
export async function applyCyberComFromSession(session, ctx = {}) {
  if (!session || session.status !== 'complete' || session.mode !== 'subscription' || !session.subscription) return null;
  const m = session.metadata || {};
  if (m.kind !== 'cybercom' || !ID.test(m.guildId || '')) return null;
  const buyer = ID.test(m.discordId || '') ? m.discordId : null;
  const before = await CyberComSubscription.findOne({ guildId: m.guildId }).lean();
  const fresh = !before || before.stripeSubscriptionId !== session.subscription || before.status === 'cancelled';
  await CyberComSubscription.findOneAndUpdate(
    { guildId: m.guildId },
    {
      $set: {
        status: 'active', stripeSubscriptionId: session.subscription, stripeCustomerId: session.customer || null,
        stripeSessionId: session.id, purchasedBy: buyer, updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  clearCyberComCache(m.guildId);
  const client = ctx.client || null;
  const guildName = client?.guilds?.cache?.get(m.guildId)?.name || m.guildName || 'your server';
  if (fresh) {
    console.log('[CyberCom] subscription started for ' + m.guildId + ' (session ' + session.id + ')');
    recordFunnel({ kind: 'paid', guildId: m.guildId, userId: buyer, plan: 'cybercom', source: clip(m.source, 40) });
    if (client && buyer) {
      const { EmbedBuilder } = await import('discord.js');
      dmUsers(client, [buyer], { embeds: [new EmbedBuilder().setColor(0x43b581).setTitle('RPM CyberCom is on')
        .setDescription('**' + guildName + '** has RPM CyberCom.\n\nNext, in your server: run `/setup` and open **RPM CyberCom**. Add the helper bots there, then pick your civilian, traffic stop and police radio channels.')
        .setFooter({ text: 'RPM' })] }).catch(() => {});
    }
  }
  return { guildId: m.guildId, guildName, fresh };
}

/** Subscription changes for CyberCom, which has no Premium key. */
async function cyberComSubscriptionEvent(event, ctx = {}) {
  const obj = event.data?.object || {};
  const subId = event.type.startsWith('customer.subscription.')
    ? obj.id
    : (obj.subscription || obj.parent?.subscription_details?.subscription || null);
  if (!subId) return;
  const sub = await CyberComSubscription.findOne({ stripeSubscriptionId: subId });
  if (!sub) return;
  if (event.type === 'customer.subscription.deleted') {
    sub.status = 'cancelled';
  } else if (event.type === 'customer.subscription.updated') {
    sub.status = obj.cancel_at_period_end ? 'cancelling' : obj.status === 'active' ? 'active' : obj.status;
    if (obj.current_period_end) sub.currentPeriodEnd = new Date(obj.current_period_end * 1000);
  } else if (event.type === 'invoice.payment_failed') {
    sub.status = 'past_due';
    if (ctx.client && sub.purchasedBy) {
      const { EmbedBuilder } = await import('discord.js');
      dmUsers(ctx.client, [sub.purchasedBy], { embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('Your RPM CyberCom payment did not go through')
        .setDescription('The card on file was declined. RPM CyberCom keeps working while Stripe tries again.' + (obj.hosted_invoice_url ? '\n\n[Pay the invoice](' + obj.hosted_invoice_url + ')' : ''))
        .setFooter({ text: 'RPM' })] }).catch(() => {});
    }
  }
  sub.updatedAt = new Date();
  await sub.save();
  clearCyberComCache(sub.guildId);
  console.log('[CyberCom] subscription ' + subId + ' is now ' + sub.status);
}

// ── The half price first month after a trial ────────────────────────────────

const WINBACK_COUPON = 'rpm_winback_half_first_month';
let _winbackCoupon = null;

/** The coupon for it: found by its fixed ID, else created once. */
async function getOrCreateWinbackCoupon(stripe) {
  if (_winbackCoupon) return _winbackCoupon;
  try {
    const found = await stripe.coupons.retrieve(WINBACK_COUPON);
    if (found?.id) { _winbackCoupon = found.id; return found.id; }
  } catch (err) {
    if (err?.code !== 'resource_missing' && err?.statusCode !== 404) throw err;
  }
  const coupon = await stripe.coupons.create({ id: WINBACK_COUPON, percent_off: 50, duration: 'once', name: 'Half price first month' });
  console.log('[Stripe] Created the win-back coupon ' + coupon.id);
  _winbackCoupon = coupon.id;
  return coupon.id;
}

/** A server's offer while it lasts: 48 hours after its trial ended unpaid (index.js). */
async function liveWinback(guildId) {
  if (!ID.test(String(guildId || ''))) return null;
  const { default: GuildTrial } = await import('../../models/GuildTrial.js');
  return GuildTrial.findOne({ guildId: String(guildId), winbackUntil: { $gt: new Date() }, winbackUsedAt: null }).lean();
}

// ── Prices ───────────────────────────────────────────────────────────────────

const PRICE_SPECS = {
  monthly: {
    field: 'monthlyPriceIdV3',
    nickname: 'RPM Premium Monthly v3',
    amount: 500,
    recurring: { interval: 'month', interval_count: 1 },
    product: {
      name: 'RolePlayManager Premium - Monthly',
      description: 'Monthly premium subscription. $5/month. Includes AI Voice Dispatch and all premium features. All sales final.',
    },
  },
  quarterly: {
    field: 'quarterlyPriceIdV3',
    nickname: 'RPM Premium 3-Month v3',
    amount: 1400,
    recurring: { interval: 'month', interval_count: 3 },
    product: {
      name: 'RolePlayManager Premium - 3 Month',
      description: '3-month premium subscription billed every 3 months. $14 per period. Includes AI Voice Dispatch and all premium features. All sales final.',
    },
  },
  // A third off monthly. Yearly plans also lose far fewer subscribers to a
  // card that fails at renewal, which is how the only subscriber was lost.
  yearly: {
    field: 'yearlyPriceIdV1',
    nickname: 'RPM Premium Yearly v1',
    amount: 3999,
    recurring: { interval: 'year', interval_count: 1 },
    product: {
      name: 'RolePlayManager Premium - Yearly',
      description: 'Yearly premium subscription. $39.99 a year. Includes AI Voice Dispatch and all premium features.',
    },
  },
  // Twice the yearly price. At $48.99 lifetime cost less than a year of monthly.
  lifetime: {
    field: 'lifetimePriceIdV4',
    nickname: 'RPM Premium Lifetime v4',
    amount: 7999,
    recurring: null,
    product: {
      name: 'RolePlayManager Premium - Lifetime',
      description: 'One-time lifetime premium purchase. $79.99. Includes AI Voice Dispatch and all current premium features.',
    },
  },
};

/** Does this Stripe price match the spec exactly (nickname, amount, cadence)? */
function priceMatches(price, spec) {
  if (!price || !price.active || price.nickname !== spec.nickname) return false;
  if (price.currency !== 'usd' || price.unit_amount !== spec.amount) return false;
  if (!spec.recurring) return !price.recurring;
  return !!price.recurring
    && price.recurring.interval === spec.recurring.interval
    && (price.recurring.interval_count || 1) === spec.recurring.interval_count;
}

/**
 * The three price ids, from the cache, else from what Stripe already has,
 * else created. Exported for the test suite.
 */
export async function getOrCreatePrices(stripe) {
  const ids = { monthly: null, quarterly: null, yearly: null, lifetime: null };
  let StripeConfig = null;

  try {
    ({ default: StripeConfig } = await import('../../models/StripeConfig.js'));
    const cfg = await StripeConfig.findOne({ key: 'global' }).maxTimeMS(5000);
    for (const [plan, spec] of Object.entries(PRICE_SPECS)) ids[plan] = cfg?.[spec.field] || null;
    if (ids.monthly && ids.quarterly && ids.yearly && ids.lifetime) {
      return { monthlyPriceId: ids.monthly, quarterlyPriceId: ids.quarterly, yearlyPriceId: ids.yearly, lifetimePriceId: ids.lifetime };
    }
    console.warn('[Stripe] price cache incomplete:', JSON.stringify(ids));
  } catch (dbErr) {
    console.warn('[Stripe] DB lookup failed, proceeding without cache:', dbErr.message);
  }

  // Before creating anything, look at what is already there. Stripe lists
  // newest first, so the first match is the one most recently made.
  const missing = Object.keys(ids).filter((plan) => !ids[plan]);
  if (missing.length) {
    try {
      const existing = await stripe.prices.list({ active: true, limit: 100 });
      for (const plan of missing) {
        const found = (existing.data || []).find((p) => priceMatches(p, PRICE_SPECS[plan]));
        if (found) {
          ids[plan] = found.id;
          console.log(`[Stripe] reusing existing ${plan} price ${found.id}`);
        }
      }
    } catch (err) {
      console.warn('[Stripe] could not list prices, will create:', err.message);
    }
  }

  for (const plan of Object.keys(ids)) {
    if (ids[plan]) continue;
    const spec = PRICE_SPECS[plan];
    const product = await stripe.products.create(spec.product);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: spec.amount,
      currency: 'usd',
      nickname: spec.nickname,
      ...(spec.recurring ? { recurring: spec.recurring } : {}),
    });
    ids[plan] = price.id;
    console.log(`[Stripe] Auto-created ${plan} price v3: ${price.id}`);
  }

  // Cache the v3 IDs for future calls - non-fatal if this fails
  try {
    if (StripeConfig) {
      await StripeConfig.findOneAndUpdate(
        { key: 'global' },
        { monthlyPriceIdV3: ids.monthly, quarterlyPriceIdV3: ids.quarterly, yearlyPriceIdV1: ids.yearly, lifetimePriceIdV4: ids.lifetime },
        { upsert: true, new: true }
      );
    }
  } catch (dbErr) {
    console.warn('[Stripe] DB save failed (prices still usable this request):', dbErr.message);
  }

  return { monthlyPriceId: ids.monthly, quarterlyPriceId: ids.quarterly, yearlyPriceId: ids.yearly, lifetimePriceId: ids.lifetime };
}

// ── Keys ─────────────────────────────────────────────────────────────────────

/**
 * Switch Premium on for the server chosen at checkout, if one was.
 *
 * Runs from both the webhook and the success page, whichever lands first,
 * so it has to be safe to run twice: the second run finds the key already on
 * the server and does nothing more, and in particular sends no second DM.
 */
async function autoActivate(keyDoc, session, ctx) {
  const guildId = session.metadata?.guildId;
  if (!guildId || !ID.test(guildId)) return null;

  const client = ctx.client || null;
  const guild = client?.guilds?.cache?.get(guildId) || null;
  const guildName = guild?.name || session.metadata?.guildName || null;

  if (keyDoc.guildId === guildId) {
    return { guildId, guildName: keyDoc.guildName || guildName, already: true };
  }

  const buyer = ID.test(session.metadata?.discordId || '') ? session.metadata.discordId : null;
  const result = await attachKeyToGuild({ keyDoc, guildId, guildName, userId: buyer, via: 'checkout' });
  if (!result.ok) {
    console.log(`[Stripe] key for session ${session.id} not applied to ${guildId}: ${result.reason}`);
    return null;
  }

  console.log(`[Stripe] Premium switched on for guild ${guildId} from session ${session.id}`);
  if (client && buyer) {
    dmUsers(client, [buyer], premiumActivatedMessage({ guildName, plan: keyDoc.plan })).catch(() => {});
  }
  // A gift: tell the owner who bought it, so it is not a mystery.
  if (client && session.metadata?.gift === 'true') {
    const owner = client.guilds?.cache?.get(guildId)?.ownerId;
    if (owner && owner !== buyer) {
      const { EmbedBuilder } = await import('discord.js');
      dmUsers(client, [owner], { embeds: [new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle('Premium was gifted to your server')
        .setDescription('<@' + buyer + '> bought Premium for **' + (guildName || 'your server') + '**. It is on now, with every Premium feature unlocked.\n\nRun `/premium` in the server to see what it includes.')
        .setFooter({ text: 'RPM' })] }).catch(() => {});
    }
  }
  return { guildId, guildName, already: false };
}

/**
 * Issue a premium key for a completed Stripe session. Idempotent: the webhook
 * and the success page both call this and only one key is ever made.
 * Returns { key, plan, activated } or null when the session does not qualify.
 */
export async function issueKeyForCompletedSession(session, ctx = {}) {
  if (!session || session.status !== 'complete' || session.payment_status !== 'paid') return null;

  const plan = session.metadata?.plan;
  if (!VALID_PLANS.has(plan) || session.metadata?.tosAccepted !== 'true') return null;

  const isSubscription = isSubscriptionPlan(plan);
  if ((isSubscription && (session.mode !== 'subscription' || !session.subscription)) ||
      (!isSubscription && (session.mode !== 'payment' || !session.payment_intent))) {
    return null;
  }

  const { default: PremiumKey } = await import('../../models/PremiumKey.js');
  const keyValue = generateKey();
  const keyFields = {
    key: keyValue,
    plan,
    purchasedBy: ID.test(session.metadata?.discordId || '') ? session.metadata.discordId : null,
    purchasedGuildId: ID.test(session.metadata?.guildId || '') ? session.metadata.guildId : null,
    tosAcceptedAt: new Date(),
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
    stripePaymentIntentId: session.payment_intent || null,
    subscriptionStatus: isSubscription ? 'active' : null,
  };

  let keyDoc;
  try {
    keyDoc = await PremiumKey.findOneAndUpdate(
      { stripeSessionId: session.id },
      { $setOnInsert: keyFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // A webhook and the success-page request can arrive at the same time.
    if (err?.code !== 11000) throw err;
    keyDoc = await PremiumKey.findOne({ stripeSessionId: session.id });
    if (!keyDoc) return null;
  }

  // Ours only if the upsert inserted; otherwise the other caller got here first.
  if (keyDoc.key === keyValue) {
    console.log(`[Stripe] Premium key ready for session ${session.id} (plan: ${plan})`);
    recordFunnel({
      kind: 'paid',
      guildId: keyFields.purchasedGuildId,
      userId: keyFields.purchasedBy,
      plan,
      source: clip(session.metadata?.source, 40),
    });
    // The half price month after a trial is used once.
    if (session.metadata?.offer === 'winback' && keyFields.purchasedGuildId) {
      const { default: GuildTrial } = await import('../../models/GuildTrial.js');
      await GuildTrial.updateOne({ guildId: keyFields.purchasedGuildId }, { $set: { winbackUsedAt: new Date() } }).catch(() => {});
    }
  }

  const activated = await autoActivate(keyDoc, session, ctx);
  return { key: keyDoc.key, plan, activated };
}

async function issueKeyForSession(sessionId, ctx) {
  const stripe = await getStripeClient();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return issueKeyForCompletedSession(session, ctx);
}

// ── Webhook events ───────────────────────────────────────────────────────────

const DM_GAP_MS = 20 * 60 * 60 * 1000;

/** Exported for the test suite; the route below is only the signature check. */
export async function handleWebhookEvent(event, ctx = {}) {
  const { default: PremiumKey } = await import('../../models/PremiumKey.js');
  const { clearPremiumCache } = await import('../../utils/premiumCheck.js');
  const client = ctx.client || null;
  const guildNameFor = (keyDoc) =>
    client?.guilds?.cache?.get(keyDoc.guildId)?.name || keyDoc.guildName || null;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session?.metadata?.kind === 'promotion') {
      await applyPromotionFromSession(session, ctx);
      return;
    }
    if (session?.metadata?.kind === 'fund') {
      await applyFundFromSession(session, ctx);
      return;
    }
    if (session?.metadata?.kind === 'cybercom') {
      await applyCyberComFromSession(session, ctx);
      return;
    }
    await issueKeyForCompletedSession(session, ctx);
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    if (!sub?.id) return;
    const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
    if (!keyDoc) return cyberComSubscriptionEvent(event, ctx);

    keyDoc.subscriptionStatus = 'cancelled';
    const tellThem = client && !keyDoc.endedDmAt;
    if (tellThem) keyDoc.endedDmAt = new Date();
    await keyDoc.save();
    if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
    console.log(`[Stripe Webhook] Subscription ${sub.id} cancelled - premium revoked for guild ${keyDoc.guildId}`);

    if (tellThem) {
      await dmUsers(client, premiumContacts(client, keyDoc), subscriptionEndedMessage({
        guildName: guildNameFor(keyDoc),
        guildId: keyDoc.guildId,
        reason: sub.cancellation_details?.reason || null,
      }));
    }
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    if (!sub?.id) return;
    const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
    if (!keyDoc) return cyberComSubscriptionEvent(event, ctx);

    if (sub.cancel_at_period_end) {
      keyDoc.subscriptionStatus = 'cancelling';
    } else if (sub.status === 'active') {
      keyDoc.subscriptionStatus = 'active';
    } else {
      keyDoc.subscriptionStatus = sub.status;
    }
    if (sub.current_period_end) {
      keyDoc.subscriptionCurrentPeriodEnd = new Date(sub.current_period_end * 1000);
    }
    await keyDoc.save();
    if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
    console.log(`[Stripe Webhook] Subscription ${sub.id} updated - status: ${keyDoc.subscriptionStatus}`);
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const subId = invoice?.subscription
      || invoice?.parent?.subscription_details?.subscription
      || null;
    if (!subId) return;
    const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: subId });
    if (!keyDoc) return cyberComSubscriptionEvent(event, ctx);

    keyDoc.subscriptionStatus = 'past_due';

    // Once a day at most: Stripe retries several times and each retry raises
    // this event again.
    const last = keyDoc.lastPaymentFailedDmAt ? new Date(keyDoc.lastPaymentFailedDmAt).getTime() : 0;
    const tellThem = client && Date.now() - last > DM_GAP_MS;
    if (tellThem) keyDoc.lastPaymentFailedDmAt = new Date();
    await keyDoc.save();
    if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
    console.log(`[Stripe Webhook] Payment failed for subscription ${subId} - guild ${keyDoc.guildId} marked past_due`);

    if (tellThem) {
      await dmUsers(client, premiumContacts(client, keyDoc), paymentFailedMessage({
        guildName: guildNameFor(keyDoc),
        amount: invoice.amount_due || 0,
        currency: invoice.currency || 'usd',
        invoiceUrl: invoice.hosted_invoice_url || null,
        nextAttemptAt: invoice.next_payment_attempt ? invoice.next_payment_attempt * 1000 : null,
        final: !invoice.next_payment_attempt,
      }));
    }
  }
}

// ── Router factory ────────────────────────────────────────────────────────────

/**
 * @param client  the Discord client, for switching Premium on and sending DMs
 * @param deps    test seams: identify(token) resolves a site token to a user
 */
export function createCheckoutRouter(client, deps = {}) {
  const router = Router();
  const identify = deps.identify || identifyWithDiscord;
  const ctx = { client };

  // POST /checkout/create - start a Stripe checkout session
  router.post('/create', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_rateLimitMap, ip, RATE_MAX)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }

    try {
      const { plan, tosAccepted, guildId, source, offer } = req.body || {};

      if (!tosAccepted) {
        return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      }
      if (!plan || !VALID_PLANS.has(plan)) {
        return res.status(400).json({ error: 'Invalid plan.' });
      }

      // Signed in on the site? Then the checkout can know who and for which
      // server, and Premium switches on by itself after payment.
      let identity = null;
      const token = bearerToken(req);
      if (token) {
        try { identity = await identify(token); } catch { identity = null; }
      }

      let guildName = null;
      let gift = false;
      if (guildId !== undefined && guildId !== null && guildId !== '') {
        if (!ID.test(String(guildId))) return res.status(400).json({ error: 'Invalid server.' });
        if (!identity) {
          return res.status(401).json({ error: 'Your sign-in has expired. Sign in again, or continue without choosing a server.' });
        }
        // Any member may buy Premium for a server they are in: a gift when
        // they are not an administrator there. Owners without a working card
        // were the one subscriber this bot has lost.
        const g = identity.guilds.find((x) => x.id === String(guildId));
        if (!g) return res.status(403).json({ error: 'You need to be a member of that server to buy Premium for it.' });
        if (client && client.guilds?.cache && !client.guilds.cache.has(String(guildId))) {
          return res.status(400).json({ error: 'The bot is not in that server yet. Invite it first, then come back.' });
        }
        const { isPremiumGuild } = await import('../../utils/premiumCheck.js');
        if (await isPremiumGuild(String(guildId))) {
          return res.status(409).json({ error: 'That server already has Premium, so there is nothing to buy.' });
        }
        guildName = client?.guilds?.cache?.get(String(guildId))?.name || g.name || null;
        gift = !g.admin;
      }

      // The half price first month after a trial: monthly, for that server,
      // within its 48 hours, once.
      let winback = false;
      if (offer === 'winback') {
        if (plan !== 'monthly' || !guildId || !identity || !(await liveWinback(guildId))) {
          return res.status(410).json({ error: 'The half price offer has ended for this server, or is only for the monthly plan. Premium is $5 a month.' });
        }
        winback = true;
      }

      const stripe = await getStripeClient();
      if (!stripe) {
        return res.status(503).json({
          error: 'Payment processing is not configured yet. Join our Discord for help.',
        });
      }

      const domain = getDomain(req);
      const metadata = { plan, tosAccepted: 'true' };
      if (identity) metadata.discordId = identity.id;
      if (guildId && identity) {
        metadata.guildId = String(guildId);
        if (guildName) metadata.guildName = clip(guildName, 100);
        if (gift) metadata.gift = 'true';
      }
      if (source) metadata.source = clip(source, 40);
      if (winback) metadata.offer = 'winback';

      const commonParams = {
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
        metadata,
        // Stripe takes a coupon or promotion codes, not both.
        ...(winback ? { discounts: [{ coupon: await getOrCreateWinbackCoupon(stripe) }] } : { allow_promotion_codes: true }),
      };

      const { monthlyPriceId, quarterlyPriceId, yearlyPriceId, lifetimePriceId } = await getOrCreatePrices(stripe);

      let session;
      if (isSubscriptionPlan(plan)) {
        const priceId = { monthly: monthlyPriceId, quarterly: quarterlyPriceId, yearly: yearlyPriceId }[plan];
        session = await stripe.checkout.sessions.create({
          ...commonParams,
          mode: 'subscription',
          line_items: [{ price: priceId, quantity: 1 }],
          subscription_data: { metadata },
        });
      } else {
        session = await stripe.checkout.sessions.create({
          ...commonParams,
          mode: 'payment',
          customer_creation: 'always',
          line_items: [{ price: lifetimePriceId, quantity: 1 }],
          payment_intent_data: { metadata },
        });
      }

      recordFunnel({
        kind: 'checkout',
        guildId: metadata.guildId || null,
        userId: metadata.discordId || null,
        plan,
        source: metadata.source || null,
      });

      res.json({ url: session.url });

    } catch (err) {
      const detail = err?.raw?.message || err?.message || String(err);
      console.error('[Checkout] Create error:', detail);
      const stripeMsg = err?.raw?.message;
      res.status(500).json({
        error: stripeMsg
          ? `Stripe error: ${stripeMsg}`
          : 'Failed to create checkout session. Please try again.',
      });
    }
  });

  // POST /checkout/promote - buy a featured spot in the server directory
  router.post('/promote', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_rateLimitMap, ip, RATE_MAX)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }
    try {
      const { guildId, days, tosAccepted } = req.body || {};
      if (!tosAccepted) return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      const spec = PROMOTIONS[Number(days)];
      if (!spec) return res.status(400).json({ error: 'Pick 7 or 30 days.' });
      const gid = String(guildId || '');
      if (!ID.test(gid)) return res.status(400).json({ error: 'Invalid server.' });

      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: 'Sign in with Discord first.' });
      let identity;
      try { identity = await identify(token); } catch { return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' }); }
      // Owners and members alike may feature a server they are in.
      if (!identity.guilds.some((g) => g.id === gid)) {
        return res.status(403).json({ error: 'You need to be a member of that server to feature it.' });
      }

      const listing = await DirectoryListing.findOne({ guildId: gid, listed: true, hidden: { $ne: true } }).lean();
      if (!listing || (client && client.guilds?.cache && !client.guilds.cache.has(gid))) {
        return res.status(400).json({ error: 'That server is not listed in the directory yet. Its owner can list it for free from the dashboard.' });
      }
      // Scarcity is the point of a featured spot. A server already featured
      // may always extend.
      const featuredNow = listing.featuredUntil && new Date(listing.featuredUntil) > new Date();
      if (!featuredNow && (await featuredCount(gid)) >= MAX_FEATURED) {
        const next = await nextFeaturedOpening();
        return res.status(409).json({
          error: 'All ' + MAX_FEATURED + ' featured spots are taken right now. The next one opens '
            + (next ? 'on ' + new Date(next).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'soon') + '.',
        });
      }

      const stripe = await getStripeClient();
      if (!stripe) return res.status(503).json({ error: 'Payment processing is not configured yet. Join our Discord for help.' });

      const priceId = await getOrCreatePromoPrice(stripe, spec);
      const guildName = client?.guilds?.cache?.get(gid)?.name || '';
      const metadata = {
        kind: 'promotion', guildId: gid, guildName: clip(guildName, 100),
        days: String(spec.days), discordId: identity.id, tosAccepted: 'true',
      };
      const domain = getDomain(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_creation: 'always',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        payment_intent_data: { metadata },
        allow_promotion_codes: true,
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: 'https://roleplaymanager.xyz/servers/?promote=cancelled',
      });
      res.json({ url: session.url });
    } catch (err) {
      const detail = err?.raw?.message || err?.message || String(err);
      console.error('[Checkout] Promote error:', detail);
      res.status(500).json({ error: err?.raw?.message ? 'Stripe error: ' + err.raw.message : 'Could not start the payment. Please try again.' });
    }
  });

  // GET /checkout/offer?guild=... - is the half price first month on for this server?
  router.get('/offer', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_trackLimitMap, ip, TRACK_MAX)) return res.status(429).json({ error: 'Too many requests.' });
    try {
      const offer = await liveWinback(req.query.guild);
      res.json({ active: !!offer, until: offer?.winbackUntil || null });
    } catch {
      res.json({ active: false, until: null });
    }
  });

  // GET /checkout/fund/:guildId - what a server's members have raised
  router.get('/fund/:guildId', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_trackLimitMap, ip, TRACK_MAX)) return res.status(429).json({ error: 'Too many requests.' });
    const gid = String(req.params.guildId || '');
    if (!ID.test(gid)) return res.status(400).json({ error: 'Invalid server.' });
    try {
      const { hasPaidPlan } = await import('../../utils/premiumCheck.js');
      const [status, paid] = await Promise.all([fundStatus(gid), hasPaidPlan(gid)]);
      res.json({ ...status, paidPremium: paid, amounts: CHIP_AMOUNTS });
    } catch (err) {
      console.error('[Checkout] Fund status error:', err.message);
      res.status(500).json({ error: 'Could not load the fund.' });
    }
  });

  // POST /checkout/chipin - put money toward a server's Premium
  router.post('/chipin', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_rateLimitMap, ip, RATE_MAX)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }
    try {
      const { guildId, amount, tosAccepted, source } = req.body || {};
      if (!tosAccepted) return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      const cents = Number(amount);
      if (!CHIP_AMOUNTS.includes(cents)) return res.status(400).json({ error: 'Pick $2, $3 or $5.' });
      const gid = String(guildId || '');
      if (!ID.test(gid)) return res.status(400).json({ error: 'Pick a server.' });

      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: 'Sign in with Discord first.' });
      let identity;
      try { identity = await identify(token); } catch { return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' }); }
      if (!identity.guilds.some((g) => g.id === gid)) {
        return res.status(403).json({ error: 'You need to be a member of that server to chip in for it.' });
      }
      if (client && client.guilds?.cache && !client.guilds.cache.has(gid)) {
        return res.status(400).json({ error: 'The bot is not in that server yet.' });
      }
      const { hasPaidPlan } = await import('../../utils/premiumCheck.js');
      if (await hasPaidPlan(gid)) {
        return res.status(409).json({ error: 'That server already pays for Premium, so there is nothing to chip in for.' });
      }

      const stripe = await getStripeClient();
      if (!stripe) return res.status(503).json({ error: 'Payment processing is not configured yet. Join our Discord for help.' });

      const priceId = await getOrCreateFundPrice(stripe, cents);
      const guildName = client?.guilds?.cache?.get(gid)?.name || '';
      const metadata = {
        kind: 'fund', guildId: gid, guildName: clip(guildName, 100),
        amount: String(cents), discordId: identity.id, tosAccepted: 'true',
      };
      if (source) metadata.source = clip(source, 40);
      const domain = getDomain(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
      });
      recordFunnel({ kind: 'checkout', guildId: gid, userId: identity.id, plan: 'fund', source: metadata.source || null });
      res.json({ url: session.url });
    } catch (err) {
      const detail = err?.raw?.message || err?.message || String(err);
      console.error('[Checkout] Chip in error:', detail);
      res.status(500).json({ error: err?.raw?.message ? 'Stripe error: ' + err.raw.message : 'Could not start the payment. Please try again.' });
    }
  });

  // POST /checkout/cybercom - RPM CyberCom for a server, on top of Premium
  router.post('/cybercom', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_rateLimitMap, ip, RATE_MAX)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }
    try {
      const { guildId, tosAccepted, source } = req.body || {};
      if (!tosAccepted) return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      const gid = String(guildId || '');
      if (!ID.test(gid)) return res.status(400).json({ error: 'Pick a server.' });

      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: 'Sign in with Discord first.' });
      let identity;
      try { identity = await identify(token); } catch { return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' }); }
      const g = identity.guilds.find((x) => x.id === gid);
      if (!g || !g.admin) return res.status(403).json({ error: "Only the server's owner or admins can add RPM CyberCom." });
      if (client && client.guilds?.cache && !client.guilds.cache.has(gid)) {
        return res.status(400).json({ error: 'The bot is not in that server yet. Invite it first, then come back.' });
      }
      const { isPremiumGuild } = await import('../../utils/premiumCheck.js');
      if (!(await isPremiumGuild(gid))) {
        return res.status(409).json({ error: 'RPM CyberCom works on top of Premium. Turn Premium on for this server first.' });
      }
      if (await cyberComSubscribed(gid)) return res.status(409).json({ error: 'That server already has RPM CyberCom.' });

      const stripe = await getStripeClient();
      if (!stripe) return res.status(503).json({ error: 'Payment processing is not configured yet. Join our Discord for help.' });

      const priceId = await getOrCreateCyberComPrice(stripe);
      const guildName = client?.guilds?.cache?.get(gid)?.name || g.name || '';
      const metadata = { kind: 'cybercom', guildId: gid, guildName: clip(guildName, 100), discordId: identity.id, tosAccepted: 'true' };
      if (source) metadata.source = clip(source, 40);
      const domain = getDomain(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
      });
      recordFunnel({ kind: 'checkout', guildId: gid, userId: identity.id, plan: 'cybercom', source: metadata.source || null });
      res.json({ url: session.url });
    } catch (err) {
      const detail = err?.raw?.message || err?.message || String(err);
      console.error('[Checkout] CyberCom error:', detail);
      res.status(500).json({ error: err?.raw?.message ? 'Stripe error: ' + err.raw.message : 'Could not start the payment. Please try again.' });
    }
  });

  // POST /checkout/track - the pricing page was opened, and from where
  router.post('/track', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(_trackLimitMap, ip, TRACK_MAX)) return res.status(204).end();

    const { source, guildId, feature } = req.body || {};
    recordFunnel({
      kind: 'pricing',
      guildId: ID.test(String(guildId || '')) ? String(guildId) : null,
      feature: clip(feature, 60),
      source: clip(source, 40) || 'direct',
    });
    res.status(204).end();
  });

  // GET /checkout/success?session_id=... - verify session, issue key, render page
  router.get('/success', async (req, res) => {
    const { session_id } = req.query;
    let result = null;
    let errorMsg = null;

    if (!session_id || typeof session_id !== 'string' || !/^cs_/.test(session_id)) {
      errorMsg = 'Invalid or missing session. Please contact support via Discord.';
    } else {
      try {
        const stripe = await getStripeClient();
        const session = stripe ? await stripe.checkout.sessions.retrieve(session_id) : null;
        if (session?.metadata?.kind === 'promotion') {
          const promo = await applyPromotionFromSession(session, ctx);
          return res.send(renderPage({
            headline: promo ? 'Your server is featured' : 'Payment received',
            lead: promo
              ? '<strong>' + escapeHtml(promo.guildName) + '</strong> is featured at the top of the server directory until '
                + escapeHtml(new Date(promo.featuredUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
                + '. Buying again while featured adds the time on.'
              : 'We could not confirm the payment just now. Refresh in a moment, or contact support.',
            primaryUrl: 'https://roleplaymanager.xyz/servers/',
            primaryLabel: 'See the directory',
          }));
        }
        if (session?.metadata?.kind === 'fund') {
          const fund = await applyFundFromSession(session, ctx);
          const name = escapeHtml(fund?.guildName || 'your server');
          const until = fund?.until ? new Date(fund.until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
          const raised = fund ? '<strong>' + escapeHtml(dollars(fund.balanceCents)) + ' of ' + escapeHtml(dollars(FUND_GOAL_CENTS)) + '</strong>' : '';
          return res.send(renderPage({
            headline: fund ? 'Thanks for chipping in' : 'Payment received',
            lead: !fund
              ? 'We could not confirm the payment just now. Refresh in a moment, or contact support.'
              : until
                ? '<strong>' + name + '</strong> has Premium until ' + escapeHtml(until) + ', paid for by its members. ' + raised + ' is raised toward the month after.'
                : raised + ' is raised toward Premium for <strong>' + name + '</strong>. At ' + escapeHtml(dollars(FUND_GOAL_CENTS))
                  + ' it turns on for a month. Anyone in the server can chip in from <code>/premium</code> in Discord.',
            primaryUrl: fund ? 'https://discord.com/channels/' + fund.guildId : 'https://roleplaymanager.xyz/pricing',
            primaryLabel: fund ? 'Back to Discord' : 'Back to pricing',
          }));
        }
        if (session?.metadata?.kind === 'cybercom') {
          const cc = await applyCyberComFromSession(session, ctx);
          return res.send(renderPage({
            headline: cc ? 'RPM CyberCom is on' : 'Payment received',
            lead: cc
              ? '<strong>' + escapeHtml(cc.guildName) + '</strong> has RPM CyberCom. Next, in your server: run <code>/setup</code>, open <strong>RPM CyberCom</strong>, add the helper bots and pick your civilian, traffic stop and police radio channels.'
              : 'We could not confirm the payment just now. Refresh in a moment, or contact support.',
            primaryUrl: cc ? 'https://discord.com/channels/' + cc.guildId : 'https://roleplaymanager.xyz/pricing',
            primaryLabel: cc ? 'Open Discord' : 'Back to pricing',
          }));
        }
        result = session ? await issueKeyForCompletedSession(session, ctx) : null;
        if (!result) {
          errorMsg = 'Payment not confirmed yet. Please wait a moment and refresh, or contact support.';
        }
      } catch (err) {
        console.error('[Checkout] Success error:', err.message);
        errorMsg = 'Could not retrieve your key. Please contact support via Discord.';
      }
    }

    const activated = result?.activated || null;
    const planWord = { monthly: 'Monthly Premium', quarterly: '3-month Premium', yearly: 'Yearly Premium', lifetime: 'Lifetime Premium' }[result?.plan] || 'Premium';

    let headline; let lead; let keyLabel; let keyHint;
    if (activated) {
      headline = 'Premium is on';
      lead = `<strong>${escapeHtml(activated.guildName || 'Your server')}</strong> now has ${planWord}. `
        + 'There is nothing else to do: every Premium feature is unlocked and your settings are exactly as you left them.';
      keyLabel = 'Your key, for your records';
      keyHint = 'Already applied to ' + escapeHtml(activated.guildName || 'your server') + '. You will not need it again unless support asks for it.';
    } else if (result) {
      headline = 'Payment successful';
      lead = 'Your premium key is below. Activate it in the Premium section of your server\'s dashboard, '
        + 'or run <code>/activatepremium</code> in your server.';
      keyLabel = 'Your Premium Key';
      keyHint = 'Click the key to select it, or use the copy button below. Save it: you will need it to activate premium in the dashboard.';
    } else {
      headline = 'Payment received';
      lead = 'We could not finish setting up your key just now.';
      keyLabel = 'Your Premium Key';
      keyHint = '';
    }

    const html = readFileSync(resolve('src/website/views/checkout-success.html'), 'utf8');
    const filled = html
      .replace('<!--HEADLINE-->', headline)
      .replace('<!--LEAD-->', lead)
      .replace('<!--KEY_LABEL-->', keyLabel)
      .replace('<!--KEY_HINT-->', keyHint)
      .replace('<!--KEY_VALUE-->', result?.key ? escapeHtml(result.key) : '')
      .replace('<!--KEY_DISPLAY-->', result?.key ? 'block' : 'none')
      .replace('<!--ERROR_MSG-->', errorMsg ? escapeHtml(errorMsg) : '')
      .replace('<!--ERROR_DISPLAY-->', errorMsg ? 'block' : 'none')
      .replace('<!--DASHBOARD_URL-->', 'https://roleplaymanager.xyz/dashboard/')
      .replace('<!--PRIMARY_LABEL-->', 'Open Dashboard');

    res.send(filled);
  });

  // GET /checkout/cancel
  router.get('/cancel', (req, res) => {
    res.send(readFileSync(resolve('src/website/views/checkout-cancel.html'), 'utf8'));
  });

  // POST /checkout/webhook - Stripe event handler (raw body required)
  router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    if (webhookSecret && sig) {
      try {
        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed.' });
      }
    } else {
      return res.status(503).json({ error: 'Stripe webhook verification is not configured.' });
    }

    try {
      await handleWebhookEvent(event, ctx);
    } catch (err) {
      console.error('[Stripe Webhook] Handler error:', err.message);
      return res.status(500).json({ error: 'Webhook processing failed.' });
    }

    res.json({ received: true });
  });

  return router;
}

/** The success template, filled for a result that is not a Premium key. */
function renderPage({ headline, lead, primaryUrl, primaryLabel }) {
  const html = readFileSync(resolve('src/website/views/checkout-success.html'), 'utf8');
  return html
    .replace('<!--HEADLINE-->', escapeHtml(headline))
    .replace('<!--LEAD-->', lead)
    .replace('<!--KEY_LABEL-->', '')
    .replace('<!--KEY_HINT-->', '')
    .replace('<!--KEY_VALUE-->', '')
    .replace('<!--KEY_DISPLAY-->', 'none')
    .replace('<!--ERROR_MSG-->', '')
    .replace('<!--ERROR_DISPLAY-->', 'none')
    .replace('<!--DASHBOARD_URL-->', primaryUrl)
    .replace('<!--PRIMARY_LABEL-->', escapeHtml(primaryLabel));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
