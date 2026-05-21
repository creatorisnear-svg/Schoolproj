import Staff from '../models/Staff.js';

export async function isStaff(userId, guildId, memberRoleIds = []) {
  try {
    const userStaff = await Staff.findOne({ guildId, type: 'user', userId });
    if (userStaff) return true;
    if (memberRoleIds.length > 0) {
      const roleStaff = await Staff.countDocuments({
        guildId,
        type: 'role',
        roleId: { $in: memberRoleIds },
      });
      if (roleStaff > 0) return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking staff status:', error);
    return false;
  }
}

export async function isAdmin(member) {
  return member.permissions.has('Administrator');
}

export async function isAdminOrManager(interaction) {
  return interaction.member.permissions.has('Administrator') ||
    interaction.member.permissions.has('ManageGuild');
}

export async function checkStaffPermission(interaction) {
  const adminCheck = await isAdmin(interaction.member);
  if (adminCheck) return true;

  const directStaff = await isStaff(interaction.user.id, interaction.guildId);
  if (directStaff) return true;

  try {
    const memberRoleIds = interaction.member.roles.cache.map(role => role.id);
    const staffRoleCount = await Staff.countDocuments({
      guildId: interaction.guildId,
      type: 'role',
      roleId: { $in: memberRoleIds },
    });
    return staffRoleCount > 0;
  } catch (error) {
    console.error('Error checking staff role permissions:', error);
    return false;
  }
}
