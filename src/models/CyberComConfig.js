import mongoose from 'mongoose';

/**
 * Which voice channels RPM CyberCom covers in a server. Traffic stop channels
 * are not here: they are DispatchConfig.trafficStopChannelIds, which the
 * dispatcher already uses.
 */
const cyberComConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  // Civilian channels: the helper answers to "RPM".
  civilianChannelIds: { type: [String], default: [] },
  // Police radio channels besides the dispatcher's own: the helper answers to "dispatch".
  radioChannelIds: { type: [String], default: [] },
  // Greet people as they join a covered channel (how to talk to it, and that it transcribes).
  greet: { type: Boolean, default: true },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.CyberComConfig || mongoose.model('CyberComConfig', cyberComConfigSchema);
