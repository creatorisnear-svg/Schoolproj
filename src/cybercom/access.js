import CyberComSubscription from '../models/CyberComSubscription.js';

/**
 * Who has RPM CyberCom: its own subscription, $9.99 a month, with or without
 * Premium. It includes the AI voice dispatcher on the police radio
 * (checkFeatureAccess in premiumCheck.js lets 'dispatch' through for it).
 */
export const CYBERCOM_PRICE_CENTS = 999;
const ACTIVE = ['active', 'trialing', 'past_due', 'cancelling'];
const cache = new Map();
const TTL = 60 * 1000;

export async function cyberComSubscribed(guildId) {
  const sub = await CyberComSubscription.findOne({ guildId }).lean();
  return !!sub && ACTIVE.includes(sub.status);
}

export async function isCyberComActive(guildId) {
  if (!guildId) return false;
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = false;
  try { value = await cyberComSubscribed(guildId); } catch {}
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

export function clearCyberComCache(guildId) {
  if (guildId) cache.delete(guildId); else cache.clear();
}

/**
 * CyberCom started or stopped. It includes the AI dispatcher, so the Premium
 * change event goes out too: index.js re-checks what dispatch may do there.
 */
export async function cyberComChanged(guildId) {
  clearCyberComCache(guildId);
  const { clearPremiumCache } = await import('../utils/premiumCheck.js');
  clearPremiumCache(guildId);
}

/** The message a buyer gets: what to do next. */
export async function sendCyberComWelcome(client, userId, guildName) {
  if (!client || !userId) return;
  const { EmbedBuilder } = await import('discord.js');
  const { dmUsers } = await import('../utils/premiumNotify.js');
  await dmUsers(client, [userId], { embeds: [new EmbedBuilder().setColor(0x43b581).setTitle('RPM CyberCom is on')
    .setDescription('**' + (guildName || 'Your server') + '** has RPM CyberCom.\n\nNext, in your server: run `/setup` and open **RPM CyberCom**. Add the helper bots there, then pick your civilian, traffic stop and police radio channels.')
    .setFooter({ text: 'RPM' })] }).catch(() => {});
}
