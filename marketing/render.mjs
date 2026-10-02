/**
 * Render the RolePlayManager promo videos and ads.
 *
 *   node marketing/render.mjs [out folder] [only this file]
 *   node marketing/render.mjs [out folder] frames 1080x1920 3,11.5   single frames, to check
 *   node marketing/render.mjs import-voice rpm-promo-voice.json        the radio voices
 *
 * Opens marketing/promo.html in headless Edge once per output (render-kit.mjs).
 *
 * The radio voices are the bot's own: the dispatcher's "diana" voice and two
 * officer voices, made on the live server at /dev/promo-voice (the voice key
 * only exists there) and imported into marketing/voice/. The two radio
 * scenes last as long as their clips. Without clips the video renders
 * silent, with estimated timings.
 */
import path from 'node:path';
import { HERE, CLICK_FILE, ENCODE, ms, clipFile, durationOf, importVoice, frameJobs, renderJobs } from './render-kit.mjs';

if (process.argv[2] === 'import-voice') {
  importVoice(process.argv[3]);
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
const JOBS = frameJobs(process.argv) || [
  { name: 'promo-vertical.mp4', kind: 'video', w: 1080, h: 1920 },
  { name: 'promo-horizontal.mp4', kind: 'video', w: 1920, h: 1080 },
  { name: 'ad-square-gta6.png', kind: 'still', w: 1080, h: 1080, still: 'gta6' },
  { name: 'ad-square-dispatch.png', kind: 'still', w: 1080, h: 1080, still: 'dispatch' },
  { name: 'ad-story.png', kind: 'still', w: 1080, h: 1920, still: 'story' },
  { name: 'og.png', kind: 'still', w: 1200, h: 630, still: 'og' },
  { name: 'promo-poster.jpg', kind: 'still', w: 1920, h: 1080, t: 6.6 },
];

console.log((TIMELINE.voiced ? 'With the radio voices, ' : 'Silent (no voices imported yet), ') + TIMELINE.duration.toFixed(1) + 's');
await renderJobs({ page: path.join(HERE, 'promo.html'), timeline: TIMELINE, jobs: JOBS, out: OUT, only: ONLY, videoArgs });
