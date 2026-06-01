import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = require('stripe');
  return Stripe(key);
}

function generateKey() {
  const seg = () => uuidv4().replace(/-/g, '').toUpperCase().slice(0, 4);
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function getDomain(req) {
  const envDomain = process.env.DOMAIN;
  if (envDomain) {
    const clean = envDomain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    return `https://${clean}`;
  }
  return `${req.protocol}://${req.headers.host}`;
}

router.post('/create', async (req, res) => {
  try {
    const { plan, discordId, tosAccepted } = req.body;

    if (!tosAccepted) {
      return res.status(400).json({ error: 'You must accept the Terms of Service.' });
    }
    if (!plan || !['monthly', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }
    if (!discordId || !/^\d{17,20}$/.test(discordId)) {
      return res.status(400).json({ error: 'Invalid Discord user ID.' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(503).json({ error: 'Payment processing is not configured yet. Join our Discord for support.' });
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });

    const domain = getDomain(req);
    const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const lifetimePriceId = process.env.STRIPE_LIFETIME_PRICE_ID;

    let sessionParams;
    if (plan === 'monthly') {
      if (!monthlyPriceId) {
        return res.status(503).json({ error: 'Monthly plan is not configured yet.' });
      }
      sessionParams = {
        mode: 'subscription',
        line_items: [{ price: monthlyPriceId, quantity: 1 }],
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
        metadata: { discordId, plan: 'monthly', tosAccepted: 'true' },
        subscription_data: { metadata: { discordId } },
        allow_promotion_codes: true,
      };
    } else {
      if (!lifetimePriceId) {
        return res.status(503).json({ error: 'Lifetime plan is not configured yet.' });
      }
      sessionParams = {
        mode: 'payment',
        line_items: [{ price: lifetimePriceId, quantity: 1 }],
        success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/checkout/cancel`,
        metadata: { discordId, plan: 'lifetime', tosAccepted: 'true' },
        allow_promotion_codes: true,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });

  } catch (err) {
    console.error('[Checkout] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
});

router.get('/success', async (req, res) => {
  const { session_id } = req.query;

  let keyValue = null;

  if (session_id) {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid' || session.status === 'complete') {
          const { default: PremiumKey } = await import('../../models/PremiumKey.js');
          const mongoose = await import('mongoose');

          const existing = await PremiumKey.findOne({ stripeSessionId: session_id });
          if (existing) {
            keyValue = existing.key;
          } else {
            keyValue = generateKey();
            const plan = session.metadata?.plan || 'monthly';
            const discordId = session.metadata?.discordId || null;

            await PremiumKey.create({
              key: keyValue,
              plan,
              purchasedBy: discordId,
              tosAcceptedAt: new Date(),
              stripeSessionId: session_id,
              stripeCustomerId: session.customer || null,
              stripeSubscriptionId: session.subscription || null,
              stripePaymentIntentId: session.payment_intent || null,
              subscriptionStatus: plan === 'monthly' ? 'active' : null,
            });
          }
        }
      }
    } catch (err) {
      console.error('[Checkout] Success key lookup error:', err.message);
    }
  }

  let html = readFileSync(resolve('src/website/views/checkout-success.html'), 'utf8');
  if (keyValue) {
    html = html.replace('</script>', `  var params = new URLSearchParams('key=${encodeURIComponent(keyValue)}');\n  var key = params.get('key');\n  if (key) {\n    document.getElementById('key-box').style.display = 'block';\n    document.getElementById('key-display').textContent = key;\n  }\n</script>`);
    html = html.replace(/<script>[\s\S]*?<\/script>/, '');
  }

  res.send(html);
});

router.get('/cancel', (req, res) => {
  res.send(readFileSync(resolve('src/website/views/checkout-cancel.html'), 'utf8'));
});

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) return res.status(200).json({ received: true });

  let event;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  try {
    const { default: PremiumKey } = await import('../../models/PremiumKey.js');

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const existing = await PremiumKey.findOne({ stripeSessionId: session.id });
      if (!existing) {
        const keyValue = generateKey();
        const plan = session.metadata?.plan || 'monthly';
        await PremiumKey.create({
          key: keyValue,
          plan,
          purchasedBy: session.metadata?.discordId || null,
          tosAcceptedAt: new Date(),
          stripeSessionId: session.id,
          stripeCustomerId: session.customer || null,
          stripeSubscriptionId: session.subscription || null,
          stripePaymentIntentId: session.payment_intent || null,
          subscriptionStatus: plan === 'monthly' ? 'active' : null,
        });
        console.log(`[Stripe] New premium key created for session ${session.id} (plan: ${plan})`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
      if (keyDoc) {
        keyDoc.subscriptionStatus = 'cancelled';
        await keyDoc.save();
        console.log(`[Stripe] Subscription ${sub.id} cancelled — key ${keyDoc.key} marked inactive`);
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const keyDoc = await PremiumKey.findOne({ stripeSubscriptionId: sub.id });
      if (keyDoc) {
        keyDoc.subscriptionStatus = sub.status;
        keyDoc.subscriptionCurrentPeriodEnd = new Date(sub.current_period_end * 1000);
        await keyDoc.save();
      }
    }

  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err.message);
  }

  res.json({ received: true });
});

export function createCheckoutRouter() {
  return router;
}
