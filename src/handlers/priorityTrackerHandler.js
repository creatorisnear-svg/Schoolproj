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
        ephemeral: true,
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
      .setLabel('Optional custom message (e.g., "You will be striked if you do not follow")')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder('Leave empty for no custom message');

    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in priority tracker channel select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while processing your selection.')],
      ephemeral: true,
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
        ephemeral: true,
      });
    }

    priority.customMessage = customMessage;
    await priority.save();

    // Send initial priority tracker message
    const channel = await interaction.guild.channels.fetch(priority.channelId);
    const embed = buildPriorityEmbed(priority);
    const message = await channel.send({ embeds: [embed] });

    priority.messageId = message.id;
    await priority.save();

    return interaction.reply({
      embeds: [successEmbed('Priority Tracker Setup Complete', 
        `Priority tracker message has been created in <#${priority.channelId}>. Use /activepriority and /prioritycooldown to manage it.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in priority tracker message modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the priority tracker.')],
      ephemeral: true,
    });
  }
}

function buildPriorityEmbed(priority) {
  const cooldownText = priority.cooldownEndsAt 
    ? `${priority.cooldownMinutes}m (counting down)`
    : 'None';

  const issuedByText = priority.priorityIssuedBy || 'N/A';

  let description = `**Priority active:** ${priority.priorityActive ? 'Active' : 'Inactive'}\n`;
  description += `**Priority cooldown:** ${cooldownText}\n`;
  description += `**Issued by:** ${issuedByText}`;

  if (priority.customMessage) {
    description += `\n\n${priority.customMessage}`;
  }

  return {
    title: 'Priority Tracker',
    description,
    color: priority.priorityActive ? 0xFF0000 : 0x808080,
    footer: { text: 'EverLink' },
  };
}
