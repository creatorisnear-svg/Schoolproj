import { Router } from 'express';
import CADCharacter from '../../../models/CADCharacter.js';
import EmergencyCall from '../../../models/EmergencyCall.js';
import TrafficTicket from '../../../models/TrafficTicket.js';
import OfficerStatus from '../../../models/OfficerStatus.js';
import BOLO from '../../../models/BOLO.js';
import { getGuildLimits } from '../../../utils/premiumCheck.js';
import { TEN_CODES } from '../../../handlers/dispatchHandler.js';
import { refreshStatusBoard, setOfficerStatus, updateCallMessage } from '../../cadBridge.js';
import { str, num, plate, escapeRegex, badRequest, notFound, limitError } from './shared.js';

/**
 * Law-enforcement side of the CAD: run a plate or a name, work the 911 queue,
 * issue tickets and BOLOs, set your status, hit the panic button.
 *
 * Mounted behind requireLeo, so every handler here can assume the caller holds a
 * LEO role (or is server staff, matching what /leodatabase allows).
 */

const RECENT_MS = 8 * 60 * 60 * 1000;

/** The record an officer sees when they run someone. */
async function fullRecord(guildId, character) {
  const [bolos, tickets] = await Promise.all([
    BOLO.find({ guildId, characterId: character._id, active: true }).sort({ createdAt: -1 }).lean(),
    TrafficTicket.find({ guildId, characterId: character._id }).sort({ createdAt: -1 }).limit(25).lean(),
  ]);

  return {
    character,
    bolos,
    tickets,
    outstandingFines: tickets.filter((t) => !t.paid).reduce((sum, t) => sum + (t.fine || 0), 0),
  };
}

