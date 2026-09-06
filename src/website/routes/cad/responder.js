import { Router } from 'express';
import EmergencyCall from '../../../models/EmergencyCall.js';
import { refreshStatusBoard, setOfficerStatus, updateCallMessage } from '../../cadBridge.js';
import { notFound } from './shared.js';

/**
 * The 911 queue, shared by law enforcement and the fire department.
 *
 * Both work the same calls and write the same fields - `/firedepartmentdatabase`
 * sets `respondingLeoId` and `attachedLeoIds` just as `/leodatabase` does, on the
 * same EmergencyCall documents. Keeping one implementation behind one gate means
 * a fire crew and a patrol unit cannot end up with subtly different behaviour on
 * the same call.
 *
 * The one difference is the status code written when responding. Fire units are
 * not on the police 10-code board, so their status is only recorded when they
 * actually hold a LEO role too.
 */

/** Either service may work the queue; a plain civilian may not. */
export function requireResponder(req, res, next) {
  if (req.cadMember?.isLeo || req.cadMember?.isFd) return next();
  res.status(403).json({ error: 'responder_only' });
}

/**
 * Names for the officers attached to a call.
 *
 * The queue used to show "3 attached" and nothing more, which is useless on a
 * live call - you need to know who is already rolling before you decide to.
 */
async function withResponderNames(guild, calls) {
  const ids = new Set();
  for (const call of calls) {
    if (call.respondingLeoId) ids.add(call.respondingLeoId);
    for (const id of call.attachedLeoIds || []) ids.add(id);
  }
  if (!ids.size) return calls.map((c) => ({ ...c, attachedNames: [] }));

  const names = new Map();
  await Promise.all([...ids].map(async (id) => {
    const cached = guild.members.cache.get(id);
    if (cached) { names.set(id, cached.displayName); return; }
    const fetched = await guild.members.fetch(id).catch(() => null);
    if (fetched) names.set(id, fetched.displayName);
  }));

  return calls.map((call) => ({
    ...call,
    respondingLeoUsername: call.respondingLeoId
      ? (names.get(call.respondingLeoId) || call.respondingLeoUsername || 'Unknown unit')
      : null,
    attachedNames: (call.attachedLeoIds || []).map((id) => names.get(id) || 'Unknown unit'),
  }));
}

export function createResponderRouter(client) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const calls = await EmergencyCall.find({ guildId: req.guildId, status: 'active' })
      .sort({ timestamp: -1 })
      .lean();
    res.json({ calls: await withResponderNames(req.guild, calls) });
  });

  /** Loads an active call, or answers 404. */
  async function activeCall(req, res) {
    const call = await EmergencyCall.findOne({
      guildId: req.guildId,
      callId: req.params.callId,
      status: 'active',
    });
    if (!call) { notFound(res, 'Call'); return null; }
    return call;
  }

  /** Fire units are not on the police status board, so only LEOs set a code. */
  async function markStatus(req, tenCode, callId, location) {
    if (!req.cadMember.isLeo) return;
    await setOfficerStatus(req.guildId, req.cadUser.userId, req.cadMember.displayName, {
      tenCode,
      subject: `On call ${callId}`,
      location: location || null,
    });
    refreshStatusBoard(req.guild).catch(() => {});
  }

  router.post('/:callId/respond', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    if (call.respondingLeoId && call.respondingLeoId !== req.cadUser.userId) {
      return res.status(409).json({
        error: 'already_assigned',
        message: `${call.respondingLeoUsername || 'Another unit'} is already primary on this call.`,
      });
    }

    call.respondingLeoId = req.cadUser.userId;
    call.respondingLeoUsername = req.cadMember.displayName;
    await call.save();

    await markStatus(req, '10-76', call.callId, call.location);
    await updateCallMessage(req.guild, call, `**PRIMARY RESPONDER:** ${req.cadMember.displayName}`);
    res.json({ call });
  });

  router.post('/:callId/attach', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    if (!call.attachedLeoIds.includes(req.cadUser.userId)) {
      call.attachedLeoIds.push(req.cadUser.userId);
      await call.save();
    }

    await markStatus(req, '10-97', call.callId, call.location);
    res.json({ call });
  });

  /** Step back off a call without closing it for everyone else. */
  router.post('/:callId/detach', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    const me = req.cadUser.userId;
    call.attachedLeoIds = (call.attachedLeoIds || []).filter((id) => id !== me);
    if (call.respondingLeoId === me) {
      call.respondingLeoId = null;
      call.respondingLeoUsername = null;
    }
    await call.save();

    await markStatus(req, '10-8', call.callId, null);
    await updateCallMessage(req.guild, call, null);
    res.json({ call });
  });

  router.post('/:callId/close', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    call.status = 'closed';
    call.closedAt = new Date();
    call.closedBy = req.cadUser.userId;
    await call.save();

    await updateCallMessage(req.guild, call, `Call closed by ${req.cadMember.displayName}.`);
    refreshStatusBoard(req.guild).catch(() => {});
    res.json({ call });
  });

  return router;
}
