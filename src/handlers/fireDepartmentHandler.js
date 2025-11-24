import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

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
