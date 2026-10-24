import mongoose from 'mongoose';

/**
 * Free time given to a server, separate from its own trials: Premium or RPM
 * CyberCom until endsAt (utils/premiumGift.js, utils/giftCampaign.js). One per
 * server, kind and reason, so a campaign that runs twice gives nothing twice.
 */
const premiumGiftSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  kind: { type: String, required: true, enum: ['premium', 'cybercom'] },
  reason: { type: String, required: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  // Set once the end has been acted on: caches cleared, dispatch and helpers told.
  endHandled: { type: Boolean, default: false },
});

premiumGiftSchema.index({ guildId: 1, kind: 1, reason: 1 }, { unique: true });
premiumGiftSchema.index({ endsAt: 1, endHandled: 1 });

export default mongoose.models.PremiumGift || mongoose.model('PremiumGift', premiumGiftSchema);
