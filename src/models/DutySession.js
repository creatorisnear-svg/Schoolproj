import mongoose from 'mongoose';

/**
 * One stretch of time an officer spent sitting in a patrol channel.
 *
 * The bot has always seen this. src/index.js has had a voiceStateUpdate handler
 * since dispatch was built, it receives every join and leave on a patrol
 * channel, and it used the events only to decide where to move the bot and then
 * dropped them. This is the collection that remembers instead.
 *
 * Append only, one row per session, closed when the officer leaves. Rows expire
 * after 90 days, the same shape as UptimeLog, which is the only other
 * time-series collection here.
 *
 * Recording is deliberately not premium. A leaderboard that only starts filling
 * up when somebody subscribes shows a blank screen for the whole trial week,
 * which is the worst possible moment to have nothing to show. Everyone accrues
 * history from the day this ships; paying is what unlocks reading the deep end
 * of it.
 */
const dutySessionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, default: null },
  channelId: { type: String, default: null },

  startedAt: { type: Date, required: true },
  /** Null while the officer is still in the channel. */
  endedAt: { type: Date, default: null },
  /** Filled in when the session closes, so rollups never recompute it. */
  seconds: { type: Number, default: 0 },

  /**
   * Time spent self-deafened, which is not patrolling. Subtracted from seconds
   * when the session closes, because someone who deafens themselves has stopped
   * listening to the radio.
   */
  deafSeconds: { type: Number, default: 0 },
  /** Set while deafened, so the running total can be closed out accurately. */
  deafSince: { type: Date, default: null },

  /**
   * Whether anyone else was ever in the channel during the session. A lone
   * officer parked in an empty channel is the AFK case, and it does not count.
   */
  hadCompany: { type: Boolean, default: false },

  /** How the session ended, for diagnosing bad data later. */
  closedBy: {
    type: String,
    enum: ['left', 'startup', 'sweeper', 'cap'],
    default: 'left',
  },
}, { versionKey: false });

// The only query shape: one guild, optionally one user, over a date window.
dutySessionSchema.index({ guildId: 1, userId: 1, startedAt: -1 });
// Finding sessions left open by a redeploy.
dutySessionSchema.index({ guildId: 1, endedAt: 1 });
// Same retention as UptimeLog. 90 days is long enough for a quarterly view and
// short enough that this never becomes the biggest collection in the database.
dutySessionSchema.index({ startedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.DutySession
  || mongoose.model('DutySession', dutySessionSchema);
