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
  .setDescription('View your server setup status and configure every feature from one place (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('This command is restricted to staff and administrators.')],
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

  const ok = (cond) => cond ? '`✓`' : '`✗`';

  const hasStaff = staffCount > 0;
  const hasLog = !!config?.logChannelId;

  const lines = [
    `### Foundation`,
    `${ok(hasStaff)} **Staff** — ${hasStaff ? `${staffCount} member${staffCount !== 1 ? 's' : ''} added` : 'none yet — run \`/staff add @user\`'}`,
    `${ok(hasLog)} **Log channel** — ${hasLog ? `<#${config.logChannelId}>` : 'not set — use \`/config general\`'}`,
    ``,
    `### Features`,
    `${ok(verification?.enabled)} **Verification** — ${verification?.enabled ? 'enabled' : 'off'} — \`/config verify\``,
    `${ok(ticketConfig?.enabled)} **Tickets** — ${ticketConfig?.enabled ? 'enabled' : 'off'} — \`/config tickets\``,
    `${ok(strikeConfig?.enabled)} **Strike system** — ${strikeConfig?.enabled ? 'enabled' : 'off'} — \`/config strikes\``,
    `${ok(welcome?.enabled)} **Welcome messages** — ${welcome?.enabled ? 'enabled' : 'off'} — \`/config welcome\``,
    `${ok(economyConfig?.enabled)} **Economy** — ${economyConfig?.enabled ? 'enabled' : 'off'} — \`/config economy\``,
    `${ok(roleplayCommands?.enabled)} **Roleplay commands** — ${roleplayCommands?.enabled ? 'enabled' : 'off'} — \`/config roleplay\``,
    `${ok(priority?.enabled)} **Priority tracker** — ${priority?.enabled ? 'enabled' : 'off'} — \`/config priority\``,
    `${ok(moveme?.enabled)} **Voice mover** — ${moveme?.enabled ? 'enabled' : 'off'} — \`/config moveme\``,
    `${ok(roleRequestConfig?.enabled)} **Role requests** — ${roleRequestConfig?.enabled ? 'enabled' : 'off'} — \`/config roles\``,
    `${ok(dispatchConfig?.enabled)} **AI Dispatch** — ${dispatchConfig?.enabled ? 'enabled' : 'off'} — \`/config dispatch\``,
    `${ok(appyConfig?.enabled)} **Applications** — ${appyConfig?.enabled ? 'enabled' : 'off'} — \`/config appys\``,
    ``,
    `-# Run \`/config <feature>\` to jump straight into any feature's settings.`,
  ];

  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Server Setup')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'RPM' });

  const configRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_config_select')
      .setPlaceholder('Jump to a feature...')
      .addOptions([
        { label: 'General Settings', description: 'Log channel and core config', value: 'general' },
        { label: 'Verification', description: 'Member verification setup', value: 'verify' },
        { label: 'Tickets', description: 'Ticket support system', value: 'tickets' },
        { label: 'Economy', description: 'Economy and currency settings', value: 'economy' },
        { label: 'Strike System', description: 'Strike levels and actions', value: 'strikes' },
        { label: 'Welcome Messages', description: 'New member welcome flow', value: 'welcome' },
        { label: 'Anti-Promoting', description: 'Block unwanted invite links', value: 'antipromo' },
        { label: 'Role Requests', description: 'Let members request roles', value: 'roles' },
        { label: 'Priority Tracker', description: 'Active priority management', value: 'priority' },
        { label: 'RP Calendar', description: 'Schedule roleplay sessions', value: 'calendar' },
        { label: 'Voice Mover', description: 'Self-move between voice channels', value: 'moveme' },
        { label: 'Roleplay Commands', description: '/me, /do, /try and 911', value: 'roleplay' },
        { label: 'Applications', description: 'Staff application panels', value: 'appys' },
        { label: 'AI Voice Dispatch', description: 'AI-powered voice dispatch (Premium)', value: 'dispatch' },
        { label: 'Enable / Disable Features', description: 'Toggle features on or off', value: 'features' },
      ])
  );

  return interaction.editReply({ embeds: [embed], components: [configRow] });
  } catch (err) {
    console.error('[/setup]', err);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle('Error')
          .setDescription('Something went wrong loading the setup status. Please try again.')
          .setFooter({ text: 'RPM' }),
      ],
    });
  }
}
