import axios from 'axios';

/**
 * Tells the bot lists how many servers the bot is in.
 *
 * Top.gg showed 12 servers when the real number was over 120, because nothing
 * ever reported it, and the count is one of the first things a server owner
 * looks at when picking a bot. Each list only runs when its token is set in
 * the environment: TOPGG_TOKEN (top.gg, Webhooks and API page) and DBL_TOKEN
 * (discordbotlist.com).
 */

const EVERY_MS = 30 * 60 * 1000;

async function post(client) {
  const id = client.user?.id;
  if (!id) return;
  const servers = client.guilds.cache.size;
  const users = client.guilds.cache.reduce((n, g) => n + (g.memberCount || 0), 0);

  if (process.env.TOPGG_TOKEN) {
    await axios.post(`https://top.gg/api/bots/${id}/stats`, { server_count: servers }, {
      headers: { Authorization: process.env.TOPGG_TOKEN }, timeout: 15000,
    }).then(() => console.log('[Bot lists] Top.gg: ' + servers + ' servers'))
      .catch((err) => console.warn('[Bot lists] Top.gg stats failed:', err.response?.status || err.message));
  }
  if (process.env.DBL_TOKEN) {
    await axios.post(`https://discordbotlist.com/api/v1/bots/${id}/stats`, { guilds: servers, users }, {
      headers: { Authorization: process.env.DBL_TOKEN }, timeout: 15000,
    }).then(() => console.log('[Bot lists] discordbotlist.com: ' + servers + ' servers'))
      .catch((err) => console.warn('[Bot lists] discordbotlist.com stats failed:', err.response?.status || err.message));
  }
}

export function startBotListStats(client) {
  if (!process.env.TOPGG_TOKEN && !process.env.DBL_TOKEN) {
    console.log('[Bot lists] No TOPGG_TOKEN or DBL_TOKEN set; server counts are not being posted.');
    return;
  }
  setTimeout(() => post(client).catch(() => {}), 60 * 1000).unref();
  setInterval(() => post(client).catch(() => {}), EVERY_MS).unref();
}
