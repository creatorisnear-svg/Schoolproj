import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sareport')
  .setDescription('Submit a San Andreas Report');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('sareport_part1')
    .setTitle('San Andreas Report (1/2)');

  const suspectInput = new TextInputBuilder()
    .setCustomId('suspect')
    .setLabel('Suspect')
    .setPlaceholder('Name of the suspect(s)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const vehicleInput = new TextInputBuilder()
    .setCustomId('vehicle')
    .setLabel('Vehicle')
    .setPlaceholder('Vehicle description (make, model, color)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const dateTimeInput = new TextInputBuilder()
    .setCustomId('datetime')
    .setLabel('Date & Time')
    .setPlaceholder('e.g., 11/21/2025 at 3:30 PM')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location')
    .setPlaceholder('Location of incident')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const summaryInput = new TextInputBuilder()
    .setCustomId('summary')
    .setLabel('Summary of Events')
    .setPlaceholder('Describe what happened...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(suspectInput);
  const row2 = new ActionRowBuilder().addComponents(vehicleInput);
  const row3 = new ActionRowBuilder().addComponents(dateTimeInput);
  const row4 = new ActionRowBuilder().addComponents(locationInput);
  const row5 = new ActionRowBuilder().addComponents(summaryInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
}
