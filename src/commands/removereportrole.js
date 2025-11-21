import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removereportrole')
  .setDescription('Remove a role from being pinged when 911 reports are submitted')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to remove from 911 report pings')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can remove report roles.')],
      ephemeral: true,
    });
  }

  const role = interaction.options.getRole('role');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.reportRoles.includes(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed(`${role.name} is not in the report ping list.`)],
        ephemeral: true,
      });
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $pull: { reportRoles: role.id } },
      { new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`${role} will no longer be pinged for 911 reports.`)],
    });
  } catch (error) {
    console.error('Error removing report role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the report role. Please try again.')],
      ephemeral: true,
    });
  }
}
