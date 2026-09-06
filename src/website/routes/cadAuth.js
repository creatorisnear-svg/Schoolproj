import { randomBytes, timingSafeEqual } from 'crypto';
import axios from 'axios';

/**
 * Authentication for the web CAD.
 *
 * The CAD page is served from roleplaymanager.xyz (Cloudflare Pages) while this
 * API runs on Koyeb, so the two are cross-site. A session cookie cannot bridge
 * that: it would be a third-party cookie, which Safari blocks outright and
 * Chrome is phasing out. So the CAD carries a Discord access token in an
 * Authorization header, exactly as the dashboard already does.
 *
 * That also means no new OAuth redirect URI has to be registered - the CAD signs
 * in through the same /auth/site/callback the dashboard uses, which is already
 * registered and already requests the `guilds` scope the server picker needs.
 *
 * The trade-off, taken deliberately: the token lives in localStorage where page
 * JavaScript can read it, rather than in an httpOnly cookie. Every value the CAD
 * renders is escaped and the API sets a CSP, but this is the reason that
 * escaping is not optional.
 */

const IDENTITY_TTL = 5 * 60 * 1000;
const TICKET_TTL = 60 * 1000;

/** token -> { user, exp }. Avoids a Discord round trip on every request. */
const identityCache = new Map();

/** ticket -> { userId, username, guildId, exp }. Single use. */
const streamTickets = new Map();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of identityCache) if (v.exp < now) identityCache.delete(k);
  for (const [k, v] of streamTickets) if (v.exp < now) streamTickets.delete(k);
}, 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();

function bearer(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return null;
}

/** Resolves a Discord access token to the account it belongs to. */
async function identify(token) {
  const cached = identityCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;

  const res = await axios.get('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  const user = {
    userId: res.data.id,
    username: res.data.global_name || res.data.username,
    avatar: res.data.avatar,
    accessToken: token,
  };
  identityCache.set(token, { user, exp: Date.now() + IDENTITY_TTL });
  return user;
}

/** Drops a token's cached identity, e.g. once Discord has rejected it. */
export function forgetToken(token) {
  if (token) identityCache.delete(token);
}

/**
 * Issues a one-shot ticket for the event stream.
 *
 * EventSource cannot send an Authorization header, and putting the access token
 * in the query string would write a real credential into every access log. A
 * ticket is not a credential: it is single use, expires in a minute, and opens
 * nothing but a read-only stream for one guild.
 */
export function issueStreamTicket(user, guildId) {
  const ticket = randomBytes(24).toString('base64url');
  streamTickets.set(ticket, {
    userId: user.userId,
    username: user.username,
    guildId,
    exp: Date.now() + TICKET_TTL,
  });
  return ticket;
}

function redeemStreamTicket(ticket, guildId) {
  if (!ticket || typeof ticket !== 'string') return null;

  const entry = streamTickets.get(ticket);
  if (!entry) return null;
  streamTickets.delete(ticket);          // single use, redeemed or not

  if (entry.exp < Date.now()) return null;

  // Constant-time compare of the guild so a ticket for one server cannot be
  // replayed against another.
  const a = Buffer.from(String(entry.guildId));
  const b = Buffer.from(String(guildId));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { userId: entry.userId, username: entry.username, avatar: null, accessToken: null };
}

/**
 * Accepts a stream ticket in place of a bearer token, for the SSE route only.
 * Runs before cadAuth, which then sees an already-authenticated request.
 */
export function cadStreamAuth(req, res, next) {
  if (req.cadUser) return next();

  const user = redeemStreamTicket(req.query?.ticket, req.params?.guildId);
  if (!user) return next();

  req.cadUser = user;
  next();
}

/** Rejects the request unless it carries a usable Discord token. */
export async function cadAuth(req, res, next) {
  if (req.cadUser) return next();

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  try {
    req.cadUser = await identify(token);
    next();
  } catch (err) {
    if (err.response?.status === 401) {
      forgetToken(token);
      return res.status(401).json({ error: 'not_authenticated' });
    }
    // Discord being unreachable is not the caller's fault, and answering 401
    // would sign everyone out during an outage.
    console.error('[CAD Auth] could not verify token:', err.message);
    res.status(503).json({ error: 'discord_unavailable' });
  }
}

/** Test seam: lets a test inject an identity without calling Discord. */
export function __seedIdentity(token, user) {
  identityCache.set(token, { user: { ...user, accessToken: token }, exp: Date.now() + IDENTITY_TTL });
}
