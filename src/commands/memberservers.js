import { SlashCommandBuilder, EmbedBuilder, ActivityType } from 'discord.js';
import AuthorizedUser from '../models/AuthorizedUser.js';

export const data = new SlashCommandBuilder()
  .setName('memberservers')
  .setDescription('View authorized servers of a member (Developer Only)')
  .setDefaultMemberPermissions(0) // Hide command from everyone by default
  .addUserOption(option => 
    option.setName('user')
      .setDescription('The user to check')
      .setRequired(true));

import axios from 'axios';

export async function execute(interaction) {
  // Authorized Developer IDs
  const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

  if (!DEVELOPER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '❌ This command is restricted to the bot developer only.',
      ephemeral: true
    });
  }

  const user = interaction.options.getUser('user');
  const userData = await AuthorizedUser.findOne({ userId: user.id });

  if (!userData) {
    return interaction.reply({
      content: `❌ No authorized data found for **${user.tag}**. They need to use \`/auth\` first.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Attempt to refresh the server list using the access token
    const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${userData.accessToken}` },
    });

    if (guildsResponse.data) {
      userData.servers = guildsResponse.data.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        permissions: g.permissions,
      }));
      userData.lastUpdated = new Date();
      await userData.save();
    }
  } catch (error) {
    console.log(`Could not refresh servers for ${user.tag}, using cached data.`);
  }

  const serverList = userData.servers.map((s, i) => `\`${i + 1}.\` **${s.name}** (\`${s.id}\`)`);
  const chunkedServers = [];
  for (let i = 0; i < serverList.length; i += 20) {
    chunkedServers.push(serverList.slice(i, i + 20).join('\n'));
  }

  const nitroStatus = {
    0: 'None',
    1: 'Nitro Classic',
    2: 'Nitro',
    3: 'Nitro Basic'
  }[userData.premiumType] || 'None';

  const embeds = [];
  
  const mainEmbed = new EmbedBuilder()
    .setColor(userData.accentColor || '#5865F2')
    .setTitle(`📊 Authorized Profile: ${userData.username}`)
    .setThumbnail(userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.userId}/${userData.avatar}.png` : null)
    .setDescription(chunkedServers[0] || 'No servers found.')
    .addFields(
      { name: '👤 Global Name', value: userData.globalName || 'None', inline: true },
      { name: '🌍 Locale', value: userData.locale || 'Unknown', inline: true },
      { name: '💎 Nitro', value: nitroStatus, inline: true },
      { name: '🔒 MFA', value: userData.mfaEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📁 Total Servers', value: `\`${userData.servers.length}\``, inline: true },
      { name: '🕒 Updated', value: `<t:${Math.floor(userData.lastUpdated.getTime() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: 'SARP Core Developer Tools' });

  if (userData.banner) {
    mainEmbed.setImage(`https://cdn.discordapp.com/banners/${userData.userId}/${userData.banner}.png?size=600`);
  }

  embeds.push(mainEmbed);

  // Add additional embeds for more servers if they exist
  for (let i = 1; i < chunkedServers.length; i++) {
    if (embeds.length >= 10) break; // Discord limit
    const extraEmbed = new EmbedBuilder()
      .setColor(userData.accentColor || '#5865F2')
      .setDescription(chunkedServers[i])
      .setFooter({ text: `SARP Core Developer Tools - Page ${i + 1}` });
    embeds.push(extraEmbed);
  }

  await interaction.editReply({ embeds });
}
