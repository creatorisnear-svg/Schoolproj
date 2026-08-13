import mongoose from 'mongoose';

const AutoRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  roleId: { type: String, required: true },
  enabled: { type: Boolean, default: true }
});

export default mongoose.models.AutoRole || mongoose.model('AutoRole', AutoRoleSchema);
