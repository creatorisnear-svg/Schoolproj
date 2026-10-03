// The drawing kit shared by the promo pages (promo.html, cybercom.html): the
// canvas, colours, text, Discord look-alikes and the scene runner. A page
// draws its scenes with these and calls startPromo() at the end.

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 1080, H = +q.get('h') || 1920;
const FPS = 30;
let DUR = 31;
const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
const PORTRAIT = H > W;
const S = Math.min(W, H) / 1080;

const C = {
  bg: '#0a0b0e', card: '#16181e', input: '#111318', border: '#23272f', text: '#e8eaed', muted: '#7a818e',
  green: '#34d399', red: '#f87171', amber: '#fbbf24', blue: '#60a5fa',
  dBg: '#313338', dEmbed: '#2b2d31', dText: '#dbdee1', dMuted: '#949ba4', dBlurple: '#5865f2',
  dGreen: '#23a55a', dRed: '#da373c', dGray: '#4e5058',
};
const INTER = '"Inter", "Segoe UI", sans-serif';
const MONT = '"Montserrat", "Segoe UI", sans-serif';
const MONO = 'Consolas, "Cascadia Mono", monospace';

// ── Helpers ─────────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const prog = (t, start, dur = 0.5) => ease((t - start) / dur);
const font = (size, weight = 700, fam = INTER) => `${weight} ${Math.round(size * 100) / 100}px ${fam}`;

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

/** Wrap to maxW; a newline in str always starts a new line. */
function wrapLines(str, maxW, f) {
  ctx.save(); ctx.font = f;
  const out = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
    }
    if (line) out.push(line);
  }
  ctx.restore();
  return out;
}

/** Draw text (wrapped to maxW); returns the height it used. */
function drawText(str, x, y, o = {}) {
  const { size = 40, weight = 700, fam = INTER, color = C.text, align = 'left', alpha = 1,
    maxW = 1e9, lh = 1.2, baseline = 'top', spacing = 0 } = o;
  const f = font(size, weight, fam);
  const lines = wrapLines(str, maxW, f);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
  if (spacing) ctx.letterSpacing = spacing + 'px';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  ctx.restore();
  return lines.length * size * lh;
}

function textWidth(str, size, weight = 700, fam = INTER) {
  ctx.save(); ctx.font = font(size, weight, fam); const w = ctx.measureText(str).width; ctx.restore(); return w;
}

