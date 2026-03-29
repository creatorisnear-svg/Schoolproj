import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify yourself to access member channels');

export async function execute(interaction) {
  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The verification system is not enabled. Please contact an administrator.')],
        flags: 64,
      });
    }

    if (!verification.verifyChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('Verification system is not fully configured. Please contact an administrator.')],
        flags: 64,
      });
    }

    // Ensure customQuestions is initialized for older documents
    if (!verification.customQuestions) {
      verification.customQuestions = [];
    }

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('RolePlayManager Verification');

    const psnXboxInput = new TextInputBuilder()
      .setCustomId('psnxbox')
      .setLabel('PSN / XBOX Username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(psnXboxInput);
    modal.addComponents(row1);

    // Add custom questions if they exist
    if (verification.customQuestions && verification.customQuestions.length > 0) {
      // Take the first question for now (modal can only have one custom question field)
      const customInput = new TextInputBuilder()
        .setCustomId('custom_question')
        .setLabel(verification.customQuestions[0])
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row2 = new ActionRowBuilder().addComponents(customInput);
      modal.addComponents(row2);
    }

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing verify modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while opening the verification form.')],
      flags: 64,
    });
  }
}
