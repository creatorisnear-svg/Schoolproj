import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('911')
  .setDescription('Submit a 911 report for LEO/EMS');

export async function execute(interaction) {
  // Check if 911 is enabled
  const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

  if (!roleplayConfig || !roleplayConfig.use911 || !roleplayConfig.use911Channel) {
    return interaction.reply({
      embeds: [errorEmbed('911 emergency reporting is not enabled.')],
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('911report')
    .setTitle('911 Report Form');

  const issueInput = new TextInputBuilder()
    .setCustomId('issue')
    .setLabel('Issue')
    .setPlaceholder('What happened? (e.g., Armed Robbery, Car Accident)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location')
    .setPlaceholder('Where did this happen? (e.g., Legion Square)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const suspectsDescInput = new TextInputBuilder()
    .setCustomId('suspectsDescription')
    .setLabel('Suspects & Vehicle Information')
    .setPlaceholder('Include: # of suspects, names, physical description, vehicle make/model/color, etc.')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const lastSeenInput = new TextInputBuilder()
    .setCustomId('lastSeen')
    .setLabel('Last Seen')
    .setPlaceholder('Last known location or direction of travel...')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const contactInput = new TextInputBuilder()
    .setCustomId('contact')
    .setLabel('How can we contact you if needed?')
    .setPlaceholder('Discord tag, in-game name, phone number, etc.')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(issueInput);
  const row2 = new ActionRowBuilder().addComponents(locationInput);
  const row3 = new ActionRowBuilder().addComponents(suspectsDescInput);
  const row4 = new ActionRowBuilder().addComponents(lastSeenInput);
  const row5 = new ActionRowBuilder().addComponents(contactInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
}
