import { SlashCommandBuilder } from 'discord.js';
import ReactionRole from '../models/ReactionRole.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('reactionrolemessage')
  .setDescription('Send a reaction role message to a channel (Staff only)')
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('The channel to send the message to')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message content')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const channel = interaction.options.getChannel('channel');
  const messageContent = interaction.options.getString('message');

  if (!channel.isTextBased()) {
    return interaction.reply({
      embeds: [errorEmbed('Please select a text channel.')],
      ephemeral: true,
    });
  }

  try {
    // Send the message to the channel
    const sentMessage = await channel.send(messageContent);

    // Create the reaction role record
    await ReactionRole.create({
      guildId: interaction.guildId,
      messageId: sentMessage.id,
      channelId: channel.id,
      emojiRoles: [],
    });

    return interaction.reply({
      embeds: [successEmbed('Reaction Role Message Sent', `Message sent to <#${channel.id}>\n\n**Message ID:** \`${sentMessage.id}\`\n\nUse \`/reactionroleadd\` to add emoji-role pairs using this ID.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error sending reaction role message:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while sending the message.')],
      ephemeral: true,
    });
  }
}
