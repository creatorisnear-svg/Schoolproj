/**
 * Patrol hours: recording them, and adding them up.
 *
 * The recording side hangs off the voiceStateUpdate handler in index.js, which
 * already fires on every patrol channel join and leave. Everything here is
 * defensive about that: a failure to record must never be able to break
 * dispatch, which is the feature that actually needs those events.
 *
 * THE NUMBER HAS TO BE DEFENSIBLE
 *
 * The whole value of a leaderboard is that an owner can point at it in an
 * argument with a volunteer. GTA RP players park in a voice channel and go and
 * play something else, so a naive count ranks whoever leaves Discord open
 * longest, every officer works that out within a fortnight, and the board stops
 * meaning anything. Three rules, all in the first version because the board is
 * worthless without them:
 *
 *   - time spent self-deafened does not count, they have stopped listening
 *   - a session where nobody else was ever in the channel does not count
 *   - a single session is capped, so falling asleep online is not a record
 */
import DutySession from '../models/DutySession.js';
import DispatchConfig from '../models/DispatchConfig.js';
import mongoose from 'mongoose';

/** Nobody patrols for eight hours. Anything longer is someone who went to bed. */
export const MAX_SESSION_SECONDS = 6 * 60 * 60;

/** Below this a session is noise: a misclick, or hopping through a channel. */
export const MIN_SESSION_SECONDS = 60;

// Patrol channel ids per guild. Read from the database rather than
// voiceListener's in-memory set, which is only populated once dispatch has
// initialised and is empty on a server that has channels configured with
// dispatch switched off.
const channelCache = new Map();
const CACHE_TTL = 60_000;

async function patrolChannelIds(guildId) {
  const hit = channelCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.ids;

  const cfg = await DispatchConfig.findOne({ guildId }).select('patrolChannelIds').lean();
  const ids = cfg?.patrolChannelIds ?? [];
  channelCache.set(guildId, { ids, at: Date.now() });
  return ids;
}

/** Called when patrol channels change, so the next lookup is not stale. */
export function clearDutyChannelCache(guildId) {
  if (guildId) channelCache.delete(guildId);
  else channelCache.clear();
}

export async function isDutyChannel(guildId, channelId) {
  if (!channelId) return false;
  const ids = await patrolChannelIds(guildId);
  return ids.includes(channelId);
}

/** How many humans are in a channel right now, excluding bots. */
function humansIn(channel) {
  if (!channel?.members) return 0;
  let n = 0;
  for (const m of channel.members.values()) if (!m.user?.bot) n++;
  return n;
}

/**
 * Start a session, or do nothing if one is somehow already open.
 *
 * Openness is keyed on endedAt being null rather than held in memory, because
 * pushing to main redeploys this process several times a week and in-memory
 * state would not survive it.
 */
export async function openSession(guildId, member, channel) {
  if (mongoose.connection.readyState !== 1) return null;

  const existing = await DutySession.findOne({ guildId, userId: member.id, endedAt: null });
  if (existing) return existing;

  return DutySession.create({
    guildId,
    userId: member.id,
    username: member.user?.username ?? member.displayName ?? null,
    channelId: channel?.id ?? null,
    startedAt: new Date(),
    // Company is counted from the moment they arrive and topped up while they
    // stay, so an officer who joins someone already on patrol counts even if
    // that person leaves first.
    hadCompany: humansIn(channel) > 1,
    deafSince: member.voice?.selfDeaf ? new Date() : null,
  });
}

/** Close the open session, working out how much of it actually counted. */
export async function closeSession(guildId, userId, closedBy = 'left') {
  if (mongoose.connection.readyState !== 1) return null;

  const session = await DutySession.findOne({ guildId, userId, endedAt: null });
  if (!session) return null;

  const endedAt = new Date();
  let seconds = Math.max(0, Math.floor((endedAt - session.startedAt) / 1000));

  // Close out any deafened stretch still running.
  let deaf = session.deafSeconds || 0;
  if (session.deafSince) deaf += Math.max(0, Math.floor((endedAt - session.deafSince) / 1000));

  let how = closedBy;
  if (seconds > MAX_SESSION_SECONDS) {
    seconds = MAX_SESSION_SECONDS;
    how = 'cap';
    console.warn(`[Duty] Capped a ${Math.round((endedAt - session.startedAt) / 3600000)}h session for ${userId} in ${guildId}`);
  }

  // Deafened time and solo time are not patrol time.
  const counted = session.hadCompany ? Math.max(0, seconds - deaf) : 0;

  session.endedAt = endedAt;
  session.seconds = counted >= MIN_SESSION_SECONDS ? counted : 0;
  session.deafSeconds = deaf;
  session.deafSince = null;
  session.closedBy = how;
  await session.save();
  return session;
}

