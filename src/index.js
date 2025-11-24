import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsPath = join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded command: ${command.data.name}`);
  } else {
    console.log(`⚠️  Warning: ${file} is missing required "data" or "execute" property.`);
  }
}

client.once('clientReady', async () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`📋 Total commands to register: ${commands.length}`);
  
  // Register commands non-blocking (doesn't wait for this)
  registerCommandsAsync();

  // Start priority tracker countdown updater
  startPriorityTrackerUpdater();
  
  // Start auto-deletion for unresponded 911 calls
  startEmergencyCallAutoDelete();

  // Start auto-deletion for expired BOLOs
  startBOLOAutoDelete();
});

async function registerCommandsAsync() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Started refreshing application (/) commands...');
    
    // Step 0: Clear client-side cache
    console.log('🧹 Clearing bot client command cache...');
    if (client.application) {
      client.application.commands.cache.clear();
      console.log('  ✓ Cleared client command cache');
    }

    // Step 1: Clear all old commands first (ensures no stale commands remain)
    console.log('🗑️  Clearing old commands from all guilds...');
    let clearSuccessCount = 0;
    let clearFailureCount = 0;

    // Clear guild-specific commands
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: [] }, // Empty array clears all commands
        );
        clearSuccessCount++;
        console.log(`  ✓ Cleared all commands from: ${guild.name}`);
      } catch (guildError) {
        console.error(`⚠️  Failed to clear commands for guild ${guild.name}:`, guildError.message);
        clearFailureCount++;
      }
    }

    // Also clear global commands as fallback
    try {
      console.log('  ↳ Also clearing global commands...');
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      console.log('  ✓ Cleared global commands');
    } catch (err) {
      console.log('  ℹ️  No global commands to clear (this is expected)');
    }

    if (clearSuccessCount > 0) {
      console.log(`✅ Cleared old commands from ${clearSuccessCount} guild(s)`);
    }
    if (clearFailureCount > 0) {
      console.log(`⚠️  Failed to clear commands from ${clearFailureCount} guild(s)`);
    }

    // Wait 3 seconds to let Discord process the clear before registering new commands
    console.log('⏳ Waiting for Discord to process cleared commands (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Register new commands - Using global registration
    console.log(`📤 Registering ${commands.length} commands globally...`);

    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log(`✅ Commands registered globally for all servers!`);
    } catch (error) {
      console.error(`❌ Global registration failed:`, error.message);
      console.log('⚠️  Attempting per-guild registration...');
      
      let successCount = 0;
      let failureCount = 0;

      // Fallback: Register commands per-guild
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commands },
          );
          console.log(`✅ Commands registered for guild: ${guild.name}`);
          successCount++;
        } catch (guildError) {
          console.error(`❌ Failed to register commands for guild ${guild.name}:`, guildError.message);
          failureCount++;
        }
      }
      
      console.log(`✅ Per-guild registration complete: ${successCount} successful, ${failureCount} failed.`);
    }
    
    console.log('💡 Tip: If old commands still appear in Discord, restart your Discord client (close completely and reopen).');
  } catch (error) {
    console.error('❌ Command registration system error:', error.message);
    console.log('⚠️  Bot will continue running. Commands may not be visible in Discord.');
  }
}

async function startPriorityTrackerUpdater() {
  const { default: Priority } = await import('./models/Priority.js');

  setInterval(async () => {
    try {
      const priorities = await Priority.find({ enabled: true, cooldownEndsAt: { $ne: null } });

      for (const priority of priorities) {
        if (priority.cooldownEndsAt && new Date() >= priority.cooldownEndsAt) {
          // Cooldown has ended, clear it
          priority.cooldownMinutes = 0;
          priority.cooldownEndsAt = null;
          priority.cooldownIssuedBy = null;
          await priority.save();
        }

        // Update the message
        try {
          const guild = client.guilds.cache.get(priority.guildId);
          if (!guild) continue;

          const channel = await guild.channels.fetch(priority.channelId).catch(() => null);
          if (!channel || !priority.messageId) continue;

          const message = await channel.messages.fetch(priority.messageId).catch(() => null);
          if (!message) continue;

          const embed = buildPriorityEmbed(priority);
          await message.edit({ embeds: [embed] });
        } catch (error) {
          console.error(`Error updating priority tracker for guild ${priority.guildId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in priority tracker updater:', error);
    }
  }, 60000); // Update every minute

  console.log('⏰ Priority tracker countdown updater started');
}

