import mongoose from 'mongoose';

const premiumKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  guildId: {
    type: String,
    default: null,
  },
  guildName: {
    type: String,
    default: null,
  },
  activatedBy: {
    type: String,
    default: null,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

premiumKeySchema.index({ guildId: 1 });

const PremiumKey = mongoose.model('PremiumKey', premiumKeySchema);

export default PremiumKey;
