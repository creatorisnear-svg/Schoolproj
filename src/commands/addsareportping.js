import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('addsareportping')
  .setDescription('Add a role to be pinged when San Andreas Reports are submitted')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to ping for SA reports')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can add SA report roles.')],
      ephemeral: true,
    });
  }

  const role = interaction.options.getRole('role');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (config && config.saReportRoles.includes(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed(`${role.name} is already in the SA report ping list.`)],
        ephemeral: true,
      });
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $addToSet: { saReportRoles: role.id } },
      { upsert: true, new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`${role} will now be pinged when San Andreas Reports are submitted.`)],
    });
  } catch (error) {
    console.error('Error adding SA report role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the SA report role. Please try again.')],
      ephemeral: true,
    });
  }
}
