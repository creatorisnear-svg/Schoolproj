import { ActionRowBuilder, ChannelSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';

function setupMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('movemesetup_menu')
      .setPlaceholder('Choose a setup option...')
      .addOptions([
        { label: 'Add Allowed Channel',    description: 'Restrict the panel to specific voice channels', value: 'add_channel' },
        { label: 'Remove Allowed Channel', description: 'Remove a channel from the allowed list',        value: 'remove_channel' },
        { label: 'View Allowed Channels',  description: 'See which channels are currently allowed',      value: 'view_channels' },
        { label: 'Clear Channel Filter',   description: 'Allow all voice channels in the panel',         value: 'clear_filter' },
        { label: 'Send Panel',             description: 'Post the voice mover panel to a text channel',  value: 'send_panel' },
        { label: 'Done - Close Setup',     description: 'Close this setup menu',                         value: 'setup_done' },
      ])
  );
}

function statusLine(config) {
  const chCount = (config?.allowedChannelIds || []).length;
  const panelStatus = config?.panelChannelId
    ? `Panel channel: <#${config.panelChannelId}>${config?.panelMessageId ? ' - panel active' : ' - not sent yet'}`
    : 'No panel channel set';
  return `**Voice Mover Setup**\n\n${panelStatus}\nAllowed channels: ${chCount > 0 ? chCount + ' configured' : 'all channels (no filter set)'}\n\nSelect an option below to configure:`;
}

/* ── Main menu dispatch ── */
export async function handleMovemeSetupMenu(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('Staff only.')], flags: 64 });
  }

  const value = interaction.values[0];
  const guildId = interaction.guildId;
  let config = await MemberMovementConfig.findOne({ guildId });
  if (!config) config = new MemberMovementConfig({ guildId });

  /* add_channel → show voice ChannelSelect */
  if (value === 'add_channel') {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('movemesetup_add_vc')
        .setPlaceholder('Pick a voice channel to allow...')
        .addChannelTypes(ChannelType.GuildVoice)
        .setMinValues(1).setMaxValues(1)
    );
    return interaction.update({
      content: '**Voice Mover Setup - Add Channel**\n\nSelect the voice channel you want to add to the allowed list:',
      components: [row],
    });
  }

  /* remove_channel → show current allowed as string select */
  if (value === 'remove_channel') {
    const ids = config.allowedChannelIds || [];
    if (ids.length === 0) {
      return interaction.update({
        content: statusLine(config) + '\n\n> No channels in the allowed list to remove.',
        components: [setupMenu()],
      });
    }
    const options = ids.map(id => {
      const ch = interaction.guild.channels.cache.get(id);
      return new StringSelectMenuOptionBuilder().setLabel(ch ? ch.name : `Unknown (${id})`).setValue(id);
    });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('movemesetup_remove_vc')
        .setPlaceholder('Pick a channel to remove...')
        .addOptions(options.slice(0, 25))
        .setMinValues(1).setMaxValues(1)
    );
    return interaction.update({
      content: '**Voice Mover Setup - Remove Channel**\n\nSelect the voice channel to remove from the allowed list:',
      components: [row],
    });
  }

  /* view_channels → show list and return to menu */
  if (value === 'view_channels') {
    const ids = config.allowedChannelIds || [];
    let listText;
    if (ids.length === 0) {
      listText = '> No filter set - all voice channels will show in the panel.';
    } else {
      listText = ids.map(id => {
        const ch = interaction.guild.channels.cache.get(id);
        return `> 🔊 **${ch ? ch.name : `Unknown (${id})`}**`;
      }).join('\n');
    }
    return interaction.update({
      content: `**Voice Mover Setup - Allowed Channels (${ids.length})**\n\n${listText}\n\nSelect another option below:`,
      components: [setupMenu()],
    });
  }

  /* clear_filter → wipe allowed list */
  if (value === 'clear_filter') {
    config.allowedChannelIds = [];
    config.markModified('allowedChannelIds');
    await config.save();
    return interaction.update({
      content: statusLine(config) + '\n\n> ✅ Channel filter cleared - all voice channels will now show in the panel.',
      components: [setupMenu()],
    });
  }

  /* send_panel → show text ChannelSelect */
  if (value === 'send_panel') {
    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('movemesetup_panel_channel')
        .setPlaceholder('Pick a text channel for the panel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMinValues(1).setMaxValues(1)
    );
    return interaction.update({
      content: '**Voice Mover Setup - Send Panel**\n\nSelect the text channel where the voice mover panel should be posted:',
      components: [row],
    });
  }

  /* setup_done */
  if (value === 'setup_done') {
    return interaction.update({ content: '✅ Voice Mover setup closed.', components: [] });
  }
}

