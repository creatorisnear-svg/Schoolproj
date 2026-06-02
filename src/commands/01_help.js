import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all RolePlayManager commands and features');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const premium = await isPremiumGuild(interaction.guildId);
  const pTag = premium ? '' : ' ★';

  const premiumNote = premium
    ? '-# Premium is active on this server.'
    : `-# Commands marked **★** require Premium — run \`/premium\` to learn more.`;

  const helpEmbed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('RolePlayManager — Command Reference')
    .setDescription(`All commands organized by category. Most setup commands require Administrator permissions.\n\n${premiumNote}`)
    .addFields(
      {
        name: 'Roleplay Systems',
        value:
          '`/roleplaycommandsetup` Initial RP setup\n' +
          '`/civiliandatabase` Civilian portal — 911, characters, vehicles, fines\n' +
          '`/leodatabase` LEO portal — plate/name search, BOLOs, tickets, calls\n' +
          '`/firedepartmentdatabase` Fire department records',
        inline: false,
      },
      {
        name: 'Staff & Moderation',
        value:
          '`/staff add` · `remove` · `list`\n' +
          '`/strike` Issue a strike  ·  `/removestrike` Remove a strike\n' +
          '`/strikesystemsetup` Configure strike levels and actions\n' +
          '`/clear` Bulk delete messages',
        inline: true,
      },
      {
        name: 'Verification',
        value:
          '`/verifysystemsetup` Configure the verify system\n' +
          '`/verify` Begin the verification process',
        inline: true,
      },
      {
        name: 'Priority Tracker',
        value:
          '`/prioritytrackersetup` Configure tracker\n' +
          '`/activepriority` Start a priority event\n' +
          '`/deactivatepriority` End a priority event\n' +
          '`/prioritycooldown` Set cooldown duration',
        inline: true,
      },
      {
        name: 'Economy — Setup',
        value:
          '`/economysetup` Configure all economy settings\n' +
          '-# Currency symbol, work/crime/rob, gambling, chat money, income tax, role income, store, civilian jobs',
        inline: false,
      },
      {
        name: 'Economy — Members',
        value:
          '`/balance` Cash & bank  ·  `/deposit` · `/withdraw`\n' +
          '`/give` Send cash  ·  `/income` Collect role income\n' +
          '`/work` · `/crime` · `/rob` Earn money\n' +
          '`/shop` · `/buy` · `/sell` · `/inventory` · `/use`\n' +
          '`/gamble` Slots, Dice & more  ·  `/leaderboard`',
        inline: true,
      },
      {
        name: 'Tickets & Roles',
        value:
          `\`/ticketsupportsetup\` Configure tickets${pTag}\n` +
          '`/rolerequestadd` Add requestable roles\n' +
          '`/rolerequest` Request a role\n' +
          '`/manageroles` Approve or deny requests',
        inline: true,
      },
      {
        name: 'RP Calendar',
        value:
          '`/roleplaycalendersetup` Configure calendar\n' +
          '`/setrp` Schedule an event\n' +
          '`/unsetrp` Remove an event',
        inline: true,
      },
      {
        name: 'Community',
        value:
          '`/reactionrolemessage` Reaction roles\n' +
          '`/sticky` · `/stickylist` Sticky messages\n' +
          '`/antipromotingsetup` Block invite links\n' +
          '`/welcomesystemsetup` Welcome messages\n' +
          '`/setlogchannel` Set log channel',
        inline: true,
      },
      {
        name: 'Voice Mover',
        value:
          '`/enablecommands` → Member Movement to enable\n' +
          '`/movemesetup` Post the channel-picker panel\n' +
          '-# Members select a voice channel from the dropdown to be moved',
        inline: true,
      },
      {
        name: `AI Dispatch${pTag}`,
        value:
          '`/dispatchsetup` Configure AI voice dispatch\n' +
          '`/dispatchannounce` Send a manual dispatch',
        inline: true,
      },
      {
        name: 'Utility',
        value:
          '`/enablecommands` Enable or disable modules\n' +
          '`/embed` Send a custom embed\n' +
          '`/invite` Get the bot invite link\n' +
          '`/activatepremium` Activate a premium key\n' +
          '`/premium` View premium status & features',
        inline: true,
      },
    )
    .setFooter({ text: 'RPM  •  Type / in any channel to browse commands' })
    .setTimestamp();

  return interaction.editReply({ embeds: [helpEmbed] });
}
