import { SlashCommandBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { infoEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('stafflist')
  .setDescription('View all current bot staff members');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const staffMembers = await Staff.find({ guildId: interaction.guildId });

    if (staffMembers.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('__**Staff List**__', 'No staff members have been added yet for this server.')],
      });
    }

    const staffList = staffMembers.map((staff, index) => {
      const type = staff.type === 'role' ? 'Role' : 'User';
      const name = staff.type === 'role' ? staff.roleName : staff.username;
      const addedDate = new Date(staff.addedAt).toLocaleDateString();
      return `${index + 1}. **${type}:** ${name} *(Added: ${addedDate})*`;
    }).join('\n');

    const embed = infoEmbed('__**EverLink Bot Staff List**__', staffList);
    embed.addFields({ name: 'Total Staff', value: `${staffMembers.length}`, inline: true });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error('Error fetching staff list:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while fetching the staff list. Please try again.')],
      ephemeral: true,
    });
  }
}
