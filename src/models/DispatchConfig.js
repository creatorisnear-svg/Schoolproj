import mongoose from 'mongoose';

const dispatchConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  aiEnabled: { type: Boolean, default: true },
  dispatchChannelId: { type: String, default: null },
  statusBoardChannelId: { type: String, default: null },
  statusBoardMessageId: { type: String, default: null },
  leoRoleIds: { type: [String], default: [] },
  patrolChannelIds: { type: [String], default: [] },
  trafficStopChannelIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.DispatchConfig || mongoose.model('DispatchConfig', dispatchConfigSchema);
