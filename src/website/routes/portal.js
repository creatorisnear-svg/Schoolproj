import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';

const SESSION_COOKIE = 'portal_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.PORTAL_SECRET || process.env.DISCORD_CLIENT_SECRET || 'rpm-portal-secret';
}

export function createPortalSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyPortalSession(token) {
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

function isLocal(domain) {
  return domain.startsWith('localhost') || domain.startsWith('127.');
}

function getPortalDomain() {
  const d = (process.env.PORTAL_DOMAIN || process.env.REPLIT_DEV_DOMAIN || process.env.DOMAIN || 'localhost:5000')
    .toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
  return d;
}

export function portalAuth(client) {
  return async (req, res, next) => {
    const session = verifyPortalSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) {
      if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api/portal')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/portal');
    }

    const guildId = process.env.PORTAL_GUILD_ID;
    if (guildId && client) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        try {
          const member = await guild.members.fetch(session.userId);
          req.portalUser = {
            ...session,
            displayName: member.displayName,
            roles: Array.from(member.roles.cache.values())
              .filter(r => r.id !== guild.id)
              .map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
          };
        } catch {
          res.clearCookie(SESSION_COOKIE);
          if (req.originalUrl.startsWith('/api/portal')) {
            return res.status(401).json({ error: 'not_member' });
          }
          return res.redirect('/portal?error=not_member');
        }
      } else {
        req.portalUser = session;
      }
    } else {
      req.portalUser = session;
    }

    next();
  };
}

export function createPortalRouter(client) {
  const router = Router();

  router.get('/', (req, res) => {
    res.send(readFileSync(resolve('src/website/views/portal.html'), 'utf8'));
  });

  router.get('/auth', (req, res) => {
    const domain = getPortalDomain();
    const proto = isLocal(domain) ? 'http' : 'https';
    const redirectUri = encodeURIComponent(`${proto}://${domain}/portal/callback`);
    const state = randomBytes(16).toString('hex');
    const local = isLocal(domain);

    res.cookie('portal_oauth_state', state, {
      httpOnly: true, secure: !local, sameSite: 'lax', maxAge: 10 * 60 * 1000,
    });

    res.redirect(
      `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`
    );
  });

  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies?.portal_oauth_state;

    if (!code || !state || state !== storedState) {
      return res.redirect('/portal?error=invalid_state');
    }
    res.clearCookie('portal_oauth_state');

    try {
      const domain = getPortalDomain();
      const proto = isLocal(domain) ? 'http' : 'https';
      const redirectUri = `${proto}://${domain}/portal/callback`;

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
      if (guildId && client) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.redirect('/portal?error=bot_not_in_server');
        try {
          await guild.members.fetch(userId);
        } catch {
          return res.redirect('/portal?error=not_member');
        }
      }

      const session = createPortalSession({ userId, username: global_name || username, avatar });
      const local = isLocal(domain);
      res.cookie(SESSION_COOKIE, session, {
        httpOnly: true, secure: !local, sameSite: 'lax', maxAge: SESSION_MS,
      });
      res.redirect('/portal');
    } catch (err) {
      console.error('[PORTAL AUTH]', err.response?.data || err.message);
      res.redirect('/portal?error=auth_failed');
    }
  });

  router.get('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/portal');
  });

  return router;
}
