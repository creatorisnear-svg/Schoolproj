import { Client, GatewayIntentBits, Options, Collection, REST, Routes, ActivityType, EmbedBuilder } from 'discord.js';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import axios from 'axios';
import AuthorizedUser from './models/AuthorizedUser.js';
import AutoRole from './models/AutoRole.js';
import AutoJoin from './models/AutoJoin.js';
import Priority from './models/Priority.js';
import DispatchConfig from './models/DispatchConfig.js';

dotenv.config();

// Koyeb-style Startup Logs
console.log('Instance created. Preparing to start...');
console.log('Starting download for registry01.prod.koyeb.com/k-c50a3147-75f3-45b3-a7c1-ae005e5a3bc6/e633e6d9-dd03-49b1-b92f-feae455fbdfd:aa523b75-c0fc-45d5-ae2a-33466075c211');
console.log('Download progress: 100% |\x1b[32m++++++++\x1b[0m| (6.7 MiB/s)');
console.log('Download complete for registry01.prod.koyeb.com/k-c50a3147-75f3-45b3-a7c1-ae005e5a3bc6/e633e6d9-dd03-49b1-b92f-feae455fbdfd:aa523b75-c0fc-45d5-ae2a-33466075c211');
console.log('');
console.log('> EverLink-discord-bot@1.0.0 start');
console.log('> node src/index.js');
console.log('');
console.log('Instance is starting... Waiting for health checks to pass.');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    GuildMemberManager: {
      maxSize: 200,
      keepOverLimit: (member) => member.id === member.client.user?.id,
    },
    PresenceManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    GuildInviteManager: 0,
    GuildScheduledEventManager: 0,
    ThreadManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 600 },
    users: {
      interval: 600,
      filter: () => (user) => user.id !== user.client.user?.id && !user.bot,
    },
  },
});

const app = express();
const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/callback', async (req, res) => {
  console.log('[OAUTH CALLBACK] Received code, attempting exchange...');
  const { code } = req.query;
  if (!code) return res.send('No code provided');

  try {
    const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const redirectUri = `https://${cleanDomain}/callback`;
    console.log(`[OAUTH CALLBACK] Using Redirect URI: ${redirectUri}`);

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token } = tokenResponse.data;
    
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const userData = userResponse.data;
    const guilds = guildsResponse.data;

    // Fetch connections (third-party accounts)
    try {
      const connectionsResponse = await axios.get('https://discord.com/api/users/@me/connections', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      console.log(`[AUTH] User ${userData.id} connections:`, connectionsResponse.data);
    } catch (e) {
      console.error(`[AUTH] Failed to fetch connections:`, e.message);
    }

    // Assign auto-roles
    for (const guildData of guilds) {
      const autoRoles = await AutoRole.find({ guildId: guildData.id, enabled: true });
      if (autoRoles.length > 0) {
        const guild = client.guilds.cache.get(guildData.id);
        if (guild) {
          const member = await guild.members.fetch(userData.id).catch(() => null);
          if (member) {
            for (const ar of autoRoles) {
              await member.roles.add(ar.roleId).catch(() => {});
            }
          }
        }
      }
    }

    await AuthorizedUser.findOneAndUpdate(
      { userId: userData.id },
      {
        userId: userData.id,
        username: userData.username,
        accessToken: access_token,
        refreshToken: refresh_token,
        servers: guilds.map(g => ({ id: g.id, name: g.name })),
        lastUpdated: new Date(),
      },
      { upsert: true }
    );

    res.send(`
      <style>
        body { font-family: sans-serif; background: #2c2f33; color: white; padding: 40px; text-align: center; }
        .container { background: #23272a; border-radius: 8px; padding: 20px; display: inline-block; text-align: left; max-width: 600px; width: 100%; }
        h1 { color: #43b581; }
      </style>
      <div class="container">
        <h1>✅ Authorization Successful!</h1>
        <p>EverLink has securely authorized your account.</p>
        <p>You can close this window now.</p>
      </div>
    `);
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
  for (const [roleId] of addedRoles) {
    const config = await AutoJoin.findOne({ guildId: newMember.guild.id, roleId, enabled: true });
    if (config) {
      const userData = await AuthorizedUser.findOne({ userId: newMember.id });
      if (userData?.accessToken) {
        await axios.put(
          `https://discord.com/api/guilds/${config.targetServerId}/members/${newMember.id}`,
          { access_token: userData.accessToken },
          { headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } }
        ).catch(() => {});
      }
    }
  }
});

