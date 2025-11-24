import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Staff from '../models/Staff.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Delete messages from the channel (Admin/Staff)')
  .addIntegerOption(option =>
    option
      .setName('amount')
      .setDescription('Number of messages to delete (1-100)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  );

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const amount = interaction.options.getInteger('amount');

  try {
    // Check if user is staff or admin
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    
    let isStaff = false;
    if (!isAdmin) {
      const staffRecords = await Staff.findOne({
        guildId,
        $or: [
          { type: 'user', userId },
          { type: 'role', roleId: { $in: interaction.member.roles.cache.map(r => r.id) } },
        ],
      });
      isStaff = !!staffRecords;
    }

    if (!isAdmin && !isStaff) {
      return interaction.reply({
        embeds: [errorEmbed('Only admins and staff can use this command.')],
        flags: 64,
      });
    }

    // Defer the reply since deletion can take a moment
    await interaction.deferReply({ flags: 64 });

    // Fetch messages to delete
    const messages = await interaction.channel.messages.fetch({ limit: amount });
    
    if (messages.size === 0) {
      return interaction.editReply({
        embeds: [errorEmbed('No messages found to delete.')],
      });
    }

    // Delete messages
    await interaction.channel.bulkDelete(messages);

    return interaction.editReply({
      embeds: [successEmbed('Messages Cleared', `Successfully deleted ${messages.size} message(s).`)],
    });
  } catch (error) {
    console.error('Error in clear command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while clearing messages.')],
      flags: 64,
    });
  }
}
