import { SlashCommandBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdminOrManager } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('addstaff')
  .setDescription('Add staff or staff roles to configure the bot (Admin/Manager)')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to add as staff')
      .setRequired(false))
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to add as staff')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('position')
      .setDescription('Staff position (Staff or Manager)')
      .addChoices(
        { name: 'Staff', value: 'staff' },
        { name: 'Manager', value: 'manager' }
      )
      .setRequired(false))
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Choose action')
      .addChoices(
        { name: 'Add Staff', value: 'add' },
        { name: 'Remove All Staff', value: 'remove_all' }
      )
      .setRequired(false));

export async function execute(interaction) {
  if (!await isAdminOrManager(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators and managers can add staff members.')],
      flags: 64,
    });
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const position = interaction.options.getString('position') || 'staff';
  const action = interaction.options.getString('action') || 'add';

  // Validate action is one of the valid choices
  if (!['add', 'remove_all'].includes(action)) {
    return interaction.reply({
      embeds: [errorEmbed('Invalid action. Please select Add or Remove All Staff.')],
      flags: 64,
    });
  }

  if (action === 'remove_all') {
    try {
      const result = await Staff.deleteMany({ guildId: interaction.guildId });
      return interaction.reply({
        embeds: [successEmbed('All Staff Removed', `Removed ${result.deletedCount} staff member(s) from the bot staff team.`)],
        flags: 64,
      });
    } catch (error) {
      console.error('Error removing all staff:', error);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while removing staff.')],
        flags: 64,
      });
    }
  }

  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Please provide either a user or a role to add as staff.')],
      flags: 64,
    });
  }

  try {
    if (user) {
      const existingStaff = await Staff.findOne({ guildId: interaction.guildId, type: 'user', userId: user.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.tag} is already a staff member in this server.`)],
          flags: 64,
        });
      }

      await Staff.create({
        guildId: interaction.guildId,
        type: 'user',
        position: position,
        userId: user.id,
        username: user.tag,
        addedBy: interaction.user.id,
      });

      return interaction.reply({
        embeds: [successEmbed(`Successfully added ${user.tag} to the bot staff team as ${position}!`)],
        flags: 64,
      });
    }

    if (role) {
      const existingStaff = await Staff.findOne({ guildId: interaction.guildId, type: 'role', roleId: role.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`The role ${role.name} is already a staff role in this server.`)],
          flags: 64,
        });
      }

      await Staff.create({
        guildId: interaction.guildId,
        type: 'role',
        position: position,
        roleId: role.id,
        roleName: role.name,
        addedBy: interaction.user.id,
      });

      return interaction.reply({
        embeds: [successEmbed(`Successfully added the role ${role.name} to the bot staff team as ${position}!`)],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error adding staff:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the staff member. Please try again.')],
      flags: 64,
    });
  }
}
