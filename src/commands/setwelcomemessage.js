import { SlashCommandBuilder } from 'discord.js';
import Welcome from '../models/Welcome.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setwelcomemessage')
  .setDescription('Set the welcome message that appears in the welcome channel')
  .addStringOption(option =>
    option.setName('message')
      .setDescription('The welcome message (use {user} for mention, {server} for server name)')
      .setRequired(true));

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const message = interaction.options.getString('message');

  try {
    let welcome = await Welcome.findOne({ guildId: interaction.guildId });

    if (!welcome) {
      return interaction.reply({
        embeds: [errorEmbed('Welcome system is not set up yet. Use `/welcomesystemsetup` first.')],
        ephemeral: true,
      });
    }

    welcome.welcomeMessage = message;
    await welcome.save();

    return interaction.reply({
      embeds: [successEmbed(`Welcome message updated!\n\n**New message:**\n${message}\n\nNote: Use {user} to mention the new member and {server} for the server name.`)],
    });
  } catch (error) {
    console.error('Error setting welcome message:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the welcome message. Please try again.')],
      ephemeral: true,
    });
  }
}
