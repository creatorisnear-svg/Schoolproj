import mongoose from 'mongoose';

const businessLoanDraftSchema = new mongoose.Schema({
  userId:        { type: String, required: true, unique: true },
  guildId:       { type: String, required: true },
  accountId:     { type: String, required: true },
  loanType:      { type: String, required: true },
  questionIndex: { type: Number, default: 0 },
  answers:       [{ question: String, answer: String }],
  updatedAt:     { type: Date, default: Date.now },
});

export default mongoose.models.BusinessLoanDraft
  || mongoose.model('BusinessLoanDraft', businessLoanDraftSchema);
