import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSION_COOKIE = 'portal_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.PORTAL_SECRET || process.env.DISCORD_CLIENT_SECRET || 'rpm-portal-secret';
}

export function createSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(payload).digest('hex');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function getDomain() {
  return (process.env.PORTAL_DOMAIN || 'localhost:5000')
    .toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
}

function isLocal(domain) {
  return domain.startsWith('localhost') || domain.startsWith('127.');
}

export async function fetchGuildMember(userId) {
  const guildId = process.env.PORTAL_GUILD_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!guildId || !token) return null;
  const res = await axios.get(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    { headers: { Authorization: `Bot ${token}` } }
  );
  return res.data;
}

export function portalAuth(req, res, next) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/');
  }
  req.portalUser = session;
  next();
}

export function createAuthRouter() {
  const router = Router();

  router.get('/auth/login', (req, res) => {
    const domain = getDomain();
    const local = isLocal(domain);
    const proto = local ? 'http' : 'https';
    const redirectUri = encodeURIComponent(`${proto}://${domain}/auth/callback`);
    const state = randomBytes(16).toString('hex');

    res.cookie('portal_oauth_state', state, {
      httpOnly: true, secure: !local, sameSite: 'lax', maxAge: 10 * 60 * 1000,
    });

    res.redirect(
      `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`
    );
  });

  router.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies?.portal_oauth_state;

    if (!code || !state || state !== storedState) {
      return res.redirect('/?error=invalid_state');
    }
    res.clearCookie('portal_oauth_state');

    try {
      const domain = getDomain();
      const local = isLocal(domain);
      const proto = local ? 'http' : 'https';
      const redirectUri = `${proto}://${domain}/auth/callback`;

      const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token } = tokenRes.data;

      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const { id: userId, username, avatar, global_name } = userRes.data;

      const guildId = process.env.PORTAL_GUILD_ID;
      if (guildId) {
        try {
          const member = await fetchGuildMember(userId);
          if (!member) throw new Error('not_member');

          const session = createSession({
            userId,
            username: global_name || username,
            avatar,
            roles: member.roles || [],
            displayName: member.nick || global_name || username,
          });

          const local2 = isLocal(getDomain());
          res.cookie(SESSION_COOKIE, session, {
            httpOnly: true, secure: !local2, sameSite: 'lax', maxAge: SESSION_MS,
          });
          return res.redirect('/');
        } catch (memberErr) {
          if (memberErr.response?.status === 404 || memberErr.message === 'not_member') {
            return res.redirect('/?error=not_member');
          }
          throw memberErr;
        }
      }

      const session = createSession({ userId, username: global_name || username, avatar, roles: [], displayName: global_name || username });
      res.cookie(SESSION_COOKIE, session, {
        httpOnly: true, secure: !isLocal(getDomain()), sameSite: 'lax', maxAge: SESSION_MS,
      });
      res.redirect('/');
    } catch (err) {
      console.error('[PORTAL AUTH]', err.response?.data || err.message);
      res.redirect('/?error=auth_failed');
    }
  });

  router.get('/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/');
  });

  return router;
}
