import mongoose from 'mongoose';

/**
 * A donation to RolePlayManager from roleplaymanager.xyz/donate, with the
 * donor's name and note (utils/donations.js). One per Stripe checkout, so
 * the webhook and the success page can both record it.
 */
const donationSchema = new mongoose.Schema({
  stripeSessionId: { type: String, required: true, unique: true },
  amountCents: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  name: { type: String, default: '' },
  note: { type: String, default: '' },
  // The donor's choice: their name and note on the donate page.
  showOnPage: { type: Boolean, default: false },
  // Kept off the page anyway: hidden by the owner, or the note had a link or
  // a slur in it. The owner still reads it.
  hidden: { type: Boolean, default: false },
  hiddenReason: { type: String, default: null }, // 'owner' | 'screened'
  discordId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

donationSchema.index({ showOnPage: 1, hidden: 1, createdAt: -1 });

export default mongoose.models.Donation || mongoose.model('Donation', donationSchema);
