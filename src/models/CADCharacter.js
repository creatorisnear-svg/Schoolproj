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
  age: {
    type: Number,
    default: null,
  },
  gender: {
    type: String,
    default: null,
  },
  hairColor: {
    type: String,
    default: null,
  },
  eyeColor: {
    type: String,
    default: null,
  },
  height: {
    type: String,
    default: null,
  },
  build: {
    type: String,
    default: null,
  },
  distinguishingFeatures: {
    type: String,
    default: null,
  },
  scarsAndTattoos: {
    type: String,
    default: null,
  },
  address: {
    type: String,
    default: null,
  },
  occupation: {
    type: String,
    default: null,
  },
  phoneNumber: {
    type: String,
    default: null,
  },
  socialSecurityNumber: {
    type: String,
    default: null,
  },
  licensePlate: {
    type: String,
    unique: true,
    sparse: true,
  },
  driversLicense: {
    type: String,
    default: null,
  },
  driverLicenseStatus: {
    type: String,
    enum: ['valid', 'suspended', 'revoked'],
    default: 'valid',
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
      year: String,
      condition: String,
      addedAt: { type: Date, default: Date.now },
    },
  ],
  guns: [
    {
      name: String,
      serialNumber: String,
      addedAt: { type: Date, default: Date.now },
    },
  ],
  arrestHistory: [
    {
      charge: String,
      date: Date,
      outcome: String,
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
  medicalInfo: {
    type: String,
    default: null,
  },
  emergencyContact: {
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
