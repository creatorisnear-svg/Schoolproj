import mongoose from 'mongoose';

const stripeConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  monthlyPriceId: { type: String, default: null },
  lifetimePriceId: { type: String, default: null },
  monthlyProductId: { type: String, default: null },
  lifetimeProductId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const StripeConfig = mongoose.model('StripeConfig', stripeConfigSchema);
export default StripeConfig;
