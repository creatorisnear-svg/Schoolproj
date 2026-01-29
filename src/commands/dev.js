import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import AuthorizedUser from '../models/AuthorizedUser.js';
import axios from 'axios';

import AutoJoin from '../models/AutoJoin.js';

import AutoRole from '../models/AutoRole.js';

const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

export const data = new SlashCommandBuilder()
  .setName('dev')
  .setDescription('Developer only commands')
  .setDefaultMemberPermissions(0)
  .addSubcommand(subcommand =>
    subcommand
      .setName('sendauthlink')
      .setDescription('Send an auth link with a button to a channel')
      .addChannelOption(option => option.setName('channel').setDescription('The channel to send the link to').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('forcejoin')
      .setDescription('Force a user to join a server')
      .addUserOption(option => option.setName('user').setDescription('The user').setRequired(true))
      .addStringOption(option => option.setName('serverid').setDescription('The Server ID').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('autojoinsetup')
      .setDescription('Configure auto-join for roles')
      .addRoleOption(option => option.setName('role').setDescription('The role to trigger auto-join').setRequired(true))
      .addStringOption(option => option.setName('serverid').setDescription('The Server ID to join').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('autojoindelete')
      .setDescription('Delete an auto-join configuration')
      .addRoleOption(option => option.setName('role').setDescription('The role to remove auto-join from').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('autorolesetup')
      .setDescription('Set a role to be automatically given upon authorization')
      .addRoleOption(option => option.setName('role').setDescription('The role to give').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('autoroledelete')
      .setDescription('Remove an auto-role configuration')
      .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true))
  );

export async function execute(interaction) {
  if (!DEVELOPER_IDS.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ Developer only.', flags: [MessageFlags.Ephemeral] });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'sendauthlink') {
    const channel = interaction.options.getChannel('channel');
    const clientId = process.env.DISCORD_CLIENT_ID;
    const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const redirectUri = `https://${cleanDomain}/callback`;
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds%20guilds.join`;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🔐 Account Authorization')
      .setDescription('To securely authorize your account with SARP Core, please click the button below.\n\n*Note: This is required for advanced verification features. Your data is handled securely.*')
      .setFooter({ text: 'SARP Core' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Authorize Account')
          .setURL(authUrl)
          .setStyle(ButtonStyle.Link)
      );

    try {
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Authorization link sent to ${channel}.`, flags: [MessageFlags.Ephemeral] });
    } catch (e) {
      return interaction.reply({ content: `❌ Failed to send message: ${e.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }

  if (subcommand === 'forcejoin') {
    const user = interaction.options.getUser('user');
    const serverId = interaction.options.getString('serverid');
    const userData = await AuthorizedUser.findOne({ userId: user.id });

    if (!userData || !userData.accessToken) {
      return interaction.reply({ content: '❌ User not authorized.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      await axios.put(
        `https://discord.com/api/guilds/${serverId}/members/${user.id}`,
        { access_token: userData.accessToken },
        { headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      await interaction.editReply({ content: `✅ Added **${user.tag}** to \`${serverId}\`.` });
    } catch (e) {
      await interaction.editReply({ content: `❌ Error: ${e.message}` });
    }
  }

  if (subcommand === 'autojoinsetup') {
    const role = interaction.options.getRole('role');
    const serverId = interaction.options.getString('serverid');
    
    await AutoJoin.findOneAndUpdate(
      { guildId: interaction.guildId, roleId: role.id },
      { targetServerId: serverId, enabled: true },
      { upsert: true }
    );

    await interaction.reply({ content: `✅ Auto-join configured: Users with role **${role.name}** will be forced into server \`${serverId}\`.`, flags: [MessageFlags.Ephemeral] });
  }

  if (subcommand === 'autojoindelete') {
    const role = interaction.options.getRole('role');
    
    const result = await AutoJoin.deleteOne({ 
      guildId: interaction.guildId, 
      roleId: role.id 
    });

    if (result.deletedCount > 0) {
      await interaction.reply({ content: `✅ Auto-join configuration for role **${role.name}** has been deleted.`, flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.reply({ content: `❌ No auto-join configuration found for role **${role.name}**.`, flags: [MessageFlags.Ephemeral] });
    }
  }

  if (subcommand === 'autorolesetup') {
    const role = interaction.options.getRole('role');
    
    await AutoRole.findOneAndUpdate(
      { guildId: interaction.guildId, roleId: role.id },
      { enabled: true },
      { upsert: true }
    );

    await interaction.reply({ content: `✅ Auto-role configured: Users will receive the **${role.name}** role upon authorization.`, flags: [MessageFlags.Ephemeral] });
  }

  if (subcommand === 'autoroledelete') {
    const role = interaction.options.getRole('role');
    
    const result = await AutoRole.deleteOne({ 
      guildId: interaction.guildId, 
      roleId: role.id 
    });

    if (result.deletedCount > 0) {
      await interaction.reply({ content: `✅ Auto-role for **${role.name}** deleted.`, flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.reply({ content: `❌ No auto-role configuration found for **${role.name}**.`, flags: [MessageFlags.Ephemeral] });
    }
  }
}
