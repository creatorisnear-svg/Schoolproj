import mongoose from 'mongoose';

const businessTransactionSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, index: true },
  accountId: { type: String, required: true, index: true },
  type:      { type: String, required: true, enum: ['deposit', 'withdraw', 'pay', 'income'] },
  userId:    { type: String, default: null },
  username:  { type: String, default: null },
  amount:    { type: Number, required: true },
  note:      { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.models.BusinessTransaction
  || mongoose.model('BusinessTransaction', businessTransactionSchema);
