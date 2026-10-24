import PremiumGift from '../models/PremiumGift.js';
import Outreach from '../models/Outreach.js';

/**
 * Sorry for the October 2026 outage. The Dell was switched off from Oct 21 to
 * Oct 23 and the bot with it. Every server the bot was in gets 3 days of
 * Premium, unless it already pays for Premium, and 3 days of RPM CyberCom,
 * unless it already has it. Each owner gets one message saying sorry and what
 * their servers got.
 *
 * It runs once: the campaign row records when it started (the 3 days count
 * from then, across restarts). Gifts are unique per server, and each owner's
 * message is claimed before it is sent. endGifts then switches the gifts off
 * on time.
 */
export const OUTAGE = { reason: 'outage-2026-10', days: 3 };
const DAY = 24 * 60 * 60 * 1000;
const SITE = 'https://roleplaymanager.xyz';
const PAUSE_MS = 1500; // between owners' DMs, so a hundred of them is not a burst

const campaignKey = `campaign:${OUTAGE.reason}`;

async function campaignStart() {
  try {
    await Outreach.create({ key: campaignKey, kind: 'campaign', guildId: '-' });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  return Outreach.findOne({ key: campaignKey }).lean();
}

/** What each server gets: { premium, cybercom } (true when it is given). */
async function decide(guildId) {
  const { isPremiumGuild } = await import('./premiumCheck.js');
  const { cyberComSubscribed } = await import('../cybercom/access.js');
  return {
    premium: !(await isPremiumGuild(guildId).catch(() => false)),
    cybercom: !(await cyberComSubscribed(guildId).catch(() => false)),
  };
}

async function give(guildId, kind, startsAt, endsAt) {
  await PremiumGift.updateOne(
    { guildId, kind, reason: OUTAGE.reason },
    { $setOnInsert: { startsAt, endsAt } },
    { upsert: true },
  );
}

export async function outageMessage(servers, endsAt) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const lines = servers.map((s) => {
    if (s.premium && s.cybercom) return `**${s.name}**: Premium and RPM CyberCom`;
    if (s.cybercom) return `**${s.name}**: RPM CyberCom (it already has Premium)`;
    if (s.premium) return `**${s.name}**: Premium (it already has RPM CyberCom)`;
    return `**${s.name}**: it already has Premium and RPM CyberCom, so there was nothing to add`;
  });
  const anything = servers.some((s) => s.premium || s.cybercom);
  const body = [
    'RolePlayManager was offline from October 21 to October 23 because the server it runs on was switched off. Sorry for the trouble it caused you and your members.',
    '',
    anything ? `To make up for it, these are free for the next ${OUTAGE.days} days, until <t:${Math.floor(endsAt.getTime() / 1000)}:F>:` : 'Your servers already have everything:',
    ...lines,
  ];
  if (servers.some((s) => s.premium)) body.push('', '**Premium** unlocks AI Voice Dispatch, the Priority Tracker, Patrol Hours, unlimited Applications and the Blacklist System.');
  if (servers.some((s) => s.cybercom)) body.push('', '**RPM CyberCom** puts a bot in every voice channel for traffic stops, 10-80s and voice moderation. Set it up with `/config cybercom`.');
  if (anything) body.push('', `Both switch off on their own when the ${OUTAGE.days} days are up. Nothing is charged, nothing you set up is deleted, and your own free trials are still there for later.`);
  return {
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Sorry for the downtime').setDescription(body.join('\n').slice(0, 4000)).setFooter({ text: 'RPM' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('RPM CyberCom').setStyle(ButtonStyle.Link).setURL(`${SITE}/cybercom/`),
      new ButtonBuilder().setLabel('Support server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/cSdhfGPeV2'),
    )],
    allowedMentions: { parse: [] },
  };
}

/** Give the gifts and send the messages. Safe to call again: it carries on where it stopped. */
export async function runOutageGift(client, { pauseMs = PAUSE_MS } = {}) {
  if (!client?.isReady?.() && !client?.__test) return { ready: false };
  const campaign = await campaignStart();
  const startsAt = new Date(campaign.sentAt);
  const endsAt = new Date(startsAt.getTime() + OUTAGE.days * DAY);
  if (Date.now() >= endsAt.getTime()) return { over: true };

  // The gifts, for every server the bot is in.
  const byOwner = new Map();
  let gifts = 0;
  const { clearPremiumCache } = await import('./premiumCheck.js');
  for (const guild of client.guilds.cache.values()) {
    // Only servers that had the bot when this started, not ones added since.
    if (guild.joinedTimestamp && guild.joinedTimestamp > startsAt.getTime()) continue;
    const got = await decide(guild.id);
    const before = await PremiumGift.countDocuments({ guildId: guild.id, reason: OUTAGE.reason });
    if (got.premium) await give(guild.id, 'premium', startsAt, endsAt);
    if (got.cybercom) await give(guild.id, 'cybercom', startsAt, endsAt);
    // Already given in an earlier run: what it got then is what counts.
    const given = await PremiumGift.find({ guildId: guild.id, reason: OUTAGE.reason }).lean();
    if (given.length > before) {
      gifts += given.length - before;
      // Clears every cache and tells index.js, which switches AI dispatch to full now.
      clearPremiumCache(guild.id);
    }
    if (!guild.ownerId) continue;
    if (!byOwner.has(guild.ownerId)) byOwner.set(guild.ownerId, []);
    byOwner.get(guild.ownerId).push({
      name: guild.name,
      premium: given.some((g) => g.kind === 'premium'),
      cybercom: given.some((g) => g.kind === 'cybercom'),
    });
  }
  if (gifts) {
    const { clearCyberComCache } = await import('../cybercom/access.js');
    clearCyberComCache();
    console.log(`[Gift] ${gifts} gift(s) given for ${OUTAGE.reason}, until ${endsAt.toISOString()}`);
  }

  // One message per owner, once.
  const { dmUsers } = await import('./premiumNotify.js');
  let sent = 0, closed = 0;
  for (const [ownerId, servers] of byOwner) {
    const key = `gift-msg:${OUTAGE.reason}:${ownerId}`;
    try {
      await Outreach.create({ key, kind: 'gift-msg', guildId: '-', userId: ownerId });
    } catch (err) {
      if (err?.code === 11000) continue;
      throw err;
    }
    const ok = await dmUsers(client, [ownerId], await outageMessage(servers, endsAt)).catch(() => 0);
    await Outreach.updateOne({ key }, { $set: { delivered: ok > 0 } });
    if (ok > 0) sent++; else closed++;
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  if (sent || closed) console.log(`[Gift] sorry messages: ${sent} sent, ${closed} owners with DMs closed`);
  return { gifts, sent, closed, endsAt };
}

/** Switch gifts off when their time is up: caches, AI dispatch, branding, CyberCom helpers. */
export async function endGifts() {
  const due = await PremiumGift.find({ endsAt: { $lte: new Date() }, endHandled: false }).limit(500);
  if (!due.length) return 0;
  const { clearPremiumCache } = await import('./premiumCheck.js');
  const { cyberComChanged } = await import('../cybercom/access.js');
  for (const gift of due) {
    gift.endHandled = true;
    await gift.save();
    // clearPremiumCache tells index.js, which puts AI dispatch back to its
    // free mode and the bot's own look back once Premium is gone.
    if (gift.kind === 'premium') clearPremiumCache(gift.guildId);
    // The CyberCom helpers leave on the coordinator's next scan.
    else await cyberComChanged(gift.guildId);
  }
  console.log(`[Gift] ${due.length} gift(s) ended`);
  return due.length;
}
