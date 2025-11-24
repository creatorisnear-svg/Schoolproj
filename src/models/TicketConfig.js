import mongoose from 'mongoose';

const ticketConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  panelChannelId: {
    type: String,
    default: null,
  },
  panelMessageId: {
    type: String,
    default: null,
  },
  ticketTypes: [
    {
      id: String,
      label: String,
      allowedRoleIds: [String],
      createdAt: Date,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

ticketConfigSchema.index({ guildId: 1 });

const TicketConfig = mongoose.model('TicketConfig', ticketConfigSchema);

export default TicketConfig;