function glowAt(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function background(t, lights = 0) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = Math.max(1, S);
  const g = 72 * S, off = (t * 10 * S) % g;
  ctx.beginPath();
  for (let x = -g + off; x < W + g; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -g + off; y < H + g; y += g) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
  if (lights > 0.001) {
    const r = Math.max(W, H) * 0.62;
    glowAt(0, 0, r, `rgba(239,68,68,${(lights * (0.20 + 0.14 * Math.sin(t * 6))).toFixed(3)})`);
    glowAt(W, 0, r, `rgba(59,130,246,${(lights * (0.20 + 0.14 * Math.sin(t * 6 + Math.PI))).toFixed(3)})`);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

const logoImg = new Image();
logoImg.src = '/logo.png';
function drawLogo(cx, cy, size, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#111'; ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  const ar = (logoImg.naturalWidth || 1) / (logoImg.naturalHeight || 1);
  const h = size * 1.04, w = h * ar;
  ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function wordmark(x, y, size, alpha = 1, align = 'center') {
  const a = textWidth('ROLEPLAY', size, 800, MONT), b = textWidth('MANAGER', size, 300, MONT);
  const x0 = align === 'center' ? x - (a + b) / 2 : x;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = font(size, 800, MONT); ctx.fillText('ROLEPLAY', x0, y);
  ctx.font = font(size, 300, MONT); ctx.fillText('MANAGER', x0 + a, y);
  ctx.restore();
}

function chip(label, x, y, o = {}) {
  const { size = 30, alpha = 1, align = 'center', dot = null, color = C.text, fill = 'rgba(255,255,255,0.05)', stroke = C.border } = o;
  const tw = textWidth(label, size, 600);
  const padX = size * 0.8, h = size * 2.0, dotW = dot ? size * 0.85 : 0;
  const w = tw + padX * 2 + dotW;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(x0, y - h / 2, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(1, 2 * S); ctx.strokeStyle = stroke; ctx.stroke();
  if (dot) { ctx.beginPath(); ctx.arc(x0 + padX + size * 0.22, y, size * 0.22, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); }
  ctx.font = font(size, 600); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x0 + padX + dotW, y + size * 0.04);
  ctx.restore();
  return w;
}

function chipRow(labels, cx, cy, size, alpha, gap = 16) {
  const widths = labels.map((l) => textWidth(l, size, 600) + size * 1.6);
  const total = widths.reduce((a, b) => a + b, 0) + gap * S * (labels.length - 1);
  let x = cx - total / 2;
  labels.forEach((l, i) => {
    const p = clamp(alpha * 1.6 - i * 0.25);
    chip(l, x, cy + (1 - p) * 12 * S, { size, alpha: p, align: 'left' });
    x += widths[i] + gap * S;
  });
}

function urlPill(text, cx, cy, size, alpha) {
  const tw = textWidth(text, size, 800);
  const w = tw + size * 1.5, h = size * 1.9;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.font = font(size, 800); ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.05);
  ctx.restore();
}

function check(cx, cy, r, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(52,211,153,0.16)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy + r * 0.02); ctx.lineTo(cx - r * 0.1, cy + r * 0.36); ctx.lineTo(cx + r * 0.5, cy - r * 0.38);
  ctx.strokeStyle = C.green; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}

// ── Scene text: eyebrow, title and body, left in landscape, centred in portrait ──
function textBlockHeight({ title, body }) {
  const L = PORTRAIT, maxW = L ? 940 * S : 760 * S;
  const eS = 26 * S, tS = (L ? 84 : 76) * S, bS = (L ? 38 : 34) * S;
  const tL = wrapLines(title, maxW, font(tS, 800)).length;
  const bL = body ? wrapLines(body, maxW, font(bS, 500)).length : 0;
  return eS * 2 + tL * tS * 1.08 + (body ? 28 * S + bL * bS * 1.4 : 0);
}

/** In portrait, where the text starts so text and picture sit in the middle of the safe area. */
function portraitTop(spec, visualH, gap) {
  const free = (1560 - 300) * S - (textBlockHeight(spec) + gap + visualH);
  return 300 * S + Math.max(0, free / 2);
}

function textBlock(t, { eyebrow, title, body }, top = null) {
  const L = PORTRAIT;
  const x = L ? W / 2 : 150 * S, align = L ? 'center' : 'left', maxW = L ? 940 * S : 760 * S;
  const eS = 26 * S, tS = (L ? 84 : 76) * S, bS = (L ? 38 : 34) * S;
  const tL = wrapLines(title, maxW, font(tS, 800)).length;
  const bL = body ? wrapLines(body, maxW, font(bS, 500)).length : 0;
  const blockH = textBlockHeight({ title, body });
  let y = top !== null ? top : L ? 330 * S : (H - blockH) / 2;
  const p1 = prog(t, 0.0, 0.5), p2 = prog(t, 0.1, 0.55), p3 = prog(t, 0.25, 0.55);
  drawText(eyebrow.toUpperCase(), x, y + (1 - p1) * 16 * S, { size: eS, weight: 700, color: C.muted, align, alpha: p1, spacing: 4 * S });
  y += eS * 2;
  drawText(title, x, y + (1 - p2) * 30 * S, { size: tS, weight: 800, color: '#fff', align, alpha: p2, maxW, lh: 1.08 });
  y += tL * tS * 1.08;
  if (body) {
    y += 28 * S;
    drawText(body, x, y + (1 - p3) * 24 * S, { size: bS, weight: 500, color: C.muted, align, alpha: p3, maxW, lh: 1.4 });
    y += bL * bS * 1.4;
  }
  return y;
}
const visualX = (w) => (PORTRAIT ? (W - w) / 2 : W * 0.70 - w / 2);

// ── Mock Discord: a voice channel, a radio line, a bot message ──────────────
function speakerIcon(x, cy, size, color) {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = size * 0.1; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, cy - size * 0.18); ctx.lineTo(x + size * 0.22, cy - size * 0.18); ctx.lineTo(x + size * 0.48, cy - size * 0.4);
  ctx.lineTo(x + size * 0.48, cy + size * 0.4); ctx.lineTo(x + size * 0.22, cy + size * 0.18); ctx.lineTo(x, cy + size * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x + size * 0.52, cy, size * 0.26, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + size * 0.52, cy, size * 0.46, -0.9, 0.9); ctx.stroke();
  ctx.restore();
}

