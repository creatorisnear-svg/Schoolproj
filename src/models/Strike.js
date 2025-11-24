import mongoose from 'mongoose';

const strikeSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  currentStrikeLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 4,
  },
});

const strikeConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  strikes: {
    strike1: {
      roleId: { type: String, default: null },
      action: { type: String, enum: ['none', 'kick', 'timeout', 'ban', null], default: null },
      duration: { type: Number, default: null },
    },
    strike2: {
      roleId: { type: String, default: null },
      action: { type: String, enum: ['none', 'kick', 'timeout', 'ban', null], default: null },
      duration: { type: Number, default: null },
    },
    strike3: {
      roleId: { type: String, default: null },
      action: { type: String, enum: ['none', 'kick', 'timeout', 'ban', null], default: null },
      duration: { type: Number, default: null },
    },
    strike4: {
      roleId: { type: String, default: null },
      action: { type: String, enum: ['none', 'kick', 'timeout', 'ban', null], default: null },
      duration: { type: Number, default: null },
    },
  },
});

const StrikeUser = mongoose.model('StrikeUser', strikeSchema);
const StrikeConfig = mongoose.model('StrikeConfig', strikeConfigSchema);

export { StrikeUser, StrikeConfig };
