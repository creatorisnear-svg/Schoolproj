import DirectoryListing from '../models/DirectoryListing.js';
import DirectoryVote from '../models/DirectoryVote.js';
import DirectoryClick from '../models/DirectoryClick.js';
import DirectoryPromotion from '../models/DirectoryPromotion.js';
import PremiumKey from '../models/PremiumKey.js';

/**
 * The public directory of console GTA RP servers at roleplaymanager.xyz/servers.
 *
 * Why it exists: recruiting members is the thing a console RP owner worries
 * about most, and the directory gives them a reason to install the bot and
 * keep it. Every server using the bot can list itself for free. Premium
 * servers get a badge and rank above free ones, and anyone can pay to feature
 * a server at the top.
 *
 * The listing data is read into one in-memory snapshot a minute, and every
 * directory request is filtered and sorted from that. Hundreds of servers is
 * nothing to sort; querying Mongo per page view would be.
 */

export const PLATFORMS = {
  ps5: 'PS5',
  ps4: 'PS4',
  xboxseries: 'Xbox Series X|S',
  xboxone: 'Xbox One',
  pc: 'PC',
};

export const REGIONS = {
  na: 'North America',
  eu: 'Europe',
  uk: 'United Kingdom',
  oce: 'Oceania',
  sa: 'South America',
  global: 'Worldwide',
};

export const TAGS = {
  leo: 'Law Enforcement',
  fire: 'Fire and EMS',
  civ: 'Civilian',
  dot: 'DOT',
  gangs: 'Gangs',
  economy: 'Economy',
  serious: 'Serious RP',
  casual: 'Casual RP',
  whitelisted: 'Whitelisted',
  new: 'New server',
  mature: '18+',
};

/** Paid featured spots, in cents. */
export const PROMOTIONS = {
  7: { days: 7, amount: 499, label: '7 days' },
  30: { days: 30, amount: 1499, label: '30 days' },
};

export const MAX_FEATURED = 10;
export const MIN_MEMBERS = 5;
export const MAX_TAGS = 6;
export const BUMP_COOLDOWN_MS = { free: 6 * 60 * 60 * 1000, premium: 2 * 60 * 60 * 1000 };
export const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const MIN_ACCOUNT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const VOTE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_RECHECK_MS = 6 * 60 * 60 * 1000;
const SNAPSHOT_TTL_MS = 60 * 1000;

const ACTIVE = ['active', 'trialing', 'past_due', 'cancelling'];
const time = (d) => (d ? new Date(d).getTime() : 0);

// ── Snapshot ─────────────────────────────────────────────────────────────

let snapshot = null;
let snapshotAt = 0;
let building = null;

export function invalidateDirectory() {
  snapshotAt = 0;
}

export async function directorySnapshot(client) {
  if (snapshot && Date.now() - snapshotAt < SNAPSHOT_TTL_MS) return snapshot;
  if (!building) {
    building = buildSnapshot(client).finally(() => { building = null; });
  }
  return building;
}

async function buildSnapshot(client) {
  const listings = await DirectoryListing.find({ listed: true, hidden: { $ne: true } }).lean();
  // A server the bot has left, or one without a working invite, has nothing
  // to offer a visitor.
  const live = listings.filter((l) => l.inviteCode && client?.guilds?.cache?.has(l.guildId));
  const ids = live.map((l) => l.guildId);
  const since = new Date(Date.now() - VOTE_WINDOW_MS);

  const [votes, keys] = await Promise.all([
    DirectoryVote.aggregate([
      { $match: { guildId: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: '$guildId', n: { $sum: 1 } } },
    ]),
    PremiumKey.find({ guildId: { $in: ids } }).lean(),
  ]);
  const voteMap = new Map(votes.map((v) => [v._id, v.n]));
  const premium = new Set(keys
    .filter((k) => k.plan === 'lifetime' || k.plan === 'manual' || ACTIVE.includes(k.subscriptionStatus))
    .map((k) => k.guildId));

  const now = Date.now();
  const servers = live.map((l) => publicCard(l, client.guilds.cache.get(l.guildId), voteMap.get(l.guildId) || 0, premium.has(l.guildId), now));
  snapshot = { servers, builtAt: now };
  snapshotAt = now;
  return snapshot;
}

/** What the public sees of one listing. Nothing here is private. */
export function publicCard(listing, guild, votes, premium, now = Date.now()) {
  let icon = null;
  try { icon = guild?.iconURL?.({ size: 128, extension: 'png' }) || null; } catch { icon = null; }
  return {
    id: listing.guildId,
    name: guild?.name || 'Unknown server',
    icon,
    members: guild?.memberCount || 0,
    description: listing.description || '',
    platforms: listing.platforms || [],
    region: listing.region || 'na',
    tags: listing.tags || [],
    votes,
    premium,
    featured: time(listing.featuredUntil) > now,
    bumpedAt: listing.bumpedAt || null,
    listedAt: listing.listedAt || listing.createdAt || null,
  };
}

