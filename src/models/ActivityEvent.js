import mongoose from 'mongoose';

/**
 * A small log of things session recaps count that are deleted from their own
 * collection once handled: a 911 call is removed when it is dismissed or goes
 * stale, so the calls collection cannot say how many came in last night.
 * Kept for 30 days.
 */
const activityEventSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  kind: { type: String, required: true, enum: ['call'] },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

activityEventSchema.index({ guildId: 1, kind: 1, at: -1 });
activityEventSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 86400 });

export default mongoose.models.ActivityEvent || mongoose.model('ActivityEvent', activityEventSchema);
