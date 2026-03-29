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

    const voiceAction = parsed.codeInfo?.action;
    if (voiceAction === 'traffic_stop' && config.trafficStopChannelIds?.length > 0) {
      try {
        // Pick the traffic stop channel with the fewest non-bot members (load balance)
        let bestChannelId = null;
        let bestCount = Infinity;
        for (const id of config.trafficStopChannelIds) {
          if (id === member.voice?.channelId) continue; // skip if already there
          const ch = guild.channels.cache.get(id) ||
            await guild.channels.fetch(id).catch(() => null);
          if (!ch) continue;
          const count = ch.members.filter(m => !m.user.bot).size;
          if (count < bestCount) { bestCount = count; bestChannelId = id; }
        }
        if (bestChannelId && member.voice?.channelId) {
          const lastPatrolChannelId = member.voice.channelId;
          await member.voice.setChannel(bestChannelId);
          await updateOfficerStatus(guild.id, userId, officerName, '10-11', parsed, lastPatrolChannelId);
        }
      } catch (err) {
        console.error('[Dispatch] Voice channel move error:', err.message);
      }
    } else if (voiceAction === 'available') {
      const status = await OfficerStatus.findOne({ guildId: guild.id, userId });
      if (status?.lastPatrolChannelId && member.voice?.channelId) {
        try {
          await member.voice.setChannel(status.lastPatrolChannelId);
        } catch {}
      }
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
