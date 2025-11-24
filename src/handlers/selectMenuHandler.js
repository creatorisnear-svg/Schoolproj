import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, StringSelectMenuBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import Welcome from '../models/Welcome.js';
import Config from '../models/Config.js';
import { StrikeConfig } from '../models/Strike.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

function createSetupMenu() {
  const steps = [
    { id: 'select_verify_channel', label: 'Select Verify Channel' },
    { id: 'select_welcome_channel', label: 'Select Welcome Channel' },
    { id: 'select_unverified_role', label: 'Select Unverified Role' },
    { id: 'select_verified_role', label: 'Select Verified Role' },
    { id: 'set_rp_tag', label: 'Set RP Tag (Required)' },
    { id: 'set_custom_question', label: 'Set Custom Question (Optional)' },
    { id: 'set_dm_message', label: 'Set DM Message (Optional)' },
    { id: 'verify_setup_done', label: '✅ Done - Close Setup' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('verify_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return {
    content: '**Verification System Setup**\n\nSelect an option below to configure your verification system:',
    components: [menu],
    flags: 64
  };
}

function createWelcomeSetupMenu() {
  const steps = [
    { id: 'select_welcome_channel_setup', label: 'Select Welcome Channel' },
    { id: 'set_welcome_message_setup', label: 'Set Welcome Message' },
    { id: 'set_welcome_dm_setup', label: 'Set Welcome DM' },
    { id: 'welcome_setup_done', label: '✅ Done - Close Setup' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('welcome_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return {
    content: '**Welcome System Setup**\n\nSelect an option below to configure your welcome system:',
    components: [menu],
    flags: 64
  };
}

function createStrikeSetupMenu() {
  const steps = [
    { id: 'strike_set_roles', label: 'Set Strike Level Roles (Optional)' },
    { id: 'strike_set_actions', label: 'Set Strike Actions (Kick/Timeout/Ban)' },
    { id: 'strike_setup_done', label: '✅ Done - Close Setup' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('strike_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return {
    content: '**Strike System Setup**\n\nSelect an option below to configure your strike system:',
    components: [menu],
    flags: 64
  };
}

export async function handleSelectMenu(interaction) {
  if (interaction.customId === 'reactionrole_main_menu') {
    await handleReactionRoleMainMenu(interaction);
  }

  if (interaction.customId === 'reactionrole_send_channel_select') {
    await handleReactionRoleSendChannel(interaction);
  }

  if (interaction.customId.startsWith('reactionrole_role_select_')) {
    await handleReactionRoleSelect(interaction);
  }

  if (interaction.customId === 'setlogchannel_select') {
    await handleSetLogChannel(interaction);
  }

  if (interaction.customId === 'verify_setup_menu') {
    await handleVerifySetupMenu(interaction);
  }
  
  if (interaction.customId === 'select_verify_channel_menu') {
    await handleVerifyChannelSelect(interaction);
  }
  
  if (interaction.customId === 'select_welcome_channel_menu') {
    await handleWelcomeChannelSelect(interaction);
  }
  
  if (interaction.customId === 'select_unverified_role_menu') {
    await handleUnverifiedRoleSelect(interaction);
  }
  
  if (interaction.customId === 'select_verified_role_menu') {
    await handleVerifiedRoleSelect(interaction);
  }

  if (interaction.customId === 'welcome_channel_select') {
    await handleWelcomeSystemChannelSelect(interaction);
  }

  if (interaction.customId === 'welcome_setup_menu') {
    await handleWelcomeSetupMenu(interaction);
  }

  if (interaction.customId === 'select_welcome_channel_setup_menu') {
    await handleWelcomeSetupChannelSelect(interaction);
  }

  if (interaction.customId === 'strike_setup_menu') {
    await handleStrikeSetupMenu(interaction);
  }

  if (interaction.customId === 'strike_roles_select_1') {
    await handleStrikeRoleSelect(interaction, 1);
  }

  if (interaction.customId === 'strike_roles_select_2') {
    await handleStrikeRoleSelect(interaction, 2);
  }

  if (interaction.customId === 'strike_roles_select_3') {
    await handleStrikeRoleSelect(interaction, 3);
  }

  if (interaction.customId === 'strike_roles_select_4') {
    await handleStrikeRoleSelect(interaction, 4);
  }

  if (interaction.customId === 'strike_action_select_1') {
    await handleStrikeActionSelect(interaction, 1);
  }

  if (interaction.customId === 'strike_action_select_2') {
    await handleStrikeActionSelect(interaction, 2);
  }

  if (interaction.customId === 'strike_action_select_3') {
    await handleStrikeActionSelect(interaction, 3);
  }

  if (interaction.customId === 'strike_action_select_4') {
    await handleStrikeActionSelect(interaction, 4);
  }

  if (interaction.customId === 'antipromotingsetup_menu') {
    await handleAntiPromotingSetupMenu(interaction);
  }

  if (interaction.customId === 'antipromotingsetup_remove_link') {
    await handleAntiPromotingRemoveLink(interaction);
  }

  if (interaction.customId === 'stickylist_delete_menu') {
    await handleStickyListDelete(interaction);
  }

  if (interaction.customId === 'status_main_menu') {
    await handleStatusMainMenu(interaction);
  }

  if (interaction.customId === 'status_heartbeat_channel_select') {
    await handleStatusChannelSelect(interaction);
  }

}

async function handleVerifySetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_verify_channel') {
      const { ButtonBuilder, ButtonStyle } = await import('discord.js');
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_verify_channel_menu')
        .setPlaceholder('Select the verify channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the channel where users can verify:',
        components: [row, backButton],
      });
    }

    if (choice === 'select_welcome_channel') {
      const { ButtonBuilder, ButtonStyle } = await import('discord.js');
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_welcome_channel_menu')
        .setPlaceholder('Select the welcome channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the channel where welcome messages will be sent:',
        components: [row, backButton],
      });
    }

    if (choice === 'select_unverified_role') {
      const { ButtonBuilder, ButtonStyle } = await import('discord.js');
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_unverified_role_menu')
        .setPlaceholder('Select the unverified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the role that unverified members will have:',
        components: [row, backButton],
      });
    }

    if (choice === 'select_verified_role') {
      const { ButtonBuilder, ButtonStyle } = await import('discord.js');
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_verified_role_menu')
        .setPlaceholder('Select the verified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_verify_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select the role that verified members will receive:',
        components: [row, backButton],
      });
    }

    if (choice === 'set_rp_tag') {
      const modal = new ModalBuilder()
        .setCustomId('setup_rp_tag_modal')
        .setTitle('Set RP Tag');

      const input = new TextInputBuilder()
        .setCustomId('rp_tag')
        .setLabel('Enter your server RP tag')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., SARP, CARP, LARP')
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'set_custom_question') {
      const modal = new ModalBuilder()
        .setCustomId('setup_custom_question_modal')
        .setTitle('Set Custom Question');

      const input = new TextInputBuilder()
        .setCustomId('question')
        .setLabel('Enter your custom verification question')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Leave empty to skip')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'set_dm_message') {
      const modal = new ModalBuilder()
        .setCustomId('setup_dm_message_modal')
        .setTitle('Set DM Message');

      const input = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Enter the message sent to verified members')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Welcome message...')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'verify_setup_done') {
      const menuData = createSetupMenu();
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Verification system setup is complete. Your verification system is now active.')],
      });
    }
  } catch (error) {
    console.error('Error handling verify setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

export async function handleSetupModals(interaction) {
  const customId = interaction.customId;

  try {
    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    let welcome = await Welcome.findOne({ guildId: interaction.guildId });

    if (customId === 'setup_verify_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid text channel ID. Please try again.')],
          flags: 64,
        });
      }

      verification.verifyChannelId = channelId;
      await verification.save();

      const { ButtonBuilder, ActionRowBuilder: ARB, EmbedBuilder } = await import('discord.js');
      const verifyButton = new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Click Here to Verify')
        .setStyle(1);

      const verifyEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('✅ Server Verification')
        .setDescription('Click the button below to verify and access all member channels!')
        .setFooter({ text: 'EverLink' });

      await channel.send({
        embeds: [verifyEmbed],
        components: [new ARB().addComponents(verifyButton)],
      });

      return interaction.reply({
        embeds: [successEmbed(`Verify channel set to ${channel} and verification button sent!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid channel ID. Please try again.')],
          flags: 64,
        });
      }

      verification.welcomeChannelId = channelId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Welcome channel set to ${channel}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_unverified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          flags: 64,
        });
      }

      verification.unverifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Unverified role set to ${role}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_verified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          flags: 64,
        });
      }

      verification.verifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Verified role set to ${role}!`)],
        flags: 64,
      });
    }

    if (customId === 'setup_rp_tag_modal') {
      const rpTag = interaction.fields.getTextInputValue('rp_tag');
      verification.rpTag = rpTag;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('RP Tag Set', `Tag: ${rpTag}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_custom_question_modal') {
      const question = interaction.fields.getTextInputValue('question') || null;
      verification.customQuestion = question;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Custom Question Updated', question ? `Question: ${question}\n\nSelect your next option below to continue setup.` : 'Custom question removed. Select your next option below.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_dm_message_modal') {
      const message = interaction.fields.getTextInputValue('message') || 'Welcome to our community! You have been verified and can now access all member channels.';
      verification.verifyDMMessage = message;
      await verification.save();

      const menuOptions = createSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('DM Message Updated', 'Verification DM has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_message_modal') {
      const message = interaction.fields.getTextInputValue('welcome_message') || 'Welcome to the server, {user}! We\'re glad to have you here.';

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeMessage = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Welcome Message Updated', 'Channel message has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    if (customId === 'setup_welcome_dm_modal') {
      const message = interaction.fields.getTextInputValue('welcome_dm') || 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.';

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeDM = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed('Welcome DM Updated', 'Welcome DM has been updated. Select your next option below to continue setup.')],
        components: menuOptions.components,
        flags: 64,
      });
    }

    const strikeTimeoutMatch = customId.match(/setup_strike_timeout_(\d+)/);
    if (strikeTimeoutMatch) {
      const strikeLevel = parseInt(strikeTimeoutMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('timeout_duration'));

      if (isNaN(duration) || duration <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid positive number.')],
          flags: 64,
        });
      }

      let strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
      if (!strikeConfig) {
        strikeConfig = new StrikeConfig({ guildId: interaction.guildId });
      }

      const strikeKey = `strike${strikeLevel}`;
      strikeConfig.strikes[strikeKey].duration = duration;
      await strikeConfig.save();

      const menuOptions = createStrikeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Timeout Set`, `Duration: ${duration} minutes\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }

    const strikeBanMatch = customId.match(/setup_strike_ban_(\d+)/);
    if (strikeBanMatch) {
      const strikeLevel = parseInt(strikeBanMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('ban_duration'));

      if (isNaN(duration) || duration < 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid number (0 for permanent).')],
          flags: 64,
        });
      }

      let strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
      if (!strikeConfig) {
        strikeConfig = new StrikeConfig({ guildId: interaction.guildId });
      }

      const strikeKey = `strike${strikeLevel}`;
      strikeConfig.strikes[strikeKey].duration = duration;
      await strikeConfig.save();

      const menuOptions = createStrikeSetupMenu();
      return interaction.reply({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Ban Set`, `Duration: ${duration === 0 ? 'Permanent' : duration + ' minutes'}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error handling setup modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleVerifyChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.verifyChannelId = channel.id;
    await verification.save();

    const { ButtonBuilder, ActionRowBuilder: ARB, EmbedBuilder } = await import('discord.js');
    const verifyButton = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Click Here to Verify')
      .setStyle(1);

    const verifyEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('✅ Server Verification')
      .setDescription('Click the button below to verify and access all member channels!')
      .setFooter({ text: 'EverLink' });

    await channel.send({
      embeds: [verifyEmbed],
      components: [new ARB().addComponents(verifyButton)],
    });

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Verify Channel Set', `Channel: ${channel}\n\nVerification button has been sent. Select your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting verify channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid channel.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.welcomeChannelId = channel.id;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: `✅ Welcome channel set to ${channel}!\n\n${menuOptions.content}`,
      components: menuOptions.components,
      embeds: [],
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleUnverifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.unverifiedRoleId = role.id;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Unverified Role Set', `Role: ${role}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting unverified role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleVerifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        flags: 64,
      });
    }

    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    verification.verifiedRoleId = role.id;
    await verification.save();

    const menuOptions = createSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Verified Role Set', `Role: ${role}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting verified role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSystemChannelSelect(interaction) {
  try {
    const selectedChannelId = interaction.values[0];
    const channel = await interaction.guild.channels.fetch(selectedChannelId);

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let welcome = await Welcome.findOne({ guildId: interaction.guildId });
    
    if (welcome) {
      welcome.channelId = channel.id;
      await welcome.save();
    } else {
      await Welcome.create({
        guildId: interaction.guildId,
        channelId: channel.id,
      });
    }

    const embed = infoEmbed(
      '__**Welcome System**__',
      `✅ Welcome channel set to ${channel}!\n\n**Current Welcome Message:**\n${welcome?.welcomeMessage || 'Welcome to the server, {user}! We\'re glad to have you here.'}\n\n**Current Welcome DM:**\n${welcome?.welcomeDM || 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.'}\n\nUse \`/setwelcomemessage\` and \`/setwelcomedm\` to customize these messages.\n\n✨ New members will now see a profile picture embed with their welcome message!`
    );

    return interaction.update({
      embeds: [embed],
      components: [],
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_welcome_channel_setup') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_welcome_channel_setup_menu')
        .setPlaceholder('Select the welcome channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.update({
        content: 'Select the channel where welcome messages will be sent:',
        components: [row],
      });
    }

    if (choice === 'set_welcome_message_setup') {
      const modal = new ModalBuilder()
        .setCustomId('setup_welcome_message_modal')
        .setTitle('Set Welcome Message');

      const input = new TextInputBuilder()
        .setCustomId('welcome_message')
        .setLabel('Enter the welcome message for the channel')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Use {user} for mention and {server} for server name')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'set_welcome_dm_setup') {
      const modal = new ModalBuilder()
        .setCustomId('setup_welcome_dm_modal')
        .setTitle('Set Welcome DM');

      const input = new TextInputBuilder()
        .setCustomId('welcome_dm')
        .setLabel('Enter the welcome DM for new members')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Use {user} for username and {server} for server name')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'welcome_setup_done') {
      const menuData = createWelcomeSetupMenu();
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Welcome system setup is complete. Your welcome system is now active.')],
      });
    }
  } catch (error) {
    console.error('Error handling welcome setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
    config.antiPromotingEnabled = true;
    config.antiPromotingLogChannelId = channel.id;
    await config.save();

    return interaction.reply({
      embeds: [successEmbed('Anti-Promoting System Enabled', `Log channel: ${channel}\n\nThe anti-promoting system is now active. Invite links will be deleted and logged.`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error setting anti-promoting log channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleSetLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
    config.logChannelId = channel.id;
    await config.save();

    return interaction.update({
      content: '',
      embeds: [successEmbed('Log Channel Set', `Log channel has been set to ${channel}. You can now enable systems like anti-promoting and other features will log to this channel.`)],
      components: [],
    });
  } catch (error) {
    console.error('Error setting log channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleWelcomeSetupChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        flags: 64,
      });
    }

    let welcome = await Welcome.findOne({ guildId: interaction.guildId }) || new Welcome({ guildId: interaction.guildId });
    welcome.channelId = channel.id;
    await welcome.save();

    const menuOptions = createWelcomeSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed('Welcome Channel Set', `Channel: ${channel}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting welcome channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'strike_set_roles') {
      let content = 'Select roles for each strike level (leave empty to skip):\n\n';
      const roleSelects = [];

      for (let i = 1; i <= 4; i++) {
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId(`strike_roles_select_${i}`)
          .setPlaceholder(`Select role for Strike ${i} (or skip)`);

        roleSelects.push(new ActionRowBuilder().addComponents(roleSelect));
      }

      return interaction.update({
        content: 'Select roles for strike levels 1-4. You can leave empty if you don\'t want a role for that level.',
        components: roleSelects,
      });
    }

    if (choice === 'strike_set_actions') {
      const actionMenus = [];

      for (let i = 1; i <= 4; i++) {
        const actionSelect = new StringSelectMenuBuilder()
          .setCustomId(`strike_action_select_${i}`)
          .setPlaceholder(`Choose action for Strike ${i}`)
          .addOptions(
            { label: 'No Action', value: 'none' },
            { label: 'Kick', value: 'kick' },
            { label: 'Timeout (mute)', value: 'timeout' },
            { label: 'Ban', value: 'ban' }
          );

        actionMenus.push(new ActionRowBuilder().addComponents(actionSelect));
      }

      return interaction.update({
        content: 'Select the action for each strike level (1-4):',
        components: actionMenus,
      });
    }

    if (choice === 'strike_setup_done') {
      const menuData = createStrikeSetupMenu();
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('Strike System Configured', 'Your strike system is ready to use. Staff can now use `/strike` to strike members.')],
      });
    }
  } catch (error) {
    console.error('Error handling strike setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeRoleSelect(interaction, strikeLevel) {
  try {
    const roles = interaction.roles;

    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId }) || new StrikeConfig({ guildId: interaction.guildId });
    
    const strikeKey = `strike${strikeLevel}`;
    if (roles.size > 0) {
      const role = roles.first();
      strikeConfig.strikes[strikeKey].roleId = role.id;
    }

    await strikeConfig.save();

    const menuOptions = createStrikeSetupMenu();
    return interaction.update({
      content: '',
      embeds: [infoEmbed(`Strike ${strikeLevel} Role Set`, `Role: ${roles.size > 0 ? roles.first() : 'None selected'}\n\nSelect your next option below to continue setup.`)],
      components: menuOptions.components,
    });
  } catch (error) {
    console.error('Error setting strike role:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleStrikeActionSelect(interaction, strikeLevel) {
  try {
    const action = interaction.values[0];

    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
    if (!strikeConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Strike system not configured. Please try again.')],
        flags: 64,
      });
    }

    const strikeKey = `strike${strikeLevel}`;
    strikeConfig.strikes[strikeKey].action = action;

    if (action === 'timeout') {
      const modal = new ModalBuilder()
        .setCustomId(`setup_strike_timeout_${strikeLevel}`)
        .setTitle(`Strike ${strikeLevel} Timeout Duration`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('timeout_duration')
              .setLabel('Timeout Duration (minutes)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 60')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    } else if (action === 'ban') {
      const modal = new ModalBuilder()
        .setCustomId(`setup_strike_ban_${strikeLevel}`)
        .setTitle(`Strike ${strikeLevel} Ban Duration`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ban_duration')
              .setLabel('Ban Duration (minutes, 0 = permanent)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 0 for permanent')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    } else {
      strikeConfig.strikes[strikeKey].duration = null;
      await strikeConfig.save();

      const actionLabel = action === 'none' ? 'No Action' : action.charAt(0).toUpperCase() + action.slice(1);
      const menuOptions = createStrikeSetupMenu();
      return interaction.update({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Action Set`, `Action: ${actionLabel}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
      });
    }
  } catch (error) {
    console.error('Error setting strike action:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      flags: 64,
    });
  }
}

async function handleReactionRoleMainMenu(interaction) {
  const choice = interaction.values[0];

  if (choice === 'send_message') {
    const modal = new ModalBuilder()
      .setCustomId('reactionrole_send_message_modal')
      .setTitle('Send Reaction Role Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel('Message Content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., React to get a role!')
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (choice === 'add_emoji') {
    const modal = new ModalBuilder()
      .setCustomId('reactionrole_add_emoji_modal')
      .setTitle('Add Emoji to Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1234567890')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message_id')
            .setLabel('Message ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1234567890')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('emoji_input')
            .setLabel('Emoji')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 🎮')
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }
}

async function handleReactionRoleSendChannel(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  
  const channel = interaction.values[0];
  const messageContent = interaction.message.content.split('```')[1]?.trim() || 'React to get a role!';

  try {
    const targetChannel = await interaction.guild.channels.fetch(channel);

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a text channel.')],
        flags: 64,
      });
    }

    const sentMessage = await targetChannel.send(messageContent);

    await ReactionRole.create({
      guildId: interaction.guildId,
      messageId: sentMessage.id,
      channelId: channel,
      emojiRoles: [],
    });

    return interaction.update({
      content: `✅ Message sent to <#${channel}>\n\n**Channel ID:** \`${channel}\`\n**Message ID:** \`${sentMessage.id}\`\n\nRun \`/reactionrolemessage\` again and pick "Add Emoji" to add emoji-role pairs.`,
      components: [],
    });
  } catch (error) {
    console.error('Error sending reaction role message:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while sending the message.')],
      flags: 64,
    });
  }
}

