import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handleSelectMenu(interaction) {
  if (interaction.customId === 'verify_setup_menu') {
    await handleVerifySetupMenu(interaction);
  }
}

async function handleVerifySetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'select_verify_channel') {
      const modal = new ModalBuilder()
        .setCustomId('setup_verify_channel_modal')
        .setTitle('Set Verify Channel');

      const input = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Enter Verify Channel ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click channel, copy ID')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'select_welcome_channel') {
      const modal = new ModalBuilder()
        .setCustomId('setup_welcome_channel_modal')
        .setTitle('Set Welcome Channel');

      const input = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Enter Welcome Channel ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click channel, copy ID')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'select_unverified_role') {
      const modal = new ModalBuilder()
        .setCustomId('setup_unverified_role_modal')
        .setTitle('Set Unverified Role');

      const input = new TextInputBuilder()
        .setCustomId('role_id')
        .setLabel('Enter Unverified Role ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click role, copy ID')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (choice === 'select_verified_role') {
      const modal = new ModalBuilder()
        .setCustomId('setup_verified_role_modal')
        .setTitle('Set Verified Role');

      const input = new TextInputBuilder()
        .setCustomId('role_id')
        .setLabel('Enter Verified Role ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Right-click role, copy ID')
        .setRequired(true);

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

    if (customId === 'setup_custom_question_modal') {
      const question = interaction.fields.getTextInputValue('question') || null;
      verification.customQuestion = question;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed(question ? `Custom question set to: "${question}"` : 'Custom question removed!')],
        ephemeral: true,
      });
    }

    if (customId === 'setup_dm_message_modal') {
      const message = interaction.fields.getTextInputValue('message') || 'Welcome to our community! You have been verified and can now access all member channels.';
      verification.verifyDMMessage = message;
      await verification.save();

      return interaction.reply({
        embeds: [successEmbed('DM message updated!')],
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
