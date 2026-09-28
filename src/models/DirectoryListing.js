import mongoose from 'mongoose';

/**
 * A server's entry in the public directory of console GTA RP servers at
 * roleplaymanager.xyz/servers.
 *
 * Name, icon and member count are not stored: they are read live from the
 * bot's cache, so a listing can never show a stale name, and a server the bot
 * has left drops out on its own.
 */
const directoryListingSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  listed: { type: Boolean, default: false },
  description: { type: String, default: '', maxlength: 500 },
  platforms: { type: [String], default: [] },
  region: { type: String, default: 'na' },
  tags: { type: [String], default: [] },
  inviteCode: { type: String, default: null },
  inviteChannelId: { type: String, default: null },
  inviteCheckedAt: { type: Date, default: null },
  bumpedAt: { type: Date, default: null },
  bumpedBy: { type: String, default: null },
  // Paid promotion: featured at the top of the directory until this date.
  featuredUntil: { type: Date, default: null },
  // Moderation from the dev panel.
  hidden: { type: Boolean, default: false },
  hiddenReason: { type: String, default: null },
  joinClicks: { type: Number, default: 0 },
  listedAt: { type: Date, default: null },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

directoryListingSchema.index({ listed: 1, hidden: 1 });
directoryListingSchema.index({ featuredUntil: -1 });

const DirectoryListing = mongoose.models.DirectoryListing || mongoose.model('DirectoryListing', directoryListingSchema);

export default DirectoryListing;