async function handleReactionRoleSelect(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  const { pendingEmojiRoles } = await import('./modalHandler.js');
  
  const tempKey = interaction.customId.replace('reactionrole_role_select_', '');
  const pending = pendingEmojiRoles.get(tempKey);
  const roleId = interaction.values[0];

  if (!pending) {
    return interaction.reply({
      embeds: [errorEmbed('Session expired. Please try again.')],
      flags: 64,
    });
  }

  const { emoji, messageId, guildId } = pending;

  try {
    const reactionRole = await ReactionRole.findOne({
      guildId: guildId,
      messageId: messageId,
    });

    if (!reactionRole) {
      pendingEmojiRoles.delete(tempKey);
      return interaction.reply({
        embeds: [errorEmbed('The reaction role message could not be found. The message may have been deleted. Please create a new message with /reactionrolemessage.')],
        flags: 64,
      });
    }

    // Add emoji-role pair
    reactionRole.emojiRoles.push({ emoji, roleId });
    await reactionRole.save();

    // Try to add reaction to message
    try {
      const channel = await interaction.guild.channels.fetch(reactionRole.channelId);
      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);
    } catch (err) {
      // Silently fail if we can't add the reaction
    }

    const role = await interaction.guild.roles.fetch(roleId);
    pendingEmojiRoles.delete(tempKey);
    
    return interaction.update({
      content: `✅ ${emoji} → ${role.name}`,
      components: [],
    });
  } catch (error) {
    console.error('Error in role select:', error);
    pendingEmojiRoles.delete(tempKey);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingSetupMenu(interaction) {
  const choice = interaction.values[0];
  console.log('⚙️ antiPromotingSetupMenu choice:', choice);
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = await import('discord.js');

  try {
    if (choice === 'add_link') {
      console.log('📋 Creating add_link modal...');
      const modal = new ModalBuilder()
        .setCustomId('antipromotingsetup_add_link_modal')
        .setTitle('Add Whitelisted Link');

      const linkInput = new TextInputBuilder()
        .setCustomId('link_input')
        .setLabel('Discord Invite Link')
        .setPlaceholder('https://discord.gg/xyz')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(linkInput);
      modal.addComponents(row);

      console.log('🎯 Showing modal...');
      return await interaction.showModal(modal);
    }

    if (choice === 'remove_link') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      if (!config || !config.whitelistedInviteLinks || config.whitelistedInviteLinks.length === 0) {
        return interaction.update({
          embeds: [errorEmbed('No whitelisted links found.')],
          components: [],
        });
      }

      const options = config.whitelistedInviteLinks.map((link, index) => ({
        label: `${index + 1}. ${link.substring(0, 50)}...`,
        value: `remove_${index}`,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('antipromotingsetup_remove_link')
        .setPlaceholder('Select a link to remove...')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select a whitelisted link to remove:',
        components: [row, backButton],
      });
    }

    if (choice === 'view_links') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      if (!config || !config.whitelistedInviteLinks || config.whitelistedInviteLinks.length === 0) {
        return interaction.update({
          embeds: [infoEmbed('Whitelisted Links', 'No whitelisted links configured.')],
          components: [],
        });
      }

      let linkList = '';
      config.whitelistedInviteLinks.forEach((link, index) => {
        linkList += `${index + 1}. ${link}\n`;
      });

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor('#2E2E2E')
        .setTitle('Whitelisted Invite Links')
        .setDescription(linkList)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'toggle_staff_bypass') {
      const config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
      config.staffCanBypassLinks = !config.staffCanBypassLinks;
      await config.save();

      const status = config.staffCanBypassLinks ? 'enabled' : 'disabled';
      const description = config.staffCanBypassLinks 
        ? '✅ Staff and Admins can now send invite links without deletion.'
        : '🔒 Staff and Admins can no longer send invite links without deletion. All staff are subject to anti-promoting rules.';

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor(config.staffCanBypassLinks ? '#00AA00' : '#FF0000')
        .setTitle('Staff Bypass Updated')
        .setDescription(description)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'view_settings') {
      const config = await Config.findOne({ guildId: interaction.guildId });
      
      const linkCount = config?.whitelistedInviteLinks?.length || 0;
      const staffBypass = config?.staffCanBypassLinks ? '✅ Enabled' : '🔒 Disabled';

      const description = `**Whitelisted Links:** ${linkCount}\n**Staff Bypass:** ${staffBypass}`;

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_antipromotingsetup_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor('#2E2E2E')
        .setTitle('Anti-Promoting Settings')
        .setDescription(description)
        .setFooter({ text: 'EverLink' });

      return interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    }

    if (choice === 'setup_done') {
      return interaction.update({
        content: '✅ Anti-Promoting setup closed.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error in anti-promoting setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingRemoveLink(interaction) {
  const selectedIndex = parseInt(interaction.values[0].replace('remove_', ''));

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (!config || !config.whitelistedInviteLinks || !config.whitelistedInviteLinks[selectedIndex]) {
      return interaction.reply({
        embeds: [errorEmbed('Link not found.')],
        flags: 64,
      });
    }

    const removedLink = config.whitelistedInviteLinks[selectedIndex];
    config.whitelistedInviteLinks.splice(selectedIndex, 1);
    await config.save();

    return interaction.reply({
      embeds: [successEmbed('Link Removed', `The invite link has been removed from the whitelist.\n\nLink: ${removedLink}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error removing whitelisted link:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing the link.')],
      flags: 64,
    });
  }
}

async function handleStickyListDelete(interaction) {
  const { Sticky } = await import('../models/Sticky.js').then(m => ({ Sticky: m.default }));
  
  const selectedIndex = parseInt(interaction.values[0].replace('delete_', ''));

  try {
    const stickies = await Sticky.find({ guildId: interaction.guildId });
    
    if (!stickies[selectedIndex]) {
      return interaction.reply({
        embeds: [errorEmbed('Sticky message not found.')],
        flags: 64,
      });
    }

    const sticky = stickies[selectedIndex];
    
    // Delete from Discord
    try {
      const channel = await interaction.guild.channels.fetch(sticky.channelId);
      if (channel) {
        const message = await channel.messages.fetch(sticky.messageId).catch(() => null);
        if (message) {
          await message.delete();
        }
      }
    } catch (err) {
      console.error('Error deleting sticky message from Discord:', err);
    }

    // Delete from database
    await Sticky.deleteOne({ _id: sticky._id });

    return interaction.reply({
      embeds: [successEmbed('Sticky Deleted', `The sticky message has been removed from <#${sticky.channelId}>`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error deleting sticky:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while deleting the sticky message.')],
      flags: 64,
    });
  }
}

async function handleStatusMainMenu(interaction) {
  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');
  const choice = interaction.values[0];

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    if (choice === 'enable') {
      statusConfig.enabled = true;
      await statusConfig.save();
      return interaction.reply({
        embeds: [successEmbed('Status Heartbeat Enabled', 'The heartbeat monitoring system is now active and will send messages every 8 minutes.')],
        flags: 64,
      });
    }

    if (choice === 'disable') {
      statusConfig.enabled = false;
      await statusConfig.save();
      return interaction.reply({
        embeds: [successEmbed('Status Heartbeat Disabled', 'The heartbeat monitoring system has been turned off.')],
        flags: 64,
      });
    }

    if (choice === 'set_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('status_heartbeat_channel_select')
        .setPlaceholder('Select the heartbeat channel...')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where heartbeat messages will be sent:',
        components: [row],
        flags: 64,
      });
    }

    if (choice === 'set_interval') {
      const modal = new ModalBuilder()
        .setCustomId('status_set_interval_modal')
        .setTitle('Set Heartbeat Interval')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('interval_minutes')
              .setLabel('Interval (minutes)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 8')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'view_config') {
      const channelText = statusConfig.heartbeatChannelId ? `<#${statusConfig.heartbeatChannelId}>` : 'Not set';
      const statusText = statusConfig.enabled ? '✅ Enabled' : '❌ Disabled';

      return interaction.reply({
        embeds: [{
          color: 0x0099ff,
          title: 'Status Heartbeat Configuration',
          fields: [
            { name: 'Status', value: statusText, inline: true },
            { name: 'Channel', value: channelText, inline: true },
            { name: 'Interval', value: `${statusConfig.intervalMinutes} minutes`, inline: true },
            { name: 'Auto-delete', value: `${statusConfig.deleteAfterSeconds} seconds`, inline: true }
          ],
          footer: { text: 'EverLink' }
        }],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error in status main menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleStatusChannelSelect(interaction) {
  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');
  const channelId = interaction.values[0];

  try {
    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    statusConfig.heartbeatChannelId = channelId;
    await statusConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Channel Set', `Heartbeat messages will now be sent to <#${channelId}>`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in status channel select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
