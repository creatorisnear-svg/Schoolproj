import PremiumKey from '../models/PremiumKey.js';
import { clearPremiumCache } from './premiumCheck.js';

/**
 * Premium bought inside Discord, through the app's Store and the Premium
 * button on walls.
 *
 * Discord's developer policy asks apps sold elsewhere to be sold in Discord
 * too, at the same price or less, where monetisation is available. This is
 * switched off until the owner sets up a server subscription SKU in the
 * Developer Portal and puts its id in DISCORD_PREMIUM_SKU_ID. Every purchase,
 * renewal and cancellation arrives as an entitlement event and is mirrored
 * into a PremiumKey, so everything else in the bot treats it like any other
 * Premium.
 */

export function storeSku() {
  const sku = process.env.DISCORD_PREMIUM_SKU_ID;
  return sku && /^\d{17,20}$/.test(sku) ? sku : null;
}

/** Mirror one entitlement into a PremiumKey. deleted is true for entitlementDelete. */
export async function syncEntitlement(entitlement, { deleted = false } = {}) {
  const sku = storeSku();
  if (!sku || !entitlement || entitlement.skuId !== sku) return null;
  const guildId = entitlement.guildId;
  if (!guildId) return null; // a user subscription, not a server one

  const ends = entitlement.endsTimestamp || null;
  const ended = deleted || !!entitlement.deleted || (ends && ends <= Date.now());
  const key = 'DISCORD-' + entitlement.id;

  const doc = await PremiumKey.findOneAndUpdate(
    { key },
    {
      $set: {
        plan: 'discord',
        subscriptionStatus: ended ? 'cancelled' : 'active',
        subscriptionCurrentPeriodEnd: ends ? new Date(ends) : null,
        discordEntitlementId: entitlement.id,
      },
      $setOnInsert: {
        key,
        guildId,
        purchasedBy: entitlement.userId || null,
        activatedBy: entitlement.userId || null,
        activatedAt: new Date(),
        activatedVia: 'discord',
      },
    },
    { upsert: true, new: true },
  );
  clearPremiumCache(guildId);
  return doc;
}

/** On startup: catch up on anything bought while the bot was offline. */
export async function reconcileEntitlements(client) {
  if (!storeSku() || !client.application) return 0;
  try {
    const list = await client.application.entitlements.fetch({ skus: [storeSku()], excludeEnded: true });
    let n = 0;
    for (const e of list.values()) { if (await syncEntitlement(e)) n++; }
    if (n) console.log('[Discord Store] reconciled ' + n + ' active server subscriptions');
    return n;
  } catch (err) {
    console.warn('[Discord Store] could not fetch entitlements:', err.message);
    return 0;
  }
}
