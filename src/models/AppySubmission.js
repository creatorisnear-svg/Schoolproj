import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer:   { type: String, required: true },
}, { _id: false });

const appySubmissionSchema = new mongoose.Schema({
  submissionId:    { type: String, required: true, unique: true },
  guildId:         { type: String, required: true },
  panelId:         { type: String, required: true },
  userId:          { type: String, required: true },
  username:        { type: String, required: true },
  answers:         { type: [answerSchema], default: [] },
  status:          { type: String, enum: ['pending', 'accepted', 'denied'], default: 'pending' },
  reviewMessageId: { type: String, default: null },
  reviewChannelId: { type: String, default: null },
  submittedAt:     { type: Date, default: Date.now },
});

export default mongoose.models.AppySubmission
  || mongoose.model('AppySubmission', appySubmissionSchema);
