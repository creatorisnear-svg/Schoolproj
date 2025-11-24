import { SlashCommandBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('disableticketsuport')
  .setDescription('Disable the ticket support system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig || !ticketConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The ticket support system is not enabled.')],
        ephemeral: true,
      });
    }

    ticketConfig.enabled = false;
    await ticketConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Ticket Support Disabled', 'Members will no longer have access to the ticket support system.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error disabling ticket support:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
