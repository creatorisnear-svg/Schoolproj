import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

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
  attachedLeoIds: { type: [String], default: [] },
  closedAt: Date,
  closedBy: String,
  messageId: String,
  channelId: String,
  dispatchAnnounced: { type: Boolean, default: false },
});

// The CAD queue, the dispatch pollers and the CAD stream all read a guild's
// active calls; this keeps that off the closed ones.
emergencyCallSchema.index({ guildId: 1, status: 1 });

// Calls are deleted once dismissed or stale, so session recaps count them as
// they come in (models/ActivityEvent.js). Every way a call is made saves it.
emergencyCallSchema.pre('save', function () {
  this.$locals.wasNew = this.isNew;
});
emergencyCallSchema.post('save', function (doc) {
  if (!doc.$locals?.wasNew || !doc.guildId) return;
  import('./ActivityEvent.js')
    .then(({ default: ActivityEvent }) => ActivityEvent.create({ guildId: doc.guildId, kind: 'call', at: doc.timestamp || new Date() }))
    .catch(() => {});
});

export default models.EmergencyCall || model('EmergencyCall', emergencyCallSchema);
