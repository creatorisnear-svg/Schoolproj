import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } from 'discord.js';
import Config from '../models/Config.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Set the channel where logs and moderation events are posted (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  // Check if at least one staff member has been added
  const staffCount = await Staff.countDocuments({ guildId: interaction.guildId });
  
  if (staffCount === 0) {
    return interaction.reply({
      embeds: [errorEmbed('You must add at least one staff member first using `/staff add` before setting up the log channel.')],
      flags: 64,
    });
  }

  const menu = new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('setlogchannel_select')
        .setPlaceholder('Select the log channel...')
        .setChannelTypes(ChannelType.GuildText)
    );

  return interaction.reply({
    content: 'Select a text channel to receive all moderation logs and reports:',
    components: [menu],
    flags: 64,
  });
}
