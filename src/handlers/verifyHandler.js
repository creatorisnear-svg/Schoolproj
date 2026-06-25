import { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import Verification from '../models/Verification.js';
import PendingVerification from '../models/PendingVerification.js';
import VerifyToken from '../models/VerifyToken.js';
import VerifiedUser from '../models/VerifiedUser.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';

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
  try {
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) {
      return interaction.update({ embeds: [errorEmbed('Verification record not found or already processed.')], components: [] });
    }

    const guild = interaction.guild;
    const verification = await Verification.findOne({ guildId: guild.id });
    if (!verification) {
      return interaction.update({ embeds: [errorEmbed('Verification config not found.')], components: [] });
    }

    const member = await guild.members.fetch(pending.userId).catch(() => null);
    if (!member) {
      await PendingVerification.findByIdAndDelete(pendingId);
      return interaction.update({ embeds: [errorEmbed('Member no longer in server.')], components: [] });
    }

    const role = guild.roles.cache.get(verification.verifiedRoleId);
    if (role) await member.roles.add(role).catch(() => {});
    const unverifiedRole = guild.roles.cache.get(verification.unverifiedRoleId);
    if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});

    if (verification.rpTag && pending.psnxbox) {
      const newNickname = `${verification.rpTag} | ${pending.psnxbox}`;
      await member.setNickname(newNickname).catch(() => {});
    }

    if (verification.verifyDMMessage) {
      const dmMsg = verification.verifyDMMessage.replace('{server}', guild.name);
      await member.send(dmMsg).catch(() => {});
    }

    await VerifiedUser.findOneAndUpdate(
      { guildId: guild.id, userId: pending.userId },
      { psnxbox: pending.psnxbox, ipAddress: pending.ipAddress || null, verifiedAt: new Date() },
      { upsert: true }
    );

    await PendingVerification.findByIdAndDelete(pendingId);

    const approvedEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Verification Approved')
      .addFields(
        { name: 'Member', value: `<@${pending.userId}>`, inline: true },
        { name: 'Approved By', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: 'RPM' });

    return interaction.update({ embeds: [approvedEmbed], components: [] });
  } catch (err) {
    console.error('[VERIFY] Approve error:', err.message);
    return interaction.update({ embeds: [errorEmbed('An error occurred.')], components: [] });
  }
}

export async function handleVerifyReject(interaction, pendingId) {
  try {
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) {
      return interaction.update({ embeds: [errorEmbed('Verification record not found.')], components: [] });
    }

    await PendingVerification.findByIdAndDelete(pendingId);

    const rejectedEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Verification Rejected')
      .addFields(
        { name: 'Member', value: `<@${pending.userId}>`, inline: true },
        { name: 'Rejected By', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setFooter({ text: 'RPM' });

    const member = await interaction.guild.members.fetch(pending.userId).catch(() => null);
    if (member) {
      await member.send('Your verification application was rejected. Please contact server staff for more information.').catch(() => {});
    }

    return interaction.update({ embeds: [rejectedEmbed], components: [] });
  } catch (err) {
    console.error('[VERIFY] Reject error:', err.message);
    return interaction.update({ embeds: [errorEmbed('An error occurred.')], components: [] });
  }
}
