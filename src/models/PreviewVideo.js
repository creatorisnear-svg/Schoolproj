import mongoose from 'mongoose';

const PreviewVideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  videoUrl: { type: String },
  videoData: { type: Buffer },
  mimeType: { type: String, default: 'video/mp4' },
  aspectRatio: { type: String, default: '16:9' },
  order: { type: Number, default: 0 },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.PreviewVideo || mongoose.model('PreviewVideo', PreviewVideoSchema);
