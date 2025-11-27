import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { buildCalendarEmbed } from '../utils/calendarBuilder.js';

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

    // Set the channel and send initial calendar message
    calendar.channelId = selectedChannelId;
    await calendar.save();
    console.log(`✅ Calendar channel set to: ${selectedChannelId}`);

    // Send initial calendar message
    try {
      const channel = await interaction.guild.channels.fetch(selectedChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = buildCalendarEmbed(calendar);
        const message = await channel.send({ embeds: [embed] });
        calendar.messageId = message.id;
        await calendar.save();
        console.log(`📅 Initial calendar message sent to channel ${selectedChannelId}`);
      }
    } catch (err) {
      console.error('Error sending initial calendar message:', err.message);
    }

    return interaction.reply({
      embeds: [successEmbed('Roleplay Calendar Channel Set', 
        `Calendar channel has been set to <#${selectedChannelId}>.\n\nNow use /setrp to add your first event!`)],
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

    // Clean up old events
    cleanupOldEvents(calendar);
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

export async function updateCalendarMessage(interaction, calendar) {
  try {
    const channel = await interaction.guild.channels.fetch(calendar.channelId);
    if (!channel) return;

    // If no message exists yet, send one
    if (!calendar.messageId) {
      const embed = buildCalendarEmbed(calendar);
      const message = await channel.send({ embeds: [embed] });
      calendar.messageId = message.id;
      await calendar.save();
      return;
    }

    const embed = buildCalendarEmbed(calendar);

    try {
      const message = await channel.messages.fetch(calendar.messageId);
      await message.edit({ embeds: [embed] });
    } catch (err) {
      // Message might be deleted, send a new one
      const message = await channel.send({ embeds: [embed] });
      calendar.messageId = message.id;
      await calendar.save();
    }
  } catch (error) {
    console.error('Error updating calendar message:', error);
  }
}

function cleanupOldEvents(calendar) {
  const dayMap = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 0,
  };
  
  const now = new Date();
  const currentDay = now.getDay();
  
  calendar.events = calendar.events.filter(event => {
    const eventDay = dayMap[event.day];
    let daysUntil = eventDay - currentDay;
    
    if (daysUntil < 0) {
      return false;
    }
    return true;
  });
}
