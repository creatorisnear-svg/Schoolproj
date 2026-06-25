import mongoose from 'mongoose';

const appyConfigSchema = new mongoose.Schema({
  guildId:         { type: String, required: true, unique: true },
  enabled:         { type: Boolean, default: false },
  reviewChannelId: { type: String, default: null },
  useWebhook:      { type: Boolean, default: false },
  webhookUrl:      { type: String, default: null },
  panelImageUrl:   { type: String, default: null },
  panelHeader:     { type: String, default: 'Applications' },
  panelBody:       { type: String, default: 'Click the button below to view and apply for available positions.' },
  panelChannelId:  { type: String, default: null },
  panelMessageId:  { type: String, default: null },
  activeTypeIds:   { type: [String], default: [] },
});

export default mongoose.models.AppyConfig
  || mongoose.model('AppyConfig', appyConfigSchema);
