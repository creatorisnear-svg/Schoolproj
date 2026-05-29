import mongoose from 'mongoose';

const officerStatusSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  tenCode: { type: String, default: '10-8' },
  subject: { type: String, default: null },
  location: { type: String, default: null },
  rawCall: { type: String, default: null },
  lastPatrolChannelId: { type: String, default: null },
  trafficStopStartAt: { type: Date, default: null },
  trafficStopChannelId: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
  panicAnnounced: { type: Boolean, default: true },
});

officerStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export default mongoose.model('OfficerStatus', officerStatusSchema);
