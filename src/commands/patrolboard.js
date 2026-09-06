import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { leaderboard, guildTotals, formatDuration } from '../utils/dutyTracker.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, limitReply, TRIAL_DAYS } from '../utils/premiumCheck.js';

/** What a free server sees. Matches the leaderboard cap the product already uses. */
const FREE_ROWS = 10;
const FREE_DAYS = 7;

export const data = new SlashCommandBuilder()
  .setName('patrolboard')
  .setDescription('Who has been on patrol the most')
  .addStringOption((o) => o
    .setName('period')
    .setDescription('How far back to look')
    .setRequired(false)
    .addChoices(
      { name: 'Last 7 days', value: '7' },
      { name: 'Last 30 days (Premium)', value: '30' },
      { name: 'Last 90 days (Premium)', value: '90' },
    ));

/**
 * Free to a top ten over seven days, which is the part members compete over.
 *
 * The deeper windows and the full roster are Premium, and the wall can quote a
 * real number back because collection has been running free the whole time.
 * That is the point of the split: a paywall that says "1,247 hours are already
 * recorded here" converts, and one that shows an empty board does not.
 */
export async function execute(interaction) {
  await interaction.deferReply();

  const cfg = await DispatchConfig.findOne({ guildId: interaction.guildId })
    .select('patrolChannelIds').lean();

  if (!cfg?.patrolChannelIds?.length) {
    return interaction.editReply({
      embeds: [errorEmbed(
        'No patrol channels set',
        'Patrol hours come from time spent in your patrol voice channels, and this server has not chosen any yet.\n\n' +
        'An administrator can pick them with `/setup`, under Voice Dispatch, or with `/config dispatch`.'
      )],
    });
  }

  const wanted = parseInt(interaction.options.getString('period') || String(FREE_DAYS), 10);
  const access = await checkFeatureAccess(interaction.guildId, 'dutytime');

  if (!access.allowed && wanted > FREE_DAYS) {
    // The whole reason collection is free: this wall can quote the server's own
    // number back at them. An empty board persuades nobody.
    const totals = await guildTotals(interaction.guildId, 90);
    const known = totals.seconds
      ? `**${formatDuration(totals.seconds)}** across **${totals.officers}** officer${totals.officers === 1 ? '' : 's'} is already recorded on this server, waiting to be read.\n\n`
      : '';

    const wall = limitReply('days of patrol history', FREE_DAYS, 'the full 90 days and every officer');
    return interaction.editReply({
      ...wall,
      embeds: [new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('Longer periods are part of Premium')
        .setDescription(
          known +
          `The free board covers the last ${FREE_DAYS} days and the top ${FREE_ROWS}. ` +
          'Premium opens the 30 and 90 day views, the full roster, and a board that posts itself every week.\n\n' +
          `You can have all of it free for ${TRIAL_DAYS} days, with nothing to pay.`
        )
        .setFooter({ text: 'RPM' })],
    });
  }

  const days = access.allowed ? wanted : FREE_DAYS;
  const rows = await leaderboard(interaction.guildId, days, access.allowed ? 25 : FREE_ROWS);

  if (!rows.length) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('Nothing recorded yet')
        .setDescription(
          `No patrol time in the last ${days} days.\n\n` +
          'Hours start counting as soon as two or more people sit in a patrol voice channel together.'
        )
        .setFooter({ text: 'RPM' })],
    });
  }

  const lines = rows.map((r, i) => {
    const place = `\`${String(i + 1).padStart(2, ' ')}.\``;
    return `${place} <@${r._id}> · **${formatDuration(r.seconds)}** · ${r.sessions} shift${r.sessions === 1 ? '' : 's'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle(`Patrol board, last ${days} days`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'RPM' });

  if (!access.allowed) {
    embed.addFields({
      name: 'Showing the top ' + FREE_ROWS,
      value: `Premium opens the full roster, 30 and 90 day views, and a board that updates itself. Free for ${TRIAL_DAYS} days with \`/premium\`.`,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}
