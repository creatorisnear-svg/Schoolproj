import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  jobId:         { type: String, required: true },
  name:          { type: String, required: true },
  description:   { type: String, default: '' },
  roleId:        { type: String, required: true },
  durationHours: { type: Number, required: true, min: 0.1 },
}, { _id: false });

const civilianJobConfigSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  enabled:   { type: Boolean, default: false },
  channelId: { type: String, default: null },
  messageId: { type: String, default: null },
  jobs:      { type: [jobSchema], default: [] },
});

export default mongoose.models.CivilianJobConfig
  || mongoose.model('CivilianJobConfig', civilianJobConfigSchema);
