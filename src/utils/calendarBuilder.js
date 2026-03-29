import { EmbedBuilder } from 'discord.js';

export function buildCalendarEmbed(calendar) {
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayMap = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 0,
  };
  
  const now = new Date();
  const currentDay = now.getDay();
  
  const upcomingDays = [];
  const pastDays = [];
  
  daysOrder.forEach(dayName => {
    const targetDay = dayMap[dayName];
    let daysFromNow = targetDay - currentDay;
    
    if (daysFromNow < 0) {
      pastDays.push({ dayName, daysFromNow });
    } else {
      upcomingDays.push({ dayName, daysFromNow });
    }
  });
  
  pastDays.sort((a, b) => a.daysFromNow - b.daysFromNow);
  const orderedDays = [...upcomingDays, ...pastDays];
  
  let description = '';

  orderedDays.forEach(({ dayName, daysFromNow }) => {
    const daysToAdd = daysFromNow < 0 ? daysFromNow + 7 : daysFromNow;
    
    const calendarDate = new Date(now);
    calendarDate.setDate(calendarDate.getDate() + daysToAdd);
    calendarDate.setHours(0, 0, 0, 0);
    
    const dateStr = `${dayName}, ${calendarDate.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
    
    const dayEvents = calendar.events.filter(e => e.day === dayName);
    
    description += `**${dateStr}**\n`;
    
    if (dayEvents.length === 0) {
      description += `No events\n\n`;
    } else {
      dayEvents.forEach(event => {
        description += `• **${event.person}** - <t:${event.timestamp}:t>\n`;
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

  return new EmbedBuilder()
    .setTitle('Roleplay Calendar')
    .setDescription(description)
    .setColor(0x00AA00)
    .setFooter({ text: 'RPM' });
}
