import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('request')
  .setDescription('Submit a request (Vehicle, Role, Item, or RP Change)');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('request')
    .setTitle('Submit a Request');

  const requestTypeInput = new TextInputBuilder()
    .setCustomId('requestType')
    .setLabel('Request Type')
    .setPlaceholder('Vehicle / Role / Item / RP Change')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const requestDetailsInput = new TextInputBuilder()
    .setCustomId('requestDetails')
    .setLabel('Request Details')
    .setPlaceholder('Please provide detailed information about your request...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason/Justification (Optional)')
    .setPlaceholder('Why are you making this request?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(requestTypeInput);
  const row2 = new ActionRowBuilder().addComponents(requestDetailsInput);
  const row3 = new ActionRowBuilder().addComponents(reasonInput);

  modal.addComponents(row1, row2, row3);

  await interaction.showModal(modal);
}
