// Procedural, hand-styled pixel-art sprites for the UI: wooden planks with grain, knots,
// rusty nails, barnacles and algae; rusty metal plates; portholes; ropes; paper tags; icons.
import { PixelCanvas, u32 } from './pixel.js';
import { P, shade, mixHex } from './palette.js';
import { seeded, valueNoise2, valueNoise1 } from '../core/math.js';

const cache = new Map();
function cached(key, fn) {
  let v = cache.get(key);
  if (!v) { v = fn(); cache.set(key, v); if (cache.size > 600) cache.delete(cache.keys().next().value); }
  return v;
}

export const WOOD_TONES = {
  mid: [P.wood0, P.wood1, P.wood2, P.wood3, P.wood4, P.wood5, P.wood6],
  light: [P.wood1, P.wood2, P.wood3, P.wood4, P.wood5, P.wood6, P.wood7],
  dark: ['#1c0f09', P.wood0, P.wood1, P.wood2, P.wood3, P.wood4, P.wood5],
  red: ['#24090a', '#3a1410', '#5e1f17', '#7e2c1f', '#a33a26', '#c04f33', '#d8704a'],
  teal: ['#06171c', '#0c2a30', '#123e45', '#1b5a5e', '#2a7a78', '#3f9a92', '#62b8a8'],
  pink: ['#2a0a1c', '#4a1030', '#6e1f4a', '#93305f', '#b8457a', '#d86a98', '#f095b8'],
  gold: ['#2a1a04', '#4a3008', '#6b4a12', '#8f6a1a', '#b88a1e', '#dcae32', '#f0c33c'],
  gray: ['#121416', '#1e2226', '#2c3238', '#3e464e', '#545e68', '#6f7a84', '#8e98a2'],
  blue: ['#060f22', '#0b1a38', '#12295a', '#1b3d80', '#2a55a6', '#3f70c4', '#5e90de'],
};

function drawNail(pc, x, y, rnd) {
  pc.set(x, y, P.metal4); pc.set(x + 1, y, P.metal3); pc.set(x, y + 1, P.metal3); pc.set(x + 1, y + 1, P.metal1);
  pc.set(x - 1, y, P.ink); pc.set(x + 2, y + 1, P.ink); pc.set(x, y - 1, P.ink); pc.set(x + 1, y + 2, P.ink);
  pc.set(x - 1, y + 1, P.ink); pc.set(x + 2, y, P.ink); pc.set(x, y + 2, P.ink); pc.set(x + 1, y - 1, P.ink);
  // rust streak
  const len = 2 + Math.floor(rnd() * 4);
  for (let i = 0; i < len; i++) pc.blend(x + (i > 2 ? 1 : 0), y + 3 + i, P.rust3, 0.55 - i * 0.1);
}

function drawBarnacle(pc, cx, cy, r) {
  pc.disc(cx, cy, r + 1, P.ink);
  pc.disc(cx, cy, r, P.cream1);
  pc.disc(cx - 0.4, cy - 0.4, r - 0.6, P.cream2);
  pc.set(cx - 1, cy - 1, P.cream3);
  pc.disc(cx + 0.2, cy + 0.2, Math.max(0.6, r - 1.6), P.cream0);
  pc.set(Math.floor(cx), Math.floor(cy), P.ink2);
}

function drawAlgaeTuft(pc, x, y, len, rnd) {
  const cols = [P.algae2, P.algae3, P.algae4];
  for (let i = 0; i < len; i++) {
    const sway = Math.round(Math.sin(i * 0.9 + x) * 0.8);
    pc.set(x + sway, y + i, cols[Math.min(2, Math.floor((1 - i / len) * 3))]);
    if (i === len - 1) pc.set(x + sway, y + i + 1, P.algae1);
    if (rnd() < 0.3 && i > 0) pc.set(x + sway + (rnd() < 0.5 ? -1 : 1), y + i, P.algae2);
  }
}

