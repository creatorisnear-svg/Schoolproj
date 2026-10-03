import mongoose from 'mongoose';

// Which servers already have the current slash commands, so a restart sends
// them only where something changed (src/utils/commandSync.js). One document.
const commandSyncSchema = new mongoose.Schema({
  key: { type: String, default: 'commands', unique: true },
  // A hash of the command definitions those servers got.
  hash: { type: String, default: null },
  guildIds: { type: [String], default: [] },
  // When every server last got them; after a week they all get them again.
  fullSyncAt: { type: Date, default: null },
});

const CommandSync = mongoose.models.CommandSync || mongoose.model('CommandSync', commandSyncSchema);
export default CommandSync;
