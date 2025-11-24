import { SlashCommandBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('addstaff')
  .setDescription('Add staff or staff roles to configure the bot (Admin only) - Required to set up log channel')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to add as staff')
      .setRequired(false))
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('The role to add as staff')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('action')
      .setDescription('Choose action')
      .addChoices(
        { name: '02addstaff', value: 'none' },
        { name: '02addstaff', value: 'add' },
        { name: '02addstaff', value: 'remove_all' }
      )
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
  const action = interaction.options.getString('action') || 'add';

  if (action === 'none') {
    return interaction.reply({
      embeds: [errorEmbed('Please select an action (Add or Remove All Staff).')],
      ephemeral: true,
    });
  }

  if (action === 'remove_all') {
    try {
      const result = await Staff.deleteMany({ guildId: interaction.guildId });
      return interaction.reply({
        embeds: [successEmbed('All Staff Removed', `Removed ${result.deletedCount} staff member(s) from the bot staff team.`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error removing all staff:', error);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while removing staff.')],
        ephemeral: true,
      });
    }
  }

  if (!user && !role) {
    return interaction.reply({
      embeds: [errorEmbed('Please provide either a user or a role to add as staff.')],
      ephemeral: true,
    });
  }

  try {
    if (user) {
      const existingStaff = await Staff.findOne({ guildId: interaction.guildId, type: 'user', userId: user.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.tag} is already a staff member in this server.`)],
          ephemeral: true,
        });
      }

      await Staff.create({
        guildId: interaction.guildId,
        type: 'user',
        userId: user.id,
        username: user.tag,
        addedBy: interaction.user.id,
      });

      return interaction.reply({
        embeds: [successEmbed(`Successfully added ${user.tag} to the bot staff team!`)],
      });
    }

    if (role) {
      const existingStaff = await Staff.findOne({ guildId: interaction.guildId, type: 'role', roleId: role.id });
      if (existingStaff) {
        return interaction.reply({
          embeds: [errorEmbed(`The role ${role.name} is already a staff role in this server.`)],
          ephemeral: true,
        });
      }

      await Staff.create({
        guildId: interaction.guildId,
        type: 'role',
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
