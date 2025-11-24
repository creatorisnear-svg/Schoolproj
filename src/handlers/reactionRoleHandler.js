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

    if (!reactionRole) {
      console.log(`❌ No reaction role config found for message ${reaction.message.id}`);
      return;
    }

    // Find the emoji-role pair
    const emojiString = reaction.emoji.toString();
    const emojiRole = reactionRole.emojiRoles.find(er => er.emoji === emojiString);

    if (!emojiRole) {
      console.log(`❌ Emoji ${emojiString} not configured for this message. Available: ${reactionRole.emojiRoles.map(er => er.emoji).join(', ')}`);
      return;
    }

    // Get the guild and member
    const guild = reaction.message.guild;
    if (!guild) {
      console.log('❌ Guild not found');
      return;
    }

    const member = await guild.members.fetch(user.id).catch(err => {
      console.log(`❌ Could not fetch member: ${err.message}`);
      return null;
    });
    if (!member) return;

    // Get the role
    const role = guild.roles.cache.get(emojiRole.roleId);
    if (!role) {
      console.log(`❌ Role ${emojiRole.roleId} not found in cache`);
      return;
    }

    // Add the role
    try {
      await member.roles.add(role);
      console.log(`✅ Added role ${role.name} to ${user.tag} via reaction role`);
    } catch (err) {
      console.error(`❌ Failed to add role to member: ${err.message}`);
    }
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
    const emojiString = reaction.emoji.toString();
    const emojiRole = reactionRole.emojiRoles.find(er => er.emoji === emojiString);

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
    try {
      await member.roles.remove(role);
      console.log(`✅ Removed role ${role.name} from ${user.tag} via reaction role`);
    } catch (err) {
      console.error(`❌ Failed to remove role from member: ${err.message}`);
    }
  } catch (error) {
    console.error('Error in handleReactionRemove:', error);
  }
}
