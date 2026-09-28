import mongoose from 'mongoose';

/** An arrest warrant for a character, issued from the web CAD's records. */
const warrantSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  warrantId: { type: String, required: true },
  characterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  characterName: { type: String, required: true },
  charges: { type: String, required: true, maxlength: 300 },
  details: { type: String, default: '', maxlength: 1000 },
  issuedBy: { type: String, required: true },
  issuedByName: { type: String, default: null },
  active: { type: Boolean, default: true },
  closedAs: { type: String, enum: ['served', 'cancelled', null], default: null },
  closedBy: { type: String, default: null },
  closedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

warrantSchema.index({ guildId: 1, active: 1, createdAt: -1 });
warrantSchema.index({ guildId: 1, characterId: 1 });
warrantSchema.index({ guildId: 1, warrantId: 1 }, { unique: true });

const Warrant = mongoose.models.Warrant || mongoose.model('Warrant', warrantSchema);

export default Warrant;
