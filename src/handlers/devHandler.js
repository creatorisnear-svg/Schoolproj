import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
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

  if (value === 'dev_sendauthlink') {
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_sendauthlink')
      .setTitle('Send Auth Link');

    const channelInput = new TextInputBuilder()
      .setCustomId('channel_id')
      .setLabel('Channel ID')
      .setPlaceholder('Enter the ID of the channel to send the link to')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
    await interaction.showModal(modal);
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
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_autojoin_setup')
      .setTitle('Auto-Join Setup');

    const roleIdInput = new TextInputBuilder()
      .setCustomId('role_id')
      .setLabel('Role ID')
      .setPlaceholder('The role that triggers the join')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const serverIdInput = new TextInputBuilder()
      .setCustomId('server_id')
      .setLabel('Target Server ID')
      .setPlaceholder('The server to force join into')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(roleIdInput),
      new ActionRowBuilder().addComponents(serverIdInput)
    );
    await interaction.showModal(modal);
  } else if (value === 'dev_autojoin_delete') {
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_autojoin_delete')
      .setTitle('Auto-Join Delete');

    const roleIdInput = new TextInputBuilder()
      .setCustomId('role_id')
      .setLabel('Role ID')
      .setPlaceholder('The role to remove from auto-join')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
    await interaction.showModal(modal);
  } else if (value === 'dev_autorole_setup') {
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_autorole_setup')
      .setTitle('Auto-Role Setup');

    const roleIdInput = new TextInputBuilder()
      .setCustomId('role_id')
      .setLabel('Role ID')
      .setPlaceholder('The role to give upon authorization')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
    await interaction.showModal(modal);
  } else if (value === 'dev_autorole_delete') {
    const modal = new ModalBuilder()
      .setCustomId('dev_modal_autorole_delete')
      .setTitle('Auto-Role Delete');

    const roleIdInput = new TextInputBuilder()
      .setCustomId('role_id')
      .setLabel('Role ID')
      .setPlaceholder('The role to remove from auto-role')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
    await interaction.showModal(modal);
  }
}

export async function handleDevModal(interaction) {
  const { customId, fields, guildId } = interaction;

  if (customId === 'dev_modal_sendauthlink') {
    const channelId = fields.getTextInputValue('channel_id');
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: '❌ Invalid channel ID.', flags: [MessageFlags.Ephemeral] });

    const clientId = process.env.DISCORD_CLIENT_ID;
    const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const redirectUri = `https://${cleanDomain}/callback`;
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds%20guilds.join`;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🔐 Account Authorization')
      .setDescription('To securely authorize your account with SARP Core, please click the button below.')
      .setFooter({ text: 'SARP Core' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Authorize Account').setURL(authUrl).setStyle(ButtonStyle.Link)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Auth link sent.', flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_modal_forcejoin') {
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
  } else if (customId === 'dev_modal_autojoin_setup') {
    const roleId = fields.getTextInputValue('role_id');
    const serverId = fields.getTextInputValue('server_id');
    await AutoJoin.findOneAndUpdate({ guildId, roleId }, { targetServerId: serverId, enabled: true }, { upsert: true });
    await interaction.reply({ content: '✅ Auto-join configured.', flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_modal_autojoin_delete') {
    const roleId = fields.getTextInputValue('role_id');
    await AutoJoin.deleteOne({ guildId, roleId });
    await interaction.reply({ content: '✅ Auto-join deleted.', flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_modal_autorole_setup') {
    const roleId = fields.getTextInputValue('role_id');
    await AutoRole.findOneAndUpdate({ guildId, roleId }, { enabled: true }, { upsert: true });
    await interaction.reply({ content: '✅ Auto-role configured.', flags: [MessageFlags.Ephemeral] });
  } else if (customId === 'dev_modal_autorole_delete') {
    const roleId = fields.getTextInputValue('role_id');
    await AutoRole.deleteOne({ guildId, roleId });
    await interaction.reply({ content: '✅ Auto-role deleted.', flags: [MessageFlags.Ephemeral] });
  }
}