// Main wooden panel generator
export function woodPanel(w, h, o = {}) {
  const opt = { seed: 1, tone: 'mid', planks: 'h', plankSize: 11, border: true, nails: true, barnacles: 2, algae: 0.6, moss: 0.5, dark: 0, ...o };
  const key = `wood|${w}|${h}|${JSON.stringify(opt)}`;
  return cached(key, () => {
    const pc = new PixelCanvas(w, h);
    const rnd = seeded(opt.seed * 977 + w * 13 + h * 7);
    const ramp = WOOD_TONES[opt.tone] || WOOD_TONES.mid;
    const horiz = opt.planks === 'h';
    const along = horiz ? w : h, across = horiz ? h : w;
    // plank boundaries
    const bounds = [0];
    while (bounds[bounds.length - 1] < across) bounds.push(bounds[bounds.length - 1] + Math.max(5, opt.plankSize + Math.floor(rnd() * 5) - 2));
    bounds[bounds.length - 1] = across;
    const planks = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const seams = [];
      if (along > 60) { let s = Math.floor(rnd() * along * 0.6 + along * 0.2); seams.push(s); }
      planks.push({ a: bounds[i], b: bounds[i + 1], off: Math.floor(rnd() * 3) - 1, gs: rnd() * 100, seams, knots: [] });
      const nk = Math.floor(rnd() * (along / 70 + 1));
      for (let k = 0; k < nk; k++) planks[i].knots.push({ t: Math.floor(rnd() * along), c: planks[i].a + (planks[i].b - planks[i].a) / 2 + (rnd() - 0.5) * 2, r: 1.5 + rnd() * 1.5 });
    }
    for (const pl of planks) {
      for (let c = pl.a; c < pl.b; c++) {
        for (let t = 0; t < along; t++) {
          const x = horiz ? t : c, y = horiz ? c : t;
          const local = c - pl.a, size = pl.b - pl.a;
          let idx = 4 + pl.off - opt.dark;
          // grain: long streaks along plank
          const g = valueNoise2(t * 0.035 + pl.gs, c * 0.55 + pl.gs, 3);
          const g2 = valueNoise2(t * 0.12 + pl.gs * 2, c * 0.9, 7);
          if (g > 0.62) idx -= 1;
          if (g < 0.22) idx += 1;
          if (g2 > 0.8) idx -= 1;
          // knots
          for (const k of pl.knots) {
            const dx = (t - k.t) / (k.r * 2.2), dy = (c - k.c) / k.r;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) idx = d < 0.45 ? 1 : (d < 0.75 ? 2 : idx - 1);
            else if (d < 1.6 && Math.abs(Math.sin(d * 6)) > 0.8) idx -= 1;
          }
          // bevels
          if (local === 0) idx += 1;
          if (local === size - 1) idx = 0;
          if (local === size - 2) idx -= 1;
          for (const s of pl.seams) {
            if (t === s) idx = 0; else if (t === s + 1) idx += 1; else if (t === s - 1) idx -= 1;
          }
          idx = Math.max(0, Math.min(ramp.length - 1, idx));
          pc.set(x, y, ramp[idx]);
        }
      }
      // nails at plank ends / seams
      if (opt.nails && pl.b - pl.a >= 5) {
        const mid = Math.floor((pl.a + pl.b) / 2) - 1;
        const spots = [3, along - 5, ...pl.seams.flatMap((s) => [s - 4, s + 3])];
        for (const s of spots) {
          if (s < 2 || s > along - 4) continue;
          if (rnd() < 0.85) horiz ? drawNail(pc, s, mid, rnd) : drawNail(pc, mid, s, rnd);
        }
      }
    }
    // moss / algae speckles near the bottom
    if (opt.moss > 0) {
      for (let x = 0; x < w; x++) {
        const depth = Math.floor(valueNoise1(x * 0.15 + opt.seed, 3) * 6 * opt.moss);
        for (let j = 0; j < depth; j++) {
          const y = h - 2 - j;
          if (rnd() < 0.7 - j * 0.1) pc.set(x, y, rnd() < 0.5 ? P.algae2 : P.algae3);
        }
      }
    }
    if (opt.border) {
      for (let x = 0; x < w; x++) { pc.set(x, 0, P.ink); pc.set(x, h - 1, P.ink); }
      for (let y = 0; y < h; y++) { pc.set(0, y, P.ink); pc.set(w - 1, y, P.ink); }
      for (let x = 1; x < w - 1; x++) { pc.blend(x, 1, P.wood7, 0.35); pc.blend(x, h - 2, P.ink, 0.35); }
      for (let y = 1; y < h - 1; y++) { pc.blend(1, y, P.wood7, 0.2); pc.blend(w - 2, y, P.ink, 0.3); }
      // chipped corners
      pc.set(0, 0, 0); pc.set(w - 1, 0, 0); pc.set(0, h - 1, 0); pc.set(w - 1, h - 1, 0);
      pc.set(1, 1, P.ink); pc.set(w - 2, 1, P.ink); pc.set(1, h - 2, P.ink); pc.set(w - 2, h - 2, P.ink);
    }
    // barnacles on edges
    for (let i = 0; i < opt.barnacles; i++) {
      const edge = Math.floor(rnd() * 4);
      const r = 1.3 + rnd() * 1.3;
      let cx, cy;
      if (edge === 0) { cx = 4 + rnd() * (w - 8); cy = 2 + r; }
      else if (edge === 1) { cx = 4 + rnd() * (w - 8); cy = h - 3 - r; }
      else if (edge === 2) { cx = 2 + r; cy = 4 + rnd() * (h - 8); }
      else { cx = w - 3 - r; cy = 4 + rnd() * (h - 8); }
      drawBarnacle(pc, cx, cy, r);
      if (rnd() < 0.6) drawBarnacle(pc, cx + (rnd() < 0.5 ? -1 : 1) * (r + 1.5), cy + (rnd() - 0.5) * 2, r * 0.6);
    }
    // algae hanging from the bottom edge
    if (opt.algae > 0) {
      const n = Math.floor((w / 18) * opt.algae);
      for (let i = 0; i < n; i++) drawAlgaeTuft(pc, 3 + Math.floor(rnd() * (w - 6)), h - 2, 2 + Math.floor(rnd() * 4), rnd);
    }
    return pc.commit();
  });
}

