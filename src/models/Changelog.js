import mongoose from 'mongoose';

const ChangelogSchema = new mongoose.Schema({
  version: { type: String, required: true },
  title: { type: String, required: true },
  changes: [{ type: String }],
  date: { type: Date, default: Date.now },
  createdBy: { type: String },
});

export default mongoose.models.Changelog || mongoose.model('Changelog', ChangelogSchema);
