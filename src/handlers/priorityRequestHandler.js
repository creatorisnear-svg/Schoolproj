import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import PriorityRequest from '../models/PriorityRequest.js';
import Priority from '../models/Priority.js';
import { isAdmin, checkStaffPermission } from '../utils/permissions.js';

const PRIORITY_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// ── Auto-expiry timer per guild ───────────────────────────────────────────────
const autoExpireTimers = new Map(); // guildId -> timeoutId

function schedulePriorityAutoExpiry(guildId, guild) {
  cancelPriorityAutoExpiry(guildId);
  const timeout = setTimeout(() => autoExpirePriority(guildId, guild), PRIORITY_DURATION_MS);
  autoExpireTimers.set(guildId, timeout);
  console.log(`[Priority] Auto-expiry scheduled for guild ${guildId} in 10 minutes`);
}

function cancelPriorityAutoExpiry(guildId) {
  const existing = autoExpireTimers.get(guildId);
  if (existing) {
    clearTimeout(existing);
    autoExpireTimers.delete(guildId);
  }
}

async function autoExpirePriority(guildId, guild) {
  autoExpireTimers.delete(guildId);
  try {
    const priority = await Priority.findOne({ guildId });
    if (!priority || !priority.priorityActive) return;

    priority.priorityActive = false;
    priority.priorityIssuedBy = null;
    priority.hostUserId = null;
    priority.requestedByUserId = null;
    await priority.save();

    if (priority.messageId && priority.channelId) {
      const panelChannel = guild.channels.cache.get(priority.channelId) ||
        await guild.channels.fetch(priority.channelId).catch(() => null);
      if (panelChannel?.isTextBased()) {
        const panelMessage = await panelChannel.messages.fetch(priority.messageId).catch(() => null);
        if (panelMessage) {
          await panelMessage.edit({ embeds: [buildPriorityEmbed(priority)], components: [] }).catch(() => {});
        }
      }
    }

    console.log(`[Priority] Auto-expired priority for guild ${guildId}`);
  } catch (err) {
    console.error('[Priority] Auto-expire error:', err.message);
  }
}

// ── Submit request ────────────────────────────────────────────────────────────
export async function handlePriorityRequestCommand(interaction, sceneType, sceneReason, member, host) {
  try {
    const priority = await Priority.findOne({ guildId: interaction.guildId });
    if (!priority || !priority.channelId) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('The priority tracker hasn\'t been set up yet. Ask an admin to run `/prioritytrackersetup`.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#f04747').setDescription('Unable to send to this channel.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('priority_approve').setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('priority_deny').setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

    const message = await channel.send({ embeds: [embed], components: [row] });

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

// ── Approve / deny button ─────────────────────────────────────────────────────
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

    request.status = isApprove ? 'approved' : 'denied';
    request[isApprove ? 'approvedBy' : 'deniedBy'] = interaction.user.tag;
    await request.save();

    const oldEmbed = interaction.message.embeds[0];
    const newEmbed = new EmbedBuilder(oldEmbed.data)
      .setColor(isApprove ? 0x43b581 : 0xf04747)
      .setDescription(isApprove ? '> Approved' : '> Denied')
      .addFields({ name: isApprove ? 'Approved By' : 'Denied By', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [newEmbed], components: [] });

    if (isApprove) {
      const priority = await Priority.findOne({ guildId: interaction.guildId });
      if (priority) {
        const expiresAt = new Date(Date.now() + PRIORITY_DURATION_MS);
        priority.priorityActive = true;
        priority.priorityIssuedBy = `Priority Scene - ${request.username}`;
        priority.activatedAt = new Date();
        priority.expiresAt = expiresAt;
        priority.requestedByUserId = request.userId;
        const hostMatch = request.hostPing.match(/^<@!?(\d+)>$/);
        priority.hostUserId = hostMatch ? hostMatch[1] : null;
        await priority.save();

        if (priority.messageId && priority.channelId) {
          const panelChannel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
          if (panelChannel?.isTextBased()) {
            try {
              const panelMessage = await panelChannel.messages.fetch(priority.messageId);
              const stopRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('priority_stop').setLabel('Stop Priority').setStyle(ButtonStyle.Danger)
              );
              await panelMessage.edit({ embeds: [buildPriorityEmbed(priority)], components: [stopRow] });
            } catch (err) {
              console.log('Could not update priority panel:', err.message);
            }
          }
        }

        schedulePriorityAutoExpiry(interaction.guildId, interaction.guild);
      }
    }

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(isApprove ? '#43b581' : '#f04747').setDescription(`Priority request **${isApprove ? 'approved — auto-expires in 10 minutes' : 'denied'}**.`).setFooter({ text: 'RPM' })],
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

// ── Stop button ───────────────────────────────────────────────────────────────
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

    cancelPriorityAutoExpiry(interaction.guildId);

    priority.priorityActive = false;
    priority.priorityIssuedBy = null;
    priority.hostUserId = null;
    priority.requestedByUserId = null;
    priority.expiresAt = null;
    await priority.save();

    if (priority.messageId && priority.channelId) {
      const panelChannel = await interaction.guild.channels.fetch(priority.channelId).catch(() => null);
      if (panelChannel?.isTextBased()) {
        try {
          const panelMessage = await panelChannel.messages.fetch(priority.messageId);
          await panelMessage.edit({ embeds: [buildPriorityEmbed(priority)], components: [] });
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

// ── Panel embed builder ───────────────────────────────────────────────────────
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
  const statusLine = isActive ? '**Priority is ACTIVE**' : 'Priority is inactive';

  let description = `${statusLine}\n\n`;
  description += `**Issued By:** ${priority.priorityIssuedBy || 'N/A'}\n`;

  if (isActive && priority.expiresAt) {
    const expiryUnix = Math.floor(new Date(priority.expiresAt).getTime() / 1000);
    description += `**Auto-expires:** <t:${expiryUnix}:R>\n`;
  }

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
