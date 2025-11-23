import { SlashCommandBuilder, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';
import Welcome from '../models/Welcome.js';
import { infoEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('welcomesystemsetup')
  .setDescription('Configure the welcome system for new members (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const existingConfig = await Welcome.findOne({ guildId: interaction.guildId });

  const textChannels = interaction.guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position)
    .first(25);

  if (textChannels.length === 0) {
    return interaction.reply({
      embeds: [errorEmbed('No text channels found in this server.')],
      ephemeral: true,
    });
  }

  const channelOptions = textChannels.map(channel =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`#${channel.name}`)
      .setDescription(`Channel ID: ${channel.id}`)
      .setValue(channel.id)
      .setDefault(existingConfig?.channelId === channel.id)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('welcome_channel_select')
    .setPlaceholder('Select the welcome channel')
    .addOptions(channelOptions);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const setupStatus = existingConfig 
    ? `✅ **Current Welcome Channel:** <#${existingConfig.channelId}>\n\n**Current Welcome Message:**\n${existingConfig.welcomeMessage}\n\n**Current Welcome DM:**\n${existingConfig.welcomeDM}\n\n---\n\nUse the dropdown below to change the welcome channel, or use \`/setwelcomemessage\` and \`/setwelcomedm\` to customize messages.`
    : '⚠️ Welcome system not configured yet.\n\nSelect a channel below to set up the welcome system.';

  const embed = infoEmbed('__**Welcome System Setup**__', setupStatus);

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}
