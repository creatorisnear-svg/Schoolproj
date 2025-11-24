import mongoose from 'mongoose';

const roleRequestSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  requestId: {
    type: String,
    required: true,
    unique: true,
  },
  requesterId: {
    type: String,
    required: true,
  },
  requesterUsername: String,
  roleId: {
    type: String,
    required: true,
  },
  roleName: String,
  approverId: {
    type: String,
    required: true,
  },
  approverUsername: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  approvedAt: Date,
  deniedAt: Date,
  messageId: String,
  dmChannelId: String,
});

const RoleRequest = mongoose.model('RoleRequest', roleRequestSchema);

export default RoleRequest;
