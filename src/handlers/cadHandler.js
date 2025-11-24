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
        .setTitle('Create Character')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_name')
              .setLabel('Character Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., John Smith')
              .setRequired(true)
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

      const charList = characters
        .map(c => `**${c.characterName}** - ${c.licensePlate}\n  Vehicles: ${c.vehicles.length} | Guns: ${c.guns.length}`)
        .join('\n\n');

      return interaction.reply({
        embeds: [infoEmbed('Your Characters', charList)],
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

  try {
    const existing = await CADCharacter.findOne({ guildId: interaction.guildId, userId: interaction.user.id, characterName });

    if (existing) {
      return interaction.reply({
        embeds: [errorEmbed(`You already have a character named "${characterName}".`)],
        ephemeral: true,
      });
    }

    const character = new CADCharacter({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      characterName,
      licensePlate: `${interaction.user.id.slice(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
    });

    await character.save();

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Character Created')
      .addFields(
        { name: 'Character Name', value: characterName },
        { name: 'License Plate', value: character.licensePlate }
      )
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
      .setTitle('Add Vehicle')
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
            .setLabel('License Plate')
            .setPlaceholder('e.g., ABCD1234')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
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

  try {
    await CADCharacter.updateOne(
      { _id: characterId },
      { $push: { vehicles: { make, model, color, licensePlate: plate } } }
    );

    return interaction.reply({
      embeds: [successEmbed('Vehicle Added', `${make} ${model} (${color}) added with plate ${plate}`)],
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
      .setTitle('Add Gun')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('gun_name')
            .setLabel('Gun Name')
            .setPlaceholder('e.g., Glock 19')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
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

  try {
    await CADCharacter.updateOne(
      { _id: characterId },
      { $push: { guns: { name: gunName } } }
    );

    return interaction.reply({
      embeds: [successEmbed('Gun Added', `${gunName} added to your character`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error adding gun:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while adding the gun.')],
      ephemeral: true,
    });
  }
}
