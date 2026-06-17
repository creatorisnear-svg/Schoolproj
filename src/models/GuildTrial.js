import mongoose from 'mongoose';

const guildTrialSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  activatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  activatedBy: { type: String, required: true },
  expiredMessageSent: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
});

guildTrialSchema.index({ guildId: 1 });
guildTrialSchema.index({ expiresAt: 1, expiredMessageSent: 1 });

export default mongoose.models.GuildTrial || mongoose.model('GuildTrial', guildTrialSchema);
