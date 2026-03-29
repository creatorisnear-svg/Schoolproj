import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Verification from '../models/Verification.js';
import Welcome from '../models/Welcome.js';
import Config from '../models/Config.js';
import { StrikeConfig } from '../models/Strike.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

function menuEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'EverLink' });
}

function createSetupMenu() {
  const steps = [
    { id: 'select_verify_channel', label: 'Verify Channel', description: 'Required — where members submit verification' },
    { id: 'select_verified_role', label: 'Verified Role', description: 'Required — role granted on approval' },
    { id: 'select_unverified_role', label: 'Unverified Role', description: 'Required — role before verification' },
    { id: 'select_verified_channels', label: 'Verified Channels', description: 'Required — channels unlocked after verify' },
    { id: 'set_custom_question', label: 'Custom Question', description: 'Optional — question shown to applicants' },
    { id: 'delete_custom_question', label: 'Remove Custom Question', description: 'Optional — clear the custom question' },
    { id: 'toggle_approval_required', label: 'Toggle Staff Approval', description: 'Optional — require staff to approve' },
    { id: 'set_rp_tag', label: 'RP Tag', description: 'Optional — tag added to verified nicknames' },
    { id: 'verify_setup_done', label: '✓ Finish Setup', description: 'Close the setup menu' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('verify_setup_menu')
        .setPlaceholder('Select an option...')
        .addOptions(steps.map(step => ({ label: step.label, value: step.id, description: step.description })))
    );

  return {
    embeds: [menuEmbed('Verification Setup', 'Configure how members verify and what happens once they do. At minimum, set the verify channel and verified role.')],
    content: '',
    components: [menu],
    flags: 64
  };
}

function createWelcomeSetupMenu() {
  const steps = [
    { id: 'select_welcome_channel_setup', label: 'Welcome Channel', description: 'Channel where welcome messages are posted' },
    { id: 'set_welcome_message_setup', label: 'Welcome Message', description: 'Message posted when a member joins' },
    { id: 'set_welcome_dm_setup', label: 'Welcome DM', description: 'DM sent directly to the new member' },
    { id: 'welcome_setup_done', label: '✓ Finish Setup', description: 'Close the setup menu' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('welcome_setup_menu')
        .setPlaceholder('Select an option...')
        .addOptions(steps.map(step => ({ label: step.label, value: step.id, description: step.description })))
    );

  return {
    embeds: [menuEmbed('Welcome System Setup', 'Set a welcome channel, customize the server greeting, and optionally send a DM to new members.')],
    content: '',
    components: [menu],
    flags: 64
  };
}

function createStrikeSetupMenu() {
  const steps = [
    { id: 'strike_set_roles', label: 'Set Strike Level Roles (Optional)' },
    { id: 'strike_set_actions', label: 'Set Strike Actions (Kick/Timeout/Ban)' },
    { id: 'strike_setup_done', label: '✓ Finish Setup' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('strike_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return {
    embeds: [menuEmbed('Strike System Setup', 'Configure strike roles and what actions are taken at each strike level (kick, timeout, ban).')],
    content: '',
    components: [menu],
    flags: 64
  };
}

export async function handleSelectMenu(interaction) {
  const { customId } = interaction;

  if (interaction.customId === 'reactionrole_main_menu') {
    await handleReactionRoleMainMenu(interaction);
  }

  if (interaction.customId === 'reactionrole_send_channel_select') {
    await handleReactionRoleSendChannel(interaction);
  }

  if (interaction.customId.startsWith('reactionrole_role_select_')) {
    await handleReactionRoleSelect(interaction);
  }

  if (interaction.customId === 'setlogchannel_select') {
    await handleSetLogChannel(interaction);
  }

  if (interaction.customId === 'verify_setup_menu') {
    await handleVerifySetupMenu(interaction);
  }
  
  if (interaction.customId === 'select_verify_channel_menu') {
    await handleVerifyChannelSelect(interaction);
  }
  
  if (interaction.customId === 'select_welcome_channel_menu') {
    await handleWelcomeChannelSelect(interaction);
  }

  if (interaction.customId === 'select_verified_channels_menu') {
    await handleVerifiedChannelsSelect(interaction);
  }
  
  if (interaction.customId === 'select_unverified_role_menu') {
    await handleUnverifiedRoleSelect(interaction);
  }
  
  if (interaction.customId === 'select_verified_role_menu') {
    await handleVerifiedRoleSelect(interaction);
  }

  if (interaction.customId === 'select_verified_channels_menu') {
    await handleVerifiedChannelsSelect(interaction);
  }

  if (interaction.customId === 'select_approval_channel_menu') {
    await handleApprovalChannelSelect(interaction);
  }

  if (interaction.customId === 'welcome_channel_select') {
    await handleWelcomeSystemChannelSelect(interaction);
  }

  if (interaction.customId === 'welcome_setup_menu') {
    await handleWelcomeSetupMenu(interaction);
  }

  if (interaction.customId === 'select_welcome_channel_setup_menu') {
    await handleWelcomeSetupChannelSelect(interaction);
  }

  if (interaction.customId === 'strike_setup_menu') {
    await handleStrikeSetupMenu(interaction);
  }

  if (interaction.customId === 'strike_roles_select_1') {
    await handleStrikeRoleSelect(interaction, 1);
  }

  if (interaction.customId === 'strike_roles_select_2') {
    await handleStrikeRoleSelect(interaction, 2);
  }

  if (interaction.customId === 'strike_roles_select_3') {
    await handleStrikeRoleSelect(interaction, 3);
  }

  if (interaction.customId === 'strike_roles_select_4') {
    await handleStrikeRoleSelect(interaction, 4);
  }

  if (interaction.customId === 'strike_action_select_1') {
    await handleStrikeActionSelect(interaction, 1);
  }

  if (interaction.customId === 'strike_action_select_2') {
    await handleStrikeActionSelect(interaction, 2);
  }

  if (interaction.customId === 'strike_action_select_3') {
    await handleStrikeActionSelect(interaction, 3);
  }

  if (interaction.customId === 'strike_action_select_4') {
    await handleStrikeActionSelect(interaction, 4);
  }

  if (interaction.customId === 'antipromotingsetup_menu') {
    await handleAntiPromotingSetupMenu(interaction);
  }

  if (interaction.customId === 'antipromotingsetup_remove_link') {
    await handleAntiPromotingRemoveLink(interaction);
  }

  if (interaction.customId === 'stickylist_delete_menu') {
    await handleStickyListDelete(interaction);
  }

  if (interaction.customId === 'status_main_menu') {
    await handleStatusMainMenu(interaction);
  }

  if (interaction.customId === 'status_heartbeat_channel_select') {
    await handleStatusChannelSelect(interaction);
  }

  if (interaction.customId.startsWith('ticket_create_')) {
    const { handleTicketCreation } = await import('./ticketHandler.js');
    return await handleTicketCreation(interaction);
  }

  if (interaction.customId === 'approval_toggle_yes') {
    await handleApprovalToggle(interaction, true);
  }

  if (interaction.customId === 'approval_toggle_no') {
    await handleApprovalToggle(interaction, false);
  }

  if (interaction.customId.startsWith('verify_approve_')) {
    await handleVerificationApprove(interaction);
  }

  if (interaction.customId.startsWith('verify_reject_')) {
    await handleVerificationReject(interaction);
  }

  if (interaction.customId === 'delete_custom_question_menu') {
    await handleDeleteCustomQuestion(interaction);
  }

  // Back navigation buttons
  if (customId.startsWith('back_to_')) {
    const { handleBackToMenu } = await import('./setupMenuHandler.js');
    return handleBackToMenu(interaction);
  }

  // Emergency 911 buttons
  if (customId.startsWith('911_respond_')) {
    const { handle911RespondButton } = await import('./emergencyButtonHandler.js');
    return handle911RespondButton(interaction);
  }
  if (customId.startsWith('911_attach_')) {
    const { handle911AttachButton } = await import('./emergencyButtonHandler.js');
    return handle911AttachButton(interaction);
  }
  if (customId.startsWith('911_dismiss_')) {
    const { handle911DismissButton } = await import('./emergencyButtonHandler.js');
    return handle911DismissButton(interaction);
  }

  // Role request buttons
  if (customId.startsWith('approve_rolereq_')) {
    const { handleApproveRoleRequest } = await import('./roleRequestHandler.js');
    return handleApproveRoleRequest(interaction);
  }
  if (customId.startsWith('deny_rolereq_')) {
    const { handleDenyRoleRequest } = await import('./roleRequestHandler.js');
    return handleDenyRoleRequest(interaction);
  }
  if (customId.startsWith('skip_approver_roles_')) {
    const { handleSkipApproverRoles } = await import('./roleRequestHandler.js');
    return handleSkipApproverRoles(interaction);
  }
  if (customId.startsWith('skip_approver_members_')) {
    const { handleSkipApproverMembers } = await import('./roleRequestHandler.js');
    return handleSkipApproverMembers(interaction);
  }

  // Ticket buttons
  if (customId.startsWith('ticket_close_')) {
    const { handleTicketCloseButton } = await import('./ticketHandler.js');
    return handleTicketCloseButton(interaction);
  }
  if (customId.startsWith('ticket_delete_')) {
    const { handleTicketDeleteButton } = await import('./ticketHandler.js');
    return handleTicketDeleteButton(interaction);
  }
  if (customId.startsWith('ticketsupport_add_botstaff_')) {
    const { handleAddBotStaffButton } = await import('./ticketHandler.js');
    return handleAddBotStaffButton(interaction);
  }
  if (customId.startsWith('ticketsupport_roles_done_')) {
    const { handleRolesDoneButton } = await import('./ticketHandler.js');
    return handleRolesDoneButton(interaction);
  }

  // CAD character buttons (extract characterId from customId)
  if (customId.startsWith('char_continue_')) {
    const characterId = customId.replace('char_continue_', '');
    const { handleCharacterContinue } = await import('./cadHandler.js');
    return handleCharacterContinue(interaction, characterId);
  }
  if (customId.startsWith('char_license_valid_')) {
    const characterId = customId.replace('char_license_valid_', '');
    const { handleCharacterLicenseValid } = await import('./cadHandler.js');
    return handleCharacterLicenseValid(interaction, characterId);
  }
  if (customId.startsWith('char_license_invalid_')) {
    const characterId = customId.replace('char_license_invalid_', '');
    const { handleCharacterLicenseInvalid } = await import('./cadHandler.js');
    return handleCharacterLicenseInvalid(interaction, characterId);
  }
  if (customId.startsWith('char_veteran_')) {
    const characterId = customId.replace('char_veteran_', '');
    const { handleCharacterVeteran } = await import('./cadHandler.js');
    return handleCharacterVeteran(interaction, characterId);
  }
  if (customId.startsWith('char_organ_donor_')) {
    const characterId = customId.replace('char_organ_donor_', '');
    const { handleCharacterOrganDonor } = await import('./cadHandler.js');
    return handleCharacterOrganDonor(interaction, characterId);
  }
  if (customId.startsWith('char_status_none_')) {
    const characterId = customId.replace('char_status_none_', '');
    const { handleCharacterStatusNone } = await import('./cadHandler.js');
    return handleCharacterStatusNone(interaction, characterId);
  }

  // Enable/disable command buttons
  if (customId.startsWith('enable_')) {
    const { handleEnableCommandButton } = await import('./enableCommandsHandler.js');
    return handleEnableCommandButton(interaction);
  }
  if (customId.startsWith('disable_')) {
    const { handleDisableCommandButton } = await import('./enableCommandsHandler.js');
    return handleDisableCommandButton(interaction);
  }

  // Ticket setup select menus
  if (customId === 'ticketsupport_setup_menu') {
    const { handleTicketSetupMenu } = await import('./ticketHandler.js');
    return handleTicketSetupMenu(interaction);
  }
  if (customId === 'ticketsupport_panel_channel') {
    const { handleTicketChannelSelect } = await import('./ticketHandler.js');
    return handleTicketChannelSelect(interaction);
  }
  if (customId.startsWith('ticketsupport_type_button_color_')) {
    const { handleTicketTypeButtonColor } = await import('./ticketHandler.js');
    return handleTicketTypeButtonColor(interaction);
  }
  if (customId.startsWith('ticketsupport_type_roles_')) {
    const { handleTicketRoleSelect } = await import('./ticketHandler.js');
    return handleTicketRoleSelect(interaction);
  }
  if (customId === 'ticketsupport_remove_type_select') {
    const { handleRemoveTicketType } = await import('./ticketHandler.js');
    return handleRemoveTicketType(interaction);
  }
  if (customId === 'ticketsupport_panel_types_select') {
    const { handlePanelTypesSelect } = await import('./ticketHandler.js');
    return handlePanelTypesSelect(interaction);
  }

  // Role request select menus
  if (customId === 'rolerequest_setup_menu') {
    const { handleRoleRequestSetupMenu } = await import('./roleRequestHandler.js');
    return handleRoleRequestSetupMenu(interaction);
  }
  if (customId === 'select_role_for_request') {
    const { handleSelectRoleForRequest } = await import('./roleRequestHandler.js');
    return handleSelectRoleForRequest(interaction);
  }
  if (customId.startsWith('select_approver_roles_')) {
    const { handleSelectApproverRoles } = await import('./roleRequestHandler.js');
    return handleSelectApproverRoles(interaction);
  }
  if (customId.startsWith('select_approver_members_')) {
    const { handleSelectApproverMembers } = await import('./roleRequestHandler.js');
    return handleSelectApproverMembers(interaction);
  }
  if (customId === 'delete_rolerequest_type_select') {
    const { handleDeleteRoleRequestType } = await import('./roleRequestHandler.js');
    return handleDeleteRoleRequestType(interaction);
  }
  if (customId === 'rolerequest_main_menu') {
    const { handleSelectRoleToRequest } = await import('./roleRequestHandler.js');
    return handleSelectRoleToRequest(interaction);
  }
  if (customId === 'manage_rolereq_type_select') {
    const { handleManageRoleSelect } = await import('./roleRequestHandler.js');
    return handleManageRoleSelect(interaction);
  }
  if (customId.startsWith('remove_role_from_member_')) {
    const { handleRemoveRoleFromMember } = await import('./roleRequestHandler.js');
    return handleRemoveRoleFromMember(interaction);
  }
  if (customId.startsWith('select_approver_')) {
    const { handleSelectApprover } = await import('./roleRequestHandler.js');
    return handleSelectApprover(interaction);
  }

  // Priority tracker
  if (customId === 'prioritytrackersetup_channel_select') {
    const { handlePriorityTrackerChannelSelect } = await import('./priorityTrackerHandler.js');
    return handlePriorityTrackerChannelSelect(interaction);
  }

  // CAD setup select menus
  if (customId === 'cadsystem_setup_menu') {
    const { handleCADSetupMenu } = await import('./cadHandler.js');
    return handleCADSetupMenu(interaction);
  }
  if (customId === 'cadsystem_leo_roles') {
    const { handleCADLeoRoles } = await import('./cadHandler.js');
    return handleCADLeoRoles(interaction);
  }
  if (customId === 'cadsystem_fd_roles') {
    const { handleCADFDRoles } = await import('./cadHandler.js');
    return handleCADFDRoles(interaction);
  }
  if (customId === 'cadsystem_staff_roles') {
    const { handleCADStaffRoles } = await import('./cadHandler.js');
    return handleCADStaffRoles(interaction);
  }
  if (customId === 'cadcharacter_select_for_vehicle') {
    const { handleCADVehicleCharacterSelect } = await import('./cadHandler.js');
    return handleCADVehicleCharacterSelect(interaction);
  }
  if (customId === 'cadcharacter_select_for_gun') {
    const { handleCADGunCharacterSelect } = await import('./cadHandler.js');
    return handleCADGunCharacterSelect(interaction);
  }

  // Civilian database
  if (customId === 'civilian_database_menu') {
    const { handleCivilianDatabaseMenu } = await import('./civilianDatabaseHandler.js');
    return handleCivilianDatabaseMenu(interaction);
  }
  if (customId === 'civilian_manage_character_select') {
    const { handleCivilianManageCharacterSelect } = await import('./civilianDatabaseHandler.js');
    return handleCivilianManageCharacterSelect(interaction);
  }

  // Roleplay commands setup select menus
  if (customId === 'roleplaycommands_setup_menu') {
    const { handleRoleplayCommandsSetupMenu } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsSetupMenu(interaction);
  }
  if (customId === 'roleplaycommands_cad_setup_menu') {
    const { handleRoleplayCommandsCADSetupMenu } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsCADSetupMenu(interaction);
  }
  if (customId === 'roleplaycommands_emergency_setup_menu') {
    const { handleRoleplayCommandsEmergencySetupMenu } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEmergencySetupMenu(interaction);
  }
  if (customId === 'roleplaycommands_twitter_channel') {
    const { handleRoleplayCommandTwitterChannel } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandTwitterChannel(interaction);
  }
  if (customId === 'roleplaycommands_anon_channel') {
    const { handleRoleplayCommandAnonChannel } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandAnonChannel(interaction);
  }
  if (customId === 'roleplaycommands_emergency_911_channel') {
    const { handleRoleplayCommandsEmergency911Channel } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEmergency911Channel(interaction);
  }
  if (customId === 'roleplaycommands_emergency_leo_roles') {
    const { handleRoleplayCommandsEmergencyLEORoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEmergencyLEORoles(interaction);
  }
  if (customId === 'roleplaycommands_emergency_fd_roles') {
    const { handleRoleplayCommandsEmergencyFDRoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEmergencyFDRoles(interaction);
  }
  if (customId === 'roleplaycommands_emergency_staff_roles') {
    const { handleRoleplayCommandsEmergencyStaffRoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEmergencyStaffRoles(interaction);
  }
  if (customId === 'roleplaycommands_cad_leo_roles') {
    const { handleRoleplayCommandsCADLeoRoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsCADLeoRoles(interaction);
  }
  if (customId === 'roleplaycommands_cad_fd_roles') {
    const { handleRoleplayCommandsCADFDRoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsCADFDRoles(interaction);
  }
  if (customId === 'roleplaycommands_cad_staff_roles') {
    const { handleRoleplayCommandsCADStaffRoles } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsCADStaffRoles(interaction);
  }
  if (customId === 'roleplaycommands_enable_menu') {
    const { handleRoleplayCommandsEnableMenu } = await import('./roleplayCommandsHandler.js');
    return handleRoleplayCommandsEnableMenu(interaction);
  }

  // Enable/disable choice buttons from /enablecommands
  if (customId === 'choice_enable' || customId === 'choice_disable' || customId === 'choice_done') {
    const { handleEnableChoiceButton } = await import('./enableCommandsHandler.js');
    return handleEnableChoiceButton(interaction);
  }

  // Civilian database (command sends 'civiliandatabase_menu')
  if (customId === 'civiliandatabase_menu') {
    const { handleCivilianDatabaseMenu } = await import('./civilianDatabaseHandler.js');
    return handleCivilianDatabaseMenu(interaction);
  }

  // LEO database main menu and buttons
  if (customId === 'leodatabase_menu') {
    const { handleLEODatabaseMenu } = await import('./leoDatabaseHandler.js');
    return handleLEODatabaseMenu(interaction);
  }
  if (customId === 'leodatabase_respond_call') {
    const { handleLEORespondCall } = await import('./leoDatabaseHandler.js');
    return handleLEORespondCall(interaction);
  }
  if (customId === 'leo_manage_bolos_select') {
    const { handleLEOManageBolosSelect } = await import('./leoDatabaseHandler.js');
    return handleLEOManageBolosSelect(interaction);
  }
  if (customId.startsWith('leo_respond_primary_')) {
    const { handleLEOPrimaryResponse } = await import('./leoDatabaseHandler.js');
    return handleLEOPrimaryResponse(interaction);
  }
  if (customId.startsWith('leo_respond_attach_')) {
    const { handleLEOAttachResponse } = await import('./leoDatabaseHandler.js');
    return handleLEOAttachResponse(interaction);
  }
  if (customId.startsWith('leo_delete_bolo_')) {
    const { handleLEODeleteBOLO } = await import('./leoDatabaseHandler.js');
    return handleLEODeleteBOLO(interaction);
  }
  if (customId.startsWith('view_char_profile_')) {
    const { handleLEOViewCharacterProfile } = await import('./leoDatabaseHandler.js');
    return handleLEOViewCharacterProfile(interaction);
  }

  // Fire Department database main menu and buttons
  if (customId === 'firedepartmentdatabase_menu') {
    const { handleFireDepartmentMenu } = await import('./fireDepartmentHandler.js');
    return handleFireDepartmentMenu(interaction);
  }
  if (customId === 'fd_respond_call') {
    const { handleFDRespondCall } = await import('./fireDepartmentHandler.js');
    return handleFDRespondCall(interaction);
  }
  if (customId === 'fd_vehicle_character_select') {
    const { handleFDVehicleCharacterSelect } = await import('./fireDepartmentHandler.js');
    return handleFDVehicleCharacterSelect(interaction);
  }
  if (customId.startsWith('fd_respond_primary_')) {
    const { handleFDPrimaryResponse } = await import('./fireDepartmentHandler.js');
    return handleFDPrimaryResponse(interaction);
  }
  if (customId.startsWith('fd_respond_attach_')) {
    const { handleFDAttachResponse } = await import('./fireDepartmentHandler.js');
    return handleFDAttachResponse(interaction);
  }

  // Priority tracker setup channel (command uses 'prioritytrackersetup_channel')
  if (customId === 'prioritytrackersetup_channel') {
    const { handlePriorityTrackerChannelSelect } = await import('./priorityTrackerHandler.js');
    return handlePriorityTrackerChannelSelect(interaction);
  }

  // Roleplay calendar setup channel
  if (customId === 'roleplaycalendarsetup_channel') {
    const { handleRoleplayCalendarChannelSelect } = await import('./roleplayCalendarHandler.js');
    return handleRoleplayCalendarChannelSelect(interaction);
  }

  // Unset RP event select
  if (customId === 'unsetrp_select') {
    const { handleUnsetRpSelect } = await import('./roleplayCalendarHandler.js');
    return handleUnsetRpSelect(interaction);
  }

  // Role request: member selecting a role to request
  if (customId === 'select_role_to_request') {
    const { handleSelectRoleToRequest } = await import('./roleRequestHandler.js');
    return handleSelectRoleToRequest(interaction);
  }

  // Manage roles: approver selecting which role to manage
  if (customId === 'manage_role_select') {
    const { handleManageRoleSelect } = await import('./roleRequestHandler.js');
    return handleManageRoleSelect(interaction);
  }

  // Character edit / delete buttons (extract characterId from customId)
  if (customId.startsWith('char_edit_')) {
    const characterId = customId.replace('char_edit_', '');
    const { handleCharacterEdit } = await import('./civilianDatabaseHandler.js');
    return handleCharacterEdit(interaction, characterId);
  }
  if (customId.startsWith('char_delete_confirm_')) {
    const characterId = customId.replace('char_delete_confirm_', '');
    const { handleCharacterDeleteConfirm } = await import('./civilianDatabaseHandler.js');
    return handleCharacterDeleteConfirm(interaction, characterId);
  }
  if (customId.startsWith('char_delete_') && !customId.startsWith('char_delete_confirm_')) {
    const characterId = customId.replace('char_delete_', '');
    const { handleCharacterDelete } = await import('./civilianDatabaseHandler.js');
    return handleCharacterDelete(interaction, characterId);
  }
  if (customId === 'char_delete_cancel') {
    return interaction.update({ content: 'Character deletion cancelled.', components: [], embeds: [] });
  }

  // Dev panel select menus (dev_select_*)
  if (customId.startsWith('dev_select_')) {
    const { handleDevSelect } = await import('./devHandler.js');
    return handleDevSelect(interaction);
  }

  // Priority tracker setup menu (shown via back_to_priority_menu)
  if (customId === 'priority_setup_menu') {
    return handlePrioritySetupMenu(interaction);
  }

  // Roleplay calendar setup menu (shown via back_to_calendar_menu)
  if (customId === 'roleplay_calendar_setup_menu') {
    return handleRoleplayCalendarSetupMenu(interaction);
  }

  // Dispatch setup menu
  if (customId === 'dispatch_setup_menu') {
    return handleDispatchSetupMenu(interaction);
  }
  if (customId === 'dispatch_text_channel_select') {
    return handleDispatchTextChannelSelect(interaction);
  }
  if (customId === 'dispatch_status_channel_select') {
    return handleDispatchStatusChannelSelect(interaction);
  }
  if (customId === 'dispatch_patrol_channel_select') {
    return handleDispatchPatrolChannelSelect(interaction);
  }
  if (customId === 'dispatch_stop_channel_select') {
    return handleDispatchStopChannelSelect(interaction);
  }
  if (customId === 'dispatch_remove_patrol_select') {
    return handleDispatchRemovePatrolSelect(interaction);
  }
  if (customId === 'dispatch_remove_stop_select') {
    return handleDispatchRemoveStopSelect(interaction);
  }

}

async function handlePrioritySetupMenu(interaction) {
  const choice = interaction.values[0];
  try {
    if (choice === 'set_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('prioritytrackersetup_channel')
        .setPlaceholder('Select the priority tracker channel...')
        .setChannelTypes(ChannelType.GuildText);
      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('back_to_priority_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({
        embeds: [infoEmbed('Priority Tracker — Channel', 'Select the channel where the priority tracker panel will be posted.')],
        content: '',
        components: [row, backButton],
      });
    }
    if (choice === 'set_cooldown') {
      return interaction.update({
        embeds: [infoEmbed('Set Cooldown', 'Use the `/prioritycooldown` command to set and manage the priority cooldown directly.')],
        content: '',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('back_to_priority_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
        )],
      });
    }
    if (choice === 'setup_done') {
      return interaction.update({
        embeds: [infoEmbed('Priority Tracker Setup', 'Setup complete. Use `/activepriority` and `/deactivatepriority` to manage the tracker.')],
        content: '',
        components: [],
      });
    }
    return interaction.deferUpdate().catch(() => {});
  } catch (error) {
    console.error('Error in priority setup menu:', error);
  }
}

async function handleRoleplayCalendarSetupMenu(interaction) {
  const choice = interaction.values[0];
  try {
    const RoleplayCalendar = (await import('../models/RoleplayCalendar.js')).default;
    const calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId });

    if (choice === 'set_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycalendarsetup_channel')
        .setPlaceholder('Select the calendar channel...')
        .setChannelTypes(ChannelType.GuildText);
      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({
        embeds: [infoEmbed('Roleplay Calendar — Channel', 'Select the channel where the calendar will be posted and kept up to date.')],
        content: '',
        components: [row, backButton],
      });
    }
    if (choice === 'add_event') {
      return interaction.update({
        embeds: [infoEmbed('Add Event', 'Use the `/setrp` command to add a new weekly event to the roleplay calendar.')],
        content: '',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
        )],
      });
    }
    if (choice === 'remove_event') {
      if (!calendar || calendar.events.length === 0) {
        return interaction.update({
          embeds: [infoEmbed('No Events', 'There are no scheduled events to remove.')],
          content: '',
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
          )],
        });
      }
      const options = calendar.events.map((event, index) => ({
        label: `${event.day} — ${event.person} (${event.time})`,
        value: `event_${index}`,
        description: (event.description || '').substring(0, 100),
      }));
      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('unsetrp_select')
          .setPlaceholder('Select an event to remove...')
          .addOptions(options)
      );
      const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({
        embeds: [infoEmbed('Remove Event', 'Select the event you want to remove from the calendar.')],
        content: '',
        components: [selectRow, backButton],
      });
    }
    if (choice === 'view_events') {
      if (!calendar || calendar.events.length === 0) {
        return interaction.update({
          embeds: [infoEmbed('Roleplay Calendar', 'No events are currently scheduled.')],
          content: '',
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
          )],
        });
      }
      const eventList = calendar.events.map(e =>
        `**${e.day}** — ${e.person} at ${e.time} (${e.timezone})`
      ).join('\n');
      return interaction.update({
        embeds: [infoEmbed('Scheduled Events', eventList)],
        content: '',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('back_to_calendar_menu').setLabel('← Back').setStyle(ButtonStyle.Secondary)
        )],
      });
    }
    if (choice === 'setup_done') {
      return interaction.update({
        embeds: [infoEmbed('Calendar Setup', 'Setup complete. Use `/setrp` and `/unsetrp` to manage events.')],
        content: '',
        components: [],
      });
    }
    return interaction.deferUpdate().catch(() => {});
  } catch (error) {
    console.error('Error in roleplay calendar setup menu:', error);
  }
}

