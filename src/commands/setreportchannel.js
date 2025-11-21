import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setreportchannel')
  .setDescription('Set the channel where 911 reports will be sent')
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('The channel for 911 reports')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can set the report channel.')],
      ephemeral: true,
    });
  }

  const channel = interaction.options.getChannel('channel');

  if (!channel.isTextBased()) {
    return interaction.reply({
      embeds: [errorEmbed('Please select a text channel.')],
      ephemeral: true,
    });
  }

  try {
    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { reportChannelId: channel.id },
      { upsert: true, new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`911 reports will now be sent to ${channel}`)],
    });
  } catch (error) {
    console.error('Error setting report channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting the report channel. Please try again.')],
      ephemeral: true,
    });
  }
}
