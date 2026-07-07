import { SlashCommandBuilder } from 'discord.js';
import { getEconomySetupMenu } from '../handlers/economyHandler.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('economyconfig')
  .setDescription('Configure the economy system (Staff/Admin)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }
  // /config economy is the canonical way to reach this menu going forward.
  return interaction.reply(getEconomySetupMenu());
}