// Rusty riveted metal plate
export function metalPlate(w, h, o = {}) {
  const opt = { seed: 3, rust: 0.5, rivets: true, tone: 'metal', ...o };
  const key = `metal|${w}|${h}|${JSON.stringify(opt)}`;
  return cached(key, () => {
    const pc = new PixelCanvas(w, h);
    const rnd = seeded(opt.seed * 331 + w + h * 3);
    const ramp = opt.tone === 'dark' ? [P.metal0, P.metal1, P.metal1, P.metal2, P.metal3] : opt.tone === 'brass' ? [P.gold0, P.gold1, P.gold2, '#d8a83a', P.gold3] : [P.metal1, P.metal2, P.metal2, P.metal3, P.metal4];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let idx = 2;
      const n = valueNoise2(x * 0.2, y * 0.2, opt.seed);
      if (n > 0.7) idx = 3; if (n < 0.25) idx = 1;
      if (y === 1) idx = 4; if (y === h - 2) idx = 0;
      pc.set(x, y, ramp[idx]);
      const r = valueNoise2(x * 0.09 + 10, y * 0.12, opt.seed + 5);
      if (r < opt.rust * 0.45) pc.set(x, y, r < opt.rust * 0.2 ? P.rust1 : (rnd() < 0.5 ? P.rust2 : P.rust3));
      else if (r < opt.rust * 0.5 && rnd() < 0.5) pc.set(x, y, P.rust4);
    }
    for (let x = 0; x < w; x++) { pc.set(x, 0, P.ink); pc.set(x, h - 1, P.ink); }
    for (let y = 0; y < h; y++) { pc.set(0, y, P.ink); pc.set(w - 1, y, P.ink); }
    if (opt.rivets) {
      const pts = [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]];
      if (w > 70) pts.push([Math.floor(w / 2) - 1, 3], [Math.floor(w / 2) - 1, h - 5]);
      for (const [x, y] of pts) {
        if (x < 2 || y < 2) continue;
        pc.set(x, y, P.metal5); pc.set(x + 1, y, P.metal3); pc.set(x, y + 1, P.metal3); pc.set(x + 1, y + 1, P.metal1);
        pc.blend(x, y + 2, P.rust3, 0.5); pc.blend(x + 1, y + 3, P.rust3, 0.3);
      }
    }
    return pc.commit();
  });
}

// Round brass porthole frame (for portraits / timer)
export function porthole(r, o = {}) {
  const opt = { seed: 1, tone: 'brass', bolts: 8, ...o };
  const key = `port|${r}|${JSON.stringify(opt)}`;
  return cached(key, () => {
    const s = r * 2 + 2;
    const pc = new PixelCanvas(s, s);
    const c = s / 2;
    const ramp = opt.tone === 'rust' ? [P.rust0, P.rust1, P.rust2, P.rust3, P.rust4] : opt.tone === 'steel' ? [P.metal0, P.metal1, P.metal2, P.metal3, P.metal4] : [P.gold0, P.gold1, P.gold2, '#d8a83a', P.gold3];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.5) continue;
      if (d > r - 0.5) { pc.set(x, y, P.ink); continue; }
      if (d > r - 4.5) {
        const lit = (-dx - dy) / (d + 0.001);
        let idx = 2 + Math.round(lit * 1.4);
        if (d > r - 1.5) idx -= 1;
        if (d < r - 3.5) idx = 0;
        pc.set(x, y, ramp[Math.max(0, Math.min(4, idx))]);
      }
    }
    for (let i = 0; i < opt.bolts; i++) {
      const a = (i / opt.bolts) * Math.PI * 2 + 0.3;
      const bx = Math.round(c + Math.cos(a) * (r - 2.5) - 0.5), by = Math.round(c + Math.sin(a) * (r - 2.5) - 0.5);
      pc.set(bx, by, P.metal5); pc.set(bx + 1, by + 1, P.metal1);
    }
    return pc.commit();
  });
}

