import mongoose from 'mongoose';

/** Somebody asked to be reminded when they can vote on Top.gg again. */
const voteReminderSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  remindAt: { type: Date, required: true },
});

voteReminderSchema.index({ remindAt: 1 });

const VoteReminder = mongoose.models.VoteReminder || mongoose.model('VoteReminder', voteReminderSchema);

export default VoteReminder;
