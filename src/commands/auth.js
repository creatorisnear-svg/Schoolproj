import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('auth')
  .setDescription('Authorize your account for verification');

export async function execute(interaction) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const domain = process.env.DOMAIN || process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
  
  if (!domain) {
    return interaction.reply({ 
      content: '❌ Error: No domain configured. Please set a `DOMAIN` environment variable in Koyeb (e.g., `severe-daryl-officialplaystation5-0f1738f5.koyeb.app`).', 
      flags: [MessageFlags.Ephemeral] 
    });
  }

  // Domain cleaning for Koyeb: lowercase and remove any protocol/slashes
  const cleanDomain = domain.toLowerCase().split(',')[0].trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const redirectUri = `https://${cleanDomain}/callback`;
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;

  console.log(`[AUTH COMMAND] Domain: ${cleanDomain}`);
  console.log(`[AUTH COMMAND] Redirect URI: ${redirectUri}`);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🔐 Account Authorization')
    .setDescription(`To securely authorize your account with EverLink, please click the link below.\n\n**[Click Here to Authorize](${authUrl})**\n\n**⚠️ Action Required:**\nYou must add this exact URL to your Discord Developer Portal under "Redirects":\n\`${redirectUri}\``)
    .setFooter({ text: 'EverLink' });

  await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}