/** A vote changed one server's count; no need to rebuild everything. */
export function adjustVotes(guildId, votes) {
  const s = snapshot?.servers?.find((x) => x.id === guildId);
  if (s) s.votes = votes;
}

const SORTS = {
  // Premium servers first, then the most voted in the last 30 days.
  top: (a, b) => (b.premium - a.premium) || (b.votes - a.votes) || (b.members - a.members),
  members: (a, b) => (b.members - a.members) || (b.votes - a.votes),
  new: (a, b) => time(b.listedAt) - time(a.listedAt),
  bumped: (a, b) => (time(b.bumpedAt) - time(a.bumpedAt)) || (b.premium - a.premium),
};

function matches(filters) {
  const q = filters.q ? String(filters.q).toLowerCase().trim().slice(0, 60) : '';
  return (s) => (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    && (!PLATFORMS[filters.platform] || s.platforms.includes(filters.platform))
    && (!REGIONS[filters.region] || s.region === filters.region)
    && (!TAGS[filters.tag] || s.tags.includes(filters.tag));
}

export function queryDirectory(servers, filters = {}) {
  const sort = SORTS[filters.sort] ? filters.sort : 'top';
  const limit = Math.min(48, Math.max(1, parseInt(filters.limit, 10) || 24));
  const list = servers.filter(matches(filters)).sort(SORTS[sort]);
  const pages = Math.max(1, Math.ceil(list.length / limit));
  const page = Math.min(pages, Math.max(1, parseInt(filters.page, 10) || 1));
  return { servers: list.slice((page - 1) * limit, page * limit), total: list.length, page, pages, sort };
}

/** Where a server stands in the default order, 1 based, and out of how many. */
export function rankOf(servers, guildId) {
  const list = [...servers].sort(SORTS.top);
  const i = list.findIndex((s) => s.id === guildId);
  return { rank: i >= 0 ? i + 1 : null, total: list.length };
}

/** The featured servers matching the same filters, in a fresh order each time. */
export function featuredOf(servers, filters = {}) {
  const list = servers.filter((s) => s.featured).filter(matches(filters));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, MAX_FEATURED);
}

// ── Owner side ───────────────────────────────────────────────────────────

/** Only the fields an owner may set, cleaned. */
export function cleanListingInput(body = {}) {
  const out = {};
  if (typeof body.listed === 'boolean') out.listed = body.listed;
  if (typeof body.description === 'string') {
    out.description = body.description
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 500);
  }
  if (Array.isArray(body.platforms)) out.platforms = [...new Set(body.platforms.filter((p) => PLATFORMS[p]))];
  if (typeof body.region === 'string' && REGIONS[body.region]) out.region = body.region;
  if (Array.isArray(body.tags)) out.tags = [...new Set(body.tags.filter((t) => TAGS[t]))].slice(0, MAX_TAGS);
  if (body.inviteChannelId === null || body.inviteChannelId === '') out.inviteChannelId = null;
  else if (typeof body.inviteChannelId === 'string' && /^\d{17,20}$/.test(body.inviteChannelId)) out.inviteChannelId = body.inviteChannelId;
  return out;
}

/** Text channels where the bot may create an invite. */
export function inviteChannels(guild) {
  const me = guild?.members?.me;
  if (!guild || !me) return [];
  return [...guild.channels.cache.values()]
    .filter((c) => c.isTextBased?.() && !c.isThread?.() && c.permissionsFor?.(me)?.has?.('CreateInstantInvite'))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** A permanent invite, in the chosen channel or the first one that allows it. */
export async function createInvite(guild, channelId) {
  const candidates = [];
  if (channelId) candidates.push(guild.channels.cache.get(channelId));
  else {
    candidates.push(guild.rulesChannel, guild.systemChannel);
    for (const c of inviteChannels(guild)) candidates.push(guild.channels.cache.get(c.id));
  }
  for (const channel of candidates.filter(Boolean)) {
    try {
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'RolePlayManager server directory' });
      if (invite?.code) return invite.code;
    } catch {
      // No permission there; try the next one.
    }
  }
  return null;
}

/**
 * Put a listing live, or say plainly why not. One set of rules for the
 * dashboard and for /setup in Discord, so the two can never disagree about
 * what a listing needs. Mutates the listing; the caller saves it.
 */