async function handleVerifySetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_verify_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_verify_channel_menu')
        .setPlaceholder('Select the verify channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the channel where users can verify:',
        components: [row, backButton],
      });
    }


    if (choice === 'select_unverified_role') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_unverified_role_menu')
        .setPlaceholder('Select the unverified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the role that unverified members will receive when they join:',
        components: [row, backButton],
      });
    }

    if (choice === 'select_verified_role') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_verified_role_menu')
        .setPlaceholder('Select the verified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the role that verified members will receive:',
        components: [row, backButton],
      });
    }

    if (choice === 'set_custom_question') {
      const modal = new ModalBuilder()
        .setCustomId('setup_custom_question_modal')
        .setTitle('Add Custom Question');

      const input = new TextInputBuilder()
        .setCustomId('custom_question_input')
        .setLabel('Enter your custom question')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g., What is your character backstory?')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'delete_custom_question') {
      try {
        const { ButtonBuilder, ButtonStyle } = await import('discord.js');
        let verification = await Verification.findOne({ guildId: interaction.guildId });
        
        // Ensure customQuestions is initialized for older documents
        if (verification && !verification.customQuestions) {
          verification.customQuestions = [];
        }
        
        if (!verification || !verification.customQuestions || verification.customQuestions.length === 0) {
          return interaction.update({
            embeds: [errorEmbed('No custom questions found.')],
            components: [],
          });
        }
        
        const options = verification.customQuestions.map((question, index) => ({
          label: `${index + 1}. ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`,
          value: `delete_question_${index}`,
        }));

        const menu = new StringSelectMenuBuilder()
          .setCustomId('delete_custom_question_menu')
          .setPlaceholder('Select a question to delete...')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);
        const backButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('back_to_verify_menu')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary)
          );

        return interaction.update({
          content: 'Select a custom question to delete:',
          components: [row, backButton],
        });
      } catch (error) {
        console.error('Error deleting custom question:', error);
        return interaction.reply({
          embeds: [errorEmbed('An error occurred while deleting the question.')],
          flags: 64,
        });
      }
    }

    if (choice === 'select_verified_channels') {
      const categorySelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_verified_channels_menu')
        .setPlaceholder('Select categories verified members can see')
        .setChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(25);

      const row = new ActionRowBuilder().addComponents(categorySelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select which categories verified members should be able to see:',
        components: [row, backButton],
      });
    }

    if (choice === 'toggle_approval_required') {
      const approveButton = new ButtonBuilder()
        .setCustomId('approval_toggle_yes')
        .setLabel('✅ Enable Approval')
        .setStyle(ButtonStyle.Success);

      const rejectButton = new ButtonBuilder()
        .setCustomId('approval_toggle_no')
        .setLabel('❌ Disable Approval')
        .setStyle(ButtonStyle.Danger);

      const backButton = new ButtonBuilder()
        .setCustomId('back_to_verify_menu')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary);

      const row1 = new ActionRowBuilder().addComponents(approveButton, rejectButton);
      const row2 = new ActionRowBuilder().addComponents(backButton);

      return interaction.update({
        content: 'Do you want to require staff approval for verification?\n\n✅ **Enable**: Users submit verification, staff reviews and approves/rejects\n❌ **Disable**: Users are instantly verified',
        components: [row1, row2],
      });
    }

    if (choice === 'set_rp_tag') {
      const modal = new ModalBuilder()
        .setCustomId('setup_rp_tag_modal')
        .setTitle('Set RP Tag');

      const input = new TextInputBuilder()
        .setCustomId('rp_tag')
        .setLabel('Enter your server RP tag')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., SARP, CARP, LARP')
        .setRequired(false)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'verify_setup_done') {
      // Respond immediately, then apply permissions in background
      const menuData = createSetupMenu();
      await interaction.update({
        ...menuData,
        embeds: [successEmbed('✅ Verification system setup is complete!\n\n⏳ Automatically configuring channel permissions...\n\n• **Verified members** → Can see: All channels in selected categories + welcome\n• **Unverified members** → Can see: Verify channel + welcome\n• **Staff/Admins** → Can see: All channels\n\n✨ All channel permissions have been automatically configured based on your settings!')],
      });

      // Apply permissions in background (non-blocking)
      const verification = await Verification.findOne({ guildId: interaction.guildId });
      if (verification) {
        applyAllVerificationPermissions(interaction.guild, verification).catch(error => {
          console.error('Error applying verification permissions:', error);
        });
      }
    }
  } catch (error) {
    console.error('Error handling verify setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

export async function handleSetupModals(interaction) {
  const customId = interaction.customId;

  try {
    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    let welcome = await Welcome.findOne({ guildId: interaction.guildId });

    if (customId === 'setup_verify_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid text channel ID. Please try again.')],
          flags: 64,
        });
      }

      verification.verifyChannelId = channelId;
      await verification.save();

      const { ButtonBuilder, ActionRowBuilder: ARB, EmbedBuilder } = await import('discord.js');
      const verifyButton = new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Click Here to Verify')
        .setStyle(1);

      const verifyEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('✅ Server Verification')
        .setDescription('Click the button below to verify and access all member channels!')
        .setFooter({ text: 'EverLink' });

      await channel.send({
        embeds: [verifyEmbed],
        components: [new ARB().addComponents(verifyButton)],
      });

      return interaction.reply({
        embeds: [successEmbed(`Verify channel set to ${channel} and verification button sent!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid channel ID. Please try again.')],
          flags: 64,
        });
      }

      verification.welcomeChannelId = channelId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Welcome channel set to ${channel}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_unverified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          flags: 64,
        });
      }

      verification.unverifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Unverified role set to ${role}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_verified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          flags: 64,
        });
      }

      verification.verifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Verified role set to ${role}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_rp_tag_modal') {
      const rpTag = interaction.fields.getTextInputValue('rp_tag');
      verification.rpTag = rpTag;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('RP Tag Set', `Tag: ${rpTag}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_custom_question_modal') {
      const question = interaction.fields.getTextInputValue('custom_question_input');
      if (!question || question.trim().length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('Question cannot be empty.')],
          flags: 64,
        });
      }

      if (!verification.customQuestions) {
        verification.customQuestions = [];
      }
      
      if (!verification.customQuestions.includes(question)) {
        verification.customQuestions.push(question);
      }
      
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Custom Question Added', `Question: "${question}"\n\nTotal questions: ${verification.customQuestions.length}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_dm_message_modal') {
      const message = interaction.fields.getTextInputValue('message') || 'Welcome to our community! You have been verified and can now access all member channels.';
      verification.verifyDMMessage = message;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('DM Message Updated', 'Verification DM has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_message_modal') {
      const message = interaction.fields.getTextInputValue('welcome_message') || 'Welcome to the server, {user}! We\'re glad to have you here.';

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeMessage = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Welcome Message Updated', 'Channel message has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_dm_modal') {
      const message = interaction.fields.getTextInputValue('welcome_dm') || 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.';

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeDM = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Welcome DM Updated', 'Welcome DM has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    const strikeTimeoutMatch = customId.match(/setup_strike_timeout_(\d+)/);
    if (strikeTimeoutMatch) {
      const strikeLevel = parseInt(strikeTimeoutMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('timeout_duration'));

      if (isNaN(duration) || duration <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid positive number.')],
          flags: 64,
        });
      }

      let strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
      if (!strikeConfig) {
        strikeConfig = new StrikeConfig({ guildId: interaction.guildId });
      }

      const strikeKey = `strike${strikeLevel}`;
      strikeConfig.strikes[strikeKey].duration = duration;
      await strikeConfig.save();

      const menuOptions = createStrikeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Timeout Set`, `Duration: ${duration} minutes\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    const strikeBanMatch = customId.match(/setup_strike_ban_(\d+)/);
    if (strikeBanMatch) {
      const strikeLevel = parseInt(strikeBanMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('ban_duration'));

      if (isNaN(duration) || duration < 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid number (0 for permanent).')],
          flags: 64,
        });
      }

      let strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
      if (!strikeConfig) {
        strikeConfig = new StrikeConfig({ guildId: interaction.guildId });
      }

      const strikeKey = `strike${strikeLevel}`;
      strikeConfig.strikes[strikeKey].duration = duration;
      await strikeConfig.save();

      const menuOptions = createStrikeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Ban Set`, `Duration: ${duration === 0 ? 'Permanent' : duration + ' minutes'}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    // Ticket modals
    if (customId.startsWith('ticket_modal_') || customId.startsWith('ticketsupport_create_ticket_')) {
      const { handleTicketCreationModal } = await import('./ticketHandler.js');
      return handleTicketCreationModal(interaction);
    }
    if (customId === 'ticketsupport_panel_title_modal') {
      const { handlePanelTitleModal } = await import('./ticketHandler.js');
      return handlePanelTitleModal(interaction);
    }
    if (customId === 'ticketsupport_panel_description_modal') {
      const { handlePanelDescriptionModal } = await import('./ticketHandler.js');
      return handlePanelDescriptionModal(interaction);
    }
    if (customId === 'ticketsupport_add_type_modal') {
      const { handleTicketSetupModal } = await import('./ticketHandler.js');
      return handleTicketSetupModal(interaction);
    }

    // CAD modals
    if (customId === 'cadcharacter_create_modal') {
      const { handleCADCharacterCreateModal } = await import('./cadHandler.js');
      return handleCADCharacterCreateModal(interaction);
    }
    if (customId.startsWith('char_height_race_modal_')) {
      const characterId = customId.replace('char_height_race_modal_', '');
      const { handleCharacterHeightRaceModal } = await import('./cadHandler.js');
      return handleCharacterHeightRaceModal(interaction, characterId);
    }
    if (customId.startsWith('cadvehicle_add_modal_')) {
      const { handleCADVehicleAddModal } = await import('./cadHandler.js');
      return handleCADVehicleAddModal(interaction);
    }
    if (customId.startsWith('cadgun_add_modal_')) {
      const { handleCADGunAddModal } = await import('./cadHandler.js');
      return handleCADGunAddModal(interaction);
    }

    // Priority tracker modal
    if (customId === 'prioritytrackersetup_message') {
      const { handlePriorityTrackerMessageModal } = await import('./priorityTrackerHandler.js');
      return handlePriorityTrackerMessageModal(interaction);
    }

    // 911 report and civilian roleplay modals
    if (customId === '911report') {
      const { handle911ReportModal } = await import('./roleplayCommandsHandler.js');
      return handle911ReportModal(interaction);
    }
    if (customId === 'twitter_post_modal') {
      const { handleTwitterPostModal } = await import('./roleplayCommandsHandler.js');
      return handleTwitterPostModal(interaction);
    }
    if (customId === 'anon_post_modal') {
      const { handleAnonPostModal } = await import('./roleplayCommandsHandler.js');
      return handleAnonPostModal(interaction);
    }

    // FD character create modal
    if (customId === 'fd_character_create_modal') {
      const { handleFDCharacterCreateModal } = await import('./fireDepartmentHandler.js');
      return handleFDCharacterCreateModal(interaction);
    }

    // FD vehicle add modal
    if (customId.startsWith('fd_vehicle_add_modal_')) {
      const { handleFDVehicleAddModal } = await import('./fireDepartmentHandler.js');
      return handleFDVehicleAddModal(interaction);
    }

    // LEO database modals
    if (customId === 'leodatabase_search_plate_modal') {
      const { handleLEOSearchPlateModal } = await import('./leoDatabaseHandler.js');
      return handleLEOSearchPlateModal(interaction);
    }
    if (customId === 'leodatabase_search_character_modal') {
      const { handleLEOSearchCharacterModal } = await import('./leoDatabaseHandler.js');
      return handleLEOSearchCharacterModal(interaction);
    }

    // Fall through to modalHandler for all remaining modals (reactionrole, antipromoting, status, leodatabase ticket/bolo/weapon, etc.)
    const { handleModalSubmit } = await import('./modalHandler.js');
    return handleModalSubmit(interaction);

  } catch (error) {
    console.error('Error handling setup modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleVerifyChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.verifyChannelId = channel.id;
    await verification.save();

    const { ButtonBuilder, ActionRowBuilder: ARB, EmbedBuilder } = await import('discord.js');
    const verifyButton = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Click Here to Verify')
      .setStyle(1);

    const verifyEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('✅ Server Verification')
      .setDescription('Click the button below to verify and access all member channels!')
      .setFooter({ text: 'EverLink' });

    await channel.send({
      embeds: [verifyEmbed],
      components: [new ARB().addComponents(verifyButton)],
    });

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Verify Channel Set', `Channel: ${channel}\n\nVerification button has been sent. Select your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting verify channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid channel.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.welcomeChannelId = channel.id;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: `✅ Welcome channel set to ${channel}!\n\n${menuOptions.content}`,
      components: menuOptions.components,
      embeds: [],
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleUnverifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.unverifiedRoleId = role.id;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Unverified Role Set', `Role: ${role}\n\nSelect your next option below to continue setup. Channel permissions will be applied when you finish setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting unverified role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function setVerificationChannelPermissions(guild, unverifiedRoleId, verification) {
  try {
    const { PermissionFlagsBits } = await import('discord.js');
    const verifyChannelId = verification.verifyChannelId;
    const welcomeChannelId = verification.welcomeChannelId;

    // Get all channels
    const allChannels = await guild.channels.fetch();

    for (const channel of allChannels.values()) {
      // Skip non-text channels
      if (!channel.isTextBased()) continue;

      // If this is the verify or welcome channel, allow viewing
      if (channel.id === verifyChannelId || channel.id === welcomeChannelId) {
        await channel.permissionOverwrites.edit(
          unverifiedRoleId,
          {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true,
          },
          { reason: 'Verification system - allow access to verify/welcome channels' }
        );
      } else {
        // Hide all other channels from unverified role
        await channel.permissionOverwrites.edit(
          unverifiedRoleId,
          {
            ViewChannel: false,
          },
          { reason: 'Verification system - restrict access to other channels' }
        );
      }
    }

    console.log(`Channel permissions configured for unverified role ${unverifiedRoleId}`);
  } catch (error) {
    console.error('Error setting channel permissions:', error);
  }
}

async function applyAllVerificationPermissions(guild, verification) {
  try {
    const allChannels = await guild.channels.fetch();

    // Get all admin/staff roles
    const adminRoles = guild.roles.cache.filter(role => role.permissions.has('Administrator'));
    const adminRoleIds = Array.from(adminRoles.keys());

    for (const channel of allChannels.values()) {
      // Skip non-text channels
      if (!channel.isTextBased()) continue;

      // 1. Configure unverified role (can ONLY see verify & welcome channels)
      if (verification.unverifiedRoleId) {
        const isWelcomeOrVerifyChannel = channel.id === verification.verifyChannelId || channel.id === verification.welcomeChannelId;
        
        if (isWelcomeOrVerifyChannel) {
          // Allow viewing only verify and welcome channels
          await channel.permissionOverwrites.edit(
            verification.unverifiedRoleId,
            {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              UseApplicationCommands: true,
            },
            { reason: 'Verification system - unverified access' }
          ).catch(() => {});
        } else {
          // Explicitly DENY all other channels for unverified
          await channel.permissionOverwrites.edit(
            verification.unverifiedRoleId,
            {
              ViewChannel: false,
              SendMessages: false,
              ReadMessageHistory: false,
            },
            { reason: 'Verification system - unverified restricted' }
          ).catch(() => {});
        }
      }

      // 2. Configure verified role (can ONLY view selected categories + welcome channel)
      if (verification.verifiedRoleId) {
        const isVerifiedCategory = verification.verifiedChannelIds && channel.parentId && verification.verifiedChannelIds.includes(channel.parentId);
        const isWelcomeChannel = channel.id === verification.welcomeChannelId;
        
        if (isVerifiedCategory || isWelcomeChannel) {
          // Only allow viewing, not sending messages
          await channel.permissionOverwrites.edit(
            verification.verifiedRoleId,
            {
              ViewChannel: true,
            },
            { reason: 'Verification system - verified view access' }
          ).catch(() => {});
        } else {
          await channel.permissionOverwrites.edit(
            verification.verifiedRoleId,
            {
              ViewChannel: false,
            },
            { reason: 'Verification system - verified restricted' }
          ).catch(() => {});
        }
      }

      // 3. Configure staff/admin roles (can see all channels)
      for (const adminRoleId of adminRoleIds) {
        await channel.permissionOverwrites.edit(
          adminRoleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            ManageMessages: true,
          },
          { reason: 'Verification system - staff full access' }
        ).catch(() => {});
      }
    }

    console.log(`All verification permissions configured for categories (unverified, verified, staff)`);
  } catch (error) {
    console.error('Error applying verification permissions:', error);
  }
}

