import mongoose from 'mongoose';

/**
 * One-time offers the bot has sent (utils/outreach.js), one row per offer and
 * server, so nobody is asked twice. Kept even when the DM could not be
 * delivered, so a closed inbox is not retried every few hours.
 */
const outreachSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // '<kind>:<guildId>'
  kind: { type: String, required: true },
  guildId: { type: String, required: true },
  userId: { type: String, default: null },
  delivered: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now },
});

export default mongoose.models.Outreach || mongoose.model('Outreach', outreachSchema);
