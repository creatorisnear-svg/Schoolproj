import mongoose from 'mongoose';

const voteTrialSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  votedAt: { type: Date, default: Date.now },
  creditExpiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  usedForGuildId: { type: String, default: null },
  usedAt: { type: Date, default: null },
});

voteTrialSchema.index({ userId: 1 });

export default mongoose.models.VoteTrial || mongoose.model('VoteTrial', voteTrialSchema);