export async function revertVerificationPermissions(guild, verification) {
  try {
    const allChannels = await guild.channels.fetch();

    for (const channel of allChannels.values()) {
      // Skip non-text channels
      if (!channel.isTextBased()) continue;

      // Remove unverified role overwrite
      if (verification.unverifiedRoleId) {
        await channel.permissionOverwrites.delete(
          verification.unverifiedRoleId,
          'Verification system disabled - reverting permissions'
        ).catch(() => {});
      }

      // Remove verified role overwrite
      if (verification.verifiedRoleId) {
        await channel.permissionOverwrites.delete(
          verification.verifiedRoleId,
          'Verification system disabled - reverting permissions'
        ).catch(() => {});
      }
    }

    console.log(`Verification role permissions reverted (unverified & verified roles)`);
  } catch (error) {
    console.error('Error reverting verification permissions:', error);
  }
}

async function handleVerifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.verifiedRoleId = role.id;
    await verification.save();

    // Return to setup menu
    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Verified Role Set', `Verified Role: ${role}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting verified role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleVerifiedChannelsSelect(interaction) {
  try {
    const selectedCategoryIds = interaction.values;

    if (!selectedCategoryIds || selectedCategoryIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Please select at least one category.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.verifiedChannelIds = selectedCategoryIds;
    await verification.save();

    const categoryMentions = selectedCategoryIds.map(id => {
      const channel = interaction.guild.channels.cache.get(id);
      return channel ? `📁 ${channel.name}` : 'Unknown';
    }).join('\n');
    
    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Verified Categories Set', `Verified members can now see all channels in:\n${categoryMentions}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting verified categories:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSystemChannelSelect(interaction) {
  try {
    const selectedChannelId = interaction.values[0];
    const channel = await interaction.guild.channels.fetch(selectedChannelId);

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let welcome = await Welcome.findOne({ guildId: interaction.guildId });
    
    if (welcome) {
      welcome.channelId = channel.id;
      await welcome.save();
    } else {
      await Welcome.create({
        guildId: interaction.guildId,
        channelId: channel.id,
      });
    }

    const embed = infoEmbed(
      '__**Welcome System**__',
      `✅ Welcome channel set to ${channel}!\n\n**Current Welcome Message:**\n${welcome?.welcomeMessage || 'Welcome to the server, {user}! We\'re glad to have you here.'}\n\n**Current Welcome DM:**\n${welcome?.welcomeDM || 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.'}\n\nUse \`/setwelcomemessage\` and \`/setwelcomedm\` to customize these messages.\n\n✨ New members will now see a profile picture embed with their welcome message!`
    );

    return interaction.update({
      embeds: [embed],
      components: [],
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_welcome_channel_setup') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_welcome_channel_setup_menu')
        .setPlaceholder('Select the welcome channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.update({
        content: 'Select the channel where welcome messages will be sent:',
        components: [row],
      });
    }

    if (choice === 'set_welcome_message_setup') {
      const modal = new ModalBuilder()
        .setCustomId('setup_welcome_message_modal')
        .setTitle('Set Welcome Message');

      const input = new TextInputBuilder()
        .setCustomId('welcome_message')
        .setLabel('Enter the welcome message for the channel')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Use {user} for mention and {server} for server name')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'set_welcome_dm_setup') {
      const modal = new ModalBuilder()
        .setCustomId('setup_welcome_dm_modal')
        .setTitle('Set Welcome DM');

      const input = new TextInputBuilder()
        .setCustomId('welcome_dm')
        .setLabel('Enter the welcome DM for new members')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Use {user} for username and {server} for server name')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'welcome_setup_done') {
      const menuData = createWelcomeSetupMenu();
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Welcome system setup is complete. Your welcome system is now active.')],
      });
    }
  } catch (error) {
    console.error('Error handling welcome setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
    config.antiPromotingEnabled = true;
    config.antiPromotingLogChannelId = channel.id;
    await config.save();

    return interaction.reply({
      embeds: [successEmbed('Anti-Promoting System Enabled', `Log channel: ${channel}\n\nThe anti-promoting system is now active. Invite links will be deleted and logged.`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error setting anti-promoting log channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleSetLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
    config.logChannelId = channel.id;
    await config.save();

    return interaction.update({
      content: '',
      embeds: [successEmbed('Log Channel Set', `Log channel has been set to ${channel}. You can now enable systems like anti-promoting and other features will log to this channel.`)],
      components: [],
    });
  } catch (error) {
    console.error('Error setting log channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSetupChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let welcome = await Welcome.findOne({ guildId: interaction.guildId }) || new Welcome({ guildId: interaction.guildId });
    welcome.channelId = channel.id;
    await welcome.save();

    const menuOptions = createWelcomeSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Welcome Channel Set', `Channel: ${channel}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'strike_set_roles') {
      let content = 'Select roles for each strike level (leave empty to skip):\n\n';
      const roleSelects = [];

      for (let i = 1; i <= 4; i++) {
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId(`strike_roles_select_${i}`)
          .setPlaceholder(`Select role for Strike ${i} (or skip)`);

        roleSelects.push(new ActionRowBuilder().addComponents(roleSelect));
      }

      return interaction.update({
        content: 'Select roles for strike levels 1-4. You can leave empty if you don\'t want a role for that level.',
        components: roleSelects,
      });
    }

    if (choice === 'strike_set_actions') {
      const actionMenus = [];

      for (let i = 1; i <= 4; i++) {
        const actionSelect = new StringSelectMenuBuilder()
          .setCustomId(`strike_action_select_${i}`)
          .setPlaceholder(`Choose action for Strike ${i}`)
          .addOptions(
            { label: 'No Action', value: 'none' },
            { label: 'Kick', value: 'kick' },
            { label: 'Timeout (mute)', value: 'timeout' },
            { label: 'Ban', value: 'ban' }
          );

        actionMenus.push(new ActionRowBuilder().addComponents(actionSelect));
      }

      return interaction.update({
        content: 'Select the action for each strike level (1-4):',
        components: actionMenus,
      });
    }

    if (choice === 'strike_setup_done') {
      const menuData = createStrikeSetupMenu();
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Strike System Configured', 'Your strike system is ready to use. Staff can now use `/strike` to strike members.')],
      });
    }
  } catch (error) {
    console.error('Error handling strike setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeRoleSelect(interaction, strikeLevel) {
  try {
    const roles = interaction.roles;

    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId }) || new StrikeConfig({ guildId: interaction.guildId });
    
    const strikeKey = `strike${strikeLevel}`;
    if (roles.size > 0) {
      const role = roles.first();
      strikeConfig.strikes[strikeKey].roleId = role.id;
    }

    await strikeConfig.save();

    const menuOptions = createStrikeSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed(`Strike ${strikeLevel} Role Set`, `Role: ${roles.size > 0 ? roles.first() : 'None selected'}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting strike role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeActionSelect(interaction, strikeLevel) {
  try {
    const action = interaction.values[0];

    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
    if (!strikeConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Strike system not configured. Please try again.')],
        flags: 64,
      });
    }

    const strikeKey = `strike${strikeLevel}`;
    strikeConfig.strikes[strikeKey].action = action;

    if (action === 'timeout') {
      const modal = new ModalBuilder()
        .setCustomId(`setup_strike_timeout_${strikeLevel}`)
        .setTitle(`Strike ${strikeLevel} Timeout Duration`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('timeout_duration')
              .setLabel('Timeout Duration (minutes)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 60')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    } else if (action === 'ban') {
      const modal = new ModalBuilder()
        .setCustomId(`setup_strike_ban_${strikeLevel}`)
        .setTitle(`Strike ${strikeLevel} Ban Duration`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ban_duration')
              .setLabel('Ban Duration (minutes, 0 = permanent)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 0 for permanent')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    } else {
      strikeConfig.strikes[strikeKey].duration = null;
      await strikeConfig.save();

      const actionLabel = action === 'none' ? 'No Action' : action.charAt(0).toUpperCase() + action.slice(1);
      const menuOptions = createStrikeSetupMenu();
      return interaction.update({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Action Set`, `Action: ${actionLabel}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
      });
    }
  } catch (error) {
    console.error('Error setting strike action:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleReactionRoleMainMenu(interaction) {
  const choice = interaction.values[0];

  if (choice === 'send_message') {
    const modal = new ModalBuilder()
      .setCustomId('reactionrole_send_message_modal')
      .setTitle('Send Reaction Role Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel('Message Content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., React to get a role!')
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (choice === 'add_emoji') {
    const modal = new ModalBuilder()
      .setCustomId('reactionrole_add_emoji_modal')
      .setTitle('Add Emoji to Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1234567890')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message_id')
            .setLabel('Message ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1234567890')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('emoji_input')
            .setLabel('Emoji')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 🎮')
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }
}

async function handleReactionRoleSendChannel(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  
  const channel = interaction.values[0];
  const messageContent = interaction.message.content.split('```')[1]?.trim() || 'React to get a role!';

  try {
    const targetChannel = await interaction.guild.channels.fetch(channel);

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a text channel.')],
        flags: 64,
      });
    }

    const sentMessage = await targetChannel.send(messageContent);

    await ReactionRole.create({
      guildId: interaction.guildId,
      messageId: sentMessage.id,
      channelId: channel,
      emojiRoles: [],
    });

    return interaction.update({
      content: `✅ Message sent to <#${channel}>\n\n**Channel ID:** \`${channel}\`\n**Message ID:** \`${sentMessage.id}\`\n\nRun \`/reactionrolemessage\` again and pick "Add Emoji" to add emoji-role pairs.`,
      components: [],
    });
  } catch (error) {
    console.error('Error sending reaction role message:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while sending the message.')],
      flags: 64,
    });
  }
}

