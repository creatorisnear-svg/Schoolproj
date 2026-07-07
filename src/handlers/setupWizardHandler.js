/**
 * setupWizardHandler.js
 * Handles the select menu from /setup that lets users jump to any feature's config.
 * Each selection fires the matching /config subcommand logic.
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
  return new EmbedBuilder().setColor('#2d2d2d').setTitle(title).setDescription(desc).setFooter({ text: 'RPM' });
}

async function ensureEnabled(Model, guildId) {
  return Model.findOneAndUpdate({ guildId }, { $set: { enabled: true } }, { upsert: true, new: true });
}

const moduleResponses = {
  async general(interaction) {
    const guildId = interaction.guildId;
    const staffCount = await Staff.countDocuments({ guildId });
    if (staffCount === 0) {
      return interaction.update({
        embeds: [menuEmbed('Add Staff First', 'You need at least one staff member before setting a log channel.\n\nRun `/staff add @user` to add your first staff member, then come back here.')],
        components: [],
      });
    }
    const config = await Config.findOne({ guildId });
    const logStatus = config?.logChannelId ? `Currently set to <#${config.logChannelId}>` : 'Not set yet';
    return interaction.update({
      embeds: [menuEmbed('General Settings', `**Log channel** — ${logStatus}\n\nSelect a text channel below:`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('setlogchannel_select')
            .setPlaceholder('Select log channel...')
            .setChannelTypes(ChannelType.GuildText)
        ),
      ],
    });
  },

  async verify(interaction) {
    await ensureEnabled(Verification, interaction.guildId);
    return interaction.update({
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
    });
  },

  async tickets(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'ticket');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Ticket Support')], components: [] });
    await ensureEnabled(TicketConfig, interaction.guildId);
    return interaction.update({
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
    });
  },

  async economy(interaction) {
    return interaction.update({ ...getEconomySetupMenu(), flags: undefined });
  },

  async strikes(interaction) {
    await ensureEnabled(StrikeConfig, interaction.guildId);
    return interaction.update({
      embeds: [menuEmbed('Strike System Setup', 'Configure strike roles and actions at each level.')],
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
    });
  },

  async welcome(interaction) {
    await ensureEnabled(Welcome, interaction.guildId);
    return interaction.update({
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
    });
  },

  async antipromo(interaction) {
    return interaction.update({
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
    });
  },

  async roles(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'rolerequest');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('Role Request')], components: [] });
    await ensureEnabled(RoleRequestConfig, interaction.guildId);
    return interaction.update({
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
    });
  },

  async priority(interaction) {
    const config = await ensureEnabled(Priority, interaction.guildId);
    const currentChannel = config?.channelId ? `\nCurrently posting to <#${config.channelId}>` : '';
    return interaction.update({
      embeds: [menuEmbed('Priority Tracker Setup', `Select a text channel to post the priority tracker board.${currentChannel}`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('prioritytrackersetup_channel')
            .setPlaceholder('Select priority tracker channel...')
            .setChannelTypes(ChannelType.GuildText)
        ),
      ],
    });
  },

  async calendar(interaction) {
    const { default: RoleplayCalendar } = await import('../models/RoleplayCalendar.js');
    const config = await RoleplayCalendar.findOne({ guildId: interaction.guildId });
    const currentChannel = config?.channelId ? `\nCurrently posting to <#${config.channelId}>` : '';
    return interaction.update({
      embeds: [menuEmbed('RP Calendar Setup', `Select a text channel where the roleplay calendar will be posted.${currentChannel}`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('roleplaycalendarsetup_channel')
            .setPlaceholder('Select calendar channel...')
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
      ? `Panel channel: <#${config.panelChannelId}>${config.panelMessageId ? ' — panel active' : ' — not sent yet'}`
      : 'No panel channel set';
    return interaction.update({
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
    });
  },

  async roleplay(interaction) {
    const { default: RoleplayCommandsModel } = await import('../models/RoleplayCommands.js');
    await ensureEnabled(RoleplayCommandsModel, interaction.guildId);
    return interaction.update({
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
          .setTitle('Applications Config')
          .setDescription(
            `**Review channel:** ${reviewCh}\n**Panel channel:** ${panelCh}\n**Active types:** ${typeCount}\n\n` +
            `### Configure via Dashboard\nFull setup (types, questions, accept roles, panels) is done through the **Dashboard → Applications** page at [roleplaymanager.xyz/dashboard](https://roleplaymanager.xyz/dashboard).`
          )
          .setFooter({ text: 'RPM' }),
      ],
      components: [],
    });
  },

  async dispatch(interaction) {
    const access = await checkFeatureAccess(interaction.guildId, 'dispatch');
    if (!access.allowed) return interaction.update({ embeds: [buildPremiumEmbed('AI Voice Dispatch')], components: [] });
    const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
    const warning = hasApiKey ? '' : '\n\n-# No AI key configured. Set `GROQ_API_KEY` or `OPENAI_API_KEY` to enable transcription.';
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('AI Dispatch Setup')
          .setDescription(`Configure the AI voice dispatch system.${warning}`)
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
    });
  },

  async features(interaction) {
    return interaction.update({
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
    return interaction.update({ embeds: [errorEmbed('Unknown option.')], components: [] });
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[setupWizardHandler] ${choice}:`, err);
    await interaction.update({ embeds: [errorEmbed('Something went wrong. Please try again.')], components: [] });
  }
}