function buildPriorityEmbed(priority) {
  let cooldownText = 'None';
  if (priority.cooldownEndsAt) {
    const now = new Date();
    const remaining = Math.max(0, Math.floor((priority.cooldownEndsAt - now) / 1000 / 60));
    cooldownText = `${remaining}m (counting down)`;
  }

  const priorityIssuedBy = priority.priorityIssuedBy || 'N/A';
  const cooldownIssuedBy = priority.cooldownIssuedBy || 'N/A';

  let description = `**Priority active:** ${priority.priorityActive ? 'Active' : 'Inactive'}\n`;
  description += `**Priority issued by:** ${priorityIssuedBy}\n`;
  description += `**Priority cooldown:** ${cooldownText}\n`;
  description += `**Cooldown issued by:** ${cooldownIssuedBy}`;

  if (priority.customMessage) {
    description += `\n\n${priority.customMessage}`;
  }

  return {
    title: 'Priority Tracker',
    description,
    color: priority.priorityActive ? 0xFF0000 : 0x808080,
    footer: { text: 'EverLink' },
  };
}

async function startEmergencyCallAutoDelete() {
  const { default: EmergencyCall } = await import('./models/EmergencyCall.js');

  setInterval(async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      // Find ALL active calls older than 10 minutes
      const expiredCalls = await EmergencyCall.find({
        status: 'active',
        timestamp: { $lt: tenMinutesAgo }
      });

      if (expiredCalls.length > 0) {
        for (const call of expiredCalls) {
          await EmergencyCall.deleteOne({ _id: call._id });
          console.log(`🗑️ Auto-deleted 911 call ${call.callId} (>10 min old)`);
        }
        console.log(`📊 Deleted ${expiredCalls.length} expired 911 call(s)`);
      }
    } catch (error) {
      console.error('Error in emergency call auto-delete:', error);
    }
  }, 60000); // Check every minute

  console.log('⏱️ Emergency call auto-delete started (10-minute timeout for all calls)');
}

