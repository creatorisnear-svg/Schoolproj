import { Router } from 'express';
import { PermissionsBitField } from 'discord.js';
import axios from 'axios';
import { cadAuth, cadStreamAuth, issueStreamTicket } from './cadAuth.js';
import { isPremiumGuild, getGuildLimits } from '../../utils/premiumCheck.js';
import CADConfig from '../../models/CADConfig.js';
import RoleplayCommands from '../../models/RoleplayCommands.js';
import DispatchConfig from '../../models/DispatchConfig.js';
import { isStaff as isStaffMember } from '../../utils/permissions.js';
import { createCivilianRouter } from './cad/civilian.js';
import { createLeoRouter } from './cad/leo.js';
import { eventsHandler } from './cad/events.js';

/**
 * Web CAD API.
 *
 * Multi-tenant by construction: every data route lives under /:guildId and goes
 * through resolveGuild, which proves the caller is a member of that specific
 * server before any handler runs. The previous portal resolved its guild from
 * a single PORTAL_GUILD_ID environment variable, so it could only ever serve
 * one server and had no membership boundary to get wrong.
 *
 * Data lives in the same collections the Discord commands use. That is the
 * integration: a character created here is the record /leodatabase finds, and a
 * 911 raised here is the row the AI dispatch poller reads before speaking.
 */

const GUILD_CACHE_MS = 60 * 1000;
const MEMBER_CACHE_MS = 5 * 60 * 1000;

/** Cached per user+guild, because roles are re-resolved on every single request. */
const memberCache = new Map();
/** Cached per user, because Discord rate-limits /users/@me/guilds hard. */
const guildListCache = new Map();

function cacheGet(map, key, ttl) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.value;
  if (hit) map.delete(key);
  return null;
}

function cacheSet(map, key, value) {
  map.set(key, { value, ts: Date.now() });
  // Bounded so a busy instance cannot grow these without limit.
  if (map.size > 5000) {
    const oldest = [...map.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 1000);
    for (const [k] of oldest) map.delete(k);
  }
}

export function clearCadCaches(userId) {
  if (!userId) { memberCache.clear(); guildListCache.clear(); return; }
  guildListCache.delete(userId);
  for (const key of memberCache.keys()) {
    if (key.startsWith(`${userId}:`)) memberCache.delete(key);
  }
}

/** The guilds this user belongs to, per Discord. */
async function fetchUserGuilds(session) {
  const cached = cacheGet(guildListCache, session.userId, GUILD_CACHE_MS);
  if (cached) return cached;

  const res = await axios.get('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    timeout: 10000,
  });
  cacheSet(guildListCache, session.userId, res.data);
  return res.data;
}

/**
 * Is this guild set up for the CAD?
 *
 * There is no single flag. Civilian access needs RoleplayCommands.enabled; LEO
 * access additionally needs CADConfig.leoRoleIds to be non-empty. CADConfig.enabled
 * exists but nothing in the codebase ever reads it, so it is not used here.
 */
function cadTier(rp, cad) {
  if (!rp?.enabled) return null;
  const hasLeo = Array.isArray(cad?.leoRoleIds) && cad.leoRoleIds.length > 0;
  return { civilian: true, leoConfigured: hasLeo };
}

function roleIdsOf(member) {
  return Array.from(member.roles.cache.keys());
}

export function createCadApiRouter(client) {
  const router = Router();

  // The only route that may authenticate with a ticket rather than a token.
  router.get('/:guildId/events', cadStreamAuth, cadAuth, resolveGuild(client), eventsHandler);

  router.use(cadAuth);

  // ── Who am I ───────────────────────────────────────────────────────────────
  router.get('/me', (req, res) => {
    const { userId, username, avatar } = req.cadUser;
    res.json({ user: { id: userId, username, avatar } });
  });

  // ── Server picker ──────────────────────────────────────────────────────────
  // Every guild where the user is a member AND the bot is present AND the CAD is
  // configured. Note there is no admin filter - the dashboard's equivalent route
  // requires the ADMINISTRATOR bit, but the CAD is for ordinary members.
  router.get('/servers', async (req, res) => {
    let userGuilds;
    try {
      userGuilds = await fetchUserGuilds(req.cadUser);
    } catch (err) {
      if (err.response?.status === 401) {
        return res.status(401).json({ error: 'discord_token_expired' });
      }
      console.error('[CAD] server list failed:', err.message);
      return res.status(502).json({ error: 'discord_unavailable' });
    }

    const shared = userGuilds.filter((g) => client.guilds.cache.has(g.id));
    if (!shared.length) return res.json({ servers: [] });

    const ids = shared.map((g) => g.id);
    const [rps, cads, dispatches] = await Promise.all([
      RoleplayCommands.find({ guildId: { $in: ids } }).lean(),
      CADConfig.find({ guildId: { $in: ids } }).lean(),
      DispatchConfig.find({ guildId: { $in: ids } }).lean(),
    ]);
    const byGuild = (rows) => new Map(rows.map((r) => [r.guildId, r]));
    const rpMap = byGuild(rps);
    const cadMap = byGuild(cads);
    const dispatchMap = byGuild(dispatches);

    const servers = [];
    for (const g of shared) {
      const tier = cadTier(rpMap.get(g.id), cadMap.get(g.id));
      if (!tier) continue;

      const botGuild = client.guilds.cache.get(g.id);
      const dispatch = dispatchMap.get(g.id);
      // Premium drives the badge, and whether AI voice dispatch will react to a
      // 911 raised from here. The CAD itself is free on every server.
      const premium = await isPremiumGuild(g.id).catch(() => false);

      servers.push({
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount: botGuild?.memberCount || 0,
        premium,
        leoConfigured: tier.leoConfigured,
        hasDispatch: !!(premium && dispatch?.enabled),
      });
    }

    servers.sort((a, b) => Number(b.premium) - Number(a.premium) || a.name.localeCompare(b.name));
    res.json({ servers });
  });

  // ── Tenancy boundary ───────────────────────────────────────────────────────
  // Everything below is scoped to one guild and proves membership first.
  router.use('/:guildId', resolveGuild(client));

  router.get('/:guildId/context', async (req, res) => {
    // getGuildLimits returns Infinity for premium, which JSON.stringify turns
    // into null - the front end would read that as "no allowance" and hide
    // things a paying server has paid for. Send null explicitly and label it.
    const raw = await getGuildLimits(req.guildId).catch(() => null);
    const limits = raw
      ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === Infinity ? null : v]))
      : null;
    res.json({
      guild: { id: req.guildId, name: req.guild.name, icon: req.guild.icon },
      member: {
        id: req.cadUser.userId,
        displayName: req.cadMember.displayName,
        isLeo: req.cadMember.isLeo,
        isFd: req.cadMember.isFd,
        isStaff: req.cadMember.isStaff,
      },
      premium: req.cadContext.premium,
      hasDispatch: req.cadContext.hasDispatch,
      limits,
    });
  });

  // Live updates. Sits above the route groups so it is not caught by any of them.
  //
  // EventSource cannot send an Authorization header, so the browser asks for a
  // one-shot ticket first and puts that in the query string instead. cadStreamAuth
  // redeems it before cadAuth runs; a request with neither still gets a 401.
  router.get('/:guildId/events/ticket', resolveGuild(client), (req, res) => {
    res.json({ ticket: issueStreamTicket(req.cadUser, req.guildId) });
  });

  // LEO is mounted first: the civilian router is mounted on the bare guild prefix,
  // so it would otherwise see /leo/* paths and have to fall through for each one.
  router.use('/:guildId/leo', requireLeo, createLeoRouter(client));
  router.use('/:guildId', createCivilianRouter(client));

  // Express 5 forwards a rejected async handler here. Without this the app's
  // default handler answers with an HTML error page, which the CAD would try to
  // parse as JSON and report as an unrelated parse failure.
  router.use((err, req, res, _next) => {
    console.error('[CAD API]', req.method, req.originalUrl, '-', err.message);
    if (res.headersSent) return;
    res.status(500).json({ error: 'server_error', message: 'Something went wrong on our end.' });
  });

  return router;
}

