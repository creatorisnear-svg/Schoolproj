import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { isAdminOrManager, checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('Manage bot staff members and roles')
  // ── add ──────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Add a user or role to the bot staff team (Admin/Manager)')
      .addUserOption(o => o.setName('user').setDescription('The user to add as staff'))
      .addRoleOption(o => o.setName('role').setDescription('The role to add as staff'))
      .addStringOption(o =>
        o.setName('position')
          .setDescription('Staff position')
          .addChoices(
            { name: 'Staff', value: 'staff' },
            { name: 'Manager', value: 'manager' },
          )
      )
  )
  // ── remove ────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Remove a user or role from the bot staff team (Admin/Manager)')
      .addUserOption(o => o.setName('user').setDescription('The user to remove from staff'))
      .addRoleOption(o => o.setName('role').setDescription('The role to remove from staff'))
      .addBooleanOption(o => o.setName('all').setDescription('Remove ALL staff members at once'))
  )
  // ── list ──────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('View all current bot staff members')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── add ──────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    if (!await isAdminOrManager(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command. Only administrators and managers can add staff members.')],
        flags: 64,
      });
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const position = interaction.options.getString('position') || 'staff';

    if (!user && !role) {
      return interaction.reply({
        embeds: [errorEmbed('Please provide either a user or a role to add as staff.')],
        flags: 64,
      });
    }

    try {
      if (user) {
        const existing = await Staff.findOne({ guildId: interaction.guildId, type: 'user', userId: user.id });
        if (existing) {
          return interaction.reply({
            embeds: [errorEmbed(`${user.tag} is already a staff member in this server.`)],
            flags: 64,
          });
        }
        await Staff.create({
          guildId: interaction.guildId,
          type: 'user',
          position,
          userId: user.id,
          username: user.tag,
          addedBy: interaction.user.id,
        });
        return interaction.reply({
          embeds: [successEmbed('Staff Added', `Successfully added ${user.tag} to the bot staff team as **${position}**!`)],
          flags: 64,
        });
      }

      if (role) {
        const existing = await Staff.findOne({ guildId: interaction.guildId, type: 'role', roleId: role.id });
        if (existing) {
          return interaction.reply({
            embeds: [errorEmbed(`The role ${role.name} is already a staff role in this server.`)],
            flags: 64,
          });
        }
        await Staff.create({
          guildId: interaction.guildId,
          type: 'role',
          position,
          roleId: role.id,
          roleName: role.name,
          addedBy: interaction.user.id,
        });
        return interaction.reply({
          embeds: [successEmbed('Staff Role Added', `Successfully added the role **${role.name}** to the bot staff team as **${position}**!`)],
          flags: 64,
        });
      }
    } catch (err) {
      console.error('Error adding staff:', err);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while adding the staff member. Please try again.')],
        flags: 64,
      });
    }
  }

  // ── remove ────────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    if (!await isAdminOrManager(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command. Only administrators and managers can remove staff members.')],
        flags: 64,
      });
    }

    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const removeAll = interaction.options.getBoolean('all');

    if (removeAll) {
      try {
        const result = await Staff.deleteMany({ guildId: interaction.guildId });
        return interaction.reply({
          embeds: [successEmbed('All Staff Removed', `Removed **${result.deletedCount}** staff member(s) from the bot staff team.`)],
          flags: 64,
        });
      } catch (err) {
        console.error('Error removing all staff:', err);
        return interaction.reply({
          embeds: [errorEmbed('An error occurred while removing all staff.')],
          flags: 64,
        });
      }
    }

    if (!user && !role) {
      return interaction.reply({
        embeds: [errorEmbed('Please provide a user, role, or set **all** to true.')],
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
          embeds: [successEmbed('Staff Removed', `Successfully removed **${user.tag}** from the bot staff team!`)],
          flags: 64,
        });
      }

      if (role) {
        const result = await Staff.deleteOne({ guildId: interaction.guildId, type: 'role', roleId: role.id });
        if (result.deletedCount === 0) {
          return interaction.reply({
            embeds: [errorEmbed(`The role **${role.name}** is not a staff role in this server.`)],
            flags: 64,
          });
        }
        return interaction.reply({
          embeds: [successEmbed('Staff Role Removed', `Successfully removed the role **${role.name}** from the bot staff team!`)],
          flags: 64,
        });
      }
    } catch (err) {
      console.error('Error removing staff:', err);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while removing the staff member. Please try again.')],
        flags: 64,
      });
    }
  }

  // ── list ──────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    if (!await checkStaffPermission(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command.')],
        flags: 64,
      });
    }

    try {
      const staffMembers = await Staff.find({ guildId: interaction.guildId });

      if (staffMembers.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed('Staff List', 'No staff members have been added yet.')],
          flags: 64,
        });
      }

      const staffList = staffMembers.map((s, i) => {
        const type = s.type === 'role' ? 'Role' : 'User';
        const name = s.type === 'role' ? s.roleName : s.username;
        const addedDate = new Date(s.addedAt).toLocaleDateString();
        return `\`${i + 1}.\` **${name}** - ${type} · ${s.position ?? 'staff'} · Added ${addedDate}`;
      }).join('\n');

      const embed = infoEmbed('Staff List', staffList);
      embed.addFields({ name: 'Total', value: `${staffMembers.length}`, inline: true });

      return interaction.reply({ embeds: [embed], flags: 64 });
    } catch (err) {
      console.error('Error fetching staff list:', err);
      return interaction.reply({
        embeds: [errorEmbed('An error occurred while fetching the staff list.')],
        flags: 64,
      });
    }
  }
}
