import { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } from 'discord.js';
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
const PORT = process.env.PORT || 3000;

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('No code provided');

  try {
    const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const redirectUri = `https://${cleanDomain}/callback`;

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
  const command = await import(`file://${join(__dirname, 'commands', file)}`);
  if (command.data && command.execute) client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandData = Array.from(client.commands.values()).map(c => c.data.toJSON());
  client.guilds.cache.forEach(g => rest.put(Routes.applicationGuildCommands(client.user.id, g.id), { body: commandData }).catch(() => {}));
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction).catch(() => {});
  } else if (interaction.isStringSelectMenu() && interaction.customId === 'dev_menu') {
    const { handleDevMenu } = await import('./handlers/devHandler.js');
    await handleDevMenu(interaction);
  } else if ((interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) && interaction.customId.startsWith('dev_select_')) {
    const { handleDevSelect } = await import('./handlers/devHandler.js');
    await handleDevSelect(interaction);
  } else if (interaction.isModalSubmit() && interaction.customId.startsWith('dev_modal_')) {
    const { handleDevModal } = await import('./handlers/devHandler.js');
    await handleDevModal(interaction);
  }
});

connectDatabase().then(() => {
  client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err.message));
  app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));
}).catch(err => console.error('❌ Database connection failed:', err.message));
