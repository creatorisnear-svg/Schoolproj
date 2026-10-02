/**
 * What the promo renderers share (render.mjs, render-cybercom.mjs): the radio
 * voices, and rendering a page's jobs in headless Edge (or Chrome). Video
 * frames come back as PNGs and go straight into ffmpeg, so the result is
 * frame exact however fast the machine is. Needs ffmpeg on the PATH, or
 * FFMPEG set to it.
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');
export const VOICE_DIR = path.join(HERE, 'voice');
export const CLICK_FILE = path.join(REPO, 'src/assets/radio_wave.mp3');
export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || FFMPEG.replace(/ffmpeg(?=(\.exe)?$)/i, 'ffprobe');
const BROWSER = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

// ── import-voice: the JSON downloaded from /dev/promo-voice ─────────────────
export function importVoice(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  for (const line of data.lines || []) {
    if (!line.audio) { console.log(line.id + ': no audio, ' + (line.error || 'unknown error')); continue; }
    const raw = path.join(os.tmpdir(), 'rpm-voice-' + line.id + '.bin');
    fs.writeFileSync(raw, Buffer.from(line.audio, 'base64'));
    // A clean WAV with the silence trimmed from both ends, so timings are exact.
    const trim = 'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB';
    // Officers are people on a radio: the voice model spells a plate out with
    // long gaps between letters, so long pauses are cut and the pace lifted a
    // little. The dispatcher is left exactly as the bot says it.
    const officer = line.voice === 'dispatch' ? ''
      : ',silenceremove=stop_periods=-1:stop_duration=0.25:stop_threshold=-38dB:stop_silence=0.18,atempo=1.08';
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-af', `${trim},areverse,${trim},areverse${officer}`,
      '-ar', '48000', '-ac', '1', path.join(VOICE_DIR, line.id + '.wav')], { stdio: 'inherit' });
    fs.rmSync(raw, { force: true });
    console.log(line.id + ': ' + (r.status === 0 ? 'imported, voice ' + line.voice : 'failed'));
  }
}

export const clipFile = (id) => {
  const f = path.join(VOICE_DIR, id + '.wav');
  return fs.existsSync(f) ? f : null;
};
export const durationOf = (file) => {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(String(r.stdout).trim()) || null;
};

export const ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
export const ms = (s) => Math.max(0, Math.round(s * 1000));

/** `[out folder] frames 1080x1920 3,11.5` on the command line: single frames, to check. */
export function frameJobs(argv) {
  if (argv[3] !== 'frames') return null;
  const [w, h] = argv[4].split('x').map(Number);
  return argv[5].split(',').map((t) => ({ name: `frame-${w}x${h}-${t}.png`, kind: 'still', w, h, t: Number(t) }));
}

/**
 * Render each job ({ name, kind: 'video' or 'still', w, h, still?, t? }) of a
 * page into out. The page is served with kit.js, the logo and the timeline;
 * videoArgs(file) gives ffmpeg's arguments for a video, frames on stdin.
 */
export async function renderJobs({ page, timeline, jobs, out, only = null, videoArgs }) {
  fs.mkdirSync(out, { recursive: true });
  let current = null;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (req.method === 'GET') {
      if (url.pathname === '/timeline.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(timeline));
        return;
      }
      const file = url.pathname === '/' ? page
        : url.pathname === '/kit.js' ? path.join(HERE, 'kit.js')
          : url.pathname === '/logo.png' ? path.join(REPO, 'site/img/logo.png') : null;
      if (!file) { res.writeHead(404); res.end(); return; }
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(file).pipe(res);
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === '/frame') {
        current.frames++;
        current.ff.stdin.write(body, () => res.end('ok'));
      } else if (url.pathname === '/still') {
        fs.writeFileSync(path.join(out, path.basename(url.searchParams.get('name'))), body);
        res.end('ok');
      } else if (url.pathname === '/done') {
        res.end('ok'); current.resolve();
      } else if (url.pathname === '/error') {
        res.end('ok'); current.reject(new Error(body.toString()));
      } else {
        res.writeHead(404); res.end();
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  for (const job of jobs) {
    if (only && job.name !== only) continue;
    const started = Date.now();
    let ff = null;
    if (job.kind === 'video') {
      ff = spawn(FFMPEG, videoArgs(path.join(out, job.name), job), { stdio: ['pipe', 'inherit', 'inherit'] });
    }
    const done = new Promise((resolve, reject) => {
      current = { ff, frames: 0, resolve, reject };
      setTimeout(() => reject(new Error('timed out')), job.kind === 'video' ? 20 * 60 * 1000 : 90 * 1000).unref();
    });
    const qs = new URLSearchParams({ job: job.kind, w: job.w, h: job.h, name: job.name });
    if (job.still) qs.set('still', job.still);
    if (job.t !== undefined) qs.set('t', job.t);
    if (job.name.endsWith('.jpg')) qs.set('fmt', 'jpg');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-promo-'));
    const browser = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
      '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + profile,
      '--window-size=' + job.w + ',' + job.h, `http://127.0.0.1:${port}/?${qs}`], { stdio: 'ignore' });
    try {
      await done;
    } finally {
      spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
      if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    }
    console.log(job.name + (ff ? ', ' + current.frames + ' frames' : '') + ', ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  }
  server.close();
}