async function handleReactionRoleSelect(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  const { pendingEmojiRoles } = await import('./modalHandler.js');
  
  const tempKey = interaction.customId.replace('reactionrole_role_select_', '');
  const pending = pendingEmojiRoles.get(tempKey);
  const roleId = interaction.values[0];

  if (!pending) {
    return interaction.reply({
      embeds: [errorEmbed('Session expired. Please try again.')],
      flags: 64,
    });
  }

  const { emoji, messageId, guildId } = pending;

  try {
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId,
    });

    if (!reactionRole) {
      pendingEmojiRoles.delete(tempKey);
      return interaction.reply({
        embeds: [errorEmbed('The reaction role message could not be found. The message may have been deleted. Please create a new message with /reactionrolemessage.')],
        flags: 64,
      });
    }

    // Add emoji-role pair
    reactionRole.emojiRoles.push({ emoji, roleId });
    await reactionRole.save();

    // Try to add reaction to message
    try {
      const channel = await interaction.guild.channels.fetch(reactionRole.channelId);
      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);
    } catch (err) {
      // Silently fail if we can't add the reaction
    }

    const role = await interaction.guild.roles.fetch(roleId);
    pendingEmojiRoles.delete(tempKey);
    
    return interaction.update({
      content: `✅ ${emoji} → ${role.name}`,
      components: [],
    });
  } catch (error) {
    console.error('Error in role select:', error);
    pendingEmojiRoles.delete(tempKey);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingSetupMenu(interaction) {
  const choice = interaction.values[0];
  console.log('⚙️ antiPromotingSetupMenu choice:', choice);
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = await import('discord.js');

  try {
    if (choice === 'add_link') {
      console.log(' Creating add_link modal...');
      const modal = new ModalBuilder()
        .setCustomId('antipromotingsetup_add_link_modal')
        .setTitle('Add Whitelisted Link');

      const linkInput = new TextInputBuilder()
        .setCustomId('link_input')
        .setLabel('Discord Invite Link')
        .setPlaceholder('https://discord.gg/xyz')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(linkInput);
      modal.addComponents(row);

      console.log('🎯 Showing modal...');
      return await interaction.showModal(modal);
    }

    if (choice === 'remove_link') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      if (!config || !config.whitelistedInviteLinks || config.whitelistedInviteLinks.length === 0) {
        return interaction.update({
          embeds: [errorEmbed('No whitelisted links found.')],
          components: [],
        });
      }

      const options = config.whitelistedInviteLinks.map((link, index) => ({
        label: `${index + 1}. ${link.substring(0, 50)}...`,
        value: `remove_${index}`,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('antipromotingsetup_remove_link')
        .setPlaceholder('Select a link to remove...')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select a whitelisted link to remove:',
        components: [row, backButton],
      });
    }

    if (choice === 'view_links') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      if (!config || !config.whitelistedInviteLinks || config.whitelistedInviteLinks.length === 0) {
        return interaction.update({
          embeds: [infoEmbed('Whitelisted Links', 'No whitelisted links configured.')],
          components: [],
        });
      }

      let linkList = '';
      config.whitelistedInviteLinks.forEach((link, index) => {
        linkList += `${index + 1}. ${link}\n`;
      });

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor('#2E2E2E')
        .setTitle('Whitelisted Invite Links')
        .setDescription(linkList)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'toggle_staff_bypass') {
      const config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
      config.staffCanBypassLinks = !config.staffCanBypassLinks;
      await config.save();

      const status = config.staffCanBypassLinks ? 'enabled' : 'disabled';
      const description = config.staffCanBypassLinks 
        ? '✅ Staff and Admins can now send invite links without deletion.'
        : '🔒 Staff and Admins can no longer send invite links without deletion. All staff are subject to anti-promoting rules.';

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor(config.staffCanBypassLinks ? '#00AA00' : '#FF0000')
        .setTitle('Staff Bypass Updated')
        .setDescription(description)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'view_settings') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      const linkCount = config?.whitelistedInviteLinks?.length || 0;
      const staffBypass = config?.staffCanBypassLinks ? '✅ Enabled' : '🔒 Disabled';

      const description = `**Whitelisted Links:** ${linkCount}\n**Staff Bypass:** ${staffBypass}`;

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor('#2E2E2E')
        .setTitle('Anti-Promoting Settings')
        .setDescription(description)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'setup_done') {
      return interaction.update({
        content: '✅ Anti-Promoting setup closed.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in anti-promoting setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingRemoveLink(interaction) {
  const selectedIndex = parseInt(interaction.values[0].replace('remove_', ''));

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.whitelistedInviteLinks || !config.whitelistedInviteLinks[selectedIndex]) {
      return interaction.reply({
        embeds: [errorEmbed('Link not found.')],
        flags: 64,
      });
    }

    const removedLink = config.whitelistedInviteLinks[selectedIndex];
    config.whitelistedInviteLinks.splice(selectedIndex, 1);
    await config.save();

    return interaction.reply({
      embeds: [successEmbed('Link Removed', `The invite link has been removed from the whitelist.\n\nLink: ${removedLink}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error removing whitelisted link:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the link.')],
      flags: 64,
    });
  }
}

async function handleStickyListDelete(interaction) {
  const { Sticky } = await import('../models/Sticky.js').then(m => ({ Sticky: m.default }));
  
  const selectedIndex = parseInt(interaction.values[0].replace('delete_', ''));

  try {
    const stickies = await Sticky.find({ guildId: interaction.guildId });
    
    if (!stickies[selectedIndex]) {
      return interaction.reply({
        embeds: [errorEmbed('Sticky message not found.')],
        flags: 64,
      });
    }

    const sticky = stickies[selectedIndex];
    
    // Delete from Discord
    try {
      const channel = await interaction.guild.channels.fetch(sticky.channelId);
      if (channel) {
        const message = await channel.messages.fetch(sticky.messageId).catch(() => null);
        if (message) {
          await message.delete();
        }
      }
    } catch (err) {
      console.error('Error deleting sticky message from Discord:', err);
    }

    // Delete from database
    await Sticky.deleteOne({ _id: sticky._id });

    return interaction.reply({
      embeds: [successEmbed('Sticky Deleted', `The sticky message has been removed from <#${sticky.channelId}>`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error deleting sticky:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while deleting the sticky message.')],
      flags: 64,
    });
  }
}

async function handleStatusMainMenu(interaction) {
  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');
  const choice = interaction.values[0];

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    if (choice === 'enable') {
      statusConfig.enabled = true;
      await statusConfig.save();
      return interaction.reply({
        embeds: [successEmbed('Status Heartbeat Enabled', 'The heartbeat monitoring system is now active and will send messages every 8 minutes.')],
        flags: 64,
      });
    }

    if (choice === 'disable') {
      statusConfig.enabled = false;
      await statusConfig.save();
      return interaction.reply({
        embeds: [successEmbed('Status Heartbeat Disabled', 'The heartbeat monitoring system has been turned off.')],
        flags: 64,
      });
    }

    if (choice === 'set_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('status_heartbeat_channel_select')
        .setPlaceholder('Select the heartbeat channel...')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where heartbeat messages will be sent:',
        components: [row],
        flags: 64,
      });
    }

    if (choice === 'set_interval') {
      const modal = new ModalBuilder()
        .setCustomId('status_set_interval_modal')
        .setTitle('Set Heartbeat Interval')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('interval_minutes')
              .setLabel('Interval (minutes)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 8')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'view_config') {
      const channelText = statusConfig.heartbeatChannelId ? `<#${statusConfig.heartbeatChannelId}>` : 'Not set';
      const statusText = statusConfig.enabled ? '✅ Enabled' : '❌ Disabled';

      return interaction.reply({
        embeds: [{
          color: 0x0099ff,
          title: 'Status Heartbeat Configuration',
          fields: [
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channelText, inline: true },
            { name: 'Interval', value: `${statusConfig.intervalMinutes} minutes`, inline: true },
            { name: 'Auto-delete', value: `${statusConfig.deleteAfterSeconds} seconds`, inline: true }
          ],
          footer: { text: 'EverLink' }
        }],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error in status main menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleStatusChannelSelect(interaction) {
  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');
  const channelId = interaction.values[0];

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    statusConfig.heartbeatChannelId = channelId;
    await statusConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Channel Set', `Heartbeat messages will now be sent to <#${channelId}>`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in status channel select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleApprovalToggle(interaction, enabled) {
  try {
    const { ChannelType } = await import('discord.js');
    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    
    if (enabled) {
      // If enabling, ask for approval channel
      verification.approvalRequired = true;
      await verification.save();

      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_approval_channel_menu')
        .setPlaceholder('Select the approval channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the channel where staff will review and approve/reject verifications:',
        components: [row, backButton],
      });
    } else {
      verification.approvalRequired = false;
      verification.approvalChannelId = null;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.update({
        content: '',
        embeds: [infoEmbed('Approval Disabled', 'Users will now be instantly verified without staff approval.')],
        components: menuOptions.components,
      });
    }
  } catch (error) {
    console.error('Error toggling approval:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    }).catch(() => {});
  }
}

async function handleVerificationApprove(interaction) {
  try {
    await interaction.deferUpdate();
    
    // Check if user is staff or admin
    const { default: Staff } = await import('../models/Staff.js');
    const staffCheck = await Staff.findOne({
      guildId: interaction.guildId,
      $or: [
        { type: 'user', userId: interaction.user.id },
        { type: 'role', roleId: { $in: interaction.member.roles.cache.map(r => r.id) } }
      ]
    });
    
    // Allow server admins or staff/managers
    const isAdmin = interaction.member.permissions.has('Administrator');
    if (!isAdmin && !staffCheck) {
      return await interaction.editReply({
        embeds: [errorEmbed('You do not have permission to approve verifications. Only staff members can approve applications.')],
      });
    }
    
    const pendingId = interaction.customId.replace('verify_approve_', '');
    const { default: PendingVerification } = await import('../models/PendingVerification.js');
    
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) {
      return await interaction.editReply({
        embeds: [errorEmbed('This verification request is no longer available.')],
      });
    }

    const member = await interaction.guild.members.fetch(pending.userId).catch(() => null);
    const verification = await Verification.findOne({ guildId: interaction.guildId });
    
    if (member && verification) {
      const verifiedRole = interaction.guild.roles.cache.get(verification.verifiedRoleId);
      const unverifiedRole = interaction.guild.roles.cache.get(verification.unverifiedRoleId);
      
      if (verifiedRole) {
        await member.roles.add(verifiedRole);
      }
      if (unverifiedRole) {
        await member.roles.remove(unverifiedRole);
      }

      // Set nickname if RP tag is set
      if (verification.rpTag && member) {
        const newNickname = `${verification.rpTag} | ${pending.psnxbox}`;
        await member.setNickname(newNickname).catch(() => {});
      }

      // Send DM to user
      await member.user.send({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('Verification Approved')
          .setDescription('Your verification has been approved! You now have access to member channels.')
          .setFooter({ text: 'EverLink' })
        ]
      }).catch(() => {});
    }

    await PendingVerification.findByIdAndDelete(pendingId);
    
    console.log(`Verification approved for ${pending.username}`);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Approved')
        .setDescription(`${pending.username} has been verified.`)
        .setFooter({ text: 'EverLink' })
      ],
      components: [],
    });
  } catch (error) {
    console.error('Error approving verification:', error);
    await interaction.editReply({
      embeds: [errorEmbed('An error occurred while approving.')],
    }).catch(() => {});
  }
}

