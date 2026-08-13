import mongoose from 'mongoose';

const uptimeLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  online:    { type: Boolean, required: true },
  ping:      { type: Number, default: -1 },
}, { versionKey: false });

// Auto-expire records older than 90 days
uptimeLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.UptimeLog || mongoose.model('UptimeLog', uptimeLogSchema);
