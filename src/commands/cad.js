import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('cad')
  .setDescription('View GTA5 RP CAD (Computer Aided Dispatch) information');

export async function execute(interaction) {
  try {
    const cadEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('GTA5 RP - CAD System')
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
    console.error('Error executing cad command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