async function startBOLOAutoDelete() {
  const { default: BOLO } = await import('./models/BOLO.js');

  setInterval(async () => {
    try {
      const now = new Date();
      
      // Find all expired BOLOs
      const expiredBOLOs = await BOLO.find({
        active: true,
        expiresAt: { $lt: now }
      });

      if (expiredBOLOs.length > 0) {
        for (const bolo of expiredBOLOs) {
          await BOLO.deleteOne({ _id: bolo._id });
          console.log(`🗑️ Auto-deleted BOLO ${bolo.boloId} (expired)`);
        }
        console.log(`📊 Deleted ${expiredBOLOs.length} expired BOLO alert(s)`);
      }
    } catch (error) {
      console.error('Error in BOLO auto-delete:', error);
    }
  }, 60000); // Check every minute

  console.log('⏱️ BOLO auto-delete started (1-hour expiration for all BOLOs)');
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`❌ No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing ${interaction.commandName}:`, error);
      
      const errorMessage = {
        content: '❌ There was an error while executing this command!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }

  if (interaction.isModalSubmit()) {
    const { handleModalSubmit } = await import('./handlers/modalHandler.js');
    const { handleSetupModals } = await import('./handlers/selectMenuHandler.js');
    const { handlePriorityTrackerMessageModal } = await import('./handlers/priorityTrackerHandler.js');
    const { handleTicketSetupModal, handleTicketCreationModal, handlePanelTitleModal, handlePanelDescriptionModal } = await import('./handlers/ticketHandler.js');
    const { handleCADVehicleAddModal, handleCADGunAddModal, handleCADCharacterCreateModal, handleCharacterHeightRaceModal } = await import('./handlers/cadHandler.js');
    const { handleLEOSearchPlateModal, handleLEOSearchCharacterModal } = await import('./handlers/leoDatabaseHandler.js');
    const { handleCivilianDatabaseMenu } = await import('./handlers/civilianDatabaseHandler.js');
    const { handleFDCharacterCreateModal, handleFDVehicleAddModal } = await import('./handlers/fireDepartmentHandler.js');
    const { handle911ReportModal, handleTwitterPostModal, handleAnonPostModal } = await import('./handlers/roleplayCommandsHandler.js');
    
    if (interaction.customId.includes('prioritytrackersetup_message')) {
      await handlePriorityTrackerMessageModal(interaction);
    } else if (interaction.customId === '911report') {
      await handle911ReportModal(interaction);
    } else if (interaction.customId === 'twitter_post_modal') {
      await handleTwitterPostModal(interaction);
    } else if (interaction.customId === 'anon_post_modal') {
      await handleAnonPostModal(interaction);
    } else if (interaction.customId === 'fd_character_create_modal') {
      await handleFDCharacterCreateModal(interaction);
    } else if (interaction.customId === 'cadcharacter_create_modal') {
      await handleCADCharacterCreateModal(interaction);
    } else if (interaction.customId.startsWith('char_height_race_modal_')) {
      const charId = interaction.customId.replace('char_height_race_modal_', '');
      await handleCharacterHeightRaceModal(interaction, charId);
    } else if (interaction.customId.startsWith('cadvehicle_add_modal_')) {
      await handleCADVehicleAddModal(interaction);
    } else if (interaction.customId.startsWith('fd_vehicle_add_modal_')) {
      await handleFDVehicleAddModal(interaction);
    } else if (interaction.customId.startsWith('cadgun_add_modal_')) {
      await handleCADGunAddModal(interaction);
    } else if (interaction.customId === 'ticketsupport_add_type_modal') {
      await handleTicketSetupModal(interaction);
    } else if (interaction.customId === 'ticketsupport_panel_title_modal') {
      await handlePanelTitleModal(interaction);
    } else if (interaction.customId === 'ticketsupport_panel_description_modal') {
      await handlePanelDescriptionModal(interaction);
    } else if (interaction.customId.startsWith('ticketsupport_create_ticket_')) {
      await handleTicketCreationModal(interaction);
    } else if (interaction.customId === 'leodatabase_search_plate_modal') {
      await handleLEOSearchPlateModal(interaction);
    } else if (interaction.customId === 'leodatabase_search_character_modal') {
      await handleLEOSearchCharacterModal(interaction);
    } else if (interaction.customId.startsWith('char_edit_modal_')) {
      const { handleCharacterEditModal } = await import('./handlers/civilianDatabaseHandler.js');
      const charId = interaction.customId.replace('char_edit_modal_', '');
      await handleCharacterEditModal(interaction, charId);
    } else if (interaction.customId.includes('setup_')) {
      await handleSetupModals(interaction);
    } else {
      await handleModalSubmit(interaction);
    }
  }

  if (interaction.isButton()) {
    const { handle911RespondButton, handle911AttachButton, handle911DismissButton } = await import('./handlers/emergencyButtonHandler.js');
    const { handleLEOPrimaryResponse, handleLEOAttachResponse } = await import('./handlers/leoDatabaseHandler.js');
    const { handleFDPrimaryResponse, handleFDAttachResponse } = await import('./handlers/fireDepartmentHandler.js');
    const { data, execute } = await import('./commands/verify.js');
    const { handleTicketButtonClick, handleAddBotStaffButton, handleRolesDoneButton, handleTicketCloseButton, handleTicketDeleteButton } = await import('./handlers/ticketHandler.js');
    const { handleCharacterEdit, handleCharacterDelete, handleCharacterDeleteConfirm } = await import('./handlers/civilianDatabaseHandler.js');
    const { handleCharacterContinue, handleCharacterStatusNone } = await import('./handlers/cadHandler.js');
    const { handleEnableCommandButton, handleDisableCommandButton, handleAntiPromoteButton } = await import('./handlers/enableCommandsHandler.js');

    if (interaction.customId.startsWith('911_respond_')) {
      await handle911RespondButton(interaction);
    } else if (interaction.customId.startsWith('911_attach_')) {
      await handle911AttachButton(interaction);
    } else if (interaction.customId.startsWith('911_dismiss_')) {
      await handle911DismissButton(interaction);
    } else if (interaction.customId.startsWith('leo_respond_primary_')) {
      await handleLEOPrimaryResponse(interaction);
    } else if (interaction.customId.startsWith('leo_respond_attach_')) {
      await handleLEOAttachResponse(interaction);
    } else if (interaction.customId.startsWith('fd_respond_primary_')) {
      await handleFDPrimaryResponse(interaction);
    } else if (interaction.customId.startsWith('fd_respond_attach_')) {
      await handleFDAttachResponse(interaction);
    } else if (interaction.customId === 'verify_button') {
      await execute(interaction);
    } else if (interaction.customId.startsWith('char_edit_')) {
      const charId = interaction.customId.replace('char_edit_', '');
      await handleCharacterEdit(interaction, charId);
    } else if (interaction.customId.startsWith('char_delete_confirm_')) {
      const charId = interaction.customId.replace('char_delete_confirm_', '');
      await handleCharacterDeleteConfirm(interaction, charId);
    } else if (interaction.customId.startsWith('char_delete_')) {
      const charId = interaction.customId.replace('char_delete_', '');
      await handleCharacterDelete(interaction, charId);
    } else if (interaction.customId.startsWith('char_continue_')) {
      const charId = interaction.customId.replace('char_continue_', '');
      await handleCharacterContinue(interaction, charId);
    } else if (interaction.customId.startsWith('char_status_none_')) {
      const charId = interaction.customId.replace('char_status_none_', '');
      await handleCharacterStatusNone(interaction, charId);
    } else if (interaction.customId === 'char_delete_cancel') {
      await interaction.reply({
        content: 'Character deletion cancelled.',
        ephemeral: true,
      });
    } else if (interaction.customId.startsWith('char_license_valid_')) {
      const { handleCharacterLicenseValid } = await import('./handlers/cadHandler.js');
      const charId = interaction.customId.replace('char_license_valid_', '');
      await handleCharacterLicenseValid(interaction, charId);
    } else if (interaction.customId.startsWith('char_license_invalid_')) {
      const { handleCharacterLicenseInvalid } = await import('./handlers/cadHandler.js');
      const charId = interaction.customId.replace('char_license_invalid_', '');
      await handleCharacterLicenseInvalid(interaction, charId);
    } else if (interaction.customId.startsWith('char_veteran_')) {
      const { handleCharacterVeteran } = await import('./handlers/cadHandler.js');
      const charId = interaction.customId.replace('char_veteran_', '');
      await handleCharacterVeteran(interaction, charId);
    } else if (interaction.customId.startsWith('char_organ_donor_')) {
      const { handleCharacterOrganDonor } = await import('./handlers/cadHandler.js');
      const charId = interaction.customId.replace('char_organ_donor_', '');
      await handleCharacterOrganDonor(interaction, charId);
    } else if (interaction.customId.startsWith('ticket_create_')) {
      await handleTicketButtonClick(interaction);
    } else if (interaction.customId.startsWith('ticketsupport_add_botstaff_')) {
      await handleAddBotStaffButton(interaction);
    } else if (interaction.customId.startsWith('ticketsupport_roles_done_')) {
      await handleRolesDoneButton(interaction);
    } else if (interaction.customId.startsWith('ticket_close_')) {
      await handleTicketCloseButton(interaction);
    } else if (interaction.customId.startsWith('ticket_delete_')) {
      await handleTicketDeleteButton(interaction);
    } else if (interaction.customId.startsWith('enable_')) {
      await handleEnableCommandButton(interaction);
    } else if (interaction.customId.startsWith('disable_')) {
      await handleDisableCommandButton(interaction);
    } else if (interaction.customId === 'enable_antipromote' || interaction.customId === 'disable_antipromote') {
      await handleAntiPromoteButton(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
    const { handleUnsetRpSelect } = await import('./handlers/roleplayCalendarHandler.js');
    const { handleTicketSetupMenu, handleTicketTypeButtonColor, handleRemoveTicketType, handlePanelTypesSelect } = await import('./handlers/ticketHandler.js');
    const { handleRoleplayCommandsSetupMenu, handleRoleplayCommandsCADSetupMenu, handleRoleplayCommandsEmergencySetupMenu, handleRoleplayCommandsEmergency911Channel, handleRoleplayCommandsEmergencyLEORoles, handleRoleplayCommandsEmergencyFDRoles, handleRoleplayCommandsEmergencyStaffRoles } = await import('./handlers/roleplayCommandsHandler.js');
    const { handleCADSetupMenu, handleCADVehicleCharacterSelect, handleCADGunCharacterSelect } = await import('./handlers/cadHandler.js');
    const { handleLEODatabaseMenu } = await import('./handlers/leoDatabaseHandler.js');
    const { handleCivilianDatabaseMenu } = await import('./handlers/civilianDatabaseHandler.js');
    
    if (interaction.customId.includes('unsetrp_select')) {
      await handleUnsetRpSelect(interaction);
    } else if (interaction.customId === 'roleplaycommands_setup_menu') {
      await handleRoleplayCommandsSetupMenu(interaction);
    } else if (interaction.customId === 'roleplaycommands_cad_setup_menu') {
      await handleRoleplayCommandsCADSetupMenu(interaction);
    } else if (interaction.customId === 'roleplaycommands_emergency_setup_menu') {
      await handleRoleplayCommandsEmergencySetupMenu(interaction);
    } else if (interaction.customId === 'cadsystem_setup_menu') {
      await handleCADSetupMenu(interaction);
    } else if (interaction.customId === 'ticketsupport_setup_menu') {
      await handleTicketSetupMenu(interaction);
    } else if (interaction.customId.startsWith('ticketsupport_type_button_color_')) {
      await handleTicketTypeButtonColor(interaction);
    } else if (interaction.customId === 'ticketsupport_remove_type_select') {
      await handleRemoveTicketType(interaction);
    } else if (interaction.customId === 'ticketsupport_panel_types_select') {
      await handlePanelTypesSelect(interaction);
    } else if (interaction.customId === 'leodatabase_menu') {
      await handleLEODatabaseMenu(interaction);
    } else if (interaction.customId === 'civiliandatabase_menu') {
      await handleCivilianDatabaseMenu(interaction);
    } else if (interaction.customId === 'civilian_manage_character_select') {
      const { handleCivilianManageCharacterSelect } = await import('./handlers/civilianDatabaseHandler.js');
      await handleCivilianManageCharacterSelect(interaction);
    } else if (interaction.customId === 'firedepartmentdatabase_menu') {
      const { handleFireDepartmentMenu } = await import('./handlers/fireDepartmentHandler.js');
      await handleFireDepartmentMenu(interaction);
    } else if (interaction.customId === 'leodatabase_respond_call') {
      const { handleLEORespondCall } = await import('./handlers/leoDatabaseHandler.js');
      await handleLEORespondCall(interaction);
    } else if (interaction.customId === 'fd_vehicle_character_select') {
      const { handleFDVehicleCharacterSelect } = await import('./handlers/fireDepartmentHandler.js');
      await handleFDVehicleCharacterSelect(interaction);
    } else if (interaction.customId === 'fd_respond_call') {
      const { handleFDRespondCall } = await import('./handlers/fireDepartmentHandler.js');
      await handleFDRespondCall(interaction);
    } else if (interaction.customId === 'cadcharacter_select_for_vehicle') {
      await handleCADVehicleCharacterSelect(interaction);
    } else if (interaction.customId === 'cadcharacter_select_for_gun') {
      await handleCADGunCharacterSelect(interaction);
    } else {
      await handleSelectMenu(interaction);
    }
  }

  if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
    const { handlePriorityTrackerChannelSelect } = await import('./handlers/priorityTrackerHandler.js');
    const { handleRoleplayCalendarChannelSelect } = await import('./handlers/roleplayCalendarHandler.js');
    const { handleTicketChannelSelect, handleTicketRoleSelect } = await import('./handlers/ticketHandler.js');
    const { handleRoleplayCommandTwitterChannel, handleRoleplayCommandAnonChannel, handleRoleplayCommandsCADLeoRoles, handleRoleplayCommandsCADFDRoles, handleRoleplayCommandsCADStaffRoles, handleRoleplayCommandsEmergency911Channel, handleRoleplayCommandsEmergencyLEORoles, handleRoleplayCommandsEmergencyFDRoles, handleRoleplayCommandsEmergencyStaffRoles } = await import('./handlers/roleplayCommandsHandler.js');
    const { handleCADLeoRoles, handleCADFDRoles, handleCADStaffRoles } = await import('./handlers/cadHandler.js');
    
    if (interaction.customId.includes('prioritytrackersetup_channel')) {
      await handlePriorityTrackerChannelSelect(interaction);
    } else if (interaction.customId.includes('roleplaycalendarsetup_channel')) {
      await handleRoleplayCalendarChannelSelect(interaction);
    } else if (interaction.customId === 'roleplaycommands_twitter_channel') {
      await handleRoleplayCommandTwitterChannel(interaction);
    } else if (interaction.customId === 'roleplaycommands_anon_channel') {
      await handleRoleplayCommandAnonChannel(interaction);
    } else if (interaction.customId === 'roleplaycommands_emergency_911_channel') {
      await handleRoleplayCommandsEmergency911Channel(interaction);
    } else if (interaction.customId === 'cadsystem_leo_roles') {
      await handleCADLeoRoles(interaction);
    } else if (interaction.customId === 'cadsystem_fd_roles') {
      await handleCADFDRoles(interaction);
    } else if (interaction.customId === 'cadsystem_staff_roles') {
      await handleCADStaffRoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_emergency_leo_roles') {
      await handleRoleplayCommandsEmergencyLEORoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_emergency_fd_roles') {
      await handleRoleplayCommandsEmergencyFDRoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_emergency_staff_roles') {
      await handleRoleplayCommandsEmergencyStaffRoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_cad_leo_roles') {
      await handleRoleplayCommandsCADLeoRoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_cad_fd_roles') {
      await handleRoleplayCommandsCADFDRoles(interaction);
    } else if (interaction.customId === 'roleplaycommands_cad_staff_roles') {
      await handleRoleplayCommandsCADStaffRoles(interaction);
    } else if (interaction.customId === 'ticketsupport_panel_channel') {
      await handleTicketChannelSelect(interaction);
    } else if (interaction.customId.startsWith('ticketsupport_type_roles_')) {
      await handleTicketRoleSelect(interaction);
    } else {
      await handleSelectMenu(interaction);
    }
  }

  // All button handling is consolidated in the first isButton() block above
});

