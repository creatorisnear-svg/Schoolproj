import mongoose from 'mongoose';

const TopggVoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  votedAt: { type: Date, default: Date.now },
  used: { type: Boolean, default: false },
});

TopggVoteSchema.index({ userId: 1 });

export default mongoose.model('TopggVote', TopggVoteSchema);
