import { SlashCommandBuilder } from 'discord.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setrp')
  .setDescription('Add an RP event to the calendar (Admin/Staff)')
  .addStringOption(option =>
    option
      .setName('day')
      .setDescription('Day of the week')
      .addChoices(
        { name: 'Monday', value: 'Monday' },
        { name: 'Tuesday', value: 'Tuesday' },
        { name: 'Wednesday', value: 'Wednesday' },
        { name: 'Thursday', value: 'Thursday' },
        { name: 'Friday', value: 'Friday' },
        { name: 'Saturday', value: 'Saturday' },
        { name: 'Sunday', value: 'Sunday' }
      )
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('person')
      .setDescription('Name of person hosting/doing RP')
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName('time')
      .setDescription('Time in 12-hour format with AM/PM (e.g., 7:30 PM, 2:00 AM)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('timezone')
      .setDescription('Timezone (e.g., EST, PST, UTC)')
      .setRequired(true)
      .setMaxLength(50)
  )
  .addStringOption(option =>
    option
      .setName('description')
      .setDescription('Description of the RP event')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption(option =>
    option
      .setName('psn')
      .setDescription('PSN gamertag (optional)')
      .setRequired(false)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName('xbox')
      .setDescription('XBOX gamertag (optional)')
      .setRequired(false)
      .setMaxLength(100)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar || !calendar.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar is not enabled or configured on this server.')],
        flags: 64,
      });
    }

    if (!calendar.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar channel is not configured. Use `/roleplaycalendersetup` to configure it.')],
        flags: 64,
      });
    }

    const day = interaction.options.getString('day');
    const person = interaction.options.getString('person');
    const time = interaction.options.getString('time');
    const timezone = interaction.options.getString('timezone');
    const psn = interaction.options.getString('psn');
    const xbox = interaction.options.getString('xbox') || null;
    const description = interaction.options.getString('description');

    // Validate time format (12-hour with AM/PM)
    if (!/^\d{1,2}:\d{2}\s+(AM|PM|am|pm)$/.test(time)) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid time format. Please use 12-hour format with AM/PM (e.g., 7:30 PM or 2:00 AM).')],
        flags: 64,
      });
    }

    // Convert time + timezone to Discord timestamp
    const timestamp = convertToTimestamp(day, time, timezone);

    // Add event to calendar
    calendar.events.push({
      day,
      person,
      time,
      timezone,
      psn,
      xbox,
      description,
      timestamp,
    });

    await calendar.save();
    
    // Clean up old events from passed days
    cleanupOldEvents(calendar);
    
    await updateCalendarMessage(interaction, calendar);

    return interaction.reply({
      embeds: [successEmbed('RP Event Added', `Added ${person}'s RP event for ${day} at ${time} ${timezone}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error adding RP event:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the RP event.')],
      flags: 64,
    });
  }
}

function cleanupOldEvents(calendar) {
  const dayMap = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 0,
  };
  
  const now = new Date();
  const currentDay = now.getDay();
  
  // Remove events from passed days
  calendar.events = calendar.events.filter(event => {
    const eventDay = dayMap[event.day];
    let daysUntil = eventDay - currentDay;
    
    // If daysUntil is negative, the day has passed
    if (daysUntil < 0) {
      return false; // Delete this event
    }
    return true; // Keep this event
  });
}

async function updateCalendarMessage(interaction, calendar) {
  try {
    const channel = await interaction.guild.channels.fetch(calendar.channelId);
    if (!channel) return;

    // Clean up old events before displaying
    cleanupOldEvents(calendar);
    await calendar.save();

    const embed = buildCalendarEmbed(calendar);

    if (calendar.messageId) {
      try {
        const message = await channel.messages.fetch(calendar.messageId);
        await message.edit({ embeds: [embed] });
      } catch (err) {
        const message = await channel.send({ embeds: [embed] });
        calendar.messageId = message.id;
        await calendar.save();
      }
    } else {
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
  const dayMap = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 0,
  };
  
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Build calendar with days ordered: upcoming first, then past days at bottom
  const upcomingDays = [];
  const pastDays = [];
  
  daysOrder.forEach(dayName => {
    const targetDay = dayMap[dayName];
    let daysFromNow = targetDay - currentDay;
    
    // Negative = day has passed this week
    if (daysFromNow < 0) {
      pastDays.push({ dayName, daysFromNow });
    } else {
      upcomingDays.push({ dayName, daysFromNow });
    }
  });
  
  // Sort past days, then combine: upcoming first, past days at bottom
  pastDays.sort((a, b) => a.daysFromNow - b.daysFromNow);
  const orderedDays = [...upcomingDays, ...pastDays];
  
  let description = '**Roleplay Calendar**\n\n';

  orderedDays.forEach(({ dayName, daysFromNow }) => {
    // Calculate days to add to get the actual calendar date
    const daysToAdd = daysFromNow < 0 ? daysFromNow + 7 : daysFromNow;
    
    // Get the actual calendar date
    const calendarDate = new Date(now);
    calendarDate.setDate(calendarDate.getDate() + daysToAdd);
    calendarDate.setHours(0, 0, 0, 0);
    
    // Format: "Monday, Nov 25"
    const dateStr = `${dayName}, ${calendarDate.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
    
    // Get events for this day
    const dayEvents = calendar.events.filter(e => e.day === dayName);
    
    description += `**${dateStr}**\n`;
    
    if (dayEvents.length === 0) {
      description += `No events\n\n`;
    } else {
      dayEvents.forEach(event => {
        description += `• **${event.person}** - <t:${event.timestamp}:t>\n`;
        
        // Show gamertags if provided
        const gamertags = [];
        if (event.psn) gamertags.push(`PSN: ${event.psn}`);
        if (event.xbox) gamertags.push(`XBOX: ${event.xbox}`);
        
        if (gamertags.length > 0) {
          description += `  ${gamertags.join(' | ')}\n`;
        }
        
        description += `  ${event.description}\n\n`;
      });
    }
  });

  description += '*Times shown in your local timezone*';

  return {
    title: 'Roleplay Calendar',
    description,
    color: 0x00AA00,
    footer: { text: 'EverLink' },
  };
}

function convertToTimestamp(day, time, timezone) {
  // Timezone offsets from UTC
  const timezoneMap = {
    'EST': -5, 'EDT': -4,
    'CST': -6, 'CDT': -5,
    'MST': -7, 'MDT': -6,
    'PST': -8, 'PDT': -7,
    'UTC': 0, 'GMT': 0,
    'CET': 1, 'CEST': 2,
    'EET': 2, 'EEST': 3,
    'IST': 5.5, 'JST': 9, 'AEST': 10,
  };

  const dayMap = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 0,
  };

  // Parse time in 12-hour format with AM/PM
  const timeRegex = /^(\d{1,2}):(\d{2})\s+(AM|PM|am|pm)$/;
  const match = time.match(timeRegex);
  if (!match) return Math.floor(Date.now() / 1000);

  let [, hoursStr, minutesStr, period] = match;
  let hours = parseInt(hoursStr);
  const minutes = parseInt(minutesStr);
  const isPM = period.toUpperCase() === 'PM';

  // Convert to 24-hour format
  if (isPM && hours !== 12) {
    hours += 12;
  } else if (!isPM && hours === 12) {
    hours = 0;
  }

  // Get timezone offset
  const offset = timezoneMap[timezone.toUpperCase()] || 0;

  // Get next occurrence of the day
  const now = new Date();
  const targetDay = dayMap[day];
  const currentDay = now.getDay();

  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // If day has passed, get next week

  // Create date for the event
  const eventDate = new Date(now);
  eventDate.setDate(eventDate.getDate() + daysUntil);
  eventDate.setHours(hours, minutes, 0, 0);

  // Convert to UTC by subtracting the offset
  const utcDate = new Date(eventDate.getTime() - offset * 60 * 60 * 1000);

  // Return Unix timestamp
  return Math.floor(utcDate.getTime() / 1000);
}