/* ── Add voice channel confirmed ── */
export async function handleMovemeAddVC(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('Staff only.')], flags: 64 });
  }

  const vc = interaction.values[0];
  const guildId = interaction.guildId;
  const ch = interaction.guild.channels.cache.get(vc);
  let config = await MemberMovementConfig.findOne({ guildId });
  if (!config) config = new MemberMovementConfig({ guildId });
  if (!config.allowedChannelIds) config.allowedChannelIds = [];

  if (config.allowedChannelIds.includes(vc)) {
    return interaction.update({
      content: statusLine(config) + `\n\n> ⚠️ **${ch?.name ?? vc}** is already in the allowed list.`,
      components: [setupMenu()],
    });
  }

  config.allowedChannelIds.push(vc);
  config.markModified('allowedChannelIds');
  await config.save();

  return interaction.update({
    content: statusLine(config) + `\n\n> ✅ **${ch?.name ?? vc}** added to the allowed list. Re-send the panel to update it in Discord.`,
    components: [setupMenu()],
  });
}

/* ── Remove voice channel confirmed ── */
export async function handleMovemeRemoveVC(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('Staff only.')], flags: 64 });
  }

  const vcId = interaction.values[0];
  const guildId = interaction.guildId;
  const ch = interaction.guild.channels.cache.get(vcId);
  let config = await MemberMovementConfig.findOne({ guildId });
  if (!config) config = new MemberMovementConfig({ guildId });

  config.allowedChannelIds = (config.allowedChannelIds || []).filter(id => id !== vcId);
  config.markModified('allowedChannelIds');
  await config.save();

  const remaining = config.allowedChannelIds.length;
  return interaction.update({
    content: statusLine(config) + `\n\n> ✅ **${ch?.name ?? vcId}** removed. ${remaining > 0 ? `${remaining} channel(s) remain.` : 'No filter set - all channels will now show.'}`,
    components: [setupMenu()],
  });
}

/* ── Panel channel selected - build and send panel ── */
export async function handleMovemePanelChannel(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('Staff only.')], flags: 64 });
  }

  const channelId = interaction.values[0];
  const guildId = interaction.guildId;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.update({
      content: statusLine(null) + '\n\n> ❌ Channel not found.',
      components: [setupMenu()],
    });
  }

  let config = await MemberMovementConfig.findOne({ guildId });
  if (!config) config = new MemberMovementConfig({ guildId });

  const { EmbedBuilder: Embed, ActionRowBuilder: Row, ChannelSelectMenuBuilder: ChSel, StringSelectMenuBuilder: StrSel, StringSelectMenuOptionBuilder: Opt, ChannelType: CT } = await import('discord.js');

  const panelEmbed = new Embed()
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
      if (vc) options.push(new Opt().setLabel(vc.name).setValue(vc.id));
    }
    if (options.length === 0) {
      return interaction.update({
        content: statusLine(config) + '\n\n> ❌ None of the configured allowed channels exist. Add valid channels first.',
        components: [setupMenu()],
      });
    }
    selectRow = new Row().addComponents(
      new StrSel()
        .setCustomId('membermove_panel_select')
        .setPlaceholder('Choose a voice channel...')
        .addOptions(options.slice(0, 25))
        .setMinValues(1).setMaxValues(1)
    );
  } else {
    selectRow = new Row().addComponents(
      new ChSel()
        .setCustomId('membermove_panel_select')
        .setPlaceholder('Choose a voice channel...')
        .addChannelTypes(CT.GuildVoice)
        .setMinValues(1).setMaxValues(1)
    );
  }

  try {
    if (config.panelMessageId && config.panelChannelId) {
      const oldCh = interaction.guild.channels.cache.get(config.panelChannelId);
      if (oldCh) {
        const oldMsg = await oldCh.messages.fetch(config.panelMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    }

    const panelMsg = await channel.send({ embeds: [panelEmbed], components: [selectRow] });
    config.panelChannelId = channel.id;
    config.panelMessageId = panelMsg.id;
    await config.save();

    const chCount = allowedIds.length;
    return interaction.update({
      content: statusLine(config) + `\n\n> ✅ Panel posted in <#${channel.id}>. ${chCount > 0 ? `Showing ${chCount} restricted channel(s).` : 'Showing all voice channels.'}`,
      components: [setupMenu()],
    });
  } catch (err) {
    console.error('[MemberMovement] Failed to send panel:', err.message);
    return interaction.update({
      content: statusLine(config) + '\n\n> ❌ Failed to send panel - check that I have permission to post in that channel.',
      components: [setupMenu()],
    });
  }
}
