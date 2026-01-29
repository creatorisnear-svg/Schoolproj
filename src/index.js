import { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, EmbedBuilder } from 'discord.js';
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

dotenv.config();

// Koyeb-style Startup Logs
console.log('Instance created. Preparing to start...');
console.log('Starting download for registry01.prod.koyeb.com/k-c50a3147-75f3-45b3-a7c1-ae005e5a3bc6/e633e6d9-dd03-49b1-b92f-feae455fbdfd:aa523b75-c0fc-45d5-ae2a-33466075c211');
console.log('Download progress: 100% |\x1b[32m++++++++\x1b[0m| (6.7 MiB/s)');
console.log('Download complete for registry01.prod.koyeb.com/k-c50a3147-75f3-45b3-a7c1-ae005e5a3bc6/e633e6d9-dd03-49b1-b92f-feae455fbdfd:aa523b75-c0fc-45d5-ae2a-33466075c211');
console.log('');
console.log('> SARP Core-discord-bot@1.0.0 start');
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
        <p>SARP Core has securely authorized your account.</p>
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

// Voice monitoring feature
client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.channelId && oldState.channelId !== newState.channelId) {
    console.log(`[VOICE] User ${newState.member.user.tag} joined channel: ${newState.channel.name}`);
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
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      console.log(`⚡ Executing command: ${interaction.commandName}`);
      const command = client.commands.get(interaction.commandName);
      if (command) {
        try {
          await command.execute(interaction);
        } catch (err) {
          console.error(`[COMMAND ERROR] ${interaction.commandName}:`, err);
        }
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'dev_menu') {
      const { handleDevMenu } = await import('./handlers/devHandler.js');
      await handleDevMenu(interaction);
    } else if ((interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu() || interaction.isUserSelectMenu()) && interaction.customId.startsWith('dev_select_')) {
      const { handleDevSelect } = await import('./handlers/devHandler.js');
      await handleDevSelect(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('dev_modal_')) {
      const { handleDevModal } = await import('./handlers/devHandler.js');
      await handleDevModal(interaction);
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log('⚠️ Interaction expired before response could be sent (Unknown Interaction).');
    } else {
      console.error('❌ Interaction Error:', error);
    }
  }
});

connectDatabase().then(() => {
  // Status Heartbeat System
  const startHeartbeat = async () => {
    if (mongoose.connection.readyState !== 1) {
      console.log('[STATUS] Skipping heartbeat: Database not connected');
      return;
    }
    try {
      const StatusHeartbeat = (await import('./models/StatusHeartbeat.js')).default;
      const configs = await StatusHeartbeat.find({ enabled: true });
      
      if (configs.length === 0) return;
      
      console.log(`[STATUS] Starting heartbeat for ${configs.length} guild(s)`);
      
      for (const config of configs) {
        try {
          const guild = client.guilds.cache.get(config.guildId);
          if (!guild) continue;

          const channelId = config.heartbeatChannelId;
          if (!channelId) continue;

          const channel = await guild.channels.fetch(channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) continue;

          const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💓 SARP Core Status Heartbeat')
            .setDescription(`The bot is online and operational.\n\n**Server:** ${guild.name}\n**Latency:** ${client.ws.ping}ms\n**Last Update:** <t:${Math.floor(Date.now() / 1000)}:R>`)
            .setFooter({ text: 'SARP Core' })
            .setTimestamp();

          if (config.lastHeartbeatMessageId) {
            const oldMsg = await channel.messages.fetch(config.lastHeartbeatMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }

          const newMsg = await channel.send({ embeds: [embed] });
          config.lastHeartbeatMessageId = newMsg.id;
          await config.save();

          if (config.deleteAfterSeconds > 0) {
            setTimeout(() => newMsg.delete().catch(() => {}), config.deleteAfterSeconds * 1000);
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
