import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { recordFunnel } from '../../utils/funnel.js';
import { attachKeyToGuild } from '../../utils/premiumKeys.js';
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
const VALID_PLANS = new Set(['monthly', 'quarterly', 'lifetime']);
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
  for (const [token, entry] of _identityCache) {
    if (now > entry.exp) _identityCache.delete(token);
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
  return plan === 'monthly' || plan === 'quarterly';
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

/**
 * Who is signed in, from the site's Discord token: their id and the servers
 * they administer. Cached briefly, since the pricing page asks and then the
 * checkout asks again a moment later.
 */
const _identityCache = new Map();
const IDENTITY_TTL_MS = 5 * 60 * 1000;

async function identifyWithDiscord(token) {
  const cached = _identityCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.data;

  const headers = { Authorization: `Bearer ${token}` };
  const [me, guilds] = await Promise.all([
    axios.get('https://discord.com/api/users/@me', { headers }),
    axios.get('https://discord.com/api/users/@me/guilds', { headers }),
  ]);
  const data = {
    id: me.data.id,
    username: me.data.username,
    guilds: (guilds.data || []).map((g) => ({
      id: g.id,
      name: g.name,
      admin: (BigInt(g.permissions || 0) & BigInt(0x8)) === BigInt(0x8),
    })),
  };
  _identityCache.set(token, { data, exp: Date.now() + IDENTITY_TTL_MS });
  return data;
}

function bearerToken(req) {
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
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
  lifetime: {
    field: 'lifetimePriceIdV3',
    nickname: 'RPM Premium Lifetime v3',
    amount: 4899,
    recurring: null,
    product: {
      name: 'RolePlayManager Premium - Lifetime',
      description: 'One-time lifetime premium purchase. $48.99. Includes AI Voice Dispatch and all current premium features. All sales final.',
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
  const ids = { monthly: null, quarterly: null, lifetime: null };
  let StripeConfig = null;

  try {
    ({ default: StripeConfig } = await import('../../models/StripeConfig.js'));
    const cfg = await StripeConfig.findOne({ key: 'global' }).maxTimeMS(5000);
    for (const [plan, spec] of Object.entries(PRICE_SPECS)) ids[plan] = cfg?.[spec.field] || null;
    if (ids.monthly && ids.quarterly && ids.lifetime) {
      return { monthlyPriceId: ids.monthly, quarterlyPriceId: ids.quarterly, lifetimePriceId: ids.lifetime };
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
        { monthlyPriceIdV3: ids.monthly, quarterlyPriceIdV3: ids.quarterly, lifetimePriceIdV3: ids.lifetime },
        { upsert: true, new: true }
      );
    }
  } catch (dbErr) {
    console.warn('[Stripe] DB save failed (prices still usable this request):', dbErr.message);
  }

  return { monthlyPriceId: ids.monthly, quarterlyPriceId: ids.quarterly, lifetimePriceId: ids.lifetime };
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
    await issueKeyForCompletedSession(event.data.object, ctx);
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    if (!sub?.id) return;
    const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
    if (!keyDoc) return;

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
    if (!keyDoc) return;

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
    if (!keyDoc) return;

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
      const { plan, tosAccepted, guildId, source } = req.body || {};

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
      if (guildId !== undefined && guildId !== null && guildId !== '') {
        if (!ID.test(String(guildId))) return res.status(400).json({ error: 'Invalid server.' });
        if (!identity) {
          return res.status(401).json({ error: 'Your sign-in has expired. Sign in again, or continue without choosing a server.' });
        }
        const g = identity.guilds.find((x) => x.id === String(guildId) && x.admin);
        if (!g) return res.status(403).json({ error: 'You need Administrator on that server to buy Premium for it.' });
        if (client && client.guilds?.cache && !client.guilds.cache.has(String(guildId))) {
          return res.status(400).json({ error: 'The bot is not in that server yet. Invite it first, then come back.' });
        }
        guildName = client?.guilds?.cache?.get(String(guildId))?.name || g.name || null;
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
      }
      if (source) metadata.source = clip(source, 40);

      const commonParams = {
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
        metadata,
        allow_promotion_codes: true,
      };

      const { monthlyPriceId, quarterlyPriceId, lifetimePriceId } = await getOrCreatePrices(stripe);

      let session;
      if (isSubscriptionPlan(plan)) {
        const priceId = plan === 'monthly' ? monthlyPriceId : quarterlyPriceId;
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
        result = await issueKeyForSession(session_id, ctx);
        if (!result) {
          errorMsg = 'Payment not confirmed yet. Please wait a moment and refresh, or contact support.';
        }
      } catch (err) {
        console.error('[Checkout] Success error:', err.message);
        errorMsg = 'Could not retrieve your key. Please contact support via Discord.';
      }
    }

    const activated = result?.activated || null;
    const planWord = { monthly: 'Monthly Premium', quarterly: '3-month Premium', lifetime: 'Lifetime Premium' }[result?.plan] || 'Premium';

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
      .replace('<!--DASHBOARD_URL-->', 'https://roleplaymanager.xyz/dashboard/');

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
