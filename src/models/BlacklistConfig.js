import mongoose from 'mongoose';

const blacklistConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  panelChannelId: { type: String, default: null },
  panelMessageId: { type: String, default: null },
});

export default mongoose.models.BlacklistConfig || mongoose.model('BlacklistConfig', blacklistConfigSchema);
