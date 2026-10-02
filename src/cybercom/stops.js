import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import CyberComStop from '../models/CyberComStop.js';
import DispatchConfig from '../models/DispatchConfig.js';
import CADConfig from '../models/CADConfig.js';
import CADCharacter from '../models/CADCharacter.js';
import OfficerStatus from '../models/OfficerStatus.js';
import { bestNameMatch, speakableName } from './text.js';

/**
 * Traffic stops, pursuits and moves for RPM CyberCom.
 *
 * Every move and every status change is done by the main bot, which has Move
 * Members and writes the CAD. Helpers only ask and answer. Each stop keeps
 * where everyone came from, so they can be moved back when it ends.
 */

let mainClient = null;
let sessionLookup = () => null;
let radioSessions = () => [];
export function setMainClient(client) { mainClient = client; }
/** Set by coordinator.js, which owns the sessions (avoids a circular import). */
export function setSessionLookup(find, radios) { sessionLookup = find; radioSessions = radios || (() => []); }
export const mainGuild = (guildId) => mainClient?.guilds.cache.get(guildId) || null;

const PURSUIT_MINUTES = 30;
const humans = (channel) => (channel ? channel.members.filter((m) => !m.user.bot).size : 0);
const say = (member) => speakableName(member?.displayName || member?.user?.username);
const SPOKEN_CODE = {
  '10-8': 'ten eight', '10-7': 'ten seven', '10-6': 'ten six', '10-97': 'ten ninety seven', '10-23': 'ten twenty three',
  '10-76': 'ten seventy six', '10-19': 'ten nineteen', '10-15': 'ten fifteen', '10-17': 'ten seventeen',
};

export async function isLeo(guild, member) {
  const [config, cad] = await Promise.all([
    DispatchConfig.findOne({ guildId: guild.id }).lean(),
    CADConfig.findOne({ guildId: guild.id }).lean(),
  ]);
  const roles = config?.leoRoleIds?.length ? config.leoRoleIds : (cad?.leoRoleIds || []);
  return roles.length === 0 || member.roles.cache.some((r) => roles.includes(r.id));
}

/** Someone in a voice channel, by the name said out loud (Discord name or CAD character). */
export async function findVoiceMember(guild, name, { exclude = [] } = {}) {
  const ids = [...guild.voiceStates.cache.values()].filter((vs) => vs.channelId && !exclude.includes(vs.id)).map((vs) => vs.id);
  if (!ids.length) return null;
  const missing = ids.filter((id) => !guild.members.cache.has(id));
  if (missing.length) await guild.members.fetch({ user: missing }).catch(() => null);
  const members = ids.map((id) => guild.members.cache.get(id)).filter((m) => m && !m.user.bot);
  const characters = await CADCharacter.find({ guildId: guild.id, userId: { $in: members.map((m) => m.id) } }, { userId: 1, characterName: 1 })
    .lean().catch(() => []);
  const people = members.map((m) => ({
    id: m.id,
    names: [m.displayName, m.nickname, m.user.username, m.user.globalName,
      ...characters.filter((c) => c.userId === m.id).map((c) => c.characterName)].filter(Boolean),
  }));
  const id = bestNameMatch(name, people);
  return id ? members.find((m) => m.id === id) : null;
}

export async function moveMember(guild, userId, channelId) {
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member?.voice?.channelId || !guild.channels.cache.has(channelId)) return false;
  try {
    await member.voice.setChannel(channelId, 'RPM CyberCom');
    return true;
  } catch (err) {
    console.warn('[CyberCom] could not move ' + userId + ':', err.message);
    return false;
  }
}

/** A status change, written where the CAD and the status board read it. */
export async function setStatus(guild, member, code, parsed = {}, stopChannelId = null) {
  const dispatch = await import('../handlers/dispatchHandler.js');
  if (code === '10-7') {
    await OfficerStatus.deleteOne({ guildId: guild.id, userId: member.id });
  } else {
    await dispatch.updateOfficerStatus(guild.id, member.id, member.displayName || member.user.username, code, parsed, null, stopChannelId);
  }
  const config = await DispatchConfig.findOne({ guildId: guild.id });
  if (config) dispatch.rebuildStatusBoard(guild, config).catch(() => {});
}

const OPEN = { $in: ['active', 'pursuit'] };
const openStops = (guildId) => CyberComStop.find({ guildId, status: OPEN });

/** The open stop someone is on, as the officer who started it or a unit on it. */
export function openStopFor(guildId, userId) {
  return CyberComStop.findOne({ guildId, status: OPEN, $or: [{ officerId: userId }, { unitIds: userId }] });
}

