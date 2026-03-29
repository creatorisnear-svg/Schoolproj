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

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: key });
}

/**
 * Detects "show me in/on [10-11] with [name]" style phrases.
 * Returns the name of the person being pulled over, or null if not detected.
 */
function detectJoinStop(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('show me')) return null;
  if (!lower.includes('with')) return null;
  const nameMatch = text.match(/\bwith\s+([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/i);
  return nameMatch ? nameMatch[1].trim() : null;
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

function parseTranscript(text) {
  const lower = text.toLowerCase();

  let detectedCode = null;
  for (const code of Object.keys(TEN_CODES)) {
    const escaped = code.replace('-', '[\\-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      detectedCode = code;
      break;
    }
  }

  const withMatch = lower.match(/\bwith\s+([a-z][a-z\s]{1,30}?)(?:\s+at|\s+on|\s*$)/i);
  const atMatch = lower.match(/\bat\s+(.{2,40}?)(?:\s+with|\s*$)/i);
  const showMeMatch = lower.match(/show\s+me\s+(?:a\s+)?(\d{2}[\-\s]?\d{1,2})/i);

  if (!detectedCode && showMeMatch) {
    const raw = showMeMatch[1].replace(/\s/, '-');
    const normalized = `10-${raw.split('-')[1] || raw}`;
    if (TEN_CODES[normalized]) detectedCode = normalized;
  }

  return {
    code: detectedCode,
    codeInfo: detectedCode ? TEN_CODES[detectedCode] : null,
    subject: withMatch ? withMatch[1].trim() : null,
    location: atMatch ? atMatch[1].trim() : null,
    rawText: text.trim(),
  };
}

async function transcribeAudio(wavBuffer) {
  const openai = getOpenAI();
  const tempPath = join(tmpdir(), `dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(tempPath, wavBuffer);
  try {
    const result = await openai.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en',
    });
    return result.text || '';
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}

async function generateDispatchTTS(text) {
  const openai = getOpenAI();
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',
    input: text,
    response_format: 'opus',
  });
  return Buffer.from(await response.arrayBuffer());
}

async function generateDispatchResponse(officerName, parsed) {
  const openai = getOpenAI();
  const callText = parsed.rawText || `${parsed.code || 'unknown status'}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
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
    const isLeo = cadConfig?.leoRoleIds?.length > 0 &&
      member.roles.cache.some(r => cadConfig.leoRoleIds.includes(r.id));
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
        if (config.aiEnabled && process.env.OPENAI_API_KEY) {
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
    if (config.aiEnabled && process.env.OPENAI_API_KEY) {
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
    if (dispatchResponse && config.aiEnabled && process.env.OPENAI_API_KEY) {
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

    const options = {
      onTranscription: (wavBuffer, userId) => processVoiceCall(wavBuffer, userId, guild, client),
      userFilter: async (userId) => {
        if (!cadConfig?.leoRoleIds?.length) return false;
        const member = await guild.members.fetch(userId).catch(() => null);
        return member?.roles.cache.some(r => cadConfig.leoRoleIds.includes(r.id)) ?? false;
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

      const hasLeo = cadConfig?.leoRoleIds?.length > 0 &&
        channel.members.some(m => m.roles.cache.some(r => cadConfig.leoRoleIds.includes(r.id)));

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
