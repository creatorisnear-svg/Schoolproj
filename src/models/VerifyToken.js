import mongoose from 'mongoose';

const verifyTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

export default mongoose.models.VerifyToken || mongoose.model('VerifyToken', verifyTokenSchema);
