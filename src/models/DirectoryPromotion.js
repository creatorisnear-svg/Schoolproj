import mongoose from 'mongoose';

/**
 * A paid featured spot in the directory. One row per Stripe checkout, so the
 * webhook and the success page can both try to apply it and only one does.
 */
const directoryPromotionSchema = new mongoose.Schema({
  stripeSessionId: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  buyerId: { type: String, default: null },
  days: { type: Number, required: true },
  amount: { type: Number, default: 0 },
  featuredUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

directoryPromotionSchema.index({ guildId: 1, createdAt: -1 });

const DirectoryPromotion = mongoose.models.DirectoryPromotion || mongoose.model('DirectoryPromotion', directoryPromotionSchema);

export default DirectoryPromotion;
