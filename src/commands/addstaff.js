import { SlashCommandBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('addstaff')
  .setDescription('Add a user or role to the bot staff team')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to add as staff')
      .setRequired(false))
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to add as staff')
      .setRequired(false));

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can add staff members.')],
      ephemeral: true,
    });
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Please provide either a user or a role to add as staff.')],
      ephemeral: true,
    });
  }

  try {
    if (user) {
      const existingStaff = await Staff.findOne({ userId: user.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.tag} is already a staff member.`)],
          ephemeral: true,
        });
      }

      await Staff.create({
        userId: user.id,
        username: user.tag,
        addedBy: interaction.user.id,
      });

      return interaction.reply({
        embeds: [successEmbed(`Successfully added ${user.tag} to the bot staff team!`)],
      });
    }

    if (role) {
      const existingStaff = await Staff.findOne({ roleId: role.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`The role ${role.name} is already a staff role.`)],
          ephemeral: true,
        });
      }

      await Staff.create({
        userId: role.id,
        username: `Role: ${role.name}`,
        roleId: role.id,
        roleName: role.name,
        addedBy: interaction.user.id,
      });

      return interaction.reply({
        embeds: [successEmbed(`Successfully added the role ${role.name} to the bot staff team!`)],
      });
    }
  } catch (error) {
    console.error('Error adding staff:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the staff member. Please try again.')],
      ephemeral: true,
    });
  }
}
