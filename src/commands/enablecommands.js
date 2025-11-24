import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { checkStaffPermission } from '../utils/permissions.js';
import Config from '../models/Config.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import { StrikeConfig } from '../models/Strike.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import TicketConfig from '../models/TicketConfig.js';

export const data = new SlashCommandBuilder()
  .setName('enablecommands')
  .setDescription('Enable or disable all bot features (Admin/Staff only)');

export async function execute(interaction) {
  const isAdminUser = await isAdmin(interaction.member);
  const isStaffUser = await checkStaffPermission(interaction);

  if (!isAdminUser && !isStaffUser) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Permission Denied')
      .setDescription('You do not have permission to use this command. This is an admin/staff-only command.')
      .setFooter({ text: 'EverLink' });
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  try {
    // Get current status of all features
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    const priorityConfig = await Priority.findOne({ guildId: interaction.guildId });
    const config = await Config.findOne({ guildId: interaction.guildId });
    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
    const calendarConfig = await RoleplayCalendar.findOne({ guildId: interaction.guildId });
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('⚙️ Command Management')
      .setDescription('Enable or disable bot features for your server.')
      .addFields(
        {
          name: '🎮 Roleplay Commands',
          value: roleplayConfig?.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
        {
          name: '⭐ Priority Tracker',
          value: priorityConfig?.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
        {
          name: '🚨 Strike System',
          value: strikeConfig?.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
        {
          name: '📅 Roleplay Calendar',
          value: calendarConfig?.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
        {
          name: '🎫 Ticket Support',
          value: ticketConfig?.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        },
        {
          name: '⛔ Anti-Promoting',
          value: config?.antiPromotingEnabled ? '✅ Enabled' : '❌ Disabled',
          inline: true,
        }
      )
      .setFooter({ text: 'EverLink' });

    // Create button rows
    const enableRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('enable_roleplay')
          .setLabel('🎮 Roleplay')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('enable_priority')
          .setLabel('⭐ Priority')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('enable_strike')
          .setLabel('🚨 Strike')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('enable_calendar')
          .setLabel('📅 Calendar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('enable_ticket')
          .setLabel('🎫 Ticket')
          .setStyle(ButtonStyle.Success)
      );

    const disableRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('disable_roleplay')
          .setLabel('🎮 Roleplay')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('disable_priority')
          .setLabel('⭐ Priority')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('disable_strike')
          .setLabel('🚨 Strike')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('disable_calendar')
          .setLabel('📅 Calendar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('disable_ticket')
          .setLabel('🎫 Ticket')
          .setStyle(ButtonStyle.Danger)
      );

    const antiPromoteRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('enable_antipromote')
          .setLabel('✅ Enable Anti-Promoting')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('disable_antipromote')
          .setLabel('❌ Disable Anti-Promoting')
          .setStyle(ButtonStyle.Danger)
      );

    const headerEmbed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('⚙️ Enable Features')
      .setDescription('Click a button to enable a feature.')
      .setFooter({ text: 'EverLink' });

    const headerEmbed2 = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('⚙️ Disable Features')
      .setDescription('Click a button to disable a feature.')
      .setFooter({ text: 'EverLink' });

    const antiPromoteEmbed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('⛔ Anti-Promoting')
      .setDescription('Enable or disable the anti-promoting system.')
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    await interaction.followUp({
      embeds: [headerEmbed],
      components: [enableRow],
      ephemeral: true,
    });

    await interaction.followUp({
      embeds: [headerEmbed2],
      components: [disableRow],
      ephemeral: true,
    });

    await interaction.followUp({
      embeds: [antiPromoteEmbed],
      components: [antiPromoteRow],
      ephemeral: true,
    });

  } catch (error) {
    console.error('Error in enablecommands:', error);
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Error')
      .setDescription('An error occurred.')
      .setFooter({ text: 'EverLink' });
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
}
