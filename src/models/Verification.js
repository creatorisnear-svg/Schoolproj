import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  verifyChannelId: {
    type: String,
    default: null,
  },
  welcomeChannelId: {
    type: String,
    default: null,
  },
  unverifiedRoleId: {
    type: String,
    default: null,
  },
  verifiedRoleId: {
    type: String,
    default: null,
  },
  verifiedChannelIds: {
    type: [String],
    default: [],
  },
  customQuestion: {
    type: String,
    default: null,
  },
  verifyDMMessage: {
    type: String,
    default: 'Welcome to our community! You have been verified and can now access all member channels.',
  },
  rpTag: {
    type: String,
    default: null,
  },
});

const Verification = mongoose.model('Verification', verificationSchema);

export default Verification;
