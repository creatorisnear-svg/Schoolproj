import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('antipromotingsetup')
  .setDescription('Configure the anti-promoting system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('antipromotingsetup_menu')
          .setPlaceholder('Choose an option...')
          .addOptions(
            { label: 'Add Whitelisted Link', value: 'add_link' },
            { label: 'Remove Whitelisted Link', value: 'remove_link' },
            { label: 'View Whitelisted Links', value: 'view_links' },
            { label: 'Toggle Staff Bypass', value: 'toggle_staff_bypass' },
            { label: 'View Settings', value: 'view_settings' },
            { label: '✅ Done - Close Setup', value: 'setup_done' }
          )
      );

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('Anti-Promoting System Setup')
      .setDescription('Manage whitelisted invite links and staff bypass settings')
      .setFooter({ text: 'EverLink' });

    return interaction.reply({
      embeds: [embed],
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in anti-promoting setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
