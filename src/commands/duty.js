import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { totalsFor, formatDuration, MAX_SESSION_SECONDS } from '../utils/dutyTracker.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('duty')
  .setDescription('See how long you have been on patrol')
  .addUserOption((o) => o
    .setName('officer')
    .setDescription('Somebody else, if you want to check on them')
    .setRequired(false));

/**
 * Free, on every server, for every member.
 *
 * This is the surface that sells the paid half. An officer who can see their
 * own hours starts caring about them, and the owner hears about it from their
 * members rather than from a price list.
 */
export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const cfg = await DispatchConfig.findOne({ guildId: interaction.guildId })
    .select('patrolChannelIds').lean();

  if (!cfg?.patrolChannelIds?.length) {
    return interaction.editReply({
      embeds: [errorEmbed(
        'No patrol channels set',
        'Patrol hours are counted from time spent in your patrol voice channels, and this server has not chosen any yet.\n\n' +
        'An administrator can pick them with `/setup`, under Voice Dispatch, or with `/config dispatch`.'
      )],
    });
  }

  const target = interaction.options.getUser('officer') || interaction.user;
  const self = target.id === interaction.user.id;

  const [week, month] = await Promise.all([
    totalsFor(interaction.guildId, target.id, 7),
    totalsFor(interaction.guildId, target.id, 30),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle(self ? 'Your patrol hours' : `Patrol hours for ${target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: 'RPM' });

  if (!week.seconds && !month.seconds) {
    embed.setDescription(
      (self ? 'You have' : `${target.username} has`) + ' no patrol time recorded in the last 30 days.\n\n' +
      '-# Time counts while you are in a patrol voice channel with at least one other person, and stops while you are deafened.'
    );
    return interaction.editReply({ embeds: [embed] });
  }

  embed.addFields(
    { name: 'Last 7 days', value: formatDuration(week.seconds), inline: true },
    { name: 'Last 30 days', value: formatDuration(month.seconds), inline: true },
    { name: 'Shifts', value: `${month.sessions} in 30 days`, inline: true },
  );

  if (month.longest) {
    embed.addFields({
      name: 'Longest single shift',
      value: formatDuration(month.longest)
        + (month.longest >= MAX_SESSION_SECONDS ? ' (capped)' : ''),
      inline: true,
    });
  }
  if (month.lastSeen) {
    embed.addFields({
      name: 'Last on patrol',
      value: `<t:${Math.floor(new Date(month.lastSeen).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  embed.setDescription(
    '-# Counted while you are in a patrol voice channel with somebody else. Deafened time does not count.'
  );

  return interaction.editReply({ embeds: [embed] });
}
