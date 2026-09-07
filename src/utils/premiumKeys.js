import PremiumKey from '../models/PremiumKey.js';
import { isPremiumGuild, clearPremiumCache } from './premiumCheck.js';

/**
 * Attaching a premium key to a server.
 *
 * Three doors lead here: the /activatepremium command, the dashboard's
 * Activate Key box, and a checkout that already knows which server it was for.
 * They used to each carry their own copy of the rules, and the copies
 * disagreed: the dashboard refused any server that had ever held a key, so a
 * server whose subscription had lapsed could never buy again from there.
 *
 * The rules, once:
 *   - a key already on this server is fine (a second attempt is not an error)
 *   - a key on some other server is used
 *   - a cancelled subscription's key is dead
 *   - a server with live Premium keeps it; the new key stays unattached
 *   - a server whose old key has lapsed gets the old one moved aside
 */
export async function attachKeyToGuild({ keyDoc, guildId, guildName, userId, via }) {
  if (!keyDoc || !guildId) return { ok: false, reason: 'invalid' };

  if (keyDoc.guildId === guildId) return { ok: true, already: true };
  if (keyDoc.guildId) return { ok: false, reason: 'key_used' };
  if ((keyDoc.plan === 'monthly' || keyDoc.plan === 'quarterly') && keyDoc.subscriptionStatus === 'cancelled') {
    return { ok: false, reason: 'key_cancelled' };
  }

  if (await isPremiumGuild(guildId)) return { ok: false, reason: 'already_premium' };

  // A key that once served this server but no longer does. Moved aside rather
  // than deleted: it is the record of a sale.
  const lapsed = await PremiumKey.find({ guildId });
  for (const old of lapsed) {
    old.previousGuildId = old.guildId;
    old.guildId = null;
    old.replacedAt = new Date();
    await old.save();
  }

  keyDoc.guildId = guildId;
  keyDoc.guildName = guildName || keyDoc.guildName || null;
  keyDoc.activatedBy = userId || null;
  keyDoc.activatedAt = new Date();
  keyDoc.activatedVia = via || null;
  await keyDoc.save();

  clearPremiumCache(guildId);
  return { ok: true, already: false, replaced: lapsed.length };
}

/** The plain-words reason for a refusal, shared by every door. */
export function attachFailureMessage(reason) {
  return {
    invalid: 'Invalid premium key. Please check your key and try again.',
    key_used: 'This key has already been activated in another server.',
    key_cancelled: 'This subscription has been cancelled and is no longer valid.',
    already_premium: 'This server already has Premium. Nothing to activate.',
  }[reason] || 'Could not activate that key.';
}
