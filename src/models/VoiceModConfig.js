import mongoose from 'mongoose';

/**
 * Voice moderation for RPM CyberCom: who can read transcripts, how long they
 * are kept, and what is flagged to staff and where. Set in /setup under
 * RPM CyberCom, Voice moderation.
 */
const voiceModConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  // Roles that may read transcripts and flags. Empty: the server's staff.
  readerRoleIds: { type: [String], default: [] },
  retentionDays: { type: Number, enum: [3, 7, 14], default: 14 },
  // Where flags are posted. None set: nothing is flagged.
  flagChannelId: { type: String, default: null },
  flagSlurs: { type: Boolean, default: true },
  flagSelfHarm: { type: Boolean, default: true },
  flagThreats: { type: Boolean, default: true },
  flagRules: { type: Boolean, default: true },
  // The server's own words and phrases to flag.
  customTerms: { type: [String], default: [] },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.VoiceModConfig || mongoose.model('VoiceModConfig', voiceModConfigSchema);
