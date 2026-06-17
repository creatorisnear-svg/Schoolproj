import mongoose from 'mongoose';

const verifiedUserSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  psnxbox: { type: String, default: null },
  ipAddress: { type: String, default: null },
  verifiedAt: { type: Date, default: Date.now },
});

verifiedUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export default mongoose.models.VerifiedUser || mongoose.model('VerifiedUser', verifiedUserSchema);