// Price/paper tag
export function paperTag(w, h, o = {}) {
  const opt = { seed: 2, color: 'cream', hole: true, ...o };
  const key = `tag|${w}|${h}|${JSON.stringify(opt)}`;
  return cached(key, () => {
    const pc = new PixelCanvas(w, h);
    const rnd = seeded(opt.seed);
    const ramp = opt.color === 'pink' ? [P.pink2, P.pink3, P.pink4, '#ffe0ef'] : [P.cream0, P.cream1, P.cream2, P.cream3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cut = 4 - y; // clipped top-left corner
      if (x < cut) continue;
      let idx = 2;
      const n = valueNoise2(x * 0.3, y * 0.3, opt.seed);
      if (n > 0.75) idx = 3; if (n < 0.2) idx = 1;
      if (y === h - 1 || x === w - 1) idx = 0;
      pc.set(x, y, ramp[idx]);
      if (rnd() < 0.015) pc.set(x, y, ramp[0]);
    }
    if (opt.hole) { pc.disc(6, 6, 1.6, 0); pc.set(5, 5, P.cream0); }
    pc.outline(P.ink);
    return pc.commit();
  });
}

// Tileable rope drawing directly on a 2D context (3px twisted rope)
export function drawRope(g, x0, y0, x1, y1, phase = 0) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy)));
  const nx = -dy / len, ny = dx / len;
  const cols = [P.cream0, P.cream1, P.cream2, '#cdb07a'];
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const x = x0 + dx * t, y = y0 + dy * t;
    for (let k = -1; k <= 1; k++) {
      const tw = ((i + k * 2 + phase) % 4 + 4) % 4;
      g.fillStyle = k === 0 ? cols[tw] : (k < 0 ? (tw < 2 ? cols[2] : cols[1]) : P.cream0);
      g.fillRect(Math.round(x + nx * k), Math.round(y + ny * k), 1, 1);
    }
    g.fillStyle = P.ink;
    g.fillRect(Math.round(x + nx * 2), Math.round(y + ny * 2), 1, 1);
    g.fillRect(Math.round(x - nx * 2), Math.round(y - ny * 2), 1, 1);
  }
}

// ---------------- Icons -----------------
const ICONS = {};
function icon(name, w, h, fn, outline = P.ink) {
  ICONS[name] = () => cached('icon|' + name, () => {
    const pc = new PixelCanvas(w + 2, h + 2);
    fn(pc, 1, 1);
    if (outline) pc.outline(outline);
    return pc.commit();
  });
}

