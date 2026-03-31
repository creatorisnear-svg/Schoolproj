import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema({
  feature: { type: String, required: true, unique: true },
  premium: { type: Boolean, default: false },
  label: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('FeatureFlag', featureFlagSchema);
