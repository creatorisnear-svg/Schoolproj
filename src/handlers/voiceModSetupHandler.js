import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import VoiceModConfig from '../models/VoiceModConfig.js';
import VoiceTranscript from '../models/VoiceTranscript.js';
import { forgetVoiceModConfig } from '../cybercom/flags.js';

/**
 * The Voice moderation screen inside /setup, RPM CyberCom: where flags go,
 * what is flagged, the server's own words and phrases, who can read
 * transcripts and how long they are kept.
 */

const MAX_TERMS = 100;
const MAX_TERM_LENGTH = 60;

const CATEGORIES = [
  { value: 'slurs', key: 'flagSlurs', label: 'Slurs', description: 'The n word and other slurs, as said' },
  { value: 'self_harm', key: 'flagSelfHarm', label: 'Self harm', description: 'Someone who may hurt themselves in real life' },
  { value: 'threats', key: 'flagThreats', label: 'Real life threats', description: 'Doxxing, swatting, threats outside the game' },
  { value: 'rules', key: 'flagRules', label: 'Other Discord rule breaks', description: 'Hate against a group, sexual content with minors' },
];

const row = (c) => new ActionRowBuilder().addComponents(c);

export async function voiceModView(guild, note = '') {
  const cfg = await VoiceModConfig.findOne({ guildId: guild.id }).lean() || {};
  const on = CATEGORIES.filter((c) => cfg[c.key] !== false);
  const terms = cfg.customTerms || [];
  const roles = (cfg.readerRoleIds || []).map((r) => `<@&${r}>`).join(', ');
  const days = cfg.retentionDays || 14;

  const lines = [];
  if (note) lines.push(note, '');
  lines.push(
    'Everything said in the channels RPM CyberCom covers is transcribed. Choose what is flagged to your staff, who can read transcripts and how long they are kept.',
    '',
    `**Flags go to:** ${cfg.flagChannelId ? `<#${cfg.flagChannelId}>` : 'nowhere yet. Pick a channel in the first menu to turn flagging on.'}`,
    `**Flagged:** ${on.length ? on.map((c) => c.label).join(', ') : 'only your own words and phrases'}`,
    `**Your words and phrases:** ${terms.length ? `${terms.length}: ${terms.slice(0, 8).map((t) => `||${t}||`).join(', ')}${terms.length > 8 ? ' and more' : ''}` : 'none yet'}`,
    `**Who can read transcripts and flags:** ${roles || 'your staff (admins and people added with /staff)'}`,
    `**Kept for:** ${days} days`,
    '',
    '-# Slurs and your own words are matched as said. Self harm, threats and rule breaks are checked by AI first, so roleplay is not flagged. Self harm and threat flags ping the roles that can read transcripts.',
  );
  const embed = new EmbedBuilder().setColor(0x2d2d2d).setTitle('RPM CyberCom: Voice moderation')
    .setDescription(lines.join('\n').slice(0, 4000)).setFooter({ text: 'RPM · Pick a menu to change a setting' });

  const channelMenu = new ChannelSelectMenuBuilder().setCustomId('cybercom_vmod_channel')
    .setPlaceholder('Channel for flags (none: flagging off)').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
  if (cfg.flagChannelId && guild.channels.cache.has(cfg.flagChannelId)) channelMenu.setDefaultChannels(cfg.flagChannelId);

  const roleMenu = new RoleSelectMenuBuilder().setCustomId('cybercom_vmod_readers')
    .setPlaceholder('Roles that can read transcripts (none: your staff)').setMinValues(0).setMaxValues(10);
  const keepRoles = (cfg.readerRoleIds || []).filter((r) => guild.roles?.cache?.has(r));
  if (keepRoles.length) roleMenu.setDefaultRoles(...keepRoles);

  const retention = new StringSelectMenuBuilder().setCustomId('cybercom_vmod_retention').setPlaceholder('How long transcripts are kept')
    .addOptions([3, 7, 14].map((d) => ({ label: `Keep transcripts ${d} days`, value: String(d), default: days === d })));

  const flags = new StringSelectMenuBuilder().setCustomId('cybercom_vmod_flags').setPlaceholder('What to flag')
    .setMinValues(0).setMaxValues(CATEGORIES.length)
    .addOptions(CATEGORIES.map((c) => ({ label: c.label, value: c.value, description: c.description, default: cfg[c.key] !== false })));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cybercom_vmod_words').setLabel('Your words and phrases').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cybercom_vmod_back').setLabel('Back to RPM CyberCom').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row(channelMenu), row(roleMenu), row(retention), row(flags), buttons] };
}

