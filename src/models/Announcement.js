import mongoose from 'mongoose';

const AnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['info', 'update', 'warning'], default: 'info' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String },
});

export default mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);
