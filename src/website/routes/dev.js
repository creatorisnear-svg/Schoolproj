import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';

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

export function createDevRouter() {
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
    const items = await PreviewVideo.find().sort({ order: 1, createdAt: -1 });
    res.json(items);
  });

  router.post('/videos', devAuth, async (req, res) => {
    const { title, description, videoUrl, order } = req.body;
    if (!title || !videoUrl) return res.status(400).json({ error: 'Title and video URL required' });
    const item = await PreviewVideo.create({ title, description, videoUrl, order: order || 0 });
    res.json(item);
  });

  router.patch('/videos/:id', devAuth, async (req, res) => {
    const item = await PreviewVideo.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  router.delete('/videos/:id', devAuth, async (req, res) => {
    await PreviewVideo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
