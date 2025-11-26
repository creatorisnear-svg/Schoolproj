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
const allCommandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all files in numeric order (they already have numeric prefixes)
const orderedFiles = allCommandFiles.sort();

const commands = [];

for (const file of orderedFiles) {
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
  console.log(`📋 Commands loaded: ${commands.length} and ready to use`);

  // Clear old cached commands and register new ones
  await clearAndRegisterCommands();

  // Initialize support server heartbeat
  await initializeSupportServerHeartbeat();

  // Start priority tracker countdown updater
  startPriorityTrackerUpdater();
  
  // Start auto-deletion for unresponded 911 calls
  startEmergencyCallAutoDelete();

  // Start auto-deletion for expired BOLOs
  startBOLOAutoDelete();

  // Start status heartbeat sender
  startStatusHeartbeatSender();

  // Start status bot poller (keep-alive by checking for status bot messages)
  startStatusBotPoller();
});

async function initializeSupportServerHeartbeat() {
  const { default: StatusHeartbeat } = await import('./models/StatusHeartbeat.js');
  const supportServerId = '1441548471906734173';

  if (!supportServerId) {
    console.log('⚠️ Support server ID not set, skipping heartbeat initialization');
    return;
  }

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: supportServerId });
    
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({
        guildId: supportServerId,
        enabled: true,
        heartbeatChannelId: '1442653565427646495',
        intervalMinutes: 8,
        deleteAfterSeconds: 60,
      });
      console.log('✅ Created support server heartbeat config');
    } else if (!statusConfig.enabled || !statusConfig.heartbeatChannelId) {
      statusConfig.enabled = true;
      statusConfig.heartbeatChannelId = '1442653565427646495';
      await statusConfig.save();
      console.log('✅ Enabled support server heartbeat');
    }
  } catch (error) {
    console.error('Error initializing support server heartbeat:', error);
  }
}

