import mongoose from 'mongoose';

const roleIncomeSchema = new mongoose.Schema({
  roleId: { type: String, required: true },
  amount: { type: Number, default: 100 },
  cooldown: { type: Number, default: 24 },
}, { _id: false });

const roleDeductionSchema = new mongoose.Schema({
  roleId: { type: String, required: true },
  amount: { type: Number, default: 100 },
  cooldown: { type: Number, default: 24 },
  label: { type: String, default: 'Deduction' },
}, { _id: false });

const economyConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  currencySymbol: { type: String, default: '$' },
  startingBalance: { type: Number, default: 1000 },
  maxBalance: { type: Number, default: 1000000 },
  logChannelId: { type: String, default: null },

  work: {
    enabled: { type: Boolean, default: true },
    cooldown: { type: Number, default: 60 },
    minPayout: { type: Number, default: 100 },
    maxPayout: { type: Number, default: 500 },
    customReplies: { type: [String], default: [] },
  },

  crime: {
    enabled: { type: Boolean, default: true },
    cooldown: { type: Number, default: 120 },
    successRate: { type: Number, default: 60 },
    minPayout: { type: Number, default: 200 },
    maxPayout: { type: Number, default: 1000 },
    fineRate: { type: Number, default: 50 },
    customReplies: { type: [String], default: [] },
  },

  rob: {
    enabled: { type: Boolean, default: true },
    cooldown: { type: Number, default: 180 },
    successRate: { type: Number, default: 40 },
    maxStealPercent: { type: Number, default: 30 },
  },

  gambling: {
    enabled: { type: Boolean, default: true },
    minBet: { type: Number, default: 10 },
    maxBet: { type: Number, default: 10000 },
    cooldown: { type: Number, default: 1 },
  },

  roleIncome: { type: [roleIncomeSchema], default: [] },
  roleDeductions: { type: [roleDeductionSchema], default: [] },

  chatMoney: {
    enabled: { type: Boolean, default: false },
    channels: { type: [String], default: [] },
    minAmount: { type: Number, default: 1 },
    maxAmount: { type: Number, default: 10 },
    cooldown: { type: Number, default: 60 },
  },

  incomeTax: { type: Number, default: 0 },
  incomeFee: { type: Number, default: 0 },
  incomeChannelId: { type: String, default: null },
  incomeMessageId: { type: String, default: null },

  permissions: {
    workRoles: { type: [String], default: [] },
    crimeRoles: { type: [String], default: [] },
    gamblingRoles: { type: [String], default: [] },
  },
});

export default mongoose.model('EconomyConfig', economyConfigSchema);
