import mongoose from 'mongoose';
import AIUsage from '../models/AIUsage.js';

/**
 * Counting what AI dispatch uses, and a fair monthly allowance.
 *
 * A $5 server that runs sessions every night could cost more than it pays
 * once Groq's shared free pool runs out and traffic falls through to paid
 * OpenAI. The allowance is set well above what a normal server uses, and when
 * it runs out the bot degrades rather than dies: premium servers go back to
 * reading out 911 calls, free servers keep getting 911 calls in text.
 */

// Officer lines sent for transcription, per premium server per month. About
// 170 a day: several busy sessions a week.
export const PREMIUM_UTTERANCES_PER_MONTH = 5000;
// Spoken 911 read-outs per free server per month.
export const FREE_READOUTS_PER_MONTH = 100;

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/** Add to the counters for one server and for the bot as a whole. Never throws. */
export function recordAI(guildId, fields) {
  if (mongoose.connection.readyState !== 1) return Promise.resolve();
  const inc = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (typeof v === 'number' && v) inc[k] = v;
  }
  if (!Object.keys(inc).length) return Promise.resolve();
  const month = monthKey();
  const ids = guildId && guildId !== '*' ? [guildId, '*'] : ['*'];
  return Promise.all(ids.map((id) => AIUsage.updateOne(
    { guildId: id, month },
    { $inc: inc, $set: { updatedAt: new Date() } },
    { upsert: true },
  ))).catch((err) => console.warn('[AI Usage] could not record:', err.message));
}

/** This month's row for a server, or zeros. */
export async function usageFor(guildId, month = monthKey()) {
  const row = await AIUsage.findOne({ guildId, month }).lean().catch(() => null);
  return row || { guildId, month, utterances: 0, replies: 0, readouts: 0, openai: 0, noticeSentAt: null };
}

/**
 * Is there allowance left? kind is 'utterances' (premium listening) or
 * 'readouts' (free 911 read-outs). Fails open: a counting problem must never
 * switch dispatch off.
 */
export async function withinAllowance(guildId, kind) {
  try {
    const limit = kind === 'readouts' ? FREE_READOUTS_PER_MONTH : PREMIUM_UTTERANCES_PER_MONTH;
    const row = await usageFor(guildId);
    const used = row[kind] || 0;
    return { allowed: used < limit, used, limit };
  } catch {
    return { allowed: true, used: 0, limit: 0 };
  }
}

/**
 * Mark the allowance notice as sent for this month. Returns true only to the
 * first caller, so the notice goes out once however many lines hit the limit.
 */
export async function claimAllowanceNotice(guildId) {
  const month = monthKey();
  const res = await AIUsage.updateOne(
    { guildId, month, noticeSentAt: null },
    { $set: { noticeSentAt: new Date() } },
  ).catch(() => null);
  return !!(res && res.modifiedCount === 1);
}

/** For the dev panel: this month's totals and the heaviest servers. */
export async function usageSummary(month = monthKey()) {
  const [total, top] = await Promise.all([
    AIUsage.findOne({ guildId: '*', month }).lean(),
    AIUsage.find({ month, guildId: { $ne: '*' } }).sort({ utterances: -1, readouts: -1 }).limit(10).lean(),
  ]);
  return {
    month,
    total: total || null,
    top: top.map((r) => ({
      guildId: r.guildId, utterances: r.utterances || 0, replies: r.replies || 0,
      readouts: r.readouts || 0, openai: r.openai || 0,
    })),
    limits: { premiumUtterances: PREMIUM_UTTERANCES_PER_MONTH, freeReadouts: FREE_READOUTS_PER_MONTH },
  };
}
