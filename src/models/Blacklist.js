import mongoose from 'mongoose';

const blacklistSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  discordId: { type: String, default: null },
  discordUsername: { type: String, default: null },
  gamertag: { type: String, default: null },
  reason: { type: String, required: true },
  ipBanned: { type: Boolean, default: false },
  ipAddress: { type: String, default: null },
  addedBy: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
});

blacklistSchema.index({ guildId: 1, active: 1 });

export default mongoose.models.Blacklist || mongoose.model('Blacklist', blacklistSchema);
