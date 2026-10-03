/**
 * Render the RPM CyberCom promo: traffic stops, 10-80s and civilians moved by
 * voice, then voice moderation, cut to the beat of Genesis by Grimes.
 *
 *   SONG=genesis.mp3 node marketing/render-cybercom.mjs [out folder] [only this file]
 *   node marketing/render-cybercom.mjs [out folder] frames 1080x1920 3,11.5   single frames, to check
 *   SONG=genesis.mp3 node marketing/render-cybercom.mjs audio mix.wav       the soundtrack alone, to check the mix
 *   node marketing/render-cybercom.mjs timeline                              when each scene and line starts
 *   node marketing/render-cybercom.mjs import-voice rpm-promo-voice-cybercom.json
 *
 * Opens marketing/cybercom.html in headless Edge once per output
 * (render-kit.mjs). The voices are the bot's own, made on the live server at
 * /dev/promo-voice?set=cybercom and imported into marketing/voice/; until
 * then the timings are estimated and the video has no voices. The song is
 * not in the repo: without SONG the video has no music.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HERE, CLICK_FILE, FFMPEG, ENCODE, ms, clipFile, durationOf, loudnessOf, importVoice, frameJobs, renderJobs } from './render-kit.mjs';

if (process.argv[2] === 'import-voice') {
  importVoice(process.argv[3]);
  process.exit(0);
}
const SHOW_TIMELINE = process.argv[2] === 'timeline';
const AUDIO_ONLY = process.argv[2] === 'audio' ? path.resolve(process.argv[3] || 'cybercom-audio.wav') : null;
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out'));
const ONLY = process.argv[3] && process.argv[3] !== 'frames' ? process.argv[3] : null;
const SONG = process.env.SONG && fs.existsSync(process.env.SONG) ? process.env.SONG : null;

// ── The song ────────────────────────────────────────────────────────────────
// Genesis by Grimes, 112.25 beats a minute. Beat k of the song is at
// SONG_BEAT0 + k * BEAT, bars start on the beats where k % 4 is 2, and the
// drop hits on beat 162 after a bar with the kick out. The video starts where
// the song does, plays its intro under the radio, then jumps to that bar.
const BEAT = 0.53452;
const SONG_BEAT0 = 0.2594;
const SONG_START = 0.93;
const BREAK_BEAT = 158;
const at = (k) => SONG_BEAT0 + k * BEAT - SONG_START;
/** The first beat at or after t (in the video), optionally the first that starts a bar. */
function beatFrom(t, bar = false) {
  let k = Math.ceil((t + SONG_START - SONG_BEAT0) / BEAT - 1e-6);
  while (bar && (k - 2) % 4) k++;
  return k;
}

