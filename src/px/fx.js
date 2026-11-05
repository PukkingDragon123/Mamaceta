// Pure 2D pixel-art effects. Every particle is drawn as crisp pixels into the view buffer:
// sparks, anime hit stars, pixel shockwave rings, dust puffs, bubbles, shell shards, debris,
// cosmetic hit-FX sprites, impact bursts and speed lines. No glow, no blending, no 3D.
import { PPU } from './display.js';
import { hexCss } from './pal.js';
import { HITFX } from '../data/cosmetics.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

// tiny bitmaps ('#' = main colour, 'o' = outline/dark, '+' = highlight)
const BMP = {
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  star: ['...#...', '...#...', '..###..', '#######', '..###..', '..#.#..', '.#...#.'],
  note: ['..###', '..#.#', '..#..', '..#..', '###..', '###..'],
  skull: ['.###.', '#####', '#.#.#', '#####', '.#.#.'],
  petal: ['.##.', '####', '.##.', '..#.'],
  bolt: ['..##', '.##.', '####', '.##.', '##..'],
  flame: ['..#..', '.###.', '.###.', '#####', '.###.'],
  snail: ['.###.', '#.#.#', '#..##', '.###o', 'ooooo'],
  candy: ['#.#', '.#.', '#.#'],
  confetti: ['##', '##'],
  ink: ['.##.', '####', '####', '.##.'],
  sweat: ['.#.', '###', '###', '.#.'],
  zz: ['###', '..#', '.#.', '###'],
  spiral: ['.###.', '#...#', '#.#.#', '#..#.', '.##..'],
};
const bmpCache = new Map();
function bitmap(name, color, dark = '#120a08') {
  const key = name + color;
  let c = bmpCache.get(key);
  if (c) return c;
  const rows = BMP[name];
  c = document.createElement('canvas'); c.width = rows[0].length + 2; c.height = rows.length + 2;
  const g = c.getContext('2d');
  // outline
  g.fillStyle = dark;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] !== '.') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.fillRect(x + 1 + dx, y + 1 + dy, 1, 1);
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    g.fillStyle = ch === 'o' ? dark : ch === '+' ? '#ffffff' : color;
    g.fillRect(x + 1, y + 1, 1, 1);
  }
  bmpCache.set(key, c);
  return c;
}

// pixel circle outline (midpoint) into a 2D context
function pxCircle(g, cx, cy, r, thick = 1) {
  r = Math.round(r);
  if (r <= 0) { g.fillRect(cx, cy, 1, 1); return; }
  for (let k = 0; k < thick; k++) {
    let x = r - k, y = 0, err = 1 - x;
    while (x >= y) {
      g.fillRect(cx + x, cy + y, 1, 1); g.fillRect(cx + y, cy + x, 1, 1); g.fillRect(cx - y, cy + x, 1, 1); g.fillRect(cx - x, cy + y, 1, 1);
      g.fillRect(cx - x, cy - y, 1, 1); g.fillRect(cx - y, cy - x, 1, 1); g.fillRect(cx + y, cy - x, 1, 1); g.fillRect(cx + x, cy - y, 1, 1);
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }
}
function pxDisc(g, cx, cy, r) {
  r = Math.max(0, r);
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + 0.35);
    if (w >= 0) g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}
