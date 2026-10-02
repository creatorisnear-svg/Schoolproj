import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits,
} from 'discord.js';
import CyberComConfig from '../models/CyberComConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { backRow } from '../utils/setupNav.js';
import { cyberComSubscribed, isCyberComActive, clearCyberComCache } from '../cybercom/access.js';
import { hasPremiumAccess } from '../utils/premiumCheck.js';
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
const WHERE = 'in `/setup` under AI Voice Dispatch';

/**
 * Why "dispatch" might get no answer, in plain words. Every one of these used
 * to fail silently, which from the owner's chair looks like a broken bot.
 */
async function dispatchProblems(guild, dc, viewer) {
  if (!dc || !dc.enabled) return [`The AI dispatcher is off. Turn it on ${WHERE}.`];
  const out = [];
  if (!(dc.patrolChannelIds || []).length) out.push('No police radio channels are set, so the dispatcher never joins one. Pick them in the police radio menu below.');
  if (!dc.dispatchChannelId) out.push(`No dispatch channel is set, and the dispatcher does not answer without one. Set it ${WHERE}.`);

  const me = guild.members.me;
  const cantJoin = (dc.patrolChannelIds || []).filter((id) => {
    const ch = guild.channels.cache.get(id);
    return ch && me && !ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]);
  });
  if (cantJoin.length) out.push(`RPM cannot join or talk in ${mentions(cantJoin)}. Give it View Channel, Connect and Speak there.`);
  for (const [id, what] of [[dc.dispatchChannelId, 'dispatch channel'], [dc.statusBoardChannelId, 'status board channel']]) {
    const ch = id ? guild.channels.cache.get(id) : null;
    if (ch && me && !ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      out.push(`RPM cannot post in the ${what} <#${id}>. Give it View Channel, Send Messages and Embed Links there.`);
    }
  }

  const { default: CADConfig } = await import('../models/CADConfig.js');
  const cad = dc.leoRoleIds?.length ? null : await CADConfig.findOne({ guildId: guild.id }).lean();
  const roles = dc.leoRoleIds?.length ? dc.leoRoleIds : (cad?.leoRoleIds || []);
  if (roles.length && viewer && !viewer.roles.cache.some((r) => roles.includes(r.id))) {
    out.push(`You do not have an officer role (${roles.map((r) => `<@&${r}>`).join(', ')}). Dispatch only answers officers, and only joins a patrol channel when an officer is in it.`);
  }
  return out;
}