async function closeStop(stop) {
  stop.status = 'closed';
  stop.closedAt = new Date();
  stop.expireAt = new Date(Date.now() + 2 * 86400000);
  await stop.save();
}

function addReturn(stop, userId, channelId) {
  if (channelId && channelId !== stop.channelId && !stop.returnTo.some((r) => r.userId === userId)) {
    stop.returnTo.push({ userId, channelId });
  }
}

// ── Traffic stops ───────────────────────────────────────────────────────────

/** "Dispatch, show me on a 10-11 with Blade." */
export async function startStop({ guild, officer, subjectName, said, reply }) {
  const subject = await findVoiceMember(guild, subjectName, { exclude: [officer.id] });
  if (!subject) return reply(`Negative ${say(officer)}, I can't find ${subjectName} in a voice channel.`);

  const config = await DispatchConfig.findOne({ guildId: guild.id }).lean();
  const stopIds = config?.trafficStopChannelIds || [];
  if (!stopIds.length) return reply(`Negative ${say(officer)}, this server has no traffic stop channels set up.`);

  let open = await openStops(guild.id);
  const mine = open.find((s) => s.officerId === officer.id);
  if (mine) {
    // Still in it: one at a time. Already left it without clearing it: that
    // stop is over, so it no longer stands in the way of a new one.
    if (officer.voice?.channelId === mine.channelId) {
      return reply(`${say(officer)}, you're already on a ten eleven. Say show me off my ten eleven first.`);
    }
    await closeStop(mine);
    open = open.filter((s) => s !== mine);
  }
  const busy = new Set(open.map((s) => s.channelId));
  const channel = stopIds.map((id) => guild.channels.cache.get(id)).find((ch) => ch && !busy.has(ch.id) && humans(ch) === 0);
  if (!channel) return reply(`Negative ${say(officer)}, every traffic stop channel is in use.`);

  const stop = await CyberComStop.create({
    guildId: guild.id,
    channelId: channel.id,
    officerId: officer.id,
    officerName: officer.displayName,
    subjectId: subject.id,
    subjectName: subject.displayName,
    unitIds: [officer.id],
    returnTo: officer.voice?.channelId ? [{ userId: officer.id, channelId: officer.voice.channelId }] : [],
  });
  await setStatus(guild, officer, '10-11', { subject: subject.displayName, location: channel.name, rawText: said || null }, channel.id);
  await reply(`Copy ${say(officer)}, ten eleven with ${say(subject)}. Moving you to ${speakableName(channel.name)}.`);
  await moveMember(guild, officer.id, channel.id);

  // The person being pulled over is asked, in the channel they are in.
  offerJoinStop(guild, stop, subject).catch((err) => console.error('[CyberCom] could not ask about the stop:', err.message));
  return stop;
}

/** Ask the person pulled over if they want to be moved into the stop. */
export async function offerJoinStop(guild, stop, subject) {
  const question = `${say(subject)}, would you like to be moved into the ten eleven channel?`;
  const session = sessionLookup(guild.id, subject.voice?.channelId);
  if (session) {
    const answers = await session.ask([subject.id], question);
    const answer = answers.get(subject.id);
    if (answer === 'yes') return joinStop(guild, stop._id, subject.id);
    if (answer === 'no') await session.speak('Okay, staying here.');
    return false;
  }
  // No helper where they are: a message they can press, in that voice channel's chat.
  const channel = subject.voice?.channel;
  if (!channel?.isTextBased?.()) return false;
  await channel.send({
    content: `<@${subject.id}>`,
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setDescription(`**${subject.displayName}**, ${stop.officerName} is pulling you over. Would you like to be moved into the ten eleven channel?`).setFooter({ text: 'RPM CyberCom' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cybercom_join_${stop._id}`).setLabel('Move me').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cybercom_stay_${stop._id}`).setLabel('Stay here').setStyle(ButtonStyle.Secondary),
    )],
    allowedMentions: { users: [subject.id] },
  }).catch(() => null);
  return false;
}

export async function joinStop(guild, stopId, userId) {
  const stop = await CyberComStop.findById(stopId);
  if (!stop || stop.status === 'closed') return false;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member?.voice?.channelId) return false;
  addReturn(stop, userId, member.voice.channelId);
  await stop.save();
  return moveMember(guild, userId, stop.channelId);
}

