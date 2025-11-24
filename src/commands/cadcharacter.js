import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import CADCharacter from '../models/CADCharacter.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('cadcharacter')
  .setDescription('Manage your CAD character (create, add vehicle, add gun, view)');

export async function execute(interaction) {
  try {
    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cadcharacter_menu')
          .setPlaceholder('Choose an action...')
          .addOptions(
            { label: 'Create Character', value: 'create_character' },
            { label: 'Add Vehicle', value: 'add_vehicle' },
            { label: 'Add Gun', value: 'add_gun' },
            { label: 'View Characters', value: 'view_characters' }
          )
      );

    await interaction.reply({
      content: 'Choose an action:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error executing cadcharacter:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
