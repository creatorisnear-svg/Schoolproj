import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const economyInventorySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  items: { type: [inventoryItemSchema], default: [] },
});

economyInventorySchema.index({ guildId: 1, userId: 1 }, { unique: true });

export default mongoose.models.EconomyInventory || mongoose.model('EconomyInventory', economyInventorySchema);
