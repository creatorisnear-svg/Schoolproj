import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Set the log channel for server events and anti-promoting reports (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
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
