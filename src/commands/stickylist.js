import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Sticky from '../models/Sticky.js';
import { errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('stickylist')
  .setDescription('View all active sticky messages on this server (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  try {
    const stickies = await Sticky.find({ guildId: interaction.guildId });

    if (stickies.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Sticky Messages', 'No sticky messages found on this server.')],
        flags: 64,
      });
    }

    // Create embed with all stickies
    let description = '**Active Sticky Messages:**\n\n';
    
    for (let i = 0; i < stickies.length; i++) {
      const sticky = stickies[i];
      const channel = await interaction.guild.channels.fetch(sticky.channelId).catch(() => null);
      const channelName = channel ? `<#${sticky.channelId}>` : 'Unknown Channel';
      
      const preview = sticky.messageContent.substring(0, 80);
      const truncated = sticky.messageContent.length > 80 ? '...' : '';
      
      description += `**${i + 1}. ${channelName}**\n`;
      description += `   📝 Message: "${preview}${truncated}"\n`;
      description += `   🆔 Message ID: ${sticky.messageId}\n`;
      description += `   👤 Created by: <@${sticky.createdBy}>\n`;
      description += `   📊 Posts: ${sticky.messageCount}\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('Sticky Messages')
      .setDescription(description)
      .setFooter({ text: `RolePlayManager | Total: ${stickies.length}` });

    // If more than one sticky, offer delete option
    if (stickies.length > 0) {
      const options = stickies.map((sticky, index) => ({
        label: `${index + 1}. ${sticky.messageContent.substring(0, 50)}...`,
        value: `delete_${index}`,
        description: `Delete this sticky message`
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
