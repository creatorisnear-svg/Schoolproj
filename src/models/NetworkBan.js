import mongoose from 'mongoose';

/**
 * A ban shared with the Safety Network by a server that opted in. Unbanning
 * switches it off. Which server it came from is never shown to other servers.
 */
const networkBanSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: { type: String, default: null },
  bannedAt: { type: Date, default: Date.now },
  source: { type: String, enum: ['ban', 'import'], default: 'ban' },
  active: { type: Boolean, default: true },
});

networkBanSchema.index({ guildId: 1, userId: 1 }, { unique: true });
networkBanSchema.index({ userId: 1, active: 1 });

export default mongoose.models.NetworkBan || mongoose.model('NetworkBan', networkBanSchema);
