import Staff from '../models/Staff.js';

export async function isStaff(userId, guildId) {
  try {
    const staff = await Staff.findOne({ guildId, type: 'user', userId });
    return staff !== null;
  } catch (error) {
    console.error('Error checking staff status:', error);
    return false;
  }
}

export async function isManager(userId, guildId) {
  try {
    const manager = await Staff.findOne({ guildId, type: 'user', userId, position: 'manager' });
    return manager !== null;
  } catch (error) {
    console.error('Error checking manager status:', error);
    return false;
  }
}

export async function isAdmin(member) {
  return member.permissions.has('Administrator');
}

export async function isAdminOrManager(interaction) {
  const adminMember = await isAdmin(interaction.member);
  const isManagerUser = await isManager(interaction.user.id, interaction.guildId);
  
  return adminMember || isManagerUser;
}

export async function checkStaffPermission(interaction) {
  const directStaff = await isStaff(interaction.user.id, interaction.guildId);
  const adminOrManager = await isAdminOrManager(interaction);
  
  if (directStaff || adminOrManager) {
    return true;
  }
  
  try {
    const memberRoleIds = interaction.member.roles.cache.map(role => role.id);
    
    const staffRoleCount = await Staff.countDocuments({
      guildId: interaction.guildId,
      type: 'role',
      roleId: { $in: memberRoleIds }
    });
    
    return staffRoleCount > 0;
  } catch (error) {
    console.error('Error checking staff role permissions:', error);
    return false;
  }
}
