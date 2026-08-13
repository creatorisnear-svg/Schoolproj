import { EmbedBuilder } from 'discord.js';
import EmergencyCall from '../models/EmergencyCall.js';
import CADConfig from '../models/CADConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { rebuildStatusBoard } from './dispatchHandler.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

const quickEmbed = (color, text) => new EmbedBuilder().setColor(color).setDescription(text).setFooter({ text: 'RPM' });

export async function handle911RespondButton(interaction) {
  try {
    const callId = interaction.customId.replace('911_respond_', '');
    
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });
    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        flags: 64,
      });
    }

    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Only LEOs can respond to 911 calls.')],
        flags: 64,
      });
    }

    if (call.respondingLeoId) {
      return interaction.reply({
        embeds: [errorEmbed('This call already has a primary responder.')],
        flags: 64,
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
    const respondingLine = `\n\n**PRIMARY RESPONDER:** ${interaction.user.username}`;
    if (!description.includes('PRIMARY RESPONDER')) {
      updatedEmbed.description = (description || '') + respondingLine;
    } else {
      updatedEmbed.description = description.replace(/\*\*PRIMARY RESPONDER:.*/, `**PRIMARY RESPONDER:** ${interaction.user.username}`);
    }

    await originalMessage.edit({
      embeds: [updatedEmbed],
    });

    const dConfig = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (dConfig) rebuildStatusBoard(interaction.guild, dConfig).catch(() => {});

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#43b581').setDescription(`You are now the primary responder for call **#${callId}**`).setFooter({ text: 'RPM' })],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in 911 respond button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
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
        flags: 64,
      });
    }

    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Only LEOs can attach to 911 calls.')],
        flags: 64,
      });
    }

    if (call.attachedLeoIds.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('You are already attached to this call.')],
        flags: 64,
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
      responderText += `**PRIMARY:** ${call.respondingLeoUsername}`;
    }
    if (call.attachedLeoIds.length > 0) {
      if (responderText) responderText += '\n';
      responderText += `**ATTACHED:** ${call.attachedLeoIds.map(id => {
        const name = interaction.guild.members.cache.get(id)?.user.username || `<@${id}>`;
        return name;
      }).join(', ')}`;
    }

    // Update description
    let description = updatedEmbed.description || '';
    const responderMatch = description.match(/(\n\n\*\*PRIMARY RESPONDER:.*)?(\n\*\*ATTACHED:.*)?$/);
    if (responderMatch) {
      description = description.substring(0, responderMatch.index) + '\n\n' + responderText;
    } else {
      description += '\n\n' + responderText;
    }
    updatedEmbed.description = description;

    await originalMessage.edit({
      embeds: [updatedEmbed],
    });

    const dConfig = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (dConfig) rebuildStatusBoard(interaction.guild, dConfig).catch(() => {});

    return interaction.reply({
      embeds: [quickEmbed('#23D160', `You are now attached to call **#${callId}**`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in 911 attach button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
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
        flags: 64,
      });
    }

    // Check if user has permission (is responder or admin)
    const isResponder = call.respondingLeoId === interaction.user.id || call.attachedLeoIds.includes(interaction.user.id);
    const isAdmin = interaction.member.permissions.has('Administrator');

    if (!isResponder && !isAdmin) {
      return interaction.reply({
        embeds: [errorEmbed('Only call responders or admins can dismiss a call.')],
        flags: 64,
      });
    }

    // Delete the call
    await EmergencyCall.deleteOne({ _id: call._id });

    // Update original message to show dismissed
    const originalMessage = await interaction.message;
    const updatedEmbed = originalMessage.embeds[0].toJSON();
    updatedEmbed.description = (updatedEmbed.description || '') + '\n\n**CALL DISMISSED** - No longer need assistance';
    updatedEmbed.color = 0x808080;

    await originalMessage.edit({
      embeds: [updatedEmbed],
      components: [], // Remove buttons
    });

    const dConfig = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (dConfig) rebuildStatusBoard(interaction.guild, dConfig).catch(() => {});

    return interaction.reply({
      embeds: [quickEmbed('#23D160', `Call **#${callId}** has been dismissed.`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in 911 dismiss button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
