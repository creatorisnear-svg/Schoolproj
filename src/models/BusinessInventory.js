import mongoose from 'mongoose';

const businessInventorySchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  accountId: { type: String, required: true },
  items: [{
    itemName: { type: String, required: true },
    quantity: { type: Number, default: 1 },
  }],
});

businessInventorySchema.index({ guildId: 1, accountId: 1 }, { unique: true });

export default mongoose.models.BusinessInventory
  || mongoose.model('BusinessInventory', businessInventorySchema);
