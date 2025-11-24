import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import RoleRequest from '../models/RoleRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export async function handleRoleRequestSetupMenu(interaction) {
  const value = interaction.values[0];

  if (value === 'add_role') {
    // Show modal to add a new role request type
    const modal = new ModalBuilder()
      .setCustomId('add_rolerequest_type_modal')
      .setTitle('Add Role Request Type');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_role_id')
          .setLabel('Role Mention or ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g., @leo or 123456789')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_approver_roles')
          .setLabel('Approver Roles (mentions or IDs, comma-separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g., @police chief, 987654321')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('input_approver_members')
          .setLabel('Approver Members (mentions or IDs, comma-separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g., @admin, 111222333')
          .setRequired(false)
      )
    );

    await interaction.showModal(modal);
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

export async function handleAddRoleRequestTypeModal(interaction) {
  try {
    const roleInput = interaction.fields.getTextInputValue('input_role_id').trim();
    const approverRolesInput = interaction.fields.getTextInputValue('input_approver_roles').trim();
    const approverMembersInput = interaction.fields.getTextInputValue('input_approver_members').trim();

    let roleId = roleInput.replace(/[<@&>]/g, '');
    let roleName = roleInput;

    // Try to fetch the role from the guild
    try {
      const role = await interaction.guild.roles.fetch(roleId);
      roleName = role.name;
    } catch (err) {
      // Role not found, use the input as name
    }

    // Parse approver roles
    const approverRoleIds = [];
    for (const item of approverRolesInput.split(',')) {
      const cleaned = item.trim().replace(/[<@&>]/g, '');
      if (cleaned) {
        try {
          await interaction.guild.roles.fetch(cleaned);
          approverRoleIds.push(cleaned);
        } catch (err) {
          // Role not found, skip
        }
      }
    }

    // Parse approver members
    const approverMemberIds = [];
    for (const item of approverMembersInput.split(',')) {
      const cleaned = item.trim().replace(/[<@>]/g, '');
      if (cleaned) {
        try {
          await interaction.guild.members.fetch(cleaned);
          approverMemberIds.push(cleaned);
        } catch (err) {
          // Member not found, skip
        }
      }
    }

    if (approverRoleIds.length === 0 && approverMemberIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No valid approver roles or members found.')],
        ephemeral: true,
      });
    }

    // Add to config
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleRequestId = uuidv4();

    config.roles.push({
      id: roleRequestId,
      roleId: roleId,
      roleName: roleName,
      approverRoleIds: approverRoleIds,
      approverMemberIds: approverMemberIds,
      createdAt: new Date(),
    });

    await config.save();

    const successMsg = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Role Request Type Added')
      .setDescription(`✅ **${roleName}** has been added to the role request system.\n\n**Approvers:**\n• Roles: ${approverRoleIds.map(id => `<@&${id}>`).join(', ') || 'None'}\n• Members: ${approverMemberIds.map(id => `<@${id}>`).join(', ') || 'None'}`)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding role request type:', error);
    await interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the role request type.')],
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

    // Show approver selection menu
    const approverOptions = [];

    // Add approver roles
    for (const roleId of roleConfig.approverRoleIds) {
      try {
        const role = await interaction.guild.roles.fetch(roleId);
        approverOptions.push({
          label: `${role.name} (Role)`,
          value: `role_${roleId}`,
          description: 'Approve as this role'
        });
      } catch (err) {
        // Skip invalid roles
      }
    }

    // Add approver members
    for (const memberId of roleConfig.approverMemberIds) {
      try {
        const member = await interaction.guild.members.fetch(memberId);
        approverOptions.push({
          label: `${member.user.username} (Member)`,
          value: `member_${memberId}`,
          description: 'Approve as this member'
        });
      } catch (err) {
        // Skip invalid members
      }
    }

    if (approverOptions.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No approvers available for this role.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`select_approver_${roleRequestId}`)
          .setPlaceholder('Select who to send the request to...')
          .addOptions(approverOptions)
      );

    await interaction.reply({
      content: `Who should approve your request for **${roleConfig.roleName}**?`,
      components: [menu],
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
    
    const approverValue = interaction.values[0];
    const [approverType, approverId] = approverValue.split('_');

    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.id === roleRequestId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Role request type not found.')],
        ephemeral: true,
      });
    }

    // Verify the selected approver actually has permission to approve this role
    let approverIsAuthorized = false;

    if (approverType === 'role') {
      // Check if this role is in the approver list
      approverIsAuthorized = roleConfig.approverRoleIds.includes(approverId);
    } else {
      // Check if this member is in the approver list
      approverIsAuthorized = roleConfig.approverMemberIds.includes(approverId);
    }

    if (!approverIsAuthorized) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot request the <@&${roleConfig.roleId}> role.`)],
        ephemeral: true,
      });
    }

    // Create the request
    const requestId = `ROLEREQ-${Date.now()}`;
    const requesterUsername = interaction.user.username;
    const requesterId = interaction.user.id;

    let approverUsername = '';
    if (approverType === 'role') {
      try {
        const role = await interaction.guild.roles.fetch(approverId);
        approverUsername = role.name;
      } catch (err) {
        approverUsername = 'Unknown Role';
      }
    } else {
      try {
        const member = await interaction.guild.members.fetch(approverId);
        approverUsername = member.user.username;
      } catch (err) {
        approverUsername = 'Unknown Member';
      }
    }

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

    // Send DM to the approver(s)
    let sentCount = 0;

    if (approverType === 'role') {
      // Send to all members with that role
      const members = await interaction.guild.members.fetch();
      const approvers = members.filter(m => m.roles.cache.has(approverId));

      for (const [, member] of approvers) {
        if (!member.user.bot) {
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor('#FFA500')
              .setTitle('Role Request Approval')
              .setDescription(`<@${requesterId}> has requested the role <@&${roleConfig.roleId}>\n\n**Requester:** ${requesterUsername}\n**Requested Role:** ${roleConfig.roleName}`)
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

            const dmMsg = await member.send({
              embeds: [dmEmbed],
              components: [buttons],
            });

            newRequest.messageId = dmMsg.id;
            newRequest.dmChannelId = dmMsg.channelId;
            sentCount++;
          } catch (err) {
            console.error(`Could not send DM to ${member.user.username}:`, err);
          }
        }
      }
    } else {
      // Send to specific member
      try {
        const approver = await interaction.guild.members.fetch(approverId);
        const dmEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('Role Request Approval')
          .setDescription(`<@${requesterId}> has requested the role <@&${roleConfig.roleId}>\n\n**Requester:** ${requesterUsername}\n**Requested Role:** ${roleConfig.roleName}`)
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

        const dmMsg = await approver.send({
          embeds: [dmEmbed],
          components: [buttons],
        });

        newRequest.messageId = dmMsg.id;
        newRequest.dmChannelId = dmMsg.channelId;
        sentCount++;
      } catch (err) {
        console.error(`Could not send DM to ${approverId}:`, err);
        return interaction.reply({
          embeds: [errorEmbed('Could not send DM to the approver. Make sure they have DMs enabled.')],
          ephemeral: true,
        });
      }
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
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        ephemeral: true,
      });
    }

    // Check if the user clicking approve is authorized
    const approverUserId = interaction.user.id;
    let isAuthorized = false;

    // Check if they have any of the approver roles
    for (const approverRoleId of roleConfig.approverRoleIds) {
      if (interaction.member.roles.cache.has(approverRoleId)) {
        isAuthorized = true;
        break;
      }
    }

    // Check if they're in the approver members list
    if (!isAuthorized && roleConfig.approverMemberIds.includes(approverUserId)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot approve the <@&${request.roleId}> role.`)],
        ephemeral: true,
      });
    }

    // Verify the approver has permission
    const member = await interaction.guild.members.fetch(request.requesterId);
    const guild = interaction.guild;

    try {
      await member.roles.add(request.roleId);
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
    const config = await RoleRequestConfig.findOne({ guildId: interaction.guildId });
    const roleConfig = config.roles.find(r => r.roleId === request.roleId);

    if (!roleConfig) {
      return interaction.reply({
        embeds: [errorEmbed('This role request type is no longer configured.')],
        ephemeral: true,
      });
    }

    // Check if the user clicking deny is authorized
    const approverUserId = interaction.user.id;
    let isAuthorized = false;

    // Check if they have any of the approver roles
    for (const approverRoleId of roleConfig.approverRoleIds) {
      if (interaction.member.roles.cache.has(approverRoleId)) {
        isAuthorized = true;
        break;
      }
    }

    // Check if they're in the approver members list
    if (!isAuthorized && roleConfig.approverMemberIds.includes(approverUserId)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return interaction.reply({
        embeds: [errorEmbed(`You cannot deny the <@&${request.roleId}> role.`)],
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
