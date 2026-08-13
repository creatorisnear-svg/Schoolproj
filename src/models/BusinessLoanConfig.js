import mongoose from 'mongoose';

const businessLoanConfigSchema = new mongoose.Schema({
  guildId:              { type: String, required: true },
  accountId:            { type: String, required: true },
  panelImageUrl:        { type: String, default: null },
  panelChannelId:       { type: String, default: null },
  panelMessageId:       { type: String, default: null },
  reviewChannelId:      { type: String, default: null },
  reviewPingRoleIds:    { type: [String], default: [] },
  personalLoansEnabled: { type: Boolean, default: true },
  propertyLoansEnabled: { type: Boolean, default: true },
  personalLoanMax:      { type: Number, default: 100000 },
  propertyLoanMax:      { type: Number, default: 500000 },
  defaultInterestRate:  { type: Number, default: 10 },
});

businessLoanConfigSchema.index({ guildId: 1, accountId: 1 }, { unique: true });

export default mongoose.models.BusinessLoanConfig
  || mongoose.model('BusinessLoanConfig', businessLoanConfigSchema);
