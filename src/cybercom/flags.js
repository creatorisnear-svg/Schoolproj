import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import VoiceModConfig from '../models/VoiceModConfig.js';
import VoiceTranscript from '../models/VoiceTranscript.js';

/**
 * Voice flagging for RPM CyberCom. Every transcribed line is checked:
 *
 *  - slurs, hate, and the server's own words and phrases: matched as said,
 *    flagged straight away;
 *  - self harm, real life threats, sexual content involving minors: a
 *    keyword match first, then the AI decides whether it is real or roleplay.
 *    In a GTA roleplay server "I'm going to kill you" in a robbery is the
 *    game, so keywords alone would flag all evening.
 *
 * Flags go to the server's flag channel with a button that shows what was
 * said around the line. Self harm and threats ping the transcript roles.
 */

// ── Settings ────────────────────────────────────────────────────────────────

const cache = new Map();
export async function getVoiceModConfig(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < 30000) return hit.cfg;
  const cfg = await VoiceModConfig.findOne({ guildId }).lean().catch(() => null);
  cache.set(guildId, { at: Date.now(), cfg });
  return cfg;
}
export function forgetVoiceModConfig(guildId) { cache.delete(guildId); }
export async function retentionDays(guildId) {
  return (await getVoiceModConfig(guildId))?.retentionDays || 14;
}

/** Who may read transcripts and flags: admins, then the roles set, else staff. */
export async function canReadTranscripts(interaction) {
  const { isAdmin, checkStaffPermission } = await import('../utils/permissions.js');
  if (await isAdmin(interaction.member)) return true;
  const cfg = await getVoiceModConfig(interaction.guildId);
  if (cfg?.readerRoleIds?.length) {
    return !!interaction.member?.roles?.cache?.some((r) => cfg.readerRoleIds.includes(r.id));
  }
  return checkStaffPermission(interaction);
}

