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

// Any business balance at or above this is treated as unrealistic/likely-exploited
// and gets flagged in the logs so staff can investigate.
export const SUSPICIOUS_BALANCE_THRESHOLD = 1_000_000_000_000; // 1 trillion

businessAccountSchema.pre('save', function (next) {
  if (this.isModified('balance') && this.balance >= SUSPICIOUS_BALANCE_THRESHOLD) {
    console.warn(
      `[ECONOMY FLAG] Unrealistic business balance — guild=${this.guildId} account="${this.name}" (${this.accountId}) ` +
      `balance=${this.balance} (threshold ${SUSPICIOUS_BALANCE_THRESHOLD.toLocaleString()})`
    );
  }
  next();
});

export default mongoose.models.BusinessAccount
  || mongoose.model('BusinessAccount', businessAccountSchema);
