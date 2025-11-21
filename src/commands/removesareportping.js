import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removesareportping')
  .setDescription('Remove a role from being pinged when San Andreas Reports are submitted')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to remove from SA report pings')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can remove SA report roles.')],
      ephemeral: true,
    });
  }

  const role = interaction.options.getRole('role');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.saReportRoles.includes(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed(`${role.name} is not in the SA report ping list.`)],
        ephemeral: true,
      });
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $pull: { saReportRoles: role.id } },
      { new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`${role} will no longer be pinged for San Andreas Reports.`)],
    });
  } catch (error) {
    console.error('Error removing SA report role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the SA report role. Please try again.')],
      ephemeral: true,
    });
  }
}
