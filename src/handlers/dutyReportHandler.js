import { EmbedBuilder } from 'discord.js';
import DutyConfig from '../models/DutyConfig.js';
import DispatchConfig from '../models/DispatchConfig.js';
import CADConfig from '../models/CADConfig.js';
import { checkFeatureAccess } from '../utils/premiumCheck.js';
import { leaderboard, lastSeenFor, formatDuration } from '../utils/dutyTracker.js';

/**
 * The weekly artifacts: a board that posts itself, and a list of who stopped
 * turning up.
 *
 * This is the premium half. The free half is the recording and /duty, which run
 * everywhere; what is being sold is not having to ask "who has gone quiet"
 * from memory once a week.
 *
 * Both are reports. Neither warns, punishes or pings the person named. Quotas
 * enforced against unpaid volunteers turn this into surveillance and get the
 * whole thing switched off, so the bot says what happened and leaves the
 * decision to a human.
 */

const WEEK_MS = 7 * 86400000;

/** LEO roles, dispatch config first, same precedence the voice handler uses. */
async function leoRoleIds(guildId) {
  const [dispatchCfg, cadCfg] = await Promise.all([
    DispatchConfig.findOne({ guildId }).select('leoRoleIds').lean(),
    CADConfig.findOne({ guildId }).select('leoRoleIds').lean(),
  ]);
  return dispatchCfg?.leoRoleIds?.length ? dispatchCfg.leoRoleIds : (cadCfg?.leoRoleIds ?? []);
}

async function buildBoard(guild) {
  const rows = await leaderboard(guild.id, 7, 25);

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Patrol board, last 7 days')
    .setFooter({ text: 'RPM · updates itself every week' })
    .setTimestamp();

  if (!rows.length) {
    embed.setDescription('Nobody has been on patrol in the last 7 days.');
    return embed;
  }

  embed.setDescription(rows.map((r, i) => {
    const place = `\`${String(i + 1).padStart(2, ' ')}.\``;
    return `${place} <@${r._id}> · **${formatDuration(r.seconds)}** · ${r.sessions} shift${r.sessions === 1 ? '' : 's'}`;
  }).join('\n'));

  const total = rows.reduce((n, r) => n + r.seconds, 0);
  embed.addFields({
    name: 'This week',
    value: `${formatDuration(total)} across ${rows.length} officer${rows.length === 1 ? '' : 's'}`,
  });
  return embed;
}

/** Post or edit the board. Edits in place so the channel is not filled up. */
async function postBoard(client, cfg) {
  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild || !cfg.boardChannelId) return false;

  const channel = guild.channels.cache.get(cfg.boardChannelId)
    || await guild.channels.fetch(cfg.boardChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return false;

  const embed = await buildBoard(guild);

  if (cfg.boardMessageId) {
    const existing = await channel.messages.fetch(cfg.boardMessageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(() => {});
      return true;
    }
  }

  const sent = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!sent) return false;

  cfg.boardMessageId = sent.id;
  await cfg.save().catch(() => {});
  return true;
}

/** Officers with a LEO role who have not patrolled recently. */
async function postInactivity(client, cfg) {
  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild || !cfg.reportChannelId) return false;

  const channel = guild.channels.cache.get(cfg.reportChannelId)
    || await guild.channels.fetch(cfg.reportChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return false;

  const roleIds = await leoRoleIds(cfg.guildId);
  if (!roleIds.length) return false;

  const members = await guild.members.fetch().catch(() => null);
  if (!members) return false;

  const officers = [...members.values()].filter(
    (m) => !m.user.bot && m.roles.cache.some((r) => roleIds.includes(r.id))
  );
  if (!officers.length) return false;

  const seen = await lastSeenFor(cfg.guildId, officers.map((m) => m.id));
  const cutoff = Date.now() - (cfg.inactiveAfterDays || 14) * 86400000;

  const quiet = officers
    .map((m) => ({ m, last: seen.get(m.id) || null }))
    .filter(({ last }) => !last || new Date(last).getTime() < cutoff)
    .sort((a, b) => (a.last ? new Date(a.last) : 0) - (b.last ? new Date(b.last) : 0));

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle(`Officers not on patrol in ${cfg.inactiveAfterDays || 14} days`)
    .setFooter({ text: 'RPM · nobody has been messaged about this' })
    .setTimestamp();

  if (!quiet.length) {
    embed.setDescription(`All ${officers.length} officers have patrolled recently.`);
  } else {
    embed.setDescription(
      quiet.slice(0, 40).map(({ m, last }) => (
        `<@${m.id}> · ${last ? `last seen <t:${Math.floor(new Date(last).getTime() / 1000)}:R>` : 'never recorded'}`
      )).join('\n')
      + (quiet.length > 40 ? `\n\n-# and ${quiet.length - 40} more` : '')
    );
    embed.addFields({
      name: 'Summary',
      value: `${quiet.length} of ${officers.length} officers`,
    });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
  return true;
}

/**
 * Run the weekly jobs for every guild that is due one.
 *
 * Called hourly from the poller in index.js. Each guild carries its own
 * lastBoardAt so a redeploy cannot cause a double post, and the work is spread
 * rather than fired at all 115 servers at once.
 */
export async function runDutyReports(client) {
  const configs = await DutyConfig.find({ enabled: true }).lean(false);
  const now = Date.now();
  let boards = 0;
  let reports = 0;

  for (const cfg of configs) {
    // Premium checked per guild and per run, so a lapsed subscription stops the
    // reports without anyone having to remember to switch them off.
    const access = await checkFeatureAccess(cfg.guildId, 'dutytime');
    if (!access.allowed) continue;

    try {
      if (cfg.boardChannelId && (!cfg.lastBoardAt || now - new Date(cfg.lastBoardAt).getTime() >= WEEK_MS)) {
        if (await postBoard(client, cfg)) {
          cfg.lastBoardAt = new Date();
          await cfg.save().catch(() => {});
          boards++;
        }
      }

      if (cfg.reportChannelId && (!cfg.lastReportAt || now - new Date(cfg.lastReportAt).getTime() >= WEEK_MS)) {
        if (await postInactivity(client, cfg)) {
          cfg.lastReportAt = new Date();
          await cfg.save().catch(() => {});
          reports++;
        }
      }
    } catch (err) {
      console.error(`[Duty] Report error for ${cfg.guildId}:`, err.message);
    }

    // A full member fetch on a large server is heavy; do not stampede.
    await new Promise((r) => setTimeout(r, 250));
  }

  if (boards || reports) {
    console.log(`[Duty] Posted ${boards} board(s) and ${reports} inactivity report(s)`);
  }
}
