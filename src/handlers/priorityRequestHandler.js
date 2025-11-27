import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import PriorityRequest from '../models/PriorityRequest.js';
import Priority from '../models/Priority.js';
import { isAdmin, checkStaffPermission } from '../utils/permissions.js';

export async function handlePriorityRequestCommand(interaction, sceneType, sceneReason, member, host) {
  try {
    const priority = await Priority.findOne({ guildId: interaction.guildId });
    if (!priority || !priority.channelId) {
      return interaction.reply({
        content: 'Priority tracker is not set up.',
        flags: 64,
      });
    }

    const channel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        content: 'Priority channel not found.',
        flags: 64,
      });
    }

    // Create priority request embed
    const embed = new EmbedBuilder()
      .setColor('#FFAA00')
      .setTitle('📋 Priority Request')
      .setDescription('Awaiting staff approval')
      .addFields(
        { name: 'Requested by', value: `${interaction.user.tag}`, inline: false },
        { name: 'Scene Member', value: `<@${member.id}>`, inline: false },
        { name: 'Scene Type', value: sceneType, inline: false },
        { name: 'Scene Reason', value: sceneReason, inline: false },
        { name: 'Host Ping', value: `<@${host.id}>`, inline: false }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    // Create approve/deny buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('priority_approve')
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('priority_deny')
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );

    // Send to priority channel
    const message = await channel.send({ embeds: [embed], components: [row] });

    // Store in database
    await PriorityRequest.create({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      username: interaction.user.tag,
      channelId: priority.channelId,
      messageId: message.id,
      sceneMembers: `<@${member.id}>`,
      sceneType,
      sceneReason,
      hostPing: `<@${host.id}>`,
    });

    return interaction.reply({
      content: '✅ Priority request submitted! Staff will review it shortly.',
      flags: 64,
    });
  } catch (error) {
    console.error('Error handling priority request command:', error);
    return interaction.reply({
      content: 'An error occurred while submitting your request.',
      flags: 64,
    });
  }
}

export async function handlePriorityRequestButton(interaction, client) {
  try {
    const isAdminUser = await isAdmin(interaction.member);
    const isStaffUser = await checkStaffPermission(interaction);

    if (!isAdminUser && !isStaffUser) {
      return interaction.reply({
        content: 'Only staff and admins can approve/deny priority requests.',
        flags: 64,
      });
    }

    const messageId = interaction.message.id;
    const request = await PriorityRequest.findOne({ messageId });

    if (!request) {
      return interaction.reply({
        content: 'Priority request not found.',
        flags: 64,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        content: `This request has already been ${request.status}.`,
        flags: 64,
      });
    }

    const isApprove = interaction.customId === 'priority_approve';

    // Update request status
    request.status = isApprove ? 'approved' : 'denied';
    request[isApprove ? 'approvedBy' : 'deniedBy'] = interaction.user.tag;
    await request.save();

    // Update embed
    const oldEmbed = interaction.message.embeds[0];
    const newEmbed = new EmbedBuilder(oldEmbed.data)
      .setColor(isApprove ? 0x00FF00 : 0xFF0000)
      .setDescription(isApprove ? '✅ APPROVED' : '❌ DENIED')
      .addFields(
        { name: `${isApprove ? 'Approved' : 'Denied'} by`, value: interaction.user.tag }
      );

    await interaction.message.edit({ embeds: [newEmbed], components: [] });

    // If approved, update the priority panel
    if (isApprove) {
      const priority = await Priority.findOne({ guildId: interaction.guildId });
      if (priority) {
        priority.priorityActive = true;
        priority.priorityIssuedBy = `Priority Scene - ${request.username}`;
        priority.activatedAt = new Date();
        await priority.save();

        // Update priority panel embed
        if (priority.messageId && priority.channelId) {
          const panelChannel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
          if (panelChannel && panelChannel.isTextBased()) {
            try {
              const panelMessage = await panelChannel.messages.fetch(priority.messageId);
              const panelEmbed = buildPriorityEmbed(priority);
              await panelMessage.edit({ embeds: [panelEmbed] });
            } catch (err) {
              console.log('Could not update priority panel:', err.message);
            }
          }
        }
      }
    }

    return interaction.reply({
      content: `✅ Priority request ${isApprove ? 'approved' : 'denied'}!`,
      flags: 64,
    });
  } catch (error) {
    console.error('Error handling priority request button:', error);
    return interaction.reply({
      content: 'An error occurred while processing your request.',
      flags: 64,
    });
  }
}

function buildPriorityEmbed(priority) {
  const cooldownText = priority.cooldownEndsAt 
    ? `${priority.cooldownMinutes}m (counting down)`
    : 'None';

  const priorityIssuedBy = priority.priorityIssuedBy || 'N/A';
  const cooldownIssuedBy = priority.cooldownIssuedBy || 'N/A';

  let description = `**Priority active:** ${priority.priorityActive ? 'Active' : 'Inactive'}\n`;
  description += `**Priority issued by:** ${priorityIssuedBy}\n`;
  description += `**Priority cooldown:** ${cooldownText}\n`;
  description += `**Cooldown issued by:** ${cooldownIssuedBy}`;

  if (priority.customMessage) {
    description += `\n\n${priority.customMessage}`;
  }

  return new EmbedBuilder()
    .setColor(priority.priorityActive ? 0xFF0000 : 0x808080)
    .setTitle('🚨 Priority Tracker')
    .setDescription(description)
    .setFooter({ text: 'EverLink' })
    .setTimestamp();
}
