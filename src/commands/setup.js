import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import Staff from '../models/Staff.js';
import Config from '../models/Config.js';
import Verification from '../models/Verification.js';
import TicketConfig from '../models/TicketConfig.js';
import { StrikeConfig } from '../models/Strike.js';
import Welcome from '../models/Welcome.js';
import EconomyConfig from '../models/EconomyConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import AppyConfig from '../models/AppyConfig.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Step-by-step setup guide — start here if you just added the bot (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('Only staff and administrators can run this command.')],
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId;

  try {
    const [
      staffCount,
      config,
      verification,
      ticketConfig,
      strikeConfig,
      welcome,
      economyConfig,
      dispatchConfig,
      roleplayCommands,
      priority,
      moveme,
      appyConfig,
      roleRequestConfig,
    ] = await Promise.all([
      Staff.countDocuments({ guildId }),
      Config.findOne({ guildId }),
      Verification.findOne({ guildId }),
      TicketConfig.findOne({ guildId }),
      StrikeConfig.findOne({ guildId }),
      Welcome.findOne({ guildId }),
      EconomyConfig.findOne({ guildId }),
      DispatchConfig.findOne({ guildId }),
      RoleplayCommands.findOne({ guildId }),
      Priority.findOne({ guildId }),
      MemberMovementConfig.findOne({ guildId }),
      AppyConfig.findOne({ guildId }),
      RoleRequestConfig.findOne({ guildId }),
    ]);

    const hasStaff = staffCount > 0;
    const hasLog = !!config?.logChannelId;
    const foundationDone = hasStaff && hasLog;

    // ── Determine what to highlight as "next step" ──────────────────────────
    let nextStepTitle = null;
    let nextStepText = null;
    let color = '#2d2d2d';

    if (!hasStaff) {
      color = '#ed4245';
      nextStepTitle = 'Step 1 — Add a staff member first';
      nextStepText =
        'The bot needs at least one staff member before anything else will work.\n\n' +
        '**Right now:** Run `/staff add @YourName` — add yourself or your server admin.\n' +
        'Then come back and run `/setup` again.';
    } else if (!hasLog) {
      color = '#fee75c';
      nextStepTitle = 'Step 2 — Set a log channel';
      nextStepText =
        'The bot needs a private channel to log everything that happens (kicks, verifications, tickets, etc.).\n\n' +
        '**Right now:** Select **General Settings** from the menu below — then pick a channel.\n' +
        'Use a channel only staff can see, like `#bot-logs`.';
    } else {
      // Foundation done — guide towards features
      const featuresOn = [
        verification?.enabled, ticketConfig?.enabled, strikeConfig?.enabled,
        welcome?.enabled, economyConfig?.enabled, roleplayCommands?.enabled,
        priority?.enabled, moveme?.enabled, appyConfig?.enabled,
        roleRequestConfig?.enabled, dispatchConfig?.enabled,
      ].filter(Boolean).length;

      if (featuresOn === 0) {
        color = '#5865f2';
        nextStepTitle = 'Step 3 — Turn on your first feature';
        nextStepText =
          'Your foundation is all set. Now pick which features you want to use.\n\n' +
          '**Right now:** Pick something from the menu below. Start simple — **Verification** or **Welcome Messages** are good first picks.';
      }
    }

    // ── Foundation section ───────────────────────────────────────────────────
    const check = (v) => v ? '`✓`' : '`✗`';
    const foundationLines = [
      `${check(hasStaff)} **Staff added** — ${hasStaff ? `${staffCount} member${staffCount !== 1 ? 's' : ''}` : 'none — run \`/staff add @you\` first'}`,
      `${check(hasLog)} **Log channel** — ${hasLog ? `<#${config.logChannelId}>` : foundationDone || hasStaff ? 'not set — pick "General Settings" below' : 'locked until staff is added'}`,
    ];

    // ── Features section ─────────────────────────────────────────────────────
    const featureLines = foundationDone ? [
      `${check(verification?.enabled)} **Verification** — ${verification?.enabled ? 'on' : 'off'} — members fill out a form to join`,
      `${check(ticketConfig?.enabled)} **Tickets** — ${ticketConfig?.enabled ? 'on' : 'off'} — members can open support tickets`,
      `${check(strikeConfig?.enabled)} **Strikes** — ${strikeConfig?.enabled ? 'on' : 'off'} — warn and punish rule breakers`,
      `${check(welcome?.enabled)} **Welcome messages** — ${welcome?.enabled ? 'on' : 'off'} — greet new members automatically`,
      `${check(economyConfig?.enabled)} **Economy** — ${economyConfig?.enabled ? 'on' : 'off'} — currency, jobs, shops`,
      `${check(roleplayCommands?.enabled)} **Roleplay commands** — ${roleplayCommands?.enabled ? 'on' : 'off'} — /me, /do, 911 calls`,
      `${check(priority?.enabled)} **Priority tracker** — ${priority?.enabled ? 'on' : 'off'} — track active priority events`,
      `${check(moveme?.enabled)} **Voice mover** — ${moveme?.enabled ? 'on' : 'off'} — let members move between voice channels`,
      `${check(roleRequestConfig?.enabled)} **Role requests** — ${roleRequestConfig?.enabled ? 'on' : 'off'} — members can request roles`,
      `${check(dispatchConfig?.enabled)} **AI Dispatch** — ${dispatchConfig?.enabled ? 'on' : 'off'} — AI-powered voice dispatch (Premium)`,
      `${check(appyConfig?.enabled)} **Applications** — ${appyConfig?.enabled ? 'on' : 'off'} — staff application panels (Premium)`,
    ] : [
      '-# Complete the foundation steps above to unlock features.',
    ];

    // ── Build embed ──────────────────────────────────────────────────────────
    const descParts = [];

    if (nextStepTitle) {
      descParts.push(`### ${nextStepTitle}\n${nextStepText}`);
      descParts.push('─────────────────────────────');
    }

    descParts.push('### Foundation\n' + foundationLines.join('\n'));
    descParts.push('### Features\n' + featureLines.join('\n'));

    if (foundationDone) {
      descParts.push('-# Pick any feature from the menu below to configure it. You can come back to this anytime with \`/setup\`.');
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('Server Setup')
      .setDescription(descParts.join('\n\n'))
      .setFooter({ text: 'RPM — run /setup anytime to check your status' });

    // ── Select menu ──────────────────────────────────────────────────────────
    const menuOptions = [
      { label: 'General Settings', description: 'Set the log channel (do this first)', value: 'general' },
      { label: 'Verification', description: 'Members fill out a form to join your server', value: 'verify' },
      { label: 'Tickets', description: 'Members open support tickets via a button', value: 'tickets' },
      { label: 'Strikes', description: 'Warn rule-breakers — auto kick/ban/timeout', value: 'strikes' },
      { label: 'Welcome Messages', description: 'Say hello when a new member joins', value: 'welcome' },
      { label: 'Economy', description: 'Give members currency, jobs, and a shop', value: 'economy' },
      { label: 'Roleplay Commands', description: '/me, /do, /try, 911 calls and CAD', value: 'roleplay' },
      { label: 'Priority Tracker', description: 'Track active priority events in a channel', value: 'priority' },
      { label: 'Voice Mover', description: 'Panel for members to move between voice channels', value: 'moveme' },
      { label: 'Role Requests', description: 'Let members apply for specific roles', value: 'roles' },
      { label: 'RP Calendar', description: 'Schedule and display roleplay sessions', value: 'calendar' },
      { label: 'Anti-Promoting', description: 'Auto-delete invite links from other servers', value: 'antipromo' },
      { label: 'Applications (Premium)', description: 'Staff application panels with questions', value: 'appys' },
      { label: 'AI Voice Dispatch (Premium)', description: 'AI listens to patrol channels and dispatches', value: 'dispatch' },
      { label: 'Enable / Disable Features', description: 'Toggle features on or off', value: 'features' },
    ];

    const configRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup_config_select')
        .setPlaceholder(foundationDone ? 'Pick a feature to set up...' : 'Pick a step to complete...')
        .addOptions(menuOptions)
    );

    const rows = [configRow];

    // If foundation isn't done yet, show a quick-action button for the first blocker
    if (!hasStaff) {
      const staffRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('How to add staff')
          .setStyle(ButtonStyle.Link)
          .setURL('https://roleplaymanager.xyz/dashboard')
      );
      rows.push(staffRow);
    }

    return interaction.editReply({ embeds: [embed], components: rows });

  } catch (err) {
    console.error('[/setup]', err);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle('Something went wrong')
          .setDescription('Could not load your setup status. Please try again in a moment.')
          .setFooter({ text: 'RPM' }),
      ],
    });
  }
}
