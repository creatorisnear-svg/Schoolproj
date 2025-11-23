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
    ephemeral: true
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
    ephemeral: true
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
    ephemeral: true
  };
}

export async function handleSelectMenu(interaction) {
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
}

async function handleVerifySetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_verify_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_verify_channel_menu')
        .setPlaceholder('Select the verify channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where users can verify:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'select_welcome_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('select_welcome_channel_menu')
        .setPlaceholder('Select the welcome channel')
        .setChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where welcome messages will be sent:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'select_unverified_role') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_unverified_role_menu')
        .setPlaceholder('Select the unverified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the role that unverified members will have:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'select_verified_role') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('select_verified_role_menu')
        .setPlaceholder('Select the verified role');

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the role that verified members will receive:',
        components: [row],
        ephemeral: true,
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
      return interaction.update({
        content: '',
        components: [],
        embeds: [successEmbed('Verification system setup is complete. Your verification system is now active.')],
      });
    }
  } catch (error) {
    console.error('Error handling verify setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
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
          ephemeral: true,
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
        ephemeral: true,
      });
    }

    if (customId === 'setup_welcome_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid channel ID. Please try again.')],
          ephemeral: true,
        });
      }

      verification.welcomeChannelId = channelId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Welcome channel set to ${channel}!`)],
        ephemeral: true,
      });
    }

    if (customId === 'setup_unverified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          ephemeral: true,
        });
      }

      verification.unverifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Unverified role set to ${role}!`)],
        ephemeral: true,
      });
    }

    if (customId === 'setup_verified_role_modal') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          embeds: [errorEmbed('Invalid role ID. Please try again.')],
          ephemeral: true,
        });
      }

      verification.verifiedRoleId = roleId;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(`Verified role set to ${role}!`)],
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
      });
    }

    const strikeTimeoutMatch = customId.match(/setup_strike_timeout_(\d+)/);
    if (strikeTimeoutMatch) {
      const strikeLevel = parseInt(strikeTimeoutMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('timeout_duration'));

      if (isNaN(duration) || duration <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid positive number.')],
          ephemeral: true,
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
        ephemeral: true,
      });
    }

    const strikeBanMatch = customId.match(/setup_strike_ban_(\d+)/);
    if (strikeBanMatch) {
      const strikeLevel = parseInt(strikeBanMatch[1]);
      const duration = parseInt(interaction.fields.getTextInputValue('ban_duration'));

      if (isNaN(duration) || duration < 0) {
        return interaction.reply({
          embeds: [errorEmbed('Duration must be a valid number (0 for permanent).')],
          ephemeral: true,
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
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error handling setup modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
    });
  }
}

async function handleVerifyChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        ephemeral: true,
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
      ephemeral: true,
    });
  }
}

async function handleWelcomeChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid channel.')],
        ephemeral: true,
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
      ephemeral: true,
    });
  }
}

async function handleUnverifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        ephemeral: true,
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
      ephemeral: true,
    });
  }
}

async function handleVerifiedRoleSelect(interaction) {
  try {
    const role = interaction.roles.first();
    
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid role.')],
        ephemeral: true,
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
      ephemeral: true,
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
        ephemeral: true,
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
      ephemeral: true,
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

      return interaction.reply({
        content: 'Select the channel where welcome messages will be sent:',
        components: [row],
        ephemeral: true,
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
      return interaction.update({
        content: '',
        components: [],
        embeds: [successEmbed('Welcome system setup is complete. Your welcome system is now active.')],
      });
    }
  } catch (error) {
    console.error('Error handling welcome setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
    });
  }
}

async function handleAntiPromotingLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        ephemeral: true,
      });
    }

    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });
    config.antiPromotingEnabled = true;
    config.antiPromotingLogChannelId = channel.id;
    await config.save();

    return interaction.reply({
      embeds: [successEmbed('Anti-Promoting System Enabled', `Log channel: ${channel}\n\nThe anti-promoting system is now active. Invite links will be deleted and logged.`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error setting anti-promoting log channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
    });
  }
}

async function handleSetLogChannel(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        ephemeral: true,
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
      ephemeral: true,
    });
  }
}

async function handleWelcomeSetupChannelSelect(interaction) {
  try {
    const channel = interaction.channels.first();
    
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Please select a valid text channel.')],
        ephemeral: true,
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
      ephemeral: true,
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

      return interaction.reply({
        content: 'Select roles for strike levels 1-4. You can leave empty if you don\'t want a role for that level.',
        components: roleSelects,
        ephemeral: true,
      });
    }

    if (choice === 'strike_set_actions') {
      const actionMenus = [];

      for (let i = 1; i <= 4; i++) {
        const actionSelect = new StringSelectMenuBuilder()
          .setCustomId(`strike_action_select_${i}`)
          .setPlaceholder(`Choose action for Strike ${i}`)
          .addOptions(
            { label: 'Kick', value: 'kick' },
            { label: 'Timeout (mute)', value: 'timeout' },
            { label: 'Ban', value: 'ban' }
          );

        actionMenus.push(new ActionRowBuilder().addComponents(actionSelect));
      }

      return interaction.reply({
        content: 'Select the action for each strike level (1-4):',
        components: actionMenus,
        ephemeral: true,
      });
    }

    if (choice === 'strike_setup_done') {
      return interaction.update({
        content: '✅ Strike system setup complete!',
        embeds: [successEmbed('Strike System Configured', 'Your strike system is ready to use. Staff can now use `/strike` to strike members.')],
        components: [],
      });
    }
  } catch (error) {
    console.error('Error handling strike setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
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
      ephemeral: true,
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
        ephemeral: true,
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

      const menuOptions = createStrikeSetupMenu();
      return interaction.update({
        content: '',
        embeds: [infoEmbed(`Strike ${strikeLevel} Action Set`, `Action: ${action}\n\nSelect your next option below to continue setup.`)],
        components: menuOptions.components,
      });
    }
  } catch (error) {
    console.error('Error setting strike action:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred. Please try again.')],
      ephemeral: true,
    });
  }
}
