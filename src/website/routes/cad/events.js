import mongoose from 'mongoose';
import EmergencyCall from '../../../models/EmergencyCall.js';
import OfficerStatus from '../../../models/OfficerStatus.js';
import BOLO from '../../../models/BOLO.js';
import Priority from '../../../models/Priority.js';
import TrafficTicket from '../../../models/TrafficTicket.js';
import CADCharacter from '../../../models/CADCharacter.js';
import PendingVerification from '../../../models/PendingVerification.js';
import VerifiedUser from '../../../models/VerifiedUser.js';
import { StrikeUser, StrikeConfig } from '../../../models/Strike.js';
import Ticket from '../../../models/Ticket.js';
import Blacklist from '../../../models/Blacklist.js';

/**
 * Live updates for the CAD, over server-sent events.
 *
 * The CAD has to feel live: a 911 raised on a phone should appear on an
 * officer's queue without them reloading, and a priority started in Discord
 * should show in the top bar of every open CAD. Polling from every open tab
 * would work but the API allows 120 requests per minute per IP, and a squad
 * behind one home network shares that budget; a handful of tabs at a 3 second
 * poll would spend it.
 *
 * So each browser holds one SSE connection instead, and the server does the
 * polling: a round of cheap queries per guild that has at least one viewer,
 * on a five second tick. Two hundred idle tabs across ten guilds cost ten
 * rounds of queries, not two hundred requests.
 *
 * The payload is a fingerprint, not the data. Clients refetch only the section
 * whose fingerprint moved, so this stays cheap regardless of how much a server
 * has in it. Each fingerprint has to move for every edit its screen shows, not
 * only for rows appearing and disappearing: a bare count missed an officer
 * flagging a civilian wanted, a unit changing location on the same 10-code,
 * and dispatch correcting a call's address. The fingerprints below are built
 * from ids, status fields, timestamps where the model has them, and a short
 * hash of the free text a screen renders.
 */

// Overridable so a test can watch a room tick without waiting five real seconds.
const TICK_MS = Number(process.env.CAD_SSE_TICK_MS) || 5000;
// No query may outlive the tick, or a slow database would stack rounds up.
const QUERY_MS = Math.max(1000, TICK_MS - 500);

/**
 * Every section a client can watch. The client's WATCH table is checked
 * against this list by scripts/check-cad-live.mjs (npm run check:cad), so a
 * typo on either side fails there rather than as a screen that never refreshes.
 */
export const SECTIONS = [
  'calls', 'officers', 'bolos', 'priority', 'tickets',
  'characters', 'verifications', 'strikes', 'support', 'blacklist',
];

/** guildId -> { clients:Set<res>, timer, busy } */
const rooms = new Map();

/**
 * The last fingerprint per guild, kept when its room closes. A single viewer
 * whose stream drops for a deploy reconnects into a fresh room; comparing
 * against what was known before the gap means whatever moved during it is
 * announced rather than folded into a new baseline and lost. One short
 * string per guild that has ever had a viewer.
 */
const lastByGuild = new Map();

const when = (d) => (d ? new Date(d).getTime() : '');

/** A short stable hash, so free text never makes the fingerprint long. */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const FAILED = Symbol('failed');

