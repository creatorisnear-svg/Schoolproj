import { SlashCommandBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('ticketsupportenable')
  .setDescription('Enable the ticket support system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.logChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('The log channel has not been set yet. Please run `/setlogchannel` first.')],
        ephemeral: true,
      });
    }

    let ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      ticketConfig = await TicketConfig.create({
        guildId: interaction.guildId,
        enabled: true,
        ticketTypes: [],
      });
    } else {
      ticketConfig.enabled = true;
      await ticketConfig.save();
    }

    return interaction.reply({
      embeds: [successEmbed('Ticket System Enabled', 'The ticket support system is now enabled. Run `/ticketsupportsetup` to configure it.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error enabling ticket system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while enabling the ticket system.')],
      ephemeral: true,
    });
  }
}
