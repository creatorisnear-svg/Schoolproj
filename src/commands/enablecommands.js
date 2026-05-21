import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { isAdmin, checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import Config from '../models/Config.js';

export const data = new SlashCommandBuilder()
  .setName('enablecommands')
  .setDescription('Enable or disable all bot features (Admin/Staff only)');

export async function execute(interaction) {
  const isAdminUser = await isAdmin(interaction.member);
  const isStaffUser = await checkStaffPermission(interaction);

  if (!isAdminUser && !isStaffUser) {
    return interaction.reply({
      embeds: [errorEmbed('This command is restricted to staff and administrators.')],
      flags: 64,
    });
  }

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.logChannelId) {
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Setup Required')
        .setDescription(
          'Before managing features, complete initial setup.\n\n' +
          '`1.` Run `/setlogchannel` to set a log channel\n' +
          '`2.` Run `/staff add` to add staff members\n' +
          '`3.` Return here to manage features'
        )
        .setFooter({ text: 'RPM' });
      
      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Feature Management')
      .setDescription('Select an action below.')
      .setFooter({ text: 'RPM' });

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
      flags: 64,
    });

  } catch (error) {
    console.error('Error in enablecommands:', error);
    return interaction.reply({
      embeds: [errorEmbed('Something went wrong. Please try again.')],
      flags: 64,
    });
  }
}
