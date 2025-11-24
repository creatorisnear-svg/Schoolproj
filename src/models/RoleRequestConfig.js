import mongoose from 'mongoose';

const roleRequestConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  roles: [
    {
      id: String,
      roleId: String,
      roleName: String,
      approverRoleIds: [String],
      approverMemberIds: [String],
      createdAt: Date,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const RoleRequestConfig = mongoose.model('RoleRequestConfig', roleRequestConfigSchema);

export default RoleRequestConfig;
