import Staff from '../models/Staff.js';

export async function isStaff(userId) {
  try {
    const staff = await Staff.findOne({ type: 'user', userId });
    return staff !== null;
  } catch (error) {
    console.error('Error checking staff status:', error);
    return false;
  }
}

export async function isAdmin(member) {
  return member.permissions.has('Administrator');
}

export async function checkStaffPermission(interaction) {
  const directStaff = await isStaff(interaction.user.id);
  const adminMember = await isAdmin(interaction.member);
  
  if (directStaff || adminMember) {
    return true;
  }
  
  try {
    const memberRoleIds = interaction.member.roles.cache.map(role => role.id);
    
    const staffRoleCount = await Staff.countDocuments({
      type: 'role',
      roleId: { $in: memberRoleIds }
    });
    
    return staffRoleCount > 0;
  } catch (error) {
    console.error('Error checking staff role permissions:', error);
    return false;
  }
}
