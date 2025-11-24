import mongoose from 'mongoose';

const statusHeartbeatSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  heartbeatChannelId: {
    type: String,
    default: null,
  },
  intervalMinutes: {
    type: Number,
    default: 8,
  },
  deleteAfterSeconds: {
    type: Number,
    default: 60,
  },
  lastHeartbeatMessageId: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const StatusHeartbeat = mongoose.model('StatusHeartbeat', statusHeartbeatSchema);

export default StatusHeartbeat;
