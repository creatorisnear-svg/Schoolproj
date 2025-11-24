import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Configure heartbeat status monitoring (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });

    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('status_main_menu')
          .setPlaceholder('Pick an option...')
          .addOptions(
            { label: 'Enable Status Heartbeat', value: 'enable' },
            { label: 'Disable Status Heartbeat', value: 'disable' },
            { label: 'Set Heartbeat Channel', value: 'set_channel' },
            { label: 'Set Interval (minutes)', value: 'set_interval' },
            { label: 'View Current Config', value: 'view_config' }
          )
      );

    const statusText = statusConfig.enabled ? '✅ Enabled' : '❌ Disabled';
    const channelText = statusConfig.heartbeatChannelId ? `<#${statusConfig.heartbeatChannelId}>` : 'Not set';

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Status Heartbeat Configuration')
          .setDescription('Configure the heartbeat monitoring system for EverLink')
          .addFields(
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channelText, inline: true },
            { name: 'Interval', value: `${statusConfig.intervalMinutes} minutes`, inline: true },
            { name: 'Auto-delete', value: `${statusConfig.deleteAfterSeconds} seconds`, inline: true }
          )
          .setFooter({ text: 'EverLink' })
      ],
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in status command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}
