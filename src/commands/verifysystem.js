import { SlashCommandBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('verifysystem')
  .setDescription('View verification system status (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can view the verification system.')],
      ephemeral: true,
    });
  }

  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });
    const status = verification && verification.enabled ? '✅ Enabled' : '❌ Disabled';

    return interaction.reply({
      embeds: [successEmbed('Verification System Status', `Status: ${status}\n\nUse \`/enablecommands\` to enable/disable or \`/verifysystemsetup\` to configure.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error checking verification system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while checking the verification system.')],
      ephemeral: true,
    });
  }
}
