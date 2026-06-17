import { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import BlacklistConfig from '../models/BlacklistConfig.js';
import Blacklist from '../models/Blacklist.js';
import VerifiedUser from '../models/VerifiedUser.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export function buildBlacklistPanelEmbed(entries) {
  const active = entries.filter(e => e.active);
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Server Blacklist')
    .setFooter({ text: `RPM - ${active.length} active entr${active.length === 1 ? 'y' : 'ies'}` })
    .setTimestamp();

  if (!active.length) {
    embed.setDescription('No blacklisted members.');
    return embed;
  }

  const lines = active.map(e => {
    const who = e.discordId ? `<@${e.discordId}>` : `\`${e.gamertag}\``;
    const tag = e.gamertag && e.discordId ? ` (${e.gamertag})` : '';
    const ipTag = e.ipBanned ? ' `IP BAN`' : '';
    const date = new Date(e.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${who}${tag}${ipTag}\n-# ${e.reason} — ${date}`;
  });

  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current.length + line.length > 1000) { chunks.push(current.trim()); current = ''; }
    current += line + '\n\n';
  }
  if (current.trim()) chunks.push(current.trim());

  chunks.forEach((chunk, i) => {
    embed.addFields({ name: i === 0 ? 'Members' : '\u200b', value: chunk });
  });

  return embed;
}

