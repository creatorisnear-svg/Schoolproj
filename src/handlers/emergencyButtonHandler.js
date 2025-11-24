import { EmbedBuilder } from 'discord.js';
import EmergencyCall from '../models/EmergencyCall.js';
import CADConfig from '../models/CADConfig.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export async function handle911RespondButton(interaction) {
  try {
    const callId = interaction.customId.replace('911_respond_', '');
    
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });
    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Only LEOs can respond to 911 calls.')],
        ephemeral: true,
      });
    }

    if (call.respondingLeoId) {
      return interaction.reply({
        embeds: [errorEmbed('This call already has a primary responder.')],
        ephemeral: true,
      });
    }

    call.respondingLeoId = interaction.user.id;
    call.respondingLeoUsername = interaction.user.username;
    await call.save();

    // Update the original message
    const originalMessage = await interaction.message;
    const updatedEmbed = originalMessage.embeds[0].toJSON();
    
    // Update description to show responder
    let description = updatedEmbed.description || '';
    const respondingLine = `\n\n**🚨 PRIMARY RESPONDER:** ${interaction.user.username}`;
    if (!description.includes('PRIMARY RESPONDER')) {
      updatedEmbed.description = (description || '') + respondingLine;
    } else {
      updatedEmbed.description = description.replace(/\*\*🚨 PRIMARY RESPONDER:.*/, `**🚨 PRIMARY RESPONDER:** ${interaction.user.username}`);
    }

    await originalMessage.edit({
      embeds: [updatedEmbed],
    });

    return interaction.reply({
      content: `✅ You are now the primary responder for call #${callId}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in 911 respond button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handle911AttachButton(interaction) {
  try {
    const callId = interaction.customId.replace('911_attach_', '');
    
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });
    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Only LEOs can attach to 911 calls.')],
        ephemeral: true,
      });
    }

    if (call.attachedLeoIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: `You are already attached to this call.`,
        ephemeral: true,
      });
    }

    call.attachedLeoIds.push(interaction.user.id);
    await call.save();

    // Update the original message
    const originalMessage = await interaction.message;
    const updatedEmbed = originalMessage.embeds[0].toJSON();
    
    // Build responder list
    let responderText = '';
    if (call.respondingLeoId) {
      responderText += `**🚨 PRIMARY:** ${call.respondingLeoUsername}`;
    }
    if (call.attachedLeoIds.length > 0) {
      if (responderText) responderText += '\n';
      responderText += `**📎 ATTACHED:** ${call.attachedLeoIds.map(id => {
        const name = interaction.guild.members.cache.get(id)?.user.username || `<@${id}>`;
        return name;
      }).join(', ')}`;
    }

    // Update description
    let description = updatedEmbed.description || '';
    const responderMatch = description.match(/(\n\n\*\*🚨 PRIMARY RESPONDER:.*)?(\n\*\*📎 ATTACHED:.*)?$/);
    if (responderMatch) {
      description = description.substring(0, responderMatch.index) + '\n\n' + responderText;
    } else {
      description += '\n\n' + responderText;
    }
    updatedEmbed.description = description;

    await originalMessage.edit({
      embeds: [updatedEmbed],
    });

    return interaction.reply({
      content: `✅ You are now attached to call #${callId}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in 911 attach button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handle911DismissButton(interaction) {
  try {
    const callId = interaction.customId.replace('911_dismiss_', '');
    
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });
    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    // Check if user has permission (is responder or admin)
    const isResponder = call.respondingLeoId === interaction.user.id || call.attachedLeoIds.includes(interaction.user.id);
    const isAdmin = interaction.member.permissions.has('Administrator');

    if (!isResponder && !isAdmin) {
      return interaction.reply({
        embeds: [errorEmbed('Only call responders or admins can dismiss a call.')],
        ephemeral: true,
      });
    }

    // Delete the call
    await EmergencyCall.deleteOne({ _id: call._id });

    // Update original message to show dismissed
    const originalMessage = await interaction.message;
    const updatedEmbed = originalMessage.embeds[0].toJSON();
    updatedEmbed.description = (updatedEmbed.description || '') + '\n\n❌ **CALL DISMISSED** - No longer need assistance';
    updatedEmbed.color = 0x808080;

    await originalMessage.edit({
      embeds: [updatedEmbed],
      components: [], // Remove buttons
    });

    return interaction.reply({
      content: `✅ Call #${callId} has been dismissed.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in 911 dismiss button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
