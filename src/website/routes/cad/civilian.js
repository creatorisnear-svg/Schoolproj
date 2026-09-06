import { Router } from 'express';
import CADCharacter from '../../../models/CADCharacter.js';
import EmergencyCall from '../../../models/EmergencyCall.js';
import TrafficTicket from '../../../models/TrafficTicket.js';
import OfficerStatus from '../../../models/OfficerStatus.js';
import EconomyBalance from '../../../models/EconomyBalance.js';
import EconomyConfig from '../../../models/EconomyConfig.js';
import BOLO from '../../../models/BOLO.js';
import { getGuildLimits } from '../../../utils/premiumCheck.js';
import { announceWeb911, generateCallId, updateCallMessage, postTweet, postAnonymous } from '../../cadBridge.js';
import { resolvePlate, randomLicenseNumber, randomSerial, randomSSN, randomVIN } from '../../../utils/cadIdentifiers.js';
import { str, num, plate, limitError, notFound, badRequest, duplicatePlate } from './shared.js';

/**
 * Civilian side of the CAD: your own characters, their vehicles and firearms,
 * calling 911, paying your fines, and seeing who is on duty.
 *
 * Every query is scoped to `req.guildId` AND `req.cadUser.userId`. A civilian
 * can only ever reach their own records - the guild scope alone is not enough,
 * because everyone in the server shares it.
 */

/** Free servers are capped per guild, matching the Discord handlers exactly. */
async function countFor(guildId, kind) {
  if (kind === 'characters') return CADCharacter.countDocuments({ guildId });
  const field = kind === 'vehicles' ? 'vehicles' : 'guns';
  const rows = await CADCharacter.find({ guildId }, field).lean();
  return rows.reduce((sum, r) => sum + (r[field]?.length || 0), 0);
}

async function overLimit(guildId, kind) {
  const limits = await getGuildLimits(guildId);
  const max = limits[kind];
  if (max === Infinity) return null;
  const used = await countFor(guildId, kind);
  return used >= max ? { used, max } : null;
}

