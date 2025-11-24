import { SlashCommandBuilder } from 'discord.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setrp')
  .setDescription('Add an RP event to the calendar (Staff only)')
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
      .setDescription('Time in HH:MM format (e.g., 19:30)')
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
      .setName('psn')
      .setDescription('PSN or username')
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName('description')
      .setDescription('Description of the RP event')
      .setRequired(true)
      .setMaxLength(500)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (!calendar || !calendar.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar is not enabled or configured on this server.')],
        ephemeral: true,
      });
    }

    if (!calendar.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay calendar channel is not configured. Use `/roleplaycalendersetup` to configure it.')],
        ephemeral: true,
      });
    }

    const day = interaction.options.getString('day');
    const person = interaction.options.getString('person');
    const time = interaction.options.getString('time');
    const timezone = interaction.options.getString('timezone');
    const psn = interaction.options.getString('psn');
    const description = interaction.options.getString('description');

    // Create a timestamp for Discord timestamp conversion
    // For now, use current time as placeholder (staff will need to adjust manually if needed)
    const timestamp = Math.floor(Date.now() / 1000);

    // Add event to calendar
    calendar.events.push({
      day,
      person,
      time,
      timezone,
      psn,
      description,
      timestamp,
    });

    await calendar.save();
    await updateCalendarMessage(interaction, calendar);

    return interaction.reply({
      embeds: [successEmbed('RP Event Added', `Added ${person}'s RP event for ${day} at ${time} ${timezone}`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding RP event:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the RP event.')],
      ephemeral: true,
    });
  }
}

async function updateCalendarMessage(interaction, calendar) {
  try {
    const channel = await interaction.guild.channels.fetch(calendar.channelId);
    if (!channel) return;

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
  
  let description = '**Roleplay Calendar**\n\n';

  daysOrder.forEach(day => {
    const dayEvents = calendar.events.filter(e => e.day === day);
    description += `**${day}**\n`;
    
    if (dayEvents.length === 0) {
      description += `No events scheduled\n\n`;
    } else {
      dayEvents.forEach(event => {
        description += `• **${event.person}** - <t:${event.timestamp}:t> ${event.timezone}\n`;
        description += `  PSN: ${event.psn}\n`;
        description += `  ${event.description}\n\n`;
      });
    }
  });

  return {
    title: 'Roleplay Calendar',
    description,
    color: 0x00AA00,
    footer: { text: 'EverLink' },
  };
}
