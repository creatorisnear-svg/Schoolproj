import mongoose from 'mongoose';

const dispatchConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  aiEnabled: { type: Boolean, default: true },
  dispatchChannelId: { type: String, default: null },
  statusBoardChannelId: { type: String, default: null },
  statusBoardMessageId: { type: String, default: null },
  patrolChannelIds: { type: [String], default: [] },
  trafficStopChannelId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('DispatchConfig', dispatchConfigSchema);
