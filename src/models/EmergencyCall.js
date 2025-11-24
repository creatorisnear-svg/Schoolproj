import { Schema, model } from 'mongoose';

const emergencyCallSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  callId: { type: String, required: true, unique: true },
  issue: String,
  location: String,
  suspectsDescription: String,
  lastSeen: String,
  contact: String,
  reporterUsername: String,
  reporterId: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  respondingLeoId: String,
  respondingLeoUsername: String,
  attachedLeoIds: [String],
  closedAt: Date,
  closedBy: String,
});

export default model('EmergencyCall', emergencyCallSchema);
