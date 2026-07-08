import mongoose from 'mongoose';

const economyBalanceSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  cash: { type: Number, default: 0 },
  bank: { type: Number, default: 0 },
  workCooldown: { type: Date, default: null },
  crimeCooldown: { type: Date, default: null },
  robCooldown: { type: Date, default: null },
  gamblingCooldown: { type: Date, default: null },
  chatMoneyCooldown: { type: Date, default: null },
  incomeCooldowns: { type: Map, of: Date, default: {} },
});

economyBalanceSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Any personal balance at or above this is treated as unrealistic/likely-exploited
// and gets flagged in the logs so staff can investigate.
export const SUSPICIOUS_BALANCE_THRESHOLD = 1_000_000_000_000; // 1 trillion

economyBalanceSchema.pre('save', function (next) {
  if (this.isModified('cash') || this.isModified('bank')) {
    const total = (this.cash || 0) + (this.bank || 0);
    if (total >= SUSPICIOUS_BALANCE_THRESHOLD) {
      console.warn(
        `[ECONOMY FLAG] Unrealistic personal balance — guild=${this.guildId} user=${this.userId} ` +
        `cash=${this.cash} bank=${this.bank} total=${total} (threshold ${SUSPICIOUS_BALANCE_THRESHOLD.toLocaleString()})`
      );
    }
  }
  next();
});

export default mongoose.models.EconomyBalance || mongoose.model('EconomyBalance', economyBalanceSchema);
