import mongoose from 'mongoose';
import FunnelEvent from '../models/FunnelEvent.js';

/**
 * Counting the road to a sale.
 *
 * recordFunnel is fire and forget: nothing that shows a wall or opens a
 * checkout should ever fail because the counter could not be written. The
 * summary is what the dev panel draws.
 */

export const KINDS = ['wall', 'trial', 'pricing', 'checkout', 'paid'];

const clip = (v) => (v === null || v === undefined ? null : String(v).slice(0, 100));

export function recordFunnel({ kind, guildId, userId, feature, source, plan }) {
  if (!KINDS.includes(kind)) return Promise.resolve(null);
  // Never queue writes against a connection that is down; the driver would
  // replay them all at once on reconnect.
  if (mongoose.connection.readyState !== 1) return Promise.resolve(null);

  return FunnelEvent.create({
    kind,
    guildId: clip(guildId),
    userId: clip(userId),
    feature: clip(feature),
    source: clip(source),
    plan: clip(plan),
  }).catch((err) => {
    console.warn('[Funnel] could not record ' + kind + ':', err.message);
    return null;
  });
}

/**
 * The last N days, step by step: how many times each step happened and how
 * many different servers and people it happened to, plus which walls fire
 * most and where pricing page visitors come from.
 */
export async function funnelSummary(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [byKind, walls, sources] = await Promise.all([
    FunnelEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: '$kind',
        events: { $sum: 1 },
        guilds: { $addToSet: '$guildId' },
        users: { $addToSet: '$userId' },
      } },
    ]),
    FunnelEvent.aggregate([
      { $match: { createdAt: { $gte: since }, kind: 'wall' } },
      { $group: { _id: '$feature', count: { $sum: 1 }, guilds: { $addToSet: '$guildId' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    FunnelEvent.aggregate([
      { $match: { createdAt: { $gte: since }, kind: 'pricing' } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const steps = {};
  for (const kind of KINDS) steps[kind] = { events: 0, guilds: 0, users: 0 };
  for (const row of byKind) {
    steps[row._id] = {
      events: row.events,
      guilds: row.guilds.filter(Boolean).length,
      users: row.users.filter(Boolean).length,
    };
  }

  // Ratios between consecutive steps, by distinct server where that is the
  // honest unit (one owner can hit a wall twenty times), by event elsewhere.
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const rates = {
    wallToTrial: pct(steps.trial.guilds, steps.wall.guilds),
    wallToPricing: pct(steps.pricing.events, steps.wall.events),
    pricingToCheckout: pct(steps.checkout.events, steps.pricing.events),
    checkoutToPaid: pct(steps.paid.events, steps.checkout.events),
  };

  return {
    days,
    since,
    steps,
    rates,
    topWalls: walls.map((w) => ({ feature: w._id || 'unknown', count: w.count, guilds: w.guilds.filter(Boolean).length })),
    pricingSources: sources.map((s) => ({ source: s._id || 'direct', count: s.count })),
  };
}
