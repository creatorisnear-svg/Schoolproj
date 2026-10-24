import { PermissionFlagsBits } from 'discord.js';
import Outreach from '../models/Outreach.js';
import { giftUntil } from './premiumGift.js';

/**
 * One-time offers, each sent once per server, from what the sales showed
 * (Oct 2026): every buyer was a new server setting up a whole RP stack that
 * started the free trial and paid within days, while most servers never saw
 * Premium at all.
 *
 *   trial      the free Premium week, to the owner of a server that has set
 *              up 8 or more features but never tried Premium
 *   cybercom   the free RPM CyberCom trial, to whoever bought Premium
 *   yearly     yearly instead of monthly, after the first month
 *
 * A few per kind per run, so a backlog goes out over a day instead of all at
 * once. OUTREACH_OFF=1 in the bot's settings stops all of it.
 */
export const MIN_FEATURES_READY = 8;
const MIN_DAYS_IN_SERVER = 3;
const CYBERCOM_AFTER_DAYS = 2;
const YEARLY_AFTER_DAYS = 32; // the first renewal has gone through
const PER_RUN = 5;
const DAY = 24 * 60 * 60 * 1000;
const SITE = 'https://roleplaymanager.xyz';
const PAID_PLANS = ['monthly', 'quarterly', 'yearly', 'lifetime'];

const keyOf = (kind, guildId) => `${kind}:${guildId}`;

async function alreadySent(kind, guildId) {
  return !!(await Outreach.exists({ key: keyOf(kind, guildId) }));
}