/** Words and phrases as typed: one per line, trimmed, no repeats, capped. */
export function parseTerms(raw) {
  const seen = new Set();
  const terms = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const term = line.trim().replace(/\s+/g, ' ').slice(0, MAX_TERM_LENGTH);
    const k = term.toLowerCase();
    if (term.length < 2 || seen.has(k)) continue;
    seen.add(k);
    terms.push(term);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

/** Everything on the screen. The caller has checked Manage Server. */
export async function handleVoiceMod(interaction) {
  const id = interaction.customId;
  const guild = interaction.guild;

  if (id === 'cybercom_vmod_open') return interaction.update(await voiceModView(guild));
  if (id === 'cybercom_vmod_back') {
    const { cyberComView } = await import('./cybercomSetupHandler.js');
    return interaction.update(await cyberComView(guild, '', interaction.member));
  }
  if (id === 'cybercom_vmod_words') {
    const cfg = await VoiceModConfig.findOne({ guildId: guild.id }).lean() || {};
    const input = new TextInputBuilder().setCustomId('terms').setLabel('One per line. Leave it empty to clear them.')
      .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000);
    const current = (cfg.customTerms || []).join('\n').slice(0, 4000);
    if (current) input.setValue(current);
    return interaction.showModal(new ModalBuilder().setCustomId('cybercom_vmod_words_modal')
      .setTitle('Words and phrases to flag').addComponents(row(input)));
  }

  const cfg = await VoiceModConfig.findOne({ guildId: guild.id }) || new VoiceModConfig({ guildId: guild.id });
  let note = '**Saved.**';
  if (id === 'cybercom_vmod_channel') {
    const chId = interaction.values?.[0] || null;
    cfg.flagChannelId = chId;
    if (chId) {
      const ch = guild.channels.cache.get(chId);
      const me = guild.members.me;
      const ok = ch && me && ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
      note = ok ? `**Flags will be posted in <#${chId}>.**` : `**Saved, but RPM cannot post in <#${chId}>.** Give it View Channel, Send Messages and Embed Links there.`;
    } else {
      note = '**Flagging is off.** Pick a channel to turn it back on.';
    }
  } else if (id === 'cybercom_vmod_readers') {
    cfg.readerRoleIds = interaction.values || [];
    note = cfg.readerRoleIds.length
      ? '**Saved.** Only these roles, and admins, can read transcripts and flags now.'
      : '**Saved.** Your staff can read transcripts and flags.';
  } else if (id === 'cybercom_vmod_retention') {
    const days = [3, 7, 14].includes(Number(interaction.values?.[0])) ? Number(interaction.values[0]) : 14;
    cfg.retentionDays = days;
    // The lines already kept follow the new setting too.
    await VoiceTranscript.collection.updateMany({ guildId: guild.id }, [{ $set: { expireAt: { $add: ['$at', days * 86400000] } } }]);
    note = `**Transcripts are kept ${days} days now**, the ones already saved included.`;
  } else if (id === 'cybercom_vmod_flags') {
    const chosen = new Set(interaction.values || []);
    for (const c of CATEGORIES) cfg[c.key] = chosen.has(c.value);
  } else if (id === 'cybercom_vmod_words_modal') {
    cfg.customTerms = parseTerms(interaction.fields.getTextInputValue('terms'));
    const n = cfg.customTerms.length;
    note = n ? `**Saved ${n} ${n === 1 ? 'word or phrase' : 'words and phrases'}.**` : '**Your words and phrases are cleared.**';
  } else {
    return null;
  }
  cfg.updatedBy = interaction.user.id;
  cfg.updatedAt = new Date();
  await cfg.save();
  forgetVoiceModConfig(guild.id);
  return interaction.update(await voiceModView(guild, note));
}