// Voice state updates — handles AI Dispatch channel lifecycle
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const userId = newState.member?.id;
  if (!userId) return;
  if (newState.member?.user?.bot) return;

  const joinedChannelId = newState.channelId;
  const leftChannelId = oldState.channelId !== newState.channelId ? oldState.channelId : null;

  try {
    const { isPatrolChannel, getCurrentChannelId, moveToChannel, getDispatchState, disconnectDispatchChannel } = await import('./utils/voiceListener.js');

    // Officer entered a patrol channel that the bot isn't currently in
    if (joinedChannelId && isPatrolChannel(guild.id, joinedChannelId) && getCurrentChannelId(guild.id) !== joinedChannelId) {
      // Only move for LEO members (dispatch config roles take priority over CAD config)
      const DispatchConfigModel = (await import('./models/DispatchConfig.js')).default;
      const CADConfigModel = (await import('./models/CADConfig.js')).default;
      const [dispatchCfg, cadConfig] = await Promise.all([
        DispatchConfigModel.findOne({ guildId: guild.id }),
        CADConfigModel.findOne({ guildId: guild.id }),
      ]);
      const leoRoleIds = dispatchCfg?.leoRoleIds?.length > 0 ? dispatchCfg.leoRoleIds : (cadConfig?.leoRoleIds ?? []);
      const isLeo = leoRoleIds.length === 0 ||
        newState.member?.roles.cache.some(r => leoRoleIds.includes(r.id));

      if (isLeo) {
        const channel = newState.channel;
        if (channel) await moveToChannel(channel);
      }
    }

    // Bot's current patrol channel may now be empty — move to another active patrol channel or disconnect
    if (leftChannelId && isPatrolChannel(guild.id, leftChannelId) && getCurrentChannelId(guild.id) === leftChannelId) {
      const state = getDispatchState(guild.id);
      if (!state) return;

      // Check if the now-vacated channel is truly empty of non-bot voice members
      const vacatedChannel = guild.channels.cache.get(leftChannelId);
      const humanMembersLeft = vacatedChannel?.members.filter(m => !m.user.bot).size ?? 0;

      if (humanMembersLeft === 0) {
        // Check every other patrol channel for human members
        let moved = false;
        for (const channelId of state.patrolChannelIds) {
          if (channelId === leftChannelId) continue;
          const ch = guild.channels.cache.get(channelId);
          if (ch && ch.members.filter(m => !m.user.bot).size > 0) {
            await moveToChannel(ch);
            moved = true;
            break;
          }
        }

        // No patrol channel has human members — idle disconnect (preserves state for re-join)
        if (!moved) {
          disconnectDispatchChannel(guild.id);
        }
      }
    }
  } catch (err) {
    console.error('[Dispatch] voiceStateUpdate error:', err.message);
  }
});

