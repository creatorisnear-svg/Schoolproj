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
  // Uniqueness is enforced per guild by the compound index at the bottom of this
  // file, not here. A bare `unique: true` made plates unique across every server
  // on the platform, so one server registering ABC123 permanently blocked every
  // other server from using it.
  licensePlate: {
    type: String,
  },
  driversLicense: {
    type: String,
    default: null,
  },
  driverLicenseStatus: {
    type: String,
    enum: ['valid', 'invalid'],
    default: 'valid',
  },
  veteranStatus: {
    type: String,
    enum: ['veteran', 'organ_donor', 'none'],
    default: 'none',
  },
  vehicles: [
    {
      make: String,
      model: String,
      color: String,
      // Same as above - scoped per guild by the compound index below.
      licensePlate: {
        type: String,
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

// Plates are unique within a server, not across the platform.
//
// Both licensePlate fields used to carry `unique: true`, which builds a global
// index: once any server registered ABC123, every other server was permanently
// blocked from using it. Harmless while a single server used the CAD, and a
// guaranteed source of unexplainable errors the moment a second one did.
//
// Mongoose will not drop the old global indexes on an existing database - run
// scripts/fix-plate-indexes.js once against production before relying on these.
cadCharacterSchema.index({ guildId: 1, licensePlate: 1 }, { unique: true, sparse: true });
cadCharacterSchema.index({ guildId: 1, 'vehicles.licensePlate': 1 }, { unique: true, sparse: true });

const CADCharacter = mongoose.models.CADCharacter || mongoose.model('CADCharacter', cadCharacterSchema);

export default CADCharacter;
