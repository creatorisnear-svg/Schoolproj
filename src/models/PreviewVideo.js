import mongoose from 'mongoose';

const PreviewVideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  videoUrl: { type: String, required: true },
  order: { type: Number, default: 0 },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('PreviewVideo', PreviewVideoSchema);
