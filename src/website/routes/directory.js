import { Router } from 'express';
import DirectoryListing from '../../models/DirectoryListing.js';
import DirectoryVote from '../../models/DirectoryVote.js';
import DirectoryReport from '../../models/DirectoryReport.js';
import DirectoryClick from '../../models/DirectoryClick.js';
import { bearerToken, identifyWithDiscord, accountCreatedAt } from '../../utils/siteIdentity.js';
import { isPremiumGuild } from '../../utils/premiumCheck.js';
import {
  PLATFORMS, REGIONS, TAGS, PROMOTIONS, MAX_FEATURED, MIN_MEMBERS, MAX_TAGS,
  BUMP_COOLDOWN_MS, VOTE_COOLDOWN_MS, MIN_ACCOUNT_AGE_MS,
  directorySnapshot, queryDirectory, featuredOf, rankOf, adjustVotes, invalidateDirectory,
  cleanListingInput, inviteChannels, ensureInvite, listingStats, goLive,
  bumpListing, featuredCount, nextFeaturedOpening,
} from '../../utils/directory.js';

/**
 * The server directory API, mounted at /api/directory.
 *
 * Public: the list, and the Join redirect (which keeps invites working and
 * counts clicks for the owner). Signed in with Discord: voting and reports.
 * Server administrators: their own listing, its stats, and bumping it.
 * Buying a featured spot lives in routes/checkout.js with the other payments.
 */

const SITE = 'https://roleplaymanager.xyz';
const ID = /^\d{17,20}$/;

