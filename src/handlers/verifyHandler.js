import { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import Verification from '../models/Verification.js';
import VerifyToken from '../models/VerifyToken.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { approveVerification, rejectVerification } from '../utils/verifyActions.js';

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://roleplaymanager.xyz';

export async function handleVerifyModal(interaction) {
  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The verification system is not enabled.')],
        flags: 64,
      });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await VerifyToken.create({
      token,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      expiresAt,
      used: false,
    });

    const verifyUrl = `${SITE_ORIGIN}/verify?token=${token}`;

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Complete Your Verification')
      .setDescription('Click the button below to open the verification form on our website.\n\n-# This link expires in 15 minutes and can only be used once.')
      .setFooter({ text: 'RPM' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Verification Form')
        .setURL(verifyUrl)
        .setStyle(ButtonStyle.Link)
    );

    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  } catch (error) {
    console.error('Error handling verify button:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
    }
  }
}

export async function handleVerifyApprove(interaction, pendingId) {
  const result = await approveVerification(interaction.guild, pendingId, interaction.user.id);

  if (!result.ok) {
    const why = {
      not_found: 'Verification record not found or already processed.',
      no_config: 'Verification config not found.',
      gone: 'Member is no longer in the server.',
    }[result.reason] || 'An error occurred.';
    return interaction.update({ embeds: [errorEmbed(why)], components: [] });
  }

  return interaction.update({
    embeds: [new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Verification Approved')
      .addFields(
        { name: 'Member', value: `<@${result.userId}>`, inline: true },
        { name: 'Approved By', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: 'RPM' })],
    components: [],
  });
}

export async function handleVerifyReject(interaction, pendingId) {
  const result = await rejectVerification(interaction.guild, pendingId, interaction.user.id);

  if (!result.ok) {
    return interaction.update({
      embeds: [errorEmbed(result.reason === 'not_found'
        ? 'Verification record not found.'
        : 'An error occurred.')],
      components: [],
    });
  }

  return interaction.update({
    embeds: [new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Verification Rejected')
      .addFields(
        { name: 'Member', value: `<@${result.userId}>`, inline: true },
        { name: 'Rejected By', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: 'RPM' })],
    components: [],
  });
}