/** Someone deafened or undeafened themselves mid session. */
export async function markDeaf(guildId, userId, nowDeaf) {
  if (mongoose.connection.readyState !== 1) return;

  const session = await DutySession.findOne({ guildId, userId, endedAt: null });
  if (!session) return;

  if (nowDeaf && !session.deafSince) {
    session.deafSince = new Date();
  } else if (!nowDeaf && session.deafSince) {
    session.deafSeconds = (session.deafSeconds || 0)
      + Math.max(0, Math.floor((Date.now() - session.deafSince) / 1000));
    session.deafSince = null;
  } else {
    return;
  }
  await session.save();
}

/** Note that the officer was not alone, once anybody else turns up. */
export async function markCompany(guildId, userIds) {
  if (mongoose.connection.readyState !== 1 || !userIds.length) return;
  await DutySession.updateMany(
    { guildId, userId: { $in: userIds }, endedAt: null, hadCompany: false },
    { $set: { hadCompany: true } }
  );
}

// ── Reading ────────────────────────────────────────────────────────────────

/** Hours per officer over a window, most first. Closed sessions only. */
export async function leaderboard(guildId, days = 7, limit = 10) {
  if (mongoose.connection.readyState !== 1) return [];
  const since = new Date(Date.now() - days * 86400000);

  return DutySession.aggregate([
    { $match: { guildId, startedAt: { $gte: since }, endedAt: { $ne: null }, seconds: { $gt: 0 } } },
    {
      $group: {
        _id: '$userId',
        seconds: { $sum: '$seconds' },
        sessions: { $sum: 1 },
        longest: { $max: '$seconds' },
        username: { $last: '$username' },
        lastSeen: { $max: '$endedAt' },
      },
    },
    { $sort: { seconds: -1 } },
    { $limit: Math.max(1, limit) },
  ]);
}

/** One officer's own totals, which is what /duty shows them. */
export async function totalsFor(guildId, userId, days = 7) {
  if (mongoose.connection.readyState !== 1) return { seconds: 0, sessions: 0, longest: 0, lastSeen: null };
  const since = new Date(Date.now() - days * 86400000);

  const [row] = await DutySession.aggregate([
    { $match: { guildId, userId, startedAt: { $gte: since }, endedAt: { $ne: null }, seconds: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        seconds: { $sum: '$seconds' },
        sessions: { $sum: 1 },
        longest: { $max: '$seconds' },
        lastSeen: { $max: '$endedAt' },
      },
    },
  ]);
  return row || { seconds: 0, sessions: 0, longest: 0, lastSeen: null };
}

/** When each of these officers was last on patrol, for the inactivity list. */
export async function lastSeenFor(guildId, userIds) {
  if (mongoose.connection.readyState !== 1 || !userIds.length) return new Map();

  const rows = await DutySession.aggregate([
    { $match: { guildId, userId: { $in: userIds }, endedAt: { $ne: null }, seconds: { $gt: 0 } } },
    { $group: { _id: '$userId', lastSeen: { $max: '$endedAt' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.lastSeen]));
}

/** Everything recorded for a guild, for the upsell line on the paywall. */
export async function guildTotals(guildId, days = 90) {
  if (mongoose.connection.readyState !== 1) return { seconds: 0, officers: 0 };
  const since = new Date(Date.now() - days * 86400000);

  const [row] = await DutySession.aggregate([
    { $match: { guildId, startedAt: { $gte: since }, endedAt: { $ne: null }, seconds: { $gt: 0 } } },
    { $group: { _id: null, seconds: { $sum: '$seconds' }, officers: { $addToSet: '$userId' } } },
    { $project: { seconds: 1, officers: { $size: '$officers' } } },
  ]);
  return row || { seconds: 0, officers: 0 };
}

/** "3h 20m", or "0m". Used everywhere hours are shown. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
