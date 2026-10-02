import { SlashCommandBuilder, ChannelType, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { readTranscript, transcriptText } from '../cybercom/transcripts.js';
import { cyberComSubscribed } from '../cybercom/access.js';
import { TRANSCRIPT_DAYS } from '../models/VoiceTranscript.js';

export const data = new SlashCommandBuilder()
  .setName('voicemoderation')
  .setDescription('Read what was said in a voice channel (RPM CyberCom, staff only)')
  .addChannelOption((o) => o
    .setName('channel')
    .setDescription('The voice channel')
    .setRequired(true)
    .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
  .addStringOption((o) => o
    .setName('day')
    .setDescription(`Which day, up to ${TRANSCRIPT_DAYS} days back`)
    .setRequired(true)
    .setAutocomplete(true))
  .addUserOption((o) => o
    .setName('member')
    .setDescription('Only what this person said'));

const ymd = (d) => d.toISOString().slice(0, 10);

/** The last 14 days, newest first, as autocomplete choices. Days are UTC. */
export function dayChoices(now = new Date()) {
  const out = [];
  for (let i = 0; i < TRANSCRIPT_DAYS; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    out.push({ name: (i === 0 ? 'Today, ' : i === 1 ? 'Yesterday, ' : '') + label, value: ymd(d) });
  }
  return out;
}

export async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused() || '').toLowerCase();
  const choices = dayChoices().filter((c) => !typed || c.name.toLowerCase().includes(typed) || c.value.includes(typed));
  return interaction.respond(choices.slice(0, 25));
}

export async function execute(interaction) {
  if (!interaction.inGuild()) return;
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ content: 'Only staff can read voice transcripts.', flags: 64 });
  }
  const channel = interaction.options.getChannel('channel');
  let day = String(interaction.options.getString('day') || '').trim().toLowerCase();
  if (day === 'today') day = ymd(new Date());
  if (day === 'yesterday') day = ymd(new Date(Date.now() - 86400000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return interaction.reply({ content: 'Pick a day from the list.', flags: 64 });
  }
  const member = interaction.options.getUser('member');

  await interaction.deferReply({ flags: 64 });
  const lines = await readTranscript({ guildId: interaction.guildId, channelId: channel.id, day, userId: member?.id || null });
  if (!lines.length) {
    const subscribed = await cyberComSubscribed(interaction.guildId).catch(() => false);
    return interaction.editReply({
      content: subscribed
        ? `Nothing was said in <#${channel.id}> on ${day}${member ? ` by <@${member.id}>` : ''}. Only channels RPM CyberCom covers are transcribed, and transcripts are kept ${TRANSCRIPT_DAYS} days.`
        : 'Voice transcripts are part of RPM CyberCom, the add-on that puts a bot in every voice channel. Run `/setup` and open RPM CyberCom to see it.',
      allowedMentions: { parse: [] },
    });
  }

  const memberName = member ? (interaction.guild.members.cache.get(member.id)?.displayName || member.username) : null;
  const file = new AttachmentBuilder(Buffer.from(transcriptText({
    guildName: interaction.guild.name, channelName: channel.name, day, memberName, lines,
  }), 'utf8'), { name: `transcript-${channel.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${day}${member ? '-' + member.username : ''}.txt` });

  const preview = lines.slice(-15)
    .map((l) => `\`${new Date(l.at).toISOString().slice(11, 16)}\` **${(l.username || 'Unknown').replace(/[*_`~|]/g, '')}**: ${l.text.replace(/[*_`~|]/g, '')}`)
    .join('\n');
  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Voice transcript: ' + channel.name)
    .setDescription(
      `**${lines.length}** ${lines.length === 1 ? 'line' : 'lines'} on ${day}${member ? ` from <@${member.id}>` : ''}. Times are UTC. The whole day is in the file.\n\n` +
      '**Last lines**\n' + preview.slice(0, 3600)
    )
    .setFooter({ text: `RPM CyberCom · Transcripts are kept ${TRANSCRIPT_DAYS} days` });
  return interaction.editReply({ embeds: [embed], files: [file], allowedMentions: { parse: [] } });
}
