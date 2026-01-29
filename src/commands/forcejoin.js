import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import AuthorizedUser from '../models/AuthorizedUser.js';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('forcejoin')
  .setDescription('Make an authorized user join a server (Developer Only)')
  .setDefaultMemberPermissions(0)
  .addUserOption(option => 
    option.setName('user')
      .setDescription('The user to add to the server')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('serverid')
      .setDescription('The ID of the server to add them to')
      .setRequired(true));

export async function execute(interaction) {
  const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

  if (!DEVELOPER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '❌ This command is restricted to the bot developer only.',
      ephemeral: true
    });
  }

  const user = interaction.options.getUser('user');
  const serverId = interaction.options.getString('serverid');

  const userData = await AuthorizedUser.findOne({ userId: user.id });

  if (!userData) {
    return interaction.reply({
      content: `❌ No authorized data found for **${user.tag}**. They need to use \`/auth\` first.`,
      ephemeral: true
    });
  }

  if (!userData.accessToken) {
    return interaction.reply({
      content: `❌ No access token found for **${user.tag}**. They need to re-authorize using \`/auth\`.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const botToken = process.env.DISCORD_TOKEN;
    
    const response = await axios.put(
      `https://discord.com/api/guilds/${serverId}/members/${user.id}`,
      {
        access_token: userData.accessToken
      },
      {
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 201) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ User Added to Server')
        .setDescription(`Successfully added **${user.tag}** to server \`${serverId}\`.`)
        .setFooter({ text: 'SARP Core Developer Tools' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (response.status === 204) {
      await interaction.editReply({
        content: `ℹ️ **${user.tag}** is already a member of that server.`
      });
    }
  } catch (error) {
    console.error('Force join error:', error.response?.data || error.message);
    
    let errorMessage = 'An unknown error occurred.';
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        errorMessage = 'The user\'s authorization has expired. They need to re-authorize using `/auth`.';
      } else if (status === 403) {
        errorMessage = 'The bot does not have permission to add members to that server. Make sure the bot is in the server with the "Create Instant Invite" permission.';
      } else if (status === 404) {
        errorMessage = 'Server not found. Make sure the server ID is correct and the bot is in that server.';
      } else if (data?.message) {
        errorMessage = data.message;
      }
    }

    await interaction.editReply({
      content: `❌ Failed to add user to server: ${errorMessage}`
    });
  }
}
