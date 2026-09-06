import CADCharacter from '../models/CADCharacter.js';

/**
 * Generated identifiers for CAD records.
 *
 * Nobody should have to invent a licence number to register a character, and
 * asking them to produces exactly the friction the CAD exists to remove. So the
 * CAD issues these the way a DMV would, and only falls back to what the user
 * typed if they deliberately supplied one.
 *
 * There is a second, less obvious reason plates must never be blank. Plate
 * uniqueness is backed by a MongoDB index, and a unique index over an array
 * field indexes every entry including nulls - so two characters each owning one
 * plateless vehicle would collide with each other. Generating a plate means
 * there is no null to collide on.
 */

// No I, O, 0 or 1: on a plate read out over radio they are indistinguishable.
const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PLATE_DIGITS = '23456789';
const DL_DIGITS = '0123456789';

function pick(alphabet, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** A plate in the familiar three-letters-three-digits shape, e.g. `KRT492`. */
export function randomPlate() {
  return pick(PLATE_LETTERS, 3) + pick(PLATE_DIGITS, 3);
}

/** A driver's licence number, e.g. `DL-4820517`. */
export function randomLicenseNumber() {
  return 'DL-' + pick(DL_DIGITS, 7);
}

/**
 * A social security number, e.g. `947-88-9317`.
 *
 * Deliberately in the familiar shape but not a valid real-world SSN: the area
 * number starts at 900, a range the US never issues, so a number generated here
 * can never collide with a real person's.
 */
export function randomSSN() {
  const area = 900 + Math.floor(Math.random() * 100);
  return `${area}-${pick(DL_DIGITS, 2)}-${pick(DL_DIGITS, 4)}`;
}

/**
 * A vehicle identification number, e.g. `1HGBH41JXMN109186`.
 *
 * Seventeen characters in the real format, and deliberately excluding I, O and Q
 * exactly as a real VIN does - they are indistinguishable from 1 and 0 when read
 * off a dashboard or repeated over the radio.
 */
export function randomVIN() {
  const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  return pick(VIN_CHARS, 17);
}

/** A firearm serial, e.g. `SN-8H2K4M9`. */
export function randomSerial() {
  return 'SN-' + pick(PLATE_LETTERS + DL_DIGITS, 7);
}

/**
 * Is this plate already used by any character or vehicle in this server?
 *
 * Uniqueness for vehicle plates is enforced here rather than by a unique index.
 * A unique index over `vehicles.licensePlate` is multikey, and multikey plus
 * unique cannot express "unique when present" - it collides on the nulls. The
 * character-level plate keeps its database index; this covers the rest.
 */
export async function isPlateTaken(guildId, plate, excludeCharacterId) {
  if (!plate) return false;
  const query = {
    guildId,
    $or: [{ licensePlate: plate }, { 'vehicles.licensePlate': plate }],
  };
  if (excludeCharacterId) query._id = { $ne: excludeCharacterId };
  return !!(await CADCharacter.findOne(query).select('_id').lean());
}

/**
 * A plate nobody in this server is using.
 *
 * Retries rather than trusting one draw. With 24^3 * 8^3 combinations a clash is
 * unlikely, but "unlikely" is not "handled", and a server that has been running
 * for years is exactly where it would surface.
 */
export async function uniquePlate(guildId, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const plate = randomPlate();
    if (!(await isPlateTaken(guildId, plate))) return plate;
  }
  // Astronomically unlikely; a timestamp tail keeps it unique rather than failing.
  return pick(PLATE_LETTERS, 2) + String(Date.now()).slice(-4);
}

/**
 * The plate to store: what the user typed if they typed one, otherwise a
 * generated one. Returns `{ plate, generated }` so the caller can tell them.
 */
export async function resolvePlate(guildId, requested, excludeCharacterId) {
  if (requested) {
    if (await isPlateTaken(guildId, requested, excludeCharacterId)) return { plate: null, taken: true };
    return { plate: requested, generated: false };
  }
  return { plate: await uniquePlate(guildId), generated: true };
}
