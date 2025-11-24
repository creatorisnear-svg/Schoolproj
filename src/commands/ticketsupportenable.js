import { SlashCommandBuilder } from 'discord.js';
import TicketConfig from '../models/TicketConfig.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('ticketsupportenable')
  .setDescription('Enable or disable ticket support (Staff only)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable ticket support')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    if (enabled) {
      const config = await Config.findOne({ guildId: interaction.guildId });

      if (!config || !config.logChannelId) {
        return interaction.reply({
          embeds: [errorEmbed('A log channel must be configured first. Run `/setlogchannel`.')],
          ephemeral: true,
        });
      }
    }

    let ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId }) || new TicketConfig({ guildId: interaction.guildId });

    ticketConfig.enabled = enabled;
    await ticketConfig.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled
      ? 'Ticket support system is now enabled. Run `/ticketsupportsetup` to configure.'
      : 'Ticket support system has been disabled.';

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
