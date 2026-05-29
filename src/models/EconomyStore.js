import mongoose from 'mongoose';

const economyStoreSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, default: '' },
  usable: { type: Boolean, default: false },
  useEffect: { type: String, default: '' },
  roleId: { type: String, default: null },
  requiredRoleId: { type: String, default: null },
});

economyStoreSchema.index({ guildId: 1, name: 1 }, { unique: true });

export default mongoose.model('EconomyStore', economyStoreSchema);
