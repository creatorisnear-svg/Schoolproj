import mongoose from 'mongoose';

const pendingVerificationSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  psnxbox: {
    type: String,
    required: true,
  },
  customAnswer: {
    type: String,
    default: null,
  },
  messageId: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800, // Auto-delete after 7 days
  },
});

// The CAD's verification queue and its live-update stream count and read a
// guild's newest row every few seconds; one index serves both.
pendingVerificationSchema.index({ guildId: 1, createdAt: -1 });

const PendingVerification = mongoose.models.PendingVerification || mongoose.model('PendingVerification', pendingVerificationSchema);

export default PendingVerification;
