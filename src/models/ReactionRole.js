import mongoose from 'mongoose';

const reactionRoleSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  emojiRoles: [
    {
      emoji: String,
      roleId: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ReactionRole = mongoose.models.ReactionRole || mongoose.model('ReactionRole', reactionRoleSchema);

export default ReactionRole;
