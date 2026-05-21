import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('leodatabase')
  .setDescription('LEO Database - Search characters, vehicles, and more');

export async function execute(interaction) {
  let deferred = false;
  try {
    // Defer early — three DB queries run before replying and could exceed 3s under load
    await interaction.deferReply({ flags: 64 });
    deferred = true;

    // Check if roleplay commands are enabled
    const [roleplayConfig, isStaff, cadConfig] = await Promise.all([
      RoleplayCommands.findOne({ guildId: interaction.guildId }),
      checkStaffPermission(interaction),
      CADConfig.findOne({ guildId: interaction.guildId }),
    ]);

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.editReply({
        embeds: [errorEmbed('Roleplay commands are not enabled on this server.')],
      });
    }

    if (!cadConfig || !cadConfig.leoRoleIds || cadConfig.leoRoleIds.length === 0) {
      return interaction.editReply({
        embeds: [errorEmbed('LEO database is not configured.')],
      });
    }

    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole && !isStaff) {
      return interaction.editReply({
        embeds: [errorEmbed('You do not have LEO access.')],
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('leodatabase_menu')
          .setPlaceholder('Choose an action...')
          .addOptions(
            { label: 'View Active 911 Calls', value: 'active_calls' },
            { label: 'Search License Plate', value: 'search_plate' },
            { label: 'Search Character Name', value: 'search_character' },
            { label: 'View Active BOLOs', value: 'active_bolos' },
            { label: 'Manage BOLOs', value: 'manage_bolos' },
            { label: 'Revoke Weapon', value: 'revoke_weapon' },
            { label: 'Issue Traffic Ticket', value: 'issue_ticket' },
            { label: 'Create BOLO', value: 'create_bolo' }
          )
      );

    return interaction.editReply({
      content: '**LEO DATABASE**\n\nSelect an action:',
      components: [menu],
    });
  } catch (error) {
    console.error('Error executing leodatabase:', error);
    const respond = deferred ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
    return respond({
      embeds: [errorEmbed('An error occurred.')],
      flags: deferred ? undefined : 64,
    });
  }
}