icon('snail', 13, 11, (pc, ox, oy) => {
  // body
  pc.rect(ox + 1, oy + 8, 11, 2, P.cream2); pc.rect(ox + 1, oy + 9, 11, 1, P.cream1);
  pc.rect(ox + 10, oy + 5, 2, 4, P.cream2); pc.set(ox + 11, oy + 5, P.cream3);
  pc.set(ox + 10, oy + 3, P.cream1); pc.set(ox + 10, oy + 4, P.cream1); pc.set(ox + 12, oy + 3, P.cream1); pc.set(ox + 12, oy + 4, P.cream1);
  pc.set(ox + 10, oy + 2, P.ink); pc.set(ox + 12, oy + 2, P.ink);
  pc.set(ox + 0, oy + 9, P.cream1);
  // shell spiral
  pc.disc(ox + 5.5, oy + 5, 4.6, P.gold2);
  pc.disc(ox + 5, oy + 4.5, 3.6, P.gold3);
  pc.ring(ox + 5.5, oy + 5, 2.2, 3.1, P.gold1);
  pc.disc(ox + 5.5, oy + 5, 1.3, P.gold2);
  pc.set(ox + 5, oy + 5, P.gold1);
  pc.set(ox + 3, oy + 2, P.gold4); pc.set(ox + 4, oy + 1, P.gold4);
});
icon('shell', 11, 10, (pc, ox, oy) => {
  pc.ellipse(ox + 5.5, oy + 5.5, 5.4, 4.6, P.teal3);
  for (let i = 0; i < 5; i++) pc.line(ox + 5, oy + 9, ox + 1 + i * 2.2, oy + 1, P.teal2);
  pc.ellipse(ox + 5.5, oy + 4, 3, 2, P.teal4); pc.set(ox + 3, oy + 2, P.teal5);
  pc.rect(ox + 4, oy + 8, 3, 2, P.teal2);
});
icon('heart', 9, 8, (pc, ox, oy) => {
  pc.art(['.rr...rr.', 'rRRr.rRRr', 'rRWRrRRRr', 'rRRRRRRRr', '.rRRRRRr.', '..rRRRr..', '...rRr...', '....r....'], { r: P.red2, R: P.red3, W: P.red5 }, ox, oy);
});
icon('star', 9, 9, (pc, ox, oy) => {
  pc.art(['....y....', '...yYy...', 'yyyYWYyyy', '.yYYYYYy.', '..yYYYy..', '..yYyYy..', '.yYy.yYy.', '.yy...yy.', '.........'], { y: P.gold2, Y: P.gold3, W: P.gold4 }, ox, oy);
});
icon('lock', 8, 10, (pc, ox, oy) => {
  pc.art(['..mmmm..', '.m....m.', '.m....m.', '.m....m.', 'gggggggg', 'gGGGGGGg', 'gGGkkGGg', 'gGGkkGGg', 'gGGGGGGg', 'gggggggg'], { m: P.metal3, g: P.gold1, G: P.gold2, k: P.ink }, ox, oy);
});
icon('check', 9, 8, (pc, ox, oy) => {
  pc.art(['........G', '.......GG', '......GG.', 'G....GG..', 'GG..GG...', '.GGGG....', '..GG.....', '.........'], { G: P.green3 }, ox, oy);
});
icon('cross', 8, 8, (pc, ox, oy) => {
  pc.art(['RR....RR', 'RRR..RRR', '.RRRRRR.', '..RRRR..', '..RRRR..', '.RRRRRR.', 'RRR..RRR', 'RR....RR'], { R: P.red3 }, ox, oy);
});
icon('arrowL', 6, 9, (pc, ox, oy) => {
  pc.art(['....cc', '...ccc', '..cccc', '.ccccc', 'cccccc', '.ccccc', '..cccc', '...ccc', '....cc'], { c: P.cream3 }, ox, oy);
});
icon('arrowR', 6, 9, (pc, ox, oy) => {
  pc.art(['cc....', 'ccc...', 'cccc..', 'ccccc.', 'cccccc', 'ccccc.', 'cccc..', 'ccc...', 'cc....'], { c: P.cream3 }, ox, oy);
});
icon('gear', 11, 11, (pc, ox, oy) => {
  pc.disc(ox + 5.5, oy + 5.5, 4.2, P.metal3);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pc.rect(Math.round(ox + 5 + Math.cos(a) * 4.5), Math.round(oy + 5 + Math.sin(a) * 4.5), 2, 2, P.metal3); }
  pc.disc(ox + 5.5, oy + 5.5, 2.8, P.metal4);
  pc.disc(ox + 5.5, oy + 5.5, 1.4, P.metal1);
});
icon('trophy', 11, 11, (pc, ox, oy) => {
  pc.art(['.YYYYYYYYY.', 'YyWYYYYYyyY', 'Y.yYYYYYy.Y', 'Y.yYYYYYy.Y', '.YyYYYYYyY.', '...yYYYy...', '....yYy....', '....yYy....', '...yyYyy...', '..ggggggg..', '..ggggggg..'], { Y: P.gold3, y: P.gold2, W: P.gold4, g: P.wood3 }, ox, oy);
});
icon('crown', 11, 8, (pc, ox, oy) => {
  pc.art(['Y....Y....Y', 'YY..YYY..YY', 'YYY.YRY.YYY', 'YYYYYYYYYYY', 'YyyyyyyyyyY', 'YyRyyByyGyY', 'YyyyyyyyyyY', 'YYYYYYYYYYY'], { Y: P.gold3, y: P.gold2, R: P.red3, B: P.blue3, G: P.green3 }, ox, oy);
});
icon('skull', 9, 9, (pc, ox, oy) => {
  pc.art(['..wwwww..', '.wwwwwww.', 'wwwwwwwww', 'wkkwwwkkw', 'wkkwwwkkw', 'wwwwkwwww', '.wwwwwww.', '..wkwkw..', '..wwwww..'], { w: P.cream3, k: P.ink }, ox, oy);
});
icon('bubble', 9, 9, (pc, ox, oy) => {
  pc.ring(ox + 4.5, oy + 4.5, 3.3, 4.5, P.teal4);
  pc.set(ox + 3, oy + 2, P.white); pc.set(ox + 2, oy + 3, P.white); pc.set(ox + 3, oy + 3, P.teal5);
}, null);
icon('glove', 10, 10, (pc, ox, oy) => {
  pc.art(['..RRRRR...', '.RRRRRRR..', 'RRWRRRRRR.', 'RRRRRRRRRr', 'RRRRRRRRRr', '.RRRRRRRrr', '..rRRRRrr.', '..wwwwww..', '..wwwwww..', '..cccccc..'], { R: P.red3, r: P.red2, W: P.red5, w: P.cream3, c: P.cream1 }, ox, oy);
});
icon('spark', 9, 9, (pc, ox, oy) => {
  pc.art(['....w....', '....y....', '...yWy...', '.y.yWy.y.', 'wyWWWWWyw', '.y.yWy.y.', '...yWy...', '....y....', '....w....'], { w: P.white, y: P.gold3, W: P.gold4 }, ox, oy);
}, null);
icon('trail', 11, 9, (pc, ox, oy) => {
  pc.art(['......pp...', '...p..pPp..', '.p...pPWPp.', '...p..pPp..', 'p.....pp...', '..p.p......', '.....p.....', '.p.........', '...........'], { p: P.teal3, P: P.teal4, W: P.white }, ox, oy);
}, null);
icon('pose', 9, 11, (pc, ox, oy) => {
  pc.art(['....c....', 'c..ccc..c', '.c.ccc.c.', '..ccccc..', '...ccc...', '...ccc...', '...ccc...', '..cc.cc..', '..c...c..', '.cc...cc.', '.........'], { c: P.gold3 }, ox, oy);
});
icon('shirt', 11, 10, (pc, ox, oy) => {
  pc.art(['..PP...PP..', '.PPPPPPPPP.', 'PPPPPPPPPPP', 'PPWPPPPPPPP', '..PPPPPPP..', '..PPPPPPP..', '..PPPPPPP..', '..PPPPPPP..', '..ppppppp..', '...........'], { P: P.pink3, p: P.pink2, W: P.pink4 }, ox, oy);
});
icon('door', 9, 11, (pc, ox, oy) => {
  pc.art(['.mmmmmmm.', 'mMMMMMMMm', 'mMrMMMrMm', 'mMMMMMMMm', 'mMMMMMyMm', 'mMMMMMyMm', 'mMMMMMMMm', 'mMrMMMrMm', 'mMMMMMMMm', 'mMMMMMMMm', 'mmmmmmmmm'], { m: P.metal1, M: P.metal3, r: P.rust3, y: P.gold3 }, ox, oy);
});
icon('keyboard', 13, 8, (pc, ox, oy) => {
  pc.rect(ox, oy, 13, 8, P.metal2);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) pc.set(ox + 1 + i * 2, oy + 1 + j * 2, P.metal5);
  pc.rect(ox + 3, oy + 7, 7, 1, P.metal5);
});
icon('wifi', 11, 9, (pc, ox, oy) => {
  pc.ring(ox + 5.5, oy + 9, 7.5, 8.8, P.teal4); pc.ring(ox + 5.5, oy + 9, 4.5, 5.8, P.teal4); pc.disc(ox + 5.5, oy + 8.5, 1.8, P.teal4);
  for (let y = 7; y < 11; y++) for (let x = 0; x < 13; x++) if (y > 8) pc.set(ox + x, oy + y, 0);
});
icon('pad', 13, 8, (pc, ox, oy) => {
  pc.art(['.mmmm...mmmm.', 'mMMMMmmmMMMMm', 'MMwMMMMMMMrMM', 'MwwwMMMMMyMbM', 'MMwMMMMMMMgMM', 'MMMMMmmmMMMMM', '.MMMM...MMMM.', '..MM.....MM..'], { m: P.metal3, M: P.metal2, w: P.cream3, r: P.red3, y: P.gold3, b: P.blue3, g: P.green3 }, ox, oy);
});
icon('cone', 9, 11, (pc, ox, oy) => {
  pc.art(['....o....', '...ooo...', '...oWo...', '..ooooo..', '..WWWWW..', '.ooooooo.', '.ooooooo.', '.WWWWWWW.', 'ooooooooo', 'kkkkkkkkk', 'kkkkkkkkk'], { o: P.orange3, W: P.cream4, k: P.metal1 }, ox, oy);
});
icon('jelly', 9, 10, (pc, ox, oy) => {
  pc.art(['..ppppp..', '.pPPPPPp.', 'pPWPPPPPp', 'pPkPPkPPp', 'pPPPPPPPp', 'ppppppppp', '.p.p.p.p.', 'p.p.p.p..', '.p..p.p..', '....p....'], { p: P.pink2, P: P.pink3, W: P.pink4, k: P.ink }, ox, oy);
});
icon('beer', 8, 10, (pc, ox, oy) => {
  pc.art(['.wwwww..', 'wwwwwww.', 'yYYYYYyc', 'yYWYYYyc', 'yYWYYYy.c', 'yYYYYYy.c', 'yYYYYYyc', 'yYYYYYy.', 'yyyyyyy.', '........'], { w: P.cream4, y: P.gold2, Y: P.gold3, W: P.gold4, c: P.metal3 }, ox, oy);
});
icon('qmark', 7, 10, (pc, ox, oy) => {
  pc.art(['.ccccc.', 'cc...cc', '.....cc', '....cc.', '...cc..', '...cc..', '.......', '...cc..', '...cc..', '.......'], { c: P.cream3 }, ox, oy);
});
icon('sword', 10, 10, (pc, ox, oy) => {
  pc.art(['........ww', '.......wWw', '......wWw.', '.....wWw..', '.g..wWw...', '..gwWw....', '...gw.....', '..b.g.....', '.b...g....', 'b.........'], { w: P.metal4, W: P.metal5, g: P.gold3, b: P.wood3 }, ox, oy);
});
icon('clock', 10, 10, (pc, ox, oy) => {
  pc.disc(ox + 5, oy + 5, 4.8, P.cream3); pc.ring(ox + 5, oy + 5, 4, 4.8, P.gold2);
  pc.vline(ox + 5, oy + 2, oy + 5, P.ink); pc.hline(ox + 5, ox + 7, oy + 5, P.ink);
});
icon('fire', 9, 10, (pc, ox, oy) => {
  pc.art(['....r....', '...rr....', '...rOr...', '..rOOr.r.', '.rOOYOrr.', '.rOYYYOr.', 'rOYYWYYOr', 'rOYWWWYOr', '.rOYYYOr.', '..rrrrr..'], { r: P.red3, O: P.orange3, Y: P.gold3, W: P.gold4 }, ox, oy);
});


