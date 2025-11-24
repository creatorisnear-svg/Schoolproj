import mongoose from 'mongoose';

const roleplayCommandsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  // 911 Config
  use911: {
    type: Boolean,
    default: false,
  },
  use911Channel: {
    type: String,
    default: null,
  },
  // Twitter Config
  useTwitter: {
    type: Boolean,
    default: false,
  },
  twitterChannel: {
    type: String,
    default: null,
  },
  // Anon/Black Market Config
  useAnon: {
    type: Boolean,
    default: false,
  },
  anonChannel: {
    type: String,
    default: null,
  },
  // CAD Config
  useCAD: {
    type: Boolean,
    default: false,
  },
  cadChannel: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const RoleplayCommands = mongoose.model('RoleplayCommands', roleplayCommandsSchema);

export default RoleplayCommands;
