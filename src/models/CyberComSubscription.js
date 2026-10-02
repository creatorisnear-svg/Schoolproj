import mongoose from 'mongoose';

/**
 * RPM CyberCom, the paid voice add-on ($9.99 a month on top of Premium),
 * one per server. Bought through Stripe (routes/checkout.js); kept in step
 * by the subscription webhooks. See src/cybercom/.
 */
const cyberComSubscriptionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  status: { type: String, default: 'active' }, // active, past_due, cancelling, cancelled, ...
  stripeSubscriptionId: { type: String, default: null },
  stripeCustomerId: { type: String, default: null },
  stripeSessionId: { type: String, default: null },
  currentPeriodEnd: { type: Date, default: null },
  purchasedBy: { type: String, default: null },
  // 'stripe' when bought; 'dev' when given from the dev panel. The server
  // sees no difference.
  source: { type: String, default: 'stripe' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

cyberComSubscriptionSchema.index({ stripeSubscriptionId: 1 });

export default mongoose.models.CyberComSubscription || mongoose.model('CyberComSubscription', cyberComSubscriptionSchema);
