import mongoose from 'mongoose';

const roleplayEventSchema = new mongoose.Schema({
  day: String, // Monday, Tuesday, etc.
  person: String,
  time: String, // HH:MM format
  timezone: String,
  psn: String,
  xbox: {
    type: String,
    default: null,
  },
  description: String,
  timestamp: Number, // Unix timestamp for Discord timestamp conversion
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const roleplayCalendarSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  channelId: {
    type: String,
    default: null,
  },
  messageId: {
    type: String,
    default: null,
  },
  events: [roleplayEventSchema],
});

const RoleplayCalendar = mongoose.models.RoleplayCalendar || mongoose.model('RoleplayCalendar', roleplayCalendarSchema);

export default RoleplayCalendar;