client.on('guildMemberAdd', async member => {
  try {
    const { default: Verification } = await import('./models/Verification.js');
    const { default: Welcome } = await import('./models/Welcome.js');
    const { EmbedBuilder } = await import('discord.js');

    const verification = await Verification.findOne({ guildId: member.guild.id });

    if (verification && verification.enabled && verification.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(verification.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
        console.log(`✅ Assigned unverified role to ${member.user.tag}`);
      }
    }

    const welcome = await Welcome.findOne({ guildId: member.guild.id });

    if (welcome && welcome.enabled) {
      const channel = await member.guild.channels.fetch(welcome.channelId).catch(() => null);

      if (channel && channel.isTextBased()) {
        const welcomeMessage = welcome.welcomeMessage
          .replace(/{user}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name);

        const welcomeDM = welcome.welcomeDM
          .replace(/{user}/g, member.user.username)
          .replace(/{server}/g, member.guild.name);

        const profileEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle(`Welcome ${member.user.username}!`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setDescription(welcomeMessage)
          .setFooter({ text: `Member #${member.guild.memberCount}` })
          .setTimestamp();

        await channel.send({
          embeds: [profileEmbed],
        });

        const dmEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle(`Welcome to ${member.guild.name}!`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setDescription(welcomeDM)
          .setFooter({ text: 'EverLink' })
          .setTimestamp();

        await member.send({
          embeds: [dmEmbed],
        }).catch(() => {
          console.log(`Could not send DM to ${member.user.tag}. They may have DMs disabled.`);
        });

        console.log(`✅ Sent welcome message to ${member.user.tag}`);
      }
    }
  } catch (error) {
    console.error('Error in guildMemberAdd event:', error);
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  const { handleAntiPromoting } = await import('./handlers/antiPromotingHandler.js');
  const { handleStickyMessages } = await import('./handlers/stickyHandler.js');
  await handleAntiPromoting(message);
  await handleStickyMessages(message);
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  const { handleReactionAdd } = await import('./handlers/reactionRoleHandler.js');
  await handleReactionAdd(reaction, user);
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  const { handleReactionRemove } = await import('./handlers/reactionRoleHandler.js');
  await handleReactionRemove(reaction, user);
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    bot: client.user ? client.user.tag : 'Not logged in yet',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    bot: client.user ? 'online' : 'offline',
    uptime: process.uptime(),
  });
});

async function startBot() {
  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 HTTP server running on port ${PORT}`);
      console.log(`📡 Health check available at /health`);
    });
    
    await connectDatabase();
    
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();
