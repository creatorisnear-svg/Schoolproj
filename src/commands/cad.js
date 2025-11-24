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

    // Get LEO and Fire Department roles to ping
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });
    
    let mention = '';
    if (cadConfig) {
      const mentions = [];
      if (cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0) {
        mentions.push(...cadConfig.leoRoleIds.map(id => `<@&${id}>`));
      }
      if (cadConfig.fireDepartmentRoleIds && cadConfig.fireDepartmentRoleIds.length > 0) {
        mentions.push(...cadConfig.fireDepartmentRoleIds.map(id => `<@&${id}>`));
      }
      mention = mentions.join(' ');
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
      content: mention ? `${mention} Dispatch update:` : undefined,
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
