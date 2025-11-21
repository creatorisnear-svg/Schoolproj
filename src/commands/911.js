import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('911')
  .setDescription('Submit a 911 report for LEO/EMS');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('911report')
    .setTitle('911 Report Form');

  const issueInput = new TextInputBuilder()
    .setCustomId('issue')
    .setLabel('Issue')
    .setPlaceholder('Describe the issue...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location')
    .setPlaceholder('Where did this happen?')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const suspectsInput = new TextInputBuilder()
    .setCustomId('suspects')
    .setLabel('Suspects Involved')
    .setPlaceholder('Names or number of suspects')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Suspect & Vehicle Description')
    .setPlaceholder('Describe suspects and vehicles...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const contactInput = new TextInputBuilder()
    .setCustomId('contact')
    .setLabel('How can we contact you if needed?')
    .setPlaceholder('Discord tag, in-game name, etc.')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(issueInput);
  const row2 = new ActionRowBuilder().addComponents(locationInput);
  const row3 = new ActionRowBuilder().addComponents(suspectsInput);
  const row4 = new ActionRowBuilder().addComponents(descriptionInput);
  const row5 = new ActionRowBuilder().addComponents(contactInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
}