async function handleVerificationReject(interaction) {
  try {
    await interaction.deferUpdate();
    
    // Check if user is staff or admin
    const { default: Staff } = await import('../models/Staff.js');
    const staffCheck = await Staff.findOne({
      guildId: interaction.guildId,
      $or: [
        { type: 'user', userId: interaction.user.id },
        { type: 'role', roleId: { $in: interaction.member.roles.cache.map(r => r.id) } }
      ]
    });
    
    // Allow server admins or staff/managers
    const isAdmin = interaction.member.permissions.has('Administrator');
    if (!isAdmin && !staffCheck) {
      return await interaction.editReply({
        embeds: [errorEmbed('You do not have permission to reject verifications. Only staff members can reject applications.')],
      });
    }
    
    const pendingId = interaction.customId.replace('verify_reject_', '');
    const { default: PendingVerification } = await import('../models/PendingVerification.js');
    
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) {
      return await interaction.editReply({
        embeds: [errorEmbed('This verification request is no longer available.')],
      });
    }

    const member = await interaction.guild.members.fetch(pending.userId).catch(() => null);
    
    // Send DM to user
    if (member) {
      await member.user.send({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('Verification Rejected')
          .setDescription('Your verification application has been rejected. Please try again with more information.')
          .setFooter({ text: 'EverLink' })
        ]
      }).catch(() => {});
    }

    await PendingVerification.findByIdAndDelete(pendingId);
    
    console.log(`Verification rejected for ${pending.username}`);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Rejected')
        .setDescription(`${pending.username}'s verification has been rejected.`)
        .setFooter({ text: 'EverLink' })
      ],
      components: [],
    });
  } catch (error) {
    console.error('Error rejecting verification:', error);
    await interaction.editReply({
      embeds: [errorEmbed('An error occurred while rejecting.')],
    }).catch(() => {});
  }
}

