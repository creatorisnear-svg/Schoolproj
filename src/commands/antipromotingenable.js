import { SlashCommandBuilder, ChannelSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('antipromotingenable')
  .setDescription('Enable anti-promoting system and set log channel (Staff only)');

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
        .setCustomId('antipromotion_log_channel')
        .setPlaceholder('Select log channel for anti-promoting reports...')
    );

  return interaction.reply({
    content: 'Select a channel to receive anti-promoting logs:',
    components: [menu],
    ephemeral: true,
  });
}
