import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all EverLink commands and features');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('EverLink - Command Help')
    .setDescription('Complete guide to all available commands')
    .addFields(
      {
        name: 'Staff Management',
        value: '/addstaff - Add a staff member\n/removestaff - Remove a staff member\n/stafflist - View all staff',
        inline: false,
      },
      {
        name: 'Verification System',
        value: '/verifysystemsetup - Configure member verification\n/verify - Members verify themselves',
        inline: false,
      },
      {
        name: 'Strike System',
        value: '/strikesystemsetup - Configure strike system\n/strike - Give a member a strike\n/removestrike - Remove a strike',
        inline: false,
      },
      {
        name: 'Priority Tracker',
        value: '/prioritytrackersetup - Configure priority system\n/activepriority - Activate an event\n/deactivatepriority - Deactivate event\n/prioritycooldown - Set cooldown',
        inline: false,
      },
      {
        name: 'Roleplay Systems',
        value: '/roleplaycommandsetup - Enable RP features\n/civiliandatabase - Civilian database\n/leodatabase - Police database\n/firedepartmentdatabase - Fire department database',
        inline: false,
      },
      {
        name: 'Roleplay Events',
        value: '/setrp - Create RP event\n/unsetrp - Delete RP event\n/roleplaycalendersetup - Configure calendar',
        inline: false,
      },
      {
        name: 'Ticket & Role Request',
        value: '/ticketsupportsetup - Configure tickets\n/rolerequestadd - Add requestable roles\n/rolerequest - Request a role\n/manageroles - Approve/deny requests',
        inline: false,
      },
      {
        name: 'Community Tools',
        value: '/reactionrolemessage - Reaction roles\n/sticky - Sticky message\n/stickylist - View stickies\n/antipromotingsetup - Block invites\n/setlogchannel - Logging channel',
        inline: false,
      },
      {
        name: 'Utility Commands',
        value: '/enablecommands - Enable/disable features\n/reloadconfig - Reload config\n/clear - Delete messages\n/embed - Send embed\n/help - Show this help',
        inline: false,
      }
    )
    .setFooter({ text: 'EverLink | Type / to see command options' })
    .setTimestamp();

  return interaction.reply({
    embeds: [helpEmbed],
    flags: 64,
  });
}
