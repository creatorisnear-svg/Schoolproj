import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('cad')
  .setDescription('View CAD dispatch information');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled || !roleplayConfig.useCAD) {
      return interaction.reply({
        embeds: [errorEmbed('The CAD system is not enabled.')],
        ephemeral: true,
      });
    }

    const cadEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📡 GTA5 RP - CAD System')
      .setDescription('Computer Aided Dispatch - Law Enforcement Operations')
      .addFields(
        { name: '📍 Active Units', value: 'No active units at this time', inline: false },
        { name: '🚨 Dispatch Calls', value: 'No active calls', inline: false },
        { name: '📋 Recent Activity', value: 'System online and monitoring', inline: false }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [cadEmbed],
      ephemeral: false,
    });
  } catch (error) {
    console.error('Error in cad command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
