import Donation from '../models/Donation.js';
import { matchLine } from '../cybercom/flags.js';

/**
 * Donations to RolePlayManager (roleplaymanager.xyz/donate): one-off Stripe
 * payments with a name and a note. The donor chooses whether both appear on
 * the donate page; the bot's owner hears about every one in a DM, with a
 * button to take it off the page, and sees them all in the dev panel.
 */
export const DONATION_MIN_CENTS = 100;
export const DONATION_MAX_CENTS = 50000;
export const NAME_MAX = 40;
export const NOTE_MAX = 300;

const dollars = (cents) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);

/** Plain text, one line for names, control characters out, cut to max. */
export function cleanText(value, max, multiline = false) {
  let s = String(value == null ? '' : value).normalize('NFKC');
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

/**
 * Whether a name or note must stay off the public page: links (people
 * paying a dollar to advertise) and slurs or hate. The owner still sees it.
 */
export function needsScreening(name, note) {
  const text = `${name || ''}\n${note || ''}`;
  if (/https?:\/\/|www\.|discord\.(gg|com\/invite)|\b[a-z0-9-]+\.(com|net|org|gg|xyz|io|me|tv|ru|cc)\b/i.test(text)) return true;
  return matchLine(text, { flagSelfHarm: false, flagThreats: false }).some((m) => m.direct);
}

/**
 * Record a paid donation checkout. { doc, fresh }: fresh only the first
 * time, so the owner is told once even though the webhook and the success
 * page both get here.
 */
export async function recordDonation(session) {
  const m = session.metadata || {};
  const name = cleanText(m.name, NAME_MAX);
  const note = cleanText(m.note, NOTE_MAX, true);
  const screened = needsScreening(name, note);
  const fields = {
    stripeSessionId: session.id,
    amountCents: Number(session.amount_total) || 0,
    currency: session.currency || 'usd',
    name, note,
    showOnPage: m.show === '1',
    hidden: screened,
    hiddenReason: screened ? 'screened' : null,
    discordId: /^\d{17,20}$/.test(m.discordId || '') ? m.discordId : null,
  };
  try {
    const res = await Donation.findOneAndUpdate(
      { stripeSessionId: session.id },
      { $setOnInsert: fields },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    if (!res.lastErrorObject?.updatedExisting) wallCache = null;
    return { doc: res.value, fresh: !res.lastErrorObject?.updatedExisting };
  } catch (err) {
    // The webhook and the success page at the same moment: the other one won.
    if (err?.code !== 11000) throw err;
    return { doc: await Donation.findOne({ stripeSessionId: session.id }).lean(), fresh: false };
  }
}

// ── The donate page's list ─────────────────────────────────────────────────

let wallCache = null;
/** The latest donations shown on the page, newest first, cached a minute. */
export async function publicDonations() {
  if (wallCache && Date.now() - wallCache.at < 60000) return wallCache.value;
  const docs = await Donation.find({ showOnPage: true, hidden: false }).sort({ createdAt: -1 }).limit(30).lean();
  const value = docs.map((d) => ({ name: d.name || '', note: d.note || '', amountCents: d.amountCents, at: d.createdAt }));
  wallCache = { at: Date.now(), value };
  return value;
}

export async function setDonationHidden(id, hidden) {
  const doc = await Donation.findByIdAndUpdate(String(id), { $set: { hidden: !!hidden, hiddenReason: hidden ? 'owner' : null } }, { new: true }).lean();
  wallCache = null;
  return doc;
}

// ── Telling people ──────────────────────────────────────────────────────────

let ownerId = null;
/** The bot's owner: whoever owns its Discord application (a team's owner for a team). */
export async function botOwnerId(client) {
  if (ownerId) return ownerId;
  try {
    const app = client.application?.owner ? client.application : await client.application?.fetch();
    const owner = app?.owner;
    ownerId = owner?.ownerId || owner?.id || null;
  } catch {}
  return ownerId;
}

/** What the owner's message says about whether it is on the page. */
function pageStatus(doc) {
  if (!doc.showOnPage) return 'Private: the donor asked to keep it off the donate page.';
  if (doc.hidden) return doc.hiddenReason === 'screened'
    ? 'Kept off the donate page: it has a link or a slur in it.'
    : 'Hidden from the donate page.';
  return 'Shown on the donate page.';
}

export async function donationMessage(doc) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const embed = new EmbedBuilder().setColor(0x43b581)
    .setTitle(`New donation: ${dollars(doc.amountCents)}`)
    .setDescription([
      `**From:** ${doc.name || 'someone who left no name'}${doc.discordId ? ` (<@${doc.discordId}>)` : ''}`,
      doc.note ? `**Note:**\n>>> ${doc.note}` : '**Note:** none',
    ].join('\n'))
    .setFooter({ text: pageStatus(doc) })
    .setTimestamp(new Date(doc.createdAt));
  const components = [];
  if (doc.showOnPage && doc.hiddenReason !== 'screened') {
    components.push(new ActionRowBuilder().addComponents(doc.hidden
      ? new ButtonBuilder().setCustomId(`donation_show_${doc._id}`).setLabel('Show on the page again').setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder().setCustomId(`donation_hide_${doc._id}`).setLabel('Hide from the page').setStyle(ButtonStyle.Danger)));
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

/** The owner hears about every donation; a donor signed in with Discord is thanked. */
export async function announceDonation(client, doc) {
  if (!client) return;
  const { dmUsers } = await import('./premiumNotify.js');
  const owner = await botOwnerId(client);
  if (owner) await dmUsers(client, [owner], await donationMessage(doc)).catch(() => {});
  if (doc.discordId && doc.discordId !== owner) {
    const { EmbedBuilder } = await import('discord.js');
    await dmUsers(client, [doc.discordId], { embeds: [new EmbedBuilder().setColor(0x43b581)
      .setTitle('Thank you for your donation')
      .setDescription(`Your ${dollars(doc.amountCents)} keeps RolePlayManager running.`
        + (doc.note ? ' Your note went to the developer' + (doc.showOnPage && !doc.hidden ? ' and is on the donate page.' : '.') : ''))
      .setFooter({ text: 'RPM' })] }).catch(() => {});
  }
}

/** "Hide from the page" and "Show on the page again" in the owner's DM. */
export async function handleDonationButton(interaction) {
  const [, action, id] = interaction.customId.split('_');
  if (interaction.user.id !== await botOwnerId(interaction.client)) {
    return interaction.reply({ content: 'Only the bot\'s owner can change this.', flags: 64 });
  }
  const doc = await setDonationHidden(id, action === 'hide').catch(() => null);
  if (!doc) return interaction.reply({ content: 'That donation is not there any more.', flags: 64 });
  return interaction.update(await donationMessage(doc));
}
