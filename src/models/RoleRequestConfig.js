import mongoose from 'mongoose';

const globalRoleLinkSchema = new mongoose.Schema({
  id: String,
  sourceRoleId: String,
  targetGuildId: String,
  targetGuildName: String,
  targetRoleId: String,
  targetRoleName: String,
  addedBy: String,
  addedAt: { type: Date, default: Date.now },
});

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
  globalRoleLinks: [globalRoleLinkSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const RoleRequestConfig = mongoose.model('RoleRequestConfig', roleRequestConfigSchema);

export default RoleRequestConfig;
