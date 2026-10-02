/**
 * Render the RolePlayManager promo videos and ads.
 *
 *   node marketing/render.mjs [out folder] [only this file]
 *   node marketing/render.mjs [out folder] frames 1080x1920 3,11.5   single frames, to check
 *   node marketing/render.mjs import-voice rpm-promo-voice.json        the radio voices
 *
 * Opens marketing/promo.html in headless Edge (or Chrome) once per output.
 * Video frames come back as PNGs and go straight into ffmpeg, so the result
 * is frame exact however fast the machine is. Needs ffmpeg on the PATH, or
 * FFMPEG set to it.
 *
 * The radio voices are the bot's own: the dispatcher's "diana" voice and two
 * officer voices, made on the live server at /dev/promo-voice (the voice key
 * only exists there) and imported into marketing/voice/. The two radio
 * scenes last as long as their clips. Without clips the video renders
 * silent, with estimated timings.
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const VOICE_DIR = path.join(HERE, 'voice');
const CLICK_FILE = path.join(REPO, 'src/assets/radio_wave.mp3');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || FFMPEG.replace(/ffmpeg(?=(\.exe)?$)/i, 'ffprobe');
const BROWSER = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

// ── import-voice: the JSON downloaded from /dev/promo-voice ─────────────────
if (process.argv[2] === 'import-voice') {
  const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
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
  process.exit(0);
}

const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out'));
const ONLY = process.argv[3] && process.argv[3] !== 'frames' ? process.argv[3] : null;

// ── The timeline ────────────────────────────────────────────────────────────
// The bot plays its radio click before every dispatcher line; the voice comes
// in this far into the click.
const CLICK_LEAD = 1.0;
const GAP = 0.35;
// Until the real clips are imported.
const ESTIMATES = { call: 6.2, respond: 2.6, respondAck: 2.4, plate: 1.9, plateReply: 6.4 };
// [clip, spoken by the dispatcher?]
const RADIO_SCENES = {
  call911: [['call', true], ['respond', false], ['respondAck', true]],
  plate: [['plate', false], ['plateReply', true]],
};

const clipFile = (id) => {
  const f = path.join(VOICE_DIR, id + '.wav');
  return fs.existsSync(f) ? f : null;
};
const durationOf = (file) => {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(String(r.stdout).trim()) || null;
};

function buildTimeline() {
  const scenes = []; const radio = {}; const clips = []; const clicks = [];
  let t = 0;
  const add = (id, len) => { scenes.push({ id, start: t, end: t + len }); t += len; };
  add('hook', 3.8);
  add('brand', 3.8);
  for (const [id, lines] of Object.entries(RADIO_SCENES)) {
    const start = t;
    let local = 0.7;
    radio[id] = [];
    for (const [clip, dispatcher] of lines) {
      const file = clipFile(clip);
      const dur = (file && durationOf(file)) || ESTIMATES[clip];
      const from = local;
      if (dispatcher) { clicks.push(start + local); local += CLICK_LEAD; }
      radio[id].push({ id: clip, from, at: local, end: local + dur });
      if (file) clips.push({ id: clip, file, at: start + local, officer: !dispatcher });
      local += dur + GAP;
    }
    add(id, local + 0.55);
  }
  add('cad', 5.2);
  add('directory', 4.8);
  add('safety', 4.4);
  add('features', 3.6);
  add('cta', 4.4);
  const voiced = clips.length > 0;
  return { scenes, radio, clips, clicks: voiced ? clicks : [], duration: Math.round(t * 30) / 30, voiced };
}
const TIMELINE = buildTimeline();

// ── ffmpeg: frames from the page, the radio click and the voices ────────────
const ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const ms = (s) => Math.max(0, Math.round(s * 1000));

function videoArgs(out) {
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-'];
  const { clips, clicks, duration } = TIMELINE;
  if (!clips.length) return [...args, ...ENCODE, out];
  args.push('-i', CLICK_FILE);
  clips.forEach((c) => args.push('-i', c.file));
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const parts = [`[1:a]${norm},asplit=${clicks.length}${clicks.map((_, i) => `[k${i}]`).join('')}`];
  clicks.forEach((at, i) => parts.push(`[k${i}]adelay=${ms(at)}:all=1,volume=0.6[c${i}]`));
  clips.forEach((c, i) => {
    // Officers come through a radio; the dispatcher sounds as the bot does.
    const radio = c.officer ? 'highpass=f=280,lowpass=f=3400,acompressor=threshold=0.1:ratio=3:attack=5:release=80,volume=1.4,' : '';
    parts.push(`[${i + 2}:a]${norm},${radio}adelay=${ms(c.at)}:all=1[v${i}]`);
  });
  const all = [...clicks.map((_, i) => `[c${i}]`), ...clips.map((_, i) => `[v${i}]`)].join('');
  parts.push(`${all}amix=inputs=${clicks.length + clips.length}:normalize=0,alimiter=limit=0.95,apad=whole_dur=${duration}[aout]`);
  return [...args, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[aout]',
    ...ENCODE, '-c:a', 'aac', '-b:a', '160k', '-shortest', out];
}

// ── Jobs ────────────────────────────────────────────────────────────────────
const FRAMES = process.argv[3] === 'frames'
  ? process.argv[5].split(',').map((t) => {
    const [w, h] = process.argv[4].split('x').map(Number);
    return { name: `frame-${w}x${h}-${t}.png`, kind: 'still', w, h, t: Number(t) };
  })
  : null;

const JOBS = FRAMES || [
  { name: 'promo-vertical.mp4', kind: 'video', w: 1080, h: 1920 },
  { name: 'promo-horizontal.mp4', kind: 'video', w: 1920, h: 1080 },
  { name: 'ad-square-gta6.png', kind: 'still', w: 1080, h: 1080, still: 'gta6' },
  { name: 'ad-square-dispatch.png', kind: 'still', w: 1080, h: 1080, still: 'dispatch' },
  { name: 'ad-story.png', kind: 'still', w: 1080, h: 1920, still: 'story' },
  { name: 'og.png', kind: 'still', w: 1200, h: 630, still: 'og' },
  { name: 'promo-poster.jpg', kind: 'still', w: 1920, h: 1080, t: 6.6 },
];

fs.mkdirSync(OUT, { recursive: true });
let current = null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (req.method === 'GET') {
    if (url.pathname === '/timeline.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(TIMELINE));
      return;
    }
    const file = url.pathname === '/' ? path.join(HERE, 'promo.html')
      : url.pathname === '/logo.png' ? path.join(REPO, 'site/img/logo.png') : null;
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' });
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
      fs.writeFileSync(path.join(OUT, path.basename(url.searchParams.get('name'))), body);
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

console.log((TIMELINE.voiced ? 'With the radio voices, ' : 'Silent (no voices imported yet), ') + TIMELINE.duration.toFixed(1) + 's');
for (const job of JOBS) {
  if (ONLY && job.name !== ONLY) continue;
  const started = Date.now();
  let ff = null;
  if (job.kind === 'video') {
    ff = spawn(FFMPEG, videoArgs(path.join(OUT, job.name)), { stdio: ['pipe', 'inherit', 'inherit'] });
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
