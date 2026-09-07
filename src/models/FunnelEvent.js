import mongoose from 'mongoose';

/**
 * One step of the road to a sale, as it happens.
 *
 * Stripe can only see the last two steps (a checkout opened, a payment made).
 * Everything before that, which is where almost everybody drops, happens in
 * Discord and on the site: a premium wall shown, a trial started, the pricing
 * page opened. Recording each one is what makes "where do people stop" a
 * number instead of a guess.
 *
 * Rows expire after 180 days on their own.
 */
const funnelEventSchema = new mongoose.Schema({
  kind: { type: String, required: true, enum: ['wall', 'trial', 'pricing', 'checkout', 'paid'] },
  guildId: { type: String, default: null },
  userId: { type: String, default: null },
  // The command or screen that showed the wall, so the walls that fire most
  // can be found. For pricing views and checkouts: where the visitor came from.
  feature: { type: String, default: null },
  source: { type: String, default: null },
  plan: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, expires: 180 * 24 * 60 * 60 },
});

funnelEventSchema.index({ kind: 1, createdAt: -1 });
funnelEventSchema.index({ guildId: 1, createdAt: -1 });

const FunnelEvent = mongoose.models.FunnelEvent || mongoose.model('FunnelEvent', funnelEventSchema);

export default FunnelEvent;
