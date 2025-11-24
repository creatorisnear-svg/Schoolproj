import { SlashCommandBuilder } from 'discord.js';
import Welcome from '../models/Welcome.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('welcomesystem')
  .setDescription('View welcome system status (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can view the welcome system.')],
      ephemeral: true,
    });
  }

  try {
    const welcome = await Welcome.findOne({ guildId: interaction.guildId });
    const status = welcome && welcome.enabled ? '✅ Enabled' : '❌ Disabled';

    return interaction.reply({
      embeds: [successEmbed('Welcome System Status', `Status: ${status}\n\nUse \`/enablecommands\` to enable/disable or \`/welcomesystemsetup\` to configure.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error checking welcome system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while checking the welcome system.')],
      ephemeral: true,
    });
  }
}
