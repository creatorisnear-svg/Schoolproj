import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('cadsystem')
  .setDescription('Configure the CAD system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    let cadConfig = await CADConfig.findOne({ guildId: interaction.guildId });

    if (!cadConfig) {
      cadConfig = new CADConfig({ guildId: interaction.guildId, enabled: true });
      await cadConfig.save();
    } else {
      cadConfig.enabled = true;
      await cadConfig.save();
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cadsystem_setup_menu')
          .setPlaceholder('Choose a setup option...')
          .addOptions(
            { label: 'Set LEO Roles', value: 'set_leo_roles' },
            { label: 'Set Fire Department Roles', value: 'set_fd_roles' },
            { label: 'Set Staff Roles', value: 'set_staff_roles' },
            { label: '✅ Done - Close Setup', value: 'setup_done' }
          )
      );

    await interaction.reply({
      content: '**CAD System Setup**\n\nConfigure which roles have access to CAD features:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in CAD setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