async function clearAndRegisterCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    console.log('🗑️  Clearing old command cache...');
    console.log(`🤖 Bot ID: ${client.user.id}`);
    
    // Set timeout for operations
    const timeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
    
    try {
      // Clear global commands with timeout
      await timeout(rest.put(Routes.applicationCommands(client.user.id), { body: [] }), 5000);
      console.log('✅ Global commands cleared');
    } catch (e) {
      console.log('⚠️  Could not clear global commands, continuing...');
    }
    
    // Brief wait before registering
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`📤 Registering clean commands to ${client.guilds.cache.size} server(s)...`);
    
    // Register commands sequentially with intelligent retry and staggered delays
    const guilds = Array.from(client.guilds.cache.values());
    let successCount = 0;
    let failureCount = 0;
    const failedGuilds = [];
    
    console.log(`\n📋 COMMAND SYNC DETAILS:`);
    console.log(`Total servers: ${guilds.length}`);
    console.log(`Commands to register: ${commands.length}`);
    console.log(`\n`);
    
    for (let i = 0; i < guilds.length; i++) {
      const guild = guilds[i];
      let success = false;
      const startTime = Date.now();
      
      console.log(`[${i + 1}/${guilds.length}] Processing: "${guild.name}" (ID: ${guild.id}, Members: ${guild.memberCount})`);
      
      // First attempt with 10s timeout
      try {
        const response = await timeout(
          rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands }),
          10000
        );
        const duration = Date.now() - startTime;
        console.log(`  ✅ SUCCESS: ${response.length} commands registered in ${duration}ms`);
        success = true;
        successCount++;
      } catch (error) {
        // Retry once with 15s timeout
        try {
          console.log(`  ⏳ TIMEOUT/ERROR: ${error.message} - Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay before retry
          const retryStartTime = Date.now();
          const response = await timeout(
            rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands }),
            15000
          );
          const duration = Date.now() - retryStartTime;
          console.log(`  ✅ RETRY SUCCESS: ${response.length} commands registered in ${duration}ms`);
          success = true;
          successCount++;
        } catch (retryError) {
          const totalDuration = Date.now() - startTime;
          console.log(`  ❌ FAILED: ${guild.name} - Error: ${retryError.message} (${totalDuration}ms)`);
          console.log(`     Error code: ${retryError.code} | Status: ${retryError.status}`);
          failureCount++;
          failedGuilds.push({ name: guild.name, id: guild.id, error: retryError.message });
        }
      }
      
      // Small delay between guilds to avoid rate limiting
      if (i < guilds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Command sync process completed`);
    console.log(`📊 SYNC SUMMARY:`);
    console.log(`   ✅ Successful: ${successCount}/${guilds.length}`);
    console.log(`   ❌ Failed: ${failureCount}/${guilds.length}`);
    if (failedGuilds.length > 0) {
      console.log(`\n   Failed servers:`);
      failedGuilds.forEach(guild => {
        console.log(`     • ${guild.name} (${guild.id}): ${guild.error}`);
      });
    }
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error('❌ Error in command cache clearing:', error.message);
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

async function startStatusHeartbeatSender() {
  const { default: StatusHeartbeat } = await import('./models/StatusHeartbeat.js');

  setInterval(async () => {
    try {
      const statusConfigs = await StatusHeartbeat.find({ enabled: true });

      for (const config of statusConfigs) {
        try {
          const guild = client.guilds.cache.get(config.guildId);
          if (!guild || !config.heartbeatChannelId) continue;

          const channel = await guild.channels.fetch(config.heartbeatChannelId).catch(() => null);
          if (!channel || !channel.isTextBased()) continue;

          // Send heartbeat message
          const heartbeatMsg = await channel.send({
            content: '🟢 **EverLink Heartbeat** - Status: UP',
            embeds: [{
              color: 0x00FF00,
              title: 'EverLink Status',
              description: 'System is operational',
              footer: { text: 'EverLink' },
              timestamp: new Date()
            }]
          });

          // Store message ID for tracking
          config.lastHeartbeatMessageId = heartbeatMsg.id;
          await config.save();

          // Delete after specified seconds
          setTimeout(async () => {
            try {
              await heartbeatMsg.delete();
              console.log(`🗑️ Deleted heartbeat message for guild ${config.guildId}`);
            } catch (err) {
              console.log(`⚠️ Could not delete heartbeat message for guild ${config.guildId}`);
            }
          }, config.deleteAfterSeconds * 1000);

          console.log(`💚 Sent heartbeat to ${guild.name}`);
        } catch (error) {
          console.error(`Error sending heartbeat for guild ${config.guildId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in status heartbeat sender:', error);
    }
  }, 8 * 60 * 1000); // Check every 8 minutes

  console.log('💚 Status heartbeat sender started (8-minute interval)');
}

function startStatusBotPoller() {
  const statusBotId = '835223338275569676';
  const watchChannelId = '1442653565427646495';

  console.log(`📡 Status bot watcher active - listening for messages from ${statusBotId}`);

  client.on('messageCreate', (message) => {
    if (message.author.id === statusBotId && message.channelId === watchChannelId) {
      console.log(`💚 [KEEP-ALIVE] Status bot message detected - ${new Date().toISOString()}`);
    }
  });
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
        flags: 64,
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (replyError) {
        // Silently fail if we can't respond - interaction may have already been replied to or timed out
        if (replyError.code !== 10062 && replyError.code !== 40060) {
          console.error('Failed to send error message:', replyError);
        }
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
    const { handleAddRoleRequestTypeModal } = await import('./handlers/roleRequestHandler.js');
    
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
    } else if (interaction.customId === 'add_rolerequest_type_modal') {
      await handleAddRoleRequestTypeModal(interaction);
    } else if (interaction.customId === 'antipromotingsetup_add_link_modal') {
      const { handleModalSubmit } = await import('./handlers/modalHandler.js');
      await handleModalSubmit(interaction);
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
    const { handleEnableChoiceButton, handleEnableCommandButton, handleDisableCommandButton } = await import('./handlers/enableCommandsHandler.js');

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
        flags: 64,
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
    } else if (interaction.customId === 'choice_enable' || interaction.customId === 'choice_disable') {
      await handleEnableChoiceButton(interaction);
    } else if (interaction.customId.startsWith('enable_')) {
      await handleEnableCommandButton(interaction);
    } else if (interaction.customId.startsWith('disable_')) {
      await handleDisableCommandButton(interaction);
    } else if (interaction.customId.startsWith('approve_rolereq_') || interaction.customId.startsWith('deny_rolereq_')) {
      const { handleApproveRoleRequest, handleDenyRoleRequest } = await import('./handlers/roleRequestHandler.js');
      if (interaction.customId.startsWith('approve_rolereq_')) {
        await handleApproveRoleRequest(interaction);
      } else {
        await handleDenyRoleRequest(interaction);
      }
    } else if (interaction.customId.startsWith('skip_approver_members_')) {
      const { handleSkipApproverMembers } = await import('./handlers/roleRequestHandler.js');
      await handleSkipApproverMembers(interaction);
    } else if (interaction.customId.startsWith('skip_approver_roles_')) {
      const { handleSkipApproverRoles } = await import('./handlers/roleRequestHandler.js');
      await handleSkipApproverRoles(interaction);
    } else if (interaction.customId.startsWith('view_char_profile_')) {
      const { handleLEOViewCharacterProfile } = await import('./handlers/leoDatabaseHandler.js');
      await handleLEOViewCharacterProfile(interaction);
    } else if (interaction.customId.startsWith('leo_delete_bolo_')) {
      const { handleLEODeleteBOLO } = await import('./handlers/leoDatabaseHandler.js');
      await handleLEODeleteBOLO(interaction);
    } else if (interaction.customId === 'back_to_rolerequest_menu' || interaction.customId === 'back_to_ticket_menu' || interaction.customId === 'back_to_roleplay_menu' || interaction.customId === 'back_to_priority_menu' || interaction.customId === 'back_to_calendar_menu' || interaction.customId === 'back_to_verify_menu' || interaction.customId === 'back_to_cad_menu' || interaction.customId === 'back_to_leo_menu' || interaction.customId === 'back_to_civilian_menu' || interaction.customId === 'back_to_fd_menu' || interaction.customId === 'back_to_antipromotingsetup_menu') {
      const { handleBackToMenu } = await import('./handlers/setupMenuHandler.js');
      await handleBackToMenu(interaction);
    }
  }

  if (interaction.isUserSelectMenu()) {
    const { handleSelectApprover } = await import('./handlers/roleRequestHandler.js');
    
    if (interaction.customId.startsWith('select_approver_')) {
      await handleSelectApprover(interaction);
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
    const { handleRoleRequestSetupMenu, handleSelectRoleToRequest, handleDeleteRoleRequestType, handleManageRoleSelect, handleRemoveRoleFromMember } = await import('./handlers/roleRequestHandler.js');
    
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
    } else if (interaction.customId === 'leo_manage_bolos_select') {
      const { handleLEOManageBolosSelect } = await import('./handlers/leoDatabaseHandler.js');
      await handleLEOManageBolosSelect(interaction);
    } else if (interaction.customId === 'leodatabase_menu') {
      await handleLEODatabaseMenu(interaction);
    } else if (interaction.customId === 'rolerequest_setup_menu') {
      await handleRoleRequestSetupMenu(interaction);
    } else if (interaction.customId === 'select_role_to_request') {
      await handleSelectRoleToRequest(interaction);
    } else if (interaction.customId === 'delete_rolerequest_type_select') {
      await handleDeleteRoleRequestType(interaction);
    } else if (interaction.customId === 'manage_role_select') {
      await handleManageRoleSelect(interaction);
    } else if (interaction.customId.startsWith('remove_role_from_member_')) {
      await handleRemoveRoleFromMember(interaction);
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

  if (interaction.isUserSelectMenu()) {
    const { handleSelectApproverMembers } = await import('./handlers/roleRequestHandler.js');
    
    if (interaction.customId.startsWith('select_approver_members_')) {
      await handleSelectApproverMembers(interaction);
    }
  }

  if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
    const { handlePriorityTrackerChannelSelect } = await import('./handlers/priorityTrackerHandler.js');
    const { handleRoleplayCalendarChannelSelect } = await import('./handlers/roleplayCalendarHandler.js');
    const { handleTicketChannelSelect, handleTicketRoleSelect } = await import('./handlers/ticketHandler.js');
    const { handleRoleplayCommandTwitterChannel, handleRoleplayCommandAnonChannel, handleRoleplayCommandsCADLeoRoles, handleRoleplayCommandsCADFDRoles, handleRoleplayCommandsCADStaffRoles, handleRoleplayCommandsEmergency911Channel, handleRoleplayCommandsEmergencyLEORoles, handleRoleplayCommandsEmergencyFDRoles, handleRoleplayCommandsEmergencyStaffRoles } = await import('./handlers/roleplayCommandsHandler.js');
    const { handleCADLeoRoles, handleCADFDRoles, handleCADStaffRoles } = await import('./handlers/cadHandler.js');
    const { handleSelectRoleForRequest, handleSelectApproverRoles } = await import('./handlers/roleRequestHandler.js');
    
    if (interaction.customId === 'select_role_for_request') {
      await handleSelectRoleForRequest(interaction);
    } else if (interaction.customId.startsWith('select_approver_roles_')) {
      await handleSelectApproverRoles(interaction);
    } else if (interaction.customId.includes('prioritytrackersetup_channel')) {
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
  try {
    // Log status bot messages to keep bot alive
    if (message.author.bot && process.env.STATUS_BOT_ID && message.author.id === process.env.STATUS_BOT_ID) {
      console.log(`💚 [KEEP-ALIVE] Status bot message received at ${new Date().toISOString()}`);
      return;
    }

    if (!message.guild || message.author.bot) return;
    const { handleAntiPromoting } = await import('./handlers/antiPromotingHandler.js');
    const { handleStickyMessages } = await import('./handlers/stickyHandler.js');
    await handleAntiPromoting(message);
    await handleStickyMessages(message);
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    const { handleReactionAdd } = await import('./handlers/reactionRoleHandler.js');
    await handleReactionAdd(reaction, user);
  } catch (error) {
    console.error('Error handling reaction add:', error);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    const { handleReactionRemove } = await import('./handlers/reactionRoleHandler.js');
    await handleReactionRemove(reaction, user);
  } catch (error) {
    console.error('Error handling reaction remove:', error);
  }
});

// Debounce mechanism to prevent duplicate guild events
const processedGuilds = new Set();

client.on('guildCreate', async (guild) => {
  try {
    // Check if we already processed this guild recently (debounce)
    if (processedGuilds.has(guild.id)) {
      console.log(`⏭️  Skipping duplicate guildCreate for ${guild.name} (already processed)`);
      return;
    }
    
    // Mark this guild as processed
    processedGuilds.add(guild.id);
    setTimeout(() => processedGuilds.delete(guild.id), 5000); // Remove after 5 seconds
    
    console.log(`\n🆕 Bot added to new guild: ${guild.name} (ID: ${guild.id}, Members: ${guild.memberCount})`);
    
    // Register commands to the new guild immediately
    try {
      console.log(`📋 Registering ${commands.length} commands to new guild...`);
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
      console.log(`✅ Commands registered successfully to ${guild.name}`);
    } catch (syncError) {
      console.error(`⚠️  Error registering commands to new guild:`, syncError.message);
    }
    
    // Send welcome message to owner
    try {
      const owner = await guild.fetchOwner();
      console.log(`📤 Attempting to send welcome DM to owner: ${owner.user.tag}`);
      
      const welcomeMessage = `🎉 __**Welcome to EverLink**__ 🎉

Hi ${owner.user.username}, thanks for adding __**EverLink**__ to your server! 

__**What is EverLink?**__
EverLink is a __**comprehensive Discord bot**__ designed for __**GTA5 RP**__ and roleplay communities. It helps streamline community management with powerful features for admins, staff, and members.

__**Core Features**__
🚨 __Emergency System__ - 911 calls with unit responses and auto-deletion
🚔 __CAD System__ - Full GTA5 RP CAD with character and vehicle management for LEO/Fire
📋 __Member Verification__ - Custom RP tags, security questions, automatic role assignment
👮 __Staff Management__ - Add/remove staff with permission-based command access
⚡ __Strike System__ - 4-level punishment system with customizable actions
🎟️ __Ticket Support__ - Custom ticket types with automatic channel creation
🎭 __Roleplay Features__ - Twitter, Anonymous posts, priority tracking, BOLO alerts
📅 __Roleplay Calendar__ - Weekly RP events with timezone conversion
🎙️ __Community Tools__ - Reaction roles, sticky messages, role requests, anti-promoting

__**Getting Started**__
1️⃣ Use __/enablecommands__ to enable/disable features
2️⃣ Use __/setlogchannel__ to set your logging channel
3️⃣ Configure each feature with its setup command (__/verifysystemsetup__, __/strikesystemsetup__, etc.)
4️⃣ Add staff with __/addstaff__

__**Permission Levels**__
✅ **Admins** - Full access to all commands
✅ **Staff** - Added via /addstaff, access to admin commands
✅ **Members** - Access to roleplay commands

__**Support & Updates**__
For assistance, updates, and feature discussions, join our __**support server**__: https://discord.gg/cSdhfGPeV2

All commands are slash commands. Use \`/\` to see available options and descriptions.

Ready? Start with __/enablecommands__ to configure your server.

__**EverLink**__ - Made for RP Communities 🎮`;

      await owner.send(welcomeMessage);
      console.log(`✅ Welcome DM sent successfully to ${owner.user.tag}`);
    } catch (dmError) {
      console.error(`❌ Could not send DM to owner:`, dmError.message);
      console.log(`   Reason: Owner may have DMs disabled or bot blocked`);
      
      // Fallback: Try to send in a general channel
      try {
        const generalChannel = guild.channels.cache.find(ch => 
          ch.isTextBased() && ch.name === 'general' && ch.permissionsFor(client.user).has('SendMessages')
        );
        
        if (generalChannel) {
          const channelMessage = `👋 **Welcome to EverLink!**\n\nI tried to send you a setup guide via DM, but your DMs are disabled. Here's the quick start:\n\n1️⃣ Use \`/enablecommands\` to enable features\n2️⃣ Use \`/setlogchannel\` to set logging\n3️⃣ Configure each feature with setup commands\n4️⃣ Add staff with \`/addstaff\`\n\nFor detailed help: \`/help\`\nJoin support: https://discord.gg/cSdhfGPeV2`;
          await generalChannel.send(channelMessage);
          console.log(`✅ Fallback welcome message sent to #general`);
        }
      } catch (fallbackError) {
        console.log(`⚠️  Could not send fallback message:`, fallbackError.message);
      }
    }
  } catch (error) {
    console.error(`❌ Error in guildCreate handler for ${guild?.name}:`, error.message);
  }
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

app.post('/send-heartbeat-now', async (req, res) => {
  try {
    const { default: StatusHeartbeat } = await import('./models/StatusHeartbeat.js');
    const supportServerId = '1441548471906734173';
    
    const config = await StatusHeartbeat.findOne({ guildId: supportServerId });
    if (!config || !config.heartbeatChannelId) {
      return res.status(400).json({ error: 'Heartbeat not configured' });
    }

    const guild = client.guilds.cache.get(supportServerId);
    if (!guild) {
      return res.status(400).json({ error: 'Guild not found' });
    }

    const channel = await guild.channels.fetch(config.heartbeatChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Channel not found or not text-based' });
    }

    const heartbeatMsg = await channel.send({
      content: '🟢 **EverLink Heartbeat** - Status: UP',
      embeds: [{
        color: 0x00FF00,
        title: 'EverLink Status',
        description: 'System is operational',
        footer: { text: 'EverLink' },
        timestamp: new Date()
      }]
    });

    setTimeout(async () => {
      try {
        await heartbeatMsg.delete();
      } catch (err) {
        console.log('Could not delete test heartbeat message');
      }
    }, 60000);

    res.status(200).json({ success: true, message: 'Heartbeat sent!' });
  } catch (error) {
    console.error('Error sending heartbeat:', error);
    res.status(500).json({ error: error.message });
  }
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n⏹️ Shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

async function refreshAllCalendars() {
  try {
    const { default: RoleplayCalendar } = await import('./models/RoleplayCalendar.js');
    const { buildCalendarEmbed } = await import('./utils/calendarBuilder.js');
    const calendars = await RoleplayCalendar.find({ enabled: true, channelId: { $ne: null } });
    
    console.log(`🔄 Refreshing ${calendars.length} calendars...`);
    
    for (const calendar of calendars) {
      try {
        const guild = client.guilds.cache.get(calendar.guildId);
        if (!guild) continue;
        
        const channel = await guild.channels.fetch(calendar.channelId).catch(() => null);
        if (!channel) continue;
        
        if (!calendar.messageId) continue;
        
        try {
          const message = await channel.messages.fetch(calendar.messageId).catch(() => null);
          if (!message) continue;
          
          const embed = buildCalendarEmbed(calendar);
          await message.edit({ embeds: [embed] });
          console.log(`✅ Refreshed calendar for ${guild.name}`);
        } catch (err) {
          const embed = buildCalendarEmbed(calendar);
          const newMsg = await channel.send({ embeds: [embed] });
          calendar.messageId = newMsg.id;
          await calendar.save();
          console.log(`📨 Created new calendar message for ${guild.name}`);
        }
      } catch (error) {
        console.error(`Error refreshing calendar for guild ${calendar.guildId}:`, error.message);
      }
    }
    
    console.log('✅ Calendar refresh complete');
  } catch (error) {
    console.error('Error in calendar refresh:', error);
  }
}

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

client.once('clientReady', async () => {
  console.log('🔄 Refreshing all calendars on bot startup...');
  await refreshAllCalendars();
});

startBot();
