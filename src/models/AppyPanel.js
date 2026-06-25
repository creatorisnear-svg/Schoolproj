import mongoose from 'mongoose';

const appyPanelSchema = new mongoose.Schema({
  typeId:       { type: String, required: true, unique: true },
  guildId:      { type: String, required: true },
  name:         { type: String, required: true },
  description:  { type: String, default: '' },
  questions:    { type: [String], default: [] },
  acceptRoleId: { type: String, default: null },
  createdAt:    { type: Date, default: Date.now },
});

export default mongoose.models.AppyPanel
  || mongoose.model('AppyPanel', appyPanelSchema);
