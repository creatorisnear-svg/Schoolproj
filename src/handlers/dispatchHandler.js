import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { writeFileSync, unlinkSync } from 'fs';
import { createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import OpenAI from 'openai';
import DispatchConfig from '../models/DispatchConfig.js';
import OfficerStatus from '../models/OfficerStatus.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';

const TEN_CODES = {
  '10-4': { label: '10-4 Acknowledged', action: null },
  '10-6': { label: '10-6 Busy', action: null },
  '10-7': { label: '10-7 Out of Service', action: 'out_of_service' },
  '10-8': { label: '10-8 Available', action: 'available' },
  '10-11': { label: '10-11 Traffic Stop', action: 'traffic_stop' },
  '10-15': { label: '10-15 Prisoner in Custody', action: null },
  '10-20': { label: '10-20 Location', action: null },
  '10-78': { label: '10-78 Need Assistance', action: null },
  '10-80': { label: '10-80 Pursuit', action: null },
  '10-97': { label: '10-97 On Scene', action: null },
  '10-99': { label: '10-99 Officer Down', action: null },
};

/**
 * Returns an AI client + provider info.
 * Prefers GROQ_API_KEY (free). Falls back to OPENAI_API_KEY (paid).
 */
function getAIClient() {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (groqKey) {
    return {
      client: new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' }),
      provider: 'groq',
    };
  }
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      provider: 'openai',
    };
  }
  throw new Error('No AI API key configured. Set GROQ_API_KEY (free) or OPENAI_API_KEY.');
}

