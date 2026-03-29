import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import TicketConfig from '../models/TicketConfig.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';

function menuEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'EverLink' });
}

export async function handleBackToMenu(interaction) {
  try {
    const customId = interaction.customId;

    if (customId === 'back_to_rolerequest_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rolerequest_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Add Role Request Type', value: 'add_role', description: 'Create a new requestable role type' },
              { label: 'Remove Role Request Type', value: 'delete_role', description: 'Delete an existing role type' },
              { label: 'View Role Request Types', value: 'view_roles', description: 'See all configured role types' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Role Request Setup', 'Configure which roles members can request and who approves them.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_ticket_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticketsupport_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Panel Title', value: 'panel_title', description: 'Customize the ticket panel title' },
              { label: 'Panel Description', value: 'panel_description', description: 'Customize the panel description' },
              { label: 'Panel Channel', value: 'select_channel', description: 'Choose where the panel is posted' },
              { label: 'Add Ticket Type', value: 'add_type', description: 'Create a new ticket category' },
              { label: 'View Ticket Types', value: 'view_types', description: 'See all ticket categories' },
              { label: 'Remove Ticket Type', value: 'remove_type', description: 'Delete a ticket category' },
              { label: 'Send Panel', value: 'send_panel', description: 'Post the ticket panel to the channel' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Ticket Support Setup', 'Configure your ticket system — create categories, set a channel, and send the panel.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_roleplay_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('roleplaycommands_setup_menu')
            .setPlaceholder('Select a command to configure...')
            .addOptions(
              { label: '🚨 911 & CAD', value: 'setup_emergency', description: 'Emergency reporting and dispatch' },
              { label: '🐦 Twitter', value: 'setup_twitter', description: 'Public in-character posts' },
              { label: '🤫 Anonymous', value: 'setup_anon', description: 'Anonymous in-character messages' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Roleplay Commands Setup', 'Configure which channels each roleplay command posts to.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_priority_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('priority_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Set Priority Channel', value: 'set_channel', description: 'Channel for the priority tracker panel' },
              { label: 'Set Priority Role', value: 'set_role', description: 'Role to ping on priority events' },
              { label: 'Set Cooldown', value: 'set_cooldown', description: 'Minutes between priority requests' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Priority Tracker Setup', 'Configure your priority request system for roleplay scenes.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_verify_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('verify_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Verify Channel', value: 'select_verify_channel', description: 'Required — where members submit verification' },
              { label: 'Verified Role', value: 'select_verified_role', description: 'Required — role given on approval' },
              { label: 'Unverified Role', value: 'select_unverified_role', description: 'Required — role before verification' },
              { label: 'Custom Question', value: 'set_custom_question', description: 'Optional — question shown to applicants' },
              { label: 'Remove Custom Question', value: 'delete_custom_question', description: 'Optional — clear the custom question' },
              { label: 'Toggle Approval Required', value: 'toggle_approval_required', description: 'Optional — require staff to approve' },
              { label: 'Set RP Tag', value: 'set_rp_tag', description: 'Optional — tag added to verified names' },
              { label: '✓ Finish Setup', value: 'verify_setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Verification System Setup', 'Configure how members verify and what happens when they do.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_cad_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cadsystem_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'LEO Roles', value: 'set_leo_roles', description: 'Roles with law enforcement access' },
              { label: 'Fire Department Roles', value: 'set_fd_roles', description: 'Roles with fire department access' },
              { label: 'Staff Roles', value: 'set_staff_roles', description: 'Roles with full CAD access' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('CAD System Setup', 'Set which roles can access each section of the CAD system.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_leo_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('leodatabase_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: '🚨 Active 911 Calls', value: 'active_calls' },
              { label: '🔍 Search License Plate', value: 'search_plate' },
              { label: '👤 Search Character', value: 'search_character' },
              { label: '📋 Active BOLOs', value: 'active_bolos' },
              { label: '⚙️ Manage BOLOs', value: 'manage_bolos' },
              { label: '🔫 Revoke Weapon', value: 'revoke_weapon' },
              { label: '🎫 Issue Traffic Ticket', value: 'issue_ticket' },
              { label: '📢 Create BOLO', value: 'create_bolo' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('LEO Database', 'Access law enforcement tools and records.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_civilian_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('civiliandatabase_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: '🚨 Report 911', value: 'report_911' },
              { label: '🐦 Post on Twitter', value: 'post_twitter' },
              { label: '🤫 Post Anonymously', value: 'post_anon' },
              { label: '👤 Create Character', value: 'create_character' },
              { label: '🚗 Add Vehicle', value: 'add_vehicle' },
              { label: '🔫 Add Firearm', value: 'add_firearm' },
              { label: '⚙️ Manage Character', value: 'manage_character' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Civilian Database', 'Manage your character, vehicles, firearms, and in-character actions.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_fd_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('firedepartmentdatabase_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: '🚨 Active 911 Calls', value: 'active_calls' },
              { label: '👤 Create Character', value: 'create_character' },
              { label: '🚗 Add Vehicle', value: 'add_vehicle' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Fire Department Database', 'Manage fire department characters and respond to active calls.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_calendar_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('roleplay_calendar_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Set Calendar Channel', value: 'set_channel', description: 'Where the event calendar is posted' },
              { label: 'Add Weekly Event', value: 'add_event', description: 'Schedule a recurring weekly event' },
              { label: 'Remove Weekly Event', value: 'remove_event', description: 'Remove a recurring event' },
              { label: 'View Events', value: 'view_events', description: 'See all scheduled events' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Roleplay Calendar Setup', 'Schedule and manage recurring weekly roleplay events.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_dispatch_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('dispatch_setup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Set Dispatch Channel', value: 'set_dispatch_channel', description: 'Text channel for AI dispatch logs and responses' },
              { label: 'Set Status Board Channel', value: 'set_status_channel', description: 'Text channel for the live officer status board' },
              { label: 'Add Patrol Voice Channel', value: 'add_patrol_channel', description: 'Voice channel the bot will listen to' },
              { label: 'Set Traffic Stop Channel', value: 'set_stop_channel', description: 'Voice channel officers are moved to during 10-11' },
              { label: '🤖 Toggle AI Dispatch', value: 'toggle_ai', description: 'Enable or disable AI-generated dispatcher responses' },
              { label: '📋 View Settings', value: 'view_settings', description: 'See current configuration' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );
      await interaction.update({
        embeds: [menuEmbed('AI Dispatch Setup', 'Configure the AI-powered voice dispatch system for your roleplay server.')],
        content: '',
        components: [menu],
      });

    } else if (customId === 'back_to_antipromotingsetup_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('antipromotingsetup_menu')
            .setPlaceholder('Select an option...')
            .addOptions(
              { label: 'Add Whitelisted Link', value: 'add_link', description: 'Allow a specific invite link' },
              { label: 'Remove Whitelisted Link', value: 'remove_link', description: 'Remove an allowed link' },
              { label: 'View Whitelisted Links', value: 'view_links', description: 'See all approved links' },
              { label: 'Toggle Staff Bypass', value: 'toggle_staff_bypass', description: 'Let staff post any invite link' },
              { label: 'View Settings', value: 'view_settings', description: 'See current configuration' },
              { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
            )
        );

      await interaction.update({
        embeds: [menuEmbed('Anti-Promoting Setup', 'Control which Discord invite links are allowed in your server.')],
        content: '',
        components: [menu],
      });
    }
  } catch (error) {
    console.error('Error going back to menu:', error);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#FF3860')
          .setDescription('Something went wrong. Please try running the command again.')
          .setFooter({ text: 'EverLink' })
      ],
      content: '',
      components: [],
    });
  }
}
