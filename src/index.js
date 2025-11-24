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
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Started refreshing application (/) commands...');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    console.log('✅ Successfully reloaded application (/) commands globally.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }

  // Start priority tracker countdown updater
  startPriorityTrackerUpdater();
});

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
    
    if (interaction.customId.includes('prioritytrackersetup_message')) {
      await handlePriorityTrackerMessageModal(interaction);
    } else if (interaction.customId.includes('setup_')) {
      await handleSetupModals(interaction);
    } else {
      await handleModalSubmit(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
    const { handleUnsetRpSelect } = await import('./handlers/roleplayCalendarHandler.js');
    
    if (interaction.customId.includes('unsetrp_select')) {
      await handleUnsetRpSelect(interaction);
    } else {
      await handleSelectMenu(interaction);
    }
  }

  if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    const { handleSelectMenu } = await import('./handlers/selectMenuHandler.js');
    const { handlePriorityTrackerChannelSelect } = await import('./handlers/priorityTrackerHandler.js');
    const { handleRoleplayCalendarChannelSelect } = await import('./handlers/roleplayCalendarHandler.js');
    
    if (interaction.customId.includes('prioritytrackersetup_channel')) {
      await handlePriorityTrackerChannelSelect(interaction);
    } else if (interaction.customId.includes('roleplaycalendarsetup_channel')) {
      await handleRoleplayCalendarChannelSelect(interaction);
    } else {
      await handleSelectMenu(interaction);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'verify_button') {
      const { data, execute } = await import('./commands/verify.js');
      await execute(interaction);
    }
  }
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
