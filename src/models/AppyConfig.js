import mongoose from 'mongoose';

const appyConfigSchema = new mongoose.Schema({
  guildId:         { type: String, required: true, unique: true },
  enabled:         { type: Boolean, default: false },
  reviewChannelId: { type: String, default: null },
  useWebhook:      { type: Boolean, default: false },
  webhookUrl:      { type: String, default: null },
});

export default mongoose.models.AppyConfig
  || mongoose.model('AppyConfig', appyConfigSchema);
