import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

// Helper to show main menu
async function showSetupMenu(interaction) {
  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('roleplaycommands_setup_menu')
        .setPlaceholder('Choose a command to configure...')
        .addOptions(
          { label: '🚨 911 & CAD - Emergency/Dispatch', value: 'setup_emergency' },
          { label: '🐦 Twitter - Public Messages', value: 'setup_twitter' },
          { label: '🤫 Anon - Anonymous Messages', value: 'setup_anon' },
          { label: '✅ Done - Close Setup', value: 'setup_done' }
        )
    );

  return {
    content: '**Roleplay Commands Setup**\n\nSelect a command to configure:',
    components: [menu],
    ephemeral: true,
  };
}

// Helper to show CAD submenu
async function showCADSetupMenu(interaction) {
  const cadMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('roleplaycommands_cad_setup_menu')
        .setPlaceholder('Choose CAD setup option...')
        .addOptions(
          { label: 'Set LEO Roles', value: 'set_leo_roles' },
          { label: 'Set Fire Department Roles', value: 'set_fd_roles' },
          { label: 'Set Staff Roles', value: 'set_staff_roles' },
          { label: '✅ Done - Back to Main Menu', value: 'cad_done' }
        )
    );

  return {
    content: '**CAD System Setup**\n\nConfigure which roles have access to CAD features:',
    components: [cadMenu],
    ephemeral: true,
  };
}

// Helper to show emergency menu
async function showEmergencySetupMenu(interaction) {
  const emergencyMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('roleplaycommands_emergency_setup_menu')
        .setPlaceholder('Choose emergency/dispatch option...')
        .addOptions(
          { label: '🚑 Select 911 Channel', value: 'setup_911' },
          { label: '🚔 Set LEO Roles (Pinged on 911)', value: 'set_leo_roles' },
          { label: '🚒 Set Fire Department Roles (Pinged on 911)', value: 'set_fd_roles' },
          { label: '👮 Set Staff Roles', value: 'set_staff_roles' },
          { label: '✅ Done - Back to Main Menu', value: 'emergency_done' }
        )
    );

  return {
    content: '**🚨 Emergency & Dispatch Setup**\n\nConfigure 911 reports with LEO and Fire Department response:',
    components: [emergencyMenu],
    ephemeral: true,
  };
}

export async function handleRoleplayCommandsSelect(interaction) {
  // This function is deprecated - all roleplay commands use the civilian database menu instead
  return interaction.reply({
    embeds: [errorEmbed('This menu is no longer active. Use `/civiliandatabase` instead.')],
    ephemeral: true,
  });
}

export async function handleRoleplayCommandsSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'setup_911') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_911_channel')
        .setPlaceholder('Select the 911 reporting channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where 911 reports will be sent:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_twitter') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_twitter_channel')
        .setPlaceholder('Select the Twitter channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel for Twitter posts:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_anon') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_anon_channel')
        .setPlaceholder('Select the anonymous/black market channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel for anonymous messages:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_emergency') {
      roleplayConfig.use911 = true;
      roleplayConfig.useCAD = true;
      await roleplayConfig.save();

      let cadConfig = await CADConfig.findOne({ guildId: interaction.guildId }) || new CADConfig({ guildId: interaction.guildId });
      cadConfig.enabled = true;
      await cadConfig.save();

      const emergencyMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('roleplaycommands_emergency_setup_menu')
            .setPlaceholder('Choose emergency/dispatch option...')
            .addOptions(
              { label: '🚑 Select 911 Channel', value: 'setup_911' },
              { label: '🚔 Set LEO Roles (Pinged on 911)', value: 'set_leo_roles' },
              { label: '🚒 Set Fire Department Roles (Pinged on 911)', value: 'set_fd_roles' },
              { label: '👮 Set Staff Roles', value: 'set_staff_roles' },
              { label: '✅ Done - Back to Main Menu', value: 'emergency_done' }
            )
        );

      return interaction.reply({
        content: '**🚨 Emergency & Dispatch Setup**\n\nConfigure 911 reports with LEO and Fire Department response:',
        components: [emergencyMenu],
        ephemeral: true,
      });
    }

    if (choice === 'setup_done') {
      return interaction.reply({
        embeds: [successEmbed('Setup Complete', 'Your roleplay commands are ready to use!')],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in roleplay commands setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommand911Channel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.use911 = true;
    roleplayConfig.use911Channel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('911 Channel Set', `911 reports will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting 911 channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandTwitterChannel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.useTwitter = true;
    roleplayConfig.twitterChannel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Twitter Channel Set', `Twitter posts will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting Twitter channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandAnonChannel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.useAnon = true;
    roleplayConfig.anonChannel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Anon Channel Set', `Anonymous messages will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting anon channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleTwitterPostModal(interaction) {
  const message = interaction.fields.getTextInputValue('twitter_message');

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.twitterChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Twitter channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.twitterChannel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Twitter channel not found.')],
        ephemeral: true,
      });
    }

    const twitterEmbed = new EmbedBuilder()
      .setColor('#1DA1F2')
      .setTitle('Twitter Post')
      .setDescription(message)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ embeds: [twitterEmbed] });

    return interaction.reply({
      content: '✅ Tweet posted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling twitter post:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while posting.')],
      ephemeral: true,
    });
  }
}

