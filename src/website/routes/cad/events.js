import mongoose from 'mongoose';
import EmergencyCall from '../../../models/EmergencyCall.js';
import OfficerStatus from '../../../models/OfficerStatus.js';
import BOLO from '../../../models/BOLO.js';

/**
 * Live updates for the CAD, over server-sent events.
 *
 * The CAD has to feel live - a 911 raised on a phone should appear on an
 * officer's queue without them reloading. Polling from every open tab would work
 * but the API allows 120 requests per minute per IP, and a squad behind one home
 * network shares that budget; a handful of tabs at a 3 second poll would spend it.
 *
 * So each browser holds one SSE connection instead, and the server does the
 * polling: one lightweight query per guild that has at least one viewer, on a
 * five second tick. Two hundred idle tabs across ten guilds cost ten queries,
 * not two hundred requests.
 *
 * The payload is a fingerprint, not the data. Clients refetch only the section
 * whose fingerprint moved, so this stays cheap regardless of how much a server
 * has in it.
 */

const TICK_MS = 5000;

/** guildId -> { clients:Set<res>, timer, last } */
const rooms = new Map();

async function fingerprint(guildId) {
  const [calls, officers, bolos] = await Promise.all([
    EmergencyCall.find({ guildId, status: 'active' }, 'callId respondingLeoId attachedLeoIds').lean(),
    OfficerStatus.find({ guildId }, 'userId tenCode updatedAt').sort({ updatedAt: -1 }).limit(50).lean(),
    BOLO.countDocuments({ guildId, active: true }),
  ]);

  return {
    calls: calls
      .map((c) => `${c.callId}:${c.respondingLeoId || ''}:${(c.attachedLeoIds || []).length}`)
      .sort()
      .join('|'),
    officers: officers.map((o) => `${o.userId}:${o.tenCode}`).sort().join('|'),
    bolos: String(bolos),
  };
}

function send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The socket is gone; the close handler will clean it up.
  }
}

function startRoom(guildId) {
  const room = { clients: new Set(), timer: null, last: null };

  room.timer = setInterval(async () => {
    // Nothing that touches MongoDB on a timer may run while the connection is
    // down - the driver would queue every one of these and replay them all at
    // once on reconnect.
    if (mongoose.connection.readyState !== 1) return;
    if (!room.clients.size) return;

    try {
      const next = await fingerprint(guildId);

      // The first tick only establishes a baseline. Comparing against null would
      // mark every section changed and make every client refetch on connect.
      const first = room.last === null;
      const changed = first
        ? []
        : ['calls', 'officers', 'bolos'].filter((key) => room.last[key] !== next[key]);
      room.last = next;

      if (changed.length) {
        for (const client of room.clients) send(client, 'changed', { changed });
      }
    } catch (err) {
      console.error(`[CAD SSE] tick failed for ${guildId}:`, err.message);
    }
  }, TICK_MS);

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
  if (!room.clients.size) {
    clearInterval(room.timer);
    rooms.delete(guildId);
  }
}

export function eventsHandler(req, res) {
  const { guildId } = req;

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

  // Proxies drop a connection that has been silent too long, so send a comment
  // line well inside that window. It is not an event and clients ignore it.
  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { /* closed */ }
  }, 25000);
  if (typeof keepAlive.unref === 'function') keepAlive.unref();

  const cleanup = () => {
    clearInterval(keepAlive);
    leave(guildId, res);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
}

/** Test seam: how many guilds currently have viewers. */
export function activeRoomCount() {
  return rooms.size;
}
