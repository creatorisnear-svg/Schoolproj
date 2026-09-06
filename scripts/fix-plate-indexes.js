/**
 * CLI wrapper for the per-guild license plate index migration.
 *
 * The migration also runs automatically on bot startup (src/index.js), because
 * the production host has no shell. This exists for running it by hand against
 * a database, and for --dry-run inspection.
 *
 *   node scripts/fix-plate-indexes.js
 *   node scripts/fix-plate-indexes.js --dry-run
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fixPlateIndexes } from '../src/utils/plateIndexMigration.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected.' + (dryRun ? ' DRY RUN - nothing will be changed.' : ''));

  const col = mongoose.connection.db.collection('cadcharacters');
  console.log('\nIndexes before:');
  for (const i of await col.indexes()) console.log(`  ${i.name}${i.unique ? '  (unique)' : ''}`);

  const result = await fixPlateIndexes(mongoose.connection.db, { dryRun });

  if (!result.changed) {
    console.log(`\nNo changes: ${result.reason}`);
    if (result.reason === 'duplicate plates') {
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  if (!dryRun) {
    console.log('\nIndexes after:');
    for (const i of await col.indexes()) console.log(`  ${i.name}${i.unique ? '  (unique)' : ''}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error('Migration failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
