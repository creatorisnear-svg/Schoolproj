import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('blacklistconfig')
  .setDescription('Configure the server blacklist system (Admin/Staff, Premium)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'blacklist');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Blacklist System')],
      flags: 64,
    });
  }

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('blacklist_config_menu')
      .setPlaceholder('Select a setup option...')
      .addOptions([
        { label: 'Set Panel Channel', value: 'set_panel_channel', description: 'Choose which channel the blacklist panel is posted in' },
        { label: 'Post / Refresh Panel', value: 'post_panel', description: 'Send or update the blacklist panel in the configured channel' },
        { label: 'View Blacklist', value: 'view_blacklist', description: 'See all currently blacklisted entries' },
      ])
  );

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Blacklist System Setup')
        .setDescription('Configure the blacklist panel and channel. The panel auto-updates whenever someone is blacklisted.')
        .setFooter({ text: 'RPM' }),
    ],
    components: [menu],
    flags: 64,
  });
}
