import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, StringSelectMenuBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import Welcome from '../models/Welcome.js';
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

export async function handleSelectMenu(interaction) {
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
        content: `✅ RP tag set to: "${rpTag}"\n\n${menuOptions.content}`,
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
        content: `✅ ${question ? `Custom question set to: "${question}"` : 'Custom question removed!'}\n\n${menuOptions.content}`,
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
        content: `✅ DM message updated!\n\n${menuOptions.content}`,
        components: menuOptions.components,
        ephemeral: true,
      });
    }

    if (customId === 'setup_welcome_message_modal') {
      const message = interaction.fields.getTextInputValue('welcome_message') || 'Welcome to the server, {user}! We\'re glad to have you here.';
      let welcome = await Welcome.findOne({ guildId: interaction.guildId });

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeMessage = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: `✅ Welcome message updated!\n\n${menuOptions.content}`,
        components: menuOptions.components,
        ephemeral: true,
      });
    }

    if (customId === 'setup_welcome_dm_modal') {
      const message = interaction.fields.getTextInputValue('welcome_dm') || 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.';
      let welcome = await Welcome.findOne({ guildId: interaction.guildId });

      if (!welcome) {
        welcome = new Welcome({ guildId: interaction.guildId });
      }

      welcome.welcomeDM = message;
      await welcome.save();

      const menuOptions = createWelcomeSetupMenu();
      return interaction.reply({
        content: `✅ Welcome DM updated!\n\n${menuOptions.content}`,
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
      content: `✅ Verify channel set to ${channel} and verification button sent!\n\n${menuOptions.content}`,
      components: menuOptions.components,
      embeds: [],
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
      content: `✅ Unverified role set to ${role}!\n\n${menuOptions.content}`,
      components: menuOptions.components,
      embeds: [],
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
      content: `✅ Verified role set to ${role}!\n\n${menuOptions.content}`,
      components: menuOptions.components,
      embeds: [],
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
  } catch (error) {
    console.error('Error handling welcome setup menu:', error);
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
