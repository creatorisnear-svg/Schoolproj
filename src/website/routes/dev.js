import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes, timingSafeEqual } from 'crypto';
import multer from 'multer';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';
import FeatureFlag from '../../models/FeatureFlag.js';
import PremiumKey from '../../models/PremiumKey.js';
import { keyIsLive } from '../../utils/premiumCheck.js';
import VerifiedUser from '../../models/VerifiedUser.js';
import { clearFeatureFlagCache, clearPremiumCache, recordVote } from '../../utils/premiumCheck.js';
import { funnelSummary } from '../../utils/funnel.js';
import { usageSummary } from '../../utils/aiUsage.js';
import { FEATURES, DEFAULT_PREMIUM_FEATURES } from '../../config/features.js';
import { getMaintenanceStatus, setMaintenanceMode } from '../../utils/maintenanceMode.js';
import { sendChangelogWebhook } from '../../utils/changelogWebhook.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  },
});

// Derived from the canonical feature registry so the dev panel can never drift
// out of sync with what the bot and dashboard actually gate on. Foundation
// features (general settings, staff) are excluded - they are prerequisites, not
// things it makes sense to put behind Premium.
const ALL_FEATURES = FEATURES
  .filter((f) => f.group !== 'Foundation')
  .map((f) => ({ feature: f.key, label: f.label }));

// No fallback. This is a public repository, so a default here is a published
// password for anybody who deploys without setting the variable.
const DEV_PASSWORD = process.env.DEV_PASSWORD || null;

// The radio lines in the promo video (marketing/promo.html), in the bot's own
// words. Officers start with "Dispatch": the AI dispatcher only answers
// sentences that do. A list of voices is tried in order (Groq, then OpenAI).
const PROMO_VOICE_LINES = [
  { id: 'call', voices: 'dispatch', text: 'Attention all units. Nine one one emergency call. Shots fired at Grove Street. All available units respond.' },
  { id: 'respond', voices: ['troy', 'daniel', 'echo'], text: 'Dispatch, Unit 12, show me responding to call 14.' },
  { id: 'respondAck', voices: 'dispatch', text: 'Copy Unit 12, ten seventy-six to call 14.' },
  { id: 'plate', voices: ['austin', 'daniel', 'fable'], text: 'Dispatch, run plate A B C 1 2 3.' },
  { id: 'plateReply', voices: 'dispatch', text: 'Plate A B C 1 2 3 comes back to Tony Russo, black 2019 Bravado Buffalo. Record shows WANTED for armed robbery.' },
];
// The RPM CyberCom promo (?set=cybercom, for marketing/render-cybercom.mjs).
// The bot's lines are word for word what stops.js says; officers start with
// "Dispatch", civilians with "RPM". Reyes, Unit 12 and Blade keep one voice each.
const CYBERCOM_VOICE_LINES = [
  { id: 'ccStop', voices: ['troy', 'daniel', 'echo'], text: 'Dispatch, show me on a 10-11 with Blade.' },
  { id: 'ccStopAck', voices: 'dispatch', text: 'Copy Reyes, ten eleven with Blade. Moving you to Traffic Stop 1.' },
  { id: 'ccStopAsk', voices: 'dispatch', text: 'Blade, would you like to be moved into the ten eleven channel?' },
  { id: 'ccStopYes', voices: ['austin', 'fable', 'onyx'], text: 'Yeah, move me.' },
  { id: 'ccPursuit', voices: ['troy', 'daniel', 'echo'], text: 'Dispatch, show me in a 10-80.' },
  { id: 'ccPursuitAck', voices: 'dispatch', text: 'Copy Reyes, ten eighty. Letting all units know.' },
  { id: 'ccPursuitRadio', voices: 'dispatch', text: 'Reyes is in a ten eighty. Any units wanting to respond, say dispatch, attach me to the ten eighty.' },
  { id: 'ccAttach', voices: ['daniel', 'austin', 'fable'], text: 'Dispatch, attach me to the 10-80.' },
  { id: 'ccAttachAck', voices: 'dispatch', text: "Copy Unit 12, attaching you to Reyes's ten eighty." },
  { id: 'ccClear', voices: ['troy', 'daniel', 'echo'], text: 'Dispatch, show me off my 10-11.' },
  { id: 'ccClearAck', voices: 'dispatch', text: 'Copy, ten eight. Moving everyone back to their channels. Say no to stay.' },
  { id: 'ccRpm', voices: ['austin', 'fable', 'onyx'], text: 'R P M, move me to Mia.' },
  { id: 'ccRpmAck', voices: 'dispatch', text: 'Moving you to Mia.' },
];
if (!DEV_PASSWORD) {
  console.warn('[DEV] DEV_PASSWORD is not set. The dev panel is disabled.');
}

