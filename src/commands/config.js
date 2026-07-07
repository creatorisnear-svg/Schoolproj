/**
 * /config — Unified configuration command.
 * Replaces all individual xxxconfig commands.
 * Each subcommand auto-enables its feature (no more "run /enablecommands first" gates).
 */
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { checkStaffPermission, isAdmin } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';
import { getEconomySetupMenu } from '../handlers/economyHandler.js';

// Models
import Config from '../models/Config.js';
import Staff from '../models/Staff.js';
import Verification from '../models/Verification.js';
import TicketConfig from '../models/TicketConfig.js';
import { StrikeConfig } from '../models/Strike.js';
import Welcome from '../models/Welcome.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import AppyConfig from '../models/AppyConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function menuEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'RPM' });
}

/** Upsert a model with enabled:true so we never block with "enable first" errors. */
async function ensureEnabled(Model, guildId) {
  return Model.findOneAndUpdate(
    { guildId },
    { $set: { enabled: true } },
    { upsert: true, new: true }
  );
}

// ─── menu builders (mirrors selectMenuHandler / command files) ─────────────

function verifyMenu() {
  return {
    embeds: [menuEmbed('Verification Setup', 'Configure how members verify and what happens once they do.\nAt minimum set the Verify Channel and Verified Role.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('verify_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Verify Channel', description: 'Required — where members submit verification', value: 'select_verify_channel' },
            { label: 'Verified Role', description: 'Required — role granted on approval', value: 'select_verified_role' },
            { label: 'Unverified Role', description: 'Required — role before verification', value: 'select_unverified_role' },
            { label: 'Verified Channels', description: 'Required — channels unlocked after verify', value: 'select_verified_channels' },
            { label: 'Custom Question', description: 'Optional — question shown to applicants', value: 'set_custom_question' },
            { label: 'Remove Custom Question', description: 'Optional — clear the custom question', value: 'delete_custom_question' },
            { label: 'Toggle Staff Approval', description: 'Optional — require staff to approve', value: 'toggle_approval_required' },
            { label: 'RP Tag', description: 'Optional — tag added to verified nicknames', value: 'set_rp_tag' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'verify_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function ticketsMenu() {
  return {
    embeds: [menuEmbed('Ticket Support Setup', 'Set a panel channel, create ticket types, then send the panel.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketsupport_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Select Panel Channel', description: 'Channel where the ticket panel is posted', value: 'select_channel' },
            { label: 'Add Ticket Type', description: 'Create a new ticket category', value: 'add_type' },
            { label: 'View Ticket Types', description: 'See all configured ticket types', value: 'view_types' },
            { label: 'Send Panel', description: 'Post the ticket panel to the channel', value: 'send_panel' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function strikesMenu() {
  return {
    embeds: [menuEmbed('Strike System Setup', 'Configure strike roles and the action taken at each level (kick, timeout, ban).')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('strike_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Set Strike Level Roles', description: 'Assign a role at each strike level (optional)', value: 'strike_set_roles' },
            { label: 'Set Strike Actions', description: 'Kick / timeout / ban per level', value: 'strike_set_actions' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'strike_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function welcomeMenu() {
  return {
    embeds: [menuEmbed('Welcome System Setup', 'Set a welcome channel, customize the greeting, and optionally DM new members.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('welcome_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Welcome Channel', description: 'Channel where welcome messages are posted', value: 'select_welcome_channel_setup' },
            { label: 'Welcome Message', description: 'Message posted when a member joins', value: 'set_welcome_message_setup' },
            { label: 'Welcome DM', description: 'DM sent directly to the new member', value: 'set_welcome_dm_setup' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'welcome_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function antipromoMenu() {
  return {
    embeds: [menuEmbed('Anti-Promoting Setup', 'Control which Discord invite links are allowed in your server.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('antipromotingsetup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Add Whitelisted Link', description: 'Allow a specific invite link', value: 'add_link' },
            { label: 'Remove Whitelisted Link', description: 'Remove a link from the allowlist', value: 'remove_link' },
            { label: 'View Whitelisted Links', description: 'See all approved links', value: 'view_links' },
            { label: 'Toggle Staff Bypass', description: 'Let staff post any invite link', value: 'toggle_staff_bypass' },
            { label: 'View Settings', description: 'See current configuration', value: 'view_settings' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function movemeMenu(config) {
  const chCount = (config?.allowedChannelIds || []).length;
  const panelStatus = config?.panelChannelId
    ? `Panel channel: <#${config.panelChannelId}>${config.panelMessageId ? ' — panel active' : ' — not sent yet'}`
    : 'No panel channel set';

  return {
    embeds: [menuEmbed('Voice Mover Setup', `${panelStatus}\nAllowed channels: ${chCount > 0 ? `${chCount} configured` : 'all channels (no filter)'}`)],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('movemesetup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Add Allowed Channel', description: 'Restrict the panel to specific voice channels', value: 'add_channel' },
            { label: 'Remove Allowed Channel', description: 'Remove a channel from the allowed list', value: 'remove_channel' },
            { label: 'View Allowed Channels', description: 'See which channels are currently allowed', value: 'view_channels' },
            { label: 'Clear Channel Filter', description: 'Allow all voice channels in the panel', value: 'clear_filter' },
            { label: 'Send Panel', description: 'Post the voice mover panel to a text channel', value: 'send_panel' },
            { label: 'Finish Setup', description: 'Close this setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function rolesMenu() {
  return {
    embeds: [menuEmbed('Role Request Setup', 'Let members request roles via a Discord panel.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rolerequest_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Add Role Request Type', description: 'Create a new requestable role', value: 'add_role' },
            { label: 'Delete Role Request Type', description: 'Remove a requestable role', value: 'delete_role' },
            { label: 'View Role Request Types', description: 'See all configured roles', value: 'view_roles' },
            { label: 'Manage Global Role Links', description: 'Link roles across servers', value: 'global_role_links' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function roleplayMenu() {
  return {
    embeds: [menuEmbed('Roleplay Commands Setup', 'Enable or disable /me, /do, /try, 911 calls, and other roleplay commands.')],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommands_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Toggle 911 / CAD Commands', description: 'Enable or disable emergency calls', value: 'toggle_911' },
            { label: 'Toggle Twitter Commands', description: 'Enable or disable /twitter', value: 'toggle_twitter' },
            { label: 'Toggle Anonymous Commands', description: 'Enable or disable /anon', value: 'toggle_anon' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function dispatchMenuEmbed(warning = '') {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('AI Dispatch Setup')
        .setDescription(`Configure the AI voice dispatch system. Officers speak in monitored voice channels — the bot transcribes, responds, and updates the status board.${warning}`)
        .setFooter({ text: 'RPM' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('dispatch_setup_menu')
          .setPlaceholder('Select an option...')
          .addOptions([
            { label: 'Set Dispatch Channel', description: 'Text channel for dispatch logs', value: 'set_dispatch_channel' },
            { label: 'Set Status Board Channel', description: 'Text channel for live officer status', value: 'set_status_channel' },
            { label: 'Add Patrol Voice Channel', description: 'Voice channel the bot will listen to', value: 'add_patrol_channel' },
            { label: 'Set Traffic Stop Channel', description: 'Voice channel for 10-11 moves', value: 'set_stop_channel' },
            { label: 'Enable / Disable System', description: 'Turn dispatch on or off', value: 'toggle_system' },
            { label: 'Toggle AI Responses', description: 'Enable or disable AI dispatcher replies', value: 'toggle_ai' },
            { label: 'Remove Patrol Channel', description: 'Stop monitoring a channel', value: 'remove_patrol_channel' },
            { label: 'View Settings', description: 'See current configuration', value: 'view_settings' },
            { label: 'Finish Setup', description: 'Close the setup menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function featuresMenu() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Feature Management')
        .setDescription('Enable or disable bot features for your server.')
        .setFooter({ text: 'RPM' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('choice_enable').setLabel('Enable Features').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('choice_disable').setLabel('Disable Features').setStyle(ButtonStyle.Danger)
      ),
    ],
    flags: 64,
  };
}

function generalMenu(config) {
  const logStatus = config?.logChannelId ? `Currently set to <#${config.logChannelId}>` : 'Not set yet';
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('General Settings')
        .setDescription(`Configure core bot settings for your server.\n\n**Log channel** — ${logStatus}`)
        .setFooter({ text: 'RPM' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setlogchannel_select')
          .setPlaceholder('Select log channel...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  };
}

// ─── subcommand handlers ──────────────────────────────────────────────────────

async function handleVerify(interaction) {
  const guildId = interaction.guildId;
  await ensureEnabled(Verification, guildId);
  return interaction.reply(verifyMenu());
}

async function handleTickets(interaction) {
  const guildId = interaction.guildId;
  const access = await checkFeatureAccess(guildId, 'ticket');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Ticket Support')], flags: 64 });
  await ensureEnabled(TicketConfig, guildId);
  return interaction.reply(ticketsMenu());
}

async function handleEconomy(interaction) {
  return interaction.reply(getEconomySetupMenu());
}

async function handleDispatch(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'dispatch');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('AI Voice Dispatch')], flags: 64 });
  const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  const warning = hasApiKey ? '' : '\n\n-# No AI key configured. Set `GROQ_API_KEY` or `OPENAI_API_KEY` to enable transcription.';
  return interaction.reply(dispatchMenuEmbed(warning));
}

async function handleStrikes(interaction) {
  await ensureEnabled(StrikeConfig, interaction.guildId);
  return interaction.reply(strikesMenu());
}

async function handleWelcome(interaction) {
  await ensureEnabled(Welcome, interaction.guildId);
  return interaction.reply(welcomeMenu());
}

async function handleAntipromo(interaction) {
  return interaction.reply(antipromoMenu());
}

async function handleRoles(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'rolerequest');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Role Request')], flags: 64 });
  await ensureEnabled(RoleRequestConfig, interaction.guildId);
  return interaction.reply(rolesMenu());
}

async function handlePriority(interaction) {
  const guildId = interaction.guildId;
  await ensureEnabled(Priority, guildId);
  const config = await Priority.findOne({ guildId });
  const currentChannel = config?.channelId ? `\nCurrently posting to <#${config.channelId}>` : '';
  return interaction.reply({
    embeds: [menuEmbed('Priority Tracker Setup', `Select a text channel to post the priority tracker board.${currentChannel}`)],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('prioritytrackersetup_channel')
          .setPlaceholder('Select priority tracker channel...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  });
}

async function handleCalendar(interaction) {
  const { default: RoleplayCalendar } = await import('../models/RoleplayCalendar.js');
  const config = await RoleplayCalendar.findOne({ guildId: interaction.guildId });
  const currentChannel = config?.channelId ? `\nCurrently posting to <#${config.channelId}>` : '';
  return interaction.reply({
    embeds: [menuEmbed('RP Calendar Setup', `Select a text channel where the roleplay calendar will be posted.${currentChannel}`)],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('roleplaycalendarsetup_channel')
          .setPlaceholder('Select calendar channel...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  });
}

async function handleAppys(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'appys');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Applications')], flags: 64 });
  const config = await AppyConfig.findOne({ guildId: interaction.guildId });
  const reviewCh = config?.reviewChannelId ? `<#${config.reviewChannelId}>` : 'not set';
  const panelCh = config?.panelChannelId ? `<#${config.panelChannelId}>` : 'not set';
  const typeCount = config?.activeTypeIds?.length ?? 0;
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Applications Config')
        .setDescription(
          `**Review channel:** ${reviewCh}\n**Panel channel:** ${panelCh}\n**Active types:** ${typeCount}\n\n` +
          `### Configure via Dashboard\nFull application setup (types, questions, accept roles, panels) is done through the **Dashboard → Applications** page at [roleplaymanager.xyz/dashboard](https://roleplaymanager.xyz/dashboard).\n\n` +
          `-# The dashboard gives you full control over application types, questions, and panels.`
        )
        .setFooter({ text: 'RPM' }),
    ],
    flags: 64,
  });
}

async function handleMoveme(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'moveme');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Voice Mover')], flags: 64 });
  const config = await ensureEnabled(MemberMovementConfig, interaction.guildId);
  return interaction.reply(movemeMenu(config));
}

async function handleRoleplay(interaction) {
  await ensureEnabled(RoleplayCommands, interaction.guildId);
  return interaction.reply(roleplayMenu());
}

async function handleFeatures(interaction) {
  return interaction.reply(featuresMenu());
}

async function handleGeneral(interaction) {
  const staffCount = await Staff.countDocuments({ guildId: interaction.guildId });
  if (staffCount === 0) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Add Staff First')
          .setDescription('You need at least one staff member before setting a log channel.\n\nRun `/staff add @user` to add your first staff member, then come back.')
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  }
  const config = await Config.findOne({ guildId: interaction.guildId });
  return interaction.reply(generalMenu(config));
}

// ─── subcommand dispatch map ──────────────────────────────────────────────────

const subcommandHandlers = {
  verify: handleVerify,
  tickets: handleTickets,
  economy: handleEconomy,
  dispatch: handleDispatch,
  strikes: handleStrikes,
  welcome: handleWelcome,
  antipromo: handleAntipromo,
  roles: handleRoles,
  priority: handlePriority,
  calendar: handleCalendar,
  appys: handleAppys,
  moveme: handleMoveme,
  roleplay: handleRoleplay,
  features: handleFeatures,
  general: handleGeneral,
};

// ─── command definition ───────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure any bot feature (Admin/Staff)')
  .addSubcommand(s => s.setName('general').setDescription('Set the log channel and core bot settings'))
  .addSubcommand(s => s.setName('features').setDescription('Enable or disable bot features'))
  .addSubcommand(s => s.setName('verify').setDescription('Set up the member verification system'))
  .addSubcommand(s => s.setName('tickets').setDescription('Set up the ticket support system'))
  .addSubcommand(s => s.setName('economy').setDescription('Configure the economy and currency system'))
  .addSubcommand(s => s.setName('strikes').setDescription('Configure strike levels and actions'))
  .addSubcommand(s => s.setName('welcome').setDescription('Set up welcome messages for new members'))
  .addSubcommand(s => s.setName('antipromo').setDescription('Block unwanted invite links'))
  .addSubcommand(s => s.setName('roles').setDescription('Configure the role request system'))
  .addSubcommand(s => s.setName('priority').setDescription('Set up the priority tracker'))
  .addSubcommand(s => s.setName('calendar').setDescription('Set up the roleplay calendar'))
  .addSubcommand(s => s.setName('moveme').setDescription('Configure the voice mover panel'))
  .addSubcommand(s => s.setName('roleplay').setDescription('Toggle /me, /do, /try and other RP commands'))
  .addSubcommand(s => s.setName('appys').setDescription('Configure the applications system (Premium)'))
  .addSubcommand(s => s.setName('dispatch').setDescription('Configure the AI voice dispatch system (Premium)'));

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('This command is restricted to staff and administrators.')],
      flags: 64,
    });
  }

  const sub = interaction.options.getSubcommand();
  const handler = subcommandHandlers[sub];

  if (!handler) {
    return interaction.reply({ embeds: [errorEmbed('Unknown subcommand.')], flags: 64 });
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[/config ${sub}]`, err);
    // If already replied, send a followUp; otherwise reply
    const respond = interaction.replied || interaction.deferred
      ? (opts) => interaction.followUp(opts)
      : (opts) => interaction.reply(opts);
    return respond({ embeds: [errorEmbed('Something went wrong. Please try again.')], flags: 64 });
  }
}
