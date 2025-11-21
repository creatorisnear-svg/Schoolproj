import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('addrequestping')
  .setDescription('Add a role to be pinged when user requests are submitted')
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to ping for user requests')
      .setRequired(true));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can add request roles.')],
      ephemeral: true,
    });
  }

  const role = interaction.options.getRole('role');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (config && config.requestRoles.includes(role.id)) {
      return interaction.reply({
        embeds: [errorEmbed(`${role.name} is already in the request ping list.`)],
        ephemeral: true,
      });
    }

    await Config.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $addToSet: { requestRoles: role.id } },
      { upsert: true, new: true }
    );

    return interaction.reply({
      embeds: [successEmbed(`${role} will now be pinged when user requests are submitted.`)],
    });
  } catch (error) {
    console.error('Error adding request role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the request role. Please try again.')],
      ephemeral: true,
    });
  }
}
