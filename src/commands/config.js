/**
 * /config — Unified configuration command.
 * Replaces all individual xxxconfig commands.
 * Each subcommand auto-enables its feature — no "run /enablecommands first" gates.
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

/** Auto-enable a feature so admins never see a "you need to enable it first" error. */
async function ensureEnabled(Model, guildId) {
  return Model.findOneAndUpdate(
    { guildId },
    { $set: { enabled: true } },
    { upsert: true, new: true }
  );
}

// ─── menu builders ────────────────────────────────────────────────────────────

function verifyMenu() {
  return {
    embeds: [menuEmbed(
      'Verification Setup',
      '**What this does:** Members click a button and fill out a short form. You (or the bot) approves them and they get access to your server.\n\n' +
      '**Set these up in order:**\n' +
      '`1.` Verify Channel — the channel where members click the button to start\n' +
      '`2.` Verified Role — the role members get once approved (e.g. "Member")\n' +
      '`3.` Unverified Role — the role members have before they verify (e.g. "Unverified")\n' +
      '`4.` Verified Channels — categories or channels members can see after verification\n\n' +
      '-# The rest (custom question, RP tag, staff approval) are optional extras.'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('verify_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: '1. Verify Channel', description: 'The channel where members go to apply', value: 'select_verify_channel' },
            { label: '2. Verified Role', description: 'Role given to members when approved', value: 'select_verified_role' },
            { label: '3. Unverified Role', description: 'Role members have before they verify', value: 'select_unverified_role' },
            { label: '4. Verified Channels', description: 'Channels members can see after verifying', value: 'select_verified_channels' },
            { label: 'Custom Question (Optional)', description: 'Ask members one extra question', value: 'set_custom_question' },
            { label: 'Remove Custom Question (Optional)', description: 'Delete the extra question', value: 'delete_custom_question' },
            { label: 'Toggle Staff Approval (Optional)', description: 'Require staff to manually approve each member', value: 'toggle_approval_required' },
            { label: 'RP Tag (Optional)', description: 'A tag added to verified members nicknames', value: 'set_rp_tag' },
            { label: 'Done', description: 'Close this menu', value: 'verify_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function ticketsMenu() {
  return {
    embeds: [menuEmbed(
      'Ticket Setup',
      '**What this does:** Members click a button to open a private support channel with staff. Great for reports, appeals, and questions.\n\n' +
      '**Set these up in order:**\n' +
      '`1.` Select Panel Channel — the channel where the "Open a ticket" button lives\n' +
      '`2.` Add Ticket Type — create one or more categories (e.g. "Report a Player", "Staff Application")\n' +
      '`3.` Send Panel — posts the button panel to the channel you chose\n\n' +
      '-# You can add up to 5 ticket types for free, unlimited with Premium.'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticketsupport_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: '1. Select Panel Channel', description: 'Where the Open a Ticket button will be posted', value: 'select_channel' },
            { label: '2. Add Ticket Type', description: 'Create a category like Report a Player', value: 'add_type' },
            { label: 'View Ticket Types', description: 'See all your ticket categories', value: 'view_types' },
            { label: '3. Send Panel', description: 'Post the ticket button to your channel', value: 'send_panel' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function strikesMenu() {
  return {
    embeds: [menuEmbed(
      'Strike System Setup',
      '**What this does:** Staff can issue strikes to members who break rules. At each strike level (1, 2, 3, 4) the bot can automatically timeout, kick, or ban them.\n\n' +
      '**Both options are optional — you can use strikes without automatic punishments.**\n\n' +
      '`1.` Set Strike Level Roles — give members a visible role at each strike count (e.g. "1 Strike" role)\n' +
      '`2.` Set Strike Actions — what happens automatically at each level (timeout / kick / ban)'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('strike_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: 'Set Strike Level Roles (Optional)', description: 'Give a role at each strike count', value: 'strike_set_roles' },
            { label: 'Set Strike Actions (Optional)', description: 'Auto timeout / kick / ban at each level', value: 'strike_set_actions' },
            { label: 'Done', description: 'Close this menu', value: 'strike_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function welcomeMenu() {
  return {
    embeds: [menuEmbed(
      'Welcome System Setup',
      '**What this does:** When a new member joins your server, the bot automatically sends a greeting message in a channel and/or a DM to the member.\n\n' +
      '**Set these up (all optional, use what you need):**\n' +
      '`1.` Welcome Channel — the channel where the welcome message is posted\n' +
      '`2.` Welcome Message — what the message says (you can mention the user with `{user}`)\n' +
      '`3.` Welcome DM — a private message sent directly to the new member'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('welcome_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: '1. Welcome Channel', description: 'Channel where the greeting is posted', value: 'select_welcome_channel_setup' },
            { label: '2. Welcome Message', description: 'What the greeting message says', value: 'set_welcome_message_setup' },
            { label: '3. Welcome DM (Optional)', description: 'A private message to new members', value: 'set_welcome_dm_setup' },
            { label: 'Done', description: 'Close this menu', value: 'welcome_setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function antipromoMenu() {
  return {
    embeds: [menuEmbed(
      'Anti-Promoting Setup',
      '**What this does:** Automatically deletes Discord invite links that members post in your server. You can whitelist specific links (like your own server\'s invite) so they are never deleted.\n\n' +
      '**Works automatically once enabled — no required setup.** Use the options below to fine-tune it.\n\n' +
      '`1.` Add Whitelisted Link — allow a specific invite link to stay (e.g. your own server)\n' +
      '`2.` Toggle Staff Bypass — choose if staff can post any invite without it being deleted'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('antipromotingsetup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: 'Add Whitelisted Link', description: 'Allow a specific invite link to stay', value: 'add_link' },
            { label: 'Remove Whitelisted Link', description: 'Remove a link from the allowlist', value: 'remove_link' },
            { label: 'View Whitelisted Links', description: 'See all links that are allowed', value: 'view_links' },
            { label: 'Toggle Staff Bypass', description: 'Let staff post any invite without deletion', value: 'toggle_staff_bypass' },
            { label: 'View Settings', description: 'See current configuration', value: 'view_settings' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function movemeMenu(config) {
  const chCount = (config?.allowedChannelIds || []).length;
  const panelStatus = config?.panelChannelId
    ? `Panel is in <#${config.panelChannelId}>${config.panelMessageId ? '' : ' — not sent yet'}`
    : 'Panel not sent yet';

  return {
    embeds: [menuEmbed(
      'Voice Mover Setup',
      `**What this does:** Posts a panel with a dropdown in a text channel. Members select a voice channel from the list and the bot moves them into it — no need for staff to do it manually.\n\n` +
      `**Current status:** ${panelStatus} · Allowed channels: ${chCount > 0 ? `${chCount} configured` : 'all voice channels'}\n\n` +
      '**Set these up in order:**\n' +
      '`1.` Add Allowed Channels — choose which voice channels appear in the dropdown (optional — skip to allow all)\n' +
      '`2.` Send Panel — posts the panel to any text channel you choose'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('movemesetup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: 'Add Allowed Channel', description: 'Add a voice channel to the dropdown list', value: 'add_channel' },
            { label: 'Remove Allowed Channel', description: 'Remove a channel from the list', value: 'remove_channel' },
            { label: 'View Allowed Channels', description: 'See which channels are in the list', value: 'view_channels' },
            { label: 'Clear Channel Filter', description: 'Show all voice channels in the dropdown', value: 'clear_filter' },
            { label: 'Send Panel', description: 'Post the voice mover panel to a text channel', value: 'send_panel' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function rolesMenu() {
  return {
    embeds: [menuEmbed(
      'Role Request Setup',
      '**What this does:** Members can request specific roles from a panel. Staff approve or deny each request. Great for department roles, whitelist roles, etc.\n\n' +
      '**Set these up in order:**\n' +
      '`1.` Add Role Request Type — create a requestable role (e.g. "Civilian Whitelist")\n' +
      '`2.` Once you have types, the panel will appear automatically in the designated channel'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rolerequest_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: 'Add Role Request Type', description: 'Create a role members can request', value: 'add_role' },
            { label: 'Delete Role Request Type', description: 'Remove a requestable role', value: 'delete_role' },
            { label: 'View Role Request Types', description: 'See all configured requestable roles', value: 'view_roles' },
            { label: 'Manage Global Role Links', description: 'Link roles across multiple servers', value: 'global_role_links' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function roleplayMenu() {
  return {
    embeds: [menuEmbed(
      'Roleplay Commands Setup',
      '**What this does:** Enables roleplay-style commands your members can use in-character:\n' +
      '- `/me` — describe an action (e.g. "/me waves hello")\n' +
      '- `/do` — describe something happening in the scene\n' +
      '- `/try` — attempt an action (bot randomly says if it succeeds)\n' +
      '- `911` — members can send emergency calls that LEO and FD can respond to\n\n' +
      '**Toggle each one on or off below:**'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommands_setup_menu')
          .setPlaceholder('What do you want to toggle?')
          .addOptions([
            { label: 'Toggle 911 / CAD Commands', description: 'Enable or disable emergency calls', value: 'toggle_911' },
            { label: 'Toggle Twitter Commands', description: 'Enable or disable /twitter', value: 'toggle_twitter' },
            { label: 'Toggle Anonymous Commands', description: 'Enable or disable /anon', value: 'toggle_anon' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
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
        .setTitle('AI Voice Dispatch Setup')
        .setDescription(
          '**What this does (Premium):** The bot joins voice channels where your LEO officers patrol. It listens, transcribes their speech with AI, and responds as a dispatcher — updating a live status board, handling 10-codes, and announcing 911 calls.\n\n' +
          '**Set these up in order:**\n' +
          '`1.` Set Dispatch Channel — text channel for dispatch logs\n' +
          '`2.` Set Status Board Channel — text channel for the live officer status board\n' +
          '`3.` Add Patrol Voice Channel — voice channel(s) to listen to\n' +
          '`4.` Enable / Disable System — turn it on when ready' +
          warning
        )
        .setFooter({ text: 'RPM' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('dispatch_setup_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: '1. Set Dispatch Channel', description: 'Text channel for dispatch logs and announcements', value: 'set_dispatch_channel' },
            { label: '2. Set Status Board Channel', description: 'Text channel for the live officer status board', value: 'set_status_channel' },
            { label: '3. Add Patrol Voice Channel', description: 'Voice channel the bot will listen and talk in', value: 'add_patrol_channel' },
            { label: 'Set Traffic Stop Channel', description: 'Voice channel officers are moved to on 10-11', value: 'set_stop_channel' },
            { label: '4. Enable / Disable System', description: 'Turn AI dispatch on or off', value: 'toggle_system' },
            { label: 'Toggle AI Responses', description: 'Enable or disable AI-generated dispatcher replies', value: 'toggle_ai' },
            { label: 'Remove Patrol Channel', description: 'Stop monitoring a channel', value: 'remove_patrol_channel' },
            { label: 'View Settings', description: 'See current configuration', value: 'view_settings' },
            { label: 'Done', description: 'Close this menu', value: 'setup_done' },
          ])
      ),
    ],
    flags: 64,
  };
}

function blacklistMenu() {
  return {
    embeds: [menuEmbed(
      'Blacklist System Setup (Premium)',
      '**What this does:** Blocks banned members at the verification wall using fuzzy name and gamertag matching. A live panel auto-updates in a channel whenever someone is blacklisted or removed.\n\n' +
      '`1.` Set Panel Channel — the channel where the live blacklist panel is posted and kept up to date\n' +
      '`2.` Post / Refresh Panel — send or update the panel\n\n' +
      '-# Use `/blacklist @user` to add members and `/removeblacklist` to remove them.'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('blacklist_config_menu')
          .setPlaceholder('What do you want to set up?')
          .addOptions([
            { label: '1. Set Panel Channel', value: 'set_panel_channel', description: 'Channel where the live blacklist panel is posted' },
            { label: '2. Post / Refresh Panel', value: 'post_panel', description: 'Send or update the blacklist panel' },
            { label: 'View Blacklist', value: 'view_blacklist', description: 'See all currently blacklisted entries' },
            { label: 'Done', value: 'setup_done', description: 'Close this menu' },
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
        .setTitle('Enable / Disable Features')
        .setDescription(
          '**Enable** a feature to turn it on for your server.\n' +
          '**Disable** a feature to turn it off — your settings are saved, you can re-enable it later.\n\n' +
          '-# Tip: You can configure a feature directly with `/config <feature>` — it auto-enables it for you.'
        )
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
  const logStatus = config?.logChannelId
    ? `Currently set to <#${config.logChannelId}>`
    : 'Not set yet — pick a channel below';
  return {
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('General Settings')
        .setDescription(
          '**Log channel** — this is where the bot records events like verifications, strikes, ticket opens, and more. Only staff should be able to see it.\n\n' +
          `**${logStatus}**\n\n` +
          'Pick a text channel below to set (or update) the log channel:'
        )
        .setFooter({ text: 'RPM' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setlogchannel_select')
          .setPlaceholder('Select a text channel for logs...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  };
}

// ─── subcommand handlers ──────────────────────────────────────────────────────

async function handleVerify(interaction) {
  await ensureEnabled(Verification, interaction.guildId);
  return interaction.reply(verifyMenu());
}

async function handleTickets(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'ticket');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Ticket Support')], flags: 64 });
  await ensureEnabled(TicketConfig, interaction.guildId);
  return interaction.reply(ticketsMenu());
}

async function handleEconomy(interaction) {
  return interaction.reply(getEconomySetupMenu());
}

async function handleDispatch(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'dispatch');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('AI Voice Dispatch')], flags: 64 });
  const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  const warning = hasApiKey ? '' : '\n\n-# No AI key set up yet. Ask your server host to set `GROQ_API_KEY` or `OPENAI_API_KEY`.';
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
  await ensureEnabled(Priority, interaction.guildId);
  const config = await Priority.findOne({ guildId: interaction.guildId });
  const currentChannel = config?.channelId ? `\n\nCurrently posting to <#${config.channelId}>.` : '';
  return interaction.reply({
    embeds: [menuEmbed(
      'Priority Tracker Setup',
      `**What this does:** Posts a live embed in a channel that shows whether a priority event is active in your server. Staff can start/stop priority events with \`/activepriority\` and \`/deactivatepriority\`.\n\n` +
      `**Just pick a channel below** — the bot handles the rest.${currentChannel}`
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('prioritytrackersetup_channel')
          .setPlaceholder('Pick the channel for the priority board...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  });
}

async function handleCalendar(interaction) {
  const { default: RoleplayCalendar } = await import('../models/RoleplayCalendar.js');
  const config = await RoleplayCalendar.findOne({ guildId: interaction.guildId });
  const currentChannel = config?.channelId ? `\n\nCurrently posting to <#${config.channelId}>.` : '';
  return interaction.reply({
    embeds: [menuEmbed(
      'RP Calendar Setup',
      `**What this does:** Posts a weekly roleplay schedule in a channel. Staff add events with \`/setrp\` and members can see when sessions are happening.\n\n` +
      `**Just pick a channel below** — the bot handles the rest.${currentChannel}`
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('roleplaycalendarsetup_channel')
          .setPlaceholder('Pick the channel for the RP calendar...')
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
        .setTitle('Applications (Premium)')
        .setDescription(
          '**What this does:** Members can apply for staff positions or whitelist roles through a bot-guided Q&A in their DMs. Staff see submissions and can approve or deny.\n\n' +
          `**Review channel:** ${reviewCh}\n` +
          `**Panel channel:** ${panelCh}\n` +
          `**Application types:** ${typeCount}\n\n` +
          '### Configure on the Dashboard\n' +
          'Create application types, set questions, and manage panels at **[roleplaymanager.xyz/dashboard](https://roleplaymanager.xyz/dashboard)**.\n\n' +
          '-# Dashboard → Applications — full setup available there.'
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

async function handleBlacklist(interaction) {
  const access = await checkFeatureAccess(interaction.guildId, 'blacklist');
  if (!access.allowed) return interaction.reply({ embeds: [buildPremiumEmbed('Blacklist System')], flags: 64 });
  const { default: BlacklistConfig } = await import('../models/BlacklistConfig.js');
  await ensureEnabled(BlacklistConfig, interaction.guildId);
  return interaction.reply(blacklistMenu());
}

async function handleCivjobs(interaction) {
  const { default: CivilianJobConfig } = await import('../models/CivilianJobConfig.js');
  const config = await CivilianJobConfig.findOneAndUpdate(
    { guildId: interaction.guildId },
    { $set: { enabled: true } },
    { upsert: true, new: true }
  );
  const jobCount = config?.jobs?.length ?? 0;
  const channelStatus = config?.channelId
    ? `Job board channel: <#${config.channelId}>`
    : 'Job board channel: not set yet';
  return interaction.reply({
    embeds: [menuEmbed(
      'Civilian Jobs Setup',
      `**What this does:** Posts a job board in a channel. Members check in to civilian jobs and get a role for the duration of their shift — the role is removed automatically when the shift expires.\n\n` +
      `**${channelStatus} · Jobs configured: ${jobCount}**\n\n` +
      '`1.` Pick a job board channel below — the bot posts the panel there\n' +
      '`2.` Add and manage jobs at **roleplaymanager.xyz/dashboard** → Civilian Jobs\n\n' +
      '-# After setting the channel, add at least one job on the dashboard before the panel will post.'
    )],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('economy_civjobs_channel_select')
          .setPlaceholder('Select the job board channel...')
          .setChannelTypes(ChannelType.GuildText)
      ),
    ],
    flags: 64,
  });
}

async function handleSticky(interaction) {
  const { default: Sticky } = await import('../models/Sticky.js');
  const count = await Sticky.countDocuments({ guildId: interaction.guildId });
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Sticky Messages Setup')
        .setDescription(
          '**What this does:** After every new message in a channel, the bot reposts a pinned message so it always stays at the bottom. Great for rules, join links, or active announcements.\n\n' +
          `**Active stickies: ${count}**\n\n` +
          '**Discord commands:**\n' +
          '`/sticky create` — add a sticky to a channel\n' +
          '`/sticky delete` — remove a sticky from a channel\n' +
          '`/stickylist` — view all active stickies\n\n' +
          '-# Full management also available at **roleplaymanager.xyz/dashboard** → Sticky Messages.'
        )
        .setFooter({ text: 'RPM' }),
    ],
    flags: 64,
  });
}

async function handleReactionRoles(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  const count = await ReactionRole.countDocuments({ guildId: interaction.guildId });
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Reaction Roles Setup')
        .setDescription(
          '**What this does:** Members react to a designated message with an emoji to automatically receive or remove a Discord role. Up to 5 emoji–role pairs per message.\n\n' +
          `**Active reaction role messages: ${count}**\n\n` +
          '**Discord command:**\n' +
          '`/reactionrolemessage` — create a new reaction role message in any channel\n\n' +
          '-# To remove reaction role messages, use **roleplaymanager.xyz/dashboard** → Reaction Roles.'
        )
        .setFooter({ text: 'RPM' }),
    ],
    flags: 64,
  });
}

async function handleBusiness(interaction) {
  const { default: BusinessAccount } = await import('../models/BusinessAccount.js');
  const count = await BusinessAccount.countDocuments({ guildId: interaction.guildId });
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Business Accounts Setup')
        .setDescription(
          '**What this does:** Creates shared business bank accounts in your server economy. Members deposit or withdraw money, pay employees, and earn passive income on a cooldown. Each business has its own balance and transaction history.\n\n' +
          `**Active business accounts: ${count}**\n\n` +
          '**Discord command:**\n' +
          '`/business` — access a business account (deposit, withdraw, pay members)\n\n' +
          '### Configure on the Dashboard\n' +
          'Create accounts, set income rates, and manage everything at **[roleplaymanager.xyz/dashboard](https://roleplaymanager.xyz/dashboard)**.\n\n' +
          '-# Dashboard → Economy → Business Accounts.'
        )
        .setFooter({ text: 'RPM' }),
    ],
    flags: 64,
  });
}

async function handleHelp(interaction) {
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('⚙️ Config — Quick Reference')
        .setDescription(
          '**Run any of these to set up that feature — it enables automatically.**\n\n' +
          '**🔧 Start here**\n' +
          '`/config general` — Set your log channel *(do this first)*\n' +
          '`/staff add @you` — Add yourself as staff *(required before general)*\n' +
          '`/config features` — Enable or disable individual features\n\n' +
          '**🎮 Roleplay & Operations**\n' +
          '`/config roleplay` — /me, /do, /try, 911 calls & CAD\n' +
          '`/config priority` — Live priority event tracker\n' +
          '`/config calendar` — Weekly RP session schedule\n\n' +
          '**🛡️ Moderation**\n' +
          '`/config verify` — Member verification gate\n' +
          '`/config strikes` — Strike system with auto-punishments\n' +
          '`/config antipromo` — Auto-delete Discord invite links\n' +
          '`/config blacklist` — Block banned members at verification *(Premium)*\n\n' +
          '**🌐 Community**\n' +
          '`/config tickets` — Support ticket panels\n' +
          '`/config welcome` — Welcome messages for new members\n' +
          '`/config roles` — Role request panels\n' +
          '`/config moveme` — Voice channel mover panel\n' +
          '`/config sticky` — Auto-reposting sticky messages\n' +
          '`/config reactionroles` — Emoji reaction role messages\n\n' +
          '**💰 Economy**\n' +
          '`/config economy` — Currency, work, crime, shops\n' +
          '`/config civjobs` — Civilian job board with shift roles\n' +
          '`/config business` — Shared business bank accounts\n\n' +
          '**⭐ Premium Only**\n' +
          '`/config appys` — Application panels with DM Q&A\n' +
          '`/config dispatch` — AI voice dispatch\n\n' +
          '-# You can also configure everything at **roleplaymanager.xyz/dashboard**'
        )
        .setFooter({ text: 'RPM • /config help' }),
    ],
    flags: 64,
  });
}

async function handleGeneral(interaction) {
  const staffCount = await Staff.countDocuments({ guildId: interaction.guildId });
  if (staffCount === 0) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle('Add Staff First')
          .setDescription(
            '**Before setting a log channel**, you need to add at least one staff member.\n\n' +
            '**Do this right now:**\n' +
            '`1.` Run `/staff add @YourName` to add yourself\n' +
            '`2.` Then come back and run `/config general` again\n\n' +
            '-# Staff are people who can use bot commands. Add yourself first.'
          )
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  }
  const config = await Config.findOne({ guildId: interaction.guildId });
  return interaction.reply(generalMenu(config));
}

// ─── subcommand dispatch ──────────────────────────────────────────────────────

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
  help: handleHelp,
  blacklist: handleBlacklist,
  civjobs: handleCivjobs,
  sticky: handleSticky,
  reactionroles: handleReactionRoles,
  business: handleBusiness,
};

// ─── command definition ───────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure any bot feature (Admin/Staff)')
  .addSubcommand(s => s.setName('general').setDescription('Set the log channel — do this before anything else'))
  .addSubcommand(s => s.setName('features').setDescription('Enable or disable features'))
  .addSubcommand(s => s.setName('verify').setDescription('Verification — members fill a form to join your server'))
  .addSubcommand(s => s.setName('tickets').setDescription('Tickets — members open support tickets with a button'))
  .addSubcommand(s => s.setName('economy').setDescription('Economy — currency, work, crime, shops'))
  .addSubcommand(s => s.setName('strikes').setDescription('Strikes — warn rule-breakers, auto-punish at each level'))
  .addSubcommand(s => s.setName('welcome').setDescription('Welcome — greet new members automatically'))
  .addSubcommand(s => s.setName('antipromo').setDescription('Anti-promoting — auto-delete invite links'))
  .addSubcommand(s => s.setName('roles').setDescription('Role requests — members apply for specific roles'))
  .addSubcommand(s => s.setName('priority').setDescription('Priority tracker — track active priority events'))
  .addSubcommand(s => s.setName('calendar').setDescription('RP Calendar — schedule and display roleplay sessions'))
  .addSubcommand(s => s.setName('moveme').setDescription('Voice mover — panel for members to move between voice channels'))
  .addSubcommand(s => s.setName('roleplay').setDescription('Roleplay commands — /me, /do, /try, 911 calls'))
  .addSubcommand(s => s.setName('appys').setDescription('Applications — staff application panels (Premium)'))
  .addSubcommand(s => s.setName('dispatch').setDescription('AI Voice Dispatch — AI-powered patrol dispatch (Premium)'))
  .addSubcommand(s => s.setName('help').setDescription('Show all available config commands and what they do'))
  .addSubcommand(s => s.setName('blacklist').setDescription('Blacklist — block banned members at the verification wall (Premium)'))
  .addSubcommand(s => s.setName('civjobs').setDescription('Civilian Jobs — job board with timed shift roles'))
  .addSubcommand(s => s.setName('sticky').setDescription('Sticky Messages — auto-reposting messages that stay visible'))
  .addSubcommand(s => s.setName('reactionroles').setDescription('Reaction Roles — members react to a message to get a role'))
  .addSubcommand(s => s.setName('business').setDescription('Business Accounts — shared economy accounts in your server'));

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('Only staff and administrators can use this command.')],
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
    const respond = interaction.replied || interaction.deferred
      ? (opts) => interaction.followUp(opts)
      : (opts) => interaction.reply(opts);
    return respond({ embeds: [errorEmbed('Something went wrong. Please try again.')], flags: 64 });
  }
}
