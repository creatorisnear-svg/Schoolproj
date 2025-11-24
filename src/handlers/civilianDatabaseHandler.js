import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADCharacter from '../models/CADCharacter.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export async function handleCivilianDatabaseMenu(interaction) {
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

    if (choice === 'report_911') {
      if (!roleplayConfig.use911 || !roleplayConfig.use911Channel) {
        return interaction.reply({
          embeds: [errorEmbed('911 System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('911report')
        .setTitle('911 Report Form');

      const issueInput = new TextInputBuilder()
        .setCustomId('issue')
        .setLabel('Issue')
        .setPlaceholder('What happened? (e.g., Armed Robbery, Car Accident)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Location')
        .setPlaceholder('Where did this happen? (e.g., Legion Square)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const suspectsDescInput = new TextInputBuilder()
        .setCustomId('suspectsDescription')
        .setLabel('Suspects & Vehicle Information')
        .setPlaceholder('Include: # of suspects, names, physical description, vehicle make/model/color, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const lastSeenInput = new TextInputBuilder()
        .setCustomId('lastSeen')
        .setLabel('Last Seen')
        .setPlaceholder('Last known location or direction of travel...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const contactInput = new TextInputBuilder()
        .setCustomId('contact')
        .setLabel('How can we contact you if needed?')
        .setPlaceholder('Discord tag, in-game name, phone number, etc.')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(issueInput);
      const row2 = new ActionRowBuilder().addComponents(locationInput);
      const row3 = new ActionRowBuilder().addComponents(suspectsDescInput);
      const row4 = new ActionRowBuilder().addComponents(lastSeenInput);
      const row5 = new ActionRowBuilder().addComponents(contactInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      return interaction.showModal(modal);
    }

    if (choice === 'post_twitter') {
      if (!roleplayConfig.useTwitter || !roleplayConfig.twitterChannel) {
        return interaction.reply({
          embeds: [errorEmbed('Twitter System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('twitter_post_modal')
        .setTitle('Post to Twitter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('twitter_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'post_anon') {
      if (!roleplayConfig.useAnon || !roleplayConfig.anonChannel) {
        return interaction.reply({
          embeds: [errorEmbed('Anonymous System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('anon_post_modal')
        .setTitle('Post Anonymously')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('anon_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post anonymously?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

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

    if (choice === 'add_firearm') {
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
        content: 'Select a character to add a firearm to:',
        components: [charMenu],
        ephemeral: true,
      });
    }

    if (choice === 'manage_character') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('No Characters', 'You haven\'t created any characters yet.')],
          ephemeral: true,
        });
      }

      const charMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('civilian_manage_character_select')
            .setPlaceholder('Select a character to manage...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
              description: `Age: ${c.age || 'N/A'} | Vehicles: ${c.vehicles?.length || 0}`
            })))
        );

      return interaction.reply({
        content: '**MANAGE CHARACTER**\n\nSelect a character to view, edit, or delete:',
        components: [charMenu],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in civilian database menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCivilianManageCharacterSelect(interaction) {
  const characterId = interaction.values[0];

  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', 'This character could not be found.')],
        ephemeral: true,
      });
    }

    // Show character details with action buttons
    let description = `**Name:** ${character.characterName}\n`;
    if (character.age) description += `**Age:** ${character.age}\n`;
    if (character.gender) description += `**Gender:** ${character.gender}\n`;
    if (character.hairColor) description += `**Hair:** ${character.hairColor}\n`;
    if (character.eyeColor) description += `**Eyes:** ${character.eyeColor}\n`;
    if (character.socialSecurityNumber) description += `**SSN:** ${character.socialSecurityNumber}\n`;
    if (character.driversLicense) description += `**License:** ${character.driversLicense}\n`;
    
    description += `\n**Vehicles:** ${character.vehicles?.length || 0}\n`;
    description += `**Weapons:** ${character.guns?.length || 0}`;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`📋 ${character.characterName}`)
      .setDescription(description)
      .setFooter({ text: 'EverLink' });

    const actionButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`char_edit_${characterId}`)
          .setLabel('✏️ Edit')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId(`char_delete_${characterId}`)
          .setLabel('🗑️ Delete')
          .setStyle('Danger')
      );

    return interaction.reply({
      embeds: [embed],
      components: [actionButtons],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error managing character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCharacterEdit(interaction, characterId) {
  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`char_edit_modal_${characterId}`)
      .setTitle(`Edit ${character.characterName}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_age')
            .setLabel('Age')
            .setValue(character.age?.toString() || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_gender')
            .setLabel('Gender')
            .setValue(character.gender || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_hair_color')
            .setLabel('Hair Color')
            .setValue(character.hairColor || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_eye_color')
            .setLabel('Eye Color')
            .setValue(character.eyeColor || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_ssn')
            .setLabel('SSN (optional)')
            .setValue(character.socialSecurityNumber || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error opening edit modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCharacterEditModal(interaction, characterId) {
  const age = interaction.fields.getTextInputValue('edit_age');
  const gender = interaction.fields.getTextInputValue('edit_gender');
  const hairColor = interaction.fields.getTextInputValue('edit_hair_color');
  const eyeColor = interaction.fields.getTextInputValue('edit_eye_color');
  const ssn = interaction.fields.getTextInputValue('edit_ssn');

  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        ephemeral: true,
      });
    }

    // Update fields
    if (age) character.age = parseInt(age);
    if (gender) character.gender = gender;
    if (hairColor) character.hairColor = hairColor;
    if (eyeColor) character.eyeColor = eyeColor;
    if (ssn) character.socialSecurityNumber = ssn;

    await character.save();

    let updatedDesc = `**Updated Fields:**\n`;
    if (age) updatedDesc += `• Age: ${age}\n`;
    if (gender) updatedDesc += `• Gender: ${gender}\n`;
    if (hairColor) updatedDesc += `• Hair: ${hairColor}\n`;
    if (eyeColor) updatedDesc += `• Eyes: ${eyeColor}\n`;
    if (ssn) updatedDesc += `• SSN: ${ssn}\n`;

    return interaction.reply({
      embeds: [successEmbed('Character Updated', `**${character.characterName}** has been updated!\n\n${updatedDesc}`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error updating character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCharacterDelete(interaction, characterId) {
  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        ephemeral: true,
      });
    }

    // Show confirmation
    const confirmButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`char_delete_confirm_${characterId}`)
          .setLabel('Yes, Delete')
          .setStyle('Danger'),
        new ButtonBuilder()
          .setCustomId('char_delete_cancel')
          .setLabel('Cancel')
          .setStyle('Secondary')
      );

    const { infoEmbed } = await import('../utils/embedBuilder.js');
    return interaction.reply({
      embeds: [infoEmbed('Confirm Delete', `Are you sure you want to delete **${character.characterName}**? This cannot be undone.`)],
      components: [confirmButtons],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error deleting character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleCharacterDeleteConfirm(interaction, characterId) {
  try {
    const character = await CADCharacter.findOneAndDelete({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        ephemeral: true,
      });
    }

    // Show success and return to main menu
    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('civilian_database_menu')
          .setPlaceholder('Select an action...')
          .addOptions(
            { label: '🚨 Report 911 Emergency', value: 'report_911', emoji: '🚨' },
            { label: '🐦 Post to Twitter', value: 'post_twitter', emoji: '🐦' },
            { label: '🤫 Post Anonymously', value: 'post_anon', emoji: '🤫' },
            { label: '👤 Create Character', value: 'create_character', emoji: '👤' },
            { label: '🚗 Add Vehicle', value: 'add_vehicle', emoji: '🚗' },
            { label: '🔫 Add Firearm', value: 'add_firearm', emoji: '🔫' },
            { label: '📋 Manage Character', value: 'manage_character', emoji: '📋' }
          )
      );

    return interaction.reply({
      embeds: [successEmbed('Character Deleted', `**${character.characterName}** has been permanently deleted.`)],
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error deleting character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
