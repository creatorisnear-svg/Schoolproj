/**
 * Input coercion and error shapes shared by the CAD routes.
 *
 * Everything arriving from a browser is untrusted, and Mongoose will happily
 * store an object or an array where a string is declared. These helpers force a
 * primitive out of whatever was sent, so a crafted body cannot smuggle a query
 * operator into a document.
 */

/** A trimmed string, or null. Never an object, array, or unbounded blob. */
export function str(value, max = 200) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** A number inside [min, max], or null. */
export function num(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Plates are compared for uniqueness, so they are normalised before storing. */
export function plate(value) {
  const s = str(value, 16);
  return s ? s.toUpperCase().replace(/\s+/g, '') : null;
}

/** A boolean, treating the strings forms a browser sends as such. */
export function bool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return null;
}

/**
 * Escapes a user string for use inside a RegExp.
 *
 * Search routes build regexes from what someone typed. Without this, a plate
 * search for `.*` matches everything, and a pathological pattern can pin a CPU.
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function badRequest(res, message) {
  return res.status(400).json({ error: 'invalid_request', message });
}

export function notFound(res, what = 'Record') {
  return res.status(404).json({ error: 'not_found', message: `${what} not found.` });
}

export function duplicatePlate(res) {
  return res.status(409).json({
    error: 'duplicate_plate',
    message: 'That license plate is already registered on this server.',
  });
}

/** A refusal the front end can turn into an upgrade prompt. */
export function limitError(res, kind, { used, max }) {
  return res.status(403).json({
    error: 'limit_reached',
    limit: kind,
    used,
    max,
    message: `This server has reached its limit of ${max} ${kind}.`,
    upgrade: 'https://roleplaymanager.xyz/pricing',
  });
}
