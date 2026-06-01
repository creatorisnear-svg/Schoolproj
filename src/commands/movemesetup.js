import { SlashCommandBuilder, ChannelType, ActionRowBuilder, ChannelSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('movemesetup')
  .setDescription('Configure the Voice Mover system (Admin/Staff)')
  .addSubcommand(sub =>
    sub
      .setName('panel')
      .setDescription('Send or refresh the Voice Mover panel in a channel')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Text channel to post the panel in').setRequired(true).addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('addchannel')
      .setDescription('Add a voice channel to the allowed list')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Voice channel to allow in the mover panel').setRequired(true).addChannelTypes(ChannelType.GuildVoice)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('removechannel')
      .setDescription('Remove a voice channel from the allowed list')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Voice channel to remove from the mover panel').setRequired(true).addChannelTypes(ChannelType.GuildVoice)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('listchannels')
      .setDescription('View all voice channels currently in the allowed list')
  )
  .addSubcommand(sub =>
    sub
      .setName('clearfilter')
      .setDescription('Remove all channel restrictions — all voice channels will show in the panel')
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

  let config = await MemberMovementConfig.findOne({ guildId: interaction.guildId });
  if (!config) config = new MemberMovementConfig({ guildId: interaction.guildId });

  const sub = interaction.options.getSubcommand();

  /* ── addchannel ── */
  if (sub === 'addchannel') {
    const vc = interaction.options.getChannel('channel');
    if (!config.allowedChannelIds) config.allowedChannelIds = [];
    if (config.allowedChannelIds.includes(vc.id)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#faa61a').setTitle('Already Added').setDescription(`**${vc.name}** is already in the allowed list.`).setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }
    config.allowedChannelIds.push(vc.id);
    config.markModified('allowedChannelIds');
    await config.save();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('Channel Added')
        .setDescription(`**${vc.name}** has been added to the Voice Mover allowed list.\n\nThe panel will now only show the ${config.allowedChannelIds.length} configured channel(s). Re-send the panel with \`/movemesetup panel\` to update it in Discord.`)
        .setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }

  /* ── removechannel ── */
  if (sub === 'removechannel') {
    const vc = interaction.options.getChannel('channel');
    if (!config.allowedChannelIds?.includes(vc.id)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#faa61a').setTitle('Not Found').setDescription(`**${vc.name}** is not in the allowed list.`).setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }
    config.allowedChannelIds = config.allowedChannelIds.filter(id => id !== vc.id);
    config.markModified('allowedChannelIds');
    await config.save();
    const remaining = config.allowedChannelIds.length;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('Channel Removed')
        .setDescription(
          `**${vc.name}** has been removed from the allowed list.\n\n` +
          (remaining > 0
            ? `${remaining} channel(s) remain in the list. Re-send the panel with \`/movemesetup panel\` to update it.`
            : 'No channels remain in the list — all voice channels will now show in the panel.')
        )
        .setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }

  /* ── listchannels ── */
  if (sub === 'listchannels') {
    const ids = config.allowedChannelIds || [];
    if (ids.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Voice Mover — Channel List')
          .setDescription('No channel filter is set. All voice channels on this server will appear in the mover panel.\n\nUse `/movemesetup addchannel` to restrict which channels are shown.')
          .setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }
    const lines = ids.map(id => {
      const ch = interaction.guild.channels.cache.get(id);
      return ch ? `🔊 **${ch.name}**` : `🔊 Unknown channel (${id})`;
    });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle(`Voice Mover — Allowed Channels (${ids.length})`)
        .setDescription(lines.join('\n') + '\n\nUse `/movemesetup addchannel` or `/movemesetup removechannel` to manage this list, or `/movemesetup clearfilter` to show all channels.')
        .setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }

  /* ── clearfilter ── */
  if (sub === 'clearfilter') {
    config.allowedChannelIds = [];
    config.markModified('allowedChannelIds');
    await config.save();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('Filter Cleared')
        .setDescription('All channel restrictions have been removed. The panel will now show all voice channels on this server.\n\nRe-send the panel with `/movemesetup panel` to update it in Discord.')
        .setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }

  /* ── panel ── */
  if (!config?.enabled) {
    return interaction.reply({
      embeds: [errorEmbed(
        'Member Movement Not Enabled',
        'Enable Voice Mover in the dashboard or use `/enablecommands` → **Enable Features** → **Member Movement** first.'
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
        embeds: [errorEmbed('None of the configured allowed voice channels exist in this server. Add valid channels with `/movemesetup addchannel` first.')],
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
    if (config.panelMessageId && config.panelChannelId) {
      const oldChannel = interaction.guild.channels.cache.get(config.panelChannelId);
      if (oldChannel) {
        const oldMsg = await oldChannel.messages.fetch(config.panelMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    }

    const panelMsg = await channel.send({ embeds: [panelEmbed], components: [selectRow] });
    config.panelChannelId = channel.id;
    config.panelMessageId = panelMsg.id;
    await config.save();

    const chCount = allowedIds.length;
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('Panel Sent')
        .setDescription(
          `Voice Mover panel posted in <#${channel.id}>.\n\n` +
          (chCount > 0
            ? `Showing **${chCount}** restricted channel(s). Use \`/movemesetup listchannels\` to review them.`
            : 'Showing all voice channels on the server.')
        )
        .setFooter({ text: 'RPM' })],
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
