import { SlashCommandBuilder } from 'discord.js';
import ReactionRole from '../models/ReactionRole.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('reactionroleadd')
  .setDescription('Add an emoji-role pair to a reaction role message (Staff only)')
  .addStringOption(option =>
    option
      .setName('messageid')
      .setDescription('The ID of the reaction role message')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('emoji')
      .setDescription('The emoji to use (e.g., 🎮)')
      .setRequired(true)
  )
  .addRoleOption(option =>
    option
      .setName('role')
      .setDescription('The role to give when reacting with this emoji')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const messageId = interaction.options.getString('messageid');
  const emoji = interaction.options.getString('emoji');
  const role = interaction.options.getRole('role');

  try {
    const reactionRole = await ReactionRole.findOne({
      guildId: interaction.guildId,
      messageId: messageId,
    });

    if (!reactionRole) {
      return interaction.reply({
        embeds: [errorEmbed('Reaction role message not found. Make sure the message ID is correct.')],
        ephemeral: true,
      });
    }

    // Check if we already have 5 emoji-role pairs
    if (reactionRole.emojiRoles.length >= 5) {
      return interaction.reply({
        embeds: [errorEmbed('This message already has 5 emoji-role pairs. You cannot add more.')],
        ephemeral: true,
      });
    }

    // Check if emoji already exists
    if (reactionRole.emojiRoles.some(er => er.emoji === emoji)) {
      return interaction.reply({
        embeds: [errorEmbed('This emoji is already assigned to a role on this message.')],
        ephemeral: true,
      });
    }

    // Add the emoji-role pair
    reactionRole.emojiRoles.push({ emoji, roleId: role.id });
    await reactionRole.save();

    // Try to add the reaction to the message
    try {
      const channel = await interaction.guild.channels.fetch(reactionRole.channelId);
      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);
    } catch (err) {
      console.error('Error adding reaction to message:', err);
    }

    return interaction.reply({
      embeds: [successEmbed('Emoji-Role Pair Added', `Emoji ${emoji} will now give the ${role} role when users react with it.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding emoji-role pair:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the emoji-role pair.')],
      ephemeral: true,
    });
  }
}
