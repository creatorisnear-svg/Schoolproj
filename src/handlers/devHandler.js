import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ChannelType } from 'discord.js';
import axios from 'axios';
import AuthorizedUser from '../models/AuthorizedUser.js';
import AutoJoin from '../models/AutoJoin.js';
import AutoRole from '../models/AutoRole.js';

const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

export async function handleDevMenu(interaction) {
  try {
    if (!DEVELOPER_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Developer only.', flags: [MessageFlags.Ephemeral] });
    }

    const value = interaction.values[0];

    if (value === 'dev_sendauthlink') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('dev_select_channel_authlink')
        .setPlaceholder('Select a channel to send the link to')
        .setChannelTypes([ChannelType.GuildText]);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      await interaction.editReply({ content: 'Select the channel:', components: [row] });
    } else if (value === 'dev_forcejoin') {
      const userSelect = new UserSelectMenuBuilder()
        .setCustomId('dev_select_user_forcejoin')
        .setPlaceholder('Select the user to force join');

      const row = new ActionRowBuilder().addComponents(userSelect);
      await interaction.reply({ content: 'Select the user:', components: [row], flags: [MessageFlags.Ephemeral] });
    } else if (value === 'dev_voiceconnect') {
      const userSelect = new UserSelectMenuBuilder()
        .setCustomId('dev_select_user_voiceconnect')
        .setPlaceholder('Select the user to connect');

      const row = new ActionRowBuilder().addComponents(userSelect);
      await interaction.reply({ content: 'Select the user:', components: [row], flags: [MessageFlags.Ephemeral] });
    } else if (value === 'dev_autojoin_setup') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('dev_select_role_autojoin')
        .setPlaceholder('Select the role for auto-join');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      await interaction.editReply({ content: 'Select the role:', components: [row] });
    } else if (value === 'dev_autojoin_delete') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('dev_select_role_autojoin_delete')
        .setPlaceholder('Select the role to remove auto-join from');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      await interaction.editReply({ content: 'Select the role:', components: [row] });
    } else if (value === 'dev_autorole_setup') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('dev_select_role_autorole')
        .setPlaceholder('Select the role to give upon authorization');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      await interaction.editReply({ content: 'Select the role:', components: [row] });
    } else if (value === 'dev_autorole_delete') {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('dev_select_role_autorole_delete')
        .setPlaceholder('Select the role to remove from auto-role');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      await interaction.editReply({ content: 'Select the role:', components: [row] });
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log('⚠️ Interaction expired in handleDevMenu.');
    } else {
      console.error('❌ Error in handleDevMenu:', error);
    }
  }
}

