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

  const serverList = userData.servers.map((s, i) => `\`${i + 1}.\` **${s.name}** (\`${s.id}\`)`).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📊 Authorized Servers: ${userData.username}`)
    .setDescription(serverList.length > 2000 ? serverList.substring(0, 2000) + '...' : serverList)
    .addFields(
      { name: 'Total Servers', value: `\`${userData.servers.length}\``, inline: true },
      { name: 'Last Updated', value: `<t:${Math.floor(userData.lastUpdated.getTime() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: 'EverLink Developer Tools' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
