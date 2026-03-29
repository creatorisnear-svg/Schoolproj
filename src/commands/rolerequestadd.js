import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('rolerequestadd')
  .setDescription('Configure the role request system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const roleRequestConfig = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!roleRequestConfig || !roleRequestConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The role request system is not enabled. Enable it in `/enablecommands` first.')],
        flags: 64,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rolerequest_setup_menu')
          .setPlaceholder('Choose a setup option...')
          .addOptions(
            { label: 'Add Role Request Type', value: 'add_role' },
            { label: 'Delete Role Request Type', value: 'delete_role' },
            { label: 'View Role Request Types', value: 'view_roles' },
            { label: 'Done - Close Setup', value: 'setup_done' }
          )
      );

    await interaction.reply({
      content: '**Role Request System Setup**\n\nSelect an option below to configure role requests:',
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in role request setup command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
