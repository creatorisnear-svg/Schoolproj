import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('auth')
  .setDescription('Authorize your account for verification');

export async function execute(interaction) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
  
  // Clean domain to ensure it's well-formed
  const cleanDomain = domain ? domain.split(',')[0].trim() : '';
  const redirectUri = `https://${cleanDomain}/callback`;
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;

  console.log(`[AUTH COMMAND] Domain: ${cleanDomain}`);
  console.log(`[AUTH COMMAND] Redirect URI: ${redirectUri}`);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🔐 Account Authorization')
    .setDescription(`To securely authorize your account with EverLink, please click the link below.\n\n**[Click Here to Authorize](${authUrl})**\n\n*Note: If the link shows an error, please ensure you are using the official URL: https://${cleanDomain}*`)
    .setFooter({ text: 'EverLink' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
