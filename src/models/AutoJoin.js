import mongoose from 'mongoose';

const AutoJoinSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  roleId: { type: String, required: true },
  targetServerId: { type: String, required: true },
  enabled: { type: Boolean, default: true }
});

export default mongoose.models.AutoJoin || mongoose.model('AutoJoin', AutoJoinSchema);
