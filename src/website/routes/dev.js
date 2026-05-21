import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import multer from 'multer';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';
import FeatureFlag from '../../models/FeatureFlag.js';
import { clearFeatureFlagCache } from '../../utils/premiumCheck.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  },
});

const ALL_FEATURES = [
  { feature: 'roleplay', label: 'Roleplay Commands' },
  { feature: 'priority', label: 'Priority Tracker' },
  { feature: 'strike', label: 'Strike System' },
  { feature: 'calendar', label: 'RP Calendar' },
  { feature: 'ticket', label: 'Ticket Support' },
  { feature: 'antipromote', label: 'Anti-Promoting' },
  { feature: 'rolerequest', label: 'Role Request' },
  { feature: 'verification', label: 'Verification' },
  { feature: 'welcome', label: 'Welcome System' },
  { feature: 'dispatch', label: 'AI Voice Dispatch' },
];

const DEV_PASSWORD = process.env.DEV_PASSWORD || '67678967';
const sessions = new Set();

function devAuth(req, res, next) {
  const token = req.cookies?.dev_session;
  if (token && sessions.has(token)) return next();

  const auth = req.headers.authorization;
  if (auth && auth === `Bearer ${DEV_PASSWORD}`) return next();

  if (req.method === 'GET' && !req.headers.authorization) return res.redirect('/dev/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

export function createDevRouter(client) {
  const router = Router();

  router.get('/login', (req, res) => {
    const error = req.query.error ? '<div style="color:#ef4444;font-size:13px;margin-bottom:12px;">Incorrect password.</div>' : '';
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dev Login — RolePlayManager</title>
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

  router.post('/auth', (req, res) => {
    const { password } = req.body;
    if (password !== DEV_PASSWORD) return res.redirect('/dev/login?error=1');
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
    res.json(item);
  });

  router.patch('/changelogs/:id', devAuth, async (req, res) => {
    const item = await Changelog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
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
        premium: flagMap[f.feature] ?? (f.feature === 'dispatch'),
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch feature flags' });
    }
  });

  router.post('/broadcast', devAuth, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (!client || !client.isReady()) return res.status(503).json({ error: 'Bot is not connected to Discord' });

    const guilds = [...client.guilds.cache.values()];
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
    }

    res.json({ total: guilds.length, sent, failed, errors });
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
