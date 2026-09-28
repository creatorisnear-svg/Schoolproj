import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyConfig from '../models/EconomyConfig.js';
import VoteReminder from '../models/VoteReminder.js';

/**
 * A reason to vote on Top.gg.
 *
 * Votes used to give nothing, so the bot got three a month, and Top.gg ranks
 * by votes. A vote now pays in-game cash in every server where the voter uses
 * the economy, at the amount each server sets (500 unless the owner changes
 * it, 0 turns it off), doubled at weekends like Top.gg's own weighting. The
 * reward is the server's own currency, so it costs nothing real and gives
 * members a reason to vote every 12 hours.
 */

export const DEFAULT_VOTE_REWARD = 500;
const REMIND_AFTER_MS = 12 * 60 * 60 * 1000;

export function voteUrl(client) {
  return 'https://top.gg/bot/' + (process.env.TOPGG_BOT_ID || client?.user?.id || '1441306995641683978') + '/vote';
}

export async function rewardVoteInServers(client, userId, weekend) {
  const balances = await EconomyBalance.find({ userId }).lean();
  const inServer = balances.filter((b) => client?.guilds?.cache?.has(b.guildId));
  if (!inServer.length) return [];
  const configs = await EconomyConfig.find({ guildId: { $in: inServer.map((b) => b.guildId) }, enabled: { $ne: false } }).lean();

  const paid = [];
  for (const cfg of configs) {
    const base = Number.isFinite(cfg.voteReward) ? cfg.voteReward : DEFAULT_VOTE_REWARD;
    if (!(base > 0)) continue;
    const bal = inServer.find((b) => b.guildId === cfg.guildId);
    const room = Math.max(0, (cfg.maxBalance || Infinity) - ((bal.cash || 0) + (bal.bank || 0)));
    const give = Math.min(weekend ? base * 2 : base, room);
    if (!(give > 0)) continue;
    await EconomyBalance.updateOne({ guildId: cfg.guildId, userId }, { $inc: { cash: give } });
    paid.push({ guildId: cfg.guildId, name: client.guilds.cache.get(cfg.guildId)?.name || 'a server', amount: give, symbol: cfg.currencySymbol || '$' });
  }
  return paid;
}

export function thanksMessage(client, paid, weekend) {
  const list = paid.slice(0, 10).map((p) => '**' + p.symbol + p.amount.toLocaleString('en-US') + '** in ' + p.name).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Thanks for voting')
    .setDescription(
      (paid.length ? 'Your reward is in your cash:\n' + list + (paid.length > 10 ? '\nand ' + (paid.length - 10) + ' more servers' : '') + '\n\n' : '') +
      'Every vote helps console RP servers find the bot. You can vote again in 12 hours' +
      (weekend ? ', and votes count double at the weekend.' : '.') +
      (paid.length ? '' : '\n\n-# Use the economy in a server with RolePlayManager and each vote pays you there too.')
    )
    .setFooter({ text: 'RPM' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vote_remind').setLabel('Remind me in 12 hours').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('Vote page').setStyle(ButtonStyle.Link).setURL(voteUrl(client)),
  );
  return { embeds: [embed], components: [row] };
}

/** The Remind me button in the thank-you DM. */
export async function handleVoteRemind(interaction) {
  await VoteReminder.findOneAndUpdate(
    { userId: interaction.user.id },
    { $set: { remindAt: new Date(Date.now() + REMIND_AFTER_MS) } },
    { upsert: true },
  );
  return interaction.update({ content: 'I will message you when you can vote again.', components: [] });
}

/** Every few minutes: tell whoever asked that they can vote again. */
export async function sendDueVoteReminders(client) {
  const due = await VoteReminder.find({ remindAt: { $lte: new Date() } }).limit(50).lean();
  for (const r of due) {
    await VoteReminder.deleteOne({ _id: r._id });
    const user = await client.users.fetch(r.userId).catch(() => null);
    if (!user) continue;
    await user.send({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('You can vote again')
        .setDescription('Your 12 hours are up. Vote for RolePlayManager on Top.gg and collect your reward in every server where you use the economy.')
        .setFooter({ text: 'RPM' })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Vote now').setStyle(ButtonStyle.Link).setURL(voteUrl(client)))],
    }).catch(() => {});
  }
  return due.length;
}
