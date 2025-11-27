import mongoose from 'mongoose';

const priorityRequestSchema = new mongoose.Schema({
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
  channelId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    default: null,
  },
  sceneMembers: {
    type: String,
    required: true,
  },
  sceneType: {
    type: String,
    required: true,
  },
  sceneReason: {
    type: String,
    required: true,
  },
  hostPing: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
  },
  approvedBy: {
    type: String,
    default: null,
  },
  deniedBy: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PriorityRequest = mongoose.model('PriorityRequest', priorityRequestSchema);

export default PriorityRequest;
