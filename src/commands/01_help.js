import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all EverLink commands and features');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('EverLink — Command Reference')
    .setDescription('A complete list of all available commands, organized by category.')
    .addFields(
      {
        name: 'Staff Management',
        value: '`/addstaff` Add a staff member\n`/removestaff` Remove a staff member\n`/stafflist` View all staff',
        inline: true,
      },
      {
        name: 'Verification',
        value: '`/verifysystemsetup` Configure verification\n`/verify` Verify as a member',
        inline: true,
      },
      {
        name: 'Strike System',
        value: '`/strikesystemsetup` Configure strikes\n`/strike` Issue a strike\n`/removestrike` Remove a strike',
        inline: true,
      },
      {
        name: 'Priority Tracker',
        value: '`/prioritytrackersetup` Configure priorities\n`/activepriority` Activate an event\n`/deactivatepriority` Deactivate event\n`/prioritycooldown` Set cooldown',
        inline: true,
      },
      {
        name: 'Roleplay Systems',
        value: '`/roleplaycommandsetup` Enable RP features\n`/civiliandatabase` Civilian records\n`/leodatabase` LEO records\n`/firedepartmentdatabase` FD records',
        inline: true,
      },
      {
        name: 'Roleplay Events',
        value: '`/setrp` Create an RP event\n`/unsetrp` Delete an RP event\n`/roleplaycalendersetup` Calendar setup',
        inline: true,
      },
      {
        name: 'Tickets & Roles',
        value: '`/ticketsupportsetup` Configure tickets\n`/rolerequestadd` Add requestable roles\n`/rolerequest` Request a role\n`/manageroles` Manage role requests',
        inline: true,
      },
      {
        name: 'Community Tools',
        value: '`/reactionrolemessage` Reaction roles\n`/sticky` Sticky message\n`/stickylist` View stickies\n`/antipromotingsetup` Block invites\n`/setlogchannel` Set log channel',
        inline: true,
      },
      {
        name: 'Utility',
        value: '`/enablecommands` Enable or disable features\n`/reloadconfig` Reload configuration\n`/clear` Delete messages\n`/embed` Send a custom embed',
        inline: true,
      }
    )
    .setFooter({ text: 'EverLink — type / to browse commands' })
    .setTimestamp();

  return interaction.reply({
    embeds: [helpEmbed],
    flags: 64,
  });
}
