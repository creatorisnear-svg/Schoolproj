import ReactionRole from '../models/ReactionRole.js';

export async function handleReactionAdd(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Fetch full reaction if partial
    if (reaction.partial) {
      await reaction.fetch();
    }

    const reactionRole = await ReactionRole.findOne({
      guildId: reaction.message.guildId,
      messageId: reaction.message.id,
    });

    if (!reactionRole) return;

    // Find the emoji-role pair
    const emojiRole = reactionRole.emojiRoles.find(er => er.emoji === reaction.emoji.toString());

    if (!emojiRole) return;

    // Get the guild and member
    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Get the role
    const role = guild.roles.cache.get(emojiRole.roleId);
    if (!role) return;

    // Add the role
    await member.roles.add(role).catch(() => {});
    console.log(`✅ Added role ${role.name} to ${user.tag} via reaction role`);
  } catch (error) {
    console.error('Error in handleReactionAdd:', error);
  }
}

export async function handleReactionRemove(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Fetch full reaction if partial
    if (reaction.partial) {
      await reaction.fetch();
    }

    const reactionRole = await ReactionRole.findOne({
      guildId: reaction.message.guildId,
      messageId: reaction.message.id,
    });

    if (!reactionRole) return;

    // Find the emoji-role pair
    const emojiRole = reactionRole.emojiRoles.find(er => er.emoji === reaction.emoji.toString());

    if (!emojiRole) return;

    // Get the guild and member
    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    // Get the role
    const role = guild.roles.cache.get(emojiRole.roleId);
    if (!role) return;

    // Remove the role
    await member.roles.remove(role).catch(() => {});
    console.log(`✅ Removed role ${role.name} from ${user.tag} via reaction role`);
  } catch (error) {
    console.error('Error in handleReactionRemove:', error);
  }
}