/** "Dispatch, show me off my 10-11." Everyone involved is offered a move back. */
export async function endStop({ guild, member, reply, session }) {
  const channelId = session?.channelId || member.voice?.channelId;
  const stop = await CyberComStop.findOne({ guildId: guild.id, channelId, status: OPEN })
    || await openStopFor(guild.id, member.id);
  if (!stop) return reply(`${say(member)}, there's no ten eleven to clear.`);
  await closeStop(stop);

  for (const unitId of new Set([stop.officerId, ...(stop.unitIds || [])])) {
    const unit = guild.members.cache.get(unitId) || await guild.members.fetch(unitId).catch(() => null);
    if (unit) await setStatus(guild, unit, '10-8', {}, null);
  }

  const inStop = (userId) => guild.members.cache.get(userId)?.voice?.channelId === stop.channelId;
  const here = stop.returnTo.filter((r) => inStop(r.userId) && guild.channels.cache.has(r.channelId));
  const helper = sessionLookup(guild.id, stop.channelId) || (session?.channelId === stop.channelId ? session : null);
  // Cleared from the patrol radio, not from inside the stop: the officer hears
  // it there, and anyone still in the stop is told by the helper in it.
  const fromInside = member.voice?.channelId === stop.channelId;
  if (!fromInside || !here.length) await reply(`Copy ${say(member)}, ten eight.`);
  if (!here.length) return true;

  // Everyone goes back where they came from unless they say no. Asking and
  // waiting for a yes left whoever did not answer (often the civilian) sitting
  // in an empty stop channel.
  const sendBack = async (answers) => {
    for (const r of here) {
      if (answers?.get(r.userId) !== 'no' && inStop(r.userId)) await moveMember(guild, r.userId, r.channelId);
    }
  };
  if (helper) {
    const asking = helper.ask(here.map((r) => r.userId), fromInside
      ? 'Copy, ten eight. Moving everyone back to their channels. Say no to stay.'
      : 'This ten eleven is over. Moving you back to your channel. Say no to stay.', BACK_WAIT_MS)
      .then(sendBack);
    if (fromInside) await asking; else asking.catch(() => {});
    return true;
  }
  if (fromInside) await reply(`Copy ${say(member)}, ten eight.`);
  await sendBack(null);
  return true;
}

// How long people have to say "no" before everyone is moved back.
const BACK_WAIT_MS = 8000;

/** The "Move me back" button on messages posted before stops moved everyone back. */
export async function moveBack(guild, stopId, userId) {
  const stop = await CyberComStop.findById(stopId);
  const entry = stop?.returnTo.find((r) => r.userId === userId);
  if (!entry) return false;
  return moveMember(guild, userId, entry.channelId);
}

/**
 * "Dispatch, move me back" from inside a traffic stop channel, by anyone in
 * it, officer or not: back to where the bot moved them in from, during the
 * stop or up to half an hour after it ended.
 */
export async function moveBackFromStop({ guild, member, channelId, reply }) {
  const stop = await CyberComStop.findOne({
    guildId: guild.id, channelId, 'returnTo.userId': member.id,
    $or: [{ status: OPEN }, { closedAt: { $gte: new Date(Date.now() - 30 * 60000) } }],
  }).sort({ createdAt: -1 });
  const entry = stop?.returnTo.find((r) => r.userId === member.id);
  if (!entry || !guild.channels.cache.has(entry.channelId)) {
    return reply(`${say(member)}, I don't know which channel you were in before this stop.`);
  }
  await reply(`Copy ${say(member)}, moving you back.`);
  return moveMember(guild, member.id, entry.channelId);
}

// ── Pursuits ────────────────────────────────────────────────────────────────

/** Tell every police radio: the dispatcher's own and the helpers' radio channels. */
export async function announceToRadio(guild, text) {
  try {
    const { generateDispatchTTSPublic } = await import('../handlers/dispatchHandler.js');
    const { playDispatchVoice, getCurrentChannelId } = await import('../utils/voiceListener.js');
    if (getCurrentChannelId?.(guild.id)) playDispatchVoice(guild.id, await generateDispatchTTSPublic(text));
  } catch (err) {
    console.warn('[CyberCom] dispatcher could not announce:', err.message);
  }
  for (const s of radioSessions(guild.id)) s.speak(text).catch(() => {});
}

