import mongoose from 'mongoose';

const businessLoanSchema = new mongoose.Schema({
  loanId:           { type: String, required: true, unique: true },
  guildId:          { type: String, required: true, index: true },
  lenderAccountId:  { type: String, required: true, index: true },
  borrowerUserId:   { type: String, required: true, index: true },
  type:             { type: String, required: true, enum: ['personal', 'property'] },
  principal:        { type: Number, required: true },
  interestRate:     { type: Number, required: true },  // annual %, e.g. 10 = 10%
  termDays:         { type: Number, required: true },  // 1–7
  totalOwed:        { type: Number, required: true },  // principal × (1 + rate/100 × days/365)
  amountPaid:       { type: Number, default: 0 },
  status:           { type: String, enum: ['active', 'paid', 'defaulted'], default: 'active', index: true },
  issuedAt:         { type: Date, default: Date.now },
  dueAt:            { type: Date, required: true, index: true },
  note:             { type: String, default: null },
  reminderSent:     { type: Boolean, default: false },
});

export default mongoose.models.BusinessLoan
  || mongoose.model('BusinessLoan', businessLoanSchema);