/** Record first, then send: two runs at once cannot both send. */
async function claim(kind, guildId, userId) {
  try {
    await Outreach.create({ key: keyOf(kind, guildId), kind, guildId, userId });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function send(client, kind, guildId, userId, payload) {
  if (!(await claim(kind, guildId, userId))) return false;
  const { dmUsers } = await import('./premiumNotify.js');
  const sent = await dmUsers(client, [userId], payload).catch(() => 0);
  await Outreach.updateOne({ key: keyOf(kind, guildId) }, { $set: { delivered: sent > 0 } });
  console.log(`[Outreach] ${kind} offer for ${client.guilds.cache.get(guildId)?.name || guildId}: ${sent > 0 ? 'sent' : 'DMs closed'}`);
  return sent > 0;
}

function listOf(items) {
  return items.length <= 1 ? (items[0] || '') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

async function builders() {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const card = (title, body) => new EmbedBuilder().setColor(0x2d2d2d).setTitle(title).setDescription(body).setFooter({ text: 'RPM' });
  const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
  const action = (id, label) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Success);
  const link = (url, label) => new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
  return { card, row, action, link };
}

// ── The offers ──────────────────────────────────────────────────────────────

export async function trialOffer(guild, readyCount) {
  const { card, row, action, link } = await builders();
  const { TRIAL_DAYS } = await import('./premiumCheck.js');
  return {
    embeds: [card(`Premium is free for ${TRIAL_DAYS} days on ${guild.name}`,
      `**${guild.name}** has ${readyCount} RolePlayManager features set up. Servers set up like yours are the ones that get the most out of Premium:\n\n`
      + '- **AI Voice Dispatch**: officers talk on the police radio and the bot answers, runs plates and keeps the status board\n'
      + '- **Priority Tracker**, **Patrol Hours**, unlimited **Applications** and the **Blacklist System**\n\n'
      + `Try all of it free for ${TRIAL_DAYS} days. Nothing to pay, no card, and your settings stay exactly as they are when it ends.`)],
    components: [row(
      action(`outreach_trial_${guild.id}`, `Start the free ${TRIAL_DAYS} day trial`),
      link(`${SITE}/pricing?from=outreach&guild=${guild.id}`, 'What Premium adds'),
    )],
  };
}

export async function cyberComOffer(guild) {
  const { card, row, action, link } = await builders();
  const { CYBERCOM_TRIAL_DAYS } = await import('../cybercom/trial.js');
  return {
    embeds: [card(`Try RPM CyberCom free for ${CYBERCOM_TRIAL_DAYS} days`,
      `Thanks for running **${guild.name}** on Premium. Its add-on, RPM CyberCom, puts a bot in every voice channel:\n\n`
      + '- Officers call traffic stops and 10-80s by voice, and everyone is moved where they need to be\n'
      + '- Civilians say "RPM, move me to" and a name to join a friend\n'
      + '- Voice moderation flags slurs and real life threats to your staff, while roleplay stays in the game\n\n'
      + `Try it free for ${CYBERCOM_TRIAL_DAYS} days. No card, and when it ends the helper bots just leave unless you keep it for $9.99 a month.`)],
    components: [row(
      action(`outreach_cct_${guild.id}`, `Try it free for ${CYBERCOM_TRIAL_DAYS} days`),
      link(`${SITE}/cybercom/`, 'See how it works'),
    )],
  };
}

export async function yearlyOffer(guild) {
  const { card, row, action, link } = await builders();
  return {
    embeds: [card('Save $20 a year on Premium',
      `**${guild.name}** has had Premium for a month now. Switch to yearly and pay **$39.99 a year** instead of $60 in monthly payments.\n\n`
      + 'A yearly plan also cannot lapse on a card that fails at a monthly renewal. You can switch here, or any time from the Premium section of the dashboard.')],
    components: [row(
      action(`outreach_yearly_${guild.id}`, 'Switch to yearly'),
      link(`${SITE}/dashboard/?guild=${guild.id}`, 'Open the dashboard'),
    )],
  };
}

// ── Who gets which ──────────────────────────────────────────────────────────

async function readyFeatureCount(guildId) {
  const { getAllFeatureStatus } = await import('./featureStatus.js');
  const st = await getAllFeatureStatus(guildId);
  return Object.values(st).filter((s) => s.status === 'ready').length;
}

/**
 * One pass over every offer. deps lets the tests stand in for the slow parts
 * (counting a server's features reads a dozen collections).
 */
export async function runOutreachJob(client, deps = {}) {
  if (process.env.OUTREACH_OFF === '1') return { trial: 0, cybercom: 0, yearly: 0 };
  const readyCount = deps.readyCount || readyFeatureCount;
  const now = Date.now();
  const sent = { trial: 0, cybercom: 0, yearly: 0 };
  const { isPremiumGuild } = await import('./premiumCheck.js');
  const { default: GuildTrial } = await import('../models/GuildTrial.js');
  const { default: PremiumKey } = await import('../models/PremiumKey.js');
  const { default: CyberComSubscription } = await import('../models/CyberComSubscription.js');
  const { default: CyberComTrial } = await import('../models/CyberComTrial.js');

  // The free Premium week, to servers built like the ones that buy.
  for (const guild of client.guilds.cache.values()) {
    if (sent.trial >= PER_RUN) break;
    if (!guild.ownerId || (guild.memberCount || 0) < 3) continue;
    if (!guild.joinedTimestamp || now - guild.joinedTimestamp < MIN_DAYS_IN_SERVER * DAY) continue;
    if (await alreadySent('trial', guild.id)) continue;
    if (await GuildTrial.exists({ guildId: guild.id })) continue;
    if (await isPremiumGuild(guild.id).catch(() => true)) continue;
    // Free Premium given to it right now: offer the trial once that is over.
    if (await giftUntil(guild.id, 'premium')) continue;
    const ready = await readyCount(guild.id).catch(() => 0);
    if (ready < MIN_FEATURES_READY) continue;
    if (await send(client, 'trial', guild.id, guild.ownerId, await trialOffer(guild, ready))) sent.trial++;
  }

  const keys = await PremiumKey.find({
    plan: { $in: PAID_PLANS },
    guildId: { $ne: null },
    $or: [{ stripeSessionId: { $nin: [null, ''] } }, { stripeSubscriptionId: { $nin: [null, ''] } }],
  }).lean();

  // RPM CyberCom, to whoever bought Premium, a couple of days in.
  for (const key of keys) {
    if (sent.cybercom >= PER_RUN) break;
    const guild = client.guilds.cache.get(key.guildId);
    if (!guild || now - new Date(key.createdAt).getTime() < CYBERCOM_AFTER_DAYS * DAY) continue;
    if (key.subscriptionStatus && !['active', 'trialing'].includes(key.subscriptionStatus)) continue;
    if (await alreadySent('cybercom', guild.id)) continue;
    if (await CyberComSubscription.exists({ guildId: guild.id })) continue;
    if (await CyberComTrial.exists({ guildId: guild.id })) continue;
    if (await giftUntil(guild.id, 'cybercom')) continue;
    const to = key.purchasedBy || key.activatedBy || guild.ownerId;
    if (await send(client, 'cybercom', guild.id, to, await cyberComOffer(guild))) sent.cybercom++;
  }

  // Yearly, once the first monthly renewal has gone through.
  for (const key of keys) {
    if (sent.yearly >= PER_RUN) break;
    if (key.plan !== 'monthly' || !key.stripeSubscriptionId || (key.subscriptionStatus && key.subscriptionStatus !== 'active')) continue;
    const guild = client.guilds.cache.get(key.guildId);
    if (!guild || now - new Date(key.createdAt).getTime() < YEARLY_AFTER_DAYS * DAY) continue;
    if (await alreadySent('yearly', guild.id)) continue;
    const to = key.purchasedBy || key.activatedBy || guild.ownerId;
    if (await send(client, 'yearly', guild.id, to, await yearlyOffer(guild))) sent.yearly++;
  }
  return sent;
}

// ── The buttons on those DMs ────────────────────────────────────────────────

/** The server, if this person may act for it: its owner or someone with Manage Server. */
async function managedGuild(client, guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  if (guild.ownerId === userId) return guild;
  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.permissions?.has(PermissionFlagsBits.ManageGuild) ? guild : null;
}

/** Billing belongs to whoever bought Premium and to the owner, as on the dashboard. */
async function keyHolderGuild(client, guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const { default: PremiumKey } = await import('../models/PremiumKey.js');
  const key = await PremiumKey.findOne({ guildId, plan: 'monthly' }).lean();
  const holder = key?.purchasedBy || key?.activatedBy;
  return userId === guild.ownerId || userId === holder ? guild : null;
}

export async function handleOutreachButton(interaction) {
  const [, action, guildId] = interaction.customId.split('_');
  const client = interaction.client;
  const userId = interaction.user.id;
  const say = (content, components = []) => interaction.reply({ content, components, allowedMentions: { parse: [] } });

  if (action === 'trial') {
    const guild = await managedGuild(client, guildId, userId);
    if (!guild) return say('Only the server\'s owner, or someone with Manage Server there, can start its trial.');
    const { activateTrialForGuild, isPremiumGuild, isGuildOnTrial, clearPremiumCache } = await import('./premiumCheck.js');
    if (await isPremiumGuild(guildId)) return say(`**${guild.name}** already has Premium.`);
    if (await isGuildOnTrial(guildId)) return say(`**${guild.name}** already has its free trial running.`);
    const { giftUntil, giftTrialMessage } = await import('./premiumGift.js');
    const giftEnds = await giftUntil(guildId, 'premium');
    if (giftEnds) return say(giftTrialMessage(giftEnds));
    const r = await activateTrialForGuild(guildId, userId);
    if (!r.success) return say(`**${guild.name}** has already used its free trial.`);
    clearPremiumCache(guildId);
    console.log(`[Outreach] trial started from a DM for ${guild.name} (${guildId})`);
    return say(`Premium is on in **${guild.name}** until <t:${Math.floor(r.expiresAt.getTime() / 1000)}:F>. Run \`/setup\` there to set up AI Voice Dispatch and the rest.`);
  }

  if (action === 'cct') {
    const guild = await managedGuild(client, guildId, userId);
    if (!guild) return say('Only the server\'s owner, or someone with Manage Server there, can start its trial.');
    const { startCyberComTrial } = await import('../cybercom/trial.js');
    const r = await startCyberComTrial(guildId, userId);
    if (!r.ok) return say(r.reason === 'subscribed' ? `**${guild.name}** already has RPM CyberCom.` : `**${guild.name}** has already used its RPM CyberCom trial.`);
    console.log(`[Outreach] CyberCom trial started from a DM for ${guild.name} (${guildId})`);
    return say(`RPM CyberCom is on in **${guild.name}** until <t:${Math.floor(r.endsAt.getTime() / 1000)}:F>. Run \`/config cybercom\` there to pick your voice channels and add the helper bots.`);
  }

  if (action === 'yearly' || action === 'yearlyok') {
    const guild = await keyHolderGuild(client, guildId, userId);
    if (!guild) return say('Only the person who bought Premium for this server, or the server owner, can change its plan.');
    if (action === 'yearly') {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      return say(
        `Switching **${guild.name}** to yearly charges **$39.99 today, minus the unused part of this month**, and Premium then renews once a year from today. Nothing else changes.`,
        [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`outreach_yearlyok_${guildId}`).setLabel('Confirm the switch').setStyle(ButtonStyle.Success))],
      );
    }
    await interaction.deferReply();
    const { switchPremiumToYearly } = await import('../website/routes/checkout.js');
    const r = await switchPremiumToYearly(guildId);
    return interaction.editReply({ content: r.ok
      ? `Done. **${guild.name}** is on yearly Premium${r.periodEnd ? `, renewing <t:${Math.floor(new Date(r.periodEnd).getTime() / 1000)}:D>` : ''}.`
      : r.error });
  }
  return say('That button has expired.');
}
