import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } from 'discord.js';
import Config from '../models/Config.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('02setlogchannel')
  .setDescription('Set the log channel - Must add staff first using /addstaff (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  // Check if at least one staff member has been added
  const staffCount = await Staff.countDocuments({ guildId: interaction.guildId });
  
  if (staffCount === 0) {
    return interaction.reply({
      embeds: [errorEmbed('You must add staff or staff roles first using `/addstaff` before setting up the log channel.')],
      ephemeral: true,
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
    content: 'Select a channel to receive logs and anti-promoting reports:',
    components: [menu],
    ephemeral: true,
  });
}
