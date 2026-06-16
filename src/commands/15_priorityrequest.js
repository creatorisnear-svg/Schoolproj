import { SlashCommandBuilder } from 'discord.js';
import Priority from '../models/Priority.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { handlePriorityRequestCommand } from '../handlers/priorityRequestHandler.js';

export const data = new SlashCommandBuilder()
  .setName('priorityrequest')
  .setDescription('Request a priority scene')
  .addStringOption(option =>
    option
      .setName('scene_type')
      .setDescription('What type of scene is this?')
      .setRequired(true)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName('scene_reason')
      .setDescription('Why are you doing this scene?')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addUserOption(option =>
    option
      .setName('members')
      .setDescription('First scene member (you can add more after)')
      .setRequired(true)
  )
  .addUserOption(option =>
    option
      .setName('host')
      .setDescription('Host to ping')
      .setRequired(true)
  );

export async function execute(interaction) {
  try {
    // Check if priority tracker is enabled and has a channel
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled || !priority.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Priority Tracker Not Set Up', 'The priority tracker must be enabled and configured with a channel first. Ask an admin to run `/prioritytrackerconfig`')],
        flags: 64,
      });
    }

    // Get command options
    const sceneType = interaction.options.getString('scene_type');
    const sceneReason = interaction.options.getString('scene_reason');
    const member = interaction.options.getUser('members');
    const host = interaction.options.getUser('host');

    await handlePriorityRequestCommand(interaction, sceneType, sceneReason, member, host);
  } catch (error) {
    console.error('Error in priorityrequest:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting the priority request.')],
      flags: 64,
    });
  }
}
