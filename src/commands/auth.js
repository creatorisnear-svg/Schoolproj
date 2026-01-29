import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('auth')
  .setDescription('Authorize your account for verification');

export async function execute(interaction) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
  
  // Clean domain and ensure it's lowercase, no protocol, no trailing slash
  const cleanDomain = domain.toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
    
  const redirectUri = `https://${cleanDomain}/callback`;
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🔐 Account Authorization')
    .setDescription(`To securely authorize your account with EverLink, please click the link below.\n\n**[Click Here to Authorize](${authUrl})**\n\n**⚠️ Action Required:**\nYou must add this exact URL to your Discord Developer Portal under "Redirects":\n\`${redirectUri}\``)
    .setFooter({ text: 'EverLink' });

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
