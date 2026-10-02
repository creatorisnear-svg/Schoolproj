import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits,
} from 'discord.js';
import CyberComConfig from '../models/CyberComConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { backRow } from '../utils/setupNav.js';
import { cyberComSubscribed, isCyberComActive, clearCyberComCache } from '../cybercom/access.js';
import { allHelpers, helperCount, inviteUrl } from '../cybercom/helpers.js';
import { forgetConfig } from '../cybercom/coordinator.js';
import { TRANSCRIPT_DAYS } from '../models/VoiceTranscript.js';

/**
 * The RPM CyberCom screen inside /setup: status, the helper bots to add, and
 * which voice channels it covers. Plus the buttons on CyberCom's own messages
 * (move me into a stop, move me back, attach me to a 10-80).
 */

const SITE = 'https://roleplaymanager.xyz';
const mentions = (ids) => (ids || []).map((id) => `<#${id}>`).join(', ') || 'none';

export async function cyberComView(guild, note = '') {
  const [subscribed, active, cfg, dc] = await Promise.all([
    cyberComSubscribed(guild.id).catch(() => false),
    isCyberComActive(guild.id).catch(() => false),
    CyberComConfig.findOne({ guildId: guild.id }).lean(),
    DispatchConfig.findOne({ guildId: guild.id }).lean(),
  ]);
  const helpers = allHelpers();
  const added = helpers.filter((h) => h.client.guilds.cache.has(guild.id));
  const missing = helpers.filter((h) => !h.client.guilds.cache.has(guild.id));

  const lines = [];
  if (note) lines.push(note, '');
  lines.push(
    'A bot in every voice channel. Officers run traffic stops by voice ("Dispatch, show me on a 10-11 with Blade"), the person pulled over is asked if they want to be moved in, plates and names are run inside the stop, and a 10-80 goes out on the radio so units can say "Dispatch, attach me to the 10-80". Civilians say "RPM, move me to" and a name to join someone.',
    '',
  );
  if (active) lines.push('**Status:** on');
  else if (subscribed) lines.push('**Status:** bought, but this server needs Premium for it to work. Run `/premium`.');
  else lines.push('**Status:** off. RPM CyberCom is $9.99 a month on top of Premium.');
  lines.push('');

  if (helperCount()) {
    lines.push(`**Helper bots:** ${added.length} of ${helpers.length} added. Each covers one busy channel at a time.`);
    if (missing.length) lines.push(missing.map((h) => `[Add RPM CyberCom ${h.index}](${inviteUrl(h)})`).join(' · '));
  } else {
    lines.push('**Helper bots:** not available yet.');
  }
  lines.push(
    '',
    `**Civilian channels** (they answer to "RPM"): ${mentions(cfg?.civilianChannelIds)}`,
    `**Traffic stop channels:** ${mentions(dc?.trafficStopChannelIds)}`,
    `**Extra police radios** (they answer to "dispatch"): ${mentions(cfg?.radioChannelIds)}`,
    `**Greeting people who join:** ${cfg?.greet === false ? 'off' : 'on'}`,
    '',
    `-# Everything said in these channels is transcribed, and people are told when they join. Staff read it with \`/voicemoderation\`. Transcripts are deleted after ${TRANSCRIPT_DAYS} days.`,
  );

  const embed = new EmbedBuilder().setColor(0x2d2d2d).setTitle('RPM CyberCom').setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'RPM · Pick a menu to change which channels it covers' });

  const pick = (id, placeholder, selected) => {
    const menu = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildVoice).setMinValues(0).setMaxValues(25);
    const keep = (selected || []).filter((c) => guild.channels.cache.has(c)).slice(0, 25);
    if (keep.length) menu.setDefaultChannels(...keep);
    return new ActionRowBuilder().addComponents(menu);
  };

  const buttons = [];
  if (!subscribed) {
    buttons.push(new ButtonBuilder().setLabel('Get RPM CyberCom').setStyle(ButtonStyle.Link).setURL(`${SITE}/pricing?from=cybercom&guild=${guild.id}#cybercom`));
  }
  buttons.push(new ButtonBuilder().setCustomId('cybercom_greet').setLabel(cfg?.greet === false ? 'Turn greetings on' : 'Turn greetings off').setStyle(ButtonStyle.Secondary));

  return {
    embeds: [embed],
    components: [
      pick('cybercom_civ', 'Civilian voice channels', cfg?.civilianChannelIds),
      pick('cybercom_stops', 'Traffic stop voice channels', dc?.trafficStopChannelIds),
      pick('cybercom_radio', 'Extra police radio channels', cfg?.radioChannelIds),
      new ActionRowBuilder().addComponents(...buttons),
      backRow(),
    ],
  };
}

