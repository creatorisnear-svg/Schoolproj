import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * The bot's console for the dev panel's Logs tab, live, the way Koyeb's
 * console showed it.
 *
 * Under systemd (the Dell) the journal holds everything the bot printed,
 * across restarts and deploys, so lines come from journalctl, with the
 * updater's deploys and systemd's own start and stop lines beside them.
 * Anywhere else, or when the journal cannot be read, they come from this
 * process: what it wrote to stdout and stderr since it started.
 */

const RING_SIZE = 3000;
const HISTORY = 500;
// The Dell's updater (rpm-deploy.timer): its deploys show in the console too.
const DEPLOY_UNIT = 'rpm-deploy.service';

// ── This process's own output ───────────────────────────────────────────────
// Ids are "<run>:<n>", so a viewer reconnecting to a new run starts over
// instead of skipping lines.
const RUN = randomBytes(4).toString('hex');
const ring = [];
const listeners = new Set();
let seq = 0;
let delivering = false;

function push(text) {
  const line = { id: `${RUN}:${++seq}`, t: Date.now(), text, from: 'bot', pid: process.pid };
  ring.push(line);
  if (ring.length > RING_SIZE) ring.shift();
  if (delivering) return; // a listener that prints must not loop back here
  delivering = true;
  for (const fn of listeners) {
    try { fn(line); } catch { /* one viewer's broken connection is not the bot's problem */ }
  }
  delivering = false;
}

let capturing = false;
/** Keep a copy of everything this process prints. Called once, at startup. */
export function captureConsole() {
  if (capturing) return;
  capturing = true;
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    let rest = '';
    stream.write = (chunk, ...args) => {
      try {
        rest += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        const lines = rest.split('\n');
        rest = lines.pop();
        for (const text of lines) push(text);
      } catch { /* logging must never break the bot */ }
      return write(chunk, ...args);
    };
  }
}

// ── The journal ─────────────────────────────────────────────────────────────

/** The systemd service this process runs as, or null when it is not one. */
function ownUnit() {
  try {
    const m = /\/([^/\s]+\.service)\s*$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

let journalReadable = null;
function canReadJournal(unit) {
  if (journalReadable === null) {
    const r = spawnSync('journalctl', ['-u', unit, '-n', '1', '-o', 'json', '--no-pager', '-q'], { encoding: 'utf8', timeout: 5000 });
    journalReadable = r.status === 0 && Boolean(r.stdout && r.stdout.trim());
  }
  return journalReadable;
}

function fromJournal(entry, unit) {
  let text = entry.MESSAGE;
  if (Array.isArray(text)) text = Buffer.from(text).toString('utf8');
  const pid = Number(entry._PID) || null;
  const from = pid === 1 || entry._COMM === 'systemd' ? 'system'
    : (entry._SYSTEMD_UNIT || entry.UNIT) === DEPLOY_UNIT ? 'deploy' : 'bot';
  return { id: entry.__CURSOR, t: Math.floor(Number(entry.__REALTIME_TIMESTAMP) / 1000), text: String(text ?? ''), from, pid, unit };
}

function followJournal(unit, after, onLine, onEnd) {
  // A journal cursor looks like "s=...;i=...". Anything else is from another
  // source, so start from the recent history instead.
  const resume = typeof after === 'string' && after.startsWith('s=') ? ['--after-cursor', after] : ['-n', String(HISTORY)];
  const child = spawn('journalctl', ['-u', unit, '-u', DEPLOY_UNIT, '-o', 'json', '-f', '--no-pager', '-q', ...resume],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  let rest = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    rest += chunk;
    const lines = rest.split('\n');
    rest = lines.pop();
    for (const raw of lines) {
      if (!raw) continue;
      try { onLine(fromJournal(JSON.parse(raw), unit)); } catch { /* not JSON: skip it */ }
    }
  });
  let ended = false;
  const end = () => { if (!ended) { ended = true; onEnd?.(); } };
  child.on('exit', end);
  child.on('error', end);
  return () => { ended = true; try { child.kill(); } catch {} };
}

/** Where the lines come from: { journal: true, unit } or { journal: false }. */
export function logSource() {
  const unit = ownUnit();
  return unit && canReadJournal(unit) ? { journal: true, unit } : { journal: false };
}

/**
 * Send the console to onLine: the last lines (or, for a viewer reconnecting,
 * everything after `after`, the id of the last line it has), then each new
 * line as it is printed. Returns a function that stops it.
 */
export function followLogs({ after = null, onLine, onEnd }) {
  const source = logSource();
  if (source.journal) return followJournal(source.unit, after, onLine, onEnd);
  const [run, n] = String(after || '').split(':');
  const start = run === RUN ? ring.filter((l) => Number(l.id.split(':')[1]) > Number(n)) : ring.slice(-HISTORY);
  for (const line of start) onLine(line);
  listeners.add(onLine);
  return () => listeners.delete(onLine);
}
