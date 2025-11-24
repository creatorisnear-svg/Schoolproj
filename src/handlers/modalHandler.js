import { EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handleModalSubmit(interaction) {
  if (interaction.customId === '911report') {
    await handle911Report(interaction);
  }
  
  if (interaction.customId === 'verify_modal') {
    await handleVerifyModal(interaction);
  }

  if (interaction.customId === 'reactionrole_send_message_modal') {
    await handleReactionRoleSendMessageModal(interaction);
  }

  if (interaction.customId === 'reactionrole_add_emoji_modal') {
    await handleReactionRoleAddEmojiModal(interaction);
  }
}

async function handle911Report(interaction) {
  const issue = interaction.fields.getTextInputValue('issue');
  const location = interaction.fields.getTextInputValue('location');
  const suspectsDescription = interaction.fields.getTextInputValue('suspectsDescription') || 'N/A';
  const lastSeen = interaction.fields.getTextInputValue('lastSeen') || 'N/A';
  const contact = interaction.fields.getTextInputValue('contact') || 'N/A';

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.reportChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('No 911 channel has been configured. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportChannel = await interaction.guild.channels.fetch(config.reportChannelId);

    if (!reportChannel) {
      return interaction.reply({
        embeds: [errorEmbed('The configured 911 channel could not be found. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const reportEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('__**911**__')
      .addFields(
        { name: '__Issue__', value: issue, inline: false },
        { name: '__Location__', value: location, inline: false },
        { name: '__Suspects & Vehicle Information__', value: suspectsDescription, inline: false },
        { name: '__Last Seen__', value: lastSeen, inline: false },
        { name: '__Contact Information__', value: contact, inline: false },
        { name: '__Submitted By__', value: `${interaction.user.tag} (${interaction.user})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'EverLink' });

    let roleMentions = '';
    if (config.reportRoles && config.reportRoles.length > 0) {
      roleMentions = config.reportRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await reportChannel.send({
      content: roleMentions || undefined,
      embeds: [reportEmbed],
    });

    return interaction.reply({
      embeds: [successEmbed('Your 911 report has been submitted successfully! Emergency services have been notified.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error submitting 911 report:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting your report. Please try again or contact an administrator.')],
      ephemeral: true,
    });
  }
}

async function handleVerifyModal(interaction) {
  const psnxbox = interaction.fields.getTextInputValue('psnxbox');
  const customAnswer = interaction.fields.getTextInputValue('custom_question') || null;

  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The verification system is not enabled. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    if (!verification.verifiedRoleId) {
      return interaction.reply({
        embeds: [errorEmbed('Verification system is not fully configured. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    const verifiedRole = interaction.guild.roles.cache.get(verification.verifiedRoleId);
    const unverifiedRole = interaction.guild.roles.cache.get(verification.unverifiedRoleId);

    if (!verifiedRole) {
      return interaction.reply({
        embeds: [errorEmbed('The verified role could not be found. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    await interaction.member.roles.add(verifiedRole);
    if (unverifiedRole) {
      await interaction.member.roles.remove(unverifiedRole);
    }

    if (verification.rpTag) {
      const newNickname = `${verification.rpTag} | ${psnxbox}`;
      try {
        await interaction.member.setNickname(newNickname);
      } catch (error) {
        console.error('Error setting nickname:', error);
      }
    }

    // Log verification with custom question if it exists
    if (customAnswer && verification.customQuestion) {
      const config = await Config.findOne({ guildId: interaction.guildId });
      if (config && config.logChannelId) {
        const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('✅ Member Verified with Question')
            .addFields(
              { name: 'Member', value: `${interaction.user.username} (${interaction.user})`, inline: false },
              { name: 'Question', value: verification.customQuestion, inline: false },
              { name: 'Answer', value: customAnswer, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'EverLink' });

          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
    }

    const dmMessage = verification.verifyDMMessage || 'Welcome to our community! You have been verified and can now access all member channels.';
    await interaction.user.send({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Verification Successful')
        .setDescription(dmMessage)
        .setFooter({ text: 'EverLink' })
      ]
    });

    const successMsg = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ You\'re Verified!')
      .setDescription('You may now see all member channels. Welcome to the community!')
      .setFooter({ text: 'EverLink' });

    return interaction.reply({
      embeds: [successMsg],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error verifying member:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred during verification. Please try again or contact an administrator.')],
      ephemeral: true,
    });
  }
}


async function handleReactionRoleSendMessageModal(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  const { ChannelSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  
  const messageContent = interaction.fields.getTextInputValue('message_content');

  try {
    // Show channel selector
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('reactionrole_send_channel_select')
      .setPlaceholder('Select the channel...');

    const row = new ActionRowBuilder().addComponents(channelSelect);

    // Store message content in a way we can retrieve it
    await interaction.reply({
      content: `**Message to send:**\n\`\`\`\n${messageContent}\n\`\`\`\n\nSelect the channel:`,
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in reaction role modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handleReactionRoleAddEmojiModal(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  
  const messageId = interaction.fields.getTextInputValue('message_id');
  const emoji = interaction.fields.getTextInputValue('emoji_input');
  const roleId = interaction.fields.getTextInputValue('role_id');

  try {
    const reactionRole = await ReactionRole.findOne({
      guildId: interaction.guildId,
      messageId: messageId,
    });

    if (!reactionRole) {
      return interaction.reply({
        embeds: [errorEmbed('Message not found. Check the message ID.')],
        ephemeral: true,
      });
    }

    if (reactionRole.emojiRoles.length >= 5) {
      return interaction.reply({
        embeds: [errorEmbed('This message already has 5 emoji-role pairs.')],
        ephemeral: true,
      });
    }

    if (reactionRole.emojiRoles.some(er => er.emoji === emoji)) {
      return interaction.reply({
        embeds: [errorEmbed('This emoji is already added to this message.')],
        ephemeral: true,
      });
    }

    // Verify role exists
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Role not found. Check the role ID.')],
        ephemeral: true,
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
      console.log('Could not add reaction to message');
    }

    const { successEmbed } = await import('../utils/embedBuilder.js');
    return interaction.reply({
      embeds: [successEmbed('Emoji Added!', `${emoji} → ${role.name}`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding emoji:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
