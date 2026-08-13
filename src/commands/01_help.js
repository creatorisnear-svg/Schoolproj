import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all RolePlayManager commands and features');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const premium = await isPremiumGuild(interaction.guildId);
  const premiumNote = premium
    ? '-# Premium is active on this server.'
    : `-# Commands marked **★** require Premium — run \`/premium\` to learn more.`;

  const pTag = premium ? '' : ' ★';

  const helpEmbed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('RolePlayManager — Command Reference')
    .setDescription(
      `Use \`/setup\` to get started or check your server's setup status.\n` +
      `Use \`/config <feature>\` to configure any feature directly.\n\n` +
      premiumNote
    )
    .addFields(
      {
        name: 'Getting Started',
        value:
          '`/setup` — Step-by-step setup guide for your server\n' +
          '`/config general` — Set the log channel (required first)\n' +
          '`/staff add/remove/list` — Manage who can use bot commands\n' +
          '`/config features` — Enable or disable features',
        inline: false,
      },
      {
        name: 'Configuration — one command for everything',
        value:
          '`/config verify` — Verification system\n' +
          '`/config tickets` — Ticket support\n' +
          '`/config economy` — Economy & currency\n' +
          '`/config strikes` — Strike system\n' +
          '`/config welcome` — Welcome messages\n' +
          '`/config antipromo` — Anti-promoting\n' +
          '`/config roles` — Role requests\n' +
          '`/config priority` — Priority tracker\n' +
          '`/config calendar` — RP Calendar\n' +
          '`/config moveme` — Voice mover\n' +
          '`/config roleplay` — RP commands\n' +
          `\`/config appys\` — Applications${pTag}\n` +
          `\`/config dispatch\` — AI Voice Dispatch${pTag}`,
        inline: false,
      },
      {
        name: 'Roleplay — CAD & Databases',
        value:
          '`/civiliandatabase` — Civilian portal: 911, characters, vehicles, fines\n' +
          '`/leodatabase` — LEO portal: plate/name search, BOLOs, tickets, calls\n' +
          '`/firedepartmentdatabase` — Fire department records',
        inline: false,
      },
      {
        name: 'Staff & Moderation',
        value:
          '`/strike @user` — Issue a strike · `/removestrike @user` — Remove a strike\n' +
          '`/blacklist @user` — Blacklist a member · `/removeblacklist` — Remove\n' +
          '`/clear [amount]` — Bulk delete messages\n' +
          '`/embed` — Send a custom embed\n' +
          '`/sticky` · `/stickylist` — Sticky messages\n' +
          '`/reactionrolemessage` — Set up reaction roles',
        inline: false,
      },
      {
        name: 'Priority Tracker',
        value:
          '`/activepriority` — Start a priority event\n' +
          '`/deactivatepriority` — End a priority event\n' +
          '`/prioritycooldown` — Set cooldown duration\n' +
          '`/priorityrequest` — Request a priority',
        inline: true,
      },
      {
        name: 'RP Calendar',
        value:
          '`/setrp` — Schedule an RP event\n' +
          '`/unsetrp` — Remove an event',
        inline: true,
      },
      {
        name: 'Role Requests',
        value:
          '`/rolerequest` — Request a role\n' +
          '`/manageroles` — Approve or deny requests',
        inline: true,
      },
      {
        name: 'Economy — Members',
        value:
          '`/balance` Cash & bank · `/deposit` · `/withdraw`\n' +
          '`/give @user` — Send cash · `/income` — Collect role income\n' +
          '`/work` · `/crime` · `/rob` — Earn money\n' +
          '`/shop` · `/buy` · `/sell` · `/inventory` · `/use`\n' +
          '`/gamble` — Slots, Dice & more · `/leaderboard`',
        inline: false,
      },
      {
        name: 'Utility',
        value:
          '`/invite` — Get the bot invite link\n' +
          '`/activatepremium` — Activate a premium key\n' +
          '`/premium` — View premium status & features\n' +
          '`/reloadconfig` — Reload bot config',
        inline: true,
      },
      {
        name: `AI Dispatch${pTag}`,
        value:
          '`/dispatchannounce` — Send a manual dispatch announcement',
        inline: true,
      },
    )
    .setFooter({ text: 'RPM • /setup to get started • /config <feature> to configure anything' });

  return interaction.editReply({ embeds: [helpEmbed] });
}
