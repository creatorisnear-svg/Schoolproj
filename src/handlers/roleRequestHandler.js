import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder, UserSelectMenuBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import RoleRequest from '../models/RoleRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

// ─── Setup Menu ───────────────────────────────────────────────────────────────

export async function handleRoleRequestSetupMenu(interaction) {
  const value = interaction.values[0];

  if (value === 'add_role') {
    const roleSelect = new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('select_role_for_request')
          .setPlaceholder('Select the role members can request...')
          .setMaxValues(1)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.update({
      content: 'Step 1: Select the role members can request',
      embeds: [],
      components: [roleSelect, backButton],
    });

  } else if (value === 'delete_role') {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!config || !config.roles || config.roles.length === 0) {
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_rolerequest_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );
      return interaction.update({
        embeds: [errorEmbed('No role request types to delete.')],
        components: [backButton],
      });
    }

    const options = config.roles.map(r => ({
      label: r.roleName,
      value: r.id,
      description: 'Delete this role request type'
    }));

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('delete_rolerequest_type_select')
          .setPlaceholder('Select a role request type to delete...')
          .addOptions(options)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.update({
      content: 'Which role request type would you like to delete?',
      embeds: [],
      components: [menu, backButton],
    });

  } else if (value === 'view_roles') {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!config || !config.roles || config.roles.length === 0) {
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_rolerequest_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );
      return interaction.update({
        embeds: [errorEmbed('No role request types configured yet.')],
        components: [backButton],
      });
    }

    let description = '**Role Request Types:**\n\n';
    for (const role of config.roles) {
      description += `**${role.roleName}** (ID: \`${role.id}\`)\n`;
      description += `  - Approver Roles: ${role.approverRoleIds.length > 0 ? role.approverRoleIds.map(id => `<@&${id}>`).join(', ') : 'None'}\n`;
      description += `  - Approver Members: ${role.approverMemberIds.length > 0 ? role.approverMemberIds.map(id => `<@${id}>`).join(', ') : 'None'}\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Request Types')
      .setDescription(description)
      .setFooter({ text: 'RPM' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.update({
      embeds: [embed],
      components: [backButton],
    });

  } else if (value === 'global_role_links') {
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.update({
        embeds: [errorEmbed('Administrator permission is required to manage global role links.')],
        components: [],
      });
    }
    await showGlobalRoleLinksMenu(interaction, true);

  } else if (value === 'setup_done') {
    await interaction.update({
      content: 'Role request setup closed.',
      embeds: [],
      components: [],
    });
  }
}

// ─── Add Role Request Type Flow ───────────────────────────────────────────────

export async function handleSelectRoleForRequest(interaction) {
  try {
    const selectedRoleId = interaction.values[0];

    const approverRoleSelect = new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`select_approver_roles_${selectedRoleId}`)
          .setPlaceholder('Select approver roles (optional)...')
          .setMinValues(0)
          .setMaxValues(25)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const skipButtonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`skip_approver_roles_${selectedRoleId}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.update({
      content: 'Step 2: Select which roles can approve requests for this role (or click Skip)',
      embeds: [],
      components: [approverRoleSelect, skipButtonRow, backButton],
    });
  } catch (error) {
    console.error('Error selecting role for request:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleSelectApproverRoles(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3).join('_');
    const selectedApproverRoleIds = interaction.values;

    const approverMemberSelect = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`select_approver_members_${requestedRoleId}_${selectedApproverRoleIds.join(',')}`)
          .setPlaceholder('Select approver members (optional)...')
          .setMaxValues(25)
          .setMinValues(0)
      );

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const skipButtonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`skip_approver_members_${requestedRoleId}_${selectedApproverRoleIds.join(',')}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.update({
      content: 'Step 3: Select individual members who can also approve (or click Skip)',
      embeds: [],
      components: [approverMemberSelect, skipButtonRow, backButton],
    });
  } catch (error) {
    console.error('Error selecting approver roles:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleSelectApproverMembers(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3, 4)[0];
    const approverRoleIdsStr = customIdParts.slice(4).join('_');
    const selectedApproverMemberIds = interaction.values;
    const approverRoleIds = approverRoleIdsStr ? approverRoleIdsStr.split(',').filter(Boolean) : [];

    const role = await interaction.guild.roles.fetch(requestedRoleId);
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleRequestId = uuidv4();

    config.roles.push({
      id: roleRequestId,
      roleId: requestedRoleId,
      roleName: role.name,
      approverRoleIds,
      approverMemberIds: selectedApproverMemberIds,
      createdAt: new Date(),
    });

    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Request Type Added')
      .setDescription(`**${role.name}** has been added to the role request system.\n\n**Approvers:**\n- Roles: ${approverRoleIds.map(id => `<@&${id}>`).join(', ') || 'None'}\n- Members: ${selectedApproverMemberIds.map(id => `<@${id}>`).join(', ') || 'None'}`)
      .setFooter({ text: 'RPM' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.editReply({ embeds: [successMsg], components: [backButton] });
  } catch (error) {
    console.error('Error selecting approver members:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed('An error occurred.')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
    }
  }
}

export async function handleSkipApproverRoles(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3).join('_');

    const approverMemberSelect = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`select_approver_members_${requestedRoleId}_`)
          .setPlaceholder('Select approver members (optional)...')
          .setMaxValues(25)
          .setMinValues(0)
      );

    const skipButtonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`skip_approver_members_${requestedRoleId}_`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      content: 'Step 3: Select individual members who can also approve (or click Skip)',
      embeds: [],
      components: [approverMemberSelect, skipButtonRow],
      flags: 64,
    });
  } catch (error) {
    console.error('Error skipping approver roles:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleSkipApproverMembers(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3, 4)[0];
    const approverRoleIdsStr = customIdParts.slice(4).join('_');
    const approverRoleIds = approverRoleIdsStr ? approverRoleIdsStr.split(',').filter(Boolean) : [];

    const role = await interaction.guild.roles.fetch(requestedRoleId);
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleRequestId = uuidv4();

    config.roles.push({
      id: roleRequestId,
      roleId: requestedRoleId,
      roleName: role.name,
      approverRoleIds,
      approverMemberIds: [],
      createdAt: new Date(),
    });

    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Request Type Added')
      .setDescription(`**${role.name}** has been added to the role request system.\n\n**Approvers:**\n- Roles: ${approverRoleIds.map(id => `<@&${id}>`).join(', ') || 'None'}\n- Members: None`)
      .setFooter({ text: 'RPM' });

    await interaction.reply({ embeds: [successMsg], flags: 64 });
  } catch (error) {
    console.error('Error skipping approver members:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

// ─── Delete Role Request Type ─────────────────────────────────────────────────

export async function handleDeleteRoleRequestType(interaction) {
  try {
    const roleRequestTypeId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    const roleIndex = config.roles.findIndex(r => r.id === roleRequestTypeId);
    if (roleIndex === -1) {
      return interaction.reply({ embeds: [errorEmbed('Role request type not found.')], flags: 64 });
    }

    const deletedRole = config.roles[roleIndex];
    config.roles.splice(roleIndex, 1);
    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Request Type Deleted')
      .setDescription(`**${deletedRole.roleName}** has been removed from the role request system.`)
      .setFooter({ text: 'RPM' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.update({ embeds: [successMsg], components: [backButton] });
  } catch (error) {
    console.error('Error deleting role request type:', error);
    await interaction.update({ embeds: [errorEmbed('An error occurred.')], components: [] });
  }
}

// ─── Member Role Request Flow ─────────────────────────────────────────────────

export async function handleSelectRoleToRequest(interaction) {
  try {
    const roleRequestId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestId);

    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('Role request type not found.')], flags: 64 });
    }

    const userMenu = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`select_approver_${roleRequestId}`)
          .setPlaceholder('Search and select who to send the request to...')
          .setMaxValues(1)
      );

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Who should approve your request?')
      .setDescription(`**Role:** ${roleConfig.roleName}\n\nType the person's name to search for them`)
      .setFooter({ text: 'RPM' });

    await interaction.reply({ embeds: [embed], components: [userMenu], flags: 64 });
  } catch (error) {
    console.error('Error selecting role to request:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleSelectApprover(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const roleRequestId = customIdParts.slice(2).join('_');
    const approverId = interaction.users.first().id;

    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestId);

    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('Role request type not found.')], flags: 64 });
    }

    let approverMember = null;
    try {
      approverMember = await interaction.guild.members.fetch(approverId);
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not find the selected user in this server.')], flags: 64 });
    }

    let isAuthorized = false;
    for (const approverRoleId of roleConfig.approverRoleIds) {
      if (approverMember.roles.cache.has(approverRoleId)) { isAuthorized = true; break; }
    }
    if (!isAuthorized && roleConfig.approverMemberIds.includes(approverId)) isAuthorized = true;

    if (!isAuthorized) {
      return interaction.reply({
        embeds: [errorEmbed(`${approverMember.user.username} is not authorized to approve the **${roleConfig.roleName}** role.`)],
        flags: 64,
      });
    }

    const requestId = `ROLEREQ-${Date.now()}`;
    const newRequest = new RoleRequest({
      guildId: interaction.guildId,
      requestId,
      requesterId: interaction.user.id,
      requesterUsername: interaction.user.username,
      roleId: roleConfig.roleId,
      roleName: roleConfig.roleName,
      approverId,
      approverUsername: approverMember.user.username,
      timestamp: new Date(),
    });

    await newRequest.save();

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Role Request Approval')
        .setDescription(`<@${interaction.user.id}> has requested the role **${roleConfig.roleName}**`)
        .addFields(
          { name: 'Requester', value: interaction.user.username, inline: true },
          { name: 'Requested Role', value: roleConfig.roleName, inline: true }
        )
        .setFooter({ text: 'RPM' });

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_rolereq_${requestId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_rolereq_${requestId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );

      const dmMsg = await approverMember.send({ embeds: [dmEmbed], components: [buttons] });
      newRequest.messageId = dmMsg.id;
      newRequest.dmChannelId = dmMsg.channelId;
    } catch {
      return interaction.reply({
        embeds: [errorEmbed('Could not send DM to the approver. Make sure they have DMs enabled.')],
        flags: 64,
      });
    }

    await newRequest.save();

    const sentEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Request Sent')
      .setDescription(`Your request for **${roleConfig.roleName}** has been sent to ${approverMember.user.username}. You'll be notified once it's reviewed.`)
      .setFooter({ text: 'RPM' });

    await interaction.reply({ embeds: [sentEmbed], flags: 64 });
  } catch (error) {
    console.error('Error selecting approver:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

// ─── Approve / Deny ───────────────────────────────────────────────────────────

export async function handleApproveRoleRequest(interaction) {
  try {
    const requestId = interaction.customId.replace('approve_rolereq_', '');
    const request = await RoleRequest.findOne({ requestId });

    if (!request) {
      return interaction.reply({ embeds: [errorEmbed('Request not found.')], flags: 64 });
    }
    if (request.status !== 'pending') {
      return interaction.reply({ embeds: [errorEmbed(`This request has already been ${request.status}.`)], flags: 64 });
    }
    if (request.approverId !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed(`You cannot approve this request - it wasn't sent to you.`)], flags: 64 });
    }

    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    if (!config) {
      return interaction.reply({ embeds: [errorEmbed('Role request system is not configured.')], flags: 64 });
    }
    const roleConfig = config.roles.find(r => r.roleId === request.roleId);
    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('This role request type is no longer configured.')], flags: 64 });
    }

    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({ embeds: [errorEmbed('Server not found.')], flags: 64 });
    }

    let requester;
    try {
      requester = await guild.members.fetch(request.requesterId);
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not find the requester in the server.')], flags: 64 });
    }

    try {
      await requester.roles.add(request.roleId);
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Could not add the role. Please check bot permissions.')], flags: 64 });
    }

    request.status = 'approved';
    request.approvedAt = new Date();
    await request.save();

    // ── Cross-server global role sync ────────────────────────────────────────
    const links = (config.globalRoleLinks || []).filter(l => l.sourceRoleId === request.roleId);
    const syncResults = [];
    for (const link of links) {
      try {
        const targetGuild = interaction.client.guilds.cache.get(link.targetGuildId);
        if (!targetGuild) { syncResults.push(`${link.targetGuildName}: bot not in server`); continue; }
        const targetMember = await targetGuild.members.fetch(request.requesterId).catch(() => null);
        if (!targetMember) { syncResults.push(`${link.targetGuildName}: member not found`); continue; }
        await targetMember.roles.add(link.targetRoleId);
        syncResults.push(`${link.targetGuildName}: granted **${link.targetRoleName}**`);
      } catch (err) {
        console.error(`[GlobalRole] Failed sync to ${link.targetGuildId}:`, err.message);
        syncResults.push(`${link.targetGuildName}: failed`);
      }
    }

    // Update DM message
    try {
      const dmChannel = await interaction.client.channels.fetch(request.dmChannelId);
      const dmMessage = await dmChannel.messages.fetch(request.messageId);
      const approvedEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Request Approved')
        .setDescription(`<@${request.requesterId}>'s request for **${request.roleName}** has been approved by ${interaction.user.username}.`)
        .setFooter({ text: 'RPM' });
      await dmMessage.edit({ embeds: [approvedEmbed], components: [] });
    } catch { /* DM edit is best-effort */ }

    let desc = `You've approved the role request for <@${request.requesterId}>.\n\nRole given: **${request.roleName}**`;
    if (syncResults.length > 0) {
      desc += `\n\n**Global Role Sync:**\n${syncResults.map(r => `- ${r}`).join('\n')}`;
    }

    const approveEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Approved')
      .setDescription(desc)
      .setFooter({ text: 'RPM' });

    await interaction.reply({ embeds: [approveEmbed], flags: 64 });
  } catch (error) {
    console.error('Error approving role request:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleDenyRoleRequest(interaction) {
  try {
    const requestId = interaction.customId.replace('deny_rolereq_', '');
    const request = await RoleRequest.findOne({ requestId });

    if (!request) {
      return interaction.reply({ embeds: [errorEmbed('Request not found.')], flags: 64 });
    }
    if (request.status !== 'pending') {
      return interaction.reply({ embeds: [errorEmbed(`This request has already been ${request.status}.`)], flags: 64 });
    }
    if (request.approverId !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed(`You cannot deny this request - it wasn't sent to you.`)], flags: 64 });
    }

    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    if (!config) {
      return interaction.reply({ embeds: [errorEmbed('Role request system is not configured.')], flags: 64 });
    }
    const roleConfig = config.roles.find(r => r.roleId === request.roleId);
    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('This role request type is no longer configured.')], flags: 64 });
    }

    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({ embeds: [errorEmbed('Server not found.')], flags: 64 });
    }

    request.status = 'denied';
    request.deniedAt = new Date();
    await request.save();

    try {
      const dmChannel = await interaction.client.channels.fetch(request.dmChannelId);
      const dmMessage = await dmChannel.messages.fetch(request.messageId);
      const deniedEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Request Denied')
        .setDescription(`<@${request.requesterId}>'s request for **${request.roleName}** has been denied by ${interaction.user.username}.`)
        .setFooter({ text: 'RPM' });
      await dmMessage.edit({ embeds: [deniedEmbed], components: [] });
    } catch { /* DM edit is best-effort */ }

    const denyEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Request Denied')
      .setDescription(`You've denied the role request for <@${request.requesterId}>.\n\nRole: **${request.roleName}**`)
      .setFooter({ text: 'RPM' });

    await interaction.reply({ embeds: [denyEmbed], flags: 64 });
  } catch (error) {
    console.error('Error denying role request:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

// ─── Manage Roles (view holders + remove) ─────────────────────────────────────

export async function handleManageRoleSelect(interaction) {
  try {
    const roleRequestTypeId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestTypeId);

    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('Role request type not found.')], flags: 64 });
    }

    const isStaff = await checkStaffPermission(interaction);
    let canManage = isStaff;

    if (!canManage && roleConfig.approverRoleIds?.length > 0) {
      for (const approverRoleId of roleConfig.approverRoleIds) {
        if (interaction.member.roles.cache.has(approverRoleId)) { canManage = true; break; }
      }
    }
    if (!canManage && roleConfig.approverMemberIds?.includes(interaction.user.id)) canManage = true;

    if (!canManage) {
      return interaction.reply({ embeds: [errorEmbed('You do not have permission to manage this role.')], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let membersWithRole = [];
    let retries = 3, delay = 2000;
    while (retries > 0) {
      try {
        const members = await interaction.guild.members.fetch({ limit: 0 });
        membersWithRole = Array.from(members.values()).filter(m => m.roles.cache.has(roleConfig.roleId) && !m.user.bot);
        break;
      } catch (error) {
        if (error.status === 429 || error.code === 'RateLimitError') {
          retries--;
          if (retries > 0) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
        }
        throw error;
      }
    }

    if (membersWithRole.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle(`Members with ${roleConfig.roleName}`).setDescription('No members currently have this role.').setFooter({ text: 'RPM' })],
      });
    }

    const memberOptions = membersWithRole.slice(0, 25).map(m => ({
      label: m.user.username,
      value: m.id,
      description: 'Remove this role from member'
    }));

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`remove_role_from_member_${roleRequestTypeId}`)
          .setPlaceholder('Select a member to remove the role from...')
          .addOptions(memberOptions)
      );

    let description = `**${roleConfig.roleName}** - ${membersWithRole.length} member(s) currently hold this role\n\n`;
    membersWithRole.forEach(m => { description += `- ${m.user.username}\n`; });

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(`Manage ${roleConfig.roleName}`)
      .setDescription(description)
      .setFooter({ text: 'RPM' });

    await interaction.editReply({ embeds: [embed], components: [menu] });
  } catch (error) {
    console.error('Error managing role:', error);
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch members. Please try again.')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Failed to fetch members. Please try again.')], flags: 64 });
    }
  }
}

