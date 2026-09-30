import mongoose from 'mongoose';

/** One server's Safety Network settings. See utils/safetyNetwork.js. */
const safetyNetworkConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  // This server's bans count as warnings for other servers.
  share: { type: Boolean, default: false },
  // Warn this server when someone banned elsewhere in the network joins.
  alerts: { type: Boolean, default: false },
  alertChannelId: { type: String, default: null },
  // Premium: ban on join when banned in at least this many servers. 0 is off.
  autoBanAt: { type: Number, default: 0 },
  importedAt: { type: Date, default: null },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

safetyNetworkConfigSchema.index({ share: 1 });

export default mongoose.models.SafetyNetworkConfig || mongoose.model('SafetyNetworkConfig', safetyNetworkConfigSchema);
