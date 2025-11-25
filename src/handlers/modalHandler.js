import { EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { handleLEORevokeWeaponModal, handleLEOIssueTicketModal, handleLEOCreateBOLOModal } from './leoDatabaseHandler.js';

export async function handleModalSubmit(interaction) {
  if (interaction.customId === 'verify_modal') {
    await handleVerifyModal(interaction);
  }

  if (interaction.customId === 'reactionrole_send_message_modal') {
    await handleReactionRoleSendMessageModal(interaction);
  }

  if (interaction.customId === 'reactionrole_add_emoji_modal') {
    await handleReactionRoleAddEmojiModal(interaction);
  }

  if (interaction.customId === 'leodatabase_revoke_weapon_modal') {
    await handleLEORevokeWeaponModal(interaction);
  }

  if (interaction.customId === 'leodatabase_issue_ticket_modal') {
    await handleLEOIssueTicketModal(interaction);
  }

  if (interaction.customId === 'leodatabase_create_bolo_modal') {
    await handleLEOCreateBOLOModal(interaction);
  }

  if (interaction.customId === 'antipromotingsetup_add_link_modal') {
    await handleAntiPromotingAddLinkModal(interaction);
  }

  if (interaction.customId === 'status_set_interval_modal') {
    await handleStatusSetIntervalModal(interaction);
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
        flags: 64,
      });
    }

    if (!verification.verifiedRoleId) {
      return interaction.reply({
        embeds: [errorEmbed('Verification system is not fully configured. Please contact an administrator.')],
        flags: 64,
      });
    }

    const verifiedRole = interaction.guild.roles.cache.get(verification.verifiedRoleId);
    const unverifiedRole = interaction.guild.roles.cache.get(verification.unverifiedRoleId);

    if (!verifiedRole) {
      return interaction.reply({
        embeds: [errorEmbed('The verified role could not be found. Please contact an administrator.')],
        flags: 64,
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
        console.log(`✅ Set nickname for ${interaction.user.username}: ${newNickname}`);
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
      flags: 64,
    });
  } catch (error) {
    console.error('Error verifying member:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred during verification. Please try again or contact an administrator.')],
      flags: 64,
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
      flags: 64,
    });
  } catch (error) {
    console.error('Error in reaction role modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

// Temporary storage for pending emoji-message pairs
const pendingEmojiRoles = new Map();

async function handleReactionRoleAddEmojiModal(interaction) {
  const { default: ReactionRole } = await import('../models/ReactionRole.js');
  const { RoleSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  
  const channelId = interaction.fields.getTextInputValue('channel_id');
  const messageId = interaction.fields.getTextInputValue('message_id');
  const emoji = interaction.fields.getTextInputValue('emoji_input');

  try {
    // Try to fetch the message from Discord to verify it exists
    let channel, message;
    try {
      channel = await interaction.guild.channels.fetch(channelId);
      if (!channel.isTextBased()) {
        return interaction.reply({
          embeds: [errorEmbed('The channel must be a text channel.')],
          flags: 64,
        });
      }
      message = await channel.messages.fetch(messageId);
    } catch (err) {
      return interaction.reply({
        embeds: [errorEmbed('Could not find the message in that channel. Please check the channel ID and message ID.')],
        flags: 64,
      });
    }

    // Check if reaction role entry exists, if not create one
    let reactionRole = await ReactionRole.findOne({
      guildId: interaction.guildId,
      messageId: messageId,
    });

    if (!reactionRole) {
      // Create new entry for this message
      reactionRole = await ReactionRole.create({
        guildId: interaction.guildId,
        messageId: messageId,
        channelId: channelId,
        emojiRoles: [],
      });
    }

    if (reactionRole.emojiRoles.length >= 5) {
      return interaction.reply({
        embeds: [errorEmbed('This message already has 5 emoji-role pairs.')],
        flags: 64,
      });
    }

    if (reactionRole.emojiRoles.some(er => er.emoji === emoji)) {
      return interaction.reply({
        embeds: [errorEmbed('This emoji is already added to this message.')],
        flags: 64,
      });
    }

    // Store the emoji-message pair temporarily
    const tempKey = `${interaction.guildId}_${messageId}`;
    pendingEmojiRoles.set(tempKey, { emoji, messageId, guildId: interaction.guildId });

    // Show role selector with simple ID
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`reactionrole_role_select_${tempKey}`)
      .setPlaceholder('Select the role...');

    const row = new ActionRowBuilder().addComponents(roleSelect);

    return interaction.reply({
      content: `Choose the role for ${emoji}:`,
      components: [row],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in add emoji modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

async function handleAntiPromotingAddLinkModal(interaction) {
  console.log('🔗 handleAntiPromotingAddLinkModal called');
  
  let link;
  try {
    link = interaction.fields.getTextInputValue('link_input').trim();
    console.log('📝 Link received:', link);
  } catch (fieldError) {
    console.error('❌ Error getting link input:', fieldError);
    return interaction.reply({
      embeds: [errorEmbed('Could not read the link input. Please try again.')],
      flags: 64,
    });
  }

  try {
    console.log('🔍 Searching for existing config...');
    let config = await Config.findOne({ guildId: interaction.guildId });
    console.log('📊 Config found:', !!config);
    
    if (!config) {
      console.log('📋 Creating new config...');
      config = new Config({ 
        guildId: interaction.guildId,
        whitelistedInviteLinks: []
      });
    }

    // Ensure array exists
    if (!Array.isArray(config.whitelistedInviteLinks)) {
      console.log('⚠️ Fixing array...');
      config.whitelistedInviteLinks = [];
    }
    console.log('✅ Array exists with', config.whitelistedInviteLinks.length, 'items');

    if (config.whitelistedInviteLinks.includes(link)) {
      console.log('⚠️ Link already whitelisted');
      return interaction.reply({
        embeds: [errorEmbed('This link is already whitelisted.')],
        flags: 64,
      });
    }

    console.log('💾 Adding link and saving...');
    config.whitelistedInviteLinks.push(link);
    const saved = await config.save();
    console.log('✅ Saved successfully:', saved._id);

    return interaction.reply({
      embeds: [successEmbed('Link Whitelisted', `The invite link has been added to the whitelist.\n\nLink: ${link}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('❌ Error adding whitelisted link:', error.message);
    console.error('Stack:', error.stack);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the link.')],
      flags: 64,
    });
  }
}

async function handleStatusSetIntervalModal(interaction) {
  const { default: StatusHeartbeat } = await import('../models/StatusHeartbeat.js');
  
  try {
    const intervalInput = interaction.fields.getTextInputValue('interval_minutes');
    const intervalMinutes = parseInt(intervalInput);

    if (isNaN(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid interval. Please enter a number between 1 and 1440 minutes.')],
        flags: 64,
      });
    }

    let statusConfig = await StatusHeartbeat.findOne({ guildId: interaction.guildId });
    if (!statusConfig) {
      statusConfig = await StatusHeartbeat.create({ guildId: interaction.guildId });
    }

    statusConfig.intervalMinutes = intervalMinutes;
    await statusConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Interval Updated', `Heartbeat messages will now be sent every ${intervalMinutes} minute(s).`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in status interval modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export { pendingEmojiRoles };
