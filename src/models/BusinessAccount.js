import mongoose from 'mongoose';

const businessAccountSchema = new mongoose.Schema({
  guildId:             { type: String, required: true },
  accountId:           { type: String, required: true, unique: true },
  name:                { type: String, required: true },
  passwordHash:        { type: String, required: true },
  roleId:              { type: String, default: null },
  balance:             { type: Number, default: 0 },
  incomeAmount:        { type: Number, default: 0 },
  incomeCooldownHours: { type: Number, default: 24 },
  lastIncomeAt:        { type: Date,   default: null },
  createdAt:           { type: Date,   default: Date.now },
});

export default mongoose.models.BusinessAccount
  || mongoose.model('BusinessAccount', businessAccountSchema);
