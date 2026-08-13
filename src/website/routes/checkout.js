import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Rate limiting (in-memory, per IP) ────────────────────────────────────────
// Max 10 checkout attempts per IP per hour - prevents abuse / carding attacks
const _rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;
const VALID_PLANS = new Set(['monthly', 'quarterly', 'lifetime']);

// Purge expired entries every 30 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateLimitMap) {
    if (now > entry.resetAt) _rateLimitMap.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
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

// Auto-create Stripe products & prices on first use.
// Uses v3 field names in MongoDB so old cached price IDs are never reused
// when amounts change. Prices: $5/mo, $14/3mo, $48.99 lifetime.
async function getOrCreatePrices(stripe) {
  let monthlyPriceId = null;
  let quarterlyPriceId = null;
  let lifetimePriceId = null;

  // Try to load v3 cached price IDs from DB first
  try {
    const { default: StripeConfig } = await import('../../models/StripeConfig.js');
    const cfg = await StripeConfig.findOne({ key: 'global' }).maxTimeMS(5000);
    if (cfg?.monthlyPriceIdV3 && cfg?.quarterlyPriceIdV3 && cfg?.lifetimePriceIdV3) {
      return {
        monthlyPriceId: cfg.monthlyPriceIdV3,
        quarterlyPriceId: cfg.quarterlyPriceIdV3,
        lifetimePriceId: cfg.lifetimePriceIdV3,
      };
    }
    monthlyPriceId = cfg?.monthlyPriceIdV3 || null;
    quarterlyPriceId = cfg?.quarterlyPriceIdV3 || null;
    lifetimePriceId = cfg?.lifetimePriceIdV3 || null;
  } catch (dbErr) {
    console.warn('[Stripe] DB lookup failed, proceeding without cache:', dbErr.message);
  }

  // Create any missing prices via Stripe API
  if (!monthlyPriceId) {
    const product = await stripe.products.create({
      name: 'RolePlayManager Premium - Monthly',
      description: 'Monthly premium subscription. $5/month. Includes AI Voice Dispatch and all premium features. All sales final.',
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 500,
      currency: 'usd',
      recurring: { interval: 'month' },
      nickname: 'RPM Premium Monthly v3',
    });
    monthlyPriceId = price.id;
    console.log(`[Stripe] Auto-created monthly price v3: ${monthlyPriceId}`);
  }

  if (!quarterlyPriceId) {
    const product = await stripe.products.create({
      name: 'RolePlayManager Premium - 3 Month',
      description: '3-month premium subscription billed every 3 months. $14 per period. Includes AI Voice Dispatch and all premium features. All sales final.',
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 1400,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 3 },
      nickname: 'RPM Premium 3-Month v3',
    });
    quarterlyPriceId = price.id;
    console.log(`[Stripe] Auto-created quarterly price v3: ${quarterlyPriceId}`);
  }

  if (!lifetimePriceId) {
    const product = await stripe.products.create({
      name: 'RolePlayManager Premium - Lifetime',
      description: 'One-time lifetime premium purchase. $48.99. Includes AI Voice Dispatch and all current premium features. All sales final.',
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 4899,
      currency: 'usd',
      nickname: 'RPM Premium Lifetime v3',
    });
    lifetimePriceId = price.id;
    console.log(`[Stripe] Auto-created lifetime price v3: ${lifetimePriceId}`);
  }

  // Cache the v3 IDs for future calls - non-fatal if this fails
  try {
    const { default: StripeConfig } = await import('../../models/StripeConfig.js');
    await StripeConfig.findOneAndUpdate(
      { key: 'global' },
      { monthlyPriceIdV3: monthlyPriceId, quarterlyPriceIdV3: quarterlyPriceId, lifetimePriceIdV3: lifetimePriceId },
      { upsert: true, new: true }
    );
  } catch (dbErr) {
    console.warn('[Stripe] DB save failed (prices still usable this request):', dbErr.message);
  }

  return { monthlyPriceId, quarterlyPriceId, lifetimePriceId };
}

// Issue a premium key for a completed Stripe session - idempotent.
// The session must be paid, complete, and created by our checkout flow.
async function issueKeyForCompletedSession(session) {
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
    purchasedBy: session.metadata?.discordId || null,
    tosAcceptedAt: new Date(),
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
    stripePaymentIntentId: session.payment_intent || null,
    subscriptionStatus: isSubscription ? 'active' : null,
  };

  try {
    const key = await PremiumKey.findOneAndUpdate(
      { stripeSessionId: session.id },
      { $setOnInsert: keyFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`[Stripe] Premium key ready for session ${session.id} (plan: ${plan})`);
    return key.key;
  } catch (err) {
    // A webhook and the success-page request can arrive at the same time.
    if (err?.code === 11000) {
      const existing = await PremiumKey.findOne({ stripeSessionId: session.id });
      return existing?.key || null;
    }
    throw err;
  }
}