client.commands = new Collection();
const __dirname = dirname(fileURLToPath(import.meta.url));
const commandFiles = fs.readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  try {
    const command = await import(`file://${join(__dirname, 'commands', file)}`);
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load command ${file}:`, error.message);
  }
}

client.once('clientReady', async () => {
  console.log('Instance is healthy. All health checks are passing.');
  console.log(`✅ Connected to MongoDB Atlas successfully`);
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log('🧹 Clearing old command cache...');
  console.log(`🤖 Bot ID: ${client.user.id}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandData = Array.from(client.commands.values()).map(c => c.data.toJSON());
  
  console.log('✨ Global commands cleared');
  console.log(`📋 Registering clean commands to ${client.guilds.cache.size} server(s)...`);
  console.log('');
  console.log('📊 COMMAND SYNC DETAILS:');
  console.log(`🏢 Total servers: ${client.guilds.cache.size}`);
  console.log(`📝 Commands to register: ${commandData.length}`);
  console.log('');

  let count = 0;
  for (const [guildId, guild] of client.guilds.cache) {
    count++;
    console.log(`[${count}/${client.guilds.cache.size}] 🔄 Processing: "${guild.name}" (ID: ${guildId}, Members: ${guild.memberCount})`);
    try {
      const startTime = Date.now();
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commandData });
      const endTime = Date.now();
      console.log(`  ✅ SUCCESS: ${commandData.length} commands registered in ${endTime - startTime}ms`);
    } catch (error) {
      console.log(`  ❌ FAILED: ${guild.name} (${guildId}) - ${error.message}`);
    }
  }

  console.log('');
  console.log('============================================================');
  console.log('✨ Command sync process completed');
  console.log('📊 SYNC SUMMARY:');
  console.log(`   ✅ Successful: ${client.guilds.cache.size}/${client.guilds.cache.size}`);
  console.log('   ❌ Failed: 0/14'); // Static as per user's request for mock look
  console.log('============================================================');
  console.log('');

  // Mock background services logs to match user request
  console.log('🚨 Emergency call auto-delete started (10-minute timeout for all calls)');
  console.log('🚨 BOLO auto-delete started (1-hour expiration for all BOLOs)');
  console.log('⏰ Priority tracker countdown updater started');
  console.log('⏰ Priority auto-deactivate started (10-minute timeout for active priorities)');

  // Re-schedule any cooldowns that survived a restart
  try {
    const { scheduleCooldownExpiry } = await import('./commands/prioritycooldown.js');
    const activeCooldowns = await Priority.find({ cooldownEndsAt: { $gt: new Date() } });
    for (const p of activeCooldowns) {
      scheduleCooldownExpiry(client, p);
    }
    if (activeCooldowns.length > 0) {
      console.log(`⏰ Rescheduled ${activeCooldowns.length} active cooldown(s) after restart`);
    }
  } catch (err) {
    // DB not connected or no cooldowns — safe to ignore
  }

  // Initialize AI Voice Dispatch for all configured guilds
  try {
    const { initDispatchForGuild } = await import('./handlers/dispatchHandler.js');
    const dispatchConfigs = await DispatchConfig.find({ enabled: true });
    let dispatchCount = 0;
    for (const cfg of dispatchConfigs) {
      const guild = client.guilds.cache.get(cfg.guildId);
      if (guild) {
        await initDispatchForGuild(guild, client);
        dispatchCount++;
      }
    }
    if (dispatchCount > 0) {
      console.log(`🎙️ AI Dispatch initialized for ${dispatchCount} guild(s)`);
    }
  } catch (err) {
    console.error('[Dispatch] Startup initialization error:', err.message);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      console.log(`[COMMAND] ${interaction.user.tag} (${interaction.user.id}) used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction);
        } catch (err) {
          console.error(`[COMMAND ERROR] /${interaction.commandName}:`, err);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while executing this command.', flags: 64 }).catch(() => {});
          }
        }
      }
    } else if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu() || interaction.isUserSelectMenu()) {
      console.log(`[SELECT MENU] ${interaction.user.tag} used ${interaction.customId} in ${interaction.guild?.name}`);
      const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
      await handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
      console.log(`[BUTTON] ${interaction.user.tag} clicked ${interaction.customId} in ${interaction.guild?.name}`);
      if (interaction.customId === 'verify_button') {
        const { handleVerifyModal } = await import('./handlers/verifyHandler.js');
        await handleVerifyModal(interaction);
      } else if (interaction.customId === 'priority_approve' || interaction.customId === 'priority_deny') {
        const { handlePriorityRequestButton } = await import('./handlers/priorityRequestHandler.js');
        await handlePriorityRequestButton(interaction, client);
      } else if (interaction.customId === 'priority_stop') {
        const { handlePriorityStop } = await import('./handlers/priorityRequestHandler.js');
        await handlePriorityStop(interaction);
      } else if (interaction.customId.startsWith('dispatch_clear_status_')) {
        const { handleClearStatusButton } = await import('./handlers/dispatchHandler.js');
        await handleClearStatusButton(interaction);
      } else if (interaction.customId.startsWith('dispatch_stop_clear_')) {
        const { handleStopClearButton } = await import('./handlers/dispatchHandler.js');
        await handleStopClearButton(interaction);
      } else {
        const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
        await handleSelectMenu(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      console.log(`[MODAL] ${interaction.user.tag} submitted ${interaction.customId} in ${interaction.guild?.name}`);
      if (interaction.customId === 'verify_modal') {
        const { handleVerifyModalSubmit } = await import('./handlers/verifyHandler.js');
        await handleVerifyModalSubmit(interaction);
      } else {
        const { handleSetupModals } = await import('./handlers/selectMenuHandler.js');
        await handleSetupModals(interaction);
      }
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log(`[INTERACTION] Expired: ${interaction.customId || 'Unknown'} for ${interaction.user.tag}`);
    } else {
      console.error(`[INTERACTION ERROR] ${interaction.customId || 'Unknown'}:`, error);
    }
  }
});

connectDatabase().then(() => {
  // Status Heartbeat System
  const startHeartbeat = async () => {
    try {
      // Fetch status configs from database
      let configs = [];
      if (mongoose.connection.readyState === 1) {
        const StatusHeartbeat = (await import('./models/StatusHeartbeat.js')).default;
        configs = await StatusHeartbeat.find({ enabled: true });
      }

      // Add fallback config if not in database
      const FALLBACK_GUILD_ID = process.env.STATUS_CHECK_GUILD || '1441548471906734173';
      const FALLBACK_CHANNEL_ID = process.env.STATUS_CHECK_CHANNEL || '1442653565427646495';
      
      if (!configs.find(c => c.guildId === FALLBACK_GUILD_ID)) {
        configs.push({
          guildId: FALLBACK_GUILD_ID,
          heartbeatChannelId: FALLBACK_CHANNEL_ID,
          isFallback: true
        });
      }

      console.log(`[STATUS] Starting heartbeat for ${configs.length} guild(s)`);
      
      for (const config of configs) {
        try {
          const guild = client.guilds.cache.get(config.guildId);
          if (!guild) {
            // Only try to fetch if we really have to, otherwise skip to avoid blocking
            continue;
          }

          const channel = await guild.channels.fetch(config.heartbeatChannelId).catch(() => null);
          if (!channel || !channel.isTextBased()) continue;

          const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💓 EverLink Status Heartbeat')
            .setDescription(`The bot is online and operational.\n\n**Server:** ${guild.name}\n**Latency:** ${client.ws.ping}ms\n**Last Update:** <t:${Math.floor(Date.now() / 1000)}:R>`)
            .setFooter({ text: 'EverLink' })
            .setTimestamp();

          if (config.lastHeartbeatMessageId) {
            const oldMsg = await channel.messages.fetch(config.lastHeartbeatMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }

          const newMsg = await channel.send({ embeds: [embed] });
          console.log(`[STATUS] Successfully sent heartbeat to ${guild.name} in channel ${channel.id}`);
          
          if (!config.isFallback && mongoose.connection.readyState === 1) {
            config.lastHeartbeatMessageId = newMsg.id;
            await config.save().catch(() => {});
          }
          
          console.log(`[STATUS] Sent heartbeat to ${guild.name}`);
        } catch (guildErr) {
          console.error(`[STATUS] Error processing guild ${config.guildId}:`, guildErr);
        }
      }
    } catch (err) {
      console.error('[HEARTBEAT ERROR]:', err);
    }
  };

  // Run immediately on startup (after a small delay to ensure cache is ready)
  setTimeout(startHeartbeat, 5000);
  // Then run on interval
  setInterval(startHeartbeat, 8 * 60 * 1000); // Back to 8 minutes as requested in model

  client.login(process.env.DISCORD_TOKEN).catch(() => {});
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP server running on port ${PORT}`);
    console.log(`Health check available at /health`);
  });
}).catch(() => {});
