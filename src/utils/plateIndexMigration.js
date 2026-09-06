/**
 * Make CAD license plates unique per guild instead of globally - correctly.
 *
 * This has taken two attempts, and the second one broke production, so both are
 * documented here.
 *
 * Originally `src/models/CADCharacter.js` declared `licensePlate: { unique: true }`
 * on both the character and each vehicle. That builds a GLOBAL unique index: the
 * first server to register ABC123 permanently blocked every other server from
 * using that plate. It never surfaced because only one server used the CAD.
 *
 * The first fix replaced those with per-guild compound indexes marked
 * `unique + sparse`. That looks right and is not: MongoDB omits a document from
 * a sparse compound index only when EVERY indexed field is missing, and guildId
 * is always present. So two characters with no plate both keyed on
 * (guildId, null) and the second insert was rejected - which is why people could
 * not create a second character.
 *
 * The correct tool is partialFilterExpression, which indexes a document only
 * when the plate is actually a string. The vehicle index additionally drops
 * uniqueness: it is multikey, and multikey plus unique cannot express "unique
 * when present" - once a document matches the filter, every array entry is
 * indexed, nulls included. Vehicle plate uniqueness lives in
 * src/utils/cadIdentifiers.js instead, over plates that are never null.
 *
 * Mongoose creates new indexes but never drops old ones, so changing the schema
 * is not enough. This runs on startup rather than as a manual script because
 * there is no shell on the production host. It is idempotent, and it refuses to
 * act if the data would violate the new index.
 */

/** Platform-wide unique indexes from the original schema. */
const OLD_GLOBAL_INDEXES = ['licensePlate_1', 'vehicles.licensePlate_1'];

const NEW_INDEXES = [
  {
    name: 'guildId_1_licensePlate_1',
    keys: { guildId: 1, licensePlate: 1 },
    options: { unique: true, partialFilterExpression: { licensePlate: { $type: 'string' } } },
  },
  {
    // Not unique, on purpose. This exists so plate lookups do not scan.
    name: 'guildId_1_vehicles.licensePlate_1',
    keys: { guildId: 1, 'vehicles.licensePlate': 1 },
    options: {},
  },
];

/**
 * Is an existing index already the shape we want?
 *
 * A sparse index is always the broken second attempt - it carries the right name
 * but rejects plateless characters - so it has to be rebuilt even though the
 * name matches.
 */
function isCurrent(existing, wanted) {
  if (existing.sparse) return false;
  if (!!existing.unique !== !!wanted.options.unique) return false;
  if (!!existing.partialFilterExpression !== !!wanted.options.partialFilterExpression) return false;
  return true;
}

/**
 * @param {import('mongodb').Db} db
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [opts]
 * @returns {Promise<{changed: boolean, dropped: string[], created: string[], reason?: string}>}
 */
export async function fixPlateIndexes(db, opts = {}) {
  const log = opts.log || ((m) => console.log(m));
  const dryRun = !!opts.dryRun;
  const col = db.collection('cadcharacters');

  let existing;
  try {
    existing = await col.indexes();
  } catch (err) {
    // Collection does not exist yet on a fresh database - nothing to migrate.
    if (/ns does not exist|NamespaceNotFound/i.test(err.message)) {
      return { changed: false, dropped: [], created: [], reason: 'no collection yet' };
    }
    throw err;
  }

  const byName = new Map(existing.map((i) => [i.name, i]));

  // Anything to remove: the original global indexes, plus any earlier attempt
  // sitting under the right name in the wrong shape.
  const stale = OLD_GLOBAL_INDEXES.filter((n) => byName.has(n));
  const outdated = NEW_INDEXES.filter((w) => byName.has(w.name) && !isCurrent(byName.get(w.name), w));
  const missing = NEW_INDEXES.filter((w) => !byName.has(w.name));

  if (!stale.length && !outdated.length && !missing.length) {
    return { changed: false, dropped: [], created: [], reason: 'already migrated' };
  }

  // Refuse rather than fail halfway: if two characters in the same guild already
  // share a plate, the new unique index cannot build, and dropping the old one
  // first would leave the collection with no plate constraint at all.
  const dupes = await col.aggregate([
    { $match: { licensePlate: { $nin: [null, ''] } } },
    { $group: { _id: { guildId: '$guildId', plate: '$licensePlate' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]).toArray();

  if (dupes.length) {
    log(`[PlateIndex] ABORTED - ${dupes.length} duplicate (guild, plate) pair(s) block the new index:`);
    for (const d of dupes) log(`[PlateIndex]   guild ${d._id.guildId} plate ${d._id.plate} x${d.n}`);
    return { changed: false, dropped: [], created: [], reason: 'duplicate plates' };
  }

  const dropped = [];
  const created = [];

  for (const name of stale) {
    if (dryRun) { log(`[PlateIndex] would drop global index ${name}`); continue; }
    await col.dropIndex(name);
    dropped.push(name);
    log(`[PlateIndex] dropped global index ${name}`);
  }

  for (const wanted of outdated) {
    if (dryRun) { log(`[PlateIndex] would rebuild ${wanted.name} (wrong shape)`); continue; }
    await col.dropIndex(wanted.name);
    dropped.push(wanted.name);
    log(`[PlateIndex] dropped ${wanted.name} - it was sparse, which rejected plateless characters`);
  }

  for (const { name, keys, options } of [...outdated, ...missing]) {
    if (dryRun) { log(`[PlateIndex] would create ${name}`); continue; }
    await col.createIndex(keys, { ...options, name });
    created.push(name);
    log(`[PlateIndex] created ${name}${options.unique ? ' (unique per guild, plate must be a string)' : ''}`);
  }

  return { changed: dropped.length + created.length > 0, dropped, created };
}

export { OLD_GLOBAL_INDEXES, NEW_INDEXES, isCurrent };