export function createDirectoryRouter(client, deps = {}) {
  const router = Router();
  const identify = deps.identify || identifyWithDiscord;
  // Loaded lazily: api.js is large, and tests can pass their own check.
  const isAdmin = deps.isAdmin || (async (token, guildId) => {
    const { verifyAdminAccess } = await import('./api.js');
    return verifyAdminAccess(token, guildId);
  });

  async function signedIn(req, res) {
    const token = bearerToken(req);
    if (!token) { res.status(401).json({ error: 'Sign in with Discord first.' }); return null; }
    try {
      return { token, user: await identify(token) };
    } catch {
      res.status(401).json({ error: 'Your sign-in has expired. Sign in again.' });
      return null;
    }
  }

  async function adminOf(req, res, guildId) {
    if (!ID.test(String(guildId || ''))) { res.status(400).json({ error: 'Invalid server.' }); return null; }
    const s = await signedIn(req, res);
    if (!s) return null;
    let ok = false;
    try { ok = await isAdmin(s.token, guildId); } catch { ok = false; }
    if (!ok) { res.status(403).json({ error: 'You need Administrator on that server.' }); return null; }
    return s;
  }

  const options = () => ({
    platforms: PLATFORMS, regions: REGIONS, tags: TAGS, maxTags: MAX_TAGS,
    promotions: Object.values(PROMOTIONS), maxFeatured: MAX_FEATURED,
  });

  // ── Public ─────────────────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    try {
      const snap = await directorySnapshot(client);
      const filters = {
        q: req.query.q, platform: req.query.platform, region: req.query.region,
        tag: req.query.tag, sort: req.query.sort, page: req.query.page, limit: req.query.limit,
      };
      const result = queryDirectory(snap.servers, filters);
      res.set('Cache-Control', 'public, max-age=30');
      res.json({ ...result, featured: featuredOf(snap.servers, filters), options: options() });
    } catch (err) {
      console.error('[Directory] list:', err.message);
      res.status(500).json({ error: 'Could not load the directory.' });
    }
  });

  router.get('/options', (req, res) => res.json(options()));

  // The Join button. Checks the invite still works, makes a new one if not,
  // and counts the click for the owner's stats.
  router.get('/join/:guildId', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    if (!ID.test(guildId)) return res.redirect(302, SITE + '/servers/');
    try {
      const listing = await DirectoryListing.findOne({ guildId, listed: true, hidden: { $ne: true } }).lean();
      if (!listing || !client?.guilds?.cache?.has(guildId)) return res.redirect(302, SITE + '/servers/?gone=1');
      const code = await ensureInvite(client, listing);
      if (!code) return res.redirect(302, SITE + '/servers/?gone=1');
      DirectoryClick.create({ guildId }).catch(() => {});
      DirectoryListing.updateOne({ guildId }, { $inc: { joinClicks: 1 } }).catch(() => {});
      return res.redirect(302, 'https://discord.gg/' + encodeURIComponent(code));
    } catch (err) {
      console.error('[Directory] join:', err.message);
      return res.redirect(302, SITE + '/servers/?gone=1');
    }
  });

  // ── Signed in ──────────────────────────────────────────────────────────

  router.post('/vote/:guildId', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    if (!ID.test(guildId)) return res.status(400).json({ error: 'Invalid server.' });
    const s = await signedIn(req, res);
    if (!s) return;

    // Brand new accounts are how vote rigging is done.
    if (Date.now() - accountCreatedAt(s.user.id).getTime() < MIN_ACCOUNT_AGE_MS) {
      return res.status(403).json({ error: 'Discord accounts less than 14 days old cannot vote yet.' });
    }
    const listing = await DirectoryListing.findOne({ guildId, listed: true, hidden: { $ne: true } }).lean();
    if (!listing) return res.status(404).json({ error: 'That server is not in the directory.' });

    const recent = await DirectoryVote.findOne({
      guildId, userId: s.user.id, createdAt: { $gt: new Date(Date.now() - VOTE_COOLDOWN_MS) },
    }).lean();
    if (recent) {
      const nextAt = new Date(new Date(recent.createdAt).getTime() + VOTE_COOLDOWN_MS);
      return res.status(429).json({ error: 'You already voted for this server. You can vote again in 12 hours.', nextAt });
    }

    await DirectoryVote.create({ guildId, userId: s.user.id });
    const votes = await DirectoryVote.countDocuments({ guildId, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } });
    adjustVotes(guildId, votes);
    res.json({ ok: true, votes, nextAt: new Date(Date.now() + VOTE_COOLDOWN_MS) });
  });

  router.post('/report/:guildId', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    if (!ID.test(guildId)) return res.status(400).json({ error: 'Invalid server.' });
    const s = await signedIn(req, res);
    if (!s) return;
    const reason = String((req.body && req.body.reason) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (reason.length < 5) return res.status(400).json({ error: 'Say briefly what is wrong with this listing.' });
    const already = await DirectoryReport.findOne({
      guildId, userId: s.user.id, createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).lean();
    if (already) return res.json({ ok: true });
    await DirectoryReport.create({ guildId, userId: s.user.id, reason });
    res.json({ ok: true });
  });

  // ── Server administrators ──────────────────────────────────────────────

  router.get('/manage/:guildId', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    const s = await adminOf(req, res, guildId);
    if (!s) return;
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) return res.status(404).json({ error: 'The bot is not in that server.' });

    const [listing, stats, premium, taken] = await Promise.all([
      DirectoryListing.findOne({ guildId }).lean(),
      listingStats(guildId),
      isPremiumGuild(guildId).catch(() => false),
      featuredCount(guildId),
    ]);
    const snap = await directorySnapshot(client).catch(() => null);
    const standing = snap ? rankOf(snap.servers, guildId) : { rank: null, total: 0 };

    res.json({
      guildId,
      name: guild.name,
      members: guild.memberCount,
      premium,
      listing: listing ? {
        listed: !!listing.listed,
        description: listing.description || '',
        platforms: listing.platforms || [],
        region: listing.region || 'na',
        tags: listing.tags || [],
        inviteChannelId: listing.inviteChannelId || null,
        hasInvite: !!listing.inviteCode,
        bumpedAt: listing.bumpedAt || null,
        featuredUntil: listing.featuredUntil || null,
        hidden: !!listing.hidden,
        hiddenReason: listing.hiddenReason || null,
      } : null,
      stats: { ...stats, rank: standing.rank, total: standing.total },
      channels: inviteChannels(guild),
      bumpCooldownHours: (premium ? BUMP_COOLDOWN_MS.premium : BUMP_COOLDOWN_MS.free) / 3600000,
      featuredSlotsLeft: Math.max(0, MAX_FEATURED - taken),
      nextFeaturedOpening: taken >= MAX_FEATURED ? await nextFeaturedOpening() : null,
      minMembers: MIN_MEMBERS,
      options: options(),
    });
  });

  router.put('/manage/:guildId', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    const s = await adminOf(req, res, guildId);
    if (!s) return;
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) return res.status(404).json({ error: 'The bot is not in that server.' });

    const input = cleanListingInput(req.body || {});
    const listing = await DirectoryListing.findOne({ guildId }) || new DirectoryListing({ guildId });
    Object.assign(listing, input);
    listing.updatedBy = s.user.id;

    if (listing.listed) {
      // The same rules /setup uses in Discord.
      const live = await goLive(guild, listing, { newInvite: 'inviteChannelId' in input });
      if (!live.ok) return res.status(live.status).json({ error: live.error });
    }

    await listing.save();
    invalidateDirectory();
    res.json({ ok: true, listed: listing.listed });
  });

  router.post('/manage/:guildId/bump', async (req, res) => {
    const guildId = String(req.params.guildId || '');
    const s = await adminOf(req, res, guildId);
    if (!s) return;
    const premium = await isPremiumGuild(guildId).catch(() => false);
    const result = await bumpListing(guildId, s.user.id, premium);
    if (!result.ok && result.reason === 'not_listed') return res.status(400).json({ error: 'List the server first.' });
    if (!result.ok) return res.status(429).json({ error: 'Bumped recently. You can bump again soon.', nextAt: result.nextAt });
    res.json({ ok: true, nextAt: result.nextAt });
  });

  return router;
}
