import { SlashCommandBuilder } from 'discord.js';
import Welcome from '../models/Welcome.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setwelcomedm')
  .setDescription('Set the welcome DM message that new members receive')
  .addStringOption(option =>
    option.setName('message')
      .setDescription('The welcome DM (use {user} for username, {server} for server name)')
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

    welcome.welcomeDM = message;
    await welcome.save();

    return interaction.reply({
      embeds: [successEmbed(`Welcome DM updated!\n\n**New DM:**\n${message}\n\nNote: Use {user} for the member's username and {server} for the server name.`)],
    });
  } catch (error) {
    console.error('Error setting welcome DM:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the welcome DM. Please try again.')],
      ephemeral: true,
    });
  }
}
