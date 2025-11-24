import { ActionRowBuilder, TextInputBuilder, TextInputStyle, ModalBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
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
    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

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

    if (choice === 'wanted_list') {
      const wantedCharacters = await CADCharacter.find({ 
        guildId: interaction.guildId, 
        status: 'wanted' 
      });

      if (wantedCharacters.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed('Wanted List', 'No wanted suspects.')],
          ephemeral: true,
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

      return interaction.reply({
        embeds,
        ephemeral: true,
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
    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

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
      return interaction.reply({
        embeds: [infoEmbed('License Plate Search', `No results found for plate **${plate}**.`)],
        ephemeral: false,
      });
    }

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

    description += `\n**⚖️ STATUS**\n`;
    if (character.status === 'wanted') {
      description += `🚨 **WANTED**${character.wantedReason ? ` - ${character.wantedReason}` : ''}`;
    } else {
      description += `✅ **CLEAN**`;
    }

    const embed = new EmbedBuilder()
      .setColor(character.status === 'wanted' ? '#ff0000' : '#00ff00')
      .setTitle(`License Plate Search: ${plate}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  } catch (error) {
    console.error('Error searching license plate:', error);
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
    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

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
      return interaction.reply({
        embeds: [infoEmbed('Character Search', `No results found for **${characterName}**.`)],
        ephemeral: false,
      });
    }

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

    description += `\n**⚖️ STATUS**\n`;
    if (character.status === 'wanted') {
      description += `🚨 **WANTED**${character.wantedReason ? ` - ${character.wantedReason}` : ''}`;
    } else {
      description += `✅ **CLEAN**`;
    }

    const embed = new EmbedBuilder()
      .setColor(character.status === 'wanted' ? '#ff0000' : '#00ff00')
      .setTitle(`Character Profile: ${character.characterName}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  } catch (error) {
    console.error('Error searching character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
