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
  panelTitle: {
    type: String,
    default: 'Support Tickets',
  },
  panelDescription: {
    type: String,
    default: 'Select a button below to create a support ticket.',
  },
  buttonColor: {
    type: String,
    default: 'Primary',
    enum: ['Primary', 'Secondary', 'Success', 'Danger'],
  },
  ticketTypes: [
    {
      id: String,
      label: String,
      buttonColor: {
        type: String,
        default: 'Primary',
        enum: ['Primary', 'Secondary', 'Success', 'Danger'],
      },
      allowedRoleIds: [String],
      includeStaff: Boolean,
      createdAt: Date,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const TicketConfig = mongoose.model('TicketConfig', ticketConfigSchema);

export default TicketConfig;
