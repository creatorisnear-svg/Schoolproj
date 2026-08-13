import mongoose from 'mongoose';

const trafficTicketSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  ticketId: {
    type: String,
    required: true,
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CADCharacter',
    required: true,
  },
  characterName: {
    type: String,
    required: true,
  },
  issuedBy: {
    type: String,
    required: true,
  },
  violation: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  fine: {
    type: Number,
    default: 0,
  },
  paid: {
    type: Boolean,
    default: false,
  },
  paidAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

trafficTicketSchema.index({ guildId: 1, characterId: 1 });
trafficTicketSchema.index({ guildId: 1, ticketId: 1 });

const TrafficTicket = mongoose.models.TrafficTicket || mongoose.model('TrafficTicket', trafficTicketSchema);

export default TrafficTicket;
