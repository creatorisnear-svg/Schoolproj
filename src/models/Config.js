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
});

const Config = mongoose.model('Config', configSchema);

export default Config;