export async function goLive(guild, listing, { newInvite = false } = {}) {
  if (listing.hidden) {
    return { ok: false, status: 403, error: 'This listing was removed from the directory. Contact support if you think that was a mistake.' };
  }
  if ((guild.memberCount || 0) < MIN_MEMBERS) {
    return { ok: false, status: 400, error: 'A server needs at least ' + MIN_MEMBERS + ' members to be listed.' };
  }
  if ((listing.description || '').length < 20) {
    return { ok: false, status: 400, error: 'Write a short description first, at least 20 characters. It is the first thing people read.' };
  }
  if (!(listing.platforms || []).length) {
    return { ok: false, status: 400, error: 'Pick at least one platform, so PS5 and Xbox players can find you.' };
  }
  // A new invite when first listed, or when the owner changed the channel.
  if (!listing.inviteCode || newInvite) {
    const code = await createInvite(guild, listing.inviteChannelId);
    if (!code) {
      return { ok: false, status: 400, error: 'The bot could not make an invite. Give it the Create Invite permission in the channel you picked, or pick another channel.' };
    }
    listing.inviteCode = code;
    listing.inviteCheckedAt = new Date();
  }
  listing.listed = true;
  if (!listing.listedAt) listing.listedAt = new Date();
  if (!listing.bumpedAt) listing.bumpedAt = new Date();
  return { ok: true };
}

/**
 * The invite a Join button should use: the stored one if it still works,
 * otherwise a new one. Invites get deleted, and a dead Join button is the
 * worst thing a listing can have.
 */
export async function ensureInvite(client, listing) {
  const guild = client?.guilds?.cache?.get(listing.guildId);
  if (!guild) return null;
  if (listing.inviteCode && Date.now() - time(listing.inviteCheckedAt) < INVITE_RECHECK_MS) return listing.inviteCode;

  if (listing.inviteCode) {
    const ok = await client.fetchInvite(listing.inviteCode)
      .then((inv) => inv?.guild?.id === listing.guildId)
      .catch(() => false);
    if (ok) {
      await DirectoryListing.updateOne({ guildId: listing.guildId }, { $set: { inviteCheckedAt: new Date() } });
      return listing.inviteCode;
    }
  }
  const code = await createInvite(guild, listing.inviteChannelId);
  await DirectoryListing.updateOne({ guildId: listing.guildId }, { $set: { inviteCode: code, inviteCheckedAt: new Date() } });
  if (code !== listing.inviteCode) invalidateDirectory();
  return code;
}

export async function listingStats(guildId) {
  const since = new Date(Date.now() - VOTE_WINDOW_MS);
  const [votes, joinClicks] = await Promise.all([
    DirectoryVote.countDocuments({ guildId, createdAt: { $gte: since } }),
    DirectoryClick.countDocuments({ guildId, createdAt: { $gte: since } }),
  ]);
  return { votes, joinClicks };
}

export async function bumpListing(guildId, userId, isPremium) {
  const listing = await DirectoryListing.findOne({ guildId });
  if (!listing || !listing.listed) return { ok: false, reason: 'not_listed' };
  const cooldown = isPremium ? BUMP_COOLDOWN_MS.premium : BUMP_COOLDOWN_MS.free;
  const last = time(listing.bumpedAt);
  if (Date.now() - last < cooldown) return { ok: false, reason: 'cooldown', nextAt: new Date(last + cooldown) };
  listing.bumpedAt = new Date();
  listing.bumpedBy = userId || null;
  await listing.save();
  invalidateDirectory();
  return { ok: true, nextAt: new Date(Date.now() + cooldown) };
}

// ── Featured spots ───────────────────────────────────────────────────────

export async function featuredCount(excludeGuildId) {
  return DirectoryListing.countDocuments({ featuredUntil: { $gt: new Date() }, guildId: { $ne: excludeGuildId || '' } });
}

export async function nextFeaturedOpening() {
  const next = await DirectoryListing.findOne({ featuredUntil: { $gt: new Date() } }).sort({ featuredUntil: 1 }).lean();
  return next ? next.featuredUntil : null;
}

/**
 * Feature a server for the days paid for. Idempotent per Stripe session: the
 * webhook and the success page may both call this and the time is added once.
 * Time stacks: buying again while featured extends the end date.
 */
export async function applyPromotion({ stripeSessionId, guildId, buyerId, days, amount }) {
  let record;
  try {
    record = await DirectoryPromotion.create({ stripeSessionId, guildId, buyerId: buyerId || null, days, amount: amount || 0 });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await DirectoryPromotion.findOne({ stripeSessionId }).lean();
      return { applied: false, featuredUntil: existing?.featuredUntil || null };
    }
    throw err;
  }
  const listing = await DirectoryListing.findOne({ guildId }) || new DirectoryListing({ guildId });
  const base = Math.max(Date.now(), time(listing.featuredUntil));
  listing.featuredUntil = new Date(base + days * 24 * 60 * 60 * 1000);
  await listing.save();
  record.featuredUntil = listing.featuredUntil;
  await record.save();
  invalidateDirectory();
  return { applied: true, featuredUntil: listing.featuredUntil };
}
