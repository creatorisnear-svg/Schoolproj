import axios from 'axios';

/**
 * Who is signed in on roleplaymanager.xyz, from the site's Discord token.
 *
 * The website keeps one Discord sign-in (localStorage dash_token) shared by
 * the dashboard, the pricing page and the server directory. Anything that
 * needs to know who is asking, and which servers they are in, asks here.
 * Cached briefly, since a page usually asks more than once in a row.
 */

const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of cache) if (entry.exp < now) cache.delete(token);
}, 30 * 60 * 1000).unref();

export function bearerToken(req) {
  const auth = req.headers?.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function identifyWithDiscord(token) {
  const cached = cache.get(token);
  if (cached && cached.exp > Date.now()) return cached.data;

  const headers = { Authorization: `Bearer ${token}` };
  const [me, guilds] = await Promise.all([
    axios.get('https://discord.com/api/users/@me', { headers }),
    axios.get('https://discord.com/api/users/@me/guilds', { headers }),
  ]);
  const data = {
    id: me.data.id,
    username: me.data.username,
    avatar: me.data.avatar || null,
    guilds: (guilds.data || []).map((g) => ({
      id: g.id,
      name: g.name,
      admin: (BigInt(g.permissions || 0) & BigInt(0x8)) === BigInt(0x8),
    })),
  };
  cache.set(token, { data, exp: Date.now() + TTL_MS });
  return data;
}

/** When a Discord account was made, from its id. */
export function accountCreatedAt(userId) {
  try {
    return new Date(Number(BigInt(userId) >> 22n) + 1420070400000);
  } catch {
    return new Date();
  }
}
