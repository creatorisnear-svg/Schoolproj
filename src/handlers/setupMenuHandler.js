import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import TicketConfig from '../models/TicketConfig.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';

export async function handleBackToMenu(interaction) {
  try {
    const customId = interaction.customId;

    if (customId === 'back_to_rolerequest_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rolerequest_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Add Role Request Type', value: 'add_role' },
              { label: 'Delete Role Request Type', value: 'delete_role' },
              { label: 'View Role Request Types', value: 'view_roles' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Role Request System Setup**\n\nSelect an option below to configure role requests:',
        components: [menu],
      });
    } else if (customId === 'back_to_ticket_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticketsupport_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Customize Panel Title', value: 'panel_title' },
              { label: 'Customize Panel Description', value: 'panel_description' },
              { label: 'Select Panel Channel', value: 'select_channel' },
              { label: 'Add Ticket Type', value: 'add_type' },
              { label: 'View Ticket Types', value: 'view_types' },
              { label: 'Remove Ticket Type', value: 'remove_type' },
              { label: 'Send Panel', value: 'send_panel' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Ticket Support Setup**\n\nSelect an option below to configure your ticket system:',
        components: [menu],
      });
    } else if (customId === 'back_to_roleplay_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('roleplaycommands_setup_menu')
            .setPlaceholder('Choose a command to configure...')
            .addOptions(
              { label: '🚨 911 & CAD - Emergency/Dispatch', value: 'setup_emergency' },
              { label: '🐦 Twitter - Public Messages', value: 'setup_twitter' },
              { label: '🤫 Anon - Anonymous Messages', value: 'setup_anon' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Roleplay Commands Setup**\n\nSelect a command to configure:',
        components: [menu],
      });
    } else if (customId === 'back_to_priority_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('priority_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Set Priority Channel', value: 'set_channel' },
              { label: 'Set Priority Role', value: 'set_role' },
              { label: 'Set Cooldown Duration', value: 'set_cooldown' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Priority Tracker Setup**\n\nSelect an option below to configure:',
        components: [menu],
      });
    } else if (customId === 'back_to_verify_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('verify_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Select Verify Channel', value: 'select_verify_channel' },
              { label: 'Select Welcome Channel', value: 'select_welcome_channel' },
              { label: 'Select Unverified Role', value: 'select_unverified_role' },
              { label: 'Select Verified Role', value: 'select_verified_role' },
              { label: 'Set RP Tag (Required)', value: 'set_rp_tag' },
              { label: 'Set Custom Question (Optional)', value: 'set_custom_question' },
              { label: 'Set DM Message (Optional)', value: 'set_dm_message' },
              { label: '✅ Done - Close Setup', value: 'verify_setup_done' }
            )
        );

      await interaction.update({
        content: '**Verification System Setup**\n\nSelect an option below to configure your verification system:',
        components: [menu],
      });
    } else if (customId === 'back_to_ticket_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticketsupport_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Customize Panel Title', value: 'panel_title' },
              { label: 'Customize Panel Description', value: 'panel_description' },
              { label: 'Select Panel Channel', value: 'select_channel' },
              { label: 'Add Ticket Type', value: 'add_type' },
              { label: 'View Ticket Types', value: 'view_types' },
              { label: 'Remove Ticket Type', value: 'remove_type' },
              { label: 'Send Panel', value: 'send_panel' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Ticket Support Setup**\n\nSelect an option below to configure your ticket system:',
        components: [menu],
      });
    } else if (customId === 'back_to_cad_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cadsystem_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Set LEO Roles', value: 'set_leo_roles' },
              { label: 'Set Fire Department Roles', value: 'set_fd_roles' },
              { label: 'Set Staff Roles', value: 'set_staff_roles' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**CAD System Setup**\n\nConfigure which roles have access to CAD features:',
        components: [menu],
      });
    } else if (customId === 'back_to_leo_menu') {
      // Return to main LEO database menu
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('leodatabase_menu')
            .setPlaceholder('Choose an option...')
            .addOptions(
              { label: '🚔 Search License Plate', value: 'search_plate' },
              { label: '🔍 Search Character', value: 'search_character' },
              { label: '🚨 Active 911 Calls', value: 'active_calls' },
              { label: '🚨 WANTED List', value: 'wanted_list' },
              { label: '🔫 Revoke Weapon', value: 'revoke_weapon' },
              { label: '📋 Create Traffic Ticket', value: 'create_ticket' },
              { label: '🎯 Create BOLO', value: 'create_bolo' }
            )
        );

      await interaction.update({
        content: '**LEO DATABASE**\n\nSelect an option:',
        components: [menu],
      });
    } else if (customId === 'back_to_civilian_menu') {
      // Return to main civilian database menu
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('civiliandatabase_menu')
            .setPlaceholder('Choose an option...')
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
        content: '**CIVILIAN DATABASE**\n\nSelect an option:',
        components: [menu],
      });
    } else if (customId === 'back_to_calendar_menu') {
      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('roleplay_calendar_setup_menu')
            .setPlaceholder('Choose a setup option...')
            .addOptions(
              { label: 'Set Calendar Channel', value: 'set_channel' },
              { label: 'Add Weekly Event', value: 'add_event' },
              { label: 'Remove Weekly Event', value: 'remove_event' },
              { label: 'View Events', value: 'view_events' },
              { label: '✅ Done - Close Setup', value: 'setup_done' }
            )
        );

      await interaction.update({
        content: '**Roleplay Calendar Setup**\n\nSelect an option below to configure:',
        components: [menu],
      });
    }
  } catch (error) {
    console.error('Error going back to menu:', error);
    await interaction.update({
      content: 'Error returning to menu.',
      components: [],
    });
  }
}
