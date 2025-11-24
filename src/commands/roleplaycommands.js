import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommands')
  .setDescription('Access roleplay commands (911, Twitter, Anon, CAD)');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    // Build available options based on what's enabled
    const options = [];

    if (roleplayConfig.use911) {
      options.push({ label: '🚨 911 Emergency Report', value: 'cmd_911' });
    }
    if (roleplayConfig.useTwitter) {
      options.push({ label: '🐦 Twitter Post', value: 'cmd_twitter' });
    }
    if (roleplayConfig.useAnon) {
      options.push({ label: '🔇 Anonymous Message', value: 'cmd_anon' });
    }
    if (roleplayConfig.useCAD) {
      options.push({ label: '📊 CAD Dispatch', value: 'cmd_cad' });
    }

    if (options.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No roleplay commands are enabled.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommands_select')
          .setPlaceholder('Choose a command...')
          .addOptions(options)
      );

    await interaction.reply({
      content: 'Select a roleplay command:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error executing roleplaycommands:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
