import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('auth')
  .setDescription('Get the authorization link to see your servers');

export async function execute(interaction) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
  const redirectUri = `https://${domain}/callback`;
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('🔐 Account Authorization')
    .setDescription(`To allow EverLink to see which servers you are in, please click the link below and authorize the bot.\n\n**[Click Here to Authorize](${authUrl})**\n\n*Note: This only gives the bot permission to see your server list. It cannot manage your account.*`)
    .setFooter({ text: 'EverLink' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
