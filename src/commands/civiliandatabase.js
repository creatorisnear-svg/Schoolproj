import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('civiliandatabase')
  .setDescription('Civilian Database - Report emergencies, post messages, and more');

export async function execute(interaction) {
  try {
    // Check if roleplay commands are enabled
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled on this server.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('civiliandatabase_menu')
          .setPlaceholder('Choose an action...')
          .addOptions(
            { label: '🚨 Report 911 Emergency', value: 'report_911' },
            { label: '🐦 Post to Twitter', value: 'post_twitter' },
            { label: '🤫 Post Anonymously', value: 'post_anon' },
            { label: '👤 Create Character', value: 'create_character' },
            { label: '🚗 Add Vehicle', value: 'add_vehicle' },
            { label: '🔫 Add Firearm', value: 'add_firearm' },
            { label: '📋 Manage Character', value: 'manage_character' }
          )
      );

    return interaction.reply({
      content: '**CIVILIAN DATABASE**\n\nSelect an action:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error executing civiliandatabase:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
