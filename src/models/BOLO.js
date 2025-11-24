import mongoose from 'mongoose';

const boloSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  boloId: {
    type: String,
    required: true,
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CADCharacter',
    required: true,
  },
  characterName: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  vehicles: [
    {
      make: String,
      model: String,
      color: String,
      licensePlate: String,
      year: String,
      notes: String,
    },
  ],
  issuedBy: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000),
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  resolvedBy: {
    type: String,
    default: null,
  },
});

boloSchema.index({ guildId: 1, characterId: 1 });
boloSchema.index({ guildId: 1, boloId: 1 });
boloSchema.index({ guildId: 1, active: 1 });

const BOLO = mongoose.model('BOLO', boloSchema);

export default BOLO;