export async function handleRemoveRoleFromMember(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const roleRequestTypeId = customIdParts.slice(4).join('_');
    const memberId = interaction.values[0];

    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestTypeId);

    if (!roleConfig) {
      return interaction.reply({ embeds: [errorEmbed('Role request type not found.')], flags: 64 });
    }

    const isStaff = await checkStaffPermission(interaction);
    let canManage = isStaff;

    if (!canManage && roleConfig.approverRoleIds?.length > 0) {
      for (const approverRoleId of roleConfig.approverRoleIds) {
        if (interaction.member.roles.cache.has(approverRoleId)) { canManage = true; break; }
      }
    }
    if (!canManage && roleConfig.approverMemberIds?.includes(interaction.user.id)) canManage = true;

    if (!canManage) {
      return interaction.reply({ embeds: [errorEmbed('You do not have permission to remove this role.')], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let member;
    let retries = 3, delay = 2000;
    while (retries > 0) {
      try {
        member = await interaction.guild.members.fetch(memberId);
        break;
      } catch (error) {
        if (error.status === 429) { retries--; if (retries > 0) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; } }
        throw error;
      }
    }

    retries = 3; delay = 2000;
    while (retries > 0) {
      try {
        await member.roles.remove(roleConfig.roleId);
        break;
      } catch (error) {
        if (error.status === 429) { retries--; if (retries > 0) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; } }
        throw error;
      }
    }

    // ── Cross-server global role sync (removal) ──────────────────────────────
    const links = (config.globalRoleLinks || []).filter(l => l.sourceRoleId === roleConfig.roleId);
    const syncResults = [];
    for (const link of links) {
      try {
        const targetGuild = interaction.client.guilds.cache.get(link.targetGuildId);
        if (!targetGuild) { syncResults.push(`${link.targetGuildName}: bot not in server`); continue; }
        const targetMember = await targetGuild.members.fetch(memberId).catch(() => null);
        if (!targetMember) { syncResults.push(`${link.targetGuildName}: member not found`); continue; }
        await targetMember.roles.remove(link.targetRoleId);
        syncResults.push(`${link.targetGuildName}: removed **${link.targetRoleName}**`);
      } catch (err) {
        console.error(`[GlobalRole] Failed removal sync to ${link.targetGuildId}:`, err.message);
        syncResults.push(`${link.targetGuildName}: failed`);
      }
    }

    let desc = `Removed <@&${roleConfig.roleId}> from ${member.user.username}`;
    if (syncResults.length > 0) {
      desc += `\n\n**Global Role Sync:**\n${syncResults.map(r => `- ${r}`).join('\n')}`;
    }

    const successMsg = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Role Removed')
      .setDescription(desc)
      .setFooter({ text: 'RPM' });

    await interaction.editReply({ embeds: [successMsg] });
  } catch (error) {
    console.error('Error removing role from member:', error);
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed('Failed to remove role. Please try again.')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Failed to remove role. Please try again.')], flags: 64 });
    }
  }
}