function waveform(x, cy, w, h, t, color) {
  const n = 16, bw = w / n * 0.55;
  ctx.save(); ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(Math.sin(t * 9 + i * 0.7) * Math.sin(t * 4.3 + i * 1.3));
    const bh = h * (0.18 + 0.82 * a);
    rr(x + i * (w / n), cy - bh / 2, bw, bh, bw / 2); ctx.fill();
  }
  ctx.restore();
}

function avatar(cx, cy, r, m, on, t) {
  if (on) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 5 * S, 0, Math.PI * 2);
    ctx.strokeStyle = C.dGreen; ctx.lineWidth = 4 * S; ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(t * 10); ctx.stroke();
    ctx.restore();
  }
  if (m.logo) { drawLogo(cx, cy, r * 2); return; }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill();
  ctx.font = font(r * 0.8, 800); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(m.initials, cx, cy + r * 0.04);
  ctx.restore();
}

function voiceCard(x, y, w, s, members, speaking, t, alpha = 1) {
  const pad = 26 * s, headH = 60 * s, rowH = 76 * s;
  const h = pad * 2 + headH + members.length * rowH;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(x, y, w, h, 22 * s); ctx.fillStyle = C.dBg; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2 * s; ctx.stroke();
  speakerIcon(x + pad, y + pad + 22 * s, 34 * s, C.dMuted);
  drawText('Patrol 1', x + pad + 50 * s, y + pad + 4 * s, { size: 30 * s, weight: 700, color: C.dText });
  drawText('VOICE', x + w - pad, y + pad + 10 * s, { size: 20 * s, weight: 700, color: C.dMuted, align: 'right', spacing: 3 * s });
  members.forEach((m, i) => {
    const cy = y + pad + headH + i * rowH + rowH / 2;
    const ax = x + pad + 30 * s;
    const on = speaking === m.name;
    avatar(ax, cy, 27 * s, m, on, t);
    const nx = ax + 48 * s;
    drawText(m.name, nx, cy, { size: 29 * s, weight: on ? 700 : 500, color: on ? '#fff' : C.dText, baseline: 'middle' });
    if (m.app) {
      const bx = nx + textWidth(m.name, 29 * s, on ? 700 : 500) + 12 * s;
      rr(bx, cy - 15 * s, 58 * s, 30 * s, 6 * s); ctx.fillStyle = C.dBlurple; ctx.fill();
      drawText('APP', bx + 29 * s, cy, { size: 18 * s, weight: 800, color: '#fff', align: 'center', baseline: 'middle' });
    }
    if (on) waveform(x + w - pad - 150 * s, cy, 150 * s, 36 * s, t, C.dGreen);
  });
  ctx.restore();
  return h;
}

