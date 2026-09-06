import { Router } from 'express';
import PendingVerification from '../../../models/PendingVerification.js';
import VerifiedUser from '../../../models/VerifiedUser.js';
import { StrikeUser, StrikeConfig } from '../../../models/Strike.js';
import Ticket from '../../../models/Ticket.js';
import EmergencyCall from '../../../models/EmergencyCall.js';
import Blacklist from '../../../models/Blacklist.js';
import { approveVerification, rejectVerification } from '../../../utils/verifyActions.js';
import { badRequest, notFound } from './shared.js';

/**
 * The staff side of the CAD.
 *
 * Everything here is work a moderator does rather than roleplay: who is waiting
 * to be let in, who has strikes, what is open. It exists because that work was
 * only ever possible in Discord, scattered across a verification channel, a
 * ticket category and whatever anybody remembered, while the CAD is where staff
 * already are.
 *
 * Gated by requireStaff on the mount, which means an administrator, one of the
 * roles the owner picked as CAD staff roles, or an entry in the Staff
 * collection. Every query is scoped to req.guildId.
 */
export function createStaffRouter(client) {
  const router = Router({ mergeParams: true });

  /** Numbers a moderator wants at a glance, in one request. */
  router.get('/overview', async (req, res) => {
    const guildId = req.guildId;

    const [pending, verified, strikes, openTickets, activeCalls, blacklisted] = await Promise.all([
      PendingVerification.countDocuments({ guildId }),
      VerifiedUser.countDocuments({ guildId }),
      StrikeUser.countDocuments({ guildId, currentStrikeLevel: { $gt: 0 } }),
      Ticket.countDocuments({ guildId, status: { $ne: 'closed' } }).catch(() => 0),
      EmergencyCall.countDocuments({ guildId, status: 'active' }).catch(() => 0),
      Blacklist.countDocuments({ guildId, active: true }).catch(() => 0),
    ]);

    res.json({ pending, verified, strikes, openTickets, activeCalls, blacklisted });
  });

  /**
   * Who is waiting to be let in.
   *
   * Oldest first: this is a queue, and the person who has been waiting longest
   * is the one being let down.
   */
  router.get('/verifications', async (req, res) => {
    const rows = await PendingVerification.find({ guildId: req.guildId })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    res.json({
      pending: rows.map((r) => ({
        id: String(r._id),
        userId: r.userId,
        username: r.username || null,
        psnxbox: r.psnxbox || null,
        answer: r.customAnswer || null,
        submittedAt: r.createdAt || null,
      })),
    });
  });

  router.post('/verifications/:id/approve', async (req, res) => {
    const guild = client.guilds.cache.get(req.guildId);
    if (!guild) return notFound(res, 'Server not found');

    const result = await approveVerification(guild, req.params.id, req.cadUser.userId);
    if (!result.ok) {
      // A member who left is not an error the staffer caused, so it reads as a
      // normal outcome with the row cleared rather than a failure.
      if (result.reason === 'gone') return res.json({ ok: true, gone: true });
      return badRequest(res, {
        not_found: 'That application has already been handled.',
        no_config: 'Verification is not set up on this server.',
      }[result.reason] || 'Could not approve that application.');
    }
    res.json({ ok: true, userId: result.userId });
  });

  router.post('/verifications/:id/deny', async (req, res) => {
    const guild = client.guilds.cache.get(req.guildId);
    if (!guild) return notFound(res, 'Server not found');

    const result = await rejectVerification(guild, req.params.id, req.cadUser.userId);
    if (!result.ok) {
      return badRequest(res, result.reason === 'not_found'
        ? 'That application has already been handled.'
        : 'Could not deny that application.');
    }
    res.json({ ok: true, userId: result.userId });
  });

  /** Members carrying strikes, worst first. Read only: issuing stays in Discord. */
  router.get('/strikes', async (req, res) => {
    const [rows, config] = await Promise.all([
      StrikeUser.find({ guildId: req.guildId, currentStrikeLevel: { $gt: 0 } })
        .sort({ currentStrikeLevel: -1 })
        .limit(100)
        .lean(),
      StrikeConfig.findOne({ guildId: req.guildId }).lean().catch(() => null),
    ]);

    // What actually happens at each level, so the list means something without
    // going to look it up somewhere else.
    const actions = {};
    for (const n of [1, 2, 3, 4]) {
      const s = config?.strikes?.[`strike${n}`];
      actions[n] = s?.action && s.action !== 'none' ? s.action : null;
    }

    // StrikeUser stores only an id, and a Discord mention does not resolve in a
    // browser, so a name has to be found here or the page shows raw numbers.
    const guild = client.guilds.cache.get(req.guildId);
    const nameFor = (userId) => {
      const m = guild?.members?.cache?.get(userId);
      return m ? (m.displayName || m.user?.username || null) : null;
    };

    res.json({
      strikes: rows.map((r) => ({
        userId: r.userId,
        username: nameFor(r.userId),
        level: r.currentStrikeLevel,
        action: actions[r.currentStrikeLevel] || null,
      })),
      actions,
    });
  });

  return router;
}
