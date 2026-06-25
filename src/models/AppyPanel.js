import mongoose from 'mongoose';

const appyPanelSchema = new mongoose.Schema({
  panelId:        { type: String, required: true, unique: true },
  guildId:        { type: String, required: true },
  name:           { type: String, required: true },
  header:         { type: String, required: true },
  body:           { type: String, default: '' },
  questions:      { type: [String], default: [] },
  acceptRoleId:   { type: String, default: null },
  panelChannelId: { type: String, default: null },
  panelMessageId: { type: String, default: null },
  createdAt:      { type: Date, default: Date.now },
});

export default mongoose.models.AppyPanel
  || mongoose.model('AppyPanel', appyPanelSchema);