export async function handleCyberCom(interaction) {
  const id = interaction.customId;
  if (/^cybercom_(join|stay|back|attach)_/.test(id)) return handleCyberComButton(interaction);
  if (!interaction.inGuild()) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Only members with the Manage Server permission can change RPM CyberCom.', flags: 64 });
  }
  const guild = interaction.guild;
  let note = '';
  const values = interaction.values || [];
  if (id === 'cybercom_civ' || id === 'cybercom_radio') {
    const cfg = await CyberComConfig.findOne({ guildId: guild.id }) || new CyberComConfig({ guildId: guild.id });
    const dc = await DispatchConfig.findOne({ guildId: guild.id }).lean();
    const taken = new Set([...(dc?.patrolChannelIds || []), ...(dc?.trafficStopChannelIds || [])]);
    const chosen = values.filter((v) => !taken.has(v));
    if (id === 'cybercom_civ') {
      cfg.civilianChannelIds = chosen;
      cfg.radioChannelIds = (cfg.radioChannelIds || []).filter((c) => !chosen.includes(c));
      note = '**Civilian channels saved.**';
    } else {
      cfg.radioChannelIds = chosen;
      cfg.civilianChannelIds = (cfg.civilianChannelIds || []).filter((c) => !chosen.includes(c));
      note = '**Extra police radios saved.**';
    }
    if (chosen.length < values.length) note += ' Channels the dispatcher already uses were left out.';
    cfg.updatedBy = interaction.user.id;
    cfg.updatedAt = new Date();
    await cfg.save();
  } else if (id === 'cybercom_stops') {
    await DispatchConfig.findOneAndUpdate({ guildId: guild.id }, { $set: { trafficStopChannelIds: values } }, { upsert: true });
    await CyberComConfig.updateOne({ guildId: guild.id }, { $pull: { civilianChannelIds: { $in: values }, radioChannelIds: { $in: values } } });
    note = '**Traffic stop channels saved.**';
  } else if (id === 'cybercom_greet') {
    const cfg = await CyberComConfig.findOne({ guildId: guild.id }) || new CyberComConfig({ guildId: guild.id });
    cfg.greet = cfg.greet === false;
    await cfg.save();
    note = cfg.greet ? '**Greetings on.**' : '**Greetings off.** The helper\'s name still says "(transcribing)" in the channel, but tell your members their voice channels are transcribed.';
  }
  forgetConfig(guild.id);
  clearCyberComCache(guild.id);
  return interaction.update(await cyberComView(guild, note));
}

/** Buttons on CyberCom's own messages. */
async function handleCyberComButton(interaction) {
  const [, action, stopId] = interaction.customId.split('_');
  const stops = await import('../cybercom/stops.js');
  const CyberComStop = (await import('../models/CyberComStop.js')).default;
  const stop = await CyberComStop.findById(stopId).lean().catch(() => null);
  if (!stop) return interaction.reply({ content: 'That stop is over.', flags: 64 });
  const guild = interaction.guild;

  if (action === 'join' || action === 'stay') {
    if (interaction.user.id !== stop.subjectId) return interaction.reply({ content: 'This question is for someone else.', flags: 64 });
    if (action === 'stay') return interaction.update({ components: [] });
    const ok = await stops.joinStop(guild, stopId, interaction.user.id);
    return ok
      ? interaction.update({ components: [] })
      : interaction.reply({ content: 'I could not move you. Join a voice channel first, or the stop has ended.', flags: 64 });
  }
  if (action === 'back') {
    const ok = await stops.moveBack(guild, stopId, interaction.user.id);
    return interaction.reply({ content: ok ? 'Moved you back.' : 'I could not move you back. You were not in this stop, or that channel is gone.', flags: 64 });
  }
  if (action === 'attach') {
    const member = interaction.member;
    if (!(await stops.isLeo(guild, member))) return interaction.reply({ content: 'Only officers can attach to a 10-80.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    let said = '';
    await stops.attachToPursuit({ guild, member, stopId, reply: async (text) => { said = text; } });
    return interaction.editReply({ content: said || 'Done.' });
  }
  return null;
}