export function createCivilianRouter(client) {
  const router = Router({ mergeParams: true });

  const own = (req) => ({ guildId: req.guildId, userId: req.cadUser.userId });

  // ── Characters ─────────────────────────────────────────────────────────────
  router.get('/characters', async (req, res) => {
    const characters = await CADCharacter.find(own(req)).sort({ createdAt: 1 }).lean();
    res.json({ characters });
  });

  router.post('/characters', async (req, res) => {
    const characterName = str(req.body.characterName, 100);
    if (!characterName) return badRequest(res, 'A character name is required.');

    const hit = await overLimit(req.guildId, 'characters');
    if (hit) return limitError(res, 'characters', hit);

    const clash = await CADCharacter.findOne({ ...own(req), characterName }).lean();
    if (clash) return badRequest(res, 'You already have a character with that name.');

    // No licence plate here on purpose. A plate belongs to a vehicle, and asking
    // for one on the person led people to fill it in and believe they had
    // registered their car. Register a vehicle to get a plate.
    try {
      const character = await CADCharacter.create({
        ...own(req),
        characterName,
        age: num(req.body.age, 0, 200),
        gender: str(req.body.gender, 40),
        hairColor: str(req.body.hairColor, 40),
        eyeColor: str(req.body.eyeColor, 40),
        height: str(req.body.height, 40),
        build: str(req.body.build, 40),
        distinguishingFeatures: str(req.body.distinguishingFeatures, 500),
        scarsAndTattoos: str(req.body.scarsAndTattoos, 500),
        address: str(req.body.address, 200),
        occupation: str(req.body.occupation, 100),
        phoneNumber: str(req.body.phoneNumber, 40),
        driversLicense: str(req.body.driversLicense, 40) || randomLicenseNumber(),
        // Issued, never asked for. It exists so law enforcement has an
        // identifier to run; the person it belongs to does not need to invent it.
        socialSecurityNumber: randomSSN(),
        veteranStatus: ['veteran', 'organ_donor', 'none'].includes(req.body.veteranStatus)
          ? req.body.veteranStatus : 'none',
        distinguishingFeatures: str(req.body.distinguishingFeatures, 500),
        scarsAndTattoos: str(req.body.scarsAndTattoos, 500),
        medicalInfo: str(req.body.medicalInfo, 500),
        emergencyContact: str(req.body.emergencyContact, 200),
      });
      res.status(201).json({ character });
    } catch (err) {
      if (err.code === 11000) return duplicatePlate(res);
      throw err;
    }
  });

  // Fields a civilian may change. Status, wanted reason and arrest history are
  // deliberately absent - those are set by law enforcement, not by the person
  // the record is about.
  const CIVILIAN_EDITABLE = [
    'characterName', 'age', 'gender', 'hairColor', 'eyeColor', 'height', 'build',
    'distinguishingFeatures', 'scarsAndTattoos', 'address', 'occupation',
    'phoneNumber', 'driversLicense', 'medicalInfo',
    'emergencyContact', 'veteranStatus',
  ];

  router.patch('/characters/:id', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, ...own(req) });
    if (!character) return notFound(res, 'Character');

    for (const field of CIVILIAN_EDITABLE) {
      if (!(field in req.body)) continue;
      if (field === 'age') { character.age = num(req.body.age, 0, 200); continue; }

      character[field] = str(req.body[field], 500);
    }
    if (!character.driversLicense) character.driversLicense = randomLicenseNumber();
    if (!character.socialSecurityNumber) character.socialSecurityNumber = randomSSN();
    if (!character.characterName) return badRequest(res, 'A character name is required.');

    try {
      await character.save();
      res.json({ character });
    } catch (err) {
      if (err.code === 11000) return duplicatePlate(res);
      throw err;
    }
  });

  router.delete('/characters/:id', async (req, res) => {
    const result = await CADCharacter.deleteOne({ _id: req.params.id, ...own(req) });
    if (!result.deletedCount) return notFound(res, 'Character');
    res.json({ ok: true });
  });

  // ── Vehicles ───────────────────────────────────────────────────────────────
  router.post('/characters/:id/vehicles', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, ...own(req) });
    if (!character) return notFound(res, 'Character');

    // A vehicle with no make or model renders as a bare "Vehicle" on an
    // officer's screen, which helps nobody on a traffic stop.
    if (!str(req.body.make, 60) && !str(req.body.model, 60)) {
      return badRequest(res, 'Give the vehicle at least a make or a model.');
    }

    const hit = await overLimit(req.guildId, 'vehicles');
    if (hit) return limitError(res, 'vehicles', hit);

    // No exclusion here, unlike the edit path. A brand new vehicle has to
    // collide with every plate in the server INCLUDING its owner's other ones -
    // excluding the character let someone register two vehicles on one plate,
    // and a plate search would then return whichever happened to match first.
    const wanted = plate(req.body.licensePlate);
    const { plate: licensePlate, taken } = await resolvePlate(req.guildId, wanted);
    if (taken) return duplicatePlate(res);

    character.vehicles.push({
      make: str(req.body.make, 60),
      model: str(req.body.model, 60),
      color: str(req.body.color, 40),
      licensePlate,
      year: str(req.body.year, 10),
      condition: str(req.body.condition, 60),
      vin: randomVIN(),
    });

    try {
      await character.save();
      res.status(201).json({ character });
    } catch (err) {
      if (err.code === 11000) return duplicatePlate(res);
      throw err;
    }
  });

  router.delete('/characters/:id/vehicles/:vehicleId', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, ...own(req) });
    if (!character) return notFound(res, 'Character');

    const before = character.vehicles.length;
    character.vehicles.pull({ _id: req.params.vehicleId });
    if (character.vehicles.length === before) return notFound(res, 'Vehicle');

    await character.save();
    res.json({ character });
  });

  // ── Firearms ───────────────────────────────────────────────────────────────
  router.post('/characters/:id/firearms', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, ...own(req) });
    if (!character) return notFound(res, 'Character');

    const name = str(req.body.name, 100);
    if (!name) return badRequest(res, 'A firearm name is required.');

    const hit = await overLimit(req.guildId, 'firearms');
    if (hit) return limitError(res, 'firearms', hit);

    // The serial is issued, not asked for. Inventing one is busywork, and a
    // blank serial makes a recovered firearm untraceable.
    character.guns.push({ name, serialNumber: randomSerial() });
    await character.save();
    res.status(201).json({ character });
  });

  router.delete('/characters/:id/firearms/:gunId', async (req, res) => {
    const character = await CADCharacter.findOne({ _id: req.params.id, ...own(req) });
    if (!character) return notFound(res, 'Character');

    const before = character.guns.length;
    character.guns.pull({ _id: req.params.gunId });
    if (character.guns.length === before) return notFound(res, 'Firearm');

    await character.save();
    res.json({ character });
  });

  // ── 911 ────────────────────────────────────────────────────────────────────
  router.post('/911', async (req, res) => {
    // A server that switched 911 off in Discord must not still take calls
    // through the website.
    if (!req.cadContext.rpConfig?.use911) {
      return res.status(403).json({
        error: '911_disabled',
        message: 'This server has not turned on 911 reporting.',
      });
    }

    const issue = str(req.body.issue, 1000);
    const location = str(req.body.location, 300);
    if (!issue || !location) {
      return badRequest(res, 'Both the emergency and the location are required.');
    }

    // One open call per person, so a stuck submit button cannot flood dispatch.
    const open = await EmergencyCall.findOne({
      guildId: req.guildId,
      reporterId: req.cadUser.userId,
      status: 'active',
    }).lean();
    if (open) {
      return res.status(409).json({
        error: 'call_already_open',
        message: 'You already have an open 911 call. Cancel it before making another.',
        callId: open.callId,
      });
    }

    // dispatchAnnounced is left at its default of false on purpose: that is what
    // the voice poller looks for, and it announces within about five seconds.
    const call = await EmergencyCall.create({
      guildId: req.guildId,
      callId: await generateCallId(req.guildId),
      issue,
      location,
      suspectsDescription: str(req.body.suspectsDescription, 500),
      lastSeen: str(req.body.lastSeen, 300),
      contact: str(req.body.contact, 200),
      reporterUsername: req.cadMember.displayName || req.cadUser.username,
      reporterId: req.cadUser.userId,
      status: 'active',
    });

    const posted = await announceWeb911(req.guild, call, {
      rpConfig: req.cadContext.rpConfig,
      cadConfig: req.cadContext.cadConfig,
      dispatchConfig: req.cadContext.dispatch,
    });

    res.status(201).json({
      call: call.toObject(),
      postedToDiscord: posted.posted,
      voiceDispatch: req.cadContext.hasDispatch,
    });
  });

  router.get('/911/mine', async (req, res) => {
    const calls = await EmergencyCall.find({
      guildId: req.guildId,
      reporterId: req.cadUser.userId,
    }).sort({ timestamp: -1 }).limit(25).lean();
    res.json({ calls });
  });

  router.delete('/911/:callId', async (req, res) => {
    const call = await EmergencyCall.findOne({
      guildId: req.guildId,
      callId: req.params.callId,
      reporterId: req.cadUser.userId,
      status: 'active',
    });
    if (!call) return notFound(res, 'Call');

    call.status = 'closed';
    call.closedAt = new Date();
    call.closedBy = req.cadUser.userId;
    await call.save();

    await updateCallMessage(req.guild, call, 'This call was cancelled by the caller.');
    res.json({ ok: true });
  });

  // ── Fines ──────────────────────────────────────────────────────────────────
  router.get('/fines', async (req, res) => {
    const characters = await CADCharacter.find(own(req), '_id characterName').lean();
    if (!characters.length) return res.json({ fines: [], outstanding: 0 });

    const ids = characters.map((c) => c._id);
    const fines = await TrafficTicket.find({ guildId: req.guildId, characterId: { $in: ids } })
      .sort({ createdAt: -1 })
      .lean();

    const outstanding = fines.filter((f) => !f.paid).reduce((sum, f) => sum + (f.fine || 0), 0);
    res.json({ fines, outstanding });
  });

  /**
   * Paying a fine moves money, exactly as /civiliandatabase does.
   *
   * This route used to just flip `paid` to true, which made every fine free on
   * the website - somebody who could not afford one in Discord could clear it
   * here in a click, and the whole ticketing system stopped meaning anything.
   */
  router.post('/fines/:ticketId/pay', async (req, res) => {
    const mine = await CADCharacter.find(own(req), '_id characterName').lean();
    const ids = mine.map((c) => String(c._id));
    const names = mine.map((c) => c.characterName);

    const ticket = await TrafficTicket.findOne({ guildId: req.guildId, ticketId: req.params.ticketId });
    // Match on name as well as id, as Discord does: a rebuilt character would
    // otherwise leave its owner unable to pay their own fine.
    const owned = ticket && (ids.includes(String(ticket.characterId)) || names.includes(ticket.characterName));
    if (!owned) return notFound(res, 'Fine');
    if (ticket.paid) return badRequest(res, 'That fine is already paid.');

    const [balance, econConfig] = await Promise.all([
      EconomyBalance.findOne({ guildId: req.guildId, userId: req.cadUser.userId }),
      EconomyConfig.findOne({ guildId: req.guildId }).lean(),
    ]);
    const symbol = econConfig?.currencySymbol || '$';
    const amount = ticket.fine || 0;

    if (!balance) {
      return res.status(400).json({
        error: 'no_economy_account',
        message: 'You do not have an economy account on this server.',
      });
    }
    if (balance.bank < amount) {
      return res.status(400).json({
        error: 'insufficient_funds',
        message: 'You need ' + symbol + amount.toLocaleString()
          + ' in the bank and have ' + symbol + balance.bank.toLocaleString() + '.',
        required: amount,
        bank: balance.bank,
        symbol,
      });
    }

    // Claim the ticket in one guarded write before touching the money. Checking
    // `paid` and then setting it are two steps, and a double-clicked button can
    // pass both - which would debit the account twice for one fine.
    const claimed = await TrafficTicket.findOneAndUpdate(
      { guildId: req.guildId, ticketId: req.params.ticketId, paid: false },
      { $set: { paid: true, paidAt: new Date() } },
      { new: true }
    );
    if (!claimed) return badRequest(res, 'That fine is already paid.');

    try {
      balance.bank -= amount;
      await balance.save();
    } catch (err) {
      // Give the fine back rather than leaving it cleared for free.
      await TrafficTicket.updateOne(
        { _id: claimed._id },
        { $set: { paid: false, paidAt: null } }
      ).catch(() => {});
      throw err;
    }

    res.json({ ticket: claimed, bank: balance.bank, symbol, paid: amount });
  });

  // ── In-character social ────────────────────────────────────────────────────
  router.post('/social/tweet', async (req, res) => {
    const rp = req.cadContext.rpConfig;
    if (!rp?.useTwitter || !rp?.twitterChannel) {
      return res.status(403).json({
        error: 'twitter_disabled',
        message: 'This server has not set up the Twitter feed.',
      });
    }

    const message = str(req.body.message, 1000);
    if (!message) return badRequest(res, 'Write something to post.');

    const result = await postTweet(req.guild, rp, {
      message,
      author: req.cadMember.displayName || req.cadUser.username,
      avatarUrl: req.cadUser.avatar
        ? `https://cdn.discordapp.com/avatars/${req.cadUser.userId}/${req.cadUser.avatar}.png`
        : null,
    });

    if (!result.posted) {
      return res.status(502).json({ error: 'post_failed', message: 'Could not reach the Twitter channel.' });
    }
    res.status(201).json({ posted: true });
  });

  router.post('/social/anon', async (req, res) => {
    const rp = req.cadContext.rpConfig;
    if (!rp?.useAnon || !rp?.anonChannel) {
      return res.status(403).json({
        error: 'anon_disabled',
        message: 'This server has not set up anonymous posting.',
      });
    }

    const message = str(req.body.message, 1000);
    if (!message) return badRequest(res, 'Write something to post.');

    const result = await postAnonymous(req.guild, rp, { message });
    if (!result.posted) {
      return res.status(502).json({ error: 'post_failed', message: 'Could not reach the anonymous channel.' });
    }
    res.status(201).json({ posted: true });
  });

  // ── Public boards ──────────────────────────────────────────────────────────
  // Read-only: who is on duty, and what the public should be looking out for.
  router.get('/board', async (req, res) => {
    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const officers = await OfficerStatus.find({ guildId: req.guildId, updatedAt: { $gte: cutoff } })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      officers: officers.map((o) => ({
        username: o.username,
        tenCode: o.tenCode,
        location: o.location,
        updatedAt: o.updatedAt,
      })),
    });
  });

  router.get('/bolos', async (req, res) => {
    const bolos = await BOLO.find({ guildId: req.guildId, active: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Civilians see the alert, not the internal record it points at.
    res.json({
      bolos: bolos.map((b) => ({
        boloId: b.boloId,
        characterName: b.characterName,
        reason: b.reason,
        description: b.description,
        vehicles: b.vehicles,
        createdAt: b.createdAt,
      })),
    });
  });

  return router;
}
