import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import axios from 'axios';

/**
 * Discord login for the web CAD.
 *
 * Deliberately separate from the dashboard login (which stores a raw Discord
 * token in localStorage) and from the old portal login (which requested only the
 * `identify` scope and so could never list a user's servers).
 *
 * The CAD needs `guilds` to build its server picker, and it is served from the
 * same origin as the API, so an httpOnly signed cookie is both possible and
 * better than a token the page's own JavaScript can read.
 */

const COOKIE = 'cad_session';
const STATE_COOKIE = 'cad_oauth_state';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_MS = 10 * 60 * 1000;

/**
 * The old portal fell back to a hardcoded literal when no secret was set, which
 * makes every session forgeable by anyone who has read the source. Fail closed
 * instead - an unsigned session is worse than no login.
 */
function secret() {
  const s = process.env.CAD_SECRET || process.env.PORTAL_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!s) throw new Error('No CAD_SECRET / PORTAL_SECRET / DISCORD_CLIENT_SECRET set - refusing to sign sessions');
  return s;
}

export function createCadSession(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyCadSession(token) {
  if (!token || typeof token !== 'string') return null;
  const cut = token.lastIndexOf('.');
  if (cut < 1) return null;

  const payload = token.slice(0, cut);
  const sig = token.slice(cut + 1);

  let expected;
  try {
    expected = createHmac('sha256', secret()).update(payload).digest('hex');
  } catch {
    return null;
  }

  // Constant-time compare so a forged cookie cannot be tuned byte by byte.
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** The origin this request arrived on, so one deployment can serve several hosts. */
function originOf(req) {
  const host = process.env.CAD_DOMAIN || req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto = local ? 'http' : (req.headers['x-forwarded-proto'] || 'https');
  return `${proto}://${host}`;
}

/**
 * Where the CAD lives on the host this request arrived on.
 *
 * On its own subdomain the CAD is the root; on the raw Koyeb URL, where the
 * marketing page owns the root, it is /cad. Redirects have to agree with
 * whichever one served the page or the user bounces between them.
 */
function home(req) {
  const domain = process.env.CAD_DOMAIN;
  if (!domain) return '/cad';
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  return host.toLowerCase() === domain.toLowerCase() ? '/' : '/cad';
}

function cookieOpts(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return { httpOnly: true, secure: !local, sameSite: 'lax', path: '/' };
}

/** Rejects the request unless it carries a valid CAD session. */
export function cadAuth(req, res, next) {
  const session = verifyCadSession(req.cookies?.[COOKIE]);
  if (!session) {
    res.clearCookie(COOKIE, { path: '/' });
    return res.status(401).json({ error: 'not_authenticated' });
  }
  req.cadUser = session;
  next();
}

export function createCadAuthRouter() {
  const router = Router();

  router.get('/login', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) return res.status(500).send('DISCORD_CLIENT_ID is not configured');

    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, { ...cookieOpts(req), maxAge: STATE_MS });

    // `guilds` is the whole point - without it there is no way to know which
    // servers the user is in, and therefore no server picker.
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${originOf(req)}/cad/callback`,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const expected = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (!code) return res.redirect(home(req) + '?error=no_code');
    if (!state || !expected || state !== expected) return res.redirect(home(req) + '?error=bad_state');

    try {
      const redirectUri = `${originOf(req)}/cad/callback`;
      const tokenRes = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );

      const accessToken = tokenRes.data.access_token;
      const me = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });

      // The access token rides in the signed httpOnly cookie so /servers can ask
      // Discord which guilds this user is in. It is never exposed to page JS.
      const session = createCadSession({
        userId: me.data.id,
        username: me.data.global_name || me.data.username,
        avatar: me.data.avatar,
        accessToken,
      });

      res.cookie(COOKIE, session, { ...cookieOpts(req), maxAge: SESSION_MS });
      res.redirect(home(req));
    } catch (err) {
      console.error('[CAD Auth] callback failed:', err.response?.data || err.message);
      res.redirect(home(req) + '?error=auth_failed');
    }
  });

  router.get('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.redirect(home(req));
  });

  return router;
}

export { COOKIE as CAD_COOKIE };