/** One radio line. `said` (0 to 1) lights up the words as they are spoken. */
function radioLine(x, y, w, s, who, text, alpha, accent, said = 1, draw = true) {
  const pad = 22 * s, size = 29 * s;
  const lines = wrapLines(text, w - pad * 2, font(size, 500)).length;
  const h = pad * 2 + 36 * s + lines * size * 1.35;
  if (!draw) return h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(x, y, w, h, 18 * s); ctx.fillStyle = C.card; ctx.fill();
  ctx.strokeStyle = C.border; ctx.lineWidth = 2 * s; ctx.stroke();
  drawText(who.toUpperCase(), x + pad, y + pad, { size: 20 * s, weight: 800, color: accent, spacing: 3 * s });
  const body = { size, weight: 500, maxW: w - pad * 2, lh: 1.35 };
  drawText(text, x + pad, y + pad + 36 * s, { ...body, color: said < 1 ? 'rgba(232,234,237,0.3)' : C.text });
  if (said > 0 && said < 1) {
    const words = text.split(' ');
    drawText(words.slice(0, Math.ceil(said * words.length)).join(' '), x + pad, y + pad + 36 * s, { ...body, color: C.text });
  }
  ctx.restore();
  return h;
}

function pointer(x, y, size, alpha) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, size); ctx.lineTo(size * 0.28, size * 0.74); ctx.lineTo(size * 0.48, size * 1.12);
  ctx.lineTo(size * 0.62, size * 1.05); ctx.lineTo(size * 0.43, size * 0.68); ctx.lineTo(size * 0.78, size * 0.68); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.06; ctx.stroke();
  ctx.restore();
}

function badge(label, x, y, s, color, alpha = 1) {
  const tw = textWidth(label, 18 * s, 800);
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(x, y, tw + 24 * s, 34 * s, 8 * s); ctx.fillStyle = color + '26'; ctx.fill();
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = color + '80'; ctx.stroke();
  drawText(label, x + 12 * s, y + 17 * s, { size: 18 * s, weight: 800, color, baseline: 'middle', spacing: 1.5 * s });
  ctx.restore();
  return tw + 24 * s;
}

function staggerLine(line, cx, y, size, t, t0, step, k0, color = '#fff') {
  const words = line.split(' ');
  const sp = textWidth(' ', size, 800);
  const ws = words.map((w) => textWidth(w, size, 800));
  let x = cx - (ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1)) / 2;
  words.forEach((word, i) => {
    const p = prog(t, t0 + (k0 + i) * step, 0.45);
    drawText(word, x, y + (1 - p) * 34 * S, { size, weight: 800, color, alpha: p });
    x += ws[i] + sp;
  });
}

function emphasisLine(line, cx, y, size, t, t0) {
  const p = prog(t, t0, 0.55);
  const parts = line.split(' ');
  const last = parts.pop();
  const head = parts.join(' ');
  const sp = head ? textWidth(' ', size, 800) : 0;
  const hw = head ? textWidth(head, size, 800) : 0, lw = textWidth(last, size, 800);
  const padX = size * 0.16;
  const total = hw + sp + lw + padX * 2;
  let x = cx - total / 2;
  const yy = y + (1 - p) * 40 * S;
  if (head) drawText(head, x, yy, { size, weight: 800, color: '#fff', alpha: p });
  x += hw + sp;
  const pw = prog(t, t0 + 0.35, 0.45);
  ctx.save();
  ctx.globalAlpha *= p;
  rr(x, yy - size * 0.06, (lw + padX * 2) * pw, size * 1.16, size * 0.16); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
  drawText(last, x + padX, yy, { size, weight: 800, color: pw > 0.5 ? C.bg : '#fff', alpha: p });
}

