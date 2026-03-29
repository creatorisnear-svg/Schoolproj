import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder, UserSelectMenuBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import RoleRequest from '../models/RoleRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export async function handleRoleRequestSetupMenu(interaction) {
  const value = interaction.values[0];

  if (value === 'add_role') {
    // Show role selection menu
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
      components: [roleSelect, backButton],
    });
  } else if (value === 'delete_role') {
    // Show delete option
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
      components: [menu, backButton],
    });
  } else if (value === 'view_roles') {
    // Show all role request types
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
      description += `**${role.roleName}** (ID: ${role.id})\n`;
      description += `  • Approver Roles: ${role.approverRoleIds.length > 0 ? `<@&${role.approverRoleIds.join('>, <@&')}>` : 'None'}\n`;
      description += `  • Approver Members: ${role.approverMemberIds.length > 0 ? `<@${role.approverMemberIds.join('>, <@')}>` : 'None'}\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('Role Request Types')
      .setDescription(description)
      .setFooter({ text: 'RolePlayManager' });

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
  } else if (value === 'setup_done') {
    await interaction.update({
      content: '✅ Role request setup closed.',
      flags: 64,
    });
  }
}

export async function handleSelectRoleForRequest(interaction) {
  try {
    const selectedRoleId = interaction.values[0];

    // Show approver role selection with skip button
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
      components: [approverRoleSelect, skipButtonRow, backButton],
    });
  } catch (error) {
    console.error('Error selecting role for request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleSelectApproverRoles(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3).join('_');
    const selectedApproverRoleIds = interaction.values;

    // Show approver member selection with skip button
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
      components: [approverMemberSelect, skipButtonRow, backButton],
    });
  } catch (error) {
    console.error('Error selecting approver roles:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleSelectApproverMembers(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3, 4)[0];
    const approverRoleIdsStr = customIdParts.slice(4).join('_');
    const selectedApproverMemberIds = interaction.values;

    const approverRoleIds = approverRoleIdsStr ? approverRoleIdsStr.split(',') : [];

    // Fetch role info
    const role = await interaction.guild.roles.fetch(requestedRoleId);

    // Add to config
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleRequestId = uuidv4();

    config.roles.push({
      id: roleRequestId,
      roleId: requestedRoleId,
      roleName: role.name,
      approverRoleIds: approverRoleIds,
      approverMemberIds: selectedApproverMemberIds,
      createdAt: new Date(),
    });

    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Request Type Added')
      .setDescription(`✅ **${role.name}** has been added to the role request system.\n\n**Approvers:**\n• Roles: ${approverRoleIds.map(id => `<@&${id}>`).join(', ') || 'None'}\n• Members: ${selectedApproverMemberIds.map(id => `<@${id}>`).join(', ') || 'None'}`)
      .setFooter({ text: 'RolePlayManager' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.editReply({
      embeds: [successMsg],
      components: [backButton],
    });
  } catch (error) {
    console.error('Error selecting approver members:', error);
    if (interaction.replied) {
      await interaction.editReply({
        embeds: [errorEmbed('An error occurred.')],
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed('An error occurred.')],
        flags: 64,
      });
    }
  }
}

export async function handleDeleteRoleRequestType(interaction) {
  try {
    const roleRequestTypeId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    const roleIndex = config.roles.findIndex(r => r.id === roleRequestTypeId);
    if (roleIndex === -1) {
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        flags: 64,
      });
    }

    const deletedRole = config.roles[roleIndex];
    config.roles.splice(roleIndex, 1);
    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Request Type Deleted')
      .setDescription(`✅ **${deletedRole.roleName}** has been removed from the role request system.`)
      .setFooter({ text: 'RolePlayManager' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_rolerequest_menu')
          .setLabel('← Back to Menu')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.update({
      embeds: [successMsg],
      components: [backButton],
    });
  } catch (error) {
    console.error('Error deleting role request type:', error);
    await interaction.update({
      embeds: [errorEmbed('An error occurred.')],
      components: [],
    });
  }
}

export async function handleSelectRoleToRequest(interaction) {
  try {
    const roleRequestId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        flags: 64,
      });
    }

    // Show user select menu so requesters can pick any member
    const userMenu = new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`select_approver_${roleRequestId}`)
          .setPlaceholder('Search and select who to send the request to...')
          .setMaxValues(1)
      );

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Who should approve your request?')
      .setDescription(`**Role:** ${roleConfig.roleName}\n\nType the person's name to search for them`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.reply({
      embeds: [embed],
      components: [userMenu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error selecting role to request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleSelectApprover(interaction) {
  try {
    // Extract roleRequestId and approver info from customId
    const customIdParts = interaction.customId.split('_');
    const roleRequestId = customIdParts.slice(2).join('_');
    
    // For user select menus, interaction.users contains the selected users
    const approverId = interaction.users.first().id;

    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        flags: 64,
      });
    }

    // Verify the selected user exists in the guild
    let approverMember = null;
    try {
      approverMember = await interaction.guild.members.fetch(approverId);
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Could not find the selected user in this guild.')],
        flags: 64,
      });
    }

    // Verify the selected user is authorized to approve this role
    let isAuthorized = false;

    // Check if they have any of the approver roles
    for (const approverRoleId of roleConfig.approverRoleIds) {
      if (approverMember.roles.cache.has(approverRoleId)) {
        isAuthorized = true;
        break;
      }
    }

    // Check if they're in the approver members list
    if (!isAuthorized && roleConfig.approverMemberIds.includes(approverId)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return interaction.reply({
        embeds: [errorEmbed(`${approverMember.user.username} is not authorized to approve the **${roleConfig.roleName}** role.`)],
        flags: 64,
      });
    }

    // Create the request
    const requestId = `ROLEREQ-${Date.now()}`;
    const requesterUsername = interaction.user.username;
    const requesterId = interaction.user.id;
    const approverUsername = approverMember.user.username;

    // Save the request to database
    const newRequest = new RoleRequest({
      guildId: interaction.guildId,
      requestId: requestId,
      requesterId: requesterId,
      requesterUsername: requesterUsername,
      roleId: roleConfig.roleId,
      roleName: roleConfig.roleName,
      approverId: approverId,
      approverUsername: approverUsername,
      timestamp: new Date(),
    });

    await newRequest.save();

    // Send DM to the selected approver
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('Role Request Approval')
        .setDescription(`<@${requesterId}> has requested the role **${roleConfig.roleName}**`)
        .addFields(
          { name: 'Requester', value: requesterUsername, inline: true },
          { name: 'Requested Role', value: roleConfig.roleName, inline: true }
        )
        .setFooter({ text: 'RolePlayManager' });

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

      const dmMsg = await approverMember.send({
        embeds: [dmEmbed],
        components: [buttons],
      });

      newRequest.messageId = dmMsg.id;
      newRequest.dmChannelId = dmMsg.channelId;
    } catch (err) {
      console.error(`Could not send DM to ${approverId}:`, err);
      return interaction.reply({
        embeds: [errorEmbed('Could not send DM to the approver. Make sure they have DMs enabled.')],
        flags: 64,
      });
    }

    await newRequest.save();

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Request Sent')
      .setDescription(`✅ Your request for **${roleConfig.roleName}** has been sent to ${approverUsername}!\n\nYou'll receive a message once it's reviewed.`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.reply({
      embeds: [successEmbed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error selecting approver:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleApproveRoleRequest(interaction) {
  try {
    const requestId = interaction.customId.replace('approve_rolereq_', '');
    const request = await RoleRequest.findOne({ requestId: requestId });

    if (!request) {
      return interaction.reply({
        embeds: [errorEmbed('Request not found.')],
        flags: 64,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        embeds: [errorEmbed(`This request has already been ${request.status}.`)],
        flags: 64,
      });
    }

    // Verify the approver has permission to approve this role
    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    
    if (!config) {
      return interaction.reply({
        embeds: [errorEmbed('Role request system is not configured.')],
        flags: 64,
      });
    }

    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        flags: 64,
      });
    }

    // Check if the user clicking approve is the one who was sent the request
    const approverUserId = interaction.user.id;

    if (request.approverId !== approverUserId) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot approve this request - it wasn't sent to you.`)],
        flags: 64,
      });
    }

    // Get the guild and member (needed since interaction happens in DM)
    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({
        embeds: [errorEmbed('Guild not found.')],
        flags: 64,
      });
    }

    // Add role to requester
    let requester = null;
    try {
      requester = await guild.members.fetch(request.requesterId);
    } catch (err) {
      console.error('Error fetching requester:', err);
      return interaction.reply({
        embeds: [errorEmbed('Could not find the requester in the guild.')],
        flags: 64,
      });
    }

    try {
      await requester.roles.add(request.roleId);
    } catch (err) {
      console.error('Error adding role:', err);
      return interaction.reply({
        embeds: [errorEmbed('Could not add the role. Please check bot permissions.')],
        flags: 64,
      });
    }

    request.status = 'approved';
    request.approvedAt = new Date();
    await request.save();

    // Update the DM message
    try {
      const dmChannel = await interaction.client.channels.fetch(request.dmChannelId);
      const dmMessage = await dmChannel.messages.fetch(request.messageId);
      
      const approvedEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Request Approved')
        .setDescription(`✅ <@${request.requesterId}>'s request for **${request.roleName}** has been **approved** by ${interaction.user.username}!`)
        .setFooter({ text: 'RolePlayManager' });

      await dmMessage.edit({
        embeds: [approvedEmbed],
        components: [],
      });
    } catch (err) {
      console.error('Error updating DM:', err);
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Approved')
      .setDescription(`✅ You've approved the role request for <@${request.requesterId}>!\n\nRole given: **${request.roleName}**`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.reply({
      embeds: [successEmbed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error approving role request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleManageRoleSelect(interaction) {
  try {
    const roleRequestTypeId = interaction.values[0];
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestTypeId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        flags: 64,
      });
    }

    // Check if user has permission to manage this role
    const isStaff = await checkStaffPermission(interaction);
    let canManage = false;

    if (isStaff) {
      canManage = true;
    } else if (roleConfig.approverRoleIds && roleConfig.approverRoleIds.length > 0) {
      for (const approverRoleId of roleConfig.approverRoleIds) {
        if (interaction.member.roles.cache.has(approverRoleId)) {
          canManage = true;
          break;
        }
      }
    }

    if (!canManage && roleConfig.approverMemberIds && roleConfig.approverMemberIds.length > 0) {
      if (roleConfig.approverMemberIds.includes(interaction.user.id)) {
        canManage = true;
      }
    }

    if (!canManage) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to manage this role.')],
        flags: 64,
      });
    }

    // Defer the interaction to avoid timeout on large guild member fetches
    await interaction.deferReply({ flags: 64 });

    let membersWithRole = [];
    {
      // Only fetch if cache is empty, with retry and exponential backoff
      let members;
      let retries = 3;
      let delay = 2000;

      while (retries > 0) {
        try {
          members = await interaction.guild.members.fetch({ limit: 0 });
          membersWithRole = Array.from(members.values())
            .filter(m => m.roles.cache.has(roleConfig.roleId) && !m.user.bot);
          break;
        } catch (error) {
          if (error.name === 'GatewayRateLimitError' || error.code === 'RateLimitError' || error.status === 429) {
            retries--;
            if (retries > 0) {
              // Get retry_after from error if available
              const retryAfter = error.data?.retry_after || delay / 1000;
              await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
              delay *= 2;
              continue;
            }
          }
          throw error;
        }
      }
    }

    if (membersWithRole.length === 0) {
      return await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#2E2E2E')
            .setTitle(`Members with ${roleConfig.roleName}`)
            .setDescription('No members currently have this role.')
            .setFooter({ text: 'RolePlayManager' })
        ],
      });
    }

    // Show members and allow removal
    const memberOptions = membersWithRole.slice(0, 25).map(m => ({
      label: m.user.username,
      value: m.id,
      description: 'Click to remove this role'
    }));

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`remove_role_from_member_${roleRequestTypeId}`)
          .setPlaceholder('Select a member to remove the role from...')
          .addOptions(memberOptions)
      );

    let description = `**${roleConfig.roleName}** - ${membersWithRole.length} member(s)\n\n`;
    membersWithRole.forEach(m => {
      description += `• ${m.user.username}\n`;
    });

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle(`Manage ${roleConfig.roleName}`)
      .setDescription(description)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.editReply({
      embeds: [embed],
      components: [menu],
    });
  } catch (error) {
    console.error('Error managing role:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        embeds: [errorEmbed('Failed to fetch members. Please try again.')],
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed('Failed to fetch members. Please try again.')],
        flags: 64,
      });
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
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        flags: 64,
      });
    }

    // Check if user has permission to manage this role
    const isStaff = await checkStaffPermission(interaction);
    let canManage = false;

    if (isStaff) {
      canManage = true;
    } else if (roleConfig.approverRoleIds && roleConfig.approverRoleIds.length > 0) {
      // Check if they have any approver roles
      for (const approverRoleId of roleConfig.approverRoleIds) {
        if (interaction.member.roles.cache.has(approverRoleId)) {
          canManage = true;
          break;
        }
      }
    }

    // Check if they're in the approver members list
    if (!canManage && roleConfig.approverMemberIds && roleConfig.approverMemberIds.length > 0) {
      if (roleConfig.approverMemberIds.includes(interaction.user.id)) {
        canManage = true;
      }
    }

    if (!canManage) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to remove this role.')],
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Fetch member with retry logic for rate limits
    let member;
    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
      try {
        member = await interaction.guild.members.fetch(memberId);
        break;
      } catch (error) {
        if (error.name === 'GatewayRateLimitError' || error.code === 'RateLimitError' || error.status === 429) {
          retries--;
          if (retries > 0) {
            const retryAfter = error.data?.retry_after || delay / 1000;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            delay *= 2;
            continue;
          }
        }
        throw error;
      }
    }

    // Remove role with retry logic for rate limits
    retries = 3;
    delay = 2000;

    while (retries > 0) {
      try {
        await member.roles.remove(roleConfig.roleId);
        break;
      } catch (error) {
        if (error.name === 'GatewayRateLimitError' || error.code === 'RateLimitError' || error.status === 429) {
          retries--;
          if (retries > 0) {
            const retryAfter = error.data?.retry_after || delay / 1000;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            delay *= 2;
            continue;
          }
        }
        throw error;
      }
    }

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Removed')
      .setDescription(`Removed <@&${roleConfig.roleId}> from ${member.user.username}`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.editReply({
      embeds: [successMsg],
    });
  } catch (error) {
    console.error('Error removing role from member:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        embeds: [errorEmbed('Failed to remove role. Please try again.')],
      });
    } else {
      await interaction.reply({
        embeds: [errorEmbed('Failed to remove role. Please try again.')],
        flags: 64,
      });
    }
  }
}

