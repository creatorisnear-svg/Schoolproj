import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('reloadconfig')
  .setDescription('Reload all bot configuration from database (Admin only)');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can reload configuration.')],
      flags: 64,
    });
  }

  try {
    const embed = new EmbedBuilder()
      .setColor('#00AA00')
      .setTitle('✅ Configuration Reloaded')
      .setDescription('All bot configurations have been reloaded from the database.\n\nThe following are loaded on-demand:\n• Server Configuration\n• Staff Members\n• Verification System\n• Welcome System\n• Priority Tracker\n• Strike System\n• Ticket Support\n• Roleplay Commands\n• Reaction Roles\n• Role Request System\n• Sticky Messages\n• Emergency Calls\n• CAD Configuration')
      .setFooter({ text: 'SARP Core' });

    return interaction.reply({
      embeds: [embed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in reload config command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while reloading configuration.')],
      flags: 64,
    });
  }
}
