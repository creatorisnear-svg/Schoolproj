import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, UserSelectMenuBuilder } from 'discord.js';
import Priority from '../models/Priority.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('priorityrequest')
  .setDescription('Request a priority scene');

export async function execute(interaction) {
  try {
    // Check if priority tracker is enabled and has a channel
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled || !priority.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Priority Tracker Not Set Up', 'The priority tracker must be enabled and configured with a channel first. Ask an admin to run `/prioritytrackersetup`')],
        flags: 64,
      });
    }

    // Show modal for priority request
    const modal = new ModalBuilder()
      .setCustomId('priorityrequest_modal')
      .setTitle('Priority Request Form');

    const sceneTypeInput = new TextInputBuilder()
      .setCustomId('priority_scenetype')
      .setLabel('What is your scene?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe your scene...')
      .setRequired(true);

    const sceneReasonInput = new TextInputBuilder()
      .setCustomId('priority_reason')
      .setLabel('Why are you doing this scene?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Explain the reason...')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(sceneTypeInput),
      new ActionRowBuilder().addComponents(sceneReasonInput)
    );

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in priorityrequest:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while opening the priority request form.')],
      flags: 64,
    });
  }
}