// ── The story ───────────────────────────────────────────────────────────────
// Each line is a clip from /dev/promo-voice?set=cybercom: who says it, in
// which voice channel, the caption, and what the bot does next, a beat apart
// (stops.js). The bot's lines in police radio and traffic stop channels start
// with the radio click, as its helpers' do (session.js); civilian channels are
// not a radio. Officers sound like a radio, civilians like voice chat.
const RADIO = new Set(['Patrol 1', 'Traffic Stop 1']);
const isBot = (who) => who === 'Dispatch' || who.startsWith('RPM CyberCom');
const STORY = [
  ['stop', [
    { clip: 'ccStop', who: 'Reyes', where: 'Patrol 1', text: 'Dispatch, show me on a 10-11 with Blade.' },
    { clip: 'ccStopAck', who: 'Dispatch', where: 'Patrol 1', text: 'Copy Reyes, 10-11 with Blade. Moving you to Traffic Stop 1.',
      then: [[0, 'move', 'Reyes', 'Traffic Stop 1'], [0, 'tag', 'Traffic Stop 1', '10-11'], [1, 'join', 'RPM CyberCom 2', 'Traffic Stop 1']] },
    { clip: 'ccStopAsk', who: 'RPM CyberCom 1', where: 'Civilian 1', text: 'Blade, would you like to be moved into the 10-11 channel?' },
    { clip: 'ccStopYes', who: 'Blade', where: 'Civilian 1', text: 'Yeah, move me.',
      then: [[0, 'move', 'Blade', 'Traffic Stop 1']] },
  ]],
  ['pursuit', [
    // The helper in the stop answers first ("Copy Reyes, ten eighty. Letting all
    // units know.", clip ccPursuitAck); left out to keep the video short.
    { clip: 'ccPursuit', who: 'Reyes', where: 'Traffic Stop 1', text: 'Dispatch, show me in a 10-80.',
      then: [[0, 'tag', 'Traffic Stop 1', '10-80']] },
    { clip: 'ccPursuitRadio', who: 'Dispatch', where: 'Patrol 1', text: 'Reyes is in a 10-80. Any units wanting to respond, say dispatch, attach me to the 10-80.' },
    { clip: 'ccAttach', who: 'Unit 12', where: 'Patrol 1', text: 'Dispatch, attach me to the 10-80.' },
    { clip: 'ccAttachAck', who: 'Dispatch', where: 'Patrol 1', text: "Copy Unit 12, attaching you to Reyes's 10-80.",
      then: [[0, 'move', 'Unit 12', 'Traffic Stop 1']] },
  ]],
  ['clear', [
    { clip: 'ccClear', who: 'Reyes', where: 'Traffic Stop 1', text: 'Dispatch, show me off my 10-11.' },
    { clip: 'ccClearAck', who: 'RPM CyberCom 2', where: 'Traffic Stop 1', text: 'Copy, 10-8. Moving everyone back to their channels. Say no to stay.',
      then: [[0, 'tag', 'Traffic Stop 1', null], [1, 'move', 'Reyes', 'Patrol 1'], [2, 'move', 'Blade', 'Civilian 1'], [3, 'move', 'Unit 12', 'Patrol 1']] },
  ]],
  ['civilian', [
    { clip: 'ccRpm', who: 'Blade', where: 'Civilian 1', text: 'RPM, move me to Mia.' },
    { clip: 'ccRpmAck', who: 'RPM CyberCom 1', where: 'Civilian 1', text: 'Moving you to Mia.',
      then: [[0, 'move', 'Blade', 'Civilian 2']] },
  ]],
];
// Until the real clips are imported.
const ESTIMATES = {
  ccStop: 2.6, ccStopAck: 5.0, ccStopAsk: 4.6, ccStopYes: 0.9, ccPursuit: 2.0, ccPursuitAck: 3.3, ccPursuitRadio: 7.6,
  ccAttach: 2.0, ccAttachAck: 3.6, ccClear: 2.2, ccClearAck: 5.2, ccRpm: 1.9, ccRpmAck: 1.5,
};
// The bot plays its radio click this long before the voice comes in.
const CLICK_LEAD = 1.0;
// A move takes this long on screen before the next line starts.
const MOVE_SETTLE = 0.5;