/** Build a query inside the tick's time bound; a throw becomes a rejection. */
function run(make) {
  try {
    const q = make();
    return typeof q.maxTimeMS === 'function' ? q.maxTimeMS(QUERY_MS) : Promise.resolve(q);
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * One string per section, or null for a section whose queries failed this
 * round. The caller carries the previous value forward for those rather than
 * reporting a change that may not have happened, and the other sections still
 * get compared: one slow collection does not silence the rest.
 */
export async function fingerprint(guildId) {
  const settled = await Promise.allSettled([
    run(() => EmergencyCall.find({ guildId, status: 'active' },
      'callId respondingLeoId attachedLeoIds issue location suspectsDescription').lean()),
    run(() => OfficerStatus.find({ guildId }, 'userId tenCode updatedAt').sort({ updatedAt: -1 }).limit(50).lean()),
    run(() => BOLO.find({ guildId, active: true }, 'boloId').lean()),
    run(() => Priority.findOne({ guildId }, 'enabled priorityActive cooldownEndsAt').lean()),
    run(() => TrafficTicket.countDocuments({ guildId })),
    run(() => TrafficTicket.countDocuments({ guildId, paid: { $ne: true } })),
    run(() => CADCharacter.countDocuments({ guildId })),
    run(() => CADCharacter.findOne({ guildId }, 'updatedAt').sort({ updatedAt: -1 }).lean()),
    run(() => PendingVerification.countDocuments({ guildId })),
    run(() => PendingVerification.findOne({ guildId }, 'createdAt').sort({ createdAt: -1 }).lean()),
    run(() => VerifiedUser.countDocuments({ guildId })),
    run(() => StrikeUser.find({ guildId, currentStrikeLevel: { $gt: 0 } }, 'userId currentStrikeLevel').lean()),
    run(() => StrikeConfig.findOne({ guildId }, 'strikes').lean()),
    run(() => Ticket.countDocuments({ guildId, status: { $ne: 'closed' } })),
    run(() => Blacklist.countDocuments({ guildId, active: true })),
  ]);

  const failed = settled.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.warn(`[CAD SSE] ${failed.length} of ${settled.length} queries failed for ${guildId}: ${failed[0].reason && failed[0].reason.message}`);
  }
  const [
    calls, officers, bolos, priority,
    ticketsTotal, ticketsUnpaid, characters, charactersLatest,
    pendingCount, pendingLatest, verified, strikes, strikeConfig,
    support, blacklist,
  ] = settled.map((r) => (r.status === 'fulfilled' ? r.value : FAILED));

  // A section is null when anything it is built from failed.
  const section = (deps, build) => (deps.some((d) => d === FAILED) ? null : build());

  return {
    // Responder, attached units by id (a swap keeps the length still), and the
    // text the call card shows, which dispatch can rewrite mid-call.
    calls: section([calls], () => calls
      .map((c) => `${c.callId}:${c.respondingLeoId || ''}:${(c.attachedLeoIds || []).slice().sort().join(',')}:`
        + hash(`${c.issue || ''}|${c.location || ''}|${c.suspectsDescription || ''}`))
      .sort()
      .join('|')),
    // updatedAt as well as the code: a unit moving location keeps its 10-code.
    officers: section([officers], () => officers.map((o) => `${o.userId}:${o.tenCode}:${when(o.updatedAt)}`).sort().join('|')),
    // Ids rather than a count: one resolved and one raised in the same tick
    // would otherwise cancel out.
    bolos: section([bolos], () => bolos.map((b) => b.boloId).sort().join('|')),
    priority: section([priority], () => (priority
      ? `${priority.enabled ? 1 : 0}:${priority.priorityActive ? 1 : 0}:${when(priority.cooldownEndsAt)}`
      : '')),
    // Issued and paid both move one of these.
    tickets: section([ticketsTotal, ticketsUnpaid], () => `${ticketsTotal}:${ticketsUnpaid}`),
    // Count plus newest edit: a wanted flag, a vehicle, a licence status all
    // bump updatedAt on the record without changing how many there are.
    characters: section([characters, charactersLatest], () => `${characters}:${when(charactersLatest && charactersLatest.updatedAt)}`),
    // Count plus newest, for the same reason as the BOLO ids, plus how many
    // are verified: with approval switched off nobody passes through pending.
    verifications: section([pendingCount, pendingLatest, verified],
      () => `${pendingCount}:${when(pendingLatest && pendingLatest.createdAt)}:${verified}`),
    // Levels per member, and what each level does, which the screen prints.
    strikes: section([strikes, strikeConfig], () => strikes.map((s) => `${s.userId}:${s.currentStrikeLevel}`).sort().join('|')
      + '#' + [1, 2, 3, 4].map((n) => (strikeConfig && strikeConfig.strikes && strikeConfig.strikes[`strike${n}`]
        && strikeConfig.strikes[`strike${n}`].action) || '').join(',')),
    support: section([support], () => String(support)),
    blacklist: section([blacklist], () => String(blacklist)),
  };
}

function send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The socket is gone; the close handler will clean it up.
  }
}

function closeRoom(guildId, room) {
  clearInterval(room.timer);
  rooms.delete(guildId);
}

