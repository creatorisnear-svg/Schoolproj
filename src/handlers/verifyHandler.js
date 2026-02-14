import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import PendingVerification from '../models/PendingVerification.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';

export async function handleVerifyModal(interaction) {
  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The verification system is not enabled.')],
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('EverLink Verification');

    const psnXboxInput = new TextInputBuilder()
      .setCustomId('psnxbox')
      .setLabel('PSN / XBOX Username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(psnXboxInput));

    if (verification.customQuestions && verification.customQuestions.length > 0) {
      const customInput = new TextInputBuilder()
        .setCustomId('custom_question')
        .setLabel(verification.customQuestions[0])
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(customInput));
    }

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing verify modal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
    }
  }
}

export async function handleVerifyModalSubmit(interaction) {
  const psnxbox = interaction.fields.getTextInputValue('psnxbox');
  let customAnswer = null;
  try {
    customAnswer = interaction.fields.getTextInputValue('custom_question');
  } catch (e) {}

  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });
    if (!verification || !verification.enabled) return;

    if (verification.approvalRequired) {
      const pending = new PendingVerification({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
        psnxbox,
        customAnswer,
      });
      await pending.save();

      if (verification.approvalChannelId) {
        const approvalChannel = await interaction.guild.channels.fetch(verification.approvalChannelId).catch(() => null);
        if (approvalChannel) {
          const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('EverLink Verification Pending')
            .addFields(
              { name: 'Member', value: `${interaction.user}`, inline: true },
              { name: 'PSN/XBOX', value: psnxbox, inline: true }
            )
            .setFooter({ text: 'EverLink' });
          await approvalChannel.send({ embeds: [embed] });
        }
      }

      return interaction.reply({ embeds: [infoEmbed('Submitted', 'Awaiting approval.')], flags: 64 });
    }

    const role = interaction.guild.roles.cache.get(verification.verifiedRoleId);
    if (role) await interaction.member.roles.add(role);
    
    const unverifiedRole = interaction.guild.roles.cache.get(verification.unverifiedRoleId);
    if (unverifiedRole) await interaction.member.roles.remove(unverifiedRole);

    return interaction.reply({ embeds: [successEmbed('Verified', 'You are now verified!')], flags: 64 });
  } catch (error) {
    console.error('Error in verification submit:', error);
  }
}
