import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import AuthorizedUser from '../models/AuthorizedUser.js';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('memberservers')
  .setDescription('View authorized servers of a member (Developer Only)')
  .setDefaultMemberPermissions(0) // Hide command from everyone by default
  .addUserOption(option => 
    option.setName('user')
      .setDescription('The user to check')
      .setRequired(true));

// Function to fetch ALL servers with pagination
async function fetchAllServers(accessToken) {
  const allServers = [];
  let lastId = null;
  
  while (true) {
    const url = lastId 
      ? `https://discord.com/api/users/@me/guilds?limit=200&after=${lastId}`
      : 'https://discord.com/api/users/@me/guilds?limit=200';
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.data || response.data.length === 0) break;
    
    allServers.push(...response.data);
    
    if (response.data.length < 200) break;
    
    lastId = response.data[response.data.length - 1].id;
  }
  
  return allServers;
}

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
    // Attempt to refresh the server list using the access token with pagination
    const allGuilds = await fetchAllServers(userData.accessToken);

    if (allGuilds.length > 0) {
      userData.servers = allGuilds.map(g => ({
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

  const servers = userData.servers;
  const serversPerPage = 20;
  const totalPages = Math.ceil(servers.length / serversPerPage);
  let currentPage = 0;

  const nitroStatus = {
    0: 'None',
    1: 'Nitro Classic',
    2: 'Nitro',
    3: 'Nitro Basic'
  }[userData.premiumType] || 'None';

  const createEmbed = (page) => {
    const start = page * serversPerPage;
    const end = start + serversPerPage;
    const pageServers = servers.slice(start, end);
    const serverList = pageServers.map((s, i) => `\`${start + i + 1}.\` **${s.name}** (\`${s.id}\`)`).join('\n');

    const embed = new EmbedBuilder()
      .setColor(userData.accentColor || '#5865F2')
      .setTitle(`📊 Authorized Profile: ${userData.username}`)
      .setThumbnail(userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.userId}/${userData.avatar}.png` : null)
      .setDescription(serverList || 'No servers found.')
      .addFields(
        { name: '👤 Global Name', value: userData.globalName || 'None', inline: true },
        { name: '🌍 Locale', value: userData.locale || 'Unknown', inline: true },
        { name: '💎 Nitro', value: nitroStatus, inline: true },
        { name: '🔒 MFA', value: userData.mfaEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: '📁 Total Servers', value: `\`${servers.length}\``, inline: true },
        { name: '🕒 Updated', value: `<t:${Math.floor(userData.lastUpdated.getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: `RolePlayManager Developer Tools | Page ${page + 1} of ${totalPages}` });

    if (userData.banner && page === 0) {
      embed.setImage(`https://cdn.discordapp.com/banners/${userData.userId}/${userData.banner}.png?size=600`);
    }

    return embed;
  };

  const createButtons = (page) => {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('memberservers_first')
          .setLabel('⏮ First')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('memberservers_prev')
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('memberservers_page')
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('memberservers_next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId('memberservers_last')
          .setLabel('Last ⏭')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      );
    return row;
  };

  const message = await interaction.editReply({ 
    embeds: [createEmbed(currentPage)], 
    components: totalPages > 1 ? [createButtons(currentPage)] : []
  });

  if (totalPages <= 1) return;

  const collector = message.createMessageComponentCollector({ 
    time: 300000 // 5 minutes
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: '❌ You cannot use these buttons.', ephemeral: true });
    }

    switch (i.customId) {
      case 'memberservers_first':
        currentPage = 0;
        break;
      case 'memberservers_prev':
        currentPage = Math.max(0, currentPage - 1);
        break;
      case 'memberservers_next':
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        break;
      case 'memberservers_last':
        currentPage = totalPages - 1;
        break;
    }

    await i.update({ 
      embeds: [createEmbed(currentPage)], 
      components: [createButtons(currentPage)] 
    });
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch (error) {
      // Message may have been deleted
    }
  });
}
