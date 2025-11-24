import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
import EmergencyCall from '../models/EmergencyCall.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';

export async function handleFireDepartmentMenu(interaction) {
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

    // Verify FD role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    const hasFDRole = interaction.member.roles.cache.some(role => cadConfig.fireDepartmentRoleIds.includes(role.id));

    if (!hasFDRole) {
      return interaction.reply({
        embeds: [errorEmbed('Access denied.')],
        ephemeral: true,
      });
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
            .setCustomId('fd_respond_call')
            .setPlaceholder('Select a call to respond to...')
            .addOptions(callOptions)
        );

      return interaction.reply({
        embeds,
        components: [callMenu],
        ephemeral: true,
      });
    }

    if (choice === 'create_character') {
      const modal = new ModalBuilder()
        .setCustomId('fd_character_create_modal')
        .setTitle('Create FD Character')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_name')
              .setLabel('Character Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., John Smith')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_age')
              .setLabel('Age')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 28')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_gender')
              .setLabel('Gender')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Male/Female')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_hair_color')
              .setLabel('Hair Color')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Brown')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_eye_color')
              .setLabel('Eye Color')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Blue')
              .setRequired(false)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'add_vehicle') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('You need to create a character first.')],
          ephemeral: true,
        });
      }

      const charMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('fd_vehicle_character_select')
            .setPlaceholder('Select a character...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
            })))
        );

      return interaction.reply({
        content: 'Select a character to add a vehicle to:',
        components: [charMenu],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in fire department menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleFDCharacterCreateModal(interaction) {
  const characterName = interaction.fields.getTextInputValue('character_name');
  const age = interaction.fields.getTextInputValue('character_age') || null;
  const gender = interaction.fields.getTextInputValue('character_gender') || null;
  const hairColor = interaction.fields.getTextInputValue('character_hair_color') || null;
  const eyeColor = interaction.fields.getTextInputValue('character_eye_color') || null;

  try {
    const existing = await CADCharacter.findOne({ guildId: interaction.guildId, userId: interaction.user.id, characterName });

    if (existing) {
      return interaction.reply({
        embeds: [errorEmbed(`You already have a character named "${characterName}".`)],
        ephemeral: true,
      });
    }

    const licensePlate = `${interaction.user.id.slice(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const driversLicense = `DL${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const ssn = `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 90) + 10}-${Math.floor(Math.random() * 9000) + 1000}`;

    const character = new CADCharacter({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      characterName,
      age: age ? parseInt(age) : null,
      gender,
      hairColor,
      eyeColor,
      licensePlate,
      driversLicense,
      socialSecurityNumber: ssn,
    });

    await character.save();

    let description = `**📋 Personal Information**\n`;
    description += `**Name:** ${characterName}\n`;
    if (age) description += `**Age:** ${age}\n`;
    if (gender) description += `**Gender:** ${gender}\n`;
    description += `\n**🪪 Identification**\n`;
    description += `**SSN:** ${ssn}\n`;
    description += `**Driver's License:** ${driversLicense}\n`;
    description += `**License Status:** Valid\n`;
    if (hairColor || eyeColor) description += `\n**👤 Physical Description**\n`;
    if (hairColor) description += `**Hair:** ${hairColor}\n`;
    if (eyeColor) description += `**Eyes:** ${eyeColor}\n`;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('✅ FD Character Created Successfully')
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error creating FD character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while creating the character.')],
      ephemeral: true,
    });
  }
}

export async function handleFDRespondCall(interaction) {
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
    const hasFDRole = interaction.member.roles.cache.some(role => cadConfig.fireDepartmentRoleIds.includes(role.id));

    if (!hasFDRole) {
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

    // Check if FD member is already responding
    if (call.respondingLeoId === interaction.user.id) {
      return interaction.reply({
        embeds: [errorEmbed('You are already the primary responder for this call.')],
        ephemeral: true,
      });
    }

    // Check if FD member is already attached
    if (call.attachedLeoIds.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('You are already attached to this call.')],
        ephemeral: true,
      });
    }

    // Show options to respond or attach
    const respondBtn = new ButtonBuilder()
      .setCustomId(`fd_respond_primary_${callId}`)
      .setLabel('Respond as Primary')
      .setStyle(ButtonStyle.Danger);

    const attachBtn = new ButtonBuilder()
      .setCustomId(`fd_respond_attach_${callId}`)
      .setLabel('Attach to Call')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(respondBtn, attachBtn);

    return interaction.reply({
      content: `Choose how you want to respond to **${call.issue}** at **${call.location}**:`,
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error responding to call:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleFDPrimaryResponse(interaction) {
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

export async function handleFDAttachResponse(interaction) {
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

export async function handleFDVehicleCharacterSelect(interaction) {
  const characterId = interaction.values[0];

  try {
    const modal = new ModalBuilder()
      .setCustomId(`fd_vehicle_add_modal_${characterId}`)
      .setTitle('Register Vehicle')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('vehicle_make')
            .setLabel('Make')
            .setPlaceholder('e.g., Ford')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('vehicle_model')
            .setLabel('Model')
            .setPlaceholder('e.g., Mustang')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('vehicle_color')
            .setLabel('Color')
            .setPlaceholder('e.g., Red')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('vehicle_plate')
            .setLabel('License Plate (from GTA5)')
            .setPlaceholder('e.g., ABCD1234')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('vehicle_condition')
            .setLabel('Condition')
            .setPlaceholder('e.g., Excellent, Fair, Poor')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error selecting character for vehicle:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
