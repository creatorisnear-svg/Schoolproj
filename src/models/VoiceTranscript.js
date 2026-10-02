import mongoose from 'mongoose';

/**
 * One thing someone said in a voice channel RPM CyberCom covers. Staff read
 * these with /voicemoderation. Deleted automatically after 14 days; people
 * are told the channel is transcribed when they join it.
 */
export const TRANSCRIPT_DAYS = 14;

const voiceTranscriptSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  channelName: { type: String, default: null },
  userId: { type: String, required: true },
  username: { type: String, default: null },
  text: { type: String, required: true },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

voiceTranscriptSchema.index({ guildId: 1, channelId: 1, at: 1 });
voiceTranscriptSchema.index({ guildId: 1, userId: 1, at: 1 });
voiceTranscriptSchema.index({ at: 1 }, { expireAfterSeconds: TRANSCRIPT_DAYS * 86400 });

export default mongoose.models.VoiceTranscript || mongoose.model('VoiceTranscript', voiceTranscriptSchema);
