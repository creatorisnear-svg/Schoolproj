import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('leodatabase')
  .setDescription('LEO Database - Search characters, vehicles, and more');

export async function execute(interaction) {
  try {
    // Check if roleplay commands are enabled
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled on this server.')],
        ephemeral: true,
      });
    }

    // Check if user has LEO role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig || !cadConfig.leoRoleIds || cadConfig.leoRoleIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('LEO database is not configured.')],
        ephemeral: true,
      });
    }

    const hasLeoRole = cadConfig && cadConfig.leoRoleIds && cadConfig.leoRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have LEO access.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('leodatabase_menu')
          .setPlaceholder('Choose an action...')
          .addOptions(
            { label: '🚨 View Active 911 Calls', value: 'active_calls' },
            { label: '🔍 Search License Plate', value: 'search_plate' },
            { label: '👤 Search Character Name', value: 'search_character' },
            { label: '🚨 View Active BOLOs', value: 'active_bolos' },
            { label: '🚨 Manage BOLOs', value: 'manage_bolos' },
            { label: '🔫 Revoke Weapon', value: 'revoke_weapon' },
            { label: '🎫 Issue Traffic Ticket', value: 'issue_ticket' },
            { label: '🚨 Create BOLO', value: 'create_bolo' }
          )
      );

    return interaction.reply({
      content: '**LEO DATABASE**\n\nSelect an action:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error executing leodatabase:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
