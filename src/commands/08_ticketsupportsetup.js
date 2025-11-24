import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('08ticketsupportsetup')
  .setDescription('Setup the ticket support system (Staff only)');

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
        embeds: [errorEmbed('The ticket system is not enabled. Run `/ticketsupportenable` first.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketsupport_setup_menu')
          .setPlaceholder('Choose a setup option...')
          .addOptions(
            { label: 'Select Panel Channel', value: 'select_channel' },
            { label: 'Add Ticket Type', value: 'add_type' },
            { label: 'View Ticket Types', value: 'view_types' },
            { label: 'Send Panel', value: 'send_panel' },
            { label: '✅ Done - Close Setup', value: 'setup_done' }
          )
      );

    await interaction.reply({
      content: '**Ticket Support Setup**\n\nSelect an option below to configure your ticket system:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in ticket setup command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
