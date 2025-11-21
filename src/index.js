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
});

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
    await handleModalSubmit(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('continue_sareport_')) {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
      
      const userId = interaction.customId.split('_')[2];
      
      const modal = new ModalBuilder()
        .setCustomId(`sareport_part2_${userId}`)
        .setTitle('San Andreas Report (2/2)');

      const violationsInput = new TextInputBuilder()
        .setCustomId('violations')
        .setLabel('Violations')
        .setPlaceholder('List all violations/charges')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const fineAmountInput = new TextInputBuilder()
        .setCustomId('fineAmount')
        .setLabel('Fine Amount')
        .setPlaceholder('e.g., $5,000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const jailTimeInput = new TextInputBuilder()
        .setCustomId('jailTime')
        .setLabel('Jail Time')
        .setPlaceholder('e.g., 30 months')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes')
        .setPlaceholder('Any additional notes...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const officerInfoInput = new TextInputBuilder()
        .setCustomId('officerInfo')
        .setLabel('Officer Callsign & Agency')
        .setPlaceholder('Line 1: Officer Callsign\nLine 2: Agency')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(violationsInput);
      const row2 = new ActionRowBuilder().addComponents(fineAmountInput);
      const row3 = new ActionRowBuilder().addComponents(jailTimeInput);
      const row4 = new ActionRowBuilder().addComponents(notesInput);
      const row5 = new ActionRowBuilder().addComponents(officerInfoInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      await interaction.showModal(modal);
    }
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
