import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setrequestchannel')
  .setDescription('Set the channel where user requests will be sent')
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('The channel for user requests')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can set the request channel.')],
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
      { requestChannelId: channel.id },
      { upsert: true, new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`User requests will now be sent to ${channel}`)],
    });
  } catch (error) {
    console.error('Error setting request channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting the request channel. Please try again.')],
      ephemeral: true,
    });
  }
}