/** Constant time, so the password cannot be recovered a character at a time. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
const sessions = new Set();

// Brute-force protection for dev login
const _loginAttempts = new Map();
const LOGIN_WINDOW = 15 * 60_000;   // 15 minutes
const LOGIN_MAX    = 5;              // attempts before lockout
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of _loginAttempts) { if (now > e.resetAt) _loginAttempts.delete(ip); }
}, 5 * 60_000);
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= LOGIN_MAX) {
    const remaining = Math.ceil((entry.resetAt - now) / 60_000);
    return res.redirect(`/dev/login?error=locked&min=${remaining}`);
  }
  next();
}
function recordLoginFail(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
  } else {
    entry.count++;
  }
}
function isLockedOut(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const entry = _loginAttempts.get(ip);
  return !!(entry && Date.now() < entry.resetAt && entry.count >= LOGIN_MAX);
}
function clearLoginFail(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  _loginAttempts.delete(ip);
}

function devAuth(req, res, next) {
  if (!DEV_PASSWORD) return res.status(503).json({ error: 'Dev panel is not configured.' });

  const token = req.cookies?.dev_session;
  if (token && sessions.has(token)) return next();

  // The header route used to skip the lockout entirely, so the login form was
  // throttled to 5 tries per 15 minutes while `Authorization: Bearer x` on any
  // other dev route could be guessed without limit.
  const auth = req.headers.authorization;
  if (auth) {
    if (isLockedOut(req)) return res.status(429).json({ error: 'Too many attempts.' });
    if (auth.startsWith('Bearer ') && sameSecret(auth.slice(7), DEV_PASSWORD)) {
      clearLoginFail(req);
      return next();
    }
    recordLoginFail(req);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') return res.redirect('/dev/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

export function createDevRouter(client) {
  const router = Router();

  router.get('/login', (req, res) => {
    let error = '';
    if (req.query.error === 'locked') {
      const min = req.query.min || '15';
      error = `<div style="color:#ef4444;font-size:13px;margin-bottom:12px;">Too many failed attempts. Try again in ${min} minute${min === '1' ? '' : 's'}.</div>`;
    } else if (req.query.error) {
      error = '<div style="color:#ef4444;font-size:13px;margin-bottom:12px;">Incorrect password.</div>';
    }
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dev Login - RolePlayManager</title>
  <link rel="icon" type="image/png" href="/img/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #0d0d0d; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #161616; border: 1px solid #222; border-radius: 16px; padding: 40px; width: 100%; max-width: 360px; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; justify-content: center; }
    .logo img { height: 36px; }
    .logo span { font-size: 16px; font-weight: 700; color: #fff; }
    h2 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 6px; text-align: center; }
    p { font-size: 13px; color: #666; margin-bottom: 24px; text-align: center; }
    label { display: block; font-size: 13px; font-weight: 600; color: #ccc; margin-bottom: 6px; }
    input { width: 100%; background: #111; border: 1px solid #2a2a2a; border-radius: 8px; color: #e0e0e0; font-size: 14px; padding: 10px 12px; font-family: inherit; outline: none; margin-bottom: 16px; }
    input:focus { border-color: #5865f2; }
    button { width: 100%; background: #5865f2; color: #fff; border: none; border-radius: 8px; padding: 11px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    button:hover { background: #4752c4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><img src="/img/logo.png" alt="RPM"><span>Developer Panel</span></div>
    <h2>Sign In</h2>
    <p>Enter the developer password to continue</p>
    ${error}
    <form method="POST" action="/dev/auth">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter password" autofocus required>
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`);
  });

  router.post('/auth', loginRateLimit, (req, res) => {
    if (!DEV_PASSWORD) return res.status(503).send('Dev panel is not configured.');
    const { password } = req.body;
    if (!sameSecret(password, DEV_PASSWORD)) {
      recordLoginFail(req);
      return res.redirect('/dev/login?error=1');
    }
    clearLoginFail(req);
    const token = randomBytes(32).toString('hex');
    sessions.add(token);
    res.cookie('dev_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.redirect('/dev');
  });

  router.get('/logout', (req, res) => {
    const token = req.cookies?.dev_session;
    if (token) sessions.delete(token);
    res.clearCookie('dev_session');
    res.redirect('/dev/login');
  });

  router.get('/', devAuth, (req, res) => {
    res.send(readFileSync(resolve('src/website/views/devpanel.html'), 'utf8'));
  });

  router.get('/check', (req, res) => {
    const token = req.cookies?.dev_session;
    res.json({ authorized: token ? sessions.has(token) : false });
  });

  // GET /dev/promo-voice: the promo video's radio lines in the bot's real
  // voices, as one JSON download for marketing/render.mjs (?set=cybercom:
  // the RPM CyberCom promo's, for render-cybercom.mjs). The voice key only
  // exists on the server, so the clips are made here.
  router.get('/promo-voice', devAuth, async (req, res) => {
    try {
      const { generateDispatchTTSPublic, synthesizeWithVoice } = await import('../../handlers/dispatchHandler.js');
      const lines = [];
      const set = req.query.set === 'cybercom' ? CYBERCOM_VOICE_LINES : PROMO_VOICE_LINES;
      for (const line of set) {
        const entry = { id: line.id, text: line.text, voice: null };
        if (line.voices === 'dispatch') {
          try {
            entry.audio = (await generateDispatchTTSPublic(line.text)).toString('base64');
            entry.voice = 'dispatch';
          } catch (err) { entry.error = err.message; }
        } else {
          for (const voice of line.voices) {
            try {
              entry.audio = (await synthesizeWithVoice(line.text, voice)).toString('base64');
              entry.voice = voice;
              delete entry.error;
              break;
            } catch (err) { entry.error = voice + ': ' + err.message; }
          }
        }
        lines.push(entry);
      }
      res.setHeader('Content-Disposition', `attachment; filename="rpm-promo-voice${set === CYBERCOM_VOICE_LINES ? '-cybercom' : ''}.json"`);
      res.json({ generatedAt: new Date().toISOString(), lines });
    } catch (err) {
      console.error('[DEV] Promo voice error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/announcements', devAuth, async (req, res) => {
    const items = await Announcement.find().sort({ createdAt: -1 });
    res.json(items);
  });

  router.post('/announcements', devAuth, async (req, res) => {
    const { title, content, type } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const item = await Announcement.create({ title, content, type });
    res.json(item);
  });

  router.patch('/announcements/:id', devAuth, async (req, res) => {
    const item = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  router.delete('/announcements/:id', devAuth, async (req, res) => {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  router.get('/changelogs', devAuth, async (req, res) => {
    const items = await Changelog.find().sort({ date: -1 });
    res.json(items);
  });

  router.post('/changelogs', devAuth, async (req, res) => {
    const { version, title, changes } = req.body;
    if (!version || !title) return res.status(400).json({ error: 'Version and title required' });
    const item = await Changelog.create({ version, title, changes });
    sendChangelogWebhook(item).catch(() => {});
    res.json(item);
  });

  router.patch('/changelogs/:id', devAuth, async (req, res) => {
    const item = await Changelog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    sendChangelogWebhook(item, { isUpdate: true }).catch(() => {});
    res.json(item);
  });

  router.delete('/changelogs/:id', devAuth, async (req, res) => {
    await Changelog.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  router.get('/videos', devAuth, async (req, res) => {
    const items = await PreviewVideo.find().select('-videoData').sort({ order: 1, createdAt: -1 });
    res.json(items);
  });

  router.post('/videos', devAuth, upload.single('video'), async (req, res) => {
    try {
      const { title, description, aspectRatio, order, videoUrl } = req.body;
      if (!title) return res.status(400).json({ error: 'Title required' });
      if (!req.file && !videoUrl) return res.status(400).json({ error: 'Video file or YouTube URL required' });
      const createData = {
        title,
        description: description || '',
        aspectRatio: aspectRatio || '16:9',
        order: parseInt(order) || 0,
      };
      if (req.file) {
        createData.videoData = req.file.buffer;
        createData.mimeType = req.file.mimetype;
      } else {
        createData.videoUrl = videoUrl;
      }
      const item = await PreviewVideo.create(createData);
      res.json({ _id: item._id, title: item.title, description: item.description, aspectRatio: item.aspectRatio, order: item.order, videoUrl: item.videoUrl, createdAt: item.createdAt });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Upload failed' });
    }
  });

  router.get('/videos/:id/file', devAuth, async (req, res) => {
    try {
      const item = await PreviewVideo.findById(req.params.id).select('videoData mimeType');
      if (!item || !item.videoData) return res.status(404).send('Not found');
      res.setHeader('Content-Type', item.mimeType || 'video/mp4');
      res.send(item.videoData);
    } catch { res.status(500).send('Error'); }
  });

  router.patch('/videos/:id', devAuth, async (req, res) => {
    const { title, description, aspectRatio, order } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (aspectRatio !== undefined) update.aspectRatio = aspectRatio;
    if (order !== undefined) update.order = parseInt(order) || 0;
    const item = await PreviewVideo.findByIdAndUpdate(req.params.id, update, { new: true }).select('-videoData');
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  router.delete('/videos/:id', devAuth, async (req, res) => {
    await PreviewVideo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  router.get('/features', devAuth, async (req, res) => {
    try {
      const flags = await FeatureFlag.find();
      const flagMap = {};
      flags.forEach(f => { flagMap[f.feature] = f.premium; });
      const result = ALL_FEATURES.map(f => ({
        feature: f.feature,
        label: f.label,
        premium: flagMap[f.feature] ?? DEFAULT_PREMIUM_FEATURES.includes(f.feature),
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
  });

  // ── Stripe Testing ────────────────────────────────────────────────────────
  router.get('/stripe/status', devAuth, async (req, res) => {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!key) return res.json({ configured: false });
    const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'unknown';
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(key, { apiVersion: '2024-04-10' });
      await stripe.balance.retrieve();
      res.json({ configured: true, mode, connected: true });
    } catch (err) {
      res.json({ configured: true, mode, connected: false, error: err.message });
    }
  });

  router.post('/stripe/generate-key', devAuth, async (req, res) => {
    try {
      const { plan = 'lifetime' } = req.body;
      const seg = () => randomBytes(2).toString('hex').toUpperCase();
      const key = `TEST-${seg()}-${seg()}-${seg()}`;
      await PremiumKey.create({ key, plan, subscriptionStatus: plan === 'monthly' ? 'active' : null });
      res.json({ ok: true, key });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/stripe/keys/:key', devAuth, async (req, res) => {
    try {
      const result = await PremiumKey.findOneAndDelete({ key: req.params.key, guildId: null });
      if (!result) return res.status(404).json({ error: 'Key not found or already activated' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/stripe/test-checkout', devAuth, async (req, res) => {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!key) return res.status(400).json({ error: 'STRIPE_SECRET_KEY is not configured' });
    if (!key.startsWith('sk_test_')) return res.status(400).json({ error: 'Test checkout only works with a test key (sk_test_...). Your current key is live mode.' });
    try {
      const { plan = 'monthly' } = req.body;
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(key, { apiVersion: '2024-04-10' });

      const domain = process.env.DOMAIN ? `https://${process.env.DOMAIN.replace(/^https?:\/\//, '')}` : `http://localhost:${process.env.PORT || 5000}`;

      let session;
      if (plan === 'monthly') {
        const price = await stripe.prices.create({
          currency: 'usd',
          unit_amount: 999,
          recurring: { interval: 'month' },
          product_data: { name: '[TEST] RPM Monthly Premium' },
        });
        session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${domain}/checkout/cancel`,
          metadata: { discordId: 'DEV_TEST', plan: 'monthly', tosAccepted: 'true' },
          subscription_data: { metadata: { discordId: 'DEV_TEST' } },
        });
      } else {
        const price = await stripe.prices.create({
          currency: 'usd',
          unit_amount: 4999,
          product_data: { name: '[TEST] RPM Lifetime Premium' },
        });
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_creation: 'always',
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: `${domain}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${domain}/checkout/cancel`,
          metadata: { discordId: 'DEV_TEST', plan: 'lifetime', tosAccepted: 'true' },
        });
      }
      res.json({ ok: true, url: session.url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/premium-keys', devAuth, async (req, res) => {
    try {
      const { plan = 'manual', count = 1 } = req.body;
      const validPlans = ['monthly', 'quarterly', 'lifetime', 'manual'];
      if (!validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan. Must be monthly, quarterly, lifetime, or manual.' });
      const qty = Math.min(Math.max(parseInt(count) || 1, 1), 25);
      const seg = () => randomBytes(2).toString('hex').toUpperCase();
      const keys = [];
      for (let i = 0; i < qty; i++) {
        const key = `RPM-${seg()}${seg()}-${seg()}${seg()}-${seg()}${seg()}`;
        await PremiumKey.create({
          key,
          plan,
          subscriptionStatus: plan === 'monthly' || plan === 'quarterly' ? 'active' : null,
          createdAt: new Date(),
        });
        keys.push(key);
      }
      res.json({ ok: true, keys });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/premium-keys', devAuth, async (req, res) => {
    try {
      const keys = await PremiumKey.find({}).sort({ createdAt: -1 }).lean();
      res.json(keys);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/premium-keys/:key', devAuth, async (req, res) => {
    try {
      const deleted = await PremiumKey.findOneAndDelete({ key: req.params.key });
      if (!deleted) return res.status(404).json({ error: 'Key not found' });
      const { clearPremiumCache } = await import('../../utils/premiumCheck.js');
      if (deleted.guildId) clearPremiumCache(deleted.guildId);
      res.json({ ok: true, deleted: deleted.key });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/guilds', devAuth, (req, res) => {
    if (!client || !client.isReady()) return res.status(503).json({ error: 'Bot is not connected to Discord' });
    const guilds = [...client.guilds.cache.values()].map(g => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=32` : null,
    })).sort((a, b) => b.memberCount - a.memberCount);
    res.json(guilds);
  });

  /**
   * Where servers stop on the way to paying.
   *
   * Everything here is counted live rather than stored, so there is nothing to
   * backfill and nothing that can drift out of date. It is a handful of counts
   * over collections that are already small.
   */
  // ── Server directory moderation ─────────────────────────────────────────
  router.get('/directory', devAuth, async (req, res) => {
    try {
      const [{ default: DirectoryListing }, { default: DirectoryVote }, { default: DirectoryClick }, { default: DirectoryReport }, { default: DirectoryPromotion }, { MAX_FEATURED, invalidateDirectory }] = await Promise.all([
        import('../../models/DirectoryListing.js'), import('../../models/DirectoryVote.js'), import('../../models/DirectoryClick.js'),
        import('../../models/DirectoryReport.js'), import('../../models/DirectoryPromotion.js'), import('../../utils/directory.js'),
      ]);
      void invalidateDirectory;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const [listings, votes, clicks, reports, promos] = await Promise.all([
        DirectoryListing.find({}).lean(),
        DirectoryVote.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$guildId', n: { $sum: 1 } } }]),
        DirectoryClick.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$guildId', n: { $sum: 1 } } }]),
        DirectoryReport.find({ resolved: false }).sort({ createdAt: -1 }).limit(50).lean(),
        DirectoryPromotion.find({ createdAt: { $gte: since } }).lean(),
      ]);
      const v = new Map(votes.map((x) => [x._id, x.n]));
      const c = new Map(clicks.map((x) => [x._id, x.n]));
      const nameOf = (id) => (client && client.guilds.cache.get(id)?.name) || id;
      res.json({
        listed: listings.filter((l) => l.listed && !l.hidden).length,
        featuredNow: listings.filter((l) => l.featuredUntil && new Date(l.featuredUntil) > now).length,
        maxFeatured: MAX_FEATURED,
        votes30: votes.reduce((s, x) => s + x.n, 0),
        clicks30: clicks.reduce((s, x) => s + x.n, 0),
        promoCount30: promos.length,
        promoRevenue30: promos.reduce((s, p) => s + (p.amount || 0), 0),
        reports: reports.map((r) => ({ id: String(r._id), guildId: r.guildId, name: nameOf(r.guildId), reason: r.reason })),
        listings: listings
          .map((l) => ({ guildId: l.guildId, name: nameOf(l.guildId), listed: !!l.listed, hidden: !!l.hidden, votes: v.get(l.guildId) || 0, clicks: c.get(l.guildId) || 0, featuredUntil: l.featuredUntil || null }))
          .sort((a, b) => (b.votes - a.votes) || (b.clicks - a.clicks)),
      });
    } catch (err) {
      console.error('[Dev] directory:', err.message);
      res.status(500).json({ error: 'Could not load the directory: ' + err.message });
    }
  });

  // ── RPM CyberCom given by hand ──────────────────────────────────────────
  // For the owner's own servers and for comps. The server sees it exactly as
  // if it had bought it: /setup says it is on and the AI dispatcher starts.
  router.get('/cybercom', devAuth, async (req, res) => {
    try {
      const { default: CyberComSubscription } = await import('../../models/CyberComSubscription.js');
      const { allHelpers, helperCount } = await import('../../cybercom/helpers.js');
      const subs = await CyberComSubscription.find({}).sort({ updatedAt: -1 }).lean();
      const ready = allHelpers();
      res.json({
        helpers: helperCount(),
        helpersReady: ready.length,
        servers: subs.map((s) => ({
          guildId: s.guildId,
          name: client?.guilds.cache.get(s.guildId)?.name || s.guildId,
          status: s.status,
          source: s.source || 'stripe',
          since: s.createdAt,
          helpersIn: ready.filter((h) => h.client.guilds.cache.has(s.guildId)).length,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Could not load CyberCom: ' + err.message });
    }
  });

  router.post('/cybercom/grant', devAuth, async (req, res) => {
    const { default: CyberComSubscription } = await import('../../models/CyberComSubscription.js');
    const { cyberComChanged, sendCyberComWelcome } = await import('../../cybercom/access.js');
    const gid = String((req.body && req.body.guildId) || '').trim();
    if (!/^\d{17,20}$/.test(gid)) return res.status(400).json({ error: 'That is not a server ID.' });
    const guild = client?.guilds.cache.get(gid);
    if (!guild) return res.status(400).json({ error: 'The bot is not in that server.' });
    const existing = await CyberComSubscription.findOne({ guildId: gid }).lean();
    if (existing && existing.source !== 'dev' && ['active', 'trialing', 'past_due', 'cancelling'].includes(existing.status)) {
      return res.status(409).json({ error: guild.name + ' already pays for RPM CyberCom.' });
    }
    await CyberComSubscription.findOneAndUpdate(
      { guildId: gid },
      {
        $set: { status: 'active', source: 'dev', purchasedBy: guild.ownerId || null, stripeSubscriptionId: null, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    await cyberComChanged(gid);
    if (!req.body || req.body.notify !== false) sendCyberComWelcome(client, guild.ownerId, guild.name).catch(() => {});
    console.log('[Dev] RPM CyberCom given to ' + guild.name + ' (' + gid + ')');
    res.json({ ok: true, name: guild.name });
  });

  router.post('/cybercom/:guildId/remove', devAuth, async (req, res) => {
    const { default: CyberComSubscription } = await import('../../models/CyberComSubscription.js');
    const { cyberComChanged } = await import('../../cybercom/access.js');
    const sub = await CyberComSubscription.findOne({ guildId: String(req.params.guildId) });
    if (!sub) return res.status(404).json({ error: 'That server has no CyberCom.' });
    if (sub.source !== 'dev') return res.status(409).json({ error: 'This server pays through Stripe. Cancel the subscription in Stripe instead.' });
    sub.status = 'cancelled';
    sub.updatedAt = new Date();
    await sub.save();
    await cyberComChanged(sub.guildId);
    res.json({ ok: true });
  });

  router.post('/directory/:guildId/hide', devAuth, async (req, res) => {
    const { default: DirectoryListing } = await import('../../models/DirectoryListing.js');
    const { invalidateDirectory } = await import('../../utils/directory.js');
    const hidden = !!(req.body && req.body.hidden);
    const reason = hidden ? String((req.body && req.body.reason) || '').slice(0, 200) || null : null;
    await DirectoryListing.updateOne({ guildId: String(req.params.guildId) }, { $set: { hidden, hiddenReason: reason } });
    invalidateDirectory();
    res.json({ ok: true });
  });

  router.post('/directory/reports/:id/resolve', devAuth, async (req, res) => {
    const { default: DirectoryReport } = await import('../../models/DirectoryReport.js');
    await DirectoryReport.updateOne({ _id: req.params.id }, { $set: { resolved: true } }).catch(() => {});
    res.json({ ok: true });
  });

  router.get('/funnel', devAuth, async (req, res) => {
    if (!client || !client.isReady()) {
      return res.status(503).json({ error: 'Bot is not connected to Discord' });
    }

    try {
      const [
        { default: PremiumKey },
        { default: GuildTrial },
        { default: DispatchConfig },
        { default: Priority },
        { default: AppyConfig },
      ] = await Promise.all([
        import('../../models/PremiumKey.js'),
        import('../../models/GuildTrial.js'),
        import('../../models/DispatchConfig.js'),
        import('../../models/Priority.js'),
        import('../../models/AppyConfig.js'),
      ]);

      const guildIds = [...client.guilds.cache.keys()];
      const now = new Date();

      const [keys, trials, dispatch, priority, appys] = await Promise.all([
        PremiumKey.find({ guildId: { $in: guildIds } }).lean(),
        GuildTrial.find({ guildId: { $in: guildIds } }).lean(),
        DispatchConfig.find({ guildId: { $in: guildIds } }).lean(),
        Priority.find({ guildId: { $in: guildIds } }).lean(),
        AppyConfig.find({ guildId: { $in: guildIds } }).lean(),
      ]);

      // Paying means the same thing here as it does to isPremiumGuild, so the
      // dashboard cannot disagree with what the bot actually enforces.
      const paying = new Set(
        keys
          .filter((k) => keyIsLive(k))
          .map((k) => k.guildId)
      );

      const trialById = new Map(trials.map((t) => [t.guildId, t]));
      const trialLive = new Set(
        trials.filter((t) => t.active && new Date(t.expiresAt) > now).map((t) => t.guildId)
      );

      // Configured, not merely enabled. Somebody who set a patrol channel and a
      // dispatch channel has done real work and meant it.
      const configured = new Map();
      const note = (guildId, what) => {
        if (!configured.has(guildId)) configured.set(guildId, []);
        configured.get(guildId).push(what);
      };
      for (const d of dispatch) {
        if (d.patrolChannelIds?.length || d.dispatchChannelId) note(d.guildId, 'dispatch');
      }
      for (const p of priority) if (p.enabled) note(p.guildId, 'priority');
      for (const a of appys) if (a.enabled) note(a.guildId, 'applications');

      const guilds = [...client.guilds.cache.values()];

      const rows = guilds.map((g) => {
        const trial = trialById.get(g.id);
        return {
          id: g.id,
          name: g.name,
          members: g.memberCount,
          paying: paying.has(g.id),
          trialState: !trial
            ? 'never'
            : (trialLive.has(g.id) ? 'active' : 'expired'),
          trialEndsAt: trial ? trial.expiresAt : null,
          configured: configured.get(g.id) || [],
        };
      });

      // The interesting group: set a premium feature up, never paid, and the
      // trial is not currently carrying them.
      const warmLeads = rows
        .filter((r) => !r.paying && r.configured.length && !trialLive.has(r.id))
        .sort((a, b) => b.members - a.members);

      const neverHeard = rows.filter(
        (r) => !r.paying && r.trialState === 'never' && !r.configured.length
      );

      const trialledAndLeft = rows.filter(
        (r) => !r.paying && r.trialState === 'expired'
      ).sort((a, b) => b.members - a.members);

      // The counted steps of the last 30 days, alongside the standing picture.
      const events = await funnelSummary(30).catch(() => null);
      // What AI dispatch costs to run this month, and who is using it.
      const aiUsage = await usageSummary().catch(() => null);
      if (aiUsage) {
        aiUsage.top = aiUsage.top.map((t) => ({ ...t, name: client.guilds.cache.get(t.guildId)?.name || t.guildId }));
      }

      res.json({
        events,
        aiUsage,
        servers: rows.length,
        paying: rows.filter((r) => r.paying).length,
        trialActive: rows.filter((r) => r.trialState === 'active').length,
        trialExpired: rows.filter((r) => r.trialState === 'expired').length,
        trialNever: rows.filter((r) => r.trialState === 'never').length,

        // How many who tried it went on to pay. This is the number to move.
        trialConversion: (() => {
          const finished = rows.filter((r) => r.trialState === 'expired' || r.paying && trialById.has(r.id));
          const converted = finished.filter((r) => r.paying).length;
          return finished.length ? Math.round((converted / finished.length) * 100) : null;
        })(),

        warmLeads: warmLeads.slice(0, 40),
        warmLeadCount: warmLeads.length,
        trialledAndLeft: trialledAndLeft.slice(0, 40),
        neverHeardCount: neverHeard.length,
      });
    } catch (err) {
      console.error('[Dev] funnel:', err.message);
      res.status(500).json({ error: 'Could not build the funnel: ' + err.message });
    }
  });

  router.post('/broadcast', devAuth, async (req, res) => {
    const { message, guildIds } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (message.trim().length > 1500) return res.status(400).json({ error: 'Message too long (max 1500 chars)' });
    if (!client || !client.isReady()) return res.status(503).json({ error: 'Bot is not connected to Discord' });

    let guilds = [...client.guilds.cache.values()];
    if (Array.isArray(guildIds) && guildIds.length > 0) {
      const idSet = new Set(guildIds);
      guilds = guilds.filter(g => idSet.has(g.id));
    }

    let sent = 0, failed = 0;
    const errors = [];

    for (const guild of guilds) {
      try {
        const owner = await guild.fetchOwner();
        await owner.send(message.trim());
        sent++;
      } catch (err) {
        failed++;
        errors.push({ guild: guild.name, reason: err.message });
      }
      // Rate limit: 1 DM per second to avoid Discord spam detection
      await new Promise(r => setTimeout(r, 1000));
    }

    res.json({ total: guilds.length, sent, failed, errors });
  });

  router.get('/maintenance', devAuth, (req, res) => {
    res.json(getMaintenanceStatus());
  });

  router.post('/maintenance', devAuth, (req, res) => {
    const { active } = req.body;
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be boolean' });
    setMaintenanceMode(active);
    res.json(getMaintenanceStatus());
  });

  router.post('/grant-vote', devAuth, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    try {
      await recordVote(userId);
      res.json({ ok: true, message: `Vote credit granted to ${userId}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/verified/:guildId', devAuth, async (req, res) => {
    try {
      const { guildId } = req.params;
      const users = await VerifiedUser.find({ guildId }).sort({ verifiedAt: -1 }).lean();
      // Enrich with Discord display name if bot is available
      const guild = client?.guilds?.cache?.get(guildId);
      const enriched = await Promise.all(users.map(async (u) => {
        let discordName = null;
        if (guild) {
          const member = guild.members.cache.get(u.userId) ||
            await guild.members.fetch(u.userId).catch(() => null);
          discordName = member?.displayName || member?.user?.username || null;
        }
        return {
          userId: u.userId,
          discordName,
          psnxbox: u.psnxbox || null,
          ipAddress: u.ipAddress || null,
          verifiedAt: u.verifiedAt,
        };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/verified/:guildId/:userId', devAuth, async (req, res) => {
    try {
      const { guildId, userId } = req.params;
      const result = await VerifiedUser.deleteOne({ guildId, userId });
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Record not found' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/features/:feature', devAuth, async (req, res) => {
    const { feature } = req.params;
    const { premium } = req.body;
    const valid = ALL_FEATURES.find(f => f.feature === feature);
    if (!valid) return res.status(404).json({ error: 'Unknown feature' });
    if (typeof premium !== 'boolean') return res.status(400).json({ error: 'premium must be boolean' });
    try {
      const flag = await FeatureFlag.findOneAndUpdate(
        { feature },
        { premium, label: valid.label },
        { upsert: true, new: true }
      );
      clearFeatureFlagCache(feature);
      res.json({ ok: true, feature: flag.feature, premium: flag.premium });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update feature flag' });
    }
  });

  return router;
}
