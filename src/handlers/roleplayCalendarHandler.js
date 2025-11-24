import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handleRoleplayCalendarChannelSelect(interaction) {
  if (!interaction.customId.startsWith('roleplaycalendarsetup_channel')) {
    return;
  }

  try {
    const selectedChannelId = interaction.values[0];
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar configuration not found.')],
        flags: 64,
      });
    }

    calendar.channelId = selectedChannelId;
    await calendar.save();

    // Send initial calendar message
    const channel = await interaction.guild.channels.fetch(calendar.channelId);
    const embed = buildCalendarEmbed(calendar);
    const message = await channel.send({ embeds: [embed] });

    calendar.messageId = message.id;
    await calendar.save();

    const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = await import('discord.js');
    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_calendar_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    return interaction.reply({
      embeds: [successEmbed('Roleplay Calendar Setup Complete', 
        `Roleplay calendar has been created in <#${calendar.channelId}>. Use /setrp to add events and /unsetrp to remove them.`)],
      components: [backButton],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in roleplay calendar channel select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting up the roleplay calendar.')],
      flags: 64,
    });
  }
}

export async function handleUnsetRpSelect(interaction) {
  if (!interaction.customId.startsWith('unsetrp_select')) {
    return;
  }

  try {
    const selectedValue = interaction.values[0];
    const eventIndex = parseInt(selectedValue.split('_')[1]);

    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar || eventIndex >= calendar.events.length) {
      return interaction.reply({
        embeds: [errorEmbed('Event not found.')],
        flags: 64,
      });
    }

    const removedEvent = calendar.events[eventIndex];
    calendar.events.splice(eventIndex, 1);
    await calendar.save();

    await updateCalendarMessage(interaction, calendar);

    return interaction.reply({
      embeds: [successEmbed('RP Event Removed', `Removed ${removedEvent.person}'s event for ${removedEvent.day}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in unsetrp select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the RP event.')],
      flags: 64,
    });
  }
}

async function updateCalendarMessage(interaction, calendar) {
  try {
    const channel = await interaction.guild.channels.fetch(calendar.channelId);
    if (!channel || !calendar.messageId) return;

    const embed = buildCalendarEmbed(calendar);

    try {
      const message = await channel.messages.fetch(calendar.messageId);
      await message.edit({ embeds: [embed] });
    } catch (err) {
      const message = await channel.send({ embeds: [embed] });
      calendar.messageId = message.id;
      await calendar.save();
    }
  } catch (error) {
    console.error('Error updating calendar message:', error);
  }
}

function buildCalendarEmbed(calendar) {
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  let description = '**Roleplay Calendar**\n\n';

  daysOrder.forEach(day => {
    const dayEvents = calendar.events.filter(e => e.day === day);
    description += `**${day}**\n`;
    
    if (dayEvents.length === 0) {
      description += `No events scheduled\n\n`;
    } else {
      dayEvents.forEach(event => {
        description += `• **${event.person}** - <t:${event.timestamp}:t>\n`;
        description += `  PSN: ${event.psn}\n`;
        description += `  ${event.description}\n\n`;
      });
    }
  });

  description += '*Times are shown in your local timezone*';

  return {
    title: 'Roleplay Calendar',
    description,
    color: 0x00AA00,
    footer: { text: 'EverLink' },
  };
}