// ── Matching ────────────────────────────────────────────────────────────────

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SLURS = [
  /\bn[i1y]gg+(?:a|ah|as|az|uh|uhs|er|ers|ur|urs|let|lets|s)?\b/,   // not "Niger" or "Nigeria"
  /\bfagg?(?:ot|ots|it|its|s)?\b/,
  /\bretard(?:s|ed)?\b/,
  /\btrann(?:y|ie|ies)\b/,
  /\bchinks?\b/, /\bspics?\b/, /\bkikes?\b/, /\bwetbacks?\b/, /\bbeaners?\b/, /\bgooks?\b/,
  /\b(?:towel|rag) ?heads?\b/, /\bdykes?\b/,
];
// Hate against a group: against Discord's rules however it is meant.
const HATE = /\b(?:heil hitler|sieg heil|white power|gas the jews|kill all (?:the )?(?:jews|blacks|black people|muslims|gays|gay people|trans people))\b/;
// Worth a closer look; the AI decides whether it is real.
const SELF_HARM = /\b(?:kill(?:ing)? my ?self|kms|k m s|suicid(?:e|al)|end(?:ing)? my (?:own )?life|end it all|(?:want|wanna) (?:to )?die|don't want to (?:live|be alive|be here)|hurt(?:ing)? my ?self|cut(?:ting)? my ?self|self ?harm|not worth living|better off dead|take my (?:own )?life|hang my ?self)\b/;
const THREAT = /\b(?:i know where you live|(?:find|found|get|have) your (?:real )?(?:address|house|ip|location)|your (?:real )?address|doxx?(?:ed|ing)?|swat(?:ting|ted)? (?:you|your|him|her)|send (?:the )?swat|irl|in real life|real life|ip address|ddos|shoot up (?:the|a|my|your) (?:school|church|mall)|bomb (?:the|a|my|your) (?:school|house)|come to your (?:house|school|work))\b/;
const MINORS = /\b(?:underage|minors?|kids?|child|children|\d{1,2} ?(?:yo|year old|years old))\b/;
const SEXUAL = /\b(?:sex|sexy|nudes?|naked|send pics|hook ?up)\b/;

function termIn(t, terms) {
  for (const raw of terms || []) {
    const term = norm(raw);
    if (!term) continue;
    const re = new RegExp(`(?:^| )${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' +')}(?: |$)`);
    if (re.test(t)) return raw;
  }
  return null;
}

/**
 * What a line could be flagged for: [{ category, direct, term? }]. direct
 * means flag as is; the rest go to the AI. Pure, for the tests.
 */
export function matchLine(text, cfg = {}) {
  const t = norm(text);
  if (!t) return [];
  const on = (k) => cfg[k] !== false;
  const out = [];
  if (on('flagSlurs') && SLURS.some((re) => re.test(t))) out.push({ category: 'slur', direct: true });
  if (on('flagRules') && HATE.test(t)) out.push({ category: 'rules', direct: true });
  const term = termIn(t, cfg.customTerms);
  if (term) out.push({ category: 'custom', direct: true, term });
  if (on('flagSelfHarm') && SELF_HARM.test(t)) out.push({ category: 'self_harm', direct: false });
  if (on('flagThreats') && THREAT.test(t)) out.push({ category: 'threat', direct: false });
  if (on('flagRules') && !out.some((m) => m.category === 'rules') && MINORS.test(t) && SEXUAL.test(t)) {
    out.push({ category: 'rules', direct: false });
  }
  return out;
}

// ── The AI check ────────────────────────────────────────────────────────────

const AI_SYSTEM = [
  'You check one line of voice chat from a Discord server where people play GTA roleplay.',
  'Roleplay is allowed and is never flagged: crimes, robberies, gunfights, police scenes, 911 calls, threats between characters, characters dying.',
  'Flag only real life problems, said out of character:',
  'self_harm: the speaker may hurt or kill themselves in real life. When it could be real, flag it.',
  'threat: a real life threat against a real person, like finding where they live, doxxing, swatting, or hurting them outside the game.',
  'rules: sexual content involving minors, or hate against a group of people.',
  'Reply with JSON only: {"flag": true or false, "category": "self_harm" or "threat" or "rules", "reason": "a few words"}',
].join('\n');

// A busy server cannot run up the bill: past this many checks an hour,
// candidates are flagged unchecked for staff to judge.
const AI_CHECKS_PER_HOUR = 60;
const checks = new Map();

async function aiVerdict(doc, category) {
  const hour = Math.floor(Date.now() / 3600000);
  const used = checks.get(doc.guildId);
  const n = used?.hour === hour ? used.n : 0;
  if (n >= AI_CHECKS_PER_HOUR) return { flag: true, category, unchecked: 'the hourly limit of checks was reached' };
  checks.set(doc.guildId, { hour, n: n + 1 });
  try {
    const before = await VoiceTranscript.find({
      guildId: doc.guildId, channelId: doc.channelId,
      at: { $lt: doc.at, $gte: new Date(new Date(doc.at).getTime() - 5 * 60000) },
    }).sort({ at: -1 }).limit(4).lean();
    const context = before.reverse().map((l) => `${l.username || 'Someone'}: ${l.text}`).join('\n') || '(nothing)';
    const { askAIForJSON } = await import('../handlers/dispatchHandler.js');
    const answer = await askAIForJSON(doc.guildId, AI_SYSTEM,
      `Earlier in the channel:\n${context}\n\nThe line to check (possibly ${category.replace('_', ' ')}), said by ${doc.username || 'someone'}:\n"${doc.text}"`);
    return {
      flag: answer?.flag === true,
      category: ['self_harm', 'threat', 'rules'].includes(answer?.category) ? answer.category : category,
      reason: String(answer?.reason || '').slice(0, 120),
    };
  } catch (err) {
    // No answer: flag it and say so, rather than miss something real.
    console.warn('[CyberCom] voice flag AI check failed:', err.message);
    return { flag: true, category, unchecked: 'the check did not answer' };
  }
}

// ── Posting ─────────────────────────────────────────────────────────────────

const KIND = {
  slur: { title: 'Slur', color: 0xed4245, hide: true },
  custom: { title: 'Server word or phrase', color: 0x5865f2, hide: true },
  rules: { title: 'Against Discord rules', color: 0xed4245, hide: true },
  self_harm: { title: 'Possible self harm', color: 0xfaa61a, urgent: true },
  threat: { title: 'Real life threat', color: 0xed4245, urgent: true },
};

const clean = (s) => String(s || '').replace(/[*_`~|>\\]/g, '').slice(0, 300);
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

// The same person flagged for the same thing within a few minutes updates
// one message instead of posting another.
const recent = new Map();
const SAME_FLAG_MS = 5 * 60000;

function flagEmbed(doc, kind, verdict, entry) {
  const lines = [`<@${doc.userId}> in <#${doc.channelId}>`, '', ...entry.lines.slice(-5)];
  if (entry.count > 1) lines.push('', `-# Said ${entry.count} times in the last few minutes.`);
  if (entry.term) lines.push(`-# Matches your word or phrase: ||${clean(entry.term)}||`);
  if (verdict.reason) lines.push(`-# AI check: ${clean(verdict.reason)}`);
  if (verdict.unchecked) lines.push(`-# Not checked by AI (${verdict.unchecked}), so it may be roleplay.`);
  if (verdict.category === 'self_harm') {
    lines.push('', 'Check on them privately. If they may be in danger, contact local emergency services. In the US and Canada they can call or text 988.');
  }
  return new EmbedBuilder().setColor(kind.color).setTitle('Voice flag: ' + kind.title)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'RPM CyberCom voice moderation' }).setTimestamp(new Date(doc.at));
}

