import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import PriorityRequest from '../models/PriorityRequest.js';
import Priority from '../models/Priority.js';
import { isAdmin, checkStaffPermission } from '../utils/permissions.js';

export async function handlePriorityRequestCommand(interaction, sceneType, sceneReason, member, host) {
  try {
    const priority = await Priority.findOne({ guildId: interaction.guildId });
    if (!priority || !priority.channelId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('The priority tracker hasn\'t been set up yet. Ask an admin to run `/prioritytrackersetup`.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    // Send to the channel where the command was used
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('Unable to send to this channel.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    // Create priority request embed
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Priority Request')
      .setDescription('> Awaiting staff approval')
      .addFields(
        { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Scene Member', value: `<@${member.id}>`, inline: true },
        { name: 'Host', value: `<@${host.id}>`, inline: true },
        { name: 'Scene Type', value: sceneType, inline: true },
        { name: 'Reason', value: sceneReason, inline: false }
      )
      .setFooter({ text: 'RPM' })
      .setTimestamp();

    // Create approve/deny buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('priority_approve')
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success)
          ,
        new ButtonBuilder()
          .setCustomId('priority_deny')
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
          
      );

    // Send to the channel where user submitted the command
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
      embeds: [new EmbedBuilder().setColor('#43b581').setDescription('Priority request submitted — staff will review it shortly.').setFooter({ text: 'RPM' })],
      flags: 64,
    });
  } catch (error) {
    console.error('Error handling priority request command:', error);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#f04747').setDescription('An error occurred while submitting your request.').setFooter({ text: 'RPM' })],
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
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('Only staff and admins can approve or deny priority requests.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    const messageId = interaction.message.id;
    const request = await PriorityRequest.findOne({ messageId });

    if (!request) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('Priority request not found.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription(`This request has already been **${request.status}**.`).setFooter({ text: 'RPM' })],
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
      .setColor(isApprove ? 0x43b581 : 0xf04747)
      .setDescription(isApprove ? '> Approved' : '> Denied')
      .addFields(
        { name: isApprove ? 'Approved By' : 'Denied By', value: `<@${interaction.user.id}>`, inline: true }
      );

    await interaction.message.edit({ embeds: [newEmbed], components: [] });

    // If approved, update the priority panel
    if (isApprove) {
      const priority = await Priority.findOne({ guildId: interaction.guildId });
      if (priority) {
        priority.priorityActive = true;
        priority.priorityIssuedBy = `Priority Scene - ${request.username}`;
        priority.activatedAt = new Date();
        priority.requestedByUserId = request.userId;
        const hostMatch = request.hostPing.match(/^<@!?(\d+)>$/);
        priority.hostUserId = hostMatch ? hostMatch[1] : null;
        await priority.save();

        // Update priority panel embed with Stop button
        if (priority.messageId && priority.channelId) {
          const panelChannel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
          if (panelChannel && panelChannel.isTextBased()) {
            try {
              const panelMessage = await panelChannel.messages.fetch(priority.messageId);
              const panelEmbed = buildPriorityEmbed(priority);
              const stopRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('priority_stop')
                  .setLabel('Stop Priority')
                  .setStyle(ButtonStyle.Danger)
              );
              await panelMessage.edit({ embeds: [panelEmbed], components: [stopRow] });
            } catch (err) {
              console.log('Could not update priority panel:', err.message);
            }
          }
        }
      }
    }

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(isApprove ? '#43b581' : '#f04747').setDescription(`Priority request **${isApprove ? 'approved' : 'denied'}**.`).setFooter({ text: 'RPM' })],
      flags: 64,
    });
  } catch (error) {
    console.error('Error handling priority request button:', error);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('An error occurred while processing this request.').setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }
}

export async function handlePriorityStop(interaction) {
  try {
    const isAdminUser = await isAdmin(interaction.member);
    const isStaffUser = await checkStaffPermission(interaction);
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('Priority tracker not found.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    const isHost = priority.hostUserId && interaction.user.id === priority.hostUserId;
    const isRequester = priority.requestedByUserId && interaction.user.id === priority.requestedByUserId;

    if (!isAdminUser && !isStaffUser && !isHost && !isRequester) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('Only staff, admins, the host, or the requester can stop an active priority.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    if (!priority.priorityActive) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('There is no active priority to stop.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    priority.priorityActive = false;
    priority.priorityIssuedBy = null;
    priority.hostUserId = null;
    priority.requestedByUserId = null;
    await priority.save();

    if (priority.messageId && priority.channelId) {
      const panelChannel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
      if (panelChannel && panelChannel.isTextBased()) {
        try {
          const panelMessage = await panelChannel.messages.fetch(priority.messageId);
          const panelEmbed = buildPriorityEmbed(priority);
          await panelMessage.edit({ embeds: [panelEmbed], components: [] });
        } catch (err) {
          console.log('Could not update priority panel on stop:', err.message);
        }
      }
    }

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription(`Priority has been stopped by <@${interaction.user.id}>.`).setFooter({ text: 'RPM' })],
      flags: 64,
    });
  } catch (error) {
    console.error('Error handling priority stop:', error);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('An error occurred while stopping the priority.').setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }
}

function buildPriorityEmbed(priority) {
  let cooldownText = 'None';
  let cooldownBy = 'N/A';

  if (priority.cooldownEndsAt) {
    const remaining = Math.floor((new Date(priority.cooldownEndsAt) - Date.now()) / 1000 / 60);
    if (remaining > 0) {
      cooldownText = `${remaining} min remaining`;
      cooldownBy = priority.cooldownIssuedBy || 'N/A';
    }
  }

  const isActive = priority.priorityActive;
  const statusLine = isActive ? ' **Priority is ACTIVE**' : 'Priority is inactive';

  let description = `${statusLine}\n\n`;
  description += `**Issued By:** ${priority.priorityIssuedBy || 'N/A'}\n`;
  description += `**Cooldown:** ${cooldownText}\n`;
  description += `**Cooldown By:** ${cooldownBy}`;

  if (priority.customMessage) {
    description += `\n\n> ${priority.customMessage}`;
  }

  return new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Priority Tracker')
    .setDescription(description)
    .setFooter({ text: 'RPM' })
    .setTimestamp();
}
