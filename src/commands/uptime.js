import { SlashCommandBuilder } from 'discord.js';

// Global variable to track bot start time
let botStartTime = Date.now();

export function setBotStartTime() {
  botStartTime = Date.now();
}

function formatUptime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  let uptime = '';
  if (days > 0) uptime += `${days}d `;
  if (hours > 0) uptime += `${hours}h `;
  if (minutes > 0) uptime += `${minutes}m `;
  uptime += `${seconds}s`;
  
  return uptime;
}

export const data = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Check how long the bot has been online');

export async function execute(interaction) {
  const uptime = Date.now() - botStartTime;
  const uptimeStr = formatUptime(uptime);

  await interaction.reply({
    embeds: [{
      color: 0x00FF00,
      title: '🟢 EverLink Uptime',
      description: `Bot has been online for: **${uptimeStr}**`,
      footer: { text: 'EverLink' },
      timestamp: new Date()
    }],
    ephemeral: true
  });
}
