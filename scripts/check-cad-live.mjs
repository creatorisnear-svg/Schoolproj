/*
 * The web CAD's live updates have two halves that must agree: the server
 * reports which SECTIONS moved (src/website/routes/cad/events.js), and each
 * view in the browser lists the sections it is drawn from (WATCH in
 * src/website/public/js/cad-app.js). A view missing from WATCH never
 * refreshes on its own; a section name misspelt on either side does the
 * same, silently. This checks both. Needs no database.
 *
 *   npm run check:cad
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SECTIONS } = await import(pathToFileURL(path.join(root, 'src/website/routes/cad/events.js')).href);

const app = readFileSync(path.join(root, 'src/website/public/js/cad-app.js'), 'utf8');

const wStart = app.indexOf('var WATCH = {');
const wEnd = app.indexOf('};', wStart) + 2;
if (wStart < 0) {
  console.error('CAD live-update check: could not find the WATCH table in cad-app.js');
  process.exit(1);
}
const WATCH = new Function(app.slice(wStart, wEnd) + '; return WATCH;')();
const views = [...app.matchAll(/^  VIEWS\.([a-z0-9]+) = /gm)].map((m) => m[1]);

const problems = [];
for (const v of views) {
  if (!(v in WATCH)) problems.push(`view "${v}" is not in WATCH, so it never refreshes on its own`);
}
for (const v of Object.keys(WATCH)) {
  if (!views.includes(v)) problems.push(`WATCH lists "${v}", which is not a view`);
}
for (const [v, sections] of Object.entries(WATCH)) {
  for (const s of sections) {
    if (!SECTIONS.includes(s)) problems.push(`view "${v}" watches "${s}", which the server never reports`);
  }
}
const watched = new Set(Object.values(WATCH).flat());
for (const s of SECTIONS) {
  // priority feeds the top bar badge rather than a view.
  if (s !== 'priority' && !watched.has(s)) problems.push(`section "${s}" is computed every tick but no view watches it`);
}

if (problems.length) {
  console.error('CAD live-update check failed:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`CAD live-update check: ${views.length} views and ${SECTIONS.length} sections agree`);
process.exit(0);