async function issueKeyForSession(sessionId) {
  const stripe = await getStripeClient();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return issueKeyForCompletedSession(session);
}

// ── Router factory ────────────────────────────────────────────────────────────
export function createCheckoutRouter() {
  const router = Router();

  // POST /checkout/create - start a Stripe checkout session
  router.post('/create', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
    }

    try {
      const { plan, discordId, tosAccepted } = req.body;

      if (!tosAccepted) {
        return res.status(400).json({ error: 'You must accept the Terms of Service.' });
      }
      // lifetime kept for any legacy direct API calls; not shown in UI anymore
      if (!plan || !['monthly', 'quarterly', 'lifetime'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan.' });
      }
      if (discordId && !/^\d{17,20}$/.test(String(discordId))) {
        return res.status(400).json({ error: 'Invalid Discord user ID.' });
      }

      const stripe = await getStripeClient();
      if (!stripe) {
        return res.status(503).json({
          error: 'Payment processing is not configured yet. Join our Discord for help.',
        });
      }

      const domain = getDomain(req);
      const metadata = { plan, tosAccepted: 'true' };
      if (discordId) metadata.discordId = String(discordId);
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
        // lifetime: one-time payment, auto-created via getOrCreatePrices
        session = await stripe.checkout.sessions.create({
          ...commonParams,
          mode: 'payment',
          customer_creation: 'always',
          line_items: [{ price: lifetimePriceId, quantity: 1 }],
          payment_intent_data: { metadata },
        });
      }

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

  // GET /checkout/success?session_id=... - verify session, issue key, render page
  router.get('/success', async (req, res) => {
    const { session_id } = req.query;
    let keyValue = null;
    let errorMsg = null;

    if (!session_id || typeof session_id !== 'string' || !/^cs_/.test(session_id)) {
      errorMsg = 'Invalid or missing session. Please contact support via Discord.';
    } else {
      try {
        keyValue = await issueKeyForSession(session_id);
        if (!keyValue) {
          errorMsg = 'Payment not confirmed yet. Please wait a moment and refresh, or contact support.';
        }
      } catch (err) {
        console.error('[Checkout] Success error:', err.message);
        errorMsg = 'Could not retrieve your key. Please contact support via Discord.';
      }
    }

    const html = readFileSync(resolve('src/website/views/checkout-success.html'), 'utf8');
    const filled = html
      .replace('<!--KEY_VALUE-->', keyValue ? escapeHtml(keyValue) : '')
      .replace('<!--KEY_DISPLAY-->', keyValue ? 'block' : 'none')
      .replace('<!--ERROR_MSG-->', errorMsg ? escapeHtml(errorMsg) : '')
      .replace('<!--ERROR_DISPLAY-->', errorMsg ? 'block' : 'none');

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
    let signatureVerified = false;

    if (webhookSecret && sig) {
      try {
        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        signatureVerified = true;
      } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed.' });
      }
    } else {
      return res.status(503).json({ error: 'Stripe webhook verification is not configured.' });
    }

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');

      if (event.type === 'checkout.session.completed' && signatureVerified) {
        const session = event.data.object;
        await issueKeyForCompletedSession(session);
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        if (sub?.id) {
          const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
          if (keyDoc) {
            keyDoc.subscriptionStatus = 'cancelled';
            await keyDoc.save();
            const { clearPremiumCache } = await import('../../utils/premiumCheck.js');
            if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
            console.log(`[Stripe Webhook] Subscription ${sub.id} cancelled - premium revoked for guild ${keyDoc.guildId}`);
          }
        }
      }

      if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object;
        if (sub?.id) {
          const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
          if (keyDoc) {
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
            const { clearPremiumCache } = await import('../../utils/premiumCheck.js');
            if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
            console.log(`[Stripe Webhook] Subscription ${sub.id} updated - status: ${keyDoc.subscriptionStatus}`);
          }
        }
      }

      if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        const subId = invoice?.subscription;
        if (subId) {
          const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: subId });
          if (keyDoc) {
            keyDoc.subscriptionStatus = 'past_due';
            await keyDoc.save();
            const { clearPremiumCache } = await import('../../utils/premiumCheck.js');
            if (keyDoc.guildId) clearPremiumCache(keyDoc.guildId);
            console.log(`[Stripe Webhook] Payment failed for subscription ${subId} - guild ${keyDoc.guildId} marked past_due`);
          }
        }
      }

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
