import mongoose from 'mongoose';

/**
 * AI voice usage, one row per server per month.
 *
 * The dispatcher runs on Groq's free tier with paid OpenAI behind it, and the
 * free pool is shared by every server. Without a count there is no way to know
 * whether a $5 server costs $0.20 or $12 a month, or which server is doing it.
 * guildId '*' holds the totals for the whole bot, including calls that are not
 * tied to one server (cached announcements, join lines).
 */
const aiUsageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  month: { type: String, required: true }, // YYYY-MM, UTC
  utterances: { type: Number, default: 0 }, // officer speech sent to transcription
  replies: { type: Number, default: 0 },    // AI answers generated
  readouts: { type: Number, default: 0 },   // 911 calls read out
  stt: { type: Number, default: 0 },
  llm: { type: Number, default: 0 },
  tts: { type: Number, default: 0 },
  ttsChars: { type: Number, default: 0 },
  ttsCached: { type: Number, default: 0 },
  groq: { type: Number, default: 0 },
  openai: { type: Number, default: 0 },     // paid fallback calls: the ones that cost money
  noticeSentAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});

aiUsageSchema.index({ guildId: 1, month: 1 }, { unique: true });
aiUsageSchema.index({ month: 1, utterances: -1 });

const AIUsage = mongoose.models.AIUsage || mongoose.model('AIUsage', aiUsageSchema);

export default AIUsage;
