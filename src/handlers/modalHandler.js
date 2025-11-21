import { EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handleModalSubmit(interaction) {
  if (interaction.customId === '911report') {
    await handle911Report(interaction);
  }
}

async function handle911Report(interaction) {
  const issue = interaction.fields.getTextInputValue('issue');
  const location = interaction.fields.getTextInputValue('location');
  const suspects = interaction.fields.getTextInputValue('suspects') || 'N/A';
  const description = interaction.fields.getTextInputValue('description') || 'N/A';
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
      .setTitle('🚨 911 REPORT')
      .addFields(
        { name: '📋 Issue', value: issue, inline: false },
        { name: '📍 Location', value: location, inline: false },
        { name: '👤 Suspects Involved', value: suspects, inline: false },
        { name: '🔍 Suspect & Vehicle Description', value: description, inline: false },
        { name: '📞 Contact Information', value: contact, inline: false },
        { name: '👮 Submitted By', value: `${interaction.user.tag} (${interaction.user})`, inline: false }
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
