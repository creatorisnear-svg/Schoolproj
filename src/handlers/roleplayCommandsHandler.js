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

export async function handleRoleplayCommandsSelect(interaction) {
  const choice = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'cmd_911') {
      // Show 911 form
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('911report')
        .setTitle('911 Report Form');

      const issueInput = new TextInputBuilder()
        .setCustomId('issue')
        .setLabel('Issue')
        .setPlaceholder('What happened? (e.g., Armed Robbery, Car Accident)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Location')
        .setPlaceholder('Where did this happen? (e.g., Legion Square)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const suspectsDescInput = new TextInputBuilder()
        .setCustomId('suspectsDescription')
        .setLabel('Suspects & Vehicle Information')
        .setPlaceholder('Include: # of suspects, names, physical description, vehicle make/model/color, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const lastSeenInput = new TextInputBuilder()
        .setCustomId('lastSeen')
        .setLabel('Last Seen')
        .setPlaceholder('Last known location or direction of travel...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const contactInput = new TextInputBuilder()
        .setCustomId('contact')
        .setLabel('How can we contact you if needed?')
        .setPlaceholder('Discord tag, in-game name, phone number, etc.')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(issueInput);
      const row2 = new ActionRowBuilder().addComponents(locationInput);
      const row3 = new ActionRowBuilder().addComponents(suspectsDescInput);
      const row4 = new ActionRowBuilder().addComponents(lastSeenInput);
      const row5 = new ActionRowBuilder().addComponents(contactInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_twitter') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('twitter_post_modal')
        .setTitle('Post to Twitter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('twitter_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_anon') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('anon_post_modal')
        .setTitle('Post Anonymously')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('anon_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post anonymously?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_cad') {
      const cadEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('GTA5 RP - CAD System')
        .setDescription('Computer Aided Dispatch - Law Enforcement Operations')
        .addFields(
          { name: '📍 Active Units', value: 'No active units at this time', inline: false },
          { name: '🚨 Dispatch Calls', value: 'No active calls', inline: false },
          { name: '📋 Recent Activity', value: 'System online and monitoring', inline: false }
        )
        .setFooter({ text: 'EverLink' })
        .setTimestamp();

      return interaction.reply({
        embeds: [cadEmbed],
        ephemeral: false,
      });
    }
  } catch (error) {
    console.error('Error handling roleplay commands select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
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
              { label: '🚒 Set Fire Department Roles (Pinged on Dispatch)', value: 'set_fd_roles' },
              { label: '👮 Set Staff Roles', value: 'set_staff_roles' },
              { label: '✅ Done - Back to Main Menu', value: 'emergency_done' }
            )
        );

      return interaction.reply({
        content: '**🚨 Emergency & Dispatch Setup**\n\nConfigure 911 reports and CAD dispatch:',
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

export async function handle911ReportModal(interaction) {
  try {
    const issue = interaction.fields.getTextInputValue('issue');
    const location = interaction.fields.getTextInputValue('location');
    const suspectsDesc = interaction.fields.getTextInputValue('suspectsDescription') || 'N/A';
    const lastSeen = interaction.fields.getTextInputValue('lastSeen') || 'Unknown';
    const contact = interaction.fields.getTextInputValue('contact') || 'No contact info provided';

    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.use911Channel) {
      return interaction.reply({
        embeds: [errorEmbed('911 channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.use911Channel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('911 channel not found.')],
        ephemeral: true,
      });
    }

    // Get LEO and Fire Department roles to ping
    const CADConfig = await import('../models/CADConfig.js').then(m => m.default);
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
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ 
      content: mention,
      embeds: [emergencyEmbed] 
    });

    return interaction.reply({
      content: '✅ 911 report submitted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling 911 report:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting the report.')],
      ephemeral: true,
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

    const menuData = await showCADSetupMenu(interaction);
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

    const menuData = await showCADSetupMenu(interaction);
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

    const menuData = await showCADSetupMenu(interaction);
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