export async function updateBlacklistPanel(client, guildId) {
  try {
    const bc = await BlacklistConfig.findOne({ guildId });
    if (!bc || !bc.panelChannelId || !bc.panelMessageId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(bc.panelChannelId);
    if (!channel) return;
    const entries = await Blacklist.find({ guildId });
    const embed = buildBlacklistPanelEmbed(entries);
    const msg = await channel.messages.fetch(bc.panelMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error('[BLACKLIST] Panel update error:', err.message);
  }
}

export async function executeBlacklist(interaction, { targetUser, gamertag, reason, ipBan }) {
  await interaction.deferReply({ flags: 64 });
  try {
    const guildId = interaction.guildId;

    let resolvedIp = null;
    let discordId = targetUser?.id || null;
    let resolvedGamertag = gamertag || null;

    if (discordId && ipBan) {
      const vu = await VerifiedUser.findOne({ guildId, userId: discordId });
      if (vu?.ipAddress) resolvedIp = vu.ipAddress;
    }

    if (!resolvedGamertag && discordId) {
      const vu = await VerifiedUser.findOne({ guildId, userId: discordId });
      if (vu?.psnxbox) resolvedGamertag = vu.psnxbox;
    }

    const entry = await Blacklist.create({
      guildId,
      discordId,
      gamertag: resolvedGamertag,
      reason,
      ipBanned: ipBan,
      ipAddress: resolvedIp,
      addedBy: interaction.user.id,
    });

    if (discordId) {
      try {
        const member = await interaction.guild.members.fetch(discordId).catch(() => null);
        if (member) await member.kick(`Blacklisted: ${reason}`).catch(() => {});
      } catch (_) {}
    }

    const config = await Config.findOne({ guildId });
    if (config?.logChannelId) {
      const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Member Blacklisted')
          .addFields(
            { name: 'Added By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Target', value: discordId ? `<@${discordId}>` : `\`${resolvedGamertag}\``, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'IP Ban', value: ipBan ? 'Yes' : 'No', inline: true },
          )
          .setFooter({ text: 'RPM' })
          .setTimestamp();
        if (resolvedGamertag) logEmbed.addFields({ name: 'Gamertag', value: resolvedGamertag, inline: true });
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    await updateBlacklistPanel(interaction.client, guildId);

    const display = discordId ? `<@${discordId}>` : `\`${resolvedGamertag}\``;
    return interaction.editReply({
      embeds: [successEmbed('Blacklisted', `${display} has been blacklisted.${ipBan ? ' IP ban applied.' : ''}`)],
    });
  } catch (err) {
    console.error('[BLACKLIST] executeBlacklist error:', err.message);
    return interaction.editReply({ embeds: [errorEmbed('Something went wrong.')] });
  }
}

export async function executeRemoveBlacklist(interaction, { targetUser, gamertag }) {
  await interaction.deferReply({ flags: 64 });
  try {
    const guildId = interaction.guildId;
    const discordId = targetUser?.id || null;

    let entries = [];
    if (discordId) {
      entries = await Blacklist.find({ guildId, discordId, active: true });
    } else if (gamertag) {
      const q = gamertag.trim().toLowerCase();
      const all = await Blacklist.find({ guildId, active: true, gamertag: { $ne: null } });
      entries = all.filter(e => e.gamertag && e.gamertag.toLowerCase().includes(q));
    }

    if (!entries.length) {
      const who = discordId ? `<@${discordId}>` : `\`${gamertag}\``;
      return interaction.editReply({
        embeds: [errorEmbed(`No active blacklist entry found for ${who}.`)],
      });
    }

    for (const entry of entries) {
      await Blacklist.findByIdAndUpdate(entry._id, { active: false });
    }

    const config = await Config.findOne({ guildId });
    if (config?.logChannelId) {
      const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
      if (logChannel) {
        const display = discordId ? `<@${discordId}>` : `\`${gamertag}\``;
        const logEmbed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Blacklist Entry Removed')
          .addFields(
            { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Target', value: display, inline: true },
            { name: 'Entries Removed', value: String(entries.length), inline: true },
          )
          .setFooter({ text: 'RPM' })
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    await updateBlacklistPanel(interaction.client, guildId);

    const display = discordId ? `<@${discordId}>` : `\`${gamertag}\``;
    const plural = entries.length > 1 ? ` (${entries.length} entries)` : '';
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Blacklist Entry Removed')
        .setDescription(`${display} has been removed from the blacklist.${plural}`)
        .setFooter({ text: 'RPM' })
        .setTimestamp()],
    });
  } catch (err) {
    console.error('[BLACKLIST] executeRemoveBlacklist error:', err.message);
    return interaction.editReply({ embeds: [errorEmbed('Something went wrong.')] });
  }
}

export async function handleBlacklistConfigMenu(interaction, client) {
  const value = interaction.values[0];

  if (value === 'set_panel_channel') {
    const channelSelect = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('blacklist_panel_channel_select')
        .setPlaceholder('Select a channel for the blacklist panel')
        .setChannelTypes([0])
    );
    return interaction.update({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Select Panel Channel').setDescription('Choose the channel where the blacklist panel will be posted.').setFooter({ text: 'RPM' })],
      components: [channelSelect],
    });
  }

  if (value === 'post_panel') {
    await interaction.deferUpdate();
    try {
      const guildId = interaction.guildId;
      const bc = await BlacklistConfig.findOneAndUpdate({ guildId }, {}, { upsert: true, new: true });
      if (!bc.panelChannelId) {
        return interaction.editReply({ embeds: [errorEmbed('Set a panel channel first.')], components: [] });
      }
      const guild = client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(bc.panelChannelId);
      if (!channel) return interaction.editReply({ embeds: [errorEmbed('Panel channel not found.')], components: [] });

      const entries = await Blacklist.find({ guildId });
      const embed = buildBlacklistPanelEmbed(entries);

      if (bc.panelMessageId) {
        const old = await channel.messages.fetch(bc.panelMessageId).catch(() => null);
        if (old) {
          await old.edit({ embeds: [embed] });
          return interaction.editReply({ embeds: [successEmbed('Panel Updated', 'The blacklist panel has been refreshed.')], components: [] });
        }
      }

      const msg = await channel.send({ embeds: [embed] });
      bc.panelMessageId = msg.id;
      await bc.save();
      return interaction.editReply({ embeds: [successEmbed('Panel Posted', 'The blacklist panel has been posted.')], components: [] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed('Failed to post panel.')], components: [] });
    }
  }

  if (value === 'view_blacklist') {
    await interaction.deferUpdate();
    const entries = await Blacklist.find({ guildId: interaction.guildId, active: true });
    if (!entries.length) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Blacklist').setDescription('No active blacklist entries.').setFooter({ text: 'RPM' })], components: [] });
    }
    const lines = entries.map(e => {
      const who = e.discordId ? `<@${e.discordId}>` : `\`${e.gamertag}\``;
      const tag = e.gamertag && e.discordId ? ` (${e.gamertag})` : '';
      const ipTag = e.ipBanned ? ' `IP BAN`' : '';
      const date = new Date(e.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${who}${tag}${ipTag} — ${e.reason} — ${date}`;
    });
    const embed = new EmbedBuilder().setColor('#2d2d2d').setTitle('Active Blacklist').setDescription(lines.join('\n').slice(0, 4000)).setFooter({ text: 'RPM' });
    return interaction.editReply({ embeds: [embed], components: [] });
  }
}

export async function handleBlacklistPanelChannelSelect(interaction, client) {
  const channelId = interaction.values[0];
  const guildId = interaction.guildId;
  await BlacklistConfig.findOneAndUpdate({ guildId }, { panelChannelId: channelId }, { upsert: true, new: true });
  return interaction.update({
    embeds: [successEmbed('Panel Channel Set', `Panel channel set to <#${channelId}>. Use the menu to post the panel.`)],
    components: [],
  });
}
