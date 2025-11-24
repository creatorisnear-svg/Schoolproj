import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('ticketsupportenable')
  .setDescription('Enable or disable ticket support (Staff only)');

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
        embeds: [errorEmbed('A log channel must be configured first. Run `/setlogchannel`.')],
        ephemeral: true,
      });
    }

    let ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      ticketConfig = new TicketConfig({ guildId: interaction.guildId, enabled: true });
      await ticketConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Ticket Support Enabled', 'Ticket support system is now enabled. Run `/ticketsupportsetup` to configure.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketsupportenable_menu')
          .setPlaceholder('Choose an option...')
          .addOptions(
            { label: '✅ Enable Ticket Support', value: 'enable', description: ticketConfig.enabled ? '(Currently enabled)' : '' },
            { label: '❌ Disable Ticket Support', value: 'disable', description: !ticketConfig.enabled ? '(Currently disabled)' : '' }
          )
      );

    await interaction.reply({
      content: '**Ticket Support**\n\nChoose to enable or disable:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in ticket support enable:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
