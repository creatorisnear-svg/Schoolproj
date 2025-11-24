import mongoose from 'mongoose';

const cadCharacterSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  characterName: {
    type: String,
    required: true,
  },
  licensePlate: {
    type: String,
    unique: true,
    sparse: true,
  },
  vehicles: [
    {
      make: String,
      model: String,
      color: String,
      licensePlate: {
        type: String,
        unique: true,
        sparse: true,
      },
      addedAt: { type: Date, default: Date.now },
    },
  ],
  guns: [
    {
      name: String,
      addedAt: { type: Date, default: Date.now },
    },
  ],
  status: {
    type: String,
    enum: ['wanted', 'clean'],
    default: 'clean',
  },
  wantedReason: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

cadCharacterSchema.index({ guildId: 1, userId: 1 });
cadCharacterSchema.index({ licensePlate: 1 });

const CADCharacter = mongoose.model('CADCharacter', cadCharacterSchema);

export default CADCharacter;
