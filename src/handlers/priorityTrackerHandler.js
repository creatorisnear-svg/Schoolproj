import { ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } from 'discord.js';
import Priority from '../models/Priority.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export async function handlePriorityTrackerChannelSelect(interaction) {
  if (!interaction.customId.startsWith('prioritytrackersetup_channel')) {
    return;
  }

  try {
    const selectedChannelId = interaction.values[0];
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker configuration not found.')],
        flags: 64,
      });
    }

    priority.channelId = selectedChannelId;
    await priority.save();

    // Show modal for optional custom message
    const modal = new ModalBuilder()
      .setCustomId('prioritytrackersetup_message')
      .setTitle('Priority Tracker Setup - Custom Message');

    const messageInput = new TextInputBuilder()
      .setCustomId('custom_message')
      .setLabel('Optional Custom Message')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder('e.g., "You will be striked if you do not follow"');

    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in priority tracker channel select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while processing your selection.')],
      flags: 64,
    });
  }
}

export async function handlePriorityTrackerMessageModal(interaction) {
  if (!interaction.customId.startsWith('prioritytrackersetup_message')) {
    return;
  }

  try {
    const customMessage = interaction.fields.getTextInputValue('custom_message') || null;
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker configuration not found.')],
        flags: 64,
      });
    }

    priority.customMessage = customMessage;
    await priority.save();

    // Send or update initial priority tracker message
    const channel = await interaction.guild.channels.fetch(priority.channelId);
    const embed = await buildPriorityEmbed(priority);

    // Check if message already exists and update it, otherwise create new
    if (priority.messageId) {
      try {
        const existingMessage = await channel.messages.fetch(priority.messageId);
        await existingMessage.edit({ embeds: [embed] });
      } catch (err) {
        // Message not found, create new one
        const message = await channel.send({ embeds: [embed] });
        priority.messageId = message.id;
        await priority.save();
      }
    } else {
      const message = await channel.send({ embeds: [embed] });
      priority.messageId = message.id;
      await priority.save();
    }

    const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = await import('discord.js');
    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_priority_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    return interaction.reply({
      embeds: [successEmbed('Priority Tracker Setup Complete', 
        `Priority tracker message has been created in <#${priority.channelId}>. Use /activepriority and /prioritycooldown to manage it.`)],
      components: [backButton],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in priority tracker message modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the priority tracker.')],
      flags: 64,
    });
  }
}

export async function buildPriorityEmbed(priority) {
  const { EmbedBuilder } = await import('discord.js');
  
  let cooldownText = 'None';
  if (priority.cooldownEndsAt) {
    const now = new Date();
    const remaining = Math.floor((priority.cooldownEndsAt - now) / 1000 / 60);
    if (remaining > 0) {
      cooldownText = `${remaining}m (counting down)`;
    }
  }

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
    .setTitle('🚨 Priority Tracker')
    .setDescription(description)
    .setColor(priority.priorityActive ? 0xFF0000 : 0x808080)
    .setFooter({ text: 'SARP Core' })
    .setTimestamp();
}
