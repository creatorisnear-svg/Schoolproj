import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('27unsetrp')
  .setDescription('Remove an RP event from the calendar (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar || !calendar.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar is not enabled or configured on this server.')],
        ephemeral: true,
      });
    }

    if (calendar.events.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('There are no RP events scheduled to remove.')],
        ephemeral: true,
      });
    }

    // Create dropdown with all events
    const options = calendar.events.map((event, index) => ({
      label: `${event.day} - ${event.person} (${event.time})`,
      value: `event_${index}`,
      description: event.description.substring(0, 100),
    }));

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('unsetrp_select')
          .setPlaceholder('Select an RP event to remove...')
          .addOptions(options)
      );

    return interaction.reply({
      content: 'Select an RP event to remove:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in unsetrp command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the RP event.')],
      ephemeral: true,
    });
  }
}
