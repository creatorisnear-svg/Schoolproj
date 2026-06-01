import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType, TextInputBuilder, ModalBuilder, TextInputStyle } from 'discord.js';
import Priority from '../models/Priority.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('prioritytrackersetup')
  .setDescription('Set up the priority tracker system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can configure the priority tracker.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'priority');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Priority Tracker')],
      flags: 64,
    });
  }

  try {
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Priority Tracker Not Enabled', 'Use `/enablecommands` → Enable Features → Priority Tracker')],
        flags: 64,
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
      flags: 64,
    });
  } catch (error) {
    console.error('Error in priority tracker setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the priority tracker.')],
      flags: 64,
    });
  }
}