export async function cyberComView(guild, note = '', viewer = null) {
  const [subscribed, active, cfg, dc, premium] = await Promise.all([
    cyberComSubscribed(guild.id).catch(() => false),
    isCyberComActive(guild.id).catch(() => false),
    CyberComConfig.findOne({ guildId: guild.id }).lean(),
    DispatchConfig.findOne({ guildId: guild.id }).lean(),
    hasPremiumAccess(guild.id).catch(() => false),
  ]);
  const problems = (active || premium) ? await dispatchProblems(guild, dc, viewer).catch(() => []) : [];
  const { retentionDays } = await import('../cybercom/flags.js');
  const keptDays = await retentionDays(guild.id).catch(() => TRANSCRIPT_DAYS);
  const helpers = allHelpers();
  const added = helpers.filter((h) => h.client.guilds.cache.has(guild.id));
  const missing = helpers.filter((h) => !h.client.guilds.cache.has(guild.id));
  // The police radios are the dispatcher's patrol channels, so whatever was set
  // in AI Voice Dispatch shows here already. Radios picked before the two were
  // one list are shown with them until the menu is next saved.
  const radios = [...new Set([...(dc?.patrolChannelIds || []), ...(cfg?.radioChannelIds || [])])];

  const lines = [];
  if (note) lines.push(note, '');
  lines.push(
    'A bot in every voice channel. Officers run traffic stops by voice ("Dispatch, show me on a 10-11 with Blade"), the person pulled over is asked if they want to be moved in, plates and names are run inside the stop, and a 10-80 goes out on the radio so units can say "Dispatch, attach me to the 10-80". Civilians say "RPM, move me to" and a name to join someone.',
    '',
  );
  if (active) lines.push('**Status:** on');
  else lines.push('**Status:** off. RPM CyberCom is $9.99 a month, with or without Premium.');
  lines.push(premium
    ? '-# The AI voice dispatcher runs your police radio.'
    : '-# RPM CyberCom includes the AI voice dispatcher for your police radio.');
  if (problems.length) {
    lines.push('', '**Why dispatch may not answer:**', ...problems.map((p) => '- ' + p));
  } else if (active || premium) {
    lines.push('**Dispatch check:** all set. Officers start with "dispatch" in a police radio channel.');
  }
  if (active || premium) {
    const { radioTraceLines } = await import('../utils/voiceListener.js');
    const heard = radioTraceLines(guild.id, 4);
    lines.push('', '**Last heard on the police radio:**',
      ...(heard.length ? heard : ['Nothing since the bot last restarted. Say "Dispatch, radio check" in a police radio channel, then open this again.']));
  }
  lines.push('');

  if (helperCount()) {
    lines.push(`**Helper bots:** ${added.length} of ${helpers.length} added. Each covers one busy channel at a time.`);
    if (missing.length) lines.push('Add: ' + missing.map((h) => `[CyberCom ${h.index}](${inviteUrl(h)})`).join(' · '));
  } else {
    lines.push('**Helper bots:** not available yet.');
  }
  lines.push(
    '',
    `**Police radio channels** (the AI dispatcher, answers to "dispatch"): ${mentions(radios)}`,
    '-# These are the patrol channels in AI Voice Dispatch too. Set them in either place.',
    `**Traffic stop channels:** ${mentions(dc?.trafficStopChannelIds)}`,
    `**Civilian channels** (they answer to "RPM"): ${mentions(cfg?.civilianChannelIds)}`,
    `**Greeting people who join:** ${cfg?.greet === false ? 'off' : 'on'}`,
    '',
    `-# Everything said in these channels is transcribed, and people are told when they join. Staff read it with \`/voicemoderation\`. Transcripts are deleted after ${keptDays} days. Flags, who can read transcripts and how long they are kept are under Voice moderation.`,
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
  buttons.push(new ButtonBuilder().setCustomId('cybercom_vmod_open').setLabel('Voice moderation').setStyle(ButtonStyle.Primary));
  buttons.push(new ButtonBuilder().setCustomId('cybercom_greet').setLabel(cfg?.greet === false ? 'Turn greetings on' : 'Turn greetings off').setStyle(ButtonStyle.Secondary));

  return {
    embeds: [embed],
    components: [
      pick('cybercom_radio', 'Police radio channels (the dispatcher\'s patrol channels)', radios),
      pick('cybercom_stops', 'Traffic stop voice channels', dc?.trafficStopChannelIds),
      pick('cybercom_civ', 'Civilian voice channels', cfg?.civilianChannelIds),
      new ActionRowBuilder().addComponents(...buttons),
      backRow(),
    ],
  };
}

export async function handleCyberCom(interaction) {
  const id = interaction.customId;
  if (/^cybercom_(join|stay|back|attach)_/.test(id)) return handleCyberComButton(interaction);
  // A flag's "What was said around it": for the people who read transcripts.
  if (id.startsWith('cybercom_flagctx_')) {
    const { handleFlagContext } = await import('../cybercom/flags.js');
    return handleFlagContext(interaction);
  }
  if (!interaction.inGuild()) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Only members with the Manage Server permission can change RPM CyberCom.', flags: 64 });
  }
  if (id.startsWith('cybercom_vmod_')) {
    const { handleVoiceMod } = await import('./voiceModSetupHandler.js');
    return handleVoiceMod(interaction);
  }
  const guild = interaction.guild;
  let note = '';
  const values = interaction.values || [];
  // A channel is one kind only: police radio, traffic stop or civilian.
  const ONE_KIND = ' A channel can be only one kind, so channels already used as another kind were left out.';
  if (id === 'cybercom_radio') {
    // The police radios are the dispatcher's patrol channels: one list, set
    // here or in AI Voice Dispatch. Radios picked before that join it now.
    const dc = await DispatchConfig.findOne({ guildId: guild.id }) || new DispatchConfig({ guildId: guild.id });
    dc.patrolChannelIds = values;
    dc.trafficStopChannelIds = (dc.trafficStopChannelIds || []).filter((c) => !values.includes(c));
    await dc.save();
    await CyberComConfig.updateOne({ guildId: guild.id }, { $set: { radioChannelIds: [] }, $pull: { civilianChannelIds: { $in: values } } });
    // Not awaited: joining a channel can take longer than Discord waits for an answer.
    const { applyPatrolChannels } = await import('./dispatchHandler.js');
    applyPatrolChannels(guild, interaction.client).catch((err) => console.error('[CyberCom] patrol channels:', err.message));
    note = '**Police radio channels saved.** They are the AI dispatcher\'s patrol channels too.';
  } else if (id === 'cybercom_civ') {
    const cfg = await CyberComConfig.findOne({ guildId: guild.id }) || new CyberComConfig({ guildId: guild.id });
    const dc = await DispatchConfig.findOne({ guildId: guild.id }).lean();
    const taken = new Set([...(dc?.patrolChannelIds || []), ...(dc?.trafficStopChannelIds || []), ...(cfg.radioChannelIds || [])]);
    const chosen = values.filter((v) => !taken.has(v));
    cfg.civilianChannelIds = chosen;
    cfg.updatedBy = interaction.user.id;
    cfg.updatedAt = new Date();
    await cfg.save();
    note = '**Civilian channels saved.**' + (chosen.length < values.length ? ONE_KIND : '');
  } else if (id === 'cybercom_stops') {
    const dc = await DispatchConfig.findOne({ guildId: guild.id }) || new DispatchConfig({ guildId: guild.id });
    const chosen = values.filter((v) => !(dc.patrolChannelIds || []).includes(v));
    dc.trafficStopChannelIds = chosen;
    await dc.save();
    await CyberComConfig.updateOne({ guildId: guild.id }, { $pull: { civilianChannelIds: { $in: chosen }, radioChannelIds: { $in: chosen } } });
    note = '**Traffic stop channels saved.**' + (chosen.length < values.length ? ONE_KIND : '');
  } else if (id === 'cybercom_greet') {
    const cfg = await CyberComConfig.findOne({ guildId: guild.id }) || new CyberComConfig({ guildId: guild.id });
    cfg.greet = cfg.greet === false;
    await cfg.save();
    note = cfg.greet ? '**Greetings on.**' : '**Greetings off.** The helper\'s name still says "(transcribing)" in the channel, but tell your members their voice channels are transcribed.';
  }
  forgetConfig(guild.id);
  clearCyberComCache(guild.id);
  return interaction.update(await cyberComView(guild, note, interaction.member));
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