export async function handleDevSelect(interaction) {
  const { customId, values } = interaction;
  try {
    if (customId === 'dev_select_channel_authlink') {
      const channelId = values[0];
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      
      const clientId = process.env.DISCORD_CLIENT_ID;
      const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
      const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
      const redirectUri = `https://${cleanDomain}/callback`;
      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds%20guilds.join%20connections%20voice`;

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔐 Account Authorization')
        .setDescription('To securely authorize your account with SARP Core, please click the button below.\n\n*Note: This is required for advanced verification features. Your data is handled securely.*')
        .setFooter({ text: 'SARP Core' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Authorize Account').setURL(authUrl).setStyle(ButtonStyle.Link)
      );

      await channel.send({ embeds: [embed], components: [row] });
      await interaction.update({ content: `✅ Auth link sent to <#${channelId}>.`, components: [], flags: [MessageFlags.Ephemeral] });
    } else if (customId === 'dev_select_user_forcejoin') {
      const userId = values[0];
      const modal = new ModalBuilder()
        .setCustomId(`dev_modal_forcejoin_server_${userId}`)
        .setTitle('Force Join Server');

      const serverIdInput = new TextInputBuilder()
        .setCustomId('server_id')
        .setLabel('Target Server ID')
        .setPlaceholder('The ID of the server to join')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
      await interaction.showModal(modal);
    } else if (customId === 'dev_select_user_voiceconnect') {
      const userId = values[0];
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId(`dev_select_voicechannel_connect_${userId}`)
        .setPlaceholder('Select the voice channel to connect to')
        .setChannelTypes([ChannelType.GuildVoice]);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      await interaction.update({ content: 'Select the voice channel:', components: [row] });
    } else if (customId.startsWith('dev_select_voicechannel_connect_')) {
      const userId = customId.split('_').pop();
      const channelId = values[0];
      const userData = await AuthorizedUser.findOne({ userId });

      if (!userData || !userData.accessToken) {
        return interaction.update({ content: '❌ User not authorized.', components: [], flags: [MessageFlags.Ephemeral] });
      }

      try {
        await axios.patch(
          `https://discord.com/api/guilds/${interaction.guildId}/members/${userId}`,
          { channel_id: channelId },
          { headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        await interaction.update({ content: `✅ Moved <@${userId}> to <#${channelId}>.`, components: [], flags: [MessageFlags.Ephemeral] });
      } catch (e) {
        await interaction.update({ content: `❌ Error: ${e.response?.data?.message || e.message}`, components: [], flags: [MessageFlags.Ephemeral] });
      }
    } else if (customId === 'dev_select_role_autojoin') {
      const roleId = values[0];
      
      const modal = new ModalBuilder()
        .setCustomId(`dev_modal_autojoin_setup_${roleId}`)
        .setTitle('Auto-Join Setup');

      const serverIdInput = new TextInputBuilder()
        .setCustomId('server_id')
        .setLabel('Target Server ID')
        .setPlaceholder('The server to force join into')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
      await interaction.showModal(modal);
    } else if (customId === 'dev_select_role_autojoin_delete') {
      const roleId = values[0];
      await AutoJoin.deleteOne({ guildId: interaction.guildId, roleId });
      await interaction.update({ content: `✅ Auto-join for <@&${roleId}> deleted.`, components: [], flags: [MessageFlags.Ephemeral] });
    } else if (customId === 'dev_select_role_autorole') {
      const roleId = values[0];
      await AutoRole.findOneAndUpdate({ guildId: interaction.guildId, roleId }, { enabled: true }, { upsert: true });
      await interaction.update({ content: `✅ Auto-role for <@&${roleId}> configured.`, components: [], flags: [MessageFlags.Ephemeral] });
    } else if (customId === 'dev_select_role_autorole_delete') {
      const roleId = values[0];
      await AutoRole.deleteOne({ guildId: interaction.guildId, roleId });
      await interaction.update({ content: `✅ Auto-role for <@&${roleId}> deleted.`, components: [], flags: [MessageFlags.Ephemeral] });
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log('⚠️ Interaction expired in handleDevSelect.');
    } else {
      console.error('❌ Error in handleDevSelect:', error);
    }
  }
}

export async function handleDevModal(interaction) {
  const { customId, fields } = interaction;
  try {
    if (customId.startsWith('dev_modal_forcejoin_server_')) {
      const userId = customId.split('_').pop();
      const serverId = fields.getTextInputValue('server_id');
      const userData = await AuthorizedUser.findOne({ userId });

      if (!userData || !userData.accessToken) {
        return interaction.reply({ content: '❌ User not authorized.', flags: [MessageFlags.Ephemeral] });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      try {
        await axios.put(
          `https://discord.com/api/guilds/${serverId}/members/${userId}`,
          { access_token: userData.accessToken },
          { headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        await interaction.editReply({ content: `✅ Added <@${userId}> to server ${serverId}.` });
      } catch (e) {
        await interaction.editReply({ content: `❌ Error: ${e.response?.data?.message || e.message}` });
      }
    } else if (customId.startsWith('dev_modal_autojoin_setup_')) {
      const roleId = customId.split('_').pop();
      const serverId = fields.getTextInputValue('server_id');
      await AutoJoin.findOneAndUpdate({ guildId: interaction.guildId, roleId }, { targetServerId: serverId, enabled: true }, { upsert: true });
      await interaction.reply({ content: '✅ Auto-join configured.', flags: [MessageFlags.Ephemeral] });
    }
  } catch (error) {
    if (error.code === 10062) {
      console.log('⚠️ Interaction expired in handleDevModal.');
    } else {
      console.error('❌ Error in handleDevModal:', error);
    }
  }
}
