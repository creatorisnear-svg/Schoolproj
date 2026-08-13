import mongoose from 'mongoose';

const memberMovementConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  panelChannelId: { type: String, default: null },
  panelMessageId: { type: String, default: null },
  allowedChannelIds: { type: [String], default: [] },
});

const MemberMovementConfig = mongoose.models.MemberMovementConfig
  || mongoose.model('MemberMovementConfig', memberMovementConfigSchema);
export default MemberMovementConfig;
