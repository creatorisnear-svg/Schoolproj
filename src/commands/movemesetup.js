import { SlashCommandBuilder, ChannelType, ActionRowBuilder, ChannelSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('movemesetup')
  .setDescription('Send or refresh the Member Movement panel (Admin/Staff)')
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Text channel to post the movement panel in')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'membermovement');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Member Movement')],
      flags: 64,
    });
  }

  const config = await MemberMovementConfig.findOne({ guildId: interaction.guildId });

  if (!config?.enabled) {
    return interaction.reply({
      embeds: [errorEmbed(
        'Member Movement Not Enabled',
        'Use `/enablecommands` → **Enable Features** → **Member Movement** to enable this feature first.'
      )],
      flags: 64,
    });
  }

  const channel = interaction.options.getChannel('channel');

  const panelEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Voice Channel Mover')
    .setDescription(
      'Select a voice channel from the menu below to be instantly moved to it.\n\n' +
      '**You must already be connected to a voice channel to use this.**\n\n' +
      '-# Be aware: moving you may interrupt your PlayStation voice chat or cause audio issues.'
    )
    .setFooter({ text: 'RPM' });

  const allowedIds = config.allowedChannelIds || [];
  let selectRow;
  if (allowedIds.length > 0) {
    const options = [];
    for (const chId of allowedIds) {
      const vc = interaction.guild.channels.cache.get(chId);
      if (vc) options.push(new StringSelectMenuOptionBuilder().setLabel(vc.name).setValue(vc.id));
    }
    if (options.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('None of the configured allowed voice channels exist in this server. Update them in the dashboard first.')],
        flags: 64,
      });
    }
    selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('membermove_panel_select')
        .setPlaceholder('Choose a voice channel...')
        .addOptions(options.slice(0, 25))
        .setMinValues(1).setMaxValues(1)
    );
  } else {
    selectRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('membermove_panel_select')
        .setPlaceholder('Choose a voice channel...')
        .addChannelTypes(ChannelType.GuildVoice)
        .setMinValues(1).setMaxValues(1)
    );
  }

  try {
    const panelMsg = await channel.send({
      embeds: [panelEmbed],
      components: [selectRow],
    });

    let dbConfig = config;
    dbConfig.panelChannelId = channel.id;
    dbConfig.panelMessageId = panelMsg.id;
    await dbConfig.save();

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#43b581')
          .setTitle('Panel Sent')
          .setDescription(`Member Movement panel posted in <#${channel.id}>.\n\nMembers can now use it to move themselves between voice channels.`)
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  } catch (err) {
    console.error('[MemberMovement] Failed to send panel:', err.message);
    return interaction.reply({
      embeds: [errorEmbed('Failed to send the panel. Make sure I have permission to send messages in that channel.')],
      flags: 64,
    });
  }
}
