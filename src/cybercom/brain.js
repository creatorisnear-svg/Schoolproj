import { afterWakeWord, parseIntent, speakableName } from './text.js';
import { saveTranscript, isNoise } from './transcripts.js';
import { isCyberComActive } from './access.js';
import * as stops from './stops.js';

/**
 * What RPM CyberCom does with something said.
 *
 * Everything said in a covered channel is kept for staff (14 days). Then, if
 * it was a yes or no to a question the helper asked, that is answered;
 * otherwise only sentences that start with the wake word are acted on:
 * "dispatch" on police radios and in traffic stops, "RPM" in civilian
 * channels. Only officers can use the police commands.
 */

// Speech to text hears "RPM" better when told to expect it.
const CIVILIAN_PROMPT = 'RPM. RPM help. RPM, move me to Blade. RPM, take me to Jordan.';

export const HELP = {
  civilian: 'Say R P M, then move me to, and a name, to join that person\'s channel. Say R P M help to hear this again.',
  stop: 'Say dispatch, then run plate and the plate, or run name and the name. If they run, say show me in a ten eighty. When you are done, say show me off my ten eleven.',
  radio: 'Say dispatch, then show me on a ten eleven with, and a name, to start a traffic stop. Say attach me to the ten eighty to join a pursuit. You can also run plates and names, and give your status.',
};

export const GREETING = {
  civilian: 'This channel is transcribed for staff. To talk to me, you must say R P M before your request. For commands, say R P M help.',
  stop: 'This channel is transcribed for staff. To talk to me, start with dispatch.',
  radio: 'This channel is transcribed for staff. To talk to me, start with dispatch.',
};

/** Channels civilians may not move themselves into: radios and traffic stops. */
async function policeChannels(guildId) {
  const [{ default: CyberComConfig }, { default: DispatchConfig }] = await Promise.all([
    import('../models/CyberComConfig.js'), import('../models/DispatchConfig.js'),
  ]);
  const [cc, dc] = await Promise.all([CyberComConfig.findOne({ guildId }).lean(), DispatchConfig.findOne({ guildId }).lean()]);
  return [...(dc?.patrolChannelIds || []), ...(dc?.trafficStopChannelIds || []), ...(cc?.radioChannelIds || [])];
}

// Explaining why something was not done, at most every 10 minutes per person.
const nudged = new Map();
function nudgeOnce(key, everyMs = 10 * 60000) {
  if (Date.now() - (nudged.get(key) || 0) < everyMs) return false;
  nudged.set(key, Date.now());
  if (nudged.size > 2000) nudged.clear();
  return true;
}

/** Speech heard by a helper. */
export async function handleUtterance(session, userId, wav, seconds) {
  const guild = stops.mainGuild(session.guildId);
  if (!guild) return;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member || member.user.bot) return;

  const { transcribeAudio } = await import('../handlers/dispatchHandler.js');
  const { recordAI } = await import('../utils/aiUsage.js');
  recordAI(guild.id, { cybercom: 1, cybercomSeconds: Math.round(seconds || 0) });

  let text = '';
  try {
    text = String(await transcribeAudio(wav, session.role === 'civilian' ? CIVILIAN_PROMPT : undefined) || '').trim();
  } catch (err) {
    console.error('[CyberCom] transcription failed:', err.message);
    return;
  }
  if (isNoise(text)) return;

  await saveTranscript({
    guildId: guild.id, channelId: session.channelId, channelName: session.channel?.name || null,
    userId, username: member.displayName, text,
  });
  if (session.answer(userId, text)) return;

  const kind = session.role === 'civilian' ? 'civilian' : 'police';
  const rest = afterWakeWord(text, kind);
  if (rest === null) {
    // "Dispatch" said in a civilian channel: say how this channel works rather than go quiet.
    if (kind === 'civilian' && afterWakeWord(text, 'police') !== null && nudgeOnce(guild.id + ':' + userId + ':civilian')) {
      return session.speak('In this channel, say R P M first. Dispatch is for the police radio and traffic stops.');
    }
    return;
  }
  return act({ guild, member, role: session.role, intent: parseIntent(rest, kind), text, reply: (line) => session.speak(line), session });
}

/** Do what was asked. reply(text) speaks in the right place and resolves once heard. */
export async function act({ guild, member, role, intent, text, reply, session = null }) {
  if (role === 'civilian') {
    if (intent?.type === 'move_to') {
      return stops.moveToPerson({ guild, member, name: intent.name, reply, policeChannelIds: await policeChannels(guild.id) });
    }
    if (intent?.type === 'help') return reply(HELP.civilian);
    return reply('Sorry, I didn\'t catch that. Say R P M help for commands.');
  }

  // Police commands are for officers. Others are told, once in a while, rather than ignored.
  if (!(await stops.isLeo(guild, member))) {
    if (nudgeOnce(guild.id + ':' + member.id + ':leo')) return reply('Only officers can talk to dispatch. Ask your staff for the officer role.');
    return null;
  }
  switch (intent?.type) {
    case 'help': return reply(HELP[role] || HELP.radio);
    case 'stop_start': return stops.startStop({ guild, officer: member, subjectName: intent.name, said: text, reply });
    case 'stop_end': return stops.endStop({ guild, member, said: text, reply, session });
    case 'pursuit': return stops.startPursuit({ guild, member, said: text, reply });
    case 'attach_pursuit': return stops.attachToPursuit({ guild, member, reply });
    default: break;
  }
  // Plates and names, answered the way the dispatcher answers them.
  const { detectCADLookup, runCADLookup } = await import('../handlers/dispatchHandler.js');
  const lookup = detectCADLookup(text);
  if (lookup) {
    const result = await runCADLookup(guild.id, lookup).catch(() => null);
    return reply(result?.ttsResponse || `Negative, no records found for ${lookup.query}.`);
  }
  if (intent?.type === 'status') return stops.statusUpdate({ guild, member, code: intent.code, said: text, reply });
  return reply(`${speakableName(member.displayName)}, say again. Say dispatch help for what I can do.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The dispatcher answering on its own radio, timed so moves wait until it has been heard. */
async function dispatcherSay(guildId, text) {
  try {
    const { generateDispatchTTSPublic } = await import('../handlers/dispatchHandler.js');
    const { playDispatchVoice } = await import('../utils/voiceListener.js');
    playDispatchVoice(guildId, await generateDispatchTTSPublic(text));
    await sleep(1500 + text.length * 70);
  } catch (err) {
    // No voice this time: the move still happens.
    console.warn('[CyberCom] dispatcher could not speak:', err.message);
  }
}

/**
 * Called by the dispatcher (processVoiceCall) for each line an officer says
 * on its own radio. Keeps it for staff, and handles traffic stops and
 * attaching to a 10-80. True when CyberCom handled it.
 */
export async function fromDispatcher({ guild, member, transcript }) {
  if (!(await isCyberComActive(guild.id))) return false;
  await saveTranscript({
    guildId: guild.id, channelId: member.voice?.channelId || 'radio', channelName: member.voice?.channel?.name || null,
    userId: member.id, username: member.displayName, text: transcript,
  });
  const rest = afterWakeWord(transcript, 'police');
  if (rest === null) return false;
  const intent = parseIntent(rest, 'police');
  if (intent?.type === 'stop_start'
    || (intent?.type === 'attach_pursuit' && await stops.activePursuit(guild.id))) {
    await act({ guild, member, role: 'radio', intent, text: transcript, reply: (line) => dispatcherSay(guild.id, line) });
    return true;
  }
  return false;
}
