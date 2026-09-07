import mongoose from 'mongoose';

const premiumKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  guildId: {
    type: String,
    default: null,
  },
  guildName: {
    type: String,
    default: null,
  },
  activatedBy: {
    type: String,
    default: null,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  // How it was attached: command, dashboard, or checkout (the server was
  // chosen before paying and Premium switched on by itself).
  activatedVia: { type: String, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Stripe billing fields
  stripeCustomerId: { type: String, default: null },
  // No null default on purpose: the unique index below is sparse, and a sparse
  // index skips a missing field but not an explicit null. With the default,
  // a second key made without a Stripe session (the dev panel's generator)
  // collided with the first.
  stripeSessionId: { type: String },
  stripeSubscriptionId: { type: String, default: null },
  stripePaymentIntentId: { type: String, default: null },
  plan: { type: String, enum: ['monthly', 'quarterly', 'lifetime', 'manual'], default: 'manual' },
  purchasedBy: { type: String, default: null },
  // The server picked at checkout, kept even if activation had to wait.
  purchasedGuildId: { type: String, default: null },
  tosAcceptedAt: { type: Date, default: null },
  subscriptionStatus: { type: String, default: null },
  subscriptionCurrentPeriodEnd: { type: Date, default: null },
  // When a lapsed key is moved aside so a new one can take its server.
  previousGuildId: { type: String, default: null },
  replacedAt: { type: Date, default: null },
  // So a failed payment is mentioned once a day, not once per retry.
  lastPaymentFailedDmAt: { type: Date, default: null },
  endedDmAt: { type: Date, default: null },
});

premiumKeySchema.index({ guildId: 1 });
premiumKeySchema.index({ stripeCustomerId: 1 });
premiumKeySchema.index({ stripeSubscriptionId: 1 });
premiumKeySchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

const PremiumKey = mongoose.models.PremiumKey || mongoose.model('PremiumKey', premiumKeySchema);

export default PremiumKey;
