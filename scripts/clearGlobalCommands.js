import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID || '1441306995641683978';

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

console.log('Clearing all global commands...');

rest.put(Routes.applicationCommands(clientId), { body: [] })
  .then(() => console.log('Done — all global commands deleted. Discord may take up to 1 hour to reflect this but usually takes under a minute.'))
  .catch(err => console.error('Failed:', err.message));