async function handleDeleteCustomQuestion(interaction) {
  try {
    const selectedIndex = parseInt(interaction.values[0].replace('delete_question_', ''));
    let verification = await Verification.findOne({ guildId: interaction.guildId });
    
    if (!verification || !verification.customQuestions || !verification.customQuestions[selectedIndex]) {
      return interaction.reply({
        embeds: [errorEmbed('Question not found.')],
        flags: 64,
      });
    }

    const deletedQuestion = verification.customQuestions[selectedIndex];
    verification.customQuestions.splice(selectedIndex, 1);
    verification.markModified('customQuestions');
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [successEmbed('Custom Question Deleted', `Question removed: "${deletedQuestion}"\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('❌ Error deleting custom question:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while deleting the question.')],
      flags: 64,
    });
  }
}

async function handleApprovalChannelSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.approvalChannelId = channelId;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Approval Channel Set', `Staff will review verifications in <#${channelId}>`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting approval channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

function buildDispatchSetupMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dispatch_setup_menu')
      .setPlaceholder('Select an option...')
      .addOptions(
        { label: 'Set Dispatch Channel', value: 'set_dispatch_channel', description: 'Text channel for AI dispatch logs and responses' },
        { label: 'Set Status Board Channel', value: 'set_status_channel', description: 'Text channel for the live officer status board' },
        { label: 'Add Patrol Voice Channel', value: 'add_patrol_channel', description: 'Voice channel the bot will listen to' },
        { label: '➕ Add Traffic Stop Channel', value: 'add_stop_channel', description: 'Add a voice channel officers are moved to during 10-11' },
        { label: '🗑️ Remove Traffic Stop Channel', value: 'remove_stop_channel', description: 'Remove a traffic stop channel' },
        { label: '🔌 Enable / Disable System', value: 'toggle_system', description: 'Turn the entire dispatch system on or off' },
        { label: '🤖 Toggle AI Responses', value: 'toggle_ai', description: 'Enable or disable AI-generated dispatcher responses' },
        { label: '🗑️ Remove Patrol Channel', value: 'remove_patrol_channel', description: 'Stop monitoring a voice channel' },
        { label: '📋 View Settings', value: 'view_settings', description: 'See current configuration' },
        { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
      )
  );
}

async function handleDispatchSetupMenu(interaction) {
  const choice = interaction.values[0];
  try {
    if (choice === 'set_dispatch_channel') {
      const selector = new ChannelSelectMenuBuilder()
        .setCustomId('dispatch_text_channel_select')
        .setPlaceholder('Select the dispatch log channel...')
        .setChannelTypes(ChannelType.GuildText);
      return interaction.update({
        embeds: [menuEmbed('AI Dispatch Setup', 'Select the **text channel** where dispatch logs and AI responses will be posted.')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'set_status_channel') {
      const selector = new ChannelSelectMenuBuilder()
        .setCustomId('dispatch_status_channel_select')
        .setPlaceholder('Select the status board channel...')
        .setChannelTypes(ChannelType.GuildText);
      return interaction.update({
        embeds: [menuEmbed('AI Dispatch Setup', 'Select the **text channel** for the live officer status board embed.')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'add_patrol_channel') {
      const selector = new ChannelSelectMenuBuilder()
        .setCustomId('dispatch_patrol_channel_select')
        .setPlaceholder('Select a patrol voice channel...')
        .setChannelTypes(ChannelType.GuildVoice);
      return interaction.update({
        embeds: [menuEmbed('AI Dispatch Setup', 'Select a **voice channel** to monitor for officer radio calls. You can add multiple channels one at a time.')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'add_stop_channel') {
      const selector = new ChannelSelectMenuBuilder()
        .setCustomId('dispatch_stop_channel_select')
        .setPlaceholder('Select a traffic stop voice channel to add...')
        .setChannelTypes(ChannelType.GuildVoice);
      return interaction.update({
        embeds: [menuEmbed('AI Dispatch Setup', 'Select the **voice channel** officers will be moved to when they call a **10-11** (traffic stop).')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'remove_stop_channel') {
      const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
      if (!config?.trafficStopChannelIds?.length) {
        return interaction.update({
          embeds: [errorEmbed('No traffic stop channels are configured yet.')],
          components: [buildDispatchSetupMenu()],
        });
      }
      const selector = new StringSelectMenuBuilder()
        .setCustomId('dispatch_remove_stop_select')
        .setPlaceholder('Select a channel to remove...')
        .addOptions(config.trafficStopChannelIds.map(id => ({
          label: `#${interaction.guild.channels.cache.get(id)?.name ?? id}`,
          value: id,
        })));
      return interaction.update({
        embeds: [menuEmbed('Remove Traffic Stop Channel', 'Select the traffic stop channel you want to remove.')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'toggle_system') {
      const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });
      config.enabled = !config.enabled;
      await config.save();

      if (!config.enabled) {
        const { leaveDispatchChannel } = await import('../utils/voiceListener.js');
        leaveDispatchChannel(interaction.guildId);
      } else {
        const { initDispatchForGuild } = await import('./dispatchHandler.js');
        await initDispatchForGuild(interaction.guild, null);
      }

      const status = config.enabled ? '✅ **Enabled**' : '❌ **Disabled**';
      return interaction.update({
        embeds: [successEmbed('Dispatch System Toggle', `The AI dispatch system is now ${status}.\n\nSelect your next option below.`)],
        components: [buildDispatchSetupMenu()],
      });
    }

    if (choice === 'toggle_ai') {
      const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });
      config.aiEnabled = !config.aiEnabled;
      await config.save();
      const status = config.aiEnabled ? '✅ **Enabled**' : '❌ **Disabled**';
      return interaction.update({
        embeds: [successEmbed('AI Responses Toggle', `AI-generated dispatcher responses are now ${status}.\n\nSelect your next option below.`)],
        components: [buildDispatchSetupMenu()],
      });
    }

    if (choice === 'remove_patrol_channel') {
      const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
      if (!config || config.patrolChannelIds.length === 0) {
        return interaction.update({
          embeds: [infoEmbed('Remove Patrol Channel', 'No patrol channels are currently configured.')],
          components: [buildDispatchSetupMenu()],
        });
      }
      const options = config.patrolChannelIds.map(id => ({
        label: `Channel ID: ${id}`,
        value: id,
        description: `Stop monitoring <#${id}>`,
      }));
      const selector = new StringSelectMenuBuilder()
        .setCustomId('dispatch_remove_patrol_select')
        .setPlaceholder('Select a channel to remove...')
        .addOptions(options);
      return interaction.update({
        embeds: [menuEmbed('Remove Patrol Channel', 'Select a patrol voice channel to stop monitoring.')],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    if (choice === 'view_settings') {
      const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
      if (!config) {
        return interaction.update({
          embeds: [infoEmbed('AI Dispatch Settings', 'No settings configured yet.')],
          components: [buildDispatchSetupMenu()],
        });
      }
      const dispatchCh = config.dispatchChannelId ? `<#${config.dispatchChannelId}>` : '*Not set*';
      const statusCh = config.statusBoardChannelId ? `<#${config.statusBoardChannelId}>` : '*Not set*';
      const patrol = config.patrolChannelIds.length > 0
        ? config.patrolChannelIds.map(id => `<#${id}>`).join(', ')
        : '*None*';
      const stopCh = config.trafficStopChannelIds?.length > 0
        ? config.trafficStopChannelIds.map(id => `<#${id}>`).join(', ')
        : '*None*';
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📋 AI Dispatch Settings')
        .addFields(
          { name: '📻 Dispatch Channel', value: dispatchCh, inline: true },
          { name: '🚔 Status Board', value: statusCh, inline: true },
          { name: '🎙️ Patrol Channels', value: patrol, inline: false },
          { name: '🚗 Traffic Stop Channels', value: stopCh, inline: false },
          { name: '🤖 AI Responses', value: config.aiEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '🔌 System', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'ℹ️ Multi-Channel Note', value: 'Discord allows one voice connection per server. The bot monitors the active patrol channel and automatically moves to whichever channel an officer joins.', inline: false },
        )
        .setFooter({ text: 'EverLink' });
      return interaction.update({
        embeds: [embed],
        components: [buildDispatchSetupMenu()],
      });
    }

    if (choice === 'setup_done') {
      return interaction.update({
        embeds: [successEmbed('AI Dispatch Setup Complete', 'Your dispatch system has been configured. Officers with LEO roles speaking in monitored voice channels will be transcribed and responded to automatically.')],
        components: [],
      });
    }

    return interaction.update({
      embeds: [errorEmbed('Unknown option selected.')],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Setup menu error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchTextChannelSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });
    config.dispatchChannelId = channelId;
    config.enabled = true;
    await config.save();
    return interaction.update({
      embeds: [successEmbed('Dispatch Channel Set', `Dispatch logs will be posted in <#${channelId}>.\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Text channel select error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchStatusChannelSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });
    config.statusBoardChannelId = channelId;
    config.statusBoardMessageId = null;
    await config.save();
    return interaction.update({
      embeds: [successEmbed('Status Board Channel Set', `The live officer status board will appear in <#${channelId}>.\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Status channel select error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchPatrolChannelSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });

    if (!config.patrolChannelIds.includes(channelId)) {
      config.patrolChannelIds.push(channelId);
      config.markModified('patrolChannelIds');
      await config.save();
    }

    try {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (channel) {
        const { addPatrolChannel, moveToChannel, getDispatchState } = await import('../utils/voiceListener.js');
        const { processVoiceCall } = await import('./dispatchHandler.js');
        const CADConfig = (await import('../models/CADConfig.js')).default;
        const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

        const options = {
          onTranscription: (wav, uid) => processVoiceCall(wav, uid, interaction.guild, null),
          userFilter: async (uid) => {
            if (!cadConfig?.leoRoleIds?.length) return false;
            const member = await interaction.guild.members.fetch(uid).catch(() => null);
            return member?.roles.cache.some(r => cadConfig.leoRoleIds.includes(r.id)) ?? false;
          },
        };

        addPatrolChannel(interaction.guildId, channelId, options);

        if (config.enabled && !getDispatchState(interaction.guildId)?.connection) {
          await moveToChannel(channel);
        }
      }
    } catch (joinErr) {
      console.error('[Dispatch] Failed to register patrol channel:', joinErr.message);
    }

    const list = config.patrolChannelIds.map(id => `<#${id}>`).join(', ');
    return interaction.update({
      embeds: [successEmbed('Patrol Channel Added', `<#${channelId}> is now being monitored.\n\n**Current patrol channels:** ${list}\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Patrol channel select error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchStopChannelSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId }) || new DispatchConfig({ guildId: interaction.guildId });
    if (!config.trafficStopChannelIds.includes(channelId)) {
      config.trafficStopChannelIds.push(channelId);
      config.markModified('trafficStopChannelIds');
      await config.save();
    }
    const list = config.trafficStopChannelIds.map(id => `<#${id}>`).join(', ');
    return interaction.update({
      embeds: [successEmbed('Traffic Stop Channel Added', `<#${channelId}> added as a traffic stop channel.\n\n**Current traffic stop channels:** ${list}\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Stop channel select error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchRemoveStopSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (!config) return interaction.update({ embeds: [errorEmbed('No dispatch config found.')], components: [buildDispatchSetupMenu()] });

    config.trafficStopChannelIds = config.trafficStopChannelIds.filter(id => id !== channelId);
    config.markModified('trafficStopChannelIds');
    await config.save();

    const remaining = config.trafficStopChannelIds.length > 0
      ? config.trafficStopChannelIds.map(id => `<#${id}>`).join(', ')
      : '*None*';
    return interaction.update({
      embeds: [successEmbed('Traffic Stop Channel Removed', `<#${channelId}> has been removed.\n\n**Remaining traffic stop channels:** ${remaining}\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Remove stop channel error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

async function handleDispatchRemovePatrolSelect(interaction) {
  try {
    const channelId = interaction.values[0];
    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (!config) {
      return interaction.update({
        embeds: [errorEmbed('No dispatch configuration found.')],
        components: [buildDispatchSetupMenu()],
      });
    }

    config.patrolChannelIds = config.patrolChannelIds.filter(id => id !== channelId);
    config.markModified('patrolChannelIds');
    await config.save();

    // Remove from in-memory state
    const { getDispatchState, moveToChannel, disconnectDispatchChannel, leaveDispatchChannel } = await import('../utils/voiceListener.js');
    const state = getDispatchState(interaction.guildId);
    if (state) {
      state.patrolChannelIds.delete(channelId);

      // If the bot is currently in the removed channel, move to another or idle-disconnect
      if (state.currentChannelId === channelId) {
        if (config.patrolChannelIds.length > 0) {
          // Try each remaining channel until we can connect to one
          let moved = false;
          for (const nextId of config.patrolChannelIds) {
            const nextCh = interaction.guild.channels.cache.get(nextId) ||
              await interaction.guild.channels.fetch(nextId).catch(() => null);
            if (nextCh) {
              await moveToChannel(nextCh);
              moved = true;
              break;
            }
          }
          // If none are fetchable right now, idle-disconnect so state is preserved
          if (!moved) disconnectDispatchChannel(interaction.guildId);
        } else {
          // No patrol channels left — full teardown
          leaveDispatchChannel(interaction.guildId);
        }
      }
    }

    const remaining = config.patrolChannelIds.length > 0
      ? config.patrolChannelIds.map(id => `<#${id}>`).join(', ')
      : '*None*';
    return interaction.update({
      embeds: [successEmbed('Patrol Channel Removed', `<#${channelId}> has been removed from monitoring.\n\n**Remaining patrol channels:** ${remaining}\n\nSelect your next option below.`)],
      components: [buildDispatchSetupMenu()],
    });
  } catch (err) {
    console.error('[Dispatch] Remove patrol select error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred. Please try again.')], flags: 64 }).catch(() => {});
  }
}

export {
  handleVerificationApprove,
  handleVerificationReject,
  handleDeleteCustomQuestion
};
