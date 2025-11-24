import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
import { ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

async function showSetupMenu(interaction) {
  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cadsystem_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          { label: 'Set LEO Roles', value: 'set_leo_roles' },
          { label: 'Set Fire Department Roles', value: 'set_fd_roles' },
          { label: 'Set Staff Roles', value: 'set_staff_roles' },
          { label: '✅ Done - Close Setup', value: 'setup_done' }
        )
    );

  return {
    content: '**CAD System Setup**\n\nConfigure which roles have access to CAD features:',
    components: [menu],
    ephemeral: true,
  };
}

export async function handleCADSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'set_leo_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('cadsystem_leo_roles')
        .setPlaceholder('Select LEO roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can access LEO features (search license plates, etc.):',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_fd_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('cadsystem_fd_roles')
        .setPlaceholder('Select Fire Department roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can access Fire Department features:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'set_staff_roles') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('cadsystem_staff_roles')
        .setPlaceholder('Select staff roles...')
        .setMinValues(0)
        .setMaxValues(5);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      return interaction.reply({
        content: 'Select the roles that can manage the CAD system:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_done') {
      return interaction.reply({
        embeds: [successEmbed('CAD Setup Complete', 'Your CAD system is ready! Members can now create characters.')],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in CAD setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADLeoRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.leoRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('LEO Roles Set', `${selectedRoles.length} LEO role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting LEO roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADFDRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.fireDepartmentRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Fire Department Roles Set', `${selectedRoles.length} FD role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting FD roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADStaffRoles(interaction) {
  const selectedRoles = interaction.values;

  try {
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      return interaction.reply({
        embeds: [errorEmbed('CAD system not found.')],
        ephemeral: true,
      });
    }

    cadConfig.staffRoleIds = selectedRoles;
    await cadConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Staff Roles Set', `${selectedRoles.length} staff role(s) configured.`)],
    });
  } catch (error) {
    console.error('Error setting staff roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADCharacterMenu(interaction) {
  const choice = interaction.values[0];

  try {
    if (choice === 'create_character') {
      const modal = new ModalBuilder()
        .setCustomId('cadcharacter_create_modal')
        .setTitle('Create Character - Page 1')
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
            .setCustomId('cadcharacter_select_for_vehicle')
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

    if (choice === 'add_gun') {
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
            .setCustomId('cadcharacter_select_for_gun')
            .setPlaceholder('Select a character...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
            })))
        );

      return interaction.reply({
        content: 'Select a character to add a gun to:',
        components: [charMenu],
        ephemeral: true,
      });
    }

    if (choice === 'view_characters') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('You have no characters.')],
          ephemeral: true,
        });
      }

      const embeds = characters.map(c => {
        let description = `**📋 PERSONAL INFORMATION**\n`;
        if (c.age) description += `Age: ${c.age} | `;
        if (c.gender) description += `Gender: ${c.gender}`;
        if (c.age || c.gender) description += `\n`;
        
        description += `\n**👤 PHYSICAL DESCRIPTION**\n`;
        if (c.hairColor) description += `Hair: ${c.hairColor} | `;
        if (c.eyeColor) description += `Eyes: ${c.eyeColor}`;
        if (c.hairColor || c.eyeColor) description += `\n`;
        if (c.height) description += `Height: ${c.height} | `;
        if (c.build) description += `Build: ${c.build}\n`;
        if (c.distinguishingFeatures) description += `Distinguishing Features: ${c.distinguishingFeatures}\n`;
        if (c.scarsAndTattoos) description += `Scars/Tattoos: ${c.scarsAndTattoos}\n`;
        
        description += `\n**🪪 IDENTIFICATION**\n`;
        description += `SSN: ${c.socialSecurityNumber}\n`;
        description += `Driver's License: ${c.driversLicense}\n`;
        description += `License Status: ${c.driverLicenseStatus === 'valid' ? '✅ Valid' : c.driverLicenseStatus === 'suspended' ? '⚠️ Suspended' : '❌ Revoked'}\n`;
        
        description += `\n**📍 CONTACT & ADDRESS**\n`;
        if (c.address) description += `Address: ${c.address}\n`;
        if (c.phoneNumber) description += `Phone: ${c.phoneNumber}\n`;
        if (c.occupation) description += `Occupation: ${c.occupation}\n`;
        if (c.emergencyContact) description += `Emergency Contact: ${c.emergencyContact}\n`;
        
        description += `\n**🚗 INVENTORY**\n`;
        description += `Vehicles: ${c.vehicles.length} | Guns: ${c.guns.length}\n`;
        
        description += `\n**⚖️ STATUS**\n`;
        if (c.status === 'wanted') {
          description += `🚨 **WANTED**${c.wantedReason ? ` - ${c.wantedReason}` : ''}\n`;
        } else {
          description += `✅ **CLEAN**\n`;
        }
        
        if (c.arrestHistory && c.arrestHistory.length > 0) {
          description += `\n**👮 ARREST HISTORY**\n`;
          c.arrestHistory.slice(0, 3).forEach(arrest => {
            description += `• ${arrest.charge} (${arrest.outcome})\n`;
          });
          if (c.arrestHistory.length > 3) description += `• +${c.arrestHistory.length - 3} more arrests\n`;
        }
        
        if (c.medicalInfo) description += `\n**🏥 MEDICAL INFO**\n${c.medicalInfo}\n`;

        return new EmbedBuilder()
          .setColor(c.status === 'wanted' ? '#ff0000' : '#00ff00')
          .setTitle(`${c.characterName}`)
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
    console.error('Error in CAD character menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADCharacterCreateModal(interaction) {
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
      .setTitle('✅ Character Created Successfully')
      .setDescription(description)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error creating character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while creating the character.')],
      ephemeral: true,
    });
  }
}

