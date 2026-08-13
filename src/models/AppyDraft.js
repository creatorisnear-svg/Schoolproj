import mongoose from 'mongoose';

const draftAnswerSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer:   { type: String, required: true },
}, { _id: false });

const appyDraftSchema = new mongoose.Schema({
  userId:        { type: String, required: true, unique: true },
  guildId:       { type: String, required: true },
  typeId:        { type: String, required: true },
  panelName:     { type: String, required: true },
  questionIndex: { type: Number, default: 0 },
  answers:       { type: [draftAnswerSchema], default: [] },
  updatedAt:     { type: Date, default: Date.now },
});

export default mongoose.models.AppyDraft
  || mongoose.model('AppyDraft', appyDraftSchema);
