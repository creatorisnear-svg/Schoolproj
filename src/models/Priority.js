import mongoose from 'mongoose';

const prioritySchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  channelId: {
    type: String,
    default: null,
  },
  messageId: {
    type: String,
    default: null,
  },
  customMessage: {
    type: String,
    default: null,
  },
  priorityActive: {
    type: Boolean,
    default: false,
  },
  priorityIssuedBy: {
    type: String,
    default: null,
  },
  cooldownMinutes: {
    type: Number,
    default: 0,
  },
  cooldownEndsAt: {
    type: Date,
    default: null,
  },
  cooldownIssuedBy: {
    type: String,
    default: null,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  hostUserId: {
    type: String,
    default: null,
  },
  requestedByUserId: {
    type: String,
    default: null,
  },
});

const Priority = mongoose.model('Priority', prioritySchema);

export default Priority;