// ── The timeline ────────────────────────────────────────────────────────────
function buildTimeline() {
  const scenes = [];
  const add = (id, k0, k1, cut = false) => scenes.push({ id, start: Math.max(0, at(k0)), end: at(k1), ...(cut ? { cut } : {}) });
  add('hook', 0, 10);
  add('brand', 10, 18);

  // The radio part, every line and move on a beat. Times in cc are from the
  // start of the cybercom scene.
  const ccStart = at(18);
  const cc = { sections: [], lines: [], events: [] };
  const clips = []; const clicks = [];
  let cursor = ccStart + 2 * BEAT;
  STORY.forEach(([section, lines], i) => {
    if (i > 0) {
      const k = beatFrom(cursor);
      cc.sections.push({ id: section, at: at(k) - ccStart });
      cursor = at(k + 2);
    } else {
      cc.sections.push({ id: section, at: 0 });
    }
    for (const line of lines) {
      const file = clipFile(line.clip);
      const dur = (file && durationOf(file)) || ESTIMATES[line.clip];
      const from = at(beatFrom(cursor));
      const click = isBot(line.who) && RADIO.has(line.where);
      const voice = from + (click ? CLICK_LEAD : 0);
      if (click) clicks.push(from);
      if (file) {
        clips.push({ id: line.clip, file, at: voice, loud: loudnessOf(file), radio: !isBot(line.who) && RADIO.has(line.where), human: !isBot(line.who) });
      }
      cc.lines.push({ ...line, then: undefined, from: from - ccStart, at: voice - ccStart, end: voice + dur - ccStart });
      cursor = voice + dur + 0.12;
      if (line.then) {
        const k = beatFrom(voice + dur + 0.08);
        for (const [beats, kind, a, b] of line.then) {
          const t = at(k + beats);
          cc.events.push(kind === 'tag' ? { at: t - ccStart, kind, channel: a, code: b } : { at: t - ccStart, kind, member: a, channel: b });
          cursor = Math.max(cursor, t + MOVE_SETTLE);
        }
      }
    }
  });

  // A bar's pause, then the music comes up for a bar and drops on voice
  // moderation. Both are hard cuts, on the beat.
  const bridge = beatFrom(cursor + 0.4, true);
  add('cybercom', 18, bridge);
  add('bridge', bridge, bridge + 4, true);
  const drop = bridge + 4;
  add('flags', drop, drop + 12, true);
  add('roleplay', drop + 12, drop + 20);
  add('settings', drop + 20, drop + 28);
  add('cta', drop + 28, drop + 44);
  const duration = Math.round(at(drop + 44) * 30) / 30;
  if (bridge >= BREAK_BEAT) throw new Error('The radio part runs past the drop in the song; shorten it.');

  return {
    scenes, cc, clips, clicks, duration, voiced: clips.length > 0,
    beat: BEAT, beat0: at(0), drop: at(drop),
    music: SONG ? { cut: at(bridge), duckIn: ccStart + 0.2, songAt: SONG_BEAT0 + BREAK_BEAT * BEAT } : null,
  };
}
const TIMELINE = buildTimeline();

// ── The mix ─────────────────────────────────────────────────────────────────
// Every clip is brought to VOICE_LUFS before its compressor, so the cast
// sounds even, and the click sits under them; VOICE_DB then lifts them all
// (after the compressors, which would undo a louder input). The song is loud
// for the opening, low under the radio (and lower still while someone
// talks), and up from the bar before the drop. The master lands near -14
// LUFS, what YouTube and TikTok play at, peaks held under full scale with room
// for the AAC encoder.
const VOICE_LUFS = -17;
const CLICK_LUFS = -22;
const VOICE_DB = 4;
const MUSIC = { open: 0.63, radio: 0.24, drop: 0.57 };
const MASTER_DB = 3;

