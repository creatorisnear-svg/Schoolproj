import { SlashCommandBuilder } from 'discord.js';
import Priority from '../models/Priority.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('deactivatepriority')
  .setDescription('Deactivate priority and/or cooldown (Admin/Staff)')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('What to deactivate')
      .addChoices(
        { name: 'deactivatepriority', value: 'priority' },
        { name: 'deactivatepriority', value: 'cooldown' },
        { name: 'deactivatepriority', value: 'both' }
      )
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const type = interaction.options.getString('type');
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker is not enabled or configured on this server.')],
        flags: 64,
      });
    }

    if (!priority.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker channel is not configured. Use `/prioritytrackersetup` to configure it.')],
        flags: 64,
      });
    }

    let deactivatedMessage = '';

    if (type === 'priority' || type === 'both') {
      priority.priorityActive = false;
      priority.priorityIssuedBy = null;
      deactivatedMessage += 'Priority deactivated. ';
    }

    if (type === 'cooldown' || type === 'both') {
      priority.cooldownMinutes = 0;
      priority.cooldownEndsAt = null;
      priority.cooldownIssuedBy = null;
      deactivatedMessage += 'Cooldown deactivated.';
    }

    await priority.save();
    await updatePriorityMessage(interaction, priority);

    return interaction.reply({
      embeds: [successEmbed('Deactivated', deactivatedMessage.trim())],
      flags: 64,
    });
  } catch (error) {
    console.error('Error deactivating priority:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while deactivating priority.')],
      flags: 64,
    });
  }
}

async function updatePriorityMessage(interaction, priority) {
  try {
    const channel = await interaction.guild.channels.fetch(priority.channelId);
    if (!channel) return;

    const embed = buildPriorityEmbed(priority);

    if (priority.messageId) {
      try {
        const message = await channel.messages.fetch(priority.messageId);
        await message.edit({ embeds: [embed] });
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
  } catch (error) {
    console.error('Error updating priority message:', error);
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

  return {
    title: 'Priority Tracker',
    description,
    color: priority.priorityActive ? 0xFF0000 : 0x808080,
    footer: { text: 'EverLink' },
  };
}
