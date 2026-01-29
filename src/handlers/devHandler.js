import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType } from 'discord.js';
import axios from 'axios';
import AuthorizedUser from '../models/AuthorizedUser.js';
import AutoJoin from '../models/AutoJoin.js';
import AutoRole from '../models/AutoRole.js';

const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

export async function handleDevMenu(interaction) {
  if (!DEVELOPER_IDS.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ Developer only.', flags: [MessageFlags.Ephemeral] });
  }

  const value = interaction.values[0];

  // We only defer for select-based responses. Modals MUST be shown with .showModal() which doesn't work after deferring.
  if (value === 'dev_sendauthlink') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('dev_select_channel_authlink')
      .setPlaceholder('Select a channel to send the link to')
      .setChannelTypes([ChannelType.GuildText]);

    const row = new ActionRowBuilder().addComponents(channelSelect);
    await interaction.editReply({ content: 'Select the channel:', components: [row] });
  } else if (value === 'dev_forcejoin') {
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_forcejoin')
      .setTitle('Force Join User');

    const userIdInput = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('User ID')
      .setPlaceholder('The ID of the authorized user')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const serverIdInput = new TextInputBuilder()
      .setCustomId('server_id')
      .setLabel('Server ID')
      .setPlaceholder('The ID of the target server')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(userIdInput),
      new ActionRowBuilder().addComponents(serverIdInput)
    );
    await interaction.showModal(modal);
  } else if (value === 'dev_autojoin_setup') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('dev_select_role_autojoin')
      .setPlaceholder('Select the role for auto-join');

    const row = new ActionRowBuilder().addComponents(roleSelect);
    await interaction.editReply({ content: 'Select the role:', components: [row] });
  } else if (value === 'dev_autojoin_delete') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('dev_select_role_autojoin_delete')
      .setPlaceholder('Select the role to remove auto-join from');

    const row = new ActionRowBuilder().addComponents(roleSelect);
    await interaction.editReply({ content: 'Select the role:', components: [row] });
  } else if (value === 'dev_autorole_setup') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('dev_select_role_autorole')
      .setPlaceholder('Select the role to give upon authorization');

    const row = new ActionRowBuilder().addComponents(roleSelect);
    await interaction.editReply({ content: 'Select the role:', components: [row] });
  } else if (value === 'dev_autorole_delete') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('dev_select_role_autorole_delete')
      .setPlaceholder('Select the role to remove from auto-role');

    const row = new ActionRowBuilder().addComponents(roleSelect);
    await interaction.editReply({ content: 'Select the role:', components: [row] });
  }
}

export async function handleDevSelect(interaction) {
  const { customId, guildId, values, member } = interaction;

  if (customId === 'dev_select_channel_authlink') {
    const channelId = values[0];
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    
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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Authorize Account').setURL(authUrl).setStyle(ButtonStyle.Link)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.update({ content: `✅ Auth link sent to <#${channelId}>.`, components: [], flags: [MessageFlags.Ephemeral] });
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
    await AutoJoin.deleteOne({ guildId, roleId });
    await interaction.update({ content: `✅ Auto-join for <@&${roleId}> deleted.`, components: [], flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_select_role_autorole') {
    const roleId = values[0];
    await AutoRole.findOneAndUpdate({ guildId, roleId }, { enabled: true }, { upsert: true });
    await interaction.update({ content: `✅ Auto-role for <@&${roleId}> configured.`, components: [], flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_select_role_autorole_delete') {
    const roleId = values[0];
    await AutoRole.deleteOne({ guildId, roleId });
    await interaction.update({ content: `✅ Auto-role for <@&${roleId}> deleted.`, components: [], flags: [MessageFlags.Ephemeral] });
  }
}

export async function handleDevModal(interaction) {
  const { customId, fields, guildId } = interaction;

  if (customId === 'dev_modal_forcejoin') {
    const userId = fields.getTextInputValue('user_id');
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
      await interaction.editReply({ content: `✅ Added user to server.` });
    } catch (e) {
      await interaction.editReply({ content: `❌ Error: ${e.message}` });
    }
  } else if (customId.startsWith('dev_modal_autojoin_setup_')) {
    const roleId = customId.split('_').pop();
    const serverId = fields.getTextInputValue('server_id');
    await AutoJoin.findOneAndUpdate({ guildId, roleId }, { targetServerId: serverId, enabled: true }, { upsert: true });
    await interaction.reply({ content: '✅ Auto-join configured.', flags: [MessageFlags.Ephemeral] });
  }
}