/**
 * Proves the caller may act on :guildId, and hydrates everything downstream
 * handlers need. Enforced once here rather than repeated in every route.
 */
export function resolveGuild(client) {
  return async (req, res, next) => {
    const { guildId } = req.params;
    if (!/^\d{5,25}$/.test(guildId || '')) {
      return res.status(400).json({ error: 'bad_guild_id' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'bot_not_in_server' });

    const userId = req.cadUser.userId;
    const cacheKey = `${userId}:${guildId}`;
    let member = cacheGet(memberCache, cacheKey, MEMBER_CACHE_MS);

    if (!member) {
      let fetched;
      try {
        fetched = await guild.members.fetch(userId);
      } catch (err) {
        // A 10007 (Unknown Member) is a real answer: not a member. Anything else
        // is Discord being unreachable, and must not read as "not a member" or a
        // blip would lock every user out of their own server.
        if (err?.code === 10007) return res.status(403).json({ error: 'not_a_member' });
        console.error(`[CAD] member fetch failed for ${userId} in ${guildId}:`, err.message);
        return res.status(503).json({ error: 'discord_unavailable' });
      }

      const [cadConfig, rpConfig] = await Promise.all([
        CADConfig.findOne({ guildId }).lean(),
        RoleplayCommands.findOne({ guildId }).lean(),
      ]);

      const tier = cadTier(rpConfig, cadConfig);
      if (!tier) return res.status(404).json({ error: 'cad_not_configured' });

      const roleIds = roleIdsOf(fetched);
      const hasAny = (list) => Array.isArray(list) && list.some((id) => roleIds.includes(id));

      // Matches Discord's checkStaffPermission (administrator, or a Staff row for
      // the user or one of their roles), plus CADConfig.staffRoleIds - the roles
      // the owner picked under "Set Staff Roles" in CAD setup. Discord's
      // /leodatabase currently ignores that field; the CAD honours it.
      const isStaff = fetched.permissions.has(PermissionsBitField.Flags.Administrator)
        || hasAny(cadConfig?.staffRoleIds)
        || await isStaffMember(userId, guildId, roleIds);

      member = {
        displayName: fetched.displayName,
        roleIds,
        isLeo: hasAny(cadConfig?.leoRoleIds) || isStaff,
        isFd: hasAny(cadConfig?.fireDepartmentRoleIds),
        isStaff,
        cadConfig,
        rpConfig,
      };
      cacheSet(memberCache, cacheKey, member);
    }

    const [premium, dispatch] = await Promise.all([
      isPremiumGuild(guildId).catch(() => false),
      DispatchConfig.findOne({ guildId }).lean().catch(() => null),
    ]);

    req.guildId = guildId;
    req.guild = guild;
    req.cadMember = member;
    req.cadContext = {
      premium,
      dispatch,
      hasDispatch: !!(premium && dispatch?.enabled),
      cadConfig: member.cadConfig,
      rpConfig: member.rpConfig,
    };
    next();
  };
}

/** Gate for law-enforcement routes. */
export function requireLeo(req, res, next) {
  if (!req.cadMember?.isLeo) return res.status(403).json({ error: 'leo_only' });
  next();
}

/** Gate for staff routes. */
export function requireStaff(req, res, next) {
  if (!req.cadMember?.isStaff) return res.status(403).json({ error: 'staff_only' });
  next();
}