// ---- skill icons (12x12)
const SKI = {
  mine: [['....w..w....', '.w..bbbb..w.', '...bBBBBb...', '..bBWBBBBb..', 'w.bBWBBBBb.w', '..bBBBBBBb..', '..bBBBBBBb..', 'w.bBBBBBBb.w', '...bBBBBb...', '.w..bbbb..w.', '....w..w....', '............'], { b: P.teal3, B: P.teal4, W: P.white, w: P.teal5 }],
  wave: [['......bbb...', '....bbBBBb..', '...bBBWWBBb.', '..bBB...bBb.', '.bBB.....b..', 'bBB...bb....', 'bB...bBBb...', 'bB..bBWBBb..', 'bBbbBBBBBBb.', '.bBBBBBBBBBb', '..bbbbbbbbb.', '............'], { b: P.teal2, B: P.teal4, W: P.white }],
  chili: [['.....gg.....', '....gG......', '...rrr......', '..rRRRr.....', '..rRWRRr....', '..rRRRRRr...', '...rRRRRRr..', '....rRRRRRr.', '.....rrRRRr.', '.......rrRr.', '.........rr.', '............'], { g: P.green3, G: P.algae4, r: P.red2, R: P.red3, W: P.red5 }],
  eye: [['.p....p....p', '..p...p...p.', '....vvvvv...', '..vvwwwwwvv.', '.vwwkkkkwwv.', 'vwwkkPPkkwwv', '.vwwkkkkwwv.', '..vvwwwwwvv.', '....vvvvv...', '..p...p...p.', '.p....p....p', '............'], { p: P.purple4, v: P.purple3, w: P.white, k: P.purple1, P: P.pink3 }],
  coral: [['...r....r...', '..rR.r.rR...', '..rR.rRrR.r.', '...rRrRR.rR.', '.r..rRRr.rR.', '.rR.rRRrrR..', '..rRrRRRR...', '...rRRRr....', '....rRR.....', '....rRR.....', '..sssssss...', '.sSSSSSSSs..'], { r: P.red3, R: P.orange4, s: P.wood3, S: P.wood5 }],
  hook: [['.....mm.....', '....m..m....', '.....mm.....', '.....MM.....', '...MMMMMM...', '.....MM.....', '.....MM.....', '.M...MM...M.', '.MM..MM..MM.', '..MM.MM.MM..', '...MMMMMM...', '....MMMM....'], { m: P.metal3, M: P.metal4 }],
  card: [['.cccccccccc.', '.cYYYYYYYYc.', '.cY.rrrr.Yc.', '.cY.rWRr.Yc.', '.cY.rRRr.Yc.', '.cY..rr..Yc.', '.cY.gggg.Yc.', '.cY.g..g.Yc.', '.cYYYYYYYYc.', '.cy.kkkk.yc.', '.cccccccccc.', '............'], { c: P.cream3, Y: P.gold3, r: P.red3, W: P.red5, R: P.red2, g: P.green3, y: P.gold2, k: P.ink }],
  shellArmor: [['....ooooo...', '..ooOOOOOo..', '.oOOyyyOOOo.', '.oOyOOOyOOo.', 'oOOyOyyOyOOo', 'oOOyOy.yOyOo', 'oOOOyOOyOyOo', '.oOOOyyOOyo.', '.ooOOOOOyyo.', '..ccoooooo..', '.cCCc.......', '............'], { o: P.wood3, O: P.wood5, y: P.wood6, c: P.pink3, C: P.pink4 }],
  ghost: [['...wwwww....', '..wWWWWWw...', '.wWkWWkWWw..', '.wWkWWkWWw..', '.wWWWWWWWw..', '.wWWkkkWWw..', '.wWWWWWWWw..', '.wWWWWWWWw..', '.wWwWWwWWw..', '.ww.ww.ww...', '............', '............'], { w: P.cream1, W: P.cream3, k: P.ink }],
  bolt: [['......yyyy..', '.....yYYy...', '....yYYy....', '...yYYy.....', '..yYYYYYYy..', '.yyyyyYYy...', '.....yYy....', '....yYy.....', '...yYy......', '..yYy.......', '..yy........', '............'], { y: P.gold2, Y: P.gold4 }],
  guitar: [['..........mm', '.........mm.', '........ww..', '.......ww...', '..bbb.ww....', '.bBBBbw.....', 'bBBkBBb.....', 'bBkkkBb.....', 'bBBkBBBb....', '.bBBBBBb....', '..bbBBb.....', '....bb......'], { m: P.metal4, w: P.wood6, b: P.wood2, B: P.wood5, k: P.ink }],
  pinata: [['.....rr.....', '....rRRr....', '..ggrRRrbb..', '.gGGgRRbBBb.', 'gGGGGyyBBBBb', '.gGGyYYyBBb.', '..gyYYYYyb..', '..pYYyyYYp..', '.pPPp..pPPp.', 'pPPp....pPPp', 'pp........pp', '............'], { r: P.red3, R: P.red4, g: P.green3, G: P.green4, b: P.blue3, B: P.blue4, y: P.gold2, Y: P.gold3, p: P.pink2, P: P.pink3 }],
};
for (const [k, [rows, pal]] of Object.entries(SKI)) icon('sk_' + k, 12, 12, (pc, ox, oy) => pc.art(rows, pal, ox, oy));

