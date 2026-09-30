import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import DutySession from '../models/DutySession.js';
import DutyConfig from '../models/DutyConfig.js';
import ActivityEvent from '../models/ActivityEvent.js';
import CADCharacter from '../models/CADCharacter.js';
import TrafficTicket from '../models/TrafficTicket.js';
import Warrant from '../models/Warrant.js';
import Impound from '../models/Impound.js';
import { isPremiumGuild } from './premiumCheck.js';

/**
 * Session recaps.
 *
 * When the last officer goes off patrol and nobody comes back for ten
 * minutes, the bot posts what the session added up to: time on patrol, 911
 * calls, arrests, tickets, warrants, impounds and the top officers. It goes to
 * the recap channel set with /recap channel, else the patrol report channel.
 * Staff can post one any time with /recap now.
 *
 * On servers without Premium a recap carries a link to add the bot, so every
 * one tells the members who read it where it came from. Members of one RP
 * server very often run another.
 */

const QUIET_MS = 10 * 60 * 1000;
const MIN_SESSION_MS = 30 * 60 * 1000;
const MAX_WINDOW_MS = 12 * 3600 * 1000;
const SITE_LINK = 'https://roleplaymanager.xyz/?from=recap';

const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? h + 'h ' + m + 'm' : m + 'm';
}

let client = null;
export function setRecapClient(c) { client = c; }

const timers = new Map();

export function cancelRecap(guildId) {
  const t = timers.get(guildId);
  if (t) { clearTimeout(t); timers.delete(guildId); }
}

export function scheduleRecap(guildId, delay = QUIET_MS) {
  cancelRecap(guildId);
  const t = setTimeout(() => {
    timers.delete(guildId);
    autoRecap(guildId).catch((err) => console.error('[Recap] ' + guildId + ':', err.message));
  }, delay);
  t.unref?.();
  timers.set(guildId, t);
}

/** Called when an officer goes off patrol. The last one starts the countdown. */
export async function officerLeft(guildId) {
  if (!(await DutySession.exists({ guildId, endedAt: null }))) scheduleRecap(guildId);
}

/** The countdown ran out: post the recap if there was a session worth one. */
export async function autoRecap(guildId) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return null;
  if (await DutySession.exists({ guildId, endedAt: null })) return null;   // someone came back
  const cfg = await DutyConfig.findOne({ guildId });
  if (!cfg || cfg.recapOff) return null;
  const channelId = cfg.recapChannelId || cfg.reportChannelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return null;

  const to = new Date();
  const floor = new Date(Math.max(to.getTime() - MAX_WINDOW_MS, cfg.lastRecapAt ? new Date(cfg.lastRecapAt).getTime() : 0));
  // The session began when the first of the patrols that ended since then began.
  const first = await DutySession.findOne({ guildId, endedAt: { $gt: floor } }).sort({ startedAt: 1 }).lean();
  if (!first) return null;
  const from = new Date(Math.max(floor.getTime(), new Date(first.startedAt).getTime()));
  if (to - from < MIN_SESSION_MS) return null;

  const payload = await buildRecap(guild, from, to);
  if (!payload) return null;
  cfg.lastRecapAt = to;
  await cfg.save();
  await channel.send(payload).catch(() => {});
  return payload;
}

/** The recap for a stretch of time, or null when nothing happened in it. */
export async function buildRecap(guild, from, to) {
  const guildId = guild.id;
  const range = { $gte: from, $lte: to };
  const [patrols, calls, arrests, tickets, warrants, impounds, premium] = await Promise.all([
    DutySession.find({ guildId, startedAt: { $lt: to }, $or: [{ endedAt: null }, { endedAt: { $gt: from } }] }).lean(),
    ActivityEvent.countDocuments({ guildId, kind: 'call', at: range }),
    CADCharacter.aggregate([
      { $match: { guildId, 'arrestHistory.date': range } },
      { $unwind: '$arrestHistory' },
      { $match: { 'arrestHistory.date': range } },
      { $group: { _id: '$arrestHistory.officerId', n: { $sum: 1 } } },
    ]),
    TrafficTicket.aggregate([
      { $match: { guildId, createdAt: range } },
      { $group: { _id: '$issuedBy', n: { $sum: 1 } } },
    ]),
    Warrant.countDocuments({ guildId, createdAt: range }),
    Impound.countDocuments({ guildId, createdAt: range }),
    isPremiumGuild(guildId).catch(() => false),
  ]);

  const officers = new Map();
  const add = (id, key, n) => {
    if (!id) return;
    const o = officers.get(id) || { id, seconds: 0, arrests: 0, tickets: 0 };
    o[key] += n;
    officers.set(id, o);
  };
  for (const p of patrols) {
    const start = Math.max(new Date(p.startedAt).getTime(), from.getTime());
    const end = Math.min(p.endedAt ? new Date(p.endedAt).getTime() : to.getTime(), to.getTime());
    let s = Math.max(0, Math.floor((end - start) / 1000));
    // A finished patrol that did not count (alone, or too short) counts nothing here either.
    if (p.endedAt) s = Math.min(s, p.seconds || 0);
    add(p.userId, 'seconds', s);
  }
  for (const a of arrests) add(a._id, 'arrests', a.n);
  for (const t of tickets) add(t._id, 'tickets', t.n);

  const all = [...officers.values()];
  const onPatrol = all.filter((o) => o.seconds > 0);
  const patrolSeconds = onPatrol.reduce((n, o) => n + o.seconds, 0);
  const arrestCount = arrests.reduce((n, a) => n + a.n, 0);
  const ticketCount = tickets.reduce((n, t) => n + t.n, 0);
  if (!patrolSeconds && !calls && !arrestCount && !ticketCount && !warrants && !impounds) return null;

  const lines = [
    '<t:' + unix(from) + ':f> to <t:' + unix(to) + ':t>',
    '',
    '**On patrol:** ' + (onPatrol.length
      ? onPatrol.length + (onPatrol.length === 1 ? ' officer, ' : ' officers, ') + duration(patrolSeconds) + ' in total'
      : 'no patrol time tracked'),
    '**911 calls:** ' + calls,
    '**Arrests:** ' + arrestCount + '  ·  **Tickets:** ' + ticketCount + '  ·  **Warrants:** ' + warrants + '  ·  **Impounds:** ' + impounds,
  ];

  const top = all
    .filter((o) => o.seconds > 0 || o.arrests || o.tickets)
    .sort((a, b) => (b.seconds - a.seconds) || ((b.arrests + b.tickets) - (a.arrests + a.tickets)))
    .slice(0, 3);
  if (top.length) {
    lines.push('', '**Top officers**');
    top.forEach((o, i) => {
      const bits = [];
      if (o.seconds) bits.push(duration(o.seconds) + ' on patrol');
      if (o.arrests) bits.push(o.arrests + (o.arrests === 1 ? ' arrest' : ' arrests'));
      if (o.tickets) bits.push(o.tickets + (o.tickets === 1 ? ' ticket' : ' tickets'));
      lines.push('`' + (i + 1) + '.` <@' + o.id + '>  ' + bits.join(', '));
    });
  }

  const payload = {
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle('Session recap: ' + guild.name)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: 'RPM · Posted when the last officer goes off patrol' })],
    allowedMentions: { parse: [] },
    components: [],
  };
  if (!premium) {
    payload.components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Get RolePlayManager for your server').setStyle(ButtonStyle.Link).setURL(SITE_LINK),
    )];
  }
  return payload;
}
