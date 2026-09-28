import mongoose from 'mongoose';

/**
 * The bot's look on one server: nickname, avatar, banner and profile text, a
 * Premium perk. Kept so it can be put back to the default when Premium ends.
 */
const guildBrandingSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  nick: { type: String, default: null },
  bio: { type: String, default: null },
  hasAvatar: { type: Boolean, default: false },
  hasBanner: { type: Boolean, default: false },
  appliedAt: { type: Date, default: null },
  appliedBy: { type: String, default: null },
});

const GuildBranding = mongoose.models.GuildBranding || mongoose.model('GuildBranding', guildBrandingSchema);

export default GuildBranding;