function pxLine(g, x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2400; i++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
export { pxCircle, pxDisc, pxLine, bitmap };

export class FX {
  constructor() {
    this.p = [];
    this.rings = [];
    this.bursts = [];
    this.flashA = 0; this.flashC = '#ffffff';
    this.impact = 0; this.impactCenter = null;
    this.speed = 0; this.speedCenter = null;
    this.texts = [];
    this.bubbles = new Map();
    this.max = 900;
  }
  clear() { this.p.length = 0; this.rings.length = 0; this.bursts.length = 0; this.bubbles.clear(); this.texts.length = 0; }
  add(o) {
    if (this.p.length >= this.max) this.p.shift();
    const q = { x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0.6, grav: 0, drag: 0.98, size: 1, kind: 'px', colors: ['#ffffff'], ...o };
    this.p.push(q);
    return q;
  }
  // ---------------------------------------------------------------- emitters
  sparks(x, y, n = 10, o = {}) {
    const cols = (o.colors || ['#ffffff', '#fff08a', '#ffb040']).map(css);
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? (o.dir > 0 ? 0 : Math.PI) + rnd(-0.9, 0.9) : rnd(0, Math.PI * 2);
      const sp = rnd(o.sp0 ?? 3, o.sp1 ?? 9);
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + rnd(0, 2), life: rnd(0.15, 0.4), colors: cols, grav: -14, drag: 0.9, size: rnd(2, 5) });
    }
  }
  pixels(x, y, n, o = {}) {
    const cols = (o.colors || ['#ffffff']).map(css);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(o.sp0 ?? 1, o.sp1 ?? 5);
      this.add({ kind: o.kind || 'px', x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up ?? 1), life: rnd(o.l0 ?? 0.3, o.l1 ?? 0.8), colors: cols, grav: o.grav ?? -8, drag: o.drag ?? 0.95, size: o.size ?? Math.ceil(rnd(1, 2.5)), bmp: o.bmp, floor: o.floor });
    }
  }
  dust(x, y, n = 6, color = '#b8a080', scale = 1) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add({ kind: 'dust', x: x + rnd(-0.25, 0.25) * scale, y: y + 0.05, vx: dir * rnd(0.6, 2.4) * scale, vy: rnd(0.3, 1.4), life: rnd(0.35, 0.7) * Math.max(0.7, scale), colors: [css(color)], grav: 0, drag: 0.9, size: rnd(2, 4) * scale, grow: rnd(2, 5) });
    }
  }
  bubbleBurst(x, y, n = 8, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.5, 3.5) * scale;
      this.add({ kind: 'bubble', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1, life: rnd(0.6, 1.4), grav: 3.5, drag: 0.93, size: Math.round(rnd(1, 3.5) * Math.min(1.5, scale)), colors: ['#bff8ff', '#49c2bd'], wob: rnd(0, 6) });
    }
  }
  shards(x, y, n, colors, o = {}) {
    const cols = colors.map(css);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(2, o.sp1 ?? 8);
      this.add({ kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 3, life: o.life ?? rnd(0.6, 1.4), colors: cols, grav: -18, drag: 0.98, size: Math.round(rnd(2, o.s1 ? 6 : 4)), rot: rnd(0, 6), vr: rnd(-12, 12), floor: 0.02, bounce: 0.4 });
    }
  }
  debris(x, y, n, colors, o = {}) {
    const cols = colors.map(css);
    for (let i = 0; i < n; i++) {
      const a = rnd(0.2, Math.PI - 0.2), sp = rnd(2, o.sp1 ?? 7);
      this.add({ kind: 'plank', x: x + rnd(-0.3, 0.3), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, life: rnd(1, 2), colors: cols, grav: -20, drag: 0.98, size: Math.round(rnd(3, 7)), rot: rnd(0, 6), vr: rnd(-10, 10), floor: 0.02, bounce: 0.3 });
    }
  }
  icons(x, y, n, name, colors, o = {}) {
    const cols = colors.map(css);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(o.sp0 ?? 1.5, o.sp1 ?? 6);
      this.add({ kind: 'bmp', bmp: name, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up ?? 2), life: rnd(0.5, o.l1 ?? 1.1), colors: cols, grav: o.grav ?? -6, drag: 0.93 });
    }
  }
  ring(x, y, r0 = 0.3, o = {}) {
    this.rings.push({ x, y, r0, r1: o.size1 ?? 1.6, t: 0, dur: o.dur ?? 0.3, color: css(o.color ?? '#ffffff'), color2: css(o.color2 ?? '#9ff3ff'), thick: o.thick ?? 2, flat: !!o.flat });
  }
  // anime starburst lines radiating from an impact point
  burst(x, y, power = 1, color = '#ffffff') {
    this.bursts.push({ x, y, t: 0, dur: 0.12 + power * 0.06, power, color: css(color), seed: Math.random() * 100 });
  }
  text(str, x, y, o = {}) { this.texts.push({ str, x, y, t: 0, dur: o.dur ?? 0.9, color: o.color || '#ffffff', size: o.size || 'big', vy: o.vy ?? 1.2 }); }
  screenFlash(a, color = '#ffffff') { if (a > this.flashA) { this.flashA = a; this.flashC = css(color); } }
  impactFrame(a = 1, center = null) { this.impact = Math.max(this.impact, a); this.impactCenter = center; }
  speedLines(a, center = null) { this.speed = Math.max(this.speed, a); this.speedCenter = center; }

  // hit effect: cosmetic style + power (0.7 light .. 2 ult)
  hitEffect(x, y, power, dir, style = 'classic') {
    const H = HITFX.find((h) => h.key === style) || HITFX[0];
    const cols = H.colors.map(css);
    const big = power >= 1.5;
    this.add({ kind: 'hitstar', x, y, life: big ? 0.2 : 0.14, size: big ? 1.6 : power > 1 ? 1.2 : 0.85, colors: cols, rot: Math.random() * 6 });
    this.sparks(x, y, Math.round(6 + power * 6), { colors: cols, sp1: 5 + power * 4, dir: power < 1 ? dir : undefined });
    if (H.spr && H.spr !== 'spark') {
      const name = { bubble: 'bubble', star: 'star', confetti: 'confetti', petal: 'petal', bolt: 'bolt', ink: 'ink', flame: 'flame', skull: 'skull' }[H.spr];
      if (name === 'bubble') this.bubbleBurst(x, y, Math.round(4 + power * 4), power);
      else if (name) this.icons(x, y, Math.round(2 + power * 3), name, cols, { sp1: 3 + power * 3 });
    }
    if (big) { this.ring(x, y, 0.2, { size1: 1.2 * power, dur: 0.22, color: cols[0], color2: cols[1] || cols[0] }); this.burst(x, y, power, cols[0]); }
  }
  // cavitation bubble that wobbles then collapses (id from sim)
  bubble(x, y, r, delay, dark, id) { this.bubbles.set(id, { x, y, r, t: 0, dur: delay / 60, dark }); }
  popBubble(id) { this.bubbles.delete(id); }

  // ---------------------------------------------------------------- update / draw
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.t += dt;
      if (q.t >= q.life) { this.p.splice(i, 1); continue; }
      q.vy += q.grav * dt;
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d; q.vy *= d;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.kind === 'bubble') q.x += Math.sin(q.t * 9 + q.wob) * 0.01;
      if (q.rot !== undefined) q.rot += (q.vr || 0) * dt;
      if (q.floor !== undefined && q.y < q.floor) { q.y = q.floor; q.vy = -q.vy * (q.bounce || 0); q.vx *= 0.7; q.vr = (q.vr || 0) * 0.6; }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t >= r.dur) this.rings.splice(i, 1); }
    for (let i = this.bursts.length - 1; i >= 0; i--) { const b = this.bursts[i]; b.t += dt; if (b.t >= b.dur) this.bursts.splice(i, 1); }
    for (const [id, b] of this.bubbles) { b.t += dt; if (b.t > b.dur + 0.3) this.bubbles.delete(id); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += dt; t.y += t.vy * dt * Math.max(0, 1 - t.t * 1.5); if (t.t >= t.dur) this.texts.splice(i, 1); }
    this.flashA = Math.max(0, this.flashA - dt * 3.5);
    this.impact = Math.max(0, this.impact - dt * 60); // impact frames are counted in frames
    this.speed = Math.max(0, this.speed - dt * 1.6);
  }

  draw(d) {
    const g = d.g;
    // cavitation bubbles
    for (const b of this.bubbles.values()) {
      const k = Math.min(1, b.t / Math.max(0.01, b.dur));
      const cx = d.bx(b.x), cy = d.by(b.y);
      const r = Math.max(1, Math.round(b.r * PPU * (0.5 + 0.5 * Math.sin(k * Math.PI * 0.5)) * (1 + Math.sin(b.t * 40) * 0.05)));
      g.fillStyle = b.dark ? '#2a0a3a' : '#0d3a4a'; pxDisc(g, cx, cy, r);
      g.fillStyle = b.dark ? '#c040ff' : '#bff8ff'; pxCircle(g, cx, cy, r, 1);
      g.fillStyle = '#ffffff'; g.fillRect(cx - Math.round(r * 0.5), cy - Math.round(r * 0.5), 2, 2);
      if (k > 0.85) { g.fillStyle = '#ffffff'; pxCircle(g, cx, cy, Math.max(1, Math.round(r * (1 - (k - 0.85) * 5))), 1); }
    }
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))) * PPU;
      const cx = d.bx(r.x), cy = d.by(r.y);
      g.fillStyle = k < 0.5 ? r.color : r.color2;
      const th = Math.max(1, Math.round(r.thick * (1 - k)));
      if (r.flat) {
        // ground shockwave: two arcs squashed vertically
        for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(an) * rad), Math.round(cy + Math.sin(an) * rad * 0.22), th + 1, th); }
      } else pxCircle(g, cx, cy, rad, th);
    }
    for (const b of this.bursts) {
      const k = b.t / b.dur;
      const cx = d.bx(b.x), cy = d.by(b.y);
      g.fillStyle = b.color;
      const n = 10 + Math.round(b.power * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + b.seed;
        const r0 = (0.3 + k * 0.6) * PPU * b.power * (0.7 + (i % 3) * 0.2), r1 = r0 + (0.5 + (i % 2) * 0.5) * PPU * b.power * (1 - k);
        pxLine(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
    }
    for (const q of this.p) {
      const k = q.t / q.life;
      const x = d.bx(q.x), y = d.by(q.y);
      const ci = Math.min(q.colors.length - 1, Math.floor(k * q.colors.length));
      const col = q.colors[ci];
      switch (q.kind) {
        case 'px': {
          const s = Math.max(1, Math.round(q.size * (1 - k * 0.6)));
          g.fillStyle = col; g.fillRect(x, y, s, s);
          break;
        }
        case 'spark': {
          const len = Math.max(1, q.size * (1 - k));
          const sp = Math.hypot(q.vx, q.vy) || 1;
          g.fillStyle = col;
          pxLine(g, x, y, x - (q.vx / sp) * len, y + (q.vy / sp) * len);
          break;
        }
        case 'dust': {
          const r = Math.round(q.size + q.grow * k);
          g.fillStyle = k < 0.5 ? col : shadeCss(col, -0.25);
          if (k < 0.75) pxDisc(g, x, y, r);
          else { for (let j = 0; j < 6; j++) g.fillRect(x + Math.round(Math.cos(j) * r), y + Math.round(Math.sin(j * 1.7) * r * 0.7), 1, 1); }
          break;
        }
        case 'bubble': {
          const r = q.size;
          g.fillStyle = '#bff8ff';
          if (r <= 1) g.fillRect(x, y, 2, 2);
          else { pxCircle(g, x, y, r, 1); g.fillStyle = '#ffffff'; g.fillRect(x - Math.ceil(r / 2), y - Math.ceil(r / 2), 1, 1); }
          break;
        }
        case 'shard': case 'plank': {
          const s = q.size, c = Math.cos(q.rot), sn = Math.sin(q.rot);
          g.fillStyle = '#120a08';
          const pts = q.kind === 'plank' ? [[-s / 2, -1], [s / 2, -1], [s / 2, 1], [-s / 2, 1]] : [[0, -s / 2], [s / 2, s / 3], [-s / 2, s / 3]];
          drawPoly(g, pts.map(([a, b]) => [x + a * c - b * sn, y + a * sn + b * c]), '#120a08', col);
          break;
        }
        case 'bmp': {
          const img = bitmap(q.bmp, col);
          if (k > 0.8 && (Math.floor(q.t * 30) & 1)) break;
          g.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
          break;
        }
        case 'hitstar': {
          // anime impact star: white core, coloured rim, jagged rays
          const R = Math.round((10 + 10 * k) * q.size), cr = Math.round(5 * q.size * (1 - k));
          const n = 8;
          const pts = [];
          for (let i = 0; i < n * 2; i++) { const a = q.rot + (i / (n * 2)) * Math.PI * 2; const rr = i % 2 === 0 ? R * (0.8 + (i % 4 === 0 ? 0.35 : 0)) : R * 0.36; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
          drawPoly(g, pts, null, q.colors[1] || q.colors[0]);
          g.fillStyle = '#ffffff'; pxDisc(g, x, y, Math.max(1, cr + 2));
          break;
        }
        default: g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
    }
  }

  // screen-space effects drawn after the world into the buffer
  drawScreen(d, sim = null) {
    const g = d.g;
    if (this.speed > 0.02) {
      const c = this.speedCenter || { x: d.cam.x, y: d.cam.y };
      const cx = d.bx(c.x), cy = d.by(c.y);
      const R = Math.max(d.vw, d.vh);
      g.fillStyle = '#ffffff';
      const n = Math.round(20 + this.speed * 30);
      const seed = Math.floor(performance.now() / 50);
      for (let i = 0; i < n; i++) {
        const a = ((i * 137.5 + seed * 7) % 360) * Math.PI / 180;
        const r0 = R * (0.42 + ((i * 31 + seed) % 10) / 40);
        pxLine(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      }
    }
    if (this.flashA > 0.03) { g.globalAlpha = Math.min(0.9, this.flashA); g.fillStyle = this.flashC; g.fillRect(0, 0, d.vw, d.vh); g.globalAlpha = 1; }
  }
}

function drawPoly(g, pts, outline, fill) {
  // scanline fill of a small polygon in buffer pixels (integer, no AA)
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  y0 = Math.floor(y0); y1 = Math.ceil(y1);
  const spans = [];
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    const py = y + 0.5;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > py) !== (b[1] > py)) xs.push(a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([y, Math.round(xs[k]), Math.round(xs[k + 1])]);
  }
  if (outline) { g.fillStyle = outline; for (const [y, a, b] of spans) g.fillRect(a - 1, y - 1, b - a + 2, 3); }
  g.fillStyle = fill;
  for (const [y, a, b] of spans) if (b > a) g.fillRect(a, y, b - a, 1);
}
export { drawPoly };

function shadeCss(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 + f)); g = Math.round(g * (1 + f)); b = Math.round(b * (1 + f));
  return `rgb(${r},${g},${b})`;
}
