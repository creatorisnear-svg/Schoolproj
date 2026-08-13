import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import Sticky from '../models/Sticky.js';
import { errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('stickylist')
  .setDescription('View all active sticky messages on this server (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  try {
    const stickies = await Sticky.find({ guildId: interaction.guildId });

    if (stickies.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Sticky Messages', 'No sticky messages found.')],
        flags: 64,
      });
    }

    let description = '';
    
    for (let i = 0; i < stickies.length; i++) {
      const sticky = stickies[i];
      const channel = await interaction.guild.channels.fetch(sticky.channelId).catch(() => null);
      const channelName = channel ? `<#${sticky.channelId}>` : 'Unknown Channel';
      
      const preview = sticky.messageContent.substring(0, 60);
      const truncated = sticky.messageContent.length > 60 ? '...' : '';
      
      description += `\`${i + 1}.\` ${channelName}\n`;
      description += `-# "${preview}${truncated}" · ${sticky.messageCount} posts\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Sticky Messages')
      .setDescription(description)
      .setFooter({ text: `RPM · ${stickies.length} total` });

    if (stickies.length > 0) {
      const options = stickies.map((sticky, index) => ({
        label: `${index + 1}. ${sticky.messageContent.substring(0, 50)}...`,
        value: `delete_${index}`,
        description: 'Delete this sticky message'
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('stickylist_delete_menu')
        .setPlaceholder('Select a sticky to delete...')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: 64,
      });
    }

    return interaction.reply({
      embeds: [embed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in sticky list command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while fetching sticky messages.')],
      flags: 64,
    });
  }
}
