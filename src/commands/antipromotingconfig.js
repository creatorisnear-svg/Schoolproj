import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('antipromotingconfig')
  .setDescription('Configure the anti-promoting system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'antipromote');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Anti-Promoting')],
      flags: 64,
    });
  }

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.antiPromotingEnabled) {
      return interaction.reply({
        embeds: [errorEmbed('Anti-Promoting Not Enabled', 'Use `/enablecommands` to enable it first.')],
        flags: 64,
      });
    }

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
            { label: 'Done', value: 'setup_done' }
          )
      );

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Anti-Promoting Setup')
      .setDescription('Manage whitelisted invite links and staff bypass settings.\n\n-# Tip: use `/config antipromo` for all setup options in one place.')
      .setFooter({ text: 'RPM' });

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