/** The soundtrack: its ffmpeg inputs, numbered from first, and a graph ending in [aout]. */
function soundtrack(first) {
  const { clips, clicks, duration: T, music } = TIMELINE;
  if (!clips.length && !music) return null;
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const inputs = [], parts = [];
  let input = first;
  const db = (x) => `volume=${x.toFixed(2)}dB`;

  // The voices: clicks and clips, each at its time.
  if (clips.length) {
    const voices = [];
    inputs.push('-i', CLICK_FILE);
    const click = input++;
    parts.push(`[${click}:a]${norm},${db(CLICK_LUFS - (loudnessOf(CLICK_FILE) ?? CLICK_LUFS))},asplit=${clicks.length}${clicks.map((_, i) => `[k${i}]`).join('')}`);
    clicks.forEach((t, i) => { parts.push(`[k${i}]adelay=${ms(t)}:all=1[c${i}]`); voices.push(`[c${i}]`); });
    clips.forEach((c, i) => {
      inputs.push('-i', c.file);
      // Officers come through a radio, civilians through voice chat; the bot
      // sounds as it does.
      const fx = c.radio ? 'highpass=f=280,lowpass=f=3400,acompressor=threshold=0.1:ratio=3:attack=5:release=80,volume=1.4'
        : c.human ? 'highpass=f=120,acompressor=threshold=0.1:ratio=2.5:attack=5:release=80'
          : 'acompressor=threshold=0.1:ratio=2.5:attack=4:release=90';
      parts.push(`[${input++}:a]${norm},${db(VOICE_LUFS - (c.loud ?? VOICE_LUFS))},${fx},adelay=${ms(c.at)}:all=1[v${i}]`);
      voices.push(`[v${i}]`);
    });
    parts.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0,${db(VOICE_DB)},apad=whole_dur=${T}${music ? ',asplit=2[vo][key]' : '[vo]'}`);
  }

  if (music) {
    // The intro up to the cut, then the bar before the drop, crossfaded on the bar line.
    inputs.push('-i', SONG);
    const song = input++;
    const D = 0.08;
    const { cut, duckIn, songAt } = music;
    const level = `${MUSIC.open}+${MUSIC.radio - MUSIC.open}*clip((t-${duckIn.toFixed(3)})/0.6,0,1)`
      + `+${MUSIC.drop - MUSIC.radio}*clip((t-${(cut - 0.12).toFixed(3)})/0.25,0,1)`;
    parts.push(`[${song}:a]asplit=2[s1][s2]`);
    parts.push(`[s1]atrim=start=${SONG_START}:end=${(SONG_START + cut + D / 2).toFixed(4)},asetpts=PTS-STARTPTS[ma]`);
    parts.push(`[s2]atrim=start=${(songAt - D / 2).toFixed(4)}:end=${(songAt + T - cut + 1).toFixed(4)},asetpts=PTS-STARTPTS[mb]`);
    parts.push(`[ma][mb]acrossfade=d=${D}:c1=tri:c2=tri,${norm},volume='${level}':eval=frame,afade=t=in:d=0.04,afade=t=out:st=${(T - 2.6).toFixed(3)}:d=2.6,atrim=end=${T}[mv]`);
    if (clips.length) {
      parts.push('[mv][key]sidechaincompress=threshold=0.1:ratio=2:attack=20:release=400[md]');
      parts.push('[vo][md]amix=inputs=2:normalize=0:duration=first[mix]');
    } else {
      parts.push('[mv]anull[mix]');
    }
  } else {
    parts.push('[vo]anull[mix]');
  }
  parts.push(`[mix]${db(MASTER_DB)},alimiter=limit=0.86:level=false:latency=true[aout]`);
  return { inputs, filter: parts.join(';') };
}

function videoArgs(out) {
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-'];
  const sound = soundtrack(1);
  if (!sound) return [...args, ...ENCODE, out];
  return [...args, ...sound.inputs, '-filter_complex', sound.filter, '-map', '0:v', '-map', '[aout]',
    ...ENCODE, '-c:a', 'aac', '-b:a', '192k', '-shortest', out];
}

// ── Jobs ────────────────────────────────────────────────────────────────────
// With the song the files end in -music, like the first promo's: the song is
// copyrighted, so a version without it is kept for where it cannot be used.
const TAG = SONG ? '-music' : '';
const JOBS = frameJobs(process.argv) || [
  { name: `cybercom-vertical${TAG}.mp4`, kind: 'video', w: 1080, h: 1920 },
  { name: `cybercom-horizontal${TAG}.mp4`, kind: 'video', w: 1920, h: 1080 },
];

console.log((TIMELINE.voiced ? 'With the voices' : 'No voices imported yet, timings estimated') + (SONG ? ', with the song, ' : ', no song, ')
  + TIMELINE.duration.toFixed(1) + 's, the drop at ' + TIMELINE.drop.toFixed(2) + 's');
if (SHOW_TIMELINE) {
  console.log(TIMELINE.scenes.map((s) => `${s.id.padEnd(9)} ${s.start.toFixed(2).padStart(6)} to ${s.end.toFixed(2).padStart(6)}`).join('\n'));
  const cc = TIMELINE.scenes.find((s) => s.id === 'cybercom').start;
  for (const l of TIMELINE.cc.lines) console.log(`  ${(cc + l.from).toFixed(2).padStart(6)} ${l.clip.padEnd(15)} ${(l.end - l.from).toFixed(2)}s`);
  process.exit(0);
}
if (AUDIO_ONLY) {
  const sound = soundtrack(0);
  if (!sound) throw new Error('Nothing to hear: import the voices or set SONG.');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...sound.inputs, '-filter_complex', sound.filter, '-map', '[aout]', AUDIO_ONLY], { stdio: 'inherit' });
  console.log(r.status === 0 ? AUDIO_ONLY : 'ffmpeg failed');
  process.exit(r.status);
}
await renderJobs({ page: path.join(HERE, 'cybercom.html'), timeline: TIMELINE, jobs: JOBS, out: OUT, only: ONLY, videoArgs });
