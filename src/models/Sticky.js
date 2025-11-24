import mongoose from 'mongoose';

const stickySchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  messageContent: {
    type: String,
    required: true,
  },
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  messageCount: {
    type: Number,
    default: 0,
  },
});

stickySchema.index({ guildId: 1, channelId: 1 });

const Sticky = mongoose.model('Sticky', stickySchema);

export default Sticky;
