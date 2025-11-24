import { SlashCommandBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removestaff')
  .setDescription('Remove a user or role from the bot staff team (Admin only)')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to remove from staff')
      .setRequired(false))
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to remove from staff')
      .setRequired(false));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can remove staff members.')],
      flags: 64,
    });
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Please provide either a user or a role to remove from staff.')],
      flags: 64,
    });
  }

  try {
    if (user) {
      const result = await Staff.deleteOne({ guildId: interaction.guildId, type: 'user', userId: user.id });
      if (result.deletedCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.tag} is not a staff member in this server.`)],
          flags: 64,
        });
      }

      return interaction.reply({
        embeds: [successEmbed(`Successfully removed ${user.tag} from the bot staff team!`)],
        flags: 64,
      });
    }

    if (role) {
      const result = await Staff.deleteOne({ guildId: interaction.guildId, type: 'role', roleId: role.id });
      if (result.deletedCount === 0) {
        return interaction.reply({
          embeds: [errorEmbed(`The role ${role.name} is not a staff role in this server.`)],
          flags: 64,
        });
      }

      return interaction.reply({
        embeds: [successEmbed(`Successfully removed the role ${role.name} from the bot staff team!`)],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error removing staff:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the staff member. Please try again.')],
      flags: 64,
    });
  }
}
