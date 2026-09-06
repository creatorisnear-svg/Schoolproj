import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('firedepartmentdatabase')
  .setDescription('Fire Department Database - Create and manage FD characters');

export async function execute(interaction) {
  try {
    // Check if roleplay commands are enabled
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled on this server.')],
        flags: 64,
      });
    }

    // Check if user is staff (staff/admins can bypass role restrictions)
    const isStaff = await checkStaffPermission(interaction);

    // Check if user has Fire Department role
    const cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig || !cadConfig.fireDepartmentRoleIds || cadConfig.fireDepartmentRoleIds.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Fire Department database is not configured.')],
        flags: 64,
      });
    }

    const hasFDRole = cadConfig && cadConfig.fireDepartmentRoleIds && cadConfig.fireDepartmentRoleIds.length > 0 && interaction.member.roles.cache.some(role => cadConfig.fireDepartmentRoleIds.includes(role.id));

    if (!hasFDRole && !isStaff) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have Fire Department access.')],
        flags: 64,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('firedepartmentdatabase_menu')
          .setPlaceholder('Choose an action...')
          .addOptions(
            { label: 'View Active 911 Calls', value: 'active_calls' },
            { label: 'Create FD Character', value: 'create_character' },
            { label: 'Add Vehicle', value: 'add_vehicle' }
          )
      );

    // Presented like the civilian and LEO databases rather than as a bare line
    // of bold text. It is the same kind of screen and was the only one of the
    // three not built as an embed.
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Fire Department Database')
      .setDescription(
        'Select an option from the menu below.\n\n' +
        '**Active calls**\n' +
        '> **View Active 911 Calls** shows what is open right now, so you can see what is waiting before you respond.\n\n' +
        '**Getting started?**\n' +
        '> Start with **Create FD Character** to register yourself, then **Add Vehicle** to register an apparatus to that character.\n\n' +
        '**Prefer a browser?**\n' +
        '> The same records are on the web CAD, which is easier on a phone.'
      )
      .setFooter({ text: 'RPM  ·  Only visible to you' });

    return interaction.reply({
      embeds: [embed],
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error executing firedepartmentdatabase:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
