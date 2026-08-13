import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema({
  feature: { type: String, required: true, unique: true },
  premium: { type: Boolean, default: false },
  label: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.FeatureFlag || mongoose.model('FeatureFlag', featureFlagSchema);
