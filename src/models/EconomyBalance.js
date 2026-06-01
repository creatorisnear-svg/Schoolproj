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

export default mongoose.models.EconomyBalance || mongoose.model('EconomyBalance', economyBalanceSchema);
