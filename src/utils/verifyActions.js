/**
 * Approving and rejecting a pending verification.
 *
 * Pulled out of verifyHandler so Discord and the CAD staff tab do the same
 * thing. The interaction-shaped code stayed behind; what is here is the part
 * that touches roles, nicknames, DMs and the database, which is the part that
 * must not exist twice. A second copy on the web would be the one that forgets
 * to remove the unverified role, or to record the IP that a later blacklist
 * needs.
 *
 * Neither of these checks permissions. The caller does: Discord through its
 * button handler, the CAD through requireStaff on the route.
 */
import PendingVerification from '../models/PendingVerification.js';
import Verification from '../models/Verification.js';
import VerifiedUser from '../models/VerifiedUser.js';

/**
 * @returns {{ ok: boolean, reason?: string, userId?: string, psnxbox?: string }}
 *   reason is one of 'not_found' | 'no_config' | 'gone' | 'error'
 */
export async function approveVerification(guild, pendingId, approverId) {
  try {
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) return { ok: false, reason: 'not_found' };
    if (pending.guildId !== guild.id) return { ok: false, reason: 'not_found' };

    const verification = await Verification.findOne({ guildId: guild.id });
    if (!verification) return { ok: false, reason: 'no_config' };

    const member = await guild.members.fetch(pending.userId).catch(() => null);
    if (!member) {
      // They left before anybody got to them. Clear the row so the queue does
      // not keep offering a decision that cannot be carried out.
      await PendingVerification.findByIdAndDelete(pendingId);
      return { ok: false, reason: 'gone', userId: pending.userId };
    }

    const role = guild.roles.cache.get(verification.verifiedRoleId);
    if (role) await member.roles.add(role).catch(() => {});
    const unverifiedRole = guild.roles.cache.get(verification.unverifiedRoleId);
    if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});

    if (verification.rpTag && pending.psnxbox) {
      await member.setNickname(`${verification.rpTag} | ${pending.psnxbox}`).catch(() => {});
    }

    if (verification.verifyDMMessage) {
      await member.send(verification.verifyDMMessage.replace('{server}', guild.name)).catch(() => {});
    }

    // The IP matters beyond this moment: it is what an IP ban later resolves
    // against, so it has to be carried across from the pending row.
    await VerifiedUser.findOneAndUpdate(
      { guildId: guild.id, userId: pending.userId },
      { psnxbox: pending.psnxbox, ipAddress: pending.ipAddress || null, verifiedAt: new Date() },
      { upsert: true }
    );

    await PendingVerification.findByIdAndDelete(pendingId);
    return { ok: true, userId: pending.userId, psnxbox: pending.psnxbox };
  } catch (err) {
    console.error('[Verify] approve failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

/** @returns {{ ok: boolean, reason?: string, userId?: string }} */
export async function rejectVerification(guild, pendingId, rejecterId) {
  try {
    const pending = await PendingVerification.findById(pendingId);
    if (!pending) return { ok: false, reason: 'not_found' };
    if (pending.guildId !== guild.id) return { ok: false, reason: 'not_found' };

    await PendingVerification.findByIdAndDelete(pendingId);

    const member = await guild.members.fetch(pending.userId).catch(() => null);
    if (member) {
      await member.send(
        'Your verification application was rejected. Please contact server staff for more information.'
      ).catch(() => {});
    }

    return { ok: true, userId: pending.userId };
  } catch (err) {
    console.error('[Verify] reject failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}
