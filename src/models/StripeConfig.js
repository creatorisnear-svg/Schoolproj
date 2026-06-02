import mongoose from 'mongoose';

const stripeConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  // Legacy v1 fields (old prices - do not use for new checkouts)
  monthlyPriceId: { type: String, default: null },
  lifetimePriceId: { type: String, default: null },
  quarterlyPriceId: { type: String, default: null },
  monthlyProductId: { type: String, default: null },
  lifetimeProductId: { type: String, default: null },
  quarterlyProductId: { type: String, default: null },
  // v2 fields: $6/mo, $15/3mo, $49.99 lifetime
  monthlyPriceIdV2: { type: String, default: null },
  quarterlyPriceIdV2: { type: String, default: null },
  lifetimePriceIdV2: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const StripeConfig = mongoose.models.StripeConfig || mongoose.model('StripeConfig', stripeConfigSchema);
export default StripeConfig;
