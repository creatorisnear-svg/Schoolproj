import { SlashCommandBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('disableroleplaycommands')
  .setDescription('Disable the roleplay commands system (Staff only)');

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
        embeds: [errorEmbed('The roleplay commands system is not enabled.')],
        ephemeral: true,
      });
    }

    roleplayConfig.enabled = false;
    await roleplayConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Roleplay Commands Disabled', 'Members will no longer have access to roleplay commands.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error disabling roleplay commands:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
