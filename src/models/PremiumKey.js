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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Stripe billing fields
  stripeCustomerId: { type: String, default: null },
  stripeSessionId: { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  stripePaymentIntentId: { type: String, default: null },
  plan: { type: String, enum: ['monthly', 'lifetime', 'manual'], default: 'manual' },
  purchasedBy: { type: String, default: null },
  tosAcceptedAt: { type: Date, default: null },
  subscriptionStatus: { type: String, default: null },
  subscriptionCurrentPeriodEnd: { type: Date, default: null },
});

premiumKeySchema.index({ guildId: 1 });
premiumKeySchema.index({ stripeCustomerId: 1 });
premiumKeySchema.index({ stripeSubscriptionId: 1 });

const PremiumKey = mongoose.models.PremiumKey || mongoose.model('PremiumKey', premiumKeySchema);

export default PremiumKey;
