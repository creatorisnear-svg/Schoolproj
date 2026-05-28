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

    const isStaff = await checkStaffPermission(interaction);
    const managedRoles = [];

    for (const roleConfig of config.roles) {
      let canManage = isStaff;

      if (!canManage && roleConfig.approverRoleIds?.length > 0) {
        for (const approverRoleId of roleConfig.approverRoleIds) {
          if (interaction.member.roles.cache.has(approverRoleId)) {
            canManage = true;
            break;
          }
        }
      }

      if (!canManage && roleConfig.approverMemberIds?.includes(interaction.user.id)) {
        canManage = true;
      }

      if (canManage) {
        managedRoles.push({
          label: roleConfig.roleName,
          value: roleConfig.id,
          description: 'View members and remove this role'
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
          .setCustomId('manage_rolereq_type_select')
          .setPlaceholder('Select a role to manage...')
          .addOptions(managedRoles)
      );

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Manage Roles')
      .setDescription('Select a role type below to view current holders and remove the role from a member.')
      .setFooter({ text: 'RPM' });

    await interaction.reply({
      embeds: [embed],
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
