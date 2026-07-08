import mongoose from 'mongoose';

const businessLoanApplicationSchema = new mongoose.Schema({
  applicationId:    { type: String, required: true, unique: true },
  guildId:          { type: String, required: true, index: true },
  lenderAccountId:  { type: String, required: true, index: true },
  applicantUserId:  { type: String, required: true },
  applicantUsername:{ type: String, required: true },
  type:             { type: String, required: true, enum: ['personal', 'property'] },
  requestedAmount:  { type: Number, required: true },
  requestedTermDays:{ type: Number, required: true },
  answers:          [{ question: String, answer: String }],
  status:           { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', index: true },
  reviewMessageId:  { type: String, default: null },
  reviewChannelId:  { type: String, default: null },
  reviewedBy:       { type: String, default: null },
  interestRate:     { type: Number, default: null },
  submittedAt:      { type: Date, default: Date.now },
});

export default mongoose.models.BusinessLoanApplication
  || mongoose.model('BusinessLoanApplication', businessLoanApplicationSchema);
