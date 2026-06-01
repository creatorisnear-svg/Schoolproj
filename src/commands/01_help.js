import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all RolePlayManager commands and features');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const premium = await isPremiumGuild(interaction.guildId);
  const pTag = premium ? '' : ' ★';

  const helpEmbed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('RolePlayManager - Command Reference')
    .setDescription(
      'All available commands organized by category. Commands marked **Admin/Staff** require elevated permissions.\n' +
      (premium ? '-# Premium is active on this server.' : `-# **★ = Premium feature** - use \`/premium\` to learn more.`)
    )
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
        value: `\`/ticketsupportsetup\` Configure ticket system${pTag}\n\`/rolerequestadd\` Add requestable roles\n\`/rolerequest\` Request a role\n\`/manageroles\` Approve/deny role requests`,
        inline: true,
      },
      {
        name: 'Economy - Setup',
        value: `\`/economysetup\` Configure all economy settings\n-# Includes: currency, work, crime, rob, gambling, chat money, income tax, role income, store management, civilian jobs panel`,
        inline: false,
      },
      {
        name: 'Economy - Members',
        value: `\`/balance\` Cash & bank balance\n\`/deposit\` \`/withdraw\` Move between cash/bank\n\`/give\` Send cash to another member\n\`/work\` \`/crime\` \`/rob\` Earn money\n\`/income\` Collect role-based income\n\`/shop\` \`/buy\` \`/sell\` \`/inventory\` Store\n\`/use\` Use an item  \`/giveitems\` Give items\n\`/gamble\` Blackjack, Roulette, Slots & more\n\`/leaderboard\` Server balance rankings`,
        inline: false,
      },
      {
        name: 'Civilian Jobs',
        value: '`/economysetup` → **Civilian Jobs** — set a channel, add/remove jobs, post the panel\n-# Members select a job from the panel to receive a temporary role',
        inline: true,
      },
      {
        name: 'Voice Mover',
        value: '`/enablecommands` → **Member Movement** to enable\n`/movemesetup` to post the panel in a channel\n-# Members pick any voice channel from the dropdown to be moved',
        inline: true,
      },
      {
        name: 'Community Tools',
        value: `\`/reactionrolemessage\` Set up reaction roles\n\`/sticky\` Pin a sticky message\n\`/stickylist\` View sticky messages\n\`/antipromotingsetup\` Block invite links\n\`/setlogchannel\` Set log channel`,
        inline: true,
      },
      {
        name: `AI Dispatch${pTag}`,
        value: '`/dispatchsetup` Configure AI voice dispatch\n`/dispatchannounce` Send a dispatch announcement',
        inline: true,
      },
      {
        name: 'Utility',
        value: '`/enablecommands` Enable or disable modules\n`/reloadconfig` Reload configuration\n`/clear` Bulk delete messages\n`/embed` Send a custom embed\n`/invite` Get the bot invite link\n`/activatepremium` Activate a premium key\n`/premium` View premium features',
        inline: true,
      },
      {
        name: 'Welcome System',
        value: '`/welcomesystemsetup` Configure welcome messages',
        inline: true,
      },
    )
    .setFooter({ text: 'RPM - type / to browse all commands' })
    .setTimestamp();

  return interaction.editReply({ embeds: [helpEmbed] });
}
