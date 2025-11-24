import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder, UserSelectMenuBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import RoleRequest from '../models/RoleRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

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

    await interaction.reply({
      content: 'Step 1: Select the role members can request',
      components: [roleSelect],
      ephemeral: true,
    });
  } else if (value === 'delete_role') {
    // Show delete option
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.roles || config.roles.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No role request types to delete.')],
        ephemeral: true,
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

    await interaction.reply({
      content: 'Which role request type would you like to delete?',
      components: [menu],
      ephemeral: true,
    });
  } else if (value === 'view_roles') {
    // Show all role request types
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.roles || config.roles.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No role request types configured yet.')],
        ephemeral: true,
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
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } else if (value === 'setup_done') {
    await interaction.reply({
      content: '✅ Role request setup closed.',
      ephemeral: true,
    });
  }
}

export async function handleSelectRoleForRequest(interaction) {
  try {
    const selectedRoleId = interaction.values[0];

    // Show approver role selection
    const approverRoleSelect = new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`select_approver_roles_${selectedRoleId}`)
          .setPlaceholder('Select approver roles...')
          .setMinValues(1)
          .setMaxValues(25)
      );

    await interaction.reply({
      content: 'Step 2: Select which roles can approve requests for this role',
      components: [approverRoleSelect],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting role for request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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

    const skipButtonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`skip_approver_members_${requestedRoleId}_${selectedApproverRoleIds.join(',')}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      content: 'Step 3: Select individual members who can also approve (or click Skip)',
      components: [approverMemberSelect, skipButtonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting approver roles:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleSelectApproverMembers(interaction) {
  try {
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
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting approver members:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
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
        ephemeral: true,
      });
    }

    const deletedRole = config.roles[roleIndex];
    config.roles.splice(roleIndex, 1);
    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Request Type Deleted')
      .setDescription(`✅ **${deletedRole.roleName}** has been removed from the role request system.`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error deleting role request type:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
        ephemeral: true,
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
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [embed],
      components: [userMenu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting role to request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
        ephemeral: true,
      });
    }

    // Verify the selected user exists in the guild
    let approverMember = null;
    try {
      approverMember = await interaction.guild.members.fetch(approverId);
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Could not find the selected user in this guild.')],
        ephemeral: true,
      });
    }

    // Verify the selected user is authorized to approve this role
    if (!roleConfig.approverMemberIds.includes(approverId)) {
      return interaction.reply({
        embeds: [errorEmbed(`${approverMember.user.username} is not authorized to approve the **${roleConfig.roleName}** role.`)],
        ephemeral: true,
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
        .setFooter({ text: 'EverLink' });

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
        ephemeral: true,
      });
    }

    await newRequest.save();

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Request Sent')
      .setDescription(`✅ Your request for **${roleConfig.roleName}** has been sent to ${approverUsername}!\n\nYou'll receive a message once it's reviewed.`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting approver:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
        ephemeral: true,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        embeds: [errorEmbed(`This request has already been ${request.status}.`)],
        ephemeral: true,
      });
    }

    // Verify the approver has permission to approve this role
    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    
    if (!config) {
      return interaction.reply({
        embeds: [errorEmbed('Role request system is not configured.')],
        ephemeral: true,
      });
    }

    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        ephemeral: true,
      });
    }

    // Check if the user clicking approve is the one who was sent the request
    const approverUserId = interaction.user.id;

    if (request.approverId !== approverUserId) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot approve this request - it wasn't sent to you.`)],
        ephemeral: true,
      });
    }

    // Get the guild and member (needed since interaction happens in DM)
    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({
        embeds: [errorEmbed('Guild not found.')],
        ephemeral: true,
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
        ephemeral: true,
      });
    }

    try {
      await requester.roles.add(request.roleId);
    } catch (err) {
      console.error('Error adding role:', err);
      return interaction.reply({
        embeds: [errorEmbed('Could not add the role. Please check bot permissions.')],
        ephemeral: true,
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
        .setDescription(`✅ <@${request.requesterId}>'s request for <@&${request.roleId}> has been **approved** by ${interaction.user.username}!`)
        .setFooter({ text: 'EverLink' });

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
      .setDescription(`✅ You've approved the role request for <@${request.requesterId}>!\n\nRole given: <@&${request.roleId}>`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error approving role request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
        ephemeral: true,
      });
    }

    // Get all members with this role
    const members = await interaction.guild.members.fetch();
    const membersWithRole = members.filter(m => m.roles.cache.has(roleConfig.roleId) && !m.user.bot);

    if (membersWithRole.size === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#2E2E2E')
            .setTitle(`Members with ${roleConfig.roleName}`)
            .setDescription('No members currently have this role.')
            .setFooter({ text: 'EverLink' })
        ],
        ephemeral: true,
      });
    }

    // Show members and allow removal
    const memberOptions = membersWithRole.map(m => ({
      label: m.user.username,
      value: m.id,
      description: 'Click to remove this role'
    })).slice(0, 25);

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`remove_role_from_member_${roleRequestTypeId}`)
          .setPlaceholder('Select a member to remove the role from...')
          .addOptions(memberOptions)
      );

    let description = `**${roleConfig.roleName}** - ${membersWithRole.size} member(s)\n\n`;
    membersWithRole.forEach(m => {
      description += `• ${m.user.username}\n`;
    });

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle(`Manage ${roleConfig.roleName}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [embed],
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error managing role:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
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
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(memberId);
    await member.roles.remove(roleConfig.roleId);

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Removed')
      .setDescription(`✅ Removed <@&${roleConfig.roleId}> from ${member.user.username}`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error removing role from member:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error skipping approver members:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
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
        ephemeral: true,
      });
    }

    if (request.status !== 'pending') {
      return interaction.reply({
        embeds: [errorEmbed(`This request has already been ${request.status}.`)],
        ephemeral: true,
      });
    }

    // Verify the approver has permission to deny this role
    const config = await RoleRequestConfig.findOne({ guildId: request.guildId });
    
    if (!config) {
      return interaction.reply({
        embeds: [errorEmbed('Role request system is not configured.')],
        ephemeral: true,
      });
    }

    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        ephemeral: true,
      });
    }

    // Check if the user clicking deny is the one who was sent the request
    const approverUserId = interaction.user.id;

    if (request.approverId !== approverUserId) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot deny this request - it wasn't sent to you.`)],
        ephemeral: true,
      });
    }

    // Get the guild (needed since interaction happens in DM)
    const guild = interaction.client.guilds.cache.get(request.guildId);
    if (!guild) {
      return interaction.reply({
        embeds: [errorEmbed('Guild not found.')],
        ephemeral: true,
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
        .setDescription(`❌ <@${request.requesterId}>'s request for <@&${request.roleId}> has been **denied** by ${interaction.user.username}.`)
        .setFooter({ text: 'EverLink' });

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
      .setDescription(`❌ You've denied the role request for <@${request.requesterId}>.\n\nRole: <@&${request.roleId}>`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error denying role request:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
