import mongoose from 'mongoose';

const cadConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  leoRoleIds: [String],
  fireDepartmentRoleIds: [String],
  staffRoleIds: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const CADConfig = mongoose.models.CADConfig || mongoose.model('CADConfig', cadConfigSchema);

export default CADConfig;