async function tick(guildId, room) {
  // Nothing that touches MongoDB on a timer may run while the connection is
  // down: the driver would queue every one of these and replay them all at
  // once on reconnect.
  if (mongoose.connection.readyState !== 1) return;

  // A client whose socket died without a close event would otherwise keep
  // the room, and its queries, alive forever.
  for (const client of room.clients) {
    if (client.destroyed || client.writableEnded) room.clients.delete(client);
  }
  if (!room.clients.size) return closeRoom(guildId, room);

  // A slow round of queries must not have the next tick stacked on top of it.
  if (room.busy) return;
  room.busy = true;

  try {
    const next = await fingerprint(guildId);
    const last = lastByGuild.get(guildId);

    // No baseline yet: take one, but only a complete one. A partial baseline
    // would report a change for every section that failed once it recovers.
    if (!last) {
      if (!SECTIONS.some((key) => next[key] === null)) lastByGuild.set(guildId, next);
      return;
    }

    const merged = {};
    const changed = [];
    for (const key of SECTIONS) {
      merged[key] = next[key] === null ? last[key] : next[key];
      if (merged[key] !== last[key]) changed.push(key);
    }
    lastByGuild.set(guildId, merged);

    if (changed.length) {
      for (const client of room.clients) send(client, 'changed', { changed });
    }
  } catch (err) {
    console.error(`[CAD SSE] tick failed for ${guildId}:`, err.message);
  } finally {
    room.busy = false;
  }
}

function startRoom(guildId) {
  const room = { clients: new Set(), timer: null, busy: false };

  // Take the baseline now rather than on the first tick, so a write that lands
  // in the seconds between a viewer's first fetch and that tick is announced
  // instead of folded into the baseline. A guild seen before keeps the
  // baseline it had, which is what makes a reconnect gap visible.
  if (!lastByGuild.has(guildId)) {
    room.busy = true;
    fingerprint(guildId)
      .then((fp) => {
        if (!lastByGuild.has(guildId) && !SECTIONS.some((key) => fp[key] === null)) lastByGuild.set(guildId, fp);
      })
      .catch(() => { /* the first tick will try again */ })
      .then(() => { room.busy = false; });
  }

  room.timer = setInterval(() => tick(guildId, room), TICK_MS);

  // Never hold the process open for a stream.
  if (typeof room.timer.unref === 'function') room.timer.unref();

  rooms.set(guildId, room);
  return room;
}

function join(guildId, res) {
  const room = rooms.get(guildId) || startRoom(guildId);
  room.clients.add(res);
  return room;
}

function leave(guildId, res) {
  const room = rooms.get(guildId);
  if (!room) return;
  room.clients.delete(res);
  if (!room.clients.size) closeRoom(guildId, room);
}

export function eventsHandler(req, res) {
  const { guildId } = req;

  // The route awaits the database and Discord before reaching here. A browser
  // that gave up in that time would be added to the room with nothing left
  // to ever remove it, and the room would tick for nobody.
  if (req.destroyed || res.destroyed || res.writableEnded) return;

  let keepAlive = null;
  const cleanup = () => {
    if (keepAlive) clearInterval(keepAlive);
    leave(guildId, res);
  };
  // Listeners first, then membership, so there is no window between them.
  req.on('close', cleanup);
  req.on('error', cleanup);
  if (typeof res.on === 'function') res.on('close', cleanup);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Koyeb sits behind a proxy that will otherwise buffer the stream and
    // deliver nothing until the connection closes.
    'X-Accel-Buffering': 'no',
  });

  join(guildId, res);
  send(res, 'ready', { guildId });

  // Proxies drop a connection that has been silent too long, so send something
  // well inside that window. A named event rather than a comment line: the
  // browser uses it to notice a connection it still calls open but nothing
  // has come through for a while, which is what a laptop wakes up holding.
  keepAlive = setInterval(() => send(res, 'ping', { t: Date.now() }), 25000);
  if (typeof keepAlive.unref === 'function') keepAlive.unref();
}

/** Test seam: how many guilds currently have viewers. */
export function activeRoomCount() {
  return rooms.size;
}

/** Test seam: whether a guild's last fingerprint survived its room closing. */
export function hasBaseline(guildId) {
  return lastByGuild.has(guildId);
}
