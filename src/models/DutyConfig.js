import mongoose from 'mongoose';

/**
 * Per-guild settings for patrol hours.
 *
 * Deliberately small. Everything that decides whether time counts lives in
 * dutyTracker and is the same everywhere, because the value of the board is
 * that an owner can defend the number, and a number computed differently on
 * every server is not defensible.
 *
 * There is no quota field and no department field. Both were cut on purpose:
 * departments do not exist in this codebase, and automatically warning unpaid
 * volunteers for missing a quota reads as surveillance and gets the feature
 * switched off.
 */
const dutyConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },

  /** Where the weekly board is posted, and the message it keeps updating. */
  boardChannelId: { type: String, default: null },
  boardMessageId: { type: String, default: null },

  /** Where the "has not patrolled" list goes. Staff only, usually. */
  reportChannelId: { type: String, default: null },

  /** Days of silence before an officer appears on that list. */
  inactiveAfterDays: { type: Number, default: 14 },

  /** So the weekly jobs fire once a week rather than once an hour. */
  lastBoardAt: { type: Date, default: null },
  lastReportAt: { type: Date, default: null },
});

export default mongoose.models.DutyConfig || mongoose.model('DutyConfig', dutyConfigSchema);