export async function handleCADVehicleCharacterSelect(interaction) {
  const characterId = interaction.values[0];

  try {
    const modal = new ModalBuilder()
      .setCustomId(`cadvehicle_add_modal_${characterId}`)
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
    console.error('Error in vehicle select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADVehicleAddModal(interaction) {
  const characterId = interaction.customId.replace('cadvehicle_add_modal_', '');
  const make = interaction.fields.getTextInputValue('vehicle_make');
  const model = interaction.fields.getTextInputValue('vehicle_model');
  const color = interaction.fields.getTextInputValue('vehicle_color');
  const plate = interaction.fields.getTextInputValue('vehicle_plate').toUpperCase();
  const condition = interaction.fields.getTextInputValue('vehicle_condition') || null;

  try {
    await CADCharacter.updateOne(
      { _id: characterId },
      { $push: { vehicles: { make, model, color, licensePlate: plate, condition } } }
    );

    let successMsg = `**${make} ${model}**\n🎨 Color: ${color}\n📍 Plate: ${plate}`;
    if (condition) successMsg += `\n⚙️ Condition: ${condition}`;

    return interaction.reply({
      embeds: [successEmbed('Vehicle Registered', successMsg)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the vehicle.')],
      ephemeral: true,
    });
  }
}

export async function handleCADGunCharacterSelect(interaction) {
  const characterId = interaction.values[0];

  try {
    const modal = new ModalBuilder()
      .setCustomId(`cadgun_add_modal_${characterId}`)
      .setTitle('Register Weapon')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('gun_name')
            .setLabel('Weapon Name')
            .setPlaceholder('e.g., Glock 19')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('gun_serial')
            .setLabel('Serial Number')
            .setPlaceholder('e.g., ABC123456')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error in gun select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCADGunAddModal(interaction) {
  const characterId = interaction.customId.replace('cadgun_add_modal_', '');
  const gunName = interaction.fields.getTextInputValue('gun_name');
  const serialNumber = interaction.fields.getTextInputValue('gun_serial') || null;

  try {
    await CADCharacter.updateOne(
      { _id: characterId },
      { $push: { guns: { name: gunName, serialNumber } } }
    );

    let successMsg = `**${gunName}**`;
    if (serialNumber) successMsg += `\n🔢 Serial: ${serialNumber}`;

    return interaction.reply({
      embeds: [successEmbed('Weapon Registered', successMsg)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding gun:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the weapon.')],
      ephemeral: true,
    });
  }
}