// ─── Global Role Links ────────────────────────────────────────────────────────

async function showGlobalRoleLinksMenu(interaction, isUpdate = false) {
  const subMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('globalrolelink_setup_menu')
        .setPlaceholder('Choose an option...')
        .addOptions(
          { label: 'Add Global Role Link', value: 'add_link', description: 'Link a role in this server to a role in another server' },
          { label: 'Remove Global Role Link', value: 'remove_link', description: 'Remove an existing global role link' },
          { label: 'View Global Role Links', value: 'view_links', description: 'See all current global role links' },
          { label: '← Back to Setup', value: 'back_to_setup' },
        )
    );

  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Global Role Links')
    .setDescription('When a role is approved in this server, the linked role in the target server is also granted automatically.\n\n**Requirements:**\n- You must have Administrator in both servers\n- The bot must be in the target server\n- Maximum 10 links per server')
    .setFooter({ text: 'RPM' });

  const payload = { embeds: [embed], components: [subMenu] };
  if (isUpdate) {
    await interaction.update(payload);
  } else {
    await interaction.editReply(payload);
  }
}

export async function handleGlobalRoleLinksSetupMenu(interaction) {
  const value = interaction.values[0];

  if (value === 'back_to_setup') {
    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rolerequest_setup_menu')
          .setPlaceholder('Choose a setup option...')
          .addOptions(
            { label: 'Add Role Request Type', value: 'add_role' },
            { label: 'Delete Role Request Type', value: 'delete_role' },
            { label: 'View Role Request Types', value: 'view_roles' },
            { label: 'Manage Global Role Links', value: 'global_role_links' },
            { label: 'Done - Close Setup', value: 'setup_done' }
          )
      );
    return interaction.update({
      content: '**Role Request System Setup**\n\nSelect an option below to configure role requests:',
      embeds: [],
      components: [menu],
    });
  }

  if (value === 'add_link') {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!config || !config.roles || config.roles.length === 0) {
      return interaction.update({
        embeds: [errorEmbed('You need to add at least one role request type before creating global links.')],
        components: [_backToGlobalLinksRow()],
      });
    }

    if ((config.globalRoleLinks || []).length >= 10) {
      return interaction.update({
        embeds: [errorEmbed('Maximum of 10 global role links reached. Remove one before adding another.')],
        components: [_backToGlobalLinksRow()],
      });
    }

    const roleOptions = config.roles.map(r => ({
      label: r.roleName,
      value: r.id,
      description: `Link ${r.roleName} to another server`
    }));

    const roleMenu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('globalrolelink_select_source')
          .setPlaceholder('Select which role to link...')
          .addOptions(roleOptions)
      );

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Add Global Role Link - Step 1')
      .setDescription('Select the role request type in **this server** that you want to mirror to another server.')
      .setFooter({ text: 'RPM' });

    return interaction.update({
      embeds: [embed],
      components: [roleMenu, _backToGlobalLinksRow()],
    });
  }

  if (value === 'view_links') {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const links = config?.globalRoleLinks || [];

    if (links.length === 0) {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Global Role Links').setDescription('No global role links configured yet.').setFooter({ text: 'RPM' })],
        components: [_backToGlobalLinksRow()],
      });
    }

    let desc = '';
    for (const link of links) {
      const sourceRole = config.roles.find(r => r.roleId === link.sourceRoleId);
      desc += `**${sourceRole?.roleName || 'Unknown Role'}** → **${link.targetRoleName}** in ${link.targetGuildName}\n`;
      desc += `-# Added by <@${link.addedBy}>\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(`Global Role Links (${links.length})`)
      .setDescription(desc)
      .setFooter({ text: 'RPM' });

    return interaction.update({
      embeds: [embed],
      components: [_backToGlobalLinksRow()],
    });
  }

  if (value === 'remove_link') {
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const links = config?.globalRoleLinks || [];

    if (links.length === 0) {
      return interaction.update({
        embeds: [errorEmbed('No global role links to remove.')],
        components: [_backToGlobalLinksRow()],
      });
    }

    const options = links.map(link => {
      const sourceRole = config.roles.find(r => r.roleId === link.sourceRoleId);
      return {
        label: `${sourceRole?.roleName || 'Unknown'} → ${link.targetRoleName}`,
        value: link.id,
        description: `In ${link.targetGuildName}`
      };
    });

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('globalrolelink_remove_select')
          .setPlaceholder('Select a link to remove...')
          .addOptions(options)
      );

    return interaction.update({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Remove Global Role Link').setDescription('Select the link you want to remove.').setFooter({ text: 'RPM' })],
      components: [menu, _backToGlobalLinksRow()],
    });
  }
}

export async function handleGlobalRoleLinkSelectSource(interaction) {
  try {
    const roleTypeId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`globalrolelink_add_modal_${roleTypeId}`)
      .setTitle('Add Global Role Link');

    const guildInput = new TextInputBuilder()
      .setCustomId('target_guild_id')
      .setLabel('Target Server ID')
      .setPlaceholder('Right-click the server → Copy Server ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    const roleInput = new TextInputBuilder()
      .setCustomId('target_role_id')
      .setLabel('Target Role ID')
      .setPlaceholder('Server Settings → Roles → right-click → Copy Role ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    modal.addComponents(
      new ActionRowBuilder().addComponents(guildInput),
      new ActionRowBuilder().addComponents(roleInput),
    );

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing global role link modal:', error);
    await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

export async function handleGlobalRoleLinkAddModal(interaction) {
  try {
    const roleTypeId = interaction.customId.replace('globalrolelink_add_modal_', '');
    const targetGuildId = interaction.fields.getTextInputValue('target_guild_id').trim();
    const targetRoleId = interaction.fields.getTextInputValue('target_role_id').trim();

    await interaction.deferReply({ flags: 64 });

    // Validate target guild ID is a valid snowflake
    if (!/^\d{17,20}$/.test(targetGuildId)) {
      return interaction.editReply({ embeds: [errorEmbed('Invalid server ID. Server IDs are 17–20 digit numbers.')] });
    }
    if (!/^\d{17,20}$/.test(targetRoleId)) {
      return interaction.editReply({ embeds: [errorEmbed('Invalid role ID. Role IDs are 17–20 digit numbers.')] });
    }

    // Prevent linking to the same server
    if (targetGuildId === interaction.guildId) {
      return interaction.editReply({ embeds: [errorEmbed('You cannot link a server to itself.')] });
    }

    // Bot must be in target guild
    const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
    if (!targetGuild) {
      return interaction.editReply({ embeds: [errorEmbed('The bot is not in that server. Make sure you invite the bot to the target server first.')] });
    }

    // Verify user has Administrator in target guild
    let targetMember;
    try {
      targetMember = await targetGuild.members.fetch(interaction.user.id);
    } catch {
      return interaction.editReply({ embeds: [errorEmbed(`You are not a member of **${targetGuild.name}**. You must be in the target server with Administrator permission.`)] });
    }

    if (!targetMember.permissions.has('Administrator') && targetGuild.ownerId !== interaction.user.id) {
      return interaction.editReply({ embeds: [errorEmbed(`You need **Administrator** permission in **${targetGuild.name}** to create a global role link to it.`)] });
    }

    // Verify the target role exists - fetch all roles to ensure cache is populated
    let targetRole;
    try {
      await targetGuild.roles.fetch();
      targetRole = targetGuild.roles.cache.get(targetRoleId);
    } catch {
      targetRole = null;
    }
    if (!targetRole) {
      return interaction.editReply({ embeds: [errorEmbed(`Role ID \`${targetRoleId}\` was not found in **${targetGuild.name}**.\n\n-# Make sure you copied the role ID from the correct server. Right-click the role in Server Settings → Roles, then Copy Role ID.`)] });
    }

    // Load config and find the source role type
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const sourceRoleType = config.roles.find(r => r.id === roleTypeId);
    if (!sourceRoleType) {
      return interaction.editReply({ embeds: [errorEmbed('Source role type no longer exists.')] });
    }

    // Check for duplicate link
    const existing = (config.globalRoleLinks || []).find(
      l => l.sourceRoleId === sourceRoleType.roleId && l.targetGuildId === targetGuildId && l.targetRoleId === targetRoleId
    );
    if (existing) {
      return interaction.editReply({ embeds: [errorEmbed('This exact global role link already exists.')] });
    }

    if (!config.globalRoleLinks) config.globalRoleLinks = [];
    config.globalRoleLinks.push({
      id: uuidv4(),
      sourceRoleId: sourceRoleType.roleId,
      targetGuildId,
      targetGuildName: targetGuild.name,
      targetRoleId,
      targetRoleName: targetRole.name,
      addedBy: interaction.user.id,
      addedAt: new Date(),
    });

    await config.save();

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Global Role Link Added')
      .setDescription(`When **${sourceRoleType.roleName}** is approved in this server, **${targetRole.name}** will also be granted in **${targetGuild.name}**.\n\nThis also applies to role removals via \`/manageroles\`.`)
      .setFooter({ text: 'RPM' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding global role link:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed('An error occurred.')] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
    }
  }
}

export async function handleGlobalRoleLinkRemoveSelect(interaction) {
  try {
    const linkId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    const linkIndex = (config.globalRoleLinks || []).findIndex(l => l.id === linkId);
    if (linkIndex === -1) {
      return interaction.update({ embeds: [errorEmbed('Link not found.')], components: [] });
    }

    const removed = config.globalRoleLinks[linkIndex];
    config.globalRoleLinks.splice(linkIndex, 1);
    await config.save();

    const sourceRole = config.roles.find(r => r.roleId === removed.sourceRoleId);

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Global Role Link Removed')
      .setDescription(`The link from **${sourceRole?.roleName || 'Unknown Role'}** → **${removed.targetRoleName}** in **${removed.targetGuildName}** has been removed.`)
      .setFooter({ text: 'RPM' });

    await interaction.update({ embeds: [embed], components: [_backToGlobalLinksRow()] });
  } catch (error) {
    console.error('Error removing global role link:', error);
    await interaction.update({ embeds: [errorEmbed('An error occurred.')], components: [] });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function _backToGlobalLinksRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('back_to_global_links_menu')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary)
    );
}
