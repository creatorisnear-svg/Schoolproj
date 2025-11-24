import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } from 'discord.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycalendersetup')
  .setDescription('Set up the roleplay calendar system (Admin/Staff)');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can configure the roleplay calendar.')],
      ephemeral: true,
    });
  }

  try {
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar || !calendar.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('You must enable the roleplay calendar first using `/roleplaycalendarenable true` before setting it up.')],
        ephemeral: true,
      });
    }

    // Show channel selector
    const menu = new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('roleplaycalendarsetup_channel')
          .setPlaceholder('Select the channel for the roleplay calendar...')
          .setChannelTypes(ChannelType.GuildText)
      );

    return interaction.reply({
      content: 'Select a channel where the roleplay calendar will be posted:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in roleplay calendar setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the roleplay calendar.')],
      ephemeral: true,
    });
  }
}
