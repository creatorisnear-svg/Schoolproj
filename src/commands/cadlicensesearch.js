import { SlashCommandBuilder } from 'discord.js';
import CADCharacter from '../models/CADCharacter.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('cadlicensesearch')
  .setDescription('Search a license plate (LEO only)')
  .addStringOption(option =>
    option.setName('plate')
      .setDescription('License plate to search')
      .setRequired(true)
  );

export async function execute(interaction) {
  try {
    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig || cadConfig.leoRoleIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('LEO search is not configured.')],
        ephemeral: true,
      });
    }

    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to search license plates.')],
        ephemeral: true,
      });
    }

    const plate = interaction.options.getString('plate').toUpperCase();

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

    let vehicleInfo = 'N/A';
    if (character.vehicles.length > 0) {
      vehicleInfo = character.vehicles
        .map(v => `${v.make} ${v.model} (${v.color}) - ${v.licensePlate}`)
        .join('\n');
    }

    let gunsInfo = 'None registered';
    if (character.guns.length > 0) {
      gunsInfo = character.guns.map(g => g.name).join(', ');
    }

    const results = infoEmbed('License Plate Search Results', 
      `**Character:** ${character.characterName}\n**Status:** ${character.status === 'wanted' ? '🚨 WANTED' : '✅ Clean'}`
    );

    if (character.status === 'wanted') {
      results.addField('Wanted Reason', character.wantedReason || 'N/A', true);
    }

    results.addField('Vehicles', vehicleInfo, false);
    results.addField('Guns', gunsInfo, false);

    return interaction.reply({
      embeds: [results],
      ephemeral: false,
    });
  } catch (error) {
    console.error('Error searching license:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
