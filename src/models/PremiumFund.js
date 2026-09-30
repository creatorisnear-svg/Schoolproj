import mongoose from 'mongoose';

/**
 * Money a server's members have put toward its Premium. Every $5 becomes a
 * month of Premium (a PremiumKey with plan 'fund'); what is left over waits
 * for the next chip-in. See utils/premiumFund.js.
 */
const contributionSchema = new mongoose.Schema({
  stripeSessionId: { type: String, required: true },
  userId: { type: String, default: null },
  amountCents: { type: Number, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const premiumFundSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  balanceCents: { type: Number, default: 0 },
  raisedCents: { type: Number, default: 0 },
  monthsUnlocked: { type: Number, default: 0 },
  contributions: { type: [contributionSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.PremiumFund || mongoose.model('PremiumFund', premiumFundSchema);
