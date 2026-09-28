import mongoose from 'mongoose';

/** Somebody reporting a directory listing, for review in the dev panel. */
const directoryReportSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: { type: String, default: '', maxlength: 300 },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

directoryReportSchema.index({ resolved: 1, createdAt: -1 });
directoryReportSchema.index({ guildId: 1, userId: 1 });

const DirectoryReport = mongoose.models.DirectoryReport || mongoose.model('DirectoryReport', directoryReportSchema);

export default DirectoryReport;
