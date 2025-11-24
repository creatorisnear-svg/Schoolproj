import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { checkStaffPermission } from '../utils/permissions.js';
import Config from '../models/Config.js';

export const data = new SlashCommandBuilder()
  .setName('c_enablecommands')
  .setDescription('Enable or disable all bot features (Admin/Staff only)');

export async function execute(interaction) {
  const isAdminUser = await isAdmin(interaction.member);
  const isStaffUser = await checkStaffPermission(interaction);

  if (!isAdminUser && !isStaffUser) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Permission Denied')
      .setDescription('You do not have permission to use this command. This is an admin/staff-only command.')
      .setFooter({ text: 'EverLink' });
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  try {
    // Check if log channel is configured first
    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.logChannelId) {
      const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle('Setup Required')
        .setDescription('Before you can manage bot features, you need to set up the system first.\n\n**Here\'s what to do:**\n1. Have an admin run `/setlogchannel` to designate a channel for bot logs\n2. Have an admin run `/addstaff` to add bot staff members\n3. Return here and you\'ll be able to enable or disable features')
        .setFooter({ text: 'EverLink' });
      
      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    // Show initial choice: Enable or Disable?
    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('Feature Management')
      .setDescription('What would you like to do?')
      .setFooter({ text: 'EverLink' });

    const choiceRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('choice_enable')
          .setLabel('Enable Features')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('choice_disable')
          .setLabel('Disable Features')
          .setStyle(ButtonStyle.Danger)
      );

    return interaction.reply({
      embeds: [embed],
      components: [choiceRow],
      ephemeral: true,
    });

  } catch (error) {
    console.error('Error in enablecommands:', error);
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error')
      .setDescription('An error occurred.')
      .setFooter({ text: 'EverLink' });
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
}
