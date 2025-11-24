import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('ticketsupportsetup')
  .setDescription('Setup the ticket support system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig || !ticketConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('⚙️ Ticket Support Not Enabled', 'Use `/enablecommands` → Enable Features → Ticket Support')],
        flags: 64,
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
      flags: 64,
    });
  } catch (error) {
    console.error('Error in ticket setup command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
