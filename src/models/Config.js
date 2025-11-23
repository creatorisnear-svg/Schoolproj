import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  reportChannelId: {
    type: String,
    default: null,
  },
  reportRoles: {
    type: [String],
    default: [],
  },
  antiPromotingEnabled: {
    type: Boolean,
    default: false,
  },
  antiPromotingLogChannelId: {
    type: String,
    default: null,
  },
  whitelistedInviteLinks: {
    type: [String],
    default: [],
  },
  whitelistedStaffIds: {
    type: [String],
    default: [],
  },
  staffCanBypassLinks: {
    type: Boolean,
    default: true,
  },
  logChannelId: {
    type: String,
    default: null,
  },
});

const Config = mongoose.model('Config', configSchema);

export default Config;
