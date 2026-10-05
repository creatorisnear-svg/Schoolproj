import mongoose from 'mongoose';

/**
 * RPM CyberCom free for four days, once per server (cybercom/trial.js). The
 * document stays after the trial ends: it is what says the trial was used.
 */
const cyberComTrialSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  startedBy: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  // One message each, ever, from the trial job.
  endingSoonSent: { type: Boolean, default: false },
  endedSent: { type: Boolean, default: false },
});

cyberComTrialSchema.index({ endsAt: 1, endedSent: 1 });

export default mongoose.models.CyberComTrial || mongoose.model('CyberComTrial', cyberComTrialSchema);
