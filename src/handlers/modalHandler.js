import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

const tempReportData = new Map();

setInterval(() => {
  const now = Date.now();
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  
  for (const [userId, data] of tempReportData.entries()) {
    if (now - data.timestamp > FIFTEEN_MINUTES) {
      tempReportData.delete(userId);
    }
  }
}, 5 * 60 * 1000);

export async function handleModalSubmit(interaction) {
  if (interaction.customId === '911report') {
    await handle911Report(interaction);
  } else if (interaction.customId === 'sareport_part1') {
    await handleSAReportPart1(interaction);
  } else if (interaction.customId.startsWith('sareport_part2_')) {
    await handleSAReportPart2(interaction);
  } else if (interaction.customId === 'request') {
    await handleRequest(interaction);
  }
}

async function handle911Report(interaction) {
  const issue = interaction.fields.getTextInputValue('issue');
  const location = interaction.fields.getTextInputValue('location');
  const suspectsDescription = interaction.fields.getTextInputValue('suspectsDescription') || 'N/A';
  const lastSeen = interaction.fields.getTextInputValue('lastSeen') || 'N/A';
  const contact = interaction.fields.getTextInputValue('contact') || 'N/A';

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.reportChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('No report channel has been configured. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportChannel = await interaction.guild.channels.fetch(config.reportChannelId);

    if (!reportChannel) {
      return interaction.reply({
        embeds: [errorEmbed('The configured report channel could not be found. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('__**911 REPORT**__')
      .addFields(
        { name: '__Issue__', value: issue, inline: false },
        { name: '__Location__', value: location, inline: false },
        { name: '__Suspects & Vehicle Information__', value: suspectsDescription, inline: false },
        { name: '__Last Seen__', value: lastSeen, inline: false },
        { name: '__Contact Information__', value: contact, inline: false },
        { name: '__Submitted By__', value: `${interaction.user.tag} (${interaction.user})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'SΛRP GTA 5 PS5 Roleplay' });

    let roleMentions = '';
    if (config.reportRoles && config.reportRoles.length > 0) {
      roleMentions = config.reportRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await reportChannel.send({
      content: roleMentions || undefined,
      embeds: [reportEmbed],
    });

    return interaction.reply({
      embeds: [successEmbed('Your 911 report has been submitted successfully! Emergency services have been notified.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error submitting 911 report:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting your report. Please try again or contact an administrator.')],
      ephemeral: true,
    });
  }
}

async function handleSAReportPart1(interaction) {
  const suspect = interaction.fields.getTextInputValue('suspect');
  const vehicle = interaction.fields.getTextInputValue('vehicle');
  const datetime = interaction.fields.getTextInputValue('datetime');
  const location = interaction.fields.getTextInputValue('location');
  const summary = interaction.fields.getTextInputValue('summary');

  const userId = interaction.user.id;
  tempReportData.set(userId, {
    suspect,
    vehicle,
    datetime,
    location,
    summary,
    timestamp: Date.now(),
  });

  const button = new ButtonBuilder()
    .setCustomId(`continue_sareport_${userId}`)
    .setLabel('Continue to Part 2')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  return interaction.reply({
    embeds: [successEmbed('Part 1 submitted! Click the button below to continue with Part 2 of the report.')],
    components: [row],
    ephemeral: true,
  });
}

async function handleSAReportPart2(interaction) {
  const userId = interaction.customId.split('_')[2];
  const reportData = tempReportData.get(userId);

  if (!reportData) {
    return interaction.reply({
      embeds: [errorEmbed('Report data expired. Please start over with /sareport')],
      ephemeral: true,
    });
  }

  const violations = interaction.fields.getTextInputValue('violations');
  const fineAmount = interaction.fields.getTextInputValue('fineAmount');
  const jailTime = interaction.fields.getTextInputValue('jailTime');
  const notes = interaction.fields.getTextInputValue('notes') || 'N/A';
  const officerInfo = interaction.fields.getTextInputValue('officerInfo');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.saReportChannelId) {
      tempReportData.delete(userId);
      return interaction.reply({
        embeds: [errorEmbed('No San Andreas Report channel has been configured. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportChannel = await interaction.guild.channels.fetch(config.saReportChannelId);

    if (!reportChannel) {
      tempReportData.delete(userId);
      return interaction.reply({
        embeds: [errorEmbed('The configured SA report channel could not be found. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('__**San Andreas Report**__')
      .setDescription(`> **Suspect:** ${reportData.suspect}\n> **Vehicle:** ${reportData.vehicle}\n>\n> **Date:** ${reportData.datetime.split(' at ')[0] || reportData.datetime}\n> **Time:** ${reportData.datetime.split(' at ')[1] || 'N/A'}\n> **Location:** ${reportData.location}\n>\n> ### ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n>\n> **Summary of Events:** ${reportData.summary}\n>\n> **Violations:** ${violations}\n>\n> ### ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n>\n> **Fine Amount:** ${fineAmount}\n>\n> **Jail Time:** ${jailTime}\n>\n> ### ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n>\n> **Notes:** ${notes}\n>\n> **Officer Callsign:** ${officerInfo.split('\n')[0] || 'N/A'}\n> **Agency:** ${officerInfo.split('\n')[1] || 'N/A'}`)
      .setTimestamp()
      .setFooter({ text: 'SΛRP GTA 5 PS5 Roleplay' });

    let roleMentions = '';
    if (config.saReportRoles && config.saReportRoles.length > 0) {
      roleMentions = config.saReportRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await reportChannel.send({
      content: roleMentions || undefined,
      embeds: [reportEmbed],
    });

    tempReportData.delete(userId);

    return interaction.reply({
      embeds: [successEmbed('Your San Andreas Report has been submitted successfully!')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error submitting SA report:', error);
    tempReportData.delete(userId);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting your report. Please try again or contact an administrator.')],
      ephemeral: true,
    });
  }
}

async function handleRequest(interaction) {
  const requestType = interaction.fields.getTextInputValue('requestType');
  const requestDetails = interaction.fields.getTextInputValue('requestDetails');
  const reason = interaction.fields.getTextInputValue('reason') || 'N/A';

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.requestChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('No request channel has been configured. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const requestChannel = await interaction.guild.channels.fetch(config.requestChannelId);

    if (!requestChannel) {
      return interaction.reply({
        embeds: [errorEmbed('The configured request channel could not be found. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const requestEmbed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('__**User Request**__')
      .setDescription(`> **${requestType}**\n>\n> ${requestDetails}`)
      .addFields(
        { name: '__Reason/Justification__', value: reason, inline: false },
        { name: '__Submitted By__', value: `${interaction.user} (${interaction.user.tag})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'SΛRP GTA 5 PS5 Roleplay • We will handle this within 72 hours if approved' });

    let roleMentions = '';
    if (config.requestRoles && config.requestRoles.length > 0) {
      roleMentions = config.requestRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await requestChannel.send({
      content: roleMentions || undefined,
      embeds: [requestEmbed],
    });

    return interaction.reply({
      embeds: [successEmbed('Your request has been submitted successfully! We will review it and get back to you within 72 hours if approved.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error submitting request:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting your request. Please try again or contact an administrator.')],
      ephemeral: true,
    });
  }
}