export async function handleAnonPostModal(interaction) {
  const message = interaction.fields.getTextInputValue('anon_message');

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.anonChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Anonymous channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.anonChannel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Anonymous channel not found.')],
        ephemeral: true,
      });
    }

    const anonEmbed = new EmbedBuilder()
      .setColor('#808080')
      .setTitle('Anonymous Message')
      .setDescription(message)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ embeds: [anonEmbed] });

    return interaction.reply({
      content: '✅ Anonymous message posted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling anon post:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while posting.')],
      ephemeral: true,
    });
  }
}

// Track recent 911 submissions to prevent duplicates
const recent911Submissions = new Map();

export async function handle911ReportModal(interaction) {
  try {
    console.log(`🚨 911 REPORT STARTED - User: ${interaction.user.id}, Guild: ${interaction.guildId}`);
    
    // Immediately defer the reply to prevent interaction timeout
    await interaction.deferReply({ ephemeral: true });
    console.log(`✓ Deferred reply for user ${interaction.user.id}`);

    // Anti-duplicate check: if this user submitted a 911 in the last 2 seconds, ignore
    const submissionKey = `${interaction.guildId}-${interaction.user.id}`;
    if (recent911Submissions.has(submissionKey)) {
      console.log(`⚠️ DUPLICATE 911 DETECTED - blocking user ${interaction.user.id}`);
      return interaction.editReply({
        content: '⏳ Please wait before submitting another 911 report.',
      });
    }
    recent911Submissions.set(submissionKey, true);
    setTimeout(() => recent911Submissions.delete(submissionKey), 2000);
    console.log(`✓ Set duplicate cooldown for user ${interaction.user.id}`);

    const issue = interaction.fields.getTextInputValue('issue');
    const location = interaction.fields.getTextInputValue('location');
    const suspectsDesc = interaction.fields.getTextInputValue('suspectsDescription') || 'N/A';
    const lastSeen = interaction.fields.getTextInputValue('lastSeen') || 'Unknown';
    const contact = interaction.fields.getTextInputValue('contact') || 'No contact info provided';

    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.use911Channel) {
      return interaction.editReply({
        embeds: [errorEmbed('911 channel not configured.')],
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.use911Channel).catch(() => null);

    if (!channel) {
      return interaction.editReply({
        embeds: [errorEmbed('911 channel not found.')],
      });
    }

    // Get LEO and Fire Department roles to ping
    const CADConfig = await import('../models/CADConfig.js').then(m => m.default);
    const EmergencyCall = await import('../models/EmergencyCall.js').then(m => m.default);
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    
    let mentions = [];
    if (cadConfig) {
      if (cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0) {
        mentions.push(...cadConfig.leoRoleIds.map(id => `<@&${id}>`));
      }
      if (cadConfig.fireDepartmentRoleIds && cadConfig.fireDepartmentRoleIds.length > 0) {
        mentions.push(...cadConfig.fireDepartmentRoleIds.map(id => `<@&${id}>`));
      }
    }
    const mention = mentions.length > 0 ? mentions.join(' ') : '@here Emergency report incoming!';

    // Create emergency call record
    const callId = `${interaction.guildId}-${Date.now()}`;
    const emergencyCall = new EmergencyCall({
      guildId: interaction.guildId,
      callId,
      issue,
      location,
      suspectsDescription: suspectsDesc,
      lastSeen,
      contact,
      reporterUsername: interaction.user.username,
      reporterId: interaction.user.id,
      status: 'active'
    });
    await emergencyCall.save();

    const emergencyEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚨 911 Emergency Report')
      .addFields(
        { name: 'Issue', value: issue, inline: false },
        { name: 'Location', value: location, inline: true },
        { name: 'Reporter', value: interaction.user.username, inline: true },
        { name: 'Suspects & Vehicle', value: suspectsDesc, inline: false },
        { name: 'Last Seen', value: lastSeen, inline: false },
        { name: 'Contact Info', value: contact, inline: false }
      )
      .setFooter({ text: `EverLink | Call ID: ${callId}` })
      .setTimestamp();

    const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = await import('discord.js');

    // Create buttons for 911 response
    const respondButton = new ButtonBuilder()
      .setCustomId(`911_respond_${callId}`)
      .setLabel('🚨 Respond')
      .setStyle(ButtonStyle.Danger);

    const attachButton = new ButtonBuilder()
      .setCustomId(`911_attach_${callId}`)
      .setLabel('📎 Attach')
      .setStyle(ButtonStyle.Primary);

    const dismissButton = new ButtonBuilder()
      .setCustomId(`911_dismiss_${callId}`)
      .setLabel('❌ Dismiss')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder()
      .addComponents(respondButton, attachButton, dismissButton);

    console.log(`📢 Sending 911 message to channel ${roleplayConfig.use911Channel}`);
    const sentMessage = await channel.send({ 
      content: mention,
      embeds: [emergencyEmbed],
      components: [buttonRow]
    });
    console.log(`✓ 911 message sent successfully - Message ID: ${sentMessage.id}, Call ID: ${callId}`);

    return interaction.editReply({
      content: '✅ 911 report submitted!',
    });
  } catch (error) {
    console.error('Error handling 911 report:', error);
    return interaction.editReply({
      embeds: [errorEmbed('An error occurred while submitting the report.')],
      content: '',
    });
  }
}

export async function handleRoleplayCommandsEnableMenu(interaction) {
  const choice = interaction.values[0];

  try {
    let roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'enable') {
      roleplayConfig.enabled = true;
      await roleplayConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Roleplay Commands Enabled', 'Members now have access to roleplay commands. Run `/roleplaycommandsetup` to configure.')],
        ephemeral: true,
      });
    }

    if (choice === 'disable') {
      roleplayConfig.enabled = false;
      await roleplayConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Roleplay Commands Disabled', 'Members no longer have access to roleplay commands.')],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in roleplay commands enable menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsEmergencySetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    let cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    // Create CADConfig if it doesn't exist
    if (!cadConfig) {
      cadConfig = new CADConfig({ guildId: interaction.guildId, enabled: true });
      await cadConfig.save();
    }

    if (choice === 'setup_911') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_emergency_911_channel')
        .setPlaceholder('Select the 911 reporting channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where 911 reports will be sent:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_leo_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_emergency_leo_roles')
        .setPlaceholder('Select LEO roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that will be pinged on 911 reports (LEO):',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_fd_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_emergency_fd_roles')
        .setPlaceholder('Select Fire Department roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that will be pinged on 911 reports (Fire Department):',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_staff_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_emergency_staff_roles')
        .setPlaceholder('Select staff roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can manage the CAD/911 system:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'emergency_done') {
      const menuData = await showSetupMenu(interaction);
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Emergency Setup Complete', 'Returning to main roleplay commands setup menu.')],
      });
    }
  } catch (error) {
    console.error('Error in emergency setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsEmergency911Channel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.use911 = true;
    roleplayConfig.use911Channel = channelId;
    await roleplayConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('911 Channel Set', `911 reports will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting emergency 911 channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsEmergencyLEORoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.leoRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('LEO Roles Set', `${selectedRoles.length} LEO role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting emergency LEO roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsEmergencyFDRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.fireDepartmentRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Fire Department Roles Set', `${selectedRoles.length} FD role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting emergency FD roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsEmergencyStaffRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.staffRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Staff Roles Set', `${selectedRoles.length} staff role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting emergency staff roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsCADSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'set_leo_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_cad_leo_roles')
        .setPlaceholder('Select LEO roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can access LEO features (search license plates, etc.):',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_fd_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_cad_fd_roles')
        .setPlaceholder('Select Fire Department roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can access Fire Department features:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_staff_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('roleplaycommands_cad_staff_roles')
        .setPlaceholder('Select staff roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can manage the CAD system:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'cad_done') {
      const menuData = await showSetupMenu(interaction);
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('CAD Setup Complete', 'Returning to main roleplay commands setup menu.')],
      });
    }
  } catch (error) {
    console.error('Error in roleplay commands CAD setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsCADLeoRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.leoRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('LEO Roles Set', `${selectedRoles.length} LEO role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting LEO roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsCADFDRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.fireDepartmentRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Fire Department Roles Set', `${selectedRoles.length} FD role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting FD roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsCADStaffRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.staffRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showEmergencySetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Staff Roles Set', `${selectedRoles.length} staff role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting staff roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