async function postFlag(doc, cfg, verdict, match) {
  const { mainGuild } = await import('./stops.js');
  const channel = mainGuild(doc.guildId)?.channels.cache.get(cfg.flagChannelId);
  if (!channel?.isTextBased?.()) return null;
  const kind = KIND[verdict.category] || KIND.rules;
  const line = `<t:${unix(doc.at)}:T> ${kind.hide ? `||${clean(doc.text)}||` : clean(doc.text)}`;
  const key = `${doc.guildId}:${doc.userId}:${verdict.category}`;

  const prev = recent.get(key);
  if (prev && Date.now() - prev.at < SAME_FLAG_MS) {
    prev.lines.push(line);
    prev.count++;
    prev.at = Date.now();
    await prev.message.edit({ embeds: [flagEmbed(prev.doc, kind, verdict, prev)] }).catch(() => {});
    return prev.message;
  }
  const entry = { doc, lines: [line], count: 1, at: Date.now(), term: match?.term || null };
  const ping = kind.urgent && cfg.readerRoleIds?.length ? cfg.readerRoleIds : [];
  const message = await channel.send({
    content: ping.length ? ping.map((r) => `<@&${r}>`).join(' ') : undefined,
    embeds: [flagEmbed(doc, kind, verdict, entry)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId(`cybercom_flagctx_${doc._id}`).setLabel('What was said around it').setStyle(ButtonStyle.Secondary))],
    allowedMentions: { roles: ping },
  }).catch((err) => { console.warn('[CyberCom] voice flag not posted:', err.message); return null; });
  if (!message) return null;
  entry.message = message;
  recent.set(key, entry);
  if (recent.size > 500) {
    for (const [k, v] of recent) if (Date.now() - v.at > SAME_FLAG_MS) recent.delete(k);
  }
  return message;
}

/** Called for every line saved. Nothing happens without a flag channel set. */
export async function checkLine(doc) {
  try {
    const cfg = await getVoiceModConfig(doc.guildId);
    if (!cfg?.flagChannelId) return [];
    const posted = [];
    for (const match of matchLine(doc.text, cfg)) {
      const verdict = match.direct ? { flag: true, category: match.category } : await aiVerdict(doc, match.category);
      if (!verdict.flag) continue;
      const message = await postFlag(doc, cfg, verdict, match);
      if (message) posted.push(verdict.category);
    }
    return posted;
  } catch (err) {
    console.warn('[CyberCom] voice flag check failed:', err.message);
    return [];
  }
}

/** The "What was said around it" button on a flag. */
export async function handleFlagContext(interaction) {
  if (!(await canReadTranscripts(interaction))) {
    return interaction.reply({ content: 'Only the people this server lets read voice transcripts can see this.', flags: 64 });
  }
  const id = interaction.customId.replace('cybercom_flagctx_', '');
  const doc = await VoiceTranscript.findById(id).lean().catch(() => null);
  if (!doc) return interaction.reply({ content: 'That line is no longer kept: transcripts are deleted after the time this server keeps them.', flags: 64 });
  const at = new Date(doc.at).getTime();
  const around = await VoiceTranscript.find({
    guildId: doc.guildId, channelId: doc.channelId, at: { $gte: new Date(at - 3 * 60000), $lte: new Date(at + 3 * 60000) },
  }).sort({ at: 1 }).limit(40).lean();
  const text = around.map((l) => `\`${new Date(l.at).toISOString().slice(11, 19)}\` **${clean(l.username || 'Unknown')}**: ${clean(l.text)}${String(l._id) === id ? ' **(flagged)**' : ''}`).join('\n');
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Around the flagged line')
      .setDescription(`<#${doc.channelId}>, three minutes either side. Times are UTC.\n\n${text}`.slice(0, 4000))
      .setFooter({ text: 'RPM CyberCom voice moderation' })],
    flags: 64,
    allowedMentions: { parse: [] },
  });
}
