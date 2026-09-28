import mongoose from 'mongoose';

/**
 * One vote for a server in the directory. Votes count for 30 days and then
 * expire, so the top of the list reflects servers people care about now.
 */
const directoryVoteSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 },
});

directoryVoteSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
directoryVoteSchema.index({ guildId: 1, createdAt: -1 });

const DirectoryVote = mongoose.models.DirectoryVote || mongoose.model('DirectoryVote', directoryVoteSchema);

export default DirectoryVote;
