import mongoose from 'mongoose';

/**
 * A traffic stop run through RPM CyberCom: who is in it, which channel, and
 * where everyone came from so they can be moved back when it ends. A stop
 * whose suspect runs becomes a pursuit (10-80) that other units can attach to.
 */
const cyberComStopSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  officerId: { type: String, required: true },
  officerName: { type: String, default: null },
  subjectId: { type: String, default: null },
  subjectName: { type: String, default: null },
  // Officers whose CAD status this stop set: the officer, and units attached to a 10-80.
  unitIds: { type: [String], default: [] },
  // Everyone moved into the stop, and the channel they were in before.
  returnTo: { type: [{ userId: String, channelId: String, _id: false }], default: [] },
  status: { type: String, enum: ['active', 'pursuit', 'closed'], default: 'active' },
  pursuitAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  // Closed stops are kept two days, then removed.
  expireAt: { type: Date, default: null },
});

cyberComStopSchema.index({ guildId: 1, status: 1, createdAt: -1 });
cyberComStopSchema.index({ guildId: 1, channelId: 1, status: 1 });
cyberComStopSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.CyberComStop || mongoose.model('CyberComStop', cyberComStopSchema);
