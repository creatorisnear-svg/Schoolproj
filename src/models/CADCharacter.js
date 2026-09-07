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
      // Issued, never typed. A plate can be swapped or stolen; the VIN is what
      // ties a recovered vehicle back to this record.
      vin: String,
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
}, {
  // updatedAt only: createdAt is already a field of its own above. The web
  // CAD's live updates fingerprint a guild's characters by count and newest
  // edit, and every write path here (save, updateOne, findOneAndUpdate)
  // bumps this.
  timestamps: { createdAt: false, updatedAt: true },
});

cadCharacterSchema.index({ guildId: 1, userId: 1 });
// The newest-edit lookup the CAD stream makes every few seconds per guild.
cadCharacterSchema.index({ guildId: 1, updatedAt: -1 });

// Plates are unique within a server, not across the platform.
//
// Both fields used to carry a bare `unique: true`, which builds a GLOBAL index:
// once any server registered ABC123, every other server was permanently blocked
// from using it.
//
// The first per-guild fix used `unique + sparse`, which does not mean what it
// looks like. Sparse omits a document only when EVERY indexed field is missing -
// and guildId is always present. So two characters with no plate both keyed on
// (guildId, null), and the second one was rejected. That is why people could not
// create a second character.
//
// partialFilterExpression is the right tool: index the document only when the
// plate is actually a string.
cadCharacterSchema.index(
  { guildId: 1, licensePlate: 1 },
  {
    unique: true,
    partialFilterExpression: { licensePlate: { $type: 'string' } },
    name: 'guildId_1_licensePlate_1',
  }
);

// Deliberately NOT unique. An index over an array field is multikey, and once a
// document matches the partial filter every entry is indexed - nulls included -
// so one character owning both a plated and a plateless vehicle would block any
// other character in the same shape. Vehicle plate uniqueness is enforced in
// src/utils/cadIdentifiers.js instead, over plates that are never null.
cadCharacterSchema.index(
  { guildId: 1, 'vehicles.licensePlate': 1 },
  { name: 'guildId_1_vehicles.licensePlate_1' }
);

const CADCharacter = mongoose.models.CADCharacter || mongoose.model('CADCharacter', cadCharacterSchema);

export default CADCharacter;
