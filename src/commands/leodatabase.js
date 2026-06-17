import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('leodatabase')
  .setDescription('LEO Database - search records, manage BOLOs, respond to calls');

export async function execute(interaction) {
  let deferred = false;
  try {
    await interaction.deferReply({ flags: 64 });
    deferred = true;

    const [roleplayConfig, isStaff, cadConfig] = await Promise.all([
      RoleplayCommands.findOne({ guildId: interaction.guildId }),
      checkStaffPermission(interaction),
      CADConfig.findOne({ guildId: interaction.guildId }),
    ]);

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.editReply({
        embeds: [errorEmbed('System Unavailable', 'Roleplay commands are not enabled on this server. Contact an administrator.')],
      });
    }

    if (!cadConfig || !cadConfig.leoRoleIds || cadConfig.leoRoleIds.length === 0) {
      return interaction.editReply({
        embeds: [errorEmbed('Not Configured', 'The LEO database has not been configured yet. An administrator must run `/roleplaycommandconfig` first.')],
      });
    }

    const hasLeoRole = interaction.member.roles.cache.some(role => cadConfig.leoRoleIds.includes(role.id));

    if (!hasLeoRole && !isStaff) {
      return interaction.editReply({
        embeds: [errorEmbed('Access Denied', 'You do not have a LEO role assigned. Contact a server administrator if you believe this is incorrect.')],
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('leodatabase_menu')
          .setPlaceholder('Select an option...')
          .addOptions(
            { label: 'View Active 911 Calls', value: 'active_calls', description: 'See all open emergency calls and respond' },
            { label: 'Search License Plate', value: 'search_plate', description: 'Run a plate check on a vehicle' },
            { label: 'Search Character Name', value: 'search_character', description: 'Look up a civilian record by name' },
            { label: 'View Active BOLOs', value: 'active_bolos', description: 'Browse all currently active BOLO alerts' },
            { label: 'Manage BOLOs', value: 'manage_bolos', description: 'View or remove a specific BOLO' },
            { label: 'Issue Traffic Ticket', value: 'issue_ticket', description: 'Write a traffic violation ticket to a character' },
            { label: 'Create BOLO', value: 'create_bolo', description: 'Issue a Be On the LookOut alert' },
            { label: 'Revoke Weapon', value: 'revoke_weapon', description: 'Remove a firearm license from a character' }
          )
      );

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('LEO Database')
      .setDescription(
        'Select an option from the menu below.\n\n' +
        '**On a call?**\n' +
        '> Use **View Active 911 Calls** to see open calls and mark yourself as responding.\n\n' +
        '**Need a record check?**\n' +
        '> Use **Search License Plate** or **Search Character Name** for instant civilian record lookups.\n\n' +
        '**Enforcement tools**\n' +
        '> **Issue Ticket**, **Create BOLO**, and **Revoke Weapon** are all available from the menu.'
      )
      .setFooter({ text: 'RPM  •  LEO Access  •  Only visible to you' });

    return interaction.editReply({
      embeds: [embed],
      components: [menu],
    });
  } catch (error) {
    console.error('Error executing leodatabase:', error);
    const respond = deferred ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
    return respond({
      embeds: [errorEmbed('Unexpected Error', 'Something went wrong. Please try again.')],
      flags: deferred ? undefined : 64,
    });
  }
}
