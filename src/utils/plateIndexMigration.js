/**
 * Make CAD license plates unique per guild instead of globally.
 *
 * src/models/CADCharacter.js used to declare `licensePlate: { unique: true }` on
 * both the character and each vehicle. That builds a GLOBAL unique index: the
 * first server to register ABC123 permanently blocked every other server from
 * using that plate. It never surfaced because only one server used the CAD.
 *
 * Mongoose creates new indexes but never drops old ones, so changing the schema
 * is not enough - the old global indexes keep being enforced until dropped.
 *
 * This runs on startup rather than as a manual script because there is no shell
 * on the production host. It is idempotent: once the old indexes are gone it
 * does nothing, and it refuses to act if the data would violate the new index.
 */

const OLD_GLOBAL_INDEXES = ['licensePlate_1', 'vehicles.licensePlate_1'];

const NEW_INDEXES = [
  { name: 'guildId_1_licensePlate_1', keys: { guildId: 1, licensePlate: 1 } },
  { name: 'guildId_1_vehicles.licensePlate_1', keys: { guildId: 1, 'vehicles.licensePlate': 1 } },
];

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

  const names = new Set(existing.map((i) => i.name));
  const stale = OLD_GLOBAL_INDEXES.filter((n) => names.has(n));
  const missing = NEW_INDEXES.filter((i) => !names.has(i.name));

  if (!stale.length && !missing.length) {
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
    if (dryRun) { log(`[PlateIndex] would drop ${name}`); continue; }
    await col.dropIndex(name);
    dropped.push(name);
    log(`[PlateIndex] dropped global index ${name}`);
  }

  for (const { name, keys } of missing) {
    if (dryRun) { log(`[PlateIndex] would create ${name}`); continue; }
    await col.createIndex(keys, { unique: true, sparse: true, name });
    created.push(name);
    log(`[PlateIndex] created per-guild index ${name}`);
  }

  return { changed: dropped.length + created.length > 0, dropped, created };
}

export { OLD_GLOBAL_INDEXES, NEW_INDEXES };
