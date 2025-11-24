import { SlashCommandBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('toggleticketsupport')
  .setDescription('Enable or disable the ticket support system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    let ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      ticketConfig = new TicketConfig({ guildId: interaction.guildId, enabled: true });
      await ticketConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Ticket Support Enabled', 'Members now have access to ticket support. Run `/ticketsupportsetup` to configure.')],
        ephemeral: true,
      });
    }

    ticketConfig.enabled = !ticketConfig.enabled;
    await ticketConfig.save();

    const status = ticketConfig.enabled ? 'enabled' : 'disabled';
    const message = ticketConfig.enabled
      ? 'Members now have access to ticket support.'
      : 'Members no longer have access to ticket support.';

    return interaction.reply({
      embeds: [successEmbed(`Ticket Support ${status.charAt(0).toUpperCase() + status.slice(1)}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling ticket support:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
