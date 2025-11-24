import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('manageroles')
  .setDescription('Manage and remove roles (Approvers/Staff only)');

export async function execute(interaction) {
  try {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!config || !config.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The role request system is not enabled.')],
        flags: 64,
      });
    }

    // Only approvers can manage roles - NOT staff/admins
    // Find which roles this user can manage
    const managedRoles = [];
    
    // Check all roles to see which ones this user can manage
    for (const roleConfig of config.roles) {
      let canManage = false;

      // Check if they have any approver roles
      if (roleConfig.approverRoleIds && roleConfig.approverRoleIds.length > 0) {
        for (const approverRoleId of roleConfig.approverRoleIds) {
          if (interaction.member.roles.cache.has(approverRoleId)) {
            canManage = true;
            break;
          }
        }
      }

      // Check if they're in the approver members list
      if (!canManage && roleConfig.approverMemberIds && roleConfig.approverMemberIds.length > 0) {
        if (roleConfig.approverMemberIds.includes(interaction.user.id)) {
          canManage = true;
        }
      }

      if (canManage) {
        managedRoles.push({
          label: roleConfig.roleName,
          value: roleConfig.id,
          description: 'Manage members with this role'
        });
      }
    }

    if (managedRoles.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to manage any roles. Only assigned approvers can use this command.')],
        flags: 64,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('manage_role_select')
          .setPlaceholder('Select a role to manage...')
          .addOptions(managedRoles)
      );

    await interaction.reply({
      content: 'Which role would you like to manage?',
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in manage roles command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
