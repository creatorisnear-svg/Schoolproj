import mongoose from 'mongoose';

/**
 * Which voice channels RPM CyberCom covers in a server. Two lists are not
 * here: traffic stop channels are DispatchConfig.trafficStopChannelIds, and
 * the police radio channels are the dispatcher's DispatchConfig.patrolChannelIds,
 * so they are set once whether from /setup's RPM CyberCom or AI Voice Dispatch.
 */
const cyberComConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  // Civilian channels: the helper answers to "RPM".
  civilianChannelIds: { type: [String], default: [] },
  // Radios picked before police radios and patrol channels became one list. A
  // helper still covers them until the police radio menu is next saved, which
  // moves them into the patrol channels.
  radioChannelIds: { type: [String], default: [] },
  // Greet people as they join a covered channel (how to talk to it, and that it transcribes).
  greet: { type: Boolean, default: true },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.CyberComConfig || mongoose.model('CyberComConfig', cyberComConfigSchema);