export async function handleSkipApproverRoles(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3).join('_');

    // Show approver member selection with skip button (no roles selected)
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
      components: [approverMemberSelect, skipButtonRow],
      flags: 64,
    });
  } catch (error) {
    console.error('Error skipping approver roles:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleSkipApproverMembers(interaction) {
  try {
    const customIdParts = interaction.customId.split('_');
    const requestedRoleId = customIdParts.slice(3, 4)[0];
    const approverRoleIdsStr = customIdParts.slice(4).join('_');
    const selectedApproverMemberIds = [];

    const approverRoleIds = approverRoleIdsStr ? approverRoleIdsStr.split(',') : [];

    // Fetch role info
    const role = await interaction.guild.roles.fetch(requestedRoleId);

    // Add to config
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleRequestId = uuidv4();

    config.roles.push({
      id: roleRequestId,
      roleId: requestedRoleId,
      roleName: role.name,
      approverRoleIds: approverRoleIds,
      approverMemberIds: selectedApproverMemberIds,
      createdAt: new Date(),
    });

    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Request Type Added')
      .setDescription(`✅ **${role.name}** has been added to the role request system.\n\n**Approvers:**\n• Roles: ${approverRoleIds.map(id => `<@&${id}>`).join(', ') || 'None'}\n• Members: None`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.reply({
      embeds: [successMsg],
      flags: 64,
    });
  } catch (error) {
    console.error('Error skipping approver members:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleDenyRoleRequest(interaction) {
  try {
    const requestId = interaction.customId.replace('deny_rolereq_', '');
    const request = await RoleRequest.findOne({ requestId: requestId });

    if (!request) {
      return interaction.reply({
        embeds: [errorEmbed('Request not found.')],
        flags: 64,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        embeds: [errorEmbed(`This request has already been ${request.status}.`)],
        flags: 64,
      });
    }

    // Verify the approver has permission to deny this role
    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    
    if (!config) {
      return interaction.reply({
        embeds: [errorEmbed('Role request system is not configured.')],
        flags: 64,
      });
    }

    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        flags: 64,
      });
    }

    // Check if the user clicking deny is the one who was sent the request
    const approverUserId = interaction.user.id;

    if (request.approverId !== approverUserId) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot deny this request - it wasn't sent to you.`)],
        flags: 64,
      });
    }

    // Get the guild (needed since interaction happens in DM)
    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({
        embeds: [errorEmbed('Guild not found.')],
        flags: 64,
      });
    }

    request.status = 'denied';
    request.deniedAt = new Date();
    await request.save();

    // Update the DM message
    try {
      const dmChannel = await interaction.client.channels.fetch(request.dmChannelId);
      const dmMessage = await dmChannel.messages.fetch(request.messageId);
      
      const deniedEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Request Denied')
        .setDescription(`❌ <@${request.requesterId}>'s request for **${request.roleName}** has been **denied** by ${interaction.user.username}.`)
        .setFooter({ text: 'RolePlayManager' });

      await dmMessage.edit({
        embeds: [deniedEmbed],
        components: [],
      });
    } catch (err) {
      console.error('Error updating DM:', err);
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Role Request Denied')
      .setDescription(`❌ You've denied the role request for <@${request.requesterId}>.\n\nRole: **${request.roleName}**`)
      .setFooter({ text: 'RolePlayManager' });

    await interaction.reply({
      embeds: [successEmbed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error denying role request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