/** "Dispatch, show me in a 10-80." from the traffic stop. */
export async function startPursuit({ guild, member, said, reply }) {
  let stop = await CyberComStop.findOne({ guildId: guild.id, channelId: member.voice?.channelId, status: { $in: ['active', 'pursuit'] } });
  if (!stop && member.voice?.channelId) {
    // A 10-80 from outside a stop: the pursuit is wherever this officer is.
    stop = await CyberComStop.create({
      guildId: guild.id, channelId: member.voice.channelId, officerId: member.id, officerName: member.displayName, unitIds: [member.id],
    });
  }
  if (!stop) return reply(`Copy ${say(member)}, ten eighty.`);
  stop.status = 'pursuit';
  stop.pursuitAt = new Date();
  await stop.save();

  const channel = guild.channels.cache.get(stop.channelId);
  await setStatus(guild, member, '10-80', {
    subject: stop.subjectName ? 'Pursuit of ' + stop.subjectName : 'Pursuit',
    location: channel?.name || null,
    rawText: said || null,
  });
  await reply(`Copy ${say(member)}, ten eighty. Letting all units know.`);
  await announceToRadio(guild, `${say(member)} is in a ten eighty. Any units wanting to respond, say dispatch, attach me to the ten eighty.`);

  // And in writing, with a button, for officers who would rather click.
  const config = await DispatchConfig.findOne({ guildId: guild.id }).lean();
  const text = config?.dispatchChannelId ? guild.channels.cache.get(config.dispatchChannelId) : null;
  if (text?.isTextBased?.()) {
    await text.send({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('10-80 Pursuit')
        .setDescription(`**${member.displayName}** is in a pursuit${stop.subjectName ? ' of **' + stop.subjectName + '**' : ''} in **${channel?.name || 'their channel'}**.\nSay "Dispatch, attach me to the 10-80" on the radio, or press the button.`)
        .setFooter({ text: 'RPM CyberCom' }).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cybercom_attach_${stop._id}`).setLabel('Attach me').setStyle(ButtonStyle.Danger))],
    }).catch(() => null);
  }
  return stop;
}

export async function activePursuit(guildId) {
  return CyberComStop.findOne({ guildId, status: 'pursuit', pursuitAt: { $gte: new Date(Date.now() - PURSUIT_MINUTES * 60000) } }).sort({ pursuitAt: -1 });
}

/** "Dispatch, attach me to the 10-80." Moves the unit to the pursuit and updates the CAD. */
export async function attachToPursuit({ guild, member, reply, stopId = null }) {
  const stop = stopId ? await CyberComStop.findById(stopId) : await activePursuit(guild.id);
  if (!stop || stop.status !== 'pursuit') return reply(`Negative ${say(member)}, there's no active ten eighty.`);
  if (member.voice?.channelId === stop.channelId) return reply(`${say(member)}, you're already on the ten eighty.`);
  addReturn(stop, member.id, member.voice?.channelId);
  if (!(stop.unitIds || []).includes(member.id)) stop.unitIds = [...(stop.unitIds || []), member.id];
  await stop.save();
  const channel = guild.channels.cache.get(stop.channelId);
  await setStatus(guild, member, '10-80', { subject: 'Assisting ' + (stop.officerName || 'pursuit'), location: channel?.name || null });
  await reply(`Copy ${say(member)}, attaching you to ${speakableName(stop.officerName)}'s ten eighty.`);
  if (member.voice?.channelId) await moveMember(guild, member.id, stop.channelId);
  return true;
}

/** "Dispatch, show me 10-8" and the like, on a helper's radio. */
export async function statusUpdate({ guild, member, code, said, reply }) {
  await setStatus(guild, member, code, { rawText: said || null });
  return reply(`Copy ${say(member)}, ${SPOKEN_CODE[code] || code}.`);
}

// ── Civilian channels ───────────────────────────────────────────────────────

/** "RPM, move me to Blade." */
export async function moveToPerson({ guild, member, name, reply, policeChannelIds = [] }) {
  if (!member.voice?.channelId) return null;
  const target = await findVoiceMember(guild, name, { exclude: [member.id] });
  if (!target) return reply(`Sorry, I can't find ${name} in a voice channel.`);
  const dest = target.voice?.channel;
  if (!dest) return reply(`Sorry, I can't find ${name} in a voice channel.`);
  if (dest.id === member.voice.channelId) return reply(`You're already with ${say(target)}.`);
  if (!dest.permissionsFor(member)?.has(PermissionFlagsBits.Connect)
    || (policeChannelIds.includes(dest.id) && !(await isLeo(guild, member)))) {
    return reply(`Sorry, you can't join ${say(target)}'s channel.`);
  }
  if (dest.userLimit && dest.members.size >= dest.userLimit) return reply(`${say(target)}'s channel is full.`);
  await reply(`Moving you to ${say(target)}.`);
  const ok = await moveMember(guild, member.id, dest.id);
  if (!ok) await reply('Sorry, I could not move you.');
  return ok;
}
