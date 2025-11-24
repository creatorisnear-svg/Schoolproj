import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommandsetup')
  .setDescription('Setup the roleplay commands system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The roleplay commands system is not enabled. Run `/roleplaycommandsenable` first.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommands_setup_menu')
          .setPlaceholder('Choose a command to configure...')
          .addOptions(
            { label: '🚨 911 & CAD - Emergency/Dispatch', value: 'setup_emergency' },
            { label: '✅ Done - Close Setup', value: 'setup_done' }
          )
      );

    await interaction.reply({
      content: '**Roleplay Commands Setup**\n\nSelect a command to configure:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in roleplay commands setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
