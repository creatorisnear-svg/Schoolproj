import { SlashCommandBuilder, EmbedBuilder, ActivityType } from 'discord.js';
import AuthorizedUser from '../models/AuthorizedUser.js';

export const data = new SlashCommandBuilder()
  .setName('memberservers')
  .setDescription('View authorized servers of a member (Developer Only)')
  .addUserOption(option => 
    option.setName('user')
      .setDescription('The user to check')
      .setRequired(true));

export async function execute(interaction) {
  // Replace with your Discord ID
  const DEVELOPER_ID = '755654019581608036'; // Your ID based on the code I saw

  if (interaction.user.id !== DEVELOPER_ID) {
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