function hasAIKey() {
  return !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Detects traffic stop phrases and returns the civilian name, or null if not found.
 * Supports many natural ways officers call a traffic stop.
 *
 * Patterns handled:
 *   "show me in/on/as [a] [10-11] with [name]"
 *   "show me with [name]"
 *   "pulling over [name]"  /  "pulling [name] over"
 *   "I'm stopping [name]"  /  "stopping [name]"
 *   "I got [name] / got [name] pulled over"
 *   "traffic stop with [name]"
 *   "I have [name] stopped"
 */
function detectJoinStop(text) {
  const lower = text.toLowerCase();

  // All patterns return the captured civilian name
  const patterns = [
    // "show me [in/on/as] [a] [code] with NAME"
    /show\s+me\s+(?:(?:in|on|as)\s+)?(?:a\s+)?(?:10[-\s]?\d{1,2}\s+)?with\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i,
    // "show me with NAME"
    /show\s+me\s+with\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i,
    // "pulling over NAME" / "pulling NAME over"
    /pulling\s+over\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i,
    /pulling\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)\s+over/i,
    // "stopping NAME" / "I'm stopping NAME"
    /(?:i(?:'m|m)\s+)?stopping\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i,
    // "traffic stop with NAME"
    /traffic\s+stop\s+with\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i,
    // "got NAME pulled over" / "I got NAME stopped"
    /(?:i\s+)?got\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)\s+(?:pulled\s+over|stopped)/i,
    // "I have NAME stopped" / "have NAME pulled over"
    /(?:i\s+)?have\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)\s+(?:stopped|pulled\s+over)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/** Finds a guild member by partial display name or username (case-insensitive). */
async function findMemberByName(guild, name) {
  const lower = name.toLowerCase();
  const cached = guild.members.cache.find(m =>
    m.displayName.toLowerCase().includes(lower) ||
    m.user.username.toLowerCase().includes(lower)
  );
  if (cached) return cached;
  try {
    const fetched = await guild.members.fetch({ query: name, limit: 5 });
    return fetched.first() || null;
  } catch {
    return null;
  }
}

/**
 * Converts spoken word numbers after "ten" into digit form.
 * e.g. "ten eleven" → "10-11", "ten eighty" → "10-80", "ten four" → "10-4"
 */
const WORD_TO_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUM_WORDS = Object.keys(WORD_TO_NUM).join('|');

/**
 * Common spoken phrases that map directly to a 10-code.
 * Checked before digit/word-number parsing so natural phrases take priority.
 * Each entry: [regex, '10-code']
 */
const PHRASE_ALIASES = [
  // 10-4 — Copy / Acknowledged
  [/\b(?:copy\s+that|copy|roger\s+that|roger|acknowledged|affirmative)\b/i, '10-4'],
  // 10-6 — Busy
  [/\b(?:i(?:'m|m)\s+)?busy\b/i, '10-6'],
  // 10-7 — Out of Service
  [/\b(?:going\s+)?(?:out\s+of\s+service|logging\s+off|signing\s+off|going\s+off(?:\s+duty)?)\b/i, '10-7'],
  // 10-8 — Available / In Service
  [/\b(?:i(?:'m|m)\s+)?(?:back\s+(?:in\s+service|available|on\s+patrol)|going\s+available|available|back\s+in\s+service|in\s+service|back\s+on\s+patrol)\b/i, '10-8'],
  [/\bi(?:'m|m)\s+back\b/i, '10-8'],
  // 10-11 — Traffic Stop (no name, just announcing a stop)
  [/\b(?:out\s+with\s+a\s+(?:vehicle|car|truck)|traffic\s+stop|got\s+a\s+stop|making\s+a\s+stop|initiating\s+a\s+stop)\b/i, '10-11'],
  // 10-12 — Stand By
  [/\b(?:stand\s+by|standby)\b/i, '10-12'],
  // 10-17 — En Route / Meet
  [/\b(?:en\s+route\s+to|heading\s+to|on\s+my\s+way\s+to|rolling\s+to)\b/i, '10-17'],
  // 10-20 — Location
  [/\b(?:my\s+location\s+is|i(?:'m|m)\s+(?:at|on|near)|current\s+location)\b/i, '10-20'],
  // 10-76 — En Route (general)
  [/\b(?:en\s+route|on\s+my\s+way|responding)\b/i, '10-76'],
  // 10-80 — Pursuit
  [/\b(?:in\s+pursuit|pursuing|vehicle\s+pursuit|foot\s+pursuit|in\s+a\s+(?:chase|pursuit)|high[\s-]speed\s+chase|chasing)\b/i, '10-80'],
  // 10-97 — On Scene / Arrived
  [/\b(?:on\s+scene|arrived?\s+(?:on\s+)?(?:scene|location)|i(?:'m|m)\s+(?:on\s+scene|at\s+the\s+scene|on\s+location))\b/i, '10-97'],
  // 10-99 — Officer Down / Emergency
  [/\b(?:officer\s+down|shots?\s+fired|officer\s+needs?\s+(?:immediate\s+)?(?:help|assistance|backup)|mayday|emergency)\b/i, '10-99'],
];

function normalizeSpokenCodes(text) {
  let result = text;

  // Apply phrase aliases first (before number-word normalization)
  for (const [pattern, code] of PHRASE_ALIASES) {
    if (pattern.test(result)) {
      result = result.replace(pattern, code);
    }
  }

  // Then convert "ten [word]" → "10-[digit]"
  result = result.replace(
    new RegExp(
      `\\bten[-\\s]?(${NUM_WORDS})(?:[-\\s](${NUM_WORDS}))?\\b`,
      'gi'
    ),
    (_, part1, part2) => {
      let val = WORD_TO_NUM[part1.toLowerCase()] || 0;
      if (part2) val += WORD_TO_NUM[part2.toLowerCase()] || 0;
      return `10-${val}`;
    }
  );

  return result;
}

function parseTranscript(text) {
  const normalized = normalizeSpokenCodes(text);
  const lower = normalized.toLowerCase();

  let detectedCode = null;
  for (const code of Object.keys(TEN_CODES)) {
    const escaped = code.replace('-', '[\\-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      detectedCode = code;
      break;
    }
  }

  // Subject: "with NAME", "stopping NAME", "pulling over NAME"
  const withMatch = lower.match(/\bwith\s+([a-z][a-z0-9\s]{1,30}?)(?:\s+at|\s+on|\s+near|\s*$)/i);

  // Location: "at PLACE", "on STREET", "near AREA", "by PLACE", "off STREET"
  const locationMatch = lower.match(/\b(?:at|on|near|by|off)\s+(.{2,40}?)(?:\s+with|\s*$)/i);

  // Fallback: "show me [code]" pattern (after normalization handles the number)
  const showMeMatch = lower.match(/show\s+me\s+(?:(?:in|on|as|a)\s+)?(\d{2}[-\s]\d{1,2})/i);
  if (!detectedCode && showMeMatch) {
    const raw = showMeMatch[1].replace(/\s/, '-');
    const candidate = `10-${raw.split('-')[1] || raw}`;
    if (TEN_CODES[candidate]) detectedCode = candidate;
  }

  if (detectedCode) {
    console.log(`[Dispatch] Detected code: ${detectedCode} from: "${text.trim()}" → normalized: "${normalized.trim()}"`);
  } else {
    console.log(`[Dispatch] No code detected in: "${text.trim()}"`);
  }

  return {
    code: detectedCode,
    codeInfo: detectedCode ? TEN_CODES[detectedCode] : null,
    subject: withMatch ? withMatch[1].trim() : null,
    location: locationMatch ? locationMatch[1].trim() : null,
    rawText: text.trim(),
  };
}

async function transcribeAudio(wavBuffer) {
  const { client, provider } = getAIClient();
  const model = provider === 'groq' ? 'whisper-large-v3' : 'whisper-1';
  const tempPath = join(tmpdir(), `dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(tempPath, wavBuffer);
  try {
    const result = await client.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model,
      language: 'en',
    });
    return result.text || '';
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}

async function generateDispatchTTS(text) {
  const { client, provider } = getAIClient();
  const model = provider === 'groq' ? 'playai-tts' : 'tts-1';
  const voice = provider === 'groq' ? 'Fritz-PlayAI' : 'onyx';
  const response = await client.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: 'mp3',
  });
  return Buffer.from(await response.arrayBuffer());
}

async function generateDispatchResponse(officerName, parsed) {
  const { client, provider } = getAIClient();
  const model = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
  const callText = parsed.rawText || `${parsed.code || 'unknown status'}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a professional GTA 5 RP police dispatcher for Los Santos Police Department. 
Respond to officer radio calls with short, realistic radio responses using 10-codes and proper radio etiquette. 
Keep responses to 1-2 sentences maximum. 
Use "Los Santos" and "Blaine County" for locations. 
Acknowledge the officer's status, repeat key details (who they're with, location), and provide any relevant advisories.
Do not use real-world city names.`,
      },
      {
        role: 'user',
        content: `Officer ${officerName} called in: "${callText}"`,
      },
    ],
    max_tokens: 120,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || '10-4, copy that.';
}

export async function processVoiceCall(wavBuffer, userId, guild, client) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config || !config.enabled || !config.dispatchChannelId) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);
    const isLeo = leoRoleIds.length === 0 || member.roles.cache.some(r => leoRoleIds.includes(r.id));
    if (!isLeo) return;

    const officerName = member.displayName || member.user.username;
    console.log(`[Dispatch] Processing audio from ${officerName} in ${guild.name}`);

    let transcript = '';
    try {
      transcript = await transcribeAudio(wavBuffer);
    } catch (err) {
      console.error('[Dispatch] Transcription error:', err.message);
      return;
    }

    if (!transcript || transcript.trim().length < 3) return;
    console.log(`[Dispatch] Transcript: "${transcript}"`);

    // --- "Show me in / show me on" join-stop detection ---
    const joinTargetName = detectJoinStop(transcript);
    if (joinTargetName && config.trafficStopChannelIds?.length > 0) {
      const civMember = await findMemberByName(guild, joinTargetName);

      // Pick least occupied traffic stop channel
      let bestChannelId = null;
      let bestCount = Infinity;
      for (const id of config.trafficStopChannelIds) {
        if (id === member.voice?.channelId) continue;
        const ch = guild.channels.cache.get(id) ||
          await guild.channels.fetch(id).catch(() => null);
        if (!ch) continue;
        const count = ch.members.filter(m => !m.user.bot).size;
        if (count < bestCount) { bestCount = count; bestChannelId = id; }
      }

      if (bestChannelId) {
        // Move officer
        if (member.voice?.channelId) {
          await member.voice.setChannel(bestChannelId).catch(() => {});
        }
        // Move civilian if they are in any voice channel
        if (civMember?.voice?.channelId && civMember.voice.channelId !== bestChannelId) {
          await civMember.voice.setChannel(bestChannelId).catch(() => {});
        }

        await updateOfficerStatus(guild.id, userId, officerName, '10-11',
          { code: '10-11', codeInfo: TEN_CODES['10-11'], subject: joinTargetName, location: null, rawText: transcript },
          null);

        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

        if (dispatchCh?.isTextBased()) {
          const civLine = civMember
            ? `<@${civMember.id}> (${civMember.displayName || civMember.user.username})`
            : `**${joinTargetName}**`;

          const stopEmbed = new EmbedBuilder()
            .setColor('#FFDD57')
            .setTitle('🚗 Traffic Stop Active')
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              `**With:** ${civLine}\n` +
              `**Moved to:** <#${bestChannelId}>\n\n` +
              `Both parties have been moved to the traffic stop channel.\n` +
              `Press **"✅ 10-8 — Stop Clear"** when the stop is finished, or the officer can say *"10-8"* when back in patrol.`
            )
            .addFields({ name: '🎙️ Officer Said', value: `*"${transcript.trim()}"*`, inline: false })
            .setFooter({ text: 'EverLink' })
            .setTimestamp();

          const clearBtn = new ButtonBuilder()
            .setCustomId(`dispatch_stop_clear_${userId}`)
            .setLabel('✅ 10-8 — Stop Clear')
            .setStyle(ButtonStyle.Success);

          await dispatchCh.send({ embeds: [stopEmbed], components: [new ActionRowBuilder().addComponents(clearBtn)] }).catch(() => {});
        }

        // Speak the confirmation in voice
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const civName = civMember?.displayName || civMember?.user?.username || joinTargetName;
            const ttsText = `Copy ${officerName}, showing you in on the traffic stop with ${civName}. Both parties have been moved.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) {
            console.error('[Dispatch TTS] Join-stop voice error:', err.message);
          }
        }

        await rebuildStatusBoard(guild, config);
      }
      return;
    }
    // --- End join-stop detection ---

    const parsed = parseTranscript(transcript);

    let dispatchResponse = null;
    if (config.aiEnabled && hasAIKey()) {
      try {
        dispatchResponse = await generateDispatchResponse(officerName, parsed);
      } catch (err) {
        console.error('[Dispatch] AI response error:', err.message);
      }
    }

    const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

    if (dispatchChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📻 Dispatch Radio')
        .setFooter({ text: 'EverLink' })
        .setTimestamp()
        .addFields(
          { name: '👮 Officer', value: `<@${userId}>`, inline: true },
          { name: '📟 Code', value: parsed.code ? `**${parsed.code}** — ${TEN_CODES[parsed.code]?.label}` : 'Unknown', inline: true },
        );

      if (parsed.subject) embed.addFields({ name: '🧍 With', value: parsed.subject, inline: true });
      if (parsed.location) embed.addFields({ name: '📍 Location', value: parsed.location, inline: true });

      embed.addFields({ name: '🎙️ Officer Said', value: `*"${transcript.trim()}"*`, inline: false });

      if (dispatchResponse) {
        embed.addFields({ name: '📡 Dispatch Response', value: `*"${dispatchResponse}"*`, inline: false });
      }

      await dispatchChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Speak the dispatcher response in the voice channel
    if (dispatchResponse && config.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');
        const ttsBuffer = await generateDispatchTTS(dispatchResponse);
        playDispatchVoice(guild.id, ttsBuffer);
      } catch (err) {
        console.error('[Dispatch TTS] Error generating or playing voice:', err.message);
      }
    }

    const voiceAction = parsed.codeInfo?.action;
    if (voiceAction === 'traffic_stop' && config.trafficStopChannelIds?.length > 0) {
      try {
        // Pick the traffic stop channel with the fewest non-bot members (load balance)
        let bestChannelId = null;
        let bestCount = Infinity;
        for (const id of config.trafficStopChannelIds) {
          if (id === member.voice?.channelId) continue;
          const ch = guild.channels.cache.get(id) ||
            await guild.channels.fetch(id).catch(() => null);
          if (!ch) continue;
          const count = ch.members.filter(m => !m.user.bot).size;
          if (count < bestCount) { bestCount = count; bestChannelId = id; }
        }
        if (bestChannelId && member.voice?.channelId) {
          await member.voice.setChannel(bestChannelId);
          await updateOfficerStatus(guild.id, userId, officerName, '10-11', parsed, null);
        }
        // Post a traffic stop active notice with a 10-8 clear button in the dispatch channel
        if (config.dispatchChannelId) {
          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispatchCh?.isTextBased()) {
            const stopEmbed = new EmbedBuilder()
              .setColor('#FFDD57')
              .setTitle('🚗 Traffic Stop Active')
              .setDescription(
                `**Officer:** <@${userId}>\n` +
                `**Moved to:** <#${bestChannelId}>\n\n` +
                `Officer **${officerName}** is on a **10-11**. They must return to patrol on their own.\n\n` +
                `Press **"✅ 10-8 — Stop Clear"** when the stop is finished, or the officer can say *"10-8"* when back in the patrol channel.`
              )
              .setFooter({ text: 'EverLink' })
              .setTimestamp();
            const clearBtn = new ButtonBuilder()
              .setCustomId(`dispatch_stop_clear_${userId}`)
              .setLabel('✅ 10-8 — Stop Clear')
              .setStyle(ButtonStyle.Success);
            await dispatchCh.send({ embeds: [stopEmbed], components: [new ActionRowBuilder().addComponents(clearBtn)] }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[Dispatch] Voice channel move error:', err.message);
      }
    } else if (voiceAction === 'available') {
      // Officer called 10-8 verbally — clear their stop status (they move back themselves)
      await updateOfficerStatus(guild.id, userId, officerName, '10-8', parsed, null);
    } else if (voiceAction === 'out_of_service') {
      await OfficerStatus.deleteOne({ guildId: guild.id, userId }).catch(() => {});
    } else if (parsed.code) {
      const existing = await OfficerStatus.findOne({ guildId: guild.id, userId });
      await updateOfficerStatus(guild.id, userId, officerName, parsed.code, parsed, existing?.lastPatrolChannelId || null);
    }

    await rebuildStatusBoard(guild, config);
  } catch (err) {
    console.error('[Dispatch] processVoiceCall error:', err.message);
  }
}

async function updateOfficerStatus(guildId, userId, username, tenCode, parsed, lastPatrolChannelId) {
  await OfficerStatus.findOneAndUpdate(
    { guildId, userId },
    {
      guildId,
      userId,
      username,
      tenCode,
      subject: parsed?.subject || null,
      location: parsed?.location || null,
      rawCall: parsed?.rawText || null,
      lastPatrolChannelId: lastPatrolChannelId || null,
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

export async function rebuildStatusBoard(guild, config) {
  if (!config?.statusBoardChannelId) return;

  const channel = guild.channels.cache.get(config.statusBoardChannelId) ||
    await guild.channels.fetch(config.statusBoardChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const officers = await OfficerStatus.find({
    guildId: guild.id,
    updatedAt: { $gte: cutoff },
  }).sort({ updatedAt: -1 });

  const embed = new EmbedBuilder()
    .setColor('#23D160')
    .setTitle('🚔 Officer Status Board')
    .setFooter({ text: 'EverLink' })
    .setTimestamp();

  if (officers.length === 0) {
    embed.setDescription('*No officers currently on duty.*');
  } else {
    const rows = officers.map((o) => {
      const codeLabel = TEN_CODES[o.tenCode]?.label || o.tenCode;
      const since = `<t:${Math.floor(new Date(o.updatedAt).getTime() / 1000)}:R>`;
      let line = `<@${o.userId}> — **${codeLabel}**`;
      if (o.subject) line += ` · with ${o.subject}`;
      if (o.location) line += ` @ ${o.location}`;
      line += ` · ${since}`;
      return line;
    });
    embed.setDescription(rows.join('\n'));
  }

  const clearButtons = officers.slice(0, 20).map((o) =>
    new ButtonBuilder()
      .setCustomId(`dispatch_clear_status_${o.userId}`)
      .setLabel(o.username.slice(0, 20))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗑️')
  );

  const components = [];
  for (let i = 0; i < clearButtons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(clearButtons.slice(i, i + 5)));
  }

  try {
    if (config.statusBoardMessageId) {
      const existing = await channel.messages.fetch(config.statusBoardMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed], components });
        return;
      }
    }

    const msg = await channel.send({ embeds: [embed], components });
    await msg.pin().catch(() => {});
    await DispatchConfig.updateOne({ guildId: guild.id }, { statusBoardMessageId: msg.id });
  } catch (err) {
    console.error('[Dispatch] Status board update error:', err.message);
  }
}

export async function handleClearStatusButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_clear_status_', '');

    const { checkStaffPermission, isAdmin } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction) || await isAdmin(interaction.member);
    const isSelf = interaction.user.id === targetUserId;

    if (!isStaff && !isSelf) {
      return interaction.reply({
        embeds: [errorEmbed('Only staff or the officer themselves can clear a status.')],
        flags: 64,
      });
    }

    await OfficerStatus.deleteOne({ guildId: interaction.guildId, userId: targetUserId });

    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const targetMention = targetUserId === interaction.user.id ? 'Your' : `<@${targetUserId}>'s`;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#23D160').setDescription(`${targetMention} status has been cleared from the board.`).setFooter({ text: 'EverLink' })],
      flags: 64,
    });
  } catch (err) {
    console.error('[Dispatch] Clear status error:', err.message);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while clearing the status.')],
      flags: 64,
    });
  }
}

export async function handleStopClearButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_stop_clear_', '');

    const isAdmin = interaction.member.permissions.has('Administrator');
    const isSelf = interaction.user.id === targetUserId;
    const staffDoc = await (await import('../models/Staff.js')).default
      .findOne({ guildId: interaction.guildId, userId: interaction.user.id }).catch(() => null);
    const isStaff = !!staffDoc;

    if (!isAdmin && !isStaff && !isSelf) {
      return interaction.reply({
        embeds: [errorEmbed('Only staff, the officer themselves, or an admin can clear this traffic stop.')],
        flags: 64,
      });
    }

    await OfficerStatus.deleteOne({ guildId: interaction.guildId, userId: targetUserId });

    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const clearEmbed = new EmbedBuilder()
      .setColor('#23D160')
      .setTitle('✅ Traffic Stop Cleared')
      .setDescription(`<@${targetUserId}> is **10-8 — Available**. The traffic stop has been cleared.`)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.update({ embeds: [clearEmbed], components: [] });
  } catch (err) {
    console.error('[Dispatch] Stop clear button error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
  }
}

export async function initDispatchForGuild(guild, client) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config || !config.enabled || config.patrolChannelIds.length === 0) return;

    const { setupDispatchForGuild, moveToChannel } = await import('../utils/voiceListener.js');
    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);

    const options = {
      onTranscription: (wavBuffer, userId) => processVoiceCall(wavBuffer, userId, guild, client),
      userFilter: async (userId) => {
        if (!leoRoleIds.length) return true;
        const member = await guild.members.fetch(userId).catch(() => null);
        return member?.roles.cache.some(r => leoRoleIds.includes(r.id)) ?? false;
      },
      onJoin: async (guildId) => {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS('Dispatch online, ready to serve.');
          playDispatchVoice(guildId, ttsBuffer);
          console.log(`[Dispatch] Played join announcement in ${guild.name}`);
        } catch (err) {
          console.error('[Dispatch] Join announcement error:', err.message);
        }
      },
    };

    setupDispatchForGuild(guild.id, config.patrolChannelIds, options);

    // On startup, only join a patrol channel if it currently has LEO members.
    // (Discord allows only one voice connection per guild; the bot dynamically
    // moves between patrol channels via voiceStateUpdate as officers join/leave.)
    for (const channelId of config.patrolChannelIds) {
      const channel = guild.channels.cache.get(channelId) ||
        await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;

      const hasLeo = leoRoleIds.length === 0
        ? channel.members.some(m => !m.user.bot)
        : channel.members.some(m => m.roles.cache.some(r => leoRoleIds.includes(r.id)));

      if (hasLeo) {
        await moveToChannel(channel);
        break;
      }
    }
    // If no patrol channel currently has officers, the bot waits in a disconnected
    // state and joins the first channel an officer enters (via voiceStateUpdate).
  } catch (err) {
    console.error(`[Dispatch] initDispatchForGuild error for ${guild.name}:`, err.message);
  }
}
