import { v4 as uuidv4 } from 'uuid';
import PremiumFund from '../models/PremiumFund.js';
import PremiumKey from '../models/PremiumKey.js';
import GuildTrial from '../models/GuildTrial.js';
import { clearPremiumCache, chipInUrl } from './premiumCheck.js';

/**
 * Chip in for Premium.
 *
 * Members put $2, $3 or $5 toward their server's Premium through the site's
 * Stripe checkout (routes/checkout.js). Every $5 raised becomes a month of
 * Premium, held as a PremiumKey with plan 'fund' and an expiry date; what is
 * left over waits for the next chip-in. Many owners are young and cannot pay
 * $5 alone. Their members can, a little each.
 */

export const FUND_GOAL_CENTS = 500;
export const FUND_MONTH_DAYS = 30;
export const CHIP_AMOUNTS = [200, 300, 500];

const DAY = 86400000;
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

export const dollars = (cents) => '$' + ((Number(cents) || 0) / 100).toFixed(2);

/** A text progress bar, for Discord. */
export function progressBar(cents, goal = FUND_GOAL_CENTS, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round(((Number(cents) || 0) / goal) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// One chip-in at a time per server, so two landing together cannot both read
// the same expiry and lose a month. The bot and the site share one process.
const locks = new Map();
function withLock(guildId, fn) {
  const run = (locks.get(guildId) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(guildId, tail);
  tail.then(() => { if (locks.get(guildId) === tail) locks.delete(guildId); });
  return run;
}

function newKeyValue() {
  const seg = () => uuidv4().replace(/-/g, '').toUpperCase().slice(0, 4);
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

/** What a server's members have raised, and until when it has paid for Premium. */
export async function fundStatus(guildId) {
  const [fund, key] = await Promise.all([
    PremiumFund.findOne({ guildId }).lean(),
    PremiumKey.findOne({ guildId, plan: 'fund' }).lean(),
  ]);
  const until = key?.expiresAt && new Date(key.expiresAt) > new Date() ? new Date(key.expiresAt) : null;
  return {
    balanceCents: fund?.balanceCents || 0,
    raisedCents: fund?.raisedCents || 0,
    monthsUnlocked: fund?.monthsUnlocked || 0,
    goalCents: FUND_GOAL_CENTS,
    until,
  };
}

/** Count one payment, once. False when it was already counted. */
async function recordContribution({ guildId, userId, amountCents, stripeSessionId }) {
  const entry = { stripeSessionId, userId, amountCents, at: new Date() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await PremiumFund.findOneAndUpdate(
        { guildId, 'contributions.stripeSessionId': { $ne: stripeSessionId } },
        {
          $inc: { balanceCents: amountCents, raisedCents: amountCents },
          $push: { contributions: entry },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, new: true },
      );
      return true;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Either this payment is already counted, or another chip-in created
      // the server's fund at the same moment. Only the first means stop.
      if (await PremiumFund.exists({ guildId, 'contributions.stripeSessionId': stripeSessionId })) return false;
    }
  }
  return false;
}

/** Add months of Premium, starting after whatever is already running. */
async function extendFundMonths(guildId, months, guildName) {
  const now = new Date();
  const [key, trial] = await Promise.all([
    PremiumKey.findOne({ guildId, plan: 'fund' }),
    GuildTrial.findOne({ guildId, active: true }).lean(),
  ]);
  // An earlier month from the fund, or the free trial: none of it is wasted.
  let start = now;
  if (key?.expiresAt && new Date(key.expiresAt) > start) start = new Date(key.expiresAt);
  if (trial?.expiresAt && new Date(trial.expiresAt) > start) start = new Date(trial.expiresAt);
  const until = new Date(start.getTime() + months * FUND_MONTH_DAYS * DAY);

  if (key) {
    key.expiresAt = until;
    key.endedDmAt = null;
    key.fundReminderAt = null;
    if (guildName) key.guildName = guildName;
    await key.save();
  } else {
    await PremiumKey.create({
      key: newKeyValue(),
      plan: 'fund',
      guildId,
      guildName: guildName || null,
      activatedAt: now,
      activatedVia: 'fund',
      expiresAt: until,
    });
  }
  clearPremiumCache(guildId);
  return until;
}

/**
 * Count a completed chip-in and turn every full $5 into a month of Premium.
 * Idempotent per Stripe session: the webhook and the success page both call it.
 */
export function applyContribution({ guildId, userId = null, amountCents, stripeSessionId, guildName = null }) {
  return withLock(guildId, async () => {
    const counted = await recordContribution({ guildId, userId, amountCents, stripeSessionId });
    if (!counted) return { applied: false, months: 0, ...(await fundStatus(guildId)) };

    let months = 0;
    for (;;) {
      const took = await PremiumFund.findOneAndUpdate(
        { guildId, balanceCents: { $gte: FUND_GOAL_CENTS } },
        { $inc: { balanceCents: -FUND_GOAL_CENTS, monthsUnlocked: 1 } },
      );
      if (!took) break;
      months++;
    }
    if (months) await extendFundMonths(guildId, months, guildName);
    return { applied: true, months, ...(await fundStatus(guildId)) };
  });
}

/**
 * Three days before a month paid for by members runs out, and once it has,
 * tell the owner, with the link to pass on so members can keep it going.
 * Runs with the trial checks in index.js.
 */
export async function checkFundMonths(client) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * DAY);

  const ending = await PremiumKey.find({ plan: 'fund', expiresAt: { $gt: now, $lt: soon }, fundReminderAt: null });
  for (const key of ending) {
    key.fundReminderAt = now;
    await key.save();
    await tellOwner(client, key, 'ending');
  }

  const ended = await PremiumKey.find({ plan: 'fund', expiresAt: { $lte: now }, endedDmAt: null });
  for (const key of ended) {
    key.endedDmAt = now;
    await key.save();
    clearPremiumCache(key.guildId);
    await tellOwner(client, key, 'ended');
  }
}

async function tellOwner(client, key, kind) {
  const guild = client?.guilds?.cache?.get(key.guildId);
  if (!guild?.ownerId) return;
  const { balanceCents } = await fundStatus(key.guildId);
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const url = chipInUrl('fund_' + kind, key.guildId);
  const raised = '**' + dollars(balanceCents) + ' of ' + dollars(FUND_GOAL_CENTS) + '** is raised toward the next month.';

  const embed = new EmbedBuilder().setColor(0x2d2d2d).setFooter({ text: 'RPM' });
  if (kind === 'ending') {
    embed.setTitle('Premium from your members ends in 3 days')
      .setDescription(
        'The Premium your members paid for on **' + guild.name + '** runs until <t:' + unix(key.expiresAt) + ':f>.\n\n' +
        raised + ' Share the chip-in link with your members to keep it going:\n' + url
      );
  } else {
    embed.setTitle('Premium from your members has ended')
      .setDescription(
        'The month your members paid for on **' + guild.name + '** is over, so the Premium features are off. ' +
        'Nothing is deleted: everything comes straight back when Premium is on again.\n\n' +
        raised + ' At ' + dollars(FUND_GOAL_CENTS) + ' it turns on for another month:\n' + url
      );
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Chip in').setStyle(ButtonStyle.Link).setURL(url),
  );
  const owner = await client.users.fetch(guild.ownerId).catch(() => null);
  if (owner) await owner.send({ embeds: [embed], components: [row] }).catch(() => {});
}
