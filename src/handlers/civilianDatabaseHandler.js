import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
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
  } catch (error) {
    console.error('Error in civilian database menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
