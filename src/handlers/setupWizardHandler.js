/**
 * setupWizardHandler.js
 * Handles the setup_config_select interaction from /setup.
 * When a user picks a feature from the /setup dropdown, this shows that
 * feature's config menu inline (updates the existing message instead of a new one).
 */
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';
import { getEconomySetupMenu } from './economyHandler.js';
import Priority from '../models/Priority.js';
import Verification from '../models/Verification.js';
import TicketConfig from '../models/TicketConfig.js';
import { StrikeConfig } from '../models/Strike.js';
import Welcome from '../models/Welcome.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import AppyConfig from '../models/AppyConfig.js';
import Config from '../models/Config.js';
import Staff from '../models/Staff.js';

function menuEmbed(title, desc) {
  return new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'RPM — run /setup to go back' });
}

async function ensureEnabled(Model, guildId) {
  return Model.findOneAndUpdate(
    { guildId },
    { $set: { enabled: true } },
    { upsert: true, new: true }
  );
}

// ─── module handlers (each returns an interaction.update() call) ──────────────

const moduleResponses = {

  async general(interaction) {
    const staffCount = await Staff.countDocuments({ guildId: interaction.guildId });
    if (staffCount === 0) {
      return interaction.update({
        embeds: [menuEmbed(
          'Add Staff First',
          '**Before setting a log channel**, you need to add at least one staff member.\n\n' +
          '**Do this right now:**\n' +
          '`1.` Run `/staff add @YourName` to add yourself\n' +
          '`2.` Then come back and run `/setup` again\n\n' +
          '-# Staff are people who can use bot commands. Add yourself first.'
        )],
        components: [],
      });
    }
    const config = await Config.findOne({ guildId: interaction.guildId });
    const logStatus = config?.logChannelId
      ? `Currently set to <#${config.logChannelId}>`
      : 'Not set yet';
    return interaction.update({
      embeds: [menuEmbed(
        'General Settings — Log Channel',
        `**The log channel is where the bot records everything** — verifications, strikes, ticket opens, bans, etc. Only staff should be able to see it.\n\n` +
        `**${logStatus}**\n\n` +
        'Pick a text channel below:'
      )],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('setlogchannel_select')
            .setPlaceholder('Select a text channel for logs...')
            .setChannelTypes(ChannelType.GuildText)
        ),
      ],
    });
  },

  async verify(interaction) {
    await ensureEnabled(Verification, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Verification Setup',
        '**What this does:** Members click a button and fill out a short form. You (or the bot) approves them and they get access to the server.\n\n' +
        '**Set these up in order:**\n' +
        '`1.` Verify Channel — the channel where members go to click the verify button\n' +
        '`2.` Verified Role — the role members get when approved (e.g. "Member")\n' +
        '`3.` Unverified Role — the role members have before they verify (e.g. "Unverified")\n' +
        '`4.` Verified Channels — categories members can see after verification\n\n' +
        '-# Custom question, RP tag, and staff approval are optional extras.'
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
              { label: 'Custom Question (Optional)', description: 'Ask members one extra question when they apply', value: 'set_custom_question' },
              { label: 'Remove Custom Question (Optional)', description: 'Delete the extra question', value: 'delete_custom_question' },
              { label: 'Toggle Staff Approval (Optional)', description: 'Require staff to manually approve each application', value: 'toggle_approval_required' },
              { label: 'RP Tag (Optional)', description: 'A tag added to verified members nicknames', value: 'set_rp_tag' },
              { label: 'Done', description: 'Close this menu', value: 'verify_setup_done' },
            ])
        ),
      ],
    });
  },

  async tickets(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'ticket');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Ticket Support')], components: [] });
    await ensureEnabled(TicketConfig, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Ticket Setup',
        '**What this does:** Members click a button to open a private support channel with staff. Great for reports, ban appeals, and questions.\n\n' +
        '**Set these up in order:**\n' +
        '`1.` Select Panel Channel — the channel where the "Open a Ticket" button lives\n' +
        '`2.` Add Ticket Type — create one or more categories (e.g. "Report a Player")\n' +
        '`3.` Send Panel — posts the button to the channel you chose\n\n' +
        '-# Up to 5 ticket types free, unlimited with Premium.'
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
    });
  },

  async economy(interaction) {
    const menu = getEconomySetupMenu();
    return interaction.update({ embeds: menu.embeds, components: menu.components });
  },

  async strikes(interaction) {
    await ensureEnabled(StrikeConfig, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Strike System Setup',
        '**What this does:** Staff issue strikes to rule-breakers with `/strike @user`. At each level the bot can automatically timeout, kick, or ban them.\n\n' +
        '**Both options below are optional** — you can use strikes without automatic punishments:\n\n' +
        '`1.` Set Strike Level Roles — give members a visible role at each strike count\n' +
        '`2.` Set Strike Actions — what the bot does automatically at each level'
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
    });
  },

  async welcome(interaction) {
    await ensureEnabled(Welcome, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Welcome System Setup',
        '**What this does:** When a new member joins your server, the bot automatically sends a greeting message to a channel and/or a DM to them.\n\n' +
        '**Set up what you need (all optional):**\n' +
        '`1.` Welcome Channel — the channel where the greeting is posted\n' +
        '`2.` Welcome Message — what the message says (use `{user}` to mention them)\n' +
        '`3.` Welcome DM — a private message sent directly to the new member'
      )],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('welcome_setup_menu')
            .setPlaceholder('What do you want to set up?')
            .addOptions([
              { label: '1. Welcome Channel', description: 'Channel where the greeting is posted', value: 'select_welcome_channel_setup' },
              { label: '2. Welcome Message', description: 'What the greeting says', value: 'set_welcome_message_setup' },
              { label: '3. Welcome DM (Optional)', description: 'A private message to new members', value: 'set_welcome_dm_setup' },
              { label: 'Done', description: 'Close this menu', value: 'welcome_setup_done' },
            ])
        ),
      ],
    });
  },

  async antipromo(interaction) {
    return interaction.update({
      embeds: [menuEmbed(
        'Anti-Promoting Setup',
        '**What this does:** Automatically deletes Discord invite links that members post — so nobody advertises other servers in yours.\n\n' +
        '**Works automatically with no setup required.** Use the options below to customize:\n\n' +
        '`1.` Add Whitelisted Link — allow your own server invite so it is never deleted\n' +
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
    });
  },

  async roles(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'rolerequest');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Role Request')], components: [] });
    await ensureEnabled(RoleRequestConfig, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Role Request Setup',
        '**What this does:** Members click a button to request a role (e.g. "Civilian Whitelist"). Staff approve or deny each request.\n\n' +
        '**Set these up in order:**\n' +
        '`1.` Add Role Request Type — create a role members can request\n' +
        '`2.` The panel appears automatically in the channel you set up'
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
    });
  },

  async priority(interaction) {
    const config = await ensureEnabled(Priority, interaction.guildId);
    const currentChannel = config?.channelId ? `\n\nCurrently posting to <#${config.channelId}>.` : '';
    return interaction.update({
      embeds: [menuEmbed(
        'Priority Tracker Setup',
        `**What this does:** Posts a live board in a channel showing whether a priority event is currently active. Staff use \`/activepriority\` and \`/deactivatepriority\` to control it.\n\n` +
        `**Just pick a channel below** — that is all you need to do.${currentChannel}`
      )],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('prioritytrackersetup_channel')
            .setPlaceholder('Pick the channel for the priority board...')
            .setChannelTypes(ChannelType.GuildText)
        ),
      ],
    });
  },

  async calendar(interaction) {
    const { default: RoleplayCalendar } = await import('../models/RoleplayCalendar.js');
    const config = await RoleplayCalendar.findOne({ guildId: interaction.guildId });
    const currentChannel = config?.channelId ? `\n\nCurrently posting to <#${config.channelId}>.` : '';
    return interaction.update({
      embeds: [menuEmbed(
        'RP Calendar Setup',
        `**What this does:** Posts a weekly roleplay schedule in a channel. Staff schedule sessions with \`/setrp\` and members can see when to show up.\n\n` +
        `**Just pick a channel below** — that is all you need to do.${currentChannel}`
      )],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('roleplaycalendarsetup_channel')
            .setPlaceholder('Pick the channel for the RP calendar...')
            .setChannelTypes(ChannelType.GuildText)
        ),
      ],
    });
  },

  async moveme(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'moveme');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Voice Mover')], components: [] });
    const config = await ensureEnabled(MemberMovementConfig, interaction.guildId);
    const chCount = (config?.allowedChannelIds || []).length;
    const panelStatus = config?.panelChannelId
      ? `Panel is in <#${config.panelChannelId}>${config.panelMessageId ? '' : ' — not sent yet'}`
      : 'Panel not sent yet';
    return interaction.update({
      embeds: [menuEmbed(
        'Voice Mover Setup',
        `**What this does:** Posts a panel in a text channel with a dropdown. Members pick a voice channel from the list and the bot moves them into it — no need for staff to drag people manually.\n\n` +
        `**Current status:** ${panelStatus} · Allowed channels: ${chCount > 0 ? `${chCount} configured` : 'all voice channels'}\n\n` +
        '**Set these up in order:**\n' +
        '`1.` Add Allowed Channels — choose which voice channels appear in the dropdown (or skip to allow all)\n' +
        '`2.` Send Panel — posts the dropdown panel to any text channel'
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
    });
  },

  async roleplay(interaction) {
    const { default: RoleplayCommandsModel } = await import('../models/RoleplayCommands.js');
    await ensureEnabled(RoleplayCommandsModel, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed(
        'Roleplay Commands Setup',
        '**What this does:** Enables in-character commands your members can use:\n' +
        '- `/me` — describe an action (e.g. "/me waves hello")\n' +
        '- `/do` — describe something happening in the scene\n' +
        '- `/try` — attempt an action (bot randomly says if it succeeds)\n' +
        '- `911` — members send emergency calls that LEO and FD can respond to\n\n' +
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
    });
  },

  async appys(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'appys');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Applications')], components: [] });
    const config = await AppyConfig.findOne({ guildId: interaction.guildId });
    const reviewCh = config?.reviewChannelId ? `<#${config.reviewChannelId}>` : 'not set';
    const panelCh = config?.panelChannelId ? `<#${config.panelChannelId}>` : 'not set';
    const typeCount = config?.activeTypeIds?.length ?? 0;
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Applications (Premium)')
          .setDescription(
            '**What this does:** Members apply for staff or whitelist roles through a bot-guided Q&A in their DMs. Staff see submissions and can approve or deny with a button.\n\n' +
            `**Review channel:** ${reviewCh}\n` +
            `**Panel channel:** ${panelCh}\n` +
            `**Application types:** ${typeCount}\n\n` +
            '### Configure on the Dashboard\n' +
            'Create application types, set questions, and manage panels at **[roleplaymanager.xyz/dashboard](https://roleplaymanager.xyz/dashboard)**.\n\n' +
            '-# Dashboard → Applications — full setup available there.'
          )
          .setFooter({ text: 'RPM — run /setup to go back' }),
      ],
      components: [],
    });
  },

  async dispatch(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'dispatch');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('AI Voice Dispatch')], components: [] });
    const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
    const warning = hasApiKey ? '' : '\n\n-# No AI key set up yet. Set `GROQ_API_KEY` or `OPENAI_API_KEY` to enable transcription.';
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('AI Voice Dispatch Setup')
          .setDescription(
            '**What this does (Premium):** The bot joins your officers\' voice channels, listens, and responds as an AI dispatcher — updating a live status board, handling 10-codes, and announcing 911 calls.\n\n' +
            '**Set these up in order:**\n' +
            '`1.` Set Dispatch Channel — text channel for dispatch logs\n' +
            '`2.` Set Status Board Channel — text channel for the live status board\n' +
            '`3.` Add Patrol Voice Channel — voice channel(s) to listen to\n' +
            '`4.` Enable the System — turn it on when ready' +
            warning
          )
          .setFooter({ text: 'RPM — run /setup to go back' }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('dispatch_setup_menu')
            .setPlaceholder('What do you want to set up?')
            .addOptions([
              { label: '1. Set Dispatch Channel', description: 'Text channel for dispatch logs', value: 'set_dispatch_channel' },
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
    });
  },

  async features(interaction) {
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Enable / Disable Features')
          .setDescription(
            '**Enable** a feature to turn it on.\n' +
            '**Disable** a feature to turn it off — your settings are saved and you can re-enable anytime.\n\n' +
            '-# Tip: `/config <feature>` automatically enables a feature when you configure it.'
          )
          .setFooter({ text: 'RPM — run /setup to go back' }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('choice_enable').setLabel('Enable Features').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('choice_disable').setLabel('Disable Features').setStyle(ButtonStyle.Danger)
        ),
      ],
    });
  },
};

export async function handleSetupConfigSelect(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.update({ embeds: [errorEmbed('Permission denied.')], components: [] });
  }

  const choice = interaction.values[0];
  const handler = moduleResponses[choice];

  if (!handler) {
    return interaction.update({ embeds: [errorEmbed('Unknown option. Please try again.')], components: [] });
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[setupWizardHandler] ${choice}:`, err);
    await interaction.update({
      embeds: [errorEmbed('Something went wrong. Please try again.')],
      components: [],
    });
  }
}
