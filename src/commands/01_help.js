import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all RolePlayManager commands and features');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('RolePlayManager — Command Reference')
    .setDescription('All available commands organized by category. Commands marked **Admin/Staff** require elevated permissions.')
    .addFields(
      {
        name: 'Staff Management',
        value: '`/staff add` Add a user or role as staff\n`/staff remove` Remove a staff member\n`/staff list` View all staff members',
        inline: true,
      },
      {
        name: 'Verification',
        value: '`/verifysystemsetup` Configure the verify system\n`/verify` Start the verification process',
        inline: true,
      },
      {
        name: 'Strike System',
        value: '`/strikesystemsetup` Configure strikes\n`/strike` Issue a strike to a member\n`/removestrike` Remove a strike',
        inline: true,
      },
      {
        name: 'Priority Tracker',
        value: '`/prioritytrackersetup` Configure priority tracker\n`/activepriority` Start a priority event\n`/deactivatepriority` End a priority event\n`/prioritycooldown` Set cooldown duration',
        inline: true,
      },
      {
        name: 'Roleplay Systems',
        value: '`/roleplaycommandsetup` Enable RP features\n`/civiliandatabase` Civilian records & 911\n`/leodatabase` LEO records & CAD\n`/firedepartmentdatabase` Fire dept. records',
        inline: true,
      },
      {
        name: 'RP Calendar',
        value: '`/setrp` Schedule an RP event\n`/unsetrp` Remove an RP event\n`/roleplaycalendersetup` Configure calendar',
        inline: true,
      },
      {
        name: 'Tickets & Roles',
        value: '`/ticketsupportsetup` Configure ticket system\n`/rolerequestadd` Add requestable roles\n`/rolerequest` Request a role\n`/manageroles` Approve/deny role requests',
        inline: true,
      },
      {
        name: 'Economy',
        value: '`/economysetup` Configure economy\n`/balance` Check your balance\n`/work` `/crime` `/rob` Earn money\n`/shop` `/buy` `/sell` `/inventory` Store\n`/gamble` Gambling games\n`/leaderboard` Top balances',
        inline: true,
      },
      {
        name: 'Community Tools',
        value: '`/reactionrolemessage` Set up reaction roles\n`/sticky` Pin a sticky message\n`/stickylist` View sticky messages\n`/antipromotingsetup` Block invite links\n`/setlogchannel` Set log channel',
        inline: true,
      },
      {
        name: 'AI Dispatch',
        value: '`/dispatchsetup` Configure AI voice dispatch\n`/dispatchannounce` Send a dispatch announcement',
        inline: true,
      },
      {
        name: 'Utility',
        value: '`/enablecommands` Enable or disable modules\n`/reloadconfig` Reload configuration\n`/clear` Bulk delete messages\n`/embed` Send a custom embed\n`/invite` Get the bot invite link\n`/activatepremium` Activate a premium key',
        inline: true,
      },
      {
        name: 'Welcome System',
        value: '`/welcomesystemsetup` Configure welcome messages',
        inline: true,
      },
    )
    .setFooter({ text: 'RPM — type / to browse all commands' })
    .setTimestamp();

  return interaction.reply({
    embeds: [helpEmbed],
    flags: 64,
  });
}
