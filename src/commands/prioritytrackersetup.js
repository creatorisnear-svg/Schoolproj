import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType, TextInputBuilder, ModalBuilder, TextInputStyle } from 'discord.js';
import Priority from '../models/Priority.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('prioritytrackersetup')
  .setDescription('Set up the priority tracker system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can configure the priority tracker.')],
      ephemeral: true,
    });
  }

  try {
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('You must enable the priority tracker first using `/prioritytrackerenable true` before setting it up.')],
        ephemeral: true,
      });
    }

    // Show channel selector
    const menu = new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('prioritytrackersetup_channel')
          .setPlaceholder('Select the channel for priority tracker messages...')
          .setChannelTypes(ChannelType.GuildText)
      );

    return interaction.reply({
      content: 'Select a channel where priority tracker messages will be sent:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in priority tracker setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the priority tracker.')],
      ephemeral: true,
    });
  }
}