function watermark(alpha) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  const ls = 46 * S, size = 25 * S;
  if (PORTRAIT) {
    const tw = textWidth('roleplaymanager.xyz', size, 600);
    const x = W / 2 - (ls + 14 * S + tw) / 2;
    drawLogo(x + ls / 2, 236 * S, ls);
    drawText('roleplaymanager.xyz', x + ls + 14 * S, 236 * S, { size, weight: 600, color: C.muted, baseline: 'middle' });
  } else {
    drawLogo(80 * S, 78 * S, ls);
    drawText('roleplaymanager.xyz', 80 * S + ls / 2 + 14 * S, 78 * S, { size, weight: 600, color: C.muted, baseline: 'middle' });
  }
  ctx.restore();
}

// ── The scene runner ────────────────────────────────────────────────────────
// Scene times come from the renderer (/timeline.json), because scenes with
// voices last as long as their clips do.
let TL = null;
let SCENES = [];
let BACKDROP = null;
const XF = 0.35;
// A scene fades in over the one before it, unless the timeline cuts to it
// (cut: true on the scene), as on a beat.
function sceneAlpha(s, t) {
  if (t < s.start || (s.cutOut ? t >= s.end : t > s.end + XF)) return 0;
  const fin = s.start === 0 || s.cutIn ? 1 : ease((t - s.start) / XF);
  const fout = s.last || s.cutOut ? 1 : 1 - ease((t - s.end) / XF);
  return Math.min(fin, fout);
}

function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  let lights = 0, mark = 0;
  for (const s of SCENES) {
    const a = sceneAlpha(s, t);
    lights += a * (typeof s.lights === 'function' ? s.lights(t - s.start) : s.lights || 0);
    if (s.mark) mark += a;
  }
  background(t, Math.min(1, lights));
  if (BACKDROP) BACKDROP(t);
  for (const s of SCENES) {
    const a = sceneAlpha(s, t);
    if (a <= 0.001) continue;
    ctx.save(); ctx.globalAlpha = a; s.draw(t - s.start); ctx.restore();
  }
  watermark(Math.min(1, mark));
}

// ── Run the job and hand the result to the renderer ─────────────────────────
// draw: scene id → function of the scene's own time. lights: the police lights
// behind a scene, a number or a function of its time. marked: scenes with the
// roleplaymanager.xyz mark. stills: designed stills by name. backdrop: drawn
// over the background, under every scene.
function startPromo({ draw, lights = {}, marked = [], stills = {}, backdrop = null }) {
  const send = (path, body) => fetch(path, { method: 'POST', body });
  const blobOf = (type, quality) => new Promise((r) => cv.toBlob(r, type, quality));
  (async () => {
    try {
      await document.fonts.ready;
      await Promise.all(['300 40px Montserrat', '800 40px Montserrat', '500 40px Inter', '600 40px Inter', '700 40px Inter', '800 40px Inter']
        .map((f) => document.fonts.load(f)));
      if (!logoImg.complete || !logoImg.naturalWidth) await new Promise((r) => { logoImg.onload = r; logoImg.onerror = r; });
      TL = await (await fetch('/timeline.json')).json();
      DUR = TL.duration;
      BACKDROP = backdrop;
      const mark = new Set(marked);
      SCENES = TL.scenes.map((s, i) => ({
        ...s, draw: draw[s.id], lights: lights[s.id] || 0, mark: mark.has(s.id), last: i === TL.scenes.length - 1,
        cutIn: !!s.cut, cutOut: !!TL.scenes[i + 1]?.cut,
      }));
      if (q.get('job') === 'video') {
        const n = Math.round(DUR * FPS);
        for (let i = 0; i < n; i++) {
          renderFrame(i / FPS);
          await send('/frame', await blobOf('image/png'));
        }
      } else {
        if (q.get('t') !== null) renderFrame(+q.get('t')); else stills[q.get('still')]();
        const jpg = q.get('fmt') === 'jpg';
        await send('/still?name=' + encodeURIComponent(q.get('name')), await blobOf(jpg ? 'image/jpeg' : 'image/png', 0.9));
      }
      await send('/done', 'ok');
    } catch (err) {
      await send('/error', String((err && err.stack) || err));
    }
  })();
}
