import { ActionRowBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
import EmergencyCall from '../models/EmergencyCall.js';
import TrafficTicket from '../models/TrafficTicket.js';
import BOLO from '../models/BOLO.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { EmbedBuilder } from 'discord.js';

export async function handleLEODatabaseMenu(interaction) {
  const choice = interaction.values[0];

  try {
    // Verify roleplay commands are enabled
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    // Verify LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    if (choice === 'search_plate') {
      const modal = new ModalBuilder()
        .setCustomId('leodatabase_search_plate_modal')
        .setTitle('Search License Plate')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('plate_search')
              .setLabel('License Plate')
              .setPlaceholder('e.g., ABC1234')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'search_character') {
      const modal = new ModalBuilder()
        .setCustomId('leodatabase_search_character_modal')
        .setTitle('Search Character')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_search')
              .setLabel('Character Name')
              .setPlaceholder('e.g., John Smith')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'active_calls') {
      if (!roleplayConfig.use911 || !roleplayConfig.use911Channel) {
        return interaction.reply({
          embeds: [errorEmbed('Emergency System Not Configured', 'The 911 system has not been set up by administrators. Please contact a server admin.')],
          ephemeral: true,
        });
      }

      const activeCalls = await EmergencyCall.find({
        guildId: interaction.guildId,
        status: 'active'
      }).sort({ timestamp: -1 });

      if (activeCalls.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed('Active 911 Calls', 'No active emergency calls.')],
          ephemeral: true,
        });
      }

      const embeds = activeCalls.map((call, index) => {
        const responding = call.respondingLeoId ? `<@${call.respondingLeoId}>` : 'None';
        const attached = call.attachedLeoIds.length > 0 
          ? call.attachedLeoIds.map(id => `<@${id}>`).join(', ')
          : 'None';

        let description = `**Issue:** ${call.issue}\n`;
        description += `**Location:** ${call.location}\n`;
        description += `**Reporter:** ${call.reporterUsername || 'Unknown'}\n\n`;
        description += `**Status:**\n`;
        description += `• Primary Response: ${responding}\n`;
        description += `• Attached Units: ${attached}\n`;
        if (call.suspectsDescription) description += `\n**Suspects & Vehicles:** ${call.suspectsDescription}\n`;
        if (call.lastSeen) description += `**Last Seen:** ${call.lastSeen}\n`;

        return new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle(`🚨 Call #${index + 1}: ${call.issue}`)
          .setDescription(description)
          .setFooter({ text: `EverLink | ID: ${call.callId}` })
          .setTimestamp(call.timestamp);
      });

      // Create selection menu for choosing a call to respond to
      const callOptions = activeCalls.slice(0, 25).map((call, index) => ({
        label: `Call #${index + 1}: ${call.issue}`,
        value: call.callId,
        description: call.location
      }));

      const callMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('leodatabase_respond_call')
            .setPlaceholder('Select a call to respond to...')
            .addOptions(callOptions)
        );

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_leo_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        embeds,
        components: [callMenu, backButton],
      });
    }

    if (choice === 'wanted_list') {
      const wantedCharacters = await CADCharacter.find({ 
        guildId: interaction.guildId, 
        status: 'wanted' 
      });

      if (wantedCharacters.length === 0) {
        const backButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('back_to_leo_menu')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary)
          );

        return interaction.update({
          embeds: [infoEmbed('Wanted List', 'No wanted suspects.')],
          components: [backButton],
        });
      }

      const embeds = wantedCharacters.map(c => {
        let description = `**Name:** ${c.characterName}\n`;
        description += `**Age:** ${c.age || 'N/A'}\n`;
        description += `**Gender:** ${c.gender || 'N/A'}\n`;
        description += `**Hair:** ${c.hairColor || 'N/A'}\n`;
        description += `**Reason:** ${c.wantedReason || 'No reason specified'}\n`;
        description += `\n**Vehicles:** ${c.vehicles.length}\n`;
        description += `**Known Weapons:** ${c.guns.length}`;

        return new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle(`🚨 WANTED: ${c.characterName}`)
          .setDescription(description)
          .setFooter({ text: 'EverLink' })
          .setTimestamp();
      });

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_leo_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        embeds,
        components: [backButton],
      });
    }

    if (choice === 'revoke_weapon') {
      const modal = new ModalBuilder()
        .setCustomId('leodatabase_revoke_weapon_modal')
        .setTitle('Revoke Weapon')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_name_for_revoke')
              .setLabel('Character Name')
              .setPlaceholder('e.g., John Smith')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('weapon_name_to_revoke')
              .setLabel('Weapon Name')
              .setPlaceholder('e.g., Pistol, Rifle')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('revoke_reason')
              .setLabel('Reason for Revocation')
              .setPlaceholder('e.g., Illegal weapons charge')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'issue_ticket') {
      const modal = new ModalBuilder()
        .setCustomId('leodatabase_issue_ticket_modal')
        .setTitle('Issue Traffic Ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_character_name')
              .setLabel('Character Name')
              .setPlaceholder('e.g., John Smith')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_violation')
              .setLabel('Violation')
              .setPlaceholder('e.g., Speeding, Reckless Driving')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_description')
              .setLabel('Details')
              .setPlaceholder('Additional details about the violation...')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_fine')
              .setLabel('Fine Amount ($)')
              .setPlaceholder('e.g., 250')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'create_bolo') {
      const modal = new ModalBuilder()
        .setCustomId('leodatabase_create_bolo_modal')
        .setTitle('Create BOLO Alert')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bolo_character_name')
              .setLabel('Character Name')
              .setPlaceholder('e.g., John Smith')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bolo_reason')
              .setLabel('Reason (Short)')
              .setPlaceholder('e.g., Armed Robbery, Murder')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bolo_description')
              .setLabel('Description & Details')
              .setPlaceholder('Physical description, last location, etc.')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bolo_vehicles')
              .setLabel('Known Vehicles (Optional)')
              .setPlaceholder('e.g., Red Honda Civic (ABC1234), Blue Ford Truck')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'active_bolos') {
      const activeBOLOs = await BOLO.find({
        guildId: interaction.guildId,
        active: true
      }).sort({ createdAt: -1 });

      if (activeBOLOs.length === 0) {
        const backButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('back_to_leo_menu')
              .setLabel('← Back')
              .setStyle(ButtonStyle.Secondary)
          );

        return interaction.update({
          embeds: [infoEmbed('Active BOLOs', 'No active BOLO alerts.')],
          components: [backButton],
        });
      }

      const embeds = activeBOLOs.map(bolo => {
        let description = `**Character:** ${bolo.characterName}\n`;
        description += `**BOLO ID:** ${bolo.boloId}\n`;
        description += `**Reason:** ${bolo.reason}\n`;
        if (bolo.description) description += `**Details:** ${bolo.description}\n`;
        
        if (bolo.vehicles.length > 0) {
          description += `\n**Known Vehicles:**\n`;
          bolo.vehicles.forEach(v => {
            description += `• ${v.make} ${v.model} (${v.color})`;
            if (v.licensePlate) description += ` - Plate: **${v.licensePlate}**`;
            if (v.notes) description += ` [${v.notes}]`;
            description += '\n';
          });
        }

        description += `\n**Issued By:** <@${bolo.issuedBy}>\n`;
        description += `**Created:** <t:${Math.floor(bolo.createdAt.getTime() / 1000)}:R>`;

        return new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle(`🚨 BOLO: ${bolo.characterName}`)
          .setDescription(description)
          .setFooter({ text: 'EverLink' });
      });

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_leo_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        embeds,
        components: [backButton],
      });
    }
  } catch (error) {
    console.error('Error in LEO database menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOSearchPlateModal(interaction) {
  const plate = interaction.fields.getTextInputValue('plate_search').toUpperCase();

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Search for character with this plate
    const character = await CADCharacter.findOne({
      guildId: interaction.guildId,
      $or: [{ licensePlate: plate }, { 'vehicles.licensePlate': plate }]
    });

    if (!character) {
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_leo_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        embeds: [infoEmbed('License Plate Search', `No results found for plate **${plate}**.`)],
        components: [backButton],
      });
    }

    // Find matching vehicle to show details
    const vehicle = character.vehicles.find(v => v.licensePlate === plate) || 
                   (character.licensePlate === plate ? { licensePlate: character.licensePlate } : null);

    let description = `**Owner:** ${character.characterName}\n`;
    
    if (vehicle) {
      description += `\n**🚗 VEHICLE INFORMATION**\n`;
      description += `Make/Model: ${vehicle.make} ${vehicle.model}\n`;
      description += `Color: ${vehicle.color}\n`;
      if (vehicle.condition) description += `Condition: ${vehicle.condition}\n`;
    }

    description += `\n**⚖️ STATUS**\n`;
    if (character.status === 'wanted') {
      description += `🚨 **WANTED**${character.wantedReason ? ` - ${character.wantedReason}` : ''}`;
    } else {
      description += `✅ **CLEAN**`;
    }

    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`view_char_profile_${character._id.toString()}`)
          .setLabel('👤 View Character Profile')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('back_to_leo_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor(character.status === 'wanted' ? '#ff0000' : '#00ff00')
      .setTitle(`License Plate Search: ${plate}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.update({
      embeds: [embed],
      components: [buttons],
    });
  } catch (error) {
    console.error('Error searching license plate:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEORespondCall(interaction) {
  const callId = interaction.values[0];

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });

    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    if (call.status !== 'active') {
      return interaction.reply({
        embeds: [errorEmbed('This call is no longer active.')],
        ephemeral: true,
      });
    }

    // Check if LEO is already responding
    if (call.respondingLeoId === interaction.user.id) {
      return interaction.reply({
        embeds: [errorEmbed('You are already the primary responder for this call.')],
        ephemeral: true,
      });
    }

    // Check if LEO is already attached
    if (call.attachedLeoIds.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('You are already attached to this call.')],
        ephemeral: true,
      });
    }

    // Build full call details embed
    const responding = call.respondingLeoId ? `<@${call.respondingLeoId}>` : 'None';
    const attached = call.attachedLeoIds.length > 0 
      ? call.attachedLeoIds.map(id => `<@${id}>`).join(', ')
      : 'None';

    let description = `**Issue:** ${call.issue}\n`;
    description += `**Location:** ${call.location}\n`;
    description += `**Reporter:** ${call.reporterUsername || 'Unknown'}\n\n`;
    description += `**Status:**\n`;
    description += `• Primary Response: ${responding}\n`;
    description += `• Attached Units: ${attached}\n`;
    if (call.suspectsDescription) description += `\n**Suspects & Vehicles:** ${call.suspectsDescription}\n`;
    if (call.lastSeen) description += `**Last Seen:** ${call.lastSeen}\n`;
    if (call.contact) description += `**Contact:** ${call.contact}\n`;

    const callEmbed = new EmbedBuilder()
      .setColor('#ff6600')
      .setTitle(`🚨 Call #${call.callId}: ${call.issue}`)
      .setDescription(description)
      .setFooter({ text: `EverLink | ID: ${call.callId}` })
      .setTimestamp(call.timestamp);

    // Show options to respond or attach
    const respondBtn = new ButtonBuilder()
      .setCustomId(`leo_respond_primary_${callId}`)
      .setLabel('Respond as Primary')
      .setStyle(ButtonStyle.Primary);

    const attachBtn = new ButtonBuilder()
      .setCustomId(`leo_respond_attach_${callId}`)
      .setLabel('Attach to Call')
      .setStyle(ButtonStyle.Secondary);

    const backBtn = new ButtonBuilder()
      .setCustomId('back_to_leo_menu')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(respondBtn, attachBtn);
    const backRow = new ActionRowBuilder().addComponents(backBtn);

    return interaction.update({
      embeds: [callEmbed],
      components: [row, backRow],
    });
  } catch (error) {
    console.error('Error responding to call:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOPrimaryResponse(interaction) {
  const callId = interaction.customId.split('_').pop();

  try {
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });

    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    if (call.respondingLeoId && call.respondingLeoId !== interaction.user.id) {
      return interaction.reply({
        embeds: [errorEmbed(`This call already has a primary responder: <@${call.respondingLeoId}>`)],
        ephemeral: true,
      });
    }

    call.respondingLeoId = interaction.user.id;
    call.respondingLeoUsername = interaction.user.username;
    await call.save();

    // Update the original 911 message if it exists
    if (call.messageId && call.channelId) {
      try {
        const channel = await interaction.guild.channels.fetch(call.channelId);
        const message = await channel.messages.fetch(call.messageId);
        const updatedEmbed = message.embeds[0].toJSON();
        
        let description = updatedEmbed.description || '';
        const respondingLine = `\n\n**🚨 PRIMARY:** ${interaction.user.username}`;
        if (!description.includes('PRIMARY')) {
          updatedEmbed.description = (description || '') + respondingLine;
        } else {
          updatedEmbed.description = description.replace(/\*\*🚨 PRIMARY:.*/, `**🚨 PRIMARY:** ${interaction.user.username}`);
        }

        await message.edit({
          embeds: [updatedEmbed],
        });
      } catch (error) {
        console.error('Error updating 911 message:', error);
      }
    }

    return interaction.reply({
      embeds: [successEmbed('Response Accepted', `You are now the primary responder for **${call.issue}** at **${call.location}**`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error accepting primary response:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOAttachResponse(interaction) {
  const callId = interaction.customId.split('_').pop();

  try {
    const call = await EmergencyCall.findOne({ callId, guildId: interaction.guildId });

    if (!call) {
      return interaction.reply({
        embeds: [errorEmbed('Call not found.')],
        ephemeral: true,
      });
    }

    if (call.attachedLeoIds.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('You are already attached to this call.')],
        ephemeral: true,
      });
    }

    call.attachedLeoIds.push(interaction.user.id);
    await call.save();

    // Update the original 911 message if it exists
    if (call.messageId && call.channelId) {
      try {
        const channel = await interaction.guild.channels.fetch(call.channelId);
        const message = await channel.messages.fetch(call.messageId);
        const updatedEmbed = message.embeds[0].toJSON();
        
        // Build responder list
        let responderText = '';
        if (call.respondingLeoId) {
          responderText += `**🚨 PRIMARY:** ${call.respondingLeoUsername}`;
        }
        if (call.attachedLeoIds.length > 0) {
          if (responderText) responderText += '\n';
          responderText += `**📎 ATTACHED:** ${call.attachedLeoIds.map(id => {
            const member = interaction.guild.members.cache.get(id);
            return member?.user.username || `<@${id}>`;
          }).join(', ')}`;
        }

        // Update description
        let description = updatedEmbed.description || '';
        const responderMatch = description.match(/(\n\n\*\*🚨 PRIMARY:.*)?(\n\*\*📎 ATTACHED:.*)?$/);
        if (responderMatch) {
          description = description.substring(0, responderMatch.index) + '\n\n' + responderText;
        } else {
          description += '\n\n' + responderText;
        }
        updatedEmbed.description = description;

        await message.edit({
          embeds: [updatedEmbed],
        });
      } catch (error) {
        console.error('Error updating 911 message:', error);
      }
    }

    return interaction.reply({
      embeds: [successEmbed('Attached to Call', `You have attached to **${call.issue}** at **${call.location}**`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error attaching to call:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOSearchCharacterModal(interaction) {
  const characterName = interaction.fields.getTextInputValue('character_search');

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Search for character (case-insensitive)
    const character = await CADCharacter.findOne({
      guildId: interaction.guildId,
      characterName: { $regex: characterName, $options: 'i' }
    });

    if (!character) {
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_leo_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        embeds: [infoEmbed('Character Search', `No results found for **${characterName}**.`)],
        components: [backButton],
      });
    }

    let description = `**📋 PERSONAL INFORMATION**\n`;
    if (character.age) description += `Age: ${character.age} | `;
    if (character.gender) description += `Gender: ${character.gender}`;
    if (character.age || character.gender) description += `\n`;

    description += `\n**👤 PHYSICAL DESCRIPTION**\n`;
    if (character.height) description += `Height: ${character.height} | `;
    if (character.distinguishingFeatures) description += `Race: ${character.distinguishingFeatures}`;
    if (character.height || character.distinguishingFeatures) description += `\n`;
    if (character.hairColor) description += `Hair: ${character.hairColor} | `;
    if (character.eyeColor) description += `Eyes: ${character.eyeColor}`;
    if (character.hairColor || character.eyeColor) description += `\n`;
    if (character.build) description += `Build: ${character.build}\n`;

    description += `\n**🪪 IDENTIFICATION**\n`;
    description += `SSN: ${character.socialSecurityNumber}\n`;
    description += `License Status: ${character.driverLicenseStatus === 'valid' ? '✅ Valid' : '❌ Invalid'}\n`;
    if (character.veteranStatus && character.veteranStatus !== 'none') {
      description += `Status: ${character.veteranStatus === 'veteran' ? '🎖️ Veteran' : '❤️ Organ Donor'}\n`;
    }

    description += `\n**🚗 VEHICLES**\n`;
    if (character.vehicles.length > 0) {
      character.vehicles.forEach(v => {
        description += `• ${v.make} ${v.model} (${v.color}) - Plate: **${v.licensePlate}**${v.condition ? ` [${v.condition}]` : ''}\n`;
      });
    } else {
      description += `None registered\n`;
    }

    description += `\n**💥 WEAPONS**\n`;
    if (character.guns.length > 0) {
      character.guns.forEach(g => {
        description += `• ${g.name}${g.serialNumber ? ` (SN: ${g.serialNumber})` : ''}\n`;
      });
    } else {
      description += `None registered\n`;
    }

    // Fetch BOLOs for this character
    const BOLO = await import('../models/BOLO.js').then(m => m.default);
    const bolos = await BOLO.find({ guildId: interaction.guildId, characterId: character._id.toString(), active: true });
    
    if (bolos.length > 0) {
      description += `\n**🚨 BOLO ALERTS**\n`;
      bolos.forEach(bolo => {
        description += `• **${bolo.boloId}** - ${bolo.reason}\n`;
        description += `  Issued: ${bolo.createdAt.toLocaleDateString()} by <@${bolo.issuedBy}>\n`;
        if (bolo.description) description += `  Details: ${bolo.description}\n`;
      });
    }

    // Fetch traffic tickets for this character
    const TrafficTicket = await import('../models/TrafficTicket.js').then(m => m.default);
    const tickets = await TrafficTicket.find({ characterId: character._id.toString() }).sort({ issuedAt: -1 });
    
    description += `\n**🎫 TRAFFIC TICKETS**\n`;
    if (tickets.length > 0) {
      const ticketSummary = tickets.slice(0, 5).map(t => {
        return `• **${t.ticketId}** - ${t.violation}${t.fine ? ` ($${t.fine})` : ''}`;
      }).join('\n');
      description += ticketSummary;
      if (tickets.length > 5) description += `\n... and ${tickets.length - 5} more`;
    } else {
      description += `None on record\n`;
    }

    description += `\n**⚖️ STATUS**\n`;
    if (bolos.length > 0) {
      description += `🚨 **BOLO ALERT**`;
    } else if (character.status === 'wanted') {
      description += `🚨 **WANTED**${character.wantedReason ? ` - ${character.wantedReason}` : ''}`;
    } else {
      description += `✅ **CLEAN**`;
    }

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_leo_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor((character.status === 'wanted' || bolos.length > 0) ? '#ff0000' : '#00ff00')
      .setTitle(`Character Profile: ${character.characterName}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.update({
      embeds: [embed],
      components: [backButton],
    });
  } catch (error) {
    console.error('Error searching character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEORevokeWeaponModal(interaction) {
  const characterName = interaction.fields.getTextInputValue('character_name_for_revoke');
  const weaponName = interaction.fields.getTextInputValue('weapon_name_to_revoke');
  const revokeReason = interaction.fields.getTextInputValue('revoke_reason');

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Find character
    const character = await CADCharacter.findOne({
      guildId: interaction.guildId,
      characterName: { $regex: characterName, $options: 'i' }
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', `No character named **${characterName}** found.`)],
        ephemeral: true,
      });
    }

    // Find and remove weapon
    const weaponIndex = character.guns.findIndex(g => g.name.toLowerCase() === weaponName.toLowerCase());

    if (weaponIndex === -1) {
      return interaction.reply({
        embeds: [errorEmbed('Weapon Not Found', `**${characterName}** does not have a **${weaponName}** registered.`)],
        ephemeral: true,
      });
    }

    const removedWeapon = character.guns.splice(weaponIndex, 1)[0];
    await character.save();

    let responseDesc = `**Character:** ${character.characterName}\n`;
    responseDesc += `**Revoked Weapon:** ${removedWeapon.name}${removedWeapon.serialNumber ? ` (SN: ${removedWeapon.serialNumber})` : ''}\n`;
    responseDesc += `**Revoked By:** <@${interaction.user.id}>\n`;
    if (revokeReason) responseDesc += `**Reason:** ${revokeReason}`;

    return interaction.reply({
      embeds: [successEmbed('Weapon Revoked', responseDesc)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error revoking weapon:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOIssueTicketModal(interaction) {
  console.log('🎫 Ticket modal submitted by:', interaction.user.tag);
  
  try {
    const characterName = interaction.fields.getTextInputValue('ticket_character_name') || '';
    const violation = interaction.fields.getTextInputValue('ticket_violation') || '';
    const description = interaction.fields.getTextInputValue('ticket_description') || '';
    const fineAmount = parseInt(interaction.fields.getTextInputValue('ticket_fine') || '0') || 0;

    console.log(`📝 Ticket details - Name: ${characterName}, Violation: ${violation}, Fine: ${fineAmount}`);

    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Find character
    console.log(`🔍 Searching for character: ${characterName}`);
    const character = await CADCharacter.findOne({
      guildId: interaction.guildId,
      characterName: { $regex: characterName, $options: 'i' }
    });

    if (!character) {
      console.log(`❌ Character not found: ${characterName}`);
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', `No character named **${characterName}** found.`)],
        ephemeral: true,
      });
    }

    console.log(`✅ Found character: ${character.characterName}`);

    // Create ticket
    const ticketId = `TKT-${Date.now()}`;
    const ticket = new TrafficTicket({
      guildId: interaction.guildId,
      ticketId,
      characterId: character._id.toString(),
      characterName: character.characterName,
      issuedBy: interaction.user.id,
      violation,
      description,
      fine: fineAmount,
    });

    console.log(`💾 Saving ticket: ${ticketId}`);
    await ticket.save();
    console.log(`✅ Ticket saved successfully`);

    let responseDesc = `**Ticket ID:** ${ticketId}\n`;
    responseDesc += `**Character:** ${character.characterName}\n`;
    responseDesc += `**Violation:** ${violation}\n`;
    responseDesc += `**Fine:** $${fineAmount}\n`;
    responseDesc += `**Issued By:** <@${interaction.user.id}>\n`;
    if (description) responseDesc += `**Details:** ${description}`;

    return interaction.reply({
      embeds: [successEmbed('Traffic Ticket Issued', responseDesc)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('❌ Error issuing ticket:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.', error.message || 'Unknown error')],
      ephemeral: true,
    }).catch(e => console.error('Could not send reply:', e));
  }
}

export async function handleLEOCreateBOLOModal(interaction) {
  const characterName = interaction.fields.getTextInputValue('bolo_character_name');
  const reason = interaction.fields.getTextInputValue('bolo_reason');
  const description = interaction.fields.getTextInputValue('bolo_description');
  const vehiclesInput = interaction.fields.getTextInputValue('bolo_vehicles');

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Find character
    const character = await CADCharacter.findOne({
      guildId: interaction.guildId,
      characterName: { $regex: characterName, $options: 'i' }
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', `No character named **${characterName}** found.`)],
        ephemeral: true,
      });
    }

    // Parse vehicles (basic parsing: "Make Model (Color) - Plate: ABC123")
    const vehicles = [];
    if (vehiclesInput) {
      const vehicleLines = vehiclesInput.split('\n').filter(line => line.trim());
      vehicleLines.forEach(line => {
        // Simple parsing - just store as-is with basic extraction
        const plateMatch = line.match(/(?:plate|plt):\s*(\w+)/i);
        const colorMatch = line.match(/\(([^)]+)\)/);
        
        vehicles.push({
          make: '',
          model: '',
          color: colorMatch ? colorMatch[1] : '',
          licensePlate: plateMatch ? plateMatch[1] : '',
          year: '',
          notes: line.trim(),
        });
      });
    }

    // Create BOLO with 1-hour expiration
    const boloId = `BOLO-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    const bolo = new BOLO({
      guildId: interaction.guildId,
      boloId,
      characterId: character._id,
      characterName: character.characterName,
      reason,
      description,
      vehicles,
      issuedBy: interaction.user.id,
      active: true,
      expiresAt,
    });

    await bolo.save();

    let responseDesc = `**BOLO ID:** ${boloId}\n`;
    responseDesc += `**Character:** ${character.characterName}\n`;
    responseDesc += `**Reason:** ${reason}\n`;
    responseDesc += `**Status:** 🟢 ACTIVE (Expires in 1 hour)\n`;
    responseDesc += `**Issued By:** <@${interaction.user.id}>\n`;
    if (description) responseDesc += `**Details:** ${description}\n`;
    if (vehicles.length > 0) {
      responseDesc += `\n**Known Vehicles:** ${vehicles.length} vehicle(s) added`;
    }

    return interaction.reply({
      embeds: [successEmbed('🚨 BOLO ALERT CREATED', responseDesc)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error creating BOLO:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleLEOViewCharacterProfile(interaction) {
  const characterId = interaction.customId.replace('view_char_profile_', '');

  try {
    // Verify permissions
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        ephemeral: true,
      });
    }

    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
    }

    // Find character
    const character = await CADCharacter.findById(characterId);

    if (!character || character.guildId !== interaction.guildId) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', 'This character profile could not be found.')],
        ephemeral: true,
      });
    }

    // Build full character profile description (same as character search)
    let description = `**📋 PERSONAL INFORMATION**\n`;
    if (character.age) description += `Age: ${character.age} | `;
    if (character.gender) description += `Gender: ${character.gender}`;
    if (character.age || character.gender) description += `\n`;

    description += `\n**👤 PHYSICAL DESCRIPTION**\n`;
    if (character.hairColor) description += `Hair: ${character.hairColor} | `;
    if (character.eyeColor) description += `Eyes: ${character.eyeColor}`;
    if (character.hairColor || character.eyeColor) description += `\n`;
    if (character.height) description += `Height: ${character.height} | `;
    if (character.build) description += `Build: ${character.build}\n`;
    
    description += `\n**🪪 IDENTIFICATION**\n`;
    description += `SSN: ${character.socialSecurityNumber}\n`;
    description += `Driver's License: ${character.driversLicense}\n`;
    
    description += `\n**🚗 VEHICLES**\n`;
    if (character.vehicles.length > 0) {
      character.vehicles.forEach(v => {
        description += `• ${v.make} ${v.model} (${v.color}) - Plate: **${v.licensePlate}**${v.condition ? ` [${v.condition}]` : ''}\n`;
      });
    } else {
      description += `None registered\n`;
    }

    description += `\n**💥 WEAPONS**\n`;
    if (character.guns.length > 0) {
      character.guns.forEach(g => {
        description += `• ${g.name}${g.serialNumber ? ` (SN: ${g.serialNumber})` : ''}\n`;
      });
    } else {
      description += `None registered\n`;
    }

    // Fetch BOLOs for this character
    const BOLO = await import('../models/BOLO.js').then(m => m.default);
    const bolos = await BOLO.find({ guildId: interaction.guildId, characterId: character._id.toString(), active: true });
    
    if (bolos.length > 0) {
      description += `\n**🚨 BOLO ALERTS**\n`;
      bolos.forEach(bolo => {
        description += `• **${bolo.boloId}** - ${bolo.reason}\n`;
        description += `  Issued: ${bolo.createdAt.toLocaleDateString()} by <@${bolo.issuedBy}>\n`;
        if (bolo.description) description += `  Details: ${bolo.description}\n`;
      });
    }

    // Fetch traffic tickets for this character
    const TrafficTicket = await import('../models/TrafficTicket.js').then(m => m.default);
    const tickets = await TrafficTicket.find({ characterId: character._id.toString() }).sort({ issuedAt: -1 });
    
    description += `\n**🎫 TRAFFIC TICKETS**\n`;
    if (tickets.length > 0) {
      const ticketSummary = tickets.slice(0, 5).map(t => {
        return `• **${t.ticketId}** - ${t.violation}${t.fine ? ` ($${t.fine})` : ''}`;
      }).join('\n');
      description += ticketSummary;
      if (tickets.length > 5) description += `\n... and ${tickets.length - 5} more`;
    } else {
      description += `None on record\n`;
    }

    description += `\n**⚖️ STATUS**\n`;
    if (bolos.length > 0) {
      description += `🚨 **BOLO ALERT**`;
    } else if (character.status === 'wanted') {
      description += `🚨 **WANTED**${character.wantedReason ? ` - ${character.wantedReason}` : ''}`;
    } else {
      description += `✅ **CLEAN**`;
    }

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_leo_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor((character.status === 'wanted' || bolos.length > 0) ? '#ff0000' : '#00ff00')
      .setTitle(`Character Profile: ${character.characterName}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.update({
      embeds: [embed],
      components: [backButton],
    });
  } catch (error) {
    console.error('Error viewing character profile:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