export function createLeoRouter(client) {
  const router = Router({ mergeParams: true });

  // ── Search ─────────────────────────────────────────────────────────────────
  // One endpoint for both, because an officer running a stop has a plate or a
  // name and should not have to pick which box to type it into.
  router.get('/search', async (req, res) => {
    const query = str(req.query.q, 100);
    if (!query || query.length < 2) {
      return badRequest(res, 'Enter at least two characters to search.');
    }

    const guildId = req.guildId;
    const exact = new RegExp(`^${escapeRegex(query)}$`, 'i');
    const loose = new RegExp(escapeRegex(query), 'i');
    const asPlate = plate(query);

    // A plate is an exact identifier, so an exact plate hit is the answer.
    if (asPlate) {
      const byPlate = await CADCharacter.findOne({
        guildId,
        $or: [{ licensePlate: asPlate }, { 'vehicles.licensePlate': asPlate }],
      }).lean();
      if (byPlate) {
        const record = await fullRecord(guildId, byPlate);
        return res.json({ matchedOn: 'plate', results: [record] });
      }
    }

    const exactName = await CADCharacter.find({ guildId, characterName: exact }).limit(10).lean();
    const rows = exactName.length
      ? exactName
      : await CADCharacter.find({ guildId, characterName: loose }).limit(10).lean();

    const results = await Promise.all(rows.map((c) => fullRecord(guildId, c)));
    res.json({ matchedOn: 'name', results });
  });

  // ── Record edits an officer may make ───────────────────────────────────────
  router.patch('/records/:id', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!character) return notFound(res, 'Record');

    if ('status' in req.body) {
      const status = str(req.body.status, 20);
      if (!['wanted', 'clean'].includes(status)) {
        return badRequest(res, 'Status must be either wanted or clean.');
      }
      character.status = status;
      character.wantedReason = status === 'wanted' ? str(req.body.wantedReason, 500) : null;
    }

    if ('driverLicenseStatus' in req.body) {
      const licence = str(req.body.driverLicenseStatus, 20);
      if (!['valid', 'invalid'].includes(licence)) {
        return badRequest(res, 'License status must be either valid or invalid.');
      }
      character.driverLicenseStatus = licence;
    }

    await character.save();
    res.json({ character });
  });

  router.post('/records/:id/arrests', async (req, res) => {
    const charge = str(req.body.charge, 300);
    if (!charge) return badRequest(res, 'A charge is required.');

    const character = await CADCharacter.findOne({ _id: req.params.id, guildId: req.guildId });
    if (!character) return notFound(res, 'Record');

    character.arrestHistory.push({
      charge,
      date: new Date(),
      outcome: str(req.body.outcome, 200) || 'Pending',
    });
    await character.save();
    res.status(201).json({ character });
  });

  // ── BOLOs ──────────────────────────────────────────────────────────────────
  router.get('/bolos', async (req, res) => {
    const bolos = await BOLO.find({ guildId: req.guildId, active: true })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ bolos });
  });

  router.post('/bolos', async (req, res) => {
    const reason = str(req.body.reason, 300);
    if (!reason) return badRequest(res, 'A reason is required.');

    const character = await CADCharacter.findOne({ _id: req.body.characterId, guildId: req.guildId }).lean();
    if (!character) return notFound(res, 'Character');

    const limits = await getGuildLimits(req.guildId);
    if (limits.bolos !== Infinity) {
      const used = await BOLO.countDocuments({ guildId: req.guildId, active: true });
      if (used >= limits.bolos) return limitError(res, 'bolos', { used, max: limits.bolos });
    }

    const bolo = await BOLO.create({
      guildId: req.guildId,
      boloId: `BOLO-${Date.now()}`,
      characterId: character._id,
      characterName: character.characterName,
      reason,
      description: str(req.body.description, 1000) || '',
      // Attach the character's own vehicles so patrol has something to look for.
      vehicles: (character.vehicles || []).map((v) => ({
        make: v.make, model: v.model, color: v.color,
        licensePlate: v.licensePlate, year: v.year, notes: null,
      })),
      issuedBy: req.cadUser.userId,
      active: true,
      // Matches the Discord handler: BOLOs lapse after a day and are swept away.
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ bolo });
  });

  router.post('/bolos/:boloId/resolve', async (req, res) => {
    const bolo = await BOLO.findOne({ guildId: req.guildId, boloId: req.params.boloId, active: true });
    if (!bolo) return notFound(res, 'BOLO');

    bolo.active = false;
    bolo.resolvedAt = new Date();
    bolo.resolvedBy = req.cadUser.userId;
    await bolo.save();
    res.json({ bolo });
  });

  // ── Tickets ────────────────────────────────────────────────────────────────
  router.post('/tickets', async (req, res) => {
    const violation = str(req.body.violation, 300);
    if (!violation) return badRequest(res, 'A violation is required.');

    const character = await CADCharacter.findOne({ _id: req.body.characterId, guildId: req.guildId }).lean();
    if (!character) return notFound(res, 'Character');

    const ticket = await TrafficTicket.create({
      guildId: req.guildId,
      ticketId: `TKT-${Date.now()}`,
      characterId: character._id,
      characterName: character.characterName,
      issuedBy: req.cadUser.userId,
      violation,
      description: str(req.body.description, 1000) || '',
      fine: num(req.body.fine, 0, 1_000_000) || 0,
    });

    res.status(201).json({ ticket });
  });

  router.get('/tickets', async (req, res) => {
    const tickets = await TrafficTicket.find({ guildId: req.guildId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ tickets });
  });

  // ── Status and 10-codes ────────────────────────────────────────────────────
  router.get('/codes', (req, res) => {
    res.json({
      codes: Object.entries(TEN_CODES).map(([code, info]) => ({ code, label: info.label })),
    });
  });

  router.get('/status', async (req, res) => {
    const cutoff = new Date(Date.now() - RECENT_MS);
    const [officers, mine] = await Promise.all([
      OfficerStatus.find({ guildId: req.guildId, updatedAt: { $gte: cutoff } })
        .sort({ updatedAt: -1 }).lean(),
      OfficerStatus.findOne({ guildId: req.guildId, userId: req.cadUser.userId }).lean(),
    ]);
    res.json({ officers, mine });
  });

  router.post('/status', async (req, res) => {
    const tenCode = str(req.body.tenCode, 10);
    if (!tenCode || !TEN_CODES[tenCode]) return badRequest(res, 'Unknown 10-code.');
    // Panic has its own endpoint so it cannot be raised by accident from a
    // dropdown, and so the two paths stay auditable separately.
    if (tenCode === '10-99') return badRequest(res, 'Use the panic button to declare a 10-99.');

    const status = await setOfficerStatus(
      req.guildId, req.cadUser.userId, req.cadMember.displayName,
      { tenCode, subject: str(req.body.subject, 200), location: str(req.body.location, 200) }
    );

    refreshStatusBoard(req.guild).catch(() => {});
    res.json({ status });
  });

  router.post('/panic', async (req, res) => {
    // The bridge writes panicAnnounced: false, which is what the panic poller
    // looks for. Nothing else is called - triggerPanicAlert would announce a
    // second time on top of the poller.
    const status = await setOfficerStatus(
      req.guildId, req.cadUser.userId, req.cadMember.displayName,
      { tenCode: '10-99', subject: null, location: str(req.body.location, 200) }
    );

    refreshStatusBoard(req.guild).catch(() => {});
    res.json({
      status,
      // Without premium there is no voice layer, so say so rather than let the
      // officer believe a siren went out over the radio.
      voiceAlert: req.cadContext.hasDispatch,
    });
  });

  // ── 911 queue ──────────────────────────────────────────────────────────────
  router.get('/calls', async (req, res) => {
    const calls = await EmergencyCall.find({ guildId: req.guildId, status: 'active' })
      .sort({ timestamp: -1 })
      .lean();
    res.json({ calls });
  });

  /** Loads an active call, or answers 404 - used by every action below. */
  async function activeCall(req, res) {
    const call = await EmergencyCall.findOne({
      guildId: req.guildId,
      callId: req.params.callId,
      status: 'active',
    });
    if (!call) { notFound(res, 'Call'); return null; }
    return call;
  }

  router.post('/calls/:callId/respond', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    if (call.respondingLeoId && call.respondingLeoId !== req.cadUser.userId) {
      return res.status(409).json({
        error: 'already_assigned',
        message: `${call.respondingLeoUsername || 'Another officer'} is already primary on this call.`,
      });
    }

    call.respondingLeoId = req.cadUser.userId;
    call.respondingLeoUsername = req.cadMember.displayName;
    await call.save();

    await setOfficerStatus(req.guildId, req.cadUser.userId, req.cadMember.displayName, {
      tenCode: '10-76',
      subject: `Responding to ${call.callId}`,
      location: call.location || null,
    });

    await updateCallMessage(req.guild, call, `**PRIMARY RESPONDER:** ${req.cadMember.displayName}`);
    refreshStatusBoard(req.guild).catch(() => {});
    res.json({ call });
  });

  router.post('/calls/:callId/attach', async (req, res) => {
    const call = await activeCall(req, res);
    if (!call) return;

    if (!call.attachedLeoIds.includes(req.cadUser.userId)) {
      call.attachedLeoIds.push(req.cadUser.userId);
      await call.save();
    }

    await setOfficerStatus(req.guildId, req.cadUser.userId, req.cadMember.displayName, {
      tenCode: '10-97',
      subject: `Attached to ${call.callId}`,
      location: call.location || null,
    });

    refreshStatusBoard(req.guild).catch(() => {});
    res.json({ call });
  });

  router.post('/calls/:callId/close', async (req, res) => {
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
