import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removerequestrole')
  .setDescription('Remove a role from being pinged when user requests are submitted')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to remove from request pings')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can remove request roles.')],
      ephemeral: true,
    });
  }

  const role = interaction.options.getRole('role');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.requestRoles.includes(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed(`${role.name} is not in the request ping list.`)],
        ephemeral: true,
      });
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $pull: { requestRoles: role.id } },
      { new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`${role} will no longer be pinged for user requests.`)],
    });
  } catch (error) {
    console.error('Error removing request role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the request role. Please try again.')],
      ephemeral: true,
    });
  }
}
