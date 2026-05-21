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
      const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      return interaction[replyFn]({
        embeds: [errorEmbed('Verification Unavailable', 'The verification system is not set up. Please contact an administrator.')],
        flags: 64,
      });
    }

    if (!verification.verifyChannelId) {
      const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      return interaction[replyFn]({
        embeds: [errorEmbed('Not Configured', 'The verification system is not fully configured. Please contact an administrator.')],
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('Server Verification');

    const psnXboxInput = new TextInputBuilder()
      .setCustomId('psnxbox')
      .setLabel('PSN / Xbox Username')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Your PSN or Xbox gamertag')
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(psnXboxInput);
    modal.addComponents(row1);

    const customQuestion = verification.customQuestion || (verification.customQuestions?.[0] ?? null);

    if (customQuestion) {
      const customInput = new TextInputBuilder()
        .setCustomId('custom_question')
        .setLabel(customQuestion.substring(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row2 = new ActionRowBuilder().addComponents(customInput);
      modal.addComponents(row2);
    }

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing verify modal:', error);
    try {
      const replyFn = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      return interaction[replyFn]({
        embeds: [errorEmbed('Something went wrong', 'An error occurred while opening the verification form. Please try again.')],
        flags: 64,
      });
    } catch (_) {}
  }
}
