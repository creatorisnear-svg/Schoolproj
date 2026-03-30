import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';

function getToken(req) {
  return req.cookies?.dash_token || null;
}

async function getDiscordUser(token) {
  const res = await axios.get('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

function isDevUser(userId) {
  const devIds = (process.env.DEV_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return devIds.includes(userId);
}

async function devAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.redirect('/dashboard/login');
  try {
    const user = await getDiscordUser(token);
    if (!isDevUser(user.id)) return res.status(403).send('Access denied.');
    req.devUser = user;
    next();
  } catch {
    res.redirect('/dashboard/login');
  }
}

export function createDevRouter() {
  const router = Router();

  router.get('/', devAuth, (req, res) => {
    res.send(readFileSync(resolve('src/website/views/devpanel.html'), 'utf8'));
  });

  router.get('/check', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.json({ authorized: false });
    try {
      const user = await getDiscordUser(token);
      res.json({ authorized: isDevUser(user.id), user: { id: user.id, username: user.username, avatar: user.avatar } });
    } catch {
      res.json({ authorized: false });
    }
  });

  router.get('/announcements', devAuth, async (req, res) => {
    const items = await Announcement.find().sort({ createdAt: -1 });
    res.json(items);
  });

  router.post('/announcements', devAuth, async (req, res) => {
    const { title, content, type } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const item = await Announcement.create({ title, content, type, createdBy: req.devUser.username });
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
    const item = await Changelog.create({ version, title, changes, createdBy: req.devUser.username });
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
    const item = await PreviewVideo.create({ title, description, videoUrl, order: order || 0, createdBy: req.devUser.username });
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
