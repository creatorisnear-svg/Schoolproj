import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  ticketId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  ticketType: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  closedAt: {
    type: Date,
    default: null,
  },
  closedBy: {
    type: String,
    default: null,
  },
});

ticketSchema.index({ guildId: 1, userId: 1 });
ticketSchema.index({ guildId: 1, ticketId: 1 });

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

export default Ticket;
