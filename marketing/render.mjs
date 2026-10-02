/**
 * Render the RolePlayManager promo videos and ads.
 *
 *   node marketing/render.mjs [out folder] [only this file]
 *
 * Opens marketing/promo.html in headless Edge (or Chrome) once per output.
 * Video frames come back as PNGs and go straight into ffmpeg, so the result
 * is frame exact however fast the machine is. Needs ffmpeg on the PATH, or
 * FFMPEG set to it.
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out'));
const ONLY = process.argv[3] && process.argv[3] !== 'frames' ? process.argv[3] : null;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const BROWSER = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

// node render.mjs <out> frames 1080x1920 3,11.5,17 renders single frames to check.
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

for (const job of JOBS) {
  if (ONLY && job.name !== ONLY) continue;
  const started = Date.now();
  let ff = null;
  if (job.kind === 'video') {
    ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      path.join(OUT, job.name)], { stdio: ['pipe', 'inherit', 'inherit'] });
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
