import Staff from '../models/Staff.js';

export async function isStaff(userId) {
  try {
    const staff = await Staff.findOne({ userId });
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
  const staffMember = await isStaff(interaction.user.id);
  const adminMember = await isAdmin(interaction.member);
  return staffMember || adminMember;
}
