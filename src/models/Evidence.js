import mongoose from 'mongoose';

/**
 * An item in the evidence locker, a Premium part of the web CAD. Tied to a
 * case reference (an arrest report, a 911 call, a warrant) and optionally to
 * a person, so a detective can pull everything for one case.
 */
const evidenceSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  evidenceId: { type: String, required: true },
  caseRef: { type: String, default: '', maxlength: 60 },
  characterId: { type: mongoose.Schema.Types.ObjectId, default: null },
  characterName: { type: String, default: null },
  description: { type: String, required: true, maxlength: 500 },
  storedAt: { type: String, default: '', maxlength: 120 },
  submittedBy: { type: String, required: true },
  submittedByName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

evidenceSchema.index({ guildId: 1, createdAt: -1 });
evidenceSchema.index({ guildId: 1, caseRef: 1 });
evidenceSchema.index({ guildId: 1, evidenceId: 1 }, { unique: true });

const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', evidenceSchema);

export default Evidence;
