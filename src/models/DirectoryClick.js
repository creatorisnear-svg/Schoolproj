import mongoose from 'mongoose';

/** A Join button press in the directory, kept 90 days for the owner's stats. */
const directoryClickSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 90 * 24 * 60 * 60 },
});

directoryClickSchema.index({ guildId: 1, createdAt: -1 });

const DirectoryClick = mongoose.models.DirectoryClick || mongoose.model('DirectoryClick', directoryClickSchema);

export default DirectoryClick;
