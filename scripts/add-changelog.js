#!/usr/bin/env node
/**
 * CLI script to add a changelog entry and fire the Discord webhook.
 * Run from the repo root:
 *   node scripts/add-changelog.js --version "1.2.3" --title "My update" --changes "Fixed X" "Added Y"
 *
 * Or interactively (no args):
 *   node scripts/add-changelog.js
 *
 * Requires MONGODB_URI and (optionally) CHANGELOG_WEBHOOK_URL in env / .env
 */

import { createInterface } from 'readline';
import { config } from 'dotenv';
import mongoose from 'mongoose';

config(); // load .env if present

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}
function getAllAfter(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return [];
  const results = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    results.push(args[i]);
  }
  return results;
}

// ── Mongoose model (inline guard) ─────────────────────────────────────────────
const changelogSchema = new mongoose.Schema({
  version:   { type: String, required: true },
  title:     { type: String, required: true },
  changes:   [String],
  date:      { type: Date, default: Date.now },
  createdBy: String,
});
const Changelog = mongoose.models.Changelog || mongoose.model('Changelog', changelogSchema);

// ── Webhook helper (same logic as src/utils/changelogWebhook.js) ──────────────
async function sendWebhook(entry) {
  const url = process.env.CHANGELOG_WEBHOOK_URL;
  if (!url) { console.log('  (CHANGELOG_WEBHOOK_URL not set — skipping Discord notification)'); return; }

  const changeList = entry.changes?.length ? entry.changes.map(c => `- ${c}`).join('\n') : null;
  const embed = {
    color: 0x5865f2,
    title: `New — v${entry.version}: ${entry.title}`,
    description: changeList,
    footer: { text: 'RPM' },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (res.ok) console.log('  Discord webhook sent.');
  else console.error(`  Discord webhook failed: HTTP ${res.status}`);
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not set. Add it to .env or export it before running this script.');
    process.exit(1);
  }

  let version = getArg('--version');
  let title   = getArg('--title');
  let changes = getAllAfter('--changes');

  // Interactive mode if args are missing
  if (!version || !title) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nRolePlayManager — Add Changelog Entry\n');
    if (!version) version = (await prompt(rl, 'Version (e.g. 1.2.3): ')).trim();
    if (!title)   title   = (await prompt(rl, 'Title: ')).trim();
    if (!changes.length) {
      console.log('Changes (one per line, blank line to finish):');
      while (true) {
        const line = (await prompt(rl, '  - ')).trim();
        if (!line) break;
        changes.push(line);
      }
    }
    rl.close();
  }

  if (!version || !title) {
    console.error('Error: version and title are required.');
    process.exit(1);
  }

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const entry = await Changelog.create({ version, title, changes, createdBy: 'cli' });
  console.log(`Changelog created: v${entry.version} — ${entry.title}`);
  if (entry.changes?.length) console.log('Changes:\n' + entry.changes.map(c => `  - ${c}`).join('\n'));

  console.log('\nSending Discord notification...');
  await sendWebhook(entry);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
