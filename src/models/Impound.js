import mongoose from 'mongoose';

/** A vehicle held in the impound lot, by plate. */
const impoundSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  impoundId: { type: String, required: true },
  licensePlate: { type: String, required: true },
  vehicle: { type: String, default: '' },
  characterId: { type: mongoose.Schema.Types.ObjectId, default: null },
  characterName: { type: String, default: null },
  reason: { type: String, required: true, maxlength: 300 },
  officerId: { type: String, required: true },
  officerName: { type: String, default: null },
  active: { type: Boolean, default: true },
  releasedBy: { type: String, default: null },
  releasedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

impoundSchema.index({ guildId: 1, active: 1, createdAt: -1 });
impoundSchema.index({ guildId: 1, licensePlate: 1, active: 1 });
impoundSchema.index({ guildId: 1, impoundId: 1 }, { unique: true });

const Impound = mongoose.models.Impound || mongoose.model('Impound', impoundSchema);

export default Impound;
