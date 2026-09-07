import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Telling the people who pay what is happening to their Premium.
 *
 * The only subscriber the bot ever had was lost to a declined card: Stripe
 * retried for two weeks and cancelled, and in all that time nobody on the
 * server side was told anything. These are the messages that would have kept
 * them.
 */

const ID = /^\d{17,20}$/;

/** Who to tell: whoever bought it, whoever activated it, and the server owner. */
export function premiumContacts(client, keyDoc) {
  const ids = new Set();
  if (ID.test(keyDoc?.purchasedBy || '')) ids.add(keyDoc.purchasedBy);
  if (ID.test(keyDoc?.activatedBy || '')) ids.add(keyDoc.activatedBy);
  const guild = keyDoc?.guildId ? client?.guilds?.cache?.get(keyDoc.guildId) : null;
  if (guild?.ownerId) ids.add(guild.ownerId);
  return [...ids];
}

/** Send one payload to several people; a closed DM is not an error. */
export async function dmUsers(client, userIds, payload) {
  let sent = 0;
  for (const id of userIds) {
    try {
      const user = await client.users.fetch(id);
      await user.send(payload);
      sent++;
    } catch {
      // DMs closed, or the user is gone. Nothing to do about either.
    }
  }
  return sent;
}

const money = (amount, currency) =>
  (amount / 100).toLocaleString('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() });

const pricingUrl = (source, guildId) =>
  `https://roleplaymanager.xyz/pricing?from=${encodeURIComponent(source)}` + (guildId ? `&guild=${guildId}` : '');

export function paymentFailedMessage({ guildName, amount, currency, invoiceUrl, nextAttemptAt, final }) {
  const when = nextAttemptAt
    ? `Stripe will try the card again on ${new Date(nextAttemptAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
    : 'That was the last automatic try.';
  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Premium payment did not go through')
    .setDescription(
      `The ${money(amount, currency)} payment for Premium on **${guildName || 'your server'}** was declined by the card's bank.\n\n` +
      `Premium stays on for now. ${when} ` +
      (final
        ? 'Premium turns off after that unless the invoice is paid, and everything you set up stays saved either way.'
        : 'Paying the invoice now, with this card or another one, clears it straight away.') +
      `\n\n-# The usual reason is insufficient funds or an expired card. Nothing is deleted when Premium ends.`
    )
    .setFooter({ text: 'RPM' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Pay the invoice').setStyle(ButtonStyle.Link).setURL(invoiceUrl || pricingUrl('failed', null)),
    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL('https://discord.gg/cSdhfGPeV2')
  );
  return { embeds: [embed], components: [row] };
}

export function subscriptionEndedMessage({ guildName, guildId, reason }) {
  const why = reason === 'payment_failed'
    ? 'The card could not be charged after several tries, so the subscription has ended.'
    : 'The subscription has ended.';
  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Premium has turned off')
    .setDescription(
      `${why} Premium features on **${guildName || 'your server'}** have stopped.\n\n` +
      'Nothing was deleted. Your patrol channels, dispatch settings and everything else are exactly as you left them, ' +
      'so turning Premium back on puts it all straight back.\n\n' +
      'Premium is $5 a month. The link below already knows which server it is for.'
    )
    .setFooter({ text: 'RPM' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Turn Premium back on').setStyle(ButtonStyle.Link).setURL(pricingUrl('lapsed', guildId)),
    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL('https://discord.gg/cSdhfGPeV2')
  );
  return { embeds: [embed], components: [row] };
}

export function premiumActivatedMessage({ guildName, plan }) {
  const what = { monthly: 'Monthly Premium', quarterly: '3-month Premium', lifetime: 'Lifetime Premium' }[plan] || 'Premium';
  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Premium is on')
    .setDescription(
      `${what} is now active on **${guildName || 'your server'}**. There is nothing else to do.\n\n` +
      'Every Premium feature is unlocked: AI Voice Dispatch, the Priority Tracker, unlimited applications, ' +
      'and the rest. Run `/premium` in the server to see the full list, or `/setup` to switch things on.'
    )
    .setFooter({ text: 'RPM' });
  return { embeds: [embed] };
}