export function getIcon(name) { const f = ICONS[name]; return f ? f() : ICONS.qmark(); }
export const ICON_NAMES = Object.keys(ICONS);

// Keycap sprite with a label (for control hints)
export function keycap(label, font, o = {}) {
  const key = `keycap|${label}|${font.id}|${o.color || ''}`;
  return cached(key, () => {
    const tw = font.measure(label);
    const w = Math.max(9, tw + 6), h = font.capHeight + 7;
    const pc = new PixelCanvas(w, h + 1);
    pc.rect(1, 0, w - 2, h, o.color || P.cream2);
    pc.rect(0, 1, w, h - 2, o.color || P.cream2);
    pc.rect(1, h - 2, w - 2, 2, shade(o.color || P.cream2, -0.35));
    pc.rect(1, 1, w - 2, 1, P.white);
    pc.outline(P.ink);
    const c = pc.commit();
    const g = c.getContext('2d');
    font.drawRaw(g, label, Math.floor((w - tw) / 2) + 1, 3, P.ink);
    return c;
  });
}

// Dither-gradient bar fill (health etc). colors: [dark, mid, light]
export function barFill(w, h, cols) {
  const key = `bar|${w}|${h}|${cols.join(',')}`;
  return cached(key, () => {
    const pc = new PixelCanvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = y / Math.max(1, h - 1);
      let c = cols[1];
      if (t < 0.25) c = cols[2]; else if (t > 0.75) c = cols[0];
      else if (t > 0.6 && (x + y) % 2 === 0) c = cols[0];
      else if (t < 0.4 && (x + y) % 2 === 0) c = cols[2];
      pc.set(x, y, c);
    }
    return pc.commit();
  });
}

// Wooden sign with carved text (for big titles); returns canvas
export function carvedSign(w, h, seed = 7, tone = 'mid') {
  return woodPanel(w, h, { seed, tone, plankSize: Math.max(8, Math.floor(h / 3)), barnacles: 4, algae: 1, moss: 0.8 });
}

export function clearSpriteCache() { cache.clear(); }
export { mixHex };
