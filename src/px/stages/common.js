// Shared pixel-art kit for the 2D stages: a software pixel buffer (Pix) with crisp shape fills,
// fast coarse noise fields, a tiny hand-made bitmap font, procedural texture painters (rusted
// riveted steel, wood planks, tiles, pipes, chains, hazard stripes, grating, chain-link, kelp,
// barnacles, papel picado...), perspective floors, parallax layers and dithered light cones.
// Everything is deterministic (hash based) so every load looks identical.
import { PPU } from '../display.js';
import { hexU, ramp, rampOf, mixU, darkU, lightU, u32, BAYER4 } from '../pal.js';

export { PPU, hexU, ramp, rampOf, mixU, darkU, lightU, u32, BAYER4 };
const C_CACHE = new Map();
export const C = (hex) => { let v = C_CACHE.get(hex); if (v === undefined) { v = hexU(hex); C_CACHE.set(hex, v); } return v; };
export const TAU = Math.PI * 2;
export const PIV_Y = 5.5;                       // vertical parallax pivot (world y)
export const AX = (x) => Math.round(x * PPU);   // world x -> absolute art x
export const AY = (y) => Math.round(-y * PPU);  // world y -> absolute art y
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const BY = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

// ------------------------------------------------------------------ hashing / rng / noise
export function hh(x, y, s = 0) {
  let n = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul((s | 0) + 0x61c88647, 0x9e3779b9);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed) {
  let s = (Math.imul(seed | 0, 0x9e3779b9) ^ 0x5bd1e995) >>> 0 || 1;
  const f = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  return f;
}
export function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hh(ix, iy, s), b = hh(ix + 1, iy, s), c = hh(ix, iy + 1, s), d = hh(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, s = 0, oct = 3) {
  let v = 0, a = 0.55, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += vnoise(x * f, y * f, s + o * 17) * a; tot += a; a *= 0.5; f *= 2.03; }
  return v / tot;
}
// fbm sampled on a coarse grid and bilinearly upsampled (cheap smooth noise for big layers)
export function noiseField(w, h, scale, seed = 0, oct = 3, step = 4, ox = 0, oy = 0) {
  const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2;
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fbm((ox + i * step) * scale, (oy + j * step) * scale, seed, oct);
  const out = new Float32Array(w * h);
  const inv = 1 / step;
  for (let y = 0; y < h; y++) {
    const gy = y * inv, j = gy | 0, fy = gy - j, r0 = j * gw, r1 = r0 + gw;
    for (let x = 0; x < w; x++) {
      const gx = x * inv, i = gx | 0, fx = gx - i;
      const a = g[r0 + i], b = g[r0 + i + 1], c = g[r1 + i], d = g[r1 + i + 1];
      out[y * w + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
  }
  return out;
}

// ------------------------------------------------------------------ colour helpers
export const fogU = (c, f, t) => (c ? mixU(c, f, t) : 0);
export function fogRamp(r, f, t) { return Uint32Array.from(Array.from(r, (c) => mixU(c, f, t))); }
export function R(hex, o) { return ramp(hex, o); }
export function RO(list) { return rampOf(list); }
export const tone = (r, t) => r[t < 0 ? 0 : t > 4 ? 4 : t | 0];

// ------------------------------------------------------------------ pixel buffer
export class Pix {
  constructor(w, h) {
    this.w = Math.max(1, Math.ceil(w)); this.h = Math.max(1, Math.ceil(h));
    this.d = new Uint32Array(this.w * this.h);
    this._cv = null;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = c; }
  seti(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = c; }
  get(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[y * this.w + x]; }
  // only paint where something is already drawn
  over(x, y, c) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = y * this.w + x; if (this.d[i]) this.d[i] = c; }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.h, Math.round(y + h));
    if (x1 <= x0) return;
    if (typeof c === 'function') { for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const v = c(xx, yy, this.d[yy * this.w + xx]); if (v !== undefined) this.d[yy * this.w + xx] = v; } return; }
    for (let yy = y0; yy < y1; yy++) this.d.fill(c, yy * this.w + x0, yy * this.w + x1);
  }
  hl(x0, x1, y, c) { if (x1 < x0) [x0, x1] = [x1, x0]; this.rect(x0, y, x1 - x0 + 1, 1, c); }
  vl(x, y0, y1, c) { if (y1 < y0) [y0, y1] = [y1, y0]; this.rect(x, y0, 1, y1 - y0 + 1, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let g = 0; g < 4000; g++) {
      this.seti(x0, y0, typeof c === 'function' ? c(x0, y0, g) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // thick line (square brush)
  tline(x0, y0, x1, y1, w, c) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const o = Math.floor(w / 2);
    for (let i = 0; i <= n; i++) { const t = i / n; this.rect(Math.round(x0 + (x1 - x0) * t) - o, Math.round(y0 + (y1 - y0) * t) - o, w, w, c); }
  }
  ell(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    const fn = typeof c === 'function';
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      const ny = (y + 0.5 - cy) / ry;
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const q = nx * nx + ny * ny;
        if (q > 1) continue;
        const i = y * this.w + x;
        if (fn) { const v = c(x, y, nx, ny, q, this.d[i]); if (v !== undefined) this.d[i] = v; } else this.d[i] = c;
      }
    }
  }
  disc(cx, cy, r, c) { this.ell(cx, cy, r, r, c); }
  ring(cx, cy, r0, r1, c) { this.ell(cx, cy, r1, r1, (x, y, nx, ny, q) => (q * r1 * r1 >= r0 * r0 ? (typeof c === 'function' ? c(x, y, nx, ny) : c) : undefined)); }
  poly(pts, c) {
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    const n = pts.length >> 1;
    for (let k = 0; k < n; k++) { const x = pts[k * 2], y = pts[k * 2 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const fn = typeof c === 'function';
    const xs = [];
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const py = y + 0.5;
      xs.length = 0;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ya = pts[a * 2 + 1], yb = pts[b * 2 + 1];
        if ((ya > py) !== (yb > py)) xs.push(pts[a * 2] + ((py - ya) * (pts[b * 2] - pts[a * 2])) / (yb - ya));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        if (fn) for (let x = xa; x <= xb; x++) { const i = y * this.w + x; const v = c(x, y, this.d[i]); if (v !== undefined) this.d[i] = v; }
        else if (xb >= xa) this.d.fill(c, y * this.w + xa, y * this.w + xb + 1);
      }
    }
  }
  // ordered-dither fill: pixels whose Bayer threshold < a get colour c
  dith(x, y, w, h, c, a, onlyOpaque = false) {
    if (a <= 0) return;
    const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      if (BAYER4[(yy & 3) * 4 + (xx & 3)] >= a) continue;
      const i = yy * this.w + xx;
      if (onlyOpaque && !this.d[i]) continue;
      this.d[i] = typeof c === 'function' ? c(xx, yy, this.d[i]) : c;
    }
  }
  // remap every opaque pixel in a rect
  map(x, y, w, h, f) {
    const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = yy * this.w + xx, c = this.d[i];
      if (!c) continue;
      const v = f(c, xx, yy);
      if (v !== undefined) this.d[i] = v;
    }
  }
  mixAll(c, t) { const d = this.d; for (let i = 0; i < d.length; i++) if (d[i]) d[i] = mixU(d[i], c, t); }
  // copy non-transparent pixels of src at (x, y)
  blit(src, x, y, flip = false) {
    x = Math.round(x); y = Math.round(y);
    const sw = src.w, sh = src.h, sd = src.d, d = this.d, W = this.w;
    for (let j = 0; j < sh; j++) {
      const yy = y + j; if (yy < 0 || yy >= this.h) continue;
      for (let i = 0; i < sw; i++) {
        const xx = x + i; if (xx < 0 || xx >= W) continue;
        const c = sd[j * sw + (flip ? sw - 1 - i : i)];
        if (c) d[yy * W + xx] = c;
      }
    }
  }
  // 1px outline around opaque pixels. cTop is used where the pixel below is opaque (top edges)
  outline(c, cTop = c, diag = false) {
    const W = this.w, H = this.h, d = this.d, src = d.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (src[i]) continue;
      const dn = y < H - 1 && src[i + W], up = y > 0 && src[i - W];
      const lf = x > 0 && src[i - 1], rt = x < W - 1 && src[i + 1];
      let hit = dn || up || lf || rt;
      if (!hit && diag) hit = (x > 0 && y > 0 && src[i - W - 1]) || (x < W - 1 && y > 0 && src[i - W + 1]) || (x > 0 && y < H - 1 && src[i + W - 1]) || (x < W - 1 && y < H - 1 && src[i + W + 1]);
      if (hit) d[i] = dn && !up ? cTop : c;
    }
    return this;
  }
  // darken pixels that are directly below/right of an edge (simple drop shadow inside the buffer)
  dropShadow(dx, dy, c, mask = null) {
    const W = this.w, H = this.h, d = this.d, src = d.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const i = y * W + x;
      if (src[sy * W + sx] && !src[i] && (!mask || mask(x, y))) d[i] = c;
    }
  }
  canvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    g.putImageData(img, 0, 0);
    return cv;
  }
  clone() { const p = new Pix(this.w, this.h); p.d.set(this.d); return p; }
  // sub-rectangle copy
  crop(x, y, w, h) { const p = new Pix(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.d[j * w + i] = this.get(x + i, y + j); return p; }
}

// nearest-neighbour rotation around (cx, cy) of the source; output padded square
export function rotPix(src, ang, cx = src.w / 2, cy = src.h / 2, size = 0) {
  const R0 = Math.ceil(Math.hypot(Math.max(cx, src.w - cx), Math.max(cy, src.h - cy))) + 1;
  const S = size || R0 * 2;
  const out = new Pix(S, S);
  const c = Math.cos(-ang), s = Math.sin(-ang);
  const oc = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - oc, dy = y + 0.5 - oc;
    const sx = Math.floor(cx + dx * c - dy * s), sy = Math.floor(cy + dx * s + dy * c);
    if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
    const v = src.d[sy * src.w + sx];
    if (v) out.d[y * S + x] = v;
  }
  out.cx = oc; out.cy = oc;
  return out;
}
export function bake(w, h, fn) { const p = new Pix(w, h); fn(p); return p.canvas(); }

// ------------------------------------------------------------------ bitmap font (hand made)
const F5 = {
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '111,010,010,010,010,010,111',
  J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,11001,10101,10011,10001,10001,10001', 'Ñ': '01110,00000,10001,11001,10101,10011,10001',
  O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101',
  R: '11110,10001,10001,11110,10100,10010,10001', S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010',
  X: '10001,10001,01010,00100,01010,10001,10001', Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
  0: '01110,10001,10011,10101,11001,10001,01110', 1: '010,110,010,010,010,010,111', 2: '01110,10001,00001,00010,00100,01000,11111',
  3: '11110,00001,00001,01110,00001,00001,11110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
  6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
  9: '01110,10001,10001,01111,00001,00010,01100', '!': '1,1,1,1,1,0,1', '¡': '1,0,1,1,1,1,1', '?': '01110,10001,00001,00010,00100,00000,00100',
  '.': '0,0,0,0,0,0,1', ',': '00,00,00,00,00,01,10', '-': '0000,0000,0000,1111,0000,0000,0000', "'": '1,1,0,0,0,0,0', ':': '0,0,1,0,0,1,0',
  '$': '00100,01111,10100,01110,00101,11110,00100', '#': '01010,11111,01010,01010,11111,01010,00000', '/': '00001,00010,00010,00100,01000,01000,10000',
  '*': '00100,10101,01110,11111,01110,10101,00100', h: '00000,01010,11111,11111,01110,00100,00000', '+': '000,000,010,111,010,000,000',
  'É': '00010,11111,10000,11110,10000,10000,11111', 'Á': '00010,01110,10001,11111,10001,10001,10001', 'Ó': '00010,01110,10001,10001,10001,10001,01110',
  'Í': '010,111,010,010,010,010,111', 'Ú': '00010,10001,10001,10001,10001,10001,01110', '%': '11001,11010,00010,00100,01000,01011,10011',
};
const F3 = {
  A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011', D: '110,101,101,101,110', E: '111,100,110,100,111',
  F: '111,100,110,100,100', G: '011,100,101,101,011', H: '101,101,111,101,101', I: '111,010,010,010,111', J: '001,001,001,101,010',
  K: '101,101,110,101,101', L: '100,100,100,100,111', M: '10001,11011,10101,10001,10001', N: '1001,1101,1011,1001,1001', 'Ñ': '111,000,110,101,101', O: '010,101,101,101,010',
  P: '110,101,110,100,100', Q: '010,101,101,110,011', R: '110,101,110,101,101', S: '011,100,010,001,110', T: '111,010,010,010,010',
  U: '101,101,101,101,111', V: '101,101,101,101,010', W: '10001,10001,10101,10101,01010', X: '101,101,010,101,101', Y: '101,101,010,010,010',
  Z: '111,001,010,100,111', 0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '110,001,010,100,111', 3: '110,001,010,001,110',
  4: '101,101,111,001,001', 5: '111,100,110,001,110', 6: '011,100,111,101,111', 7: '111,001,010,010,010', 8: '111,101,111,101,111',
  9: '111,101,111,001,110', '!': '1,1,1,0,1', '¡': '1,0,1,1,1', '.': '0,0,0,0,1', '-': '000,000,111,000,000', '?': '110,001,010,000,010',
  ':': '0,1,0,1,0', "'": '1,1,0,0,0', '$': '011,110,010,011,110', '%': '101,001,010,100,101', '/': '001,001,010,100,100', '+': '000,010,111,010,000',
  'É': '011,000,111,110,111', 'Á': '011,000,010,111,101', 'Ó': '011,000,111,101,111', 'Í': '01,00,11,01,11', h: '01010,11111,11111,01110,00100', ',': '0,0,0,1,1',
};
function compileFont(F, H) {
  const out = {};
  for (const k in F) {
    const rows = F[k].split(',');
    out[k] = { w: rows[0].length, rows: rows.map((r) => Array.from(r, (ch) => ch === '1')) };
  }
  out[' '] = { w: H === 7 ? 3 : 2, rows: Array.from({ length: H }, () => []) };
  return out;
}
const FONTS = { 5: { g: compileFont(F5, 7), h: 7 }, 3: { g: compileFont(F3, 5), h: 5 } };
export function textW(str, font = 5, sc = 1, sp = 1) {
  const F = FONTS[font].g; let w = 0;
  for (const ch of str.toUpperCase()) { const g = F[ch] || F['?'] || F[' ']; w += (g.w + sp) * sc; }
  return Math.max(0, w - sp * sc);
}
export function fontH(font = 5) { return FONTS[font].h; }
// draw text; c may be a function (x, y, gx, gy) for gradients/patterns. o: { sc, sp, shadow, outline, align }
export function text(P, str, x, y, c, o = {}) {
  const font = o.font || 5, F = FONTS[font].g, sc = o.sc || 1, sp = o.sp ?? 1;
  const W = textW(str, font, sc, sp);
  let cx = Math.round(o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x);
  const y0 = Math.round(y);
  const plot = (px, py, col) => P.rect(px, py, sc, sc, col);
  const pass = (dx, dy, col, fnC) => {
    let xx = cx;
    for (const ch of str.toUpperCase()) {
      const g = F[ch] || F['?'] || F[' '];
      g.rows.forEach((row, j) => row.forEach((on, i) => { if (on) plot(xx + i * sc + dx, y0 + j * sc + dy, fnC ? col(xx + i * sc, y0 + j * sc, i, j) : col); }));
      xx += (g.w + sp) * sc;
    }
  };
  if (o.outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) pass(dx, dy, o.outline, false);
  if (o.shadow) pass(o.sdx ?? 1, o.sdy ?? 1, o.shadow, false);
  pass(0, 0, c, typeof c === 'function');
  return W;
}

// ------------------------------------------------------------------ palettes (shared)
export const PAL = {
  ink: C('#120a08'), ink2: C('#1e120d'),
  rust: RO(['#3a1a0c', '#5c2a14', '#8a3d1a', '#b5561f', '#d97a2b']),
  steel: RO(['#1a1e24', '#2a2f36', '#464e58', '#6b7682', '#9aa6b2']),
  steelL: RO(['#2a2f36', '#464e58', '#6b7682', '#9aa6b2', '#cfd8df']),
  wood: RO(['#2a170e', '#3b2216', '#5a3522', '#7a4a2c', '#9c6436']),
  woodL: RO(['#5a3522', '#7a4a2c', '#9c6436', '#b97f46', '#d8a05e']),
  woodP: RO(['#7a4a2c', '#9c6436', '#b97f46', '#d8a05e', '#efc485']),
  algae: RO(['#14291a', '#1d3b1a', '#2f5d24', '#4a8a2f', '#77b83f']),
  teal: RO(['#0a2a33', '#0f3a4a', '#17606f', '#2a8f97', '#49c2bd']),
  cream: RO(['#8a7350', '#bfa274', '#e0c99a', '#f5e6c4', '#fff7e0']),
  red: RO(['#3a0a0a', '#5e1414', '#9c1f1f', '#d93a2b', '#ff6a4a']),
  gold: RO(['#4a3008', '#6b4a12', '#b88a1e', '#f0c33c', '#fff08a']),
  brass: RO(['#3a2408', '#6b4a12', '#a8801e', '#d8b040', '#fff0a0']),
  pink: RO(['#4a1030', '#6e1f4a', '#b8357a', '#ff6fb0', '#ffb6d9']),
  purple: RO(['#1a0e2e', '#2e1a4a', '#553088', '#8a52c9', '#c194ff']),
  blue: RO(['#081838', '#10306e', '#2050c0', '#4f8fff', '#9cc4ff']),
  orange: RO(['#5c2a10', '#8a3d14', '#c4561a', '#ff8a2a', '#ffc070']),
  green: RO(['#0e2a14', '#1a5a2a', '#2a9a44', '#3fd16a', '#9effa8']),
  yellow: RO(['#5a4008', '#8a6a10', '#c8a020', '#f0c840', '#fff0a0']),
  glass: RO(['#0e3a3a', '#1f6a5a', '#3a9a6a', '#7ad08a', '#d0ffd8']),
  terra: RO(['#3a160c', '#6a2a16', '#a0482a', '#c86a3e', '#e8946a']),
};

// ------------------------------------------------------------------ small details
export function rivet(P, x, y, r, big = false) {
  x = Math.round(x); y = Math.round(y);
  if (big) {
    P.rect(x - 1, y - 1, 3, 3, r[2]); P.seti(x - 1, y - 1, r[4]); P.seti(x, y - 1, r[3]); P.seti(x - 1, y, r[3]);
    P.seti(x + 1, y + 1, r[0]); P.seti(x + 1, y, r[1]); P.seti(x, y + 1, r[1]); P.seti(x + 2, y + 1, r[0]); P.seti(x + 1, y + 2, r[0]);
    return;
  }
  P.seti(x, y, r[3]); P.seti(x + 1, y, r[2]); P.seti(x, y + 1, r[2]); P.seti(x + 1, y + 1, r[0]);
}
export function bolt(P, x, y, r) { x = Math.round(x); y = Math.round(y); P.rect(x - 1, y - 1, 3, 3, r[2]); P.seti(x - 1, y - 1, r[3]); P.seti(x + 1, y + 1, r[0]); P.seti(x, y, r[1]); }
export function barnacle(P, x, y, s, rr) {
  // little volcano with a dark hole; rr = [shadow, base, light, hole]
  const w = s + 2;
  for (let j = 0; j < s; j++) { const hw = Math.round((w / 2) * (1 - j / (s + 1.5))) + 1; P.hl(x - hw, x + hw - 1, y - j, j === s - 1 ? rr[2] : rr[1]); P.seti(x + hw - 1, y - j, rr[0]); }
  P.hl(x - 1, x, y - s + 1, rr[3]);
  P.seti(x - Math.round(w / 2), y - 1, rr[2]);
}
export function chainV(P, x, y0, y1, r, ph = 0) {
  x = Math.round(x);
  for (let y = Math.round(y0), k = ph; y < y1; y += 4, k++) {
    if (k % 2 === 0) { // ring seen face-on
      P.vl(x - 1, y, y + 4, r[3]); P.vl(x + 1, y, y + 4, r[1]); P.seti(x, y, r[2]); P.seti(x, y + 4, r[1]);
    } else { // ring edge-on
      P.vl(x, y - 1, y + 4, r[2]); P.seti(x, y - 1, r[3]);
    }
  }
}
// sagging chain/rope/cable between two points (catenary-ish), 1px
export function sagLine(P, x0, y0, x1, y1, sag, c, step = 1) {
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    P.line(px, py, x, y, c); px = x; py = y;
  }
}
// horizontal cylinder band (pipe/beam lit from the top). profile maps 0..1 (top->bottom) to tone
const PIPE_PROFILE = [1, 3, 4, 3, 3, 2, 2, 2, 2, 1, 1, 0];
export function pipeH(P, x, y, w, h, r, o = {}) {
  const prof = o.profile || PIPE_PROFILE;
  for (let j = 0; j < h; j++) {
    const t = prof[Math.min(prof.length - 1, Math.floor((j / h) * prof.length))];
    if (o.tex) { for (let i = 0; i < w; i++) P.seti(x + i, y + j, o.tex(x + i, y + j, t, j / h)); } else P.rect(x, y + j, w, 1, r[t]);
  }
  P.hl(x, x + w - 1, y, o.ol ?? r[0]); P.hl(x, x + w - 1, y + h - 1, o.ol ?? PAL.ink);
}
const PIPEV_PROFILE = [1, 2, 4, 3, 3, 2, 2, 2, 1, 1, 0];
export function pipeV(P, x, y, w, h, r, o = {}) {
  const prof = o.profile || PIPEV_PROFILE;
  for (let i = 0; i < w; i++) {
    const t = prof[Math.min(prof.length - 1, Math.floor((i / w) * prof.length))];
    if (o.tex) { for (let j = 0; j < h; j++) P.seti(x + i, y + j, o.tex(x + i, y + j, t, i / w)); } else P.rect(x + i, y, 1, h, r[t]);
  }
  P.vl(x, y, y + h - 1, o.ol ?? r[0]); P.vl(x + w - 1, y, y + h - 1, o.ol ?? PAL.ink);
}
// flange ring on a horizontal pipe at x (vertical band), with bolts
export function flangeOnH(P, x, y, h, r, wid = 4) {
  const ext = Math.max(2, Math.round(h * 0.18));
  pipeV(P, x, y - ext, wid, h + ext * 2, r, { profile: [3, 4, 2, 1] });
  for (let j = 2; j < h + ext * 2 - 2; j += 5) P.seti(x + 1, y - ext + j, r[0]);
}
export function flangeOnV(P, x, y, w, r, hgt = 4) {
  const ext = Math.max(2, Math.round(w * 0.18));
  pipeH(P, x - ext, y, w + ext * 2, hgt, r, { profile: [3, 4, 2, 1] });
  for (let i = 2; i < w + ext * 2 - 2; i += 5) P.seti(x - ext + i, y + 1, r[0]);
}
// diagonal hazard stripes; wear adds chips/rust
export function hazard(P, x, y, w, h, o = {}) {
  const yel = o.yel || PAL.yellow, blk = o.blk || C('#1a1a1c'), per = o.per || 10, rust = o.rust || PAL.rust, seed = o.seed || 3;
  const wear = o.wear ?? 0.35;
  const nf = noiseField(w, h, 1 / 9, seed, 2, 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = y + j;
    const k = Math.floor((X + Y * (o.dir ?? 1)) / (per / 2)) & 1;
    let c = k ? (j === 0 ? yel[4] : j >= h - 1 ? yel[1] : yel[3]) : blk;
    const n = nf[j * w + i] + (hh(X, Y, seed) - 0.5) * 0.25;
    if (n > 1 - wear * 0.6) c = n > 1 - wear * 0.35 ? rust[1] : rust[2];
    else if (n > 1 - wear * 0.75 && k) c = yel[2];
    P.seti(X, Y, c);
  }
}

// ------------------------------------------------------------------ big textures
// fast integer hash -> 0..1 (inline-friendly)
export function ih(x, y, s = 0) {
  let n = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  n = Math.imul(n ^ (n >>> 13), 0x5bd1e995);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
// Riveted, rusted steel bulkhead plates. Rust bleeds from seams and rivets, runs down in streaks,
// pools along the bottom seam and breaks through the paint in chipped patches.
// o: { pw, ph, paint (ramp), paint2, rust (ramp), seam, rivet (ramp), rustAmt, stagger, seed, grime, grimeH, primer }
export function rustPlates(P, X0, Y0, W, H, o = {}) {
  const pw = o.pw ?? 88, ph = o.ph ?? 66, seed = o.seed ?? 1;
  const paint = o.paint, paint2 = o.paint2 || paint, rust = o.rust || PAL.rust, rv = o.rivet || paint;
  const seam = o.seam ?? PAL.ink2, ra = o.rustAmt ?? 0.45, primer = o.primer ?? rust[2];
  const nfA = noiseField(W, H, 1 / 46, seed, 3, 6, X0, Y0);
  const nfB = noiseField(W, H, 1 / 10, seed + 9, 2, 3, X0, Y0);
  const gH = o.grimeH ?? 0, grime = o.grime;
  // per-column streak strength + length (rust running down from the seam / rivet rows)
  const span = W + pw;
  const sS = new Float32Array(span), sL = new Float32Array(span);
  for (let i = 0; i < span; i++) { const v = ih(i, 1, seed); sS[i] = v < 0.05 ? 0.5 : v < 0.13 ? 0.28 : v < 0.2 ? 0.14 : 0; sL[i] = 8 + ih(i, 2, seed) * ph * 0.9; }
  const d = P.d, PW = P.w;
  for (let j = 0; j < H; j++) {
    const Y = Y0 + j;
    const row = Math.floor(j / ph), py = j - row * ph;
    const off = o.stagger === false ? 0 : (row & 1) * Math.round(pw / 2);
    const ey = Math.min(py, ph - 1 - py), bottom = py > ph - 9 ? (py - (ph - 9)) / 9 : 0;
    let lastCol = -999, ps = 0, pr = paint, pb = 0;
    for (let i = 0; i < W; i++) {
      const X = X0 + i, idx = j * W + i;
      const u = i + off, col = (u / pw) | 0, px = u - col * pw;
      if (col !== lastCol) { lastCol = col; ps = ih(col, row, seed); pr = ps < 0.3 ? paint2 : paint; pb = (ps - 0.5) * 0.22; }
      let t = 2;
      if (py === 1 || px === 1) t = 3;
      else if (py >= ph - 3 || px === pw - 1) t = 1;
      const e = Math.min(ey, px, pw - 1 - px);
      const nb = nfB[idx], na = nfA[idx];
      // rust field
      let r = (e < 7 ? (1 - e / 7) * 0.42 : 0) * (0.5 + nb) + bottom * 0.35 * nb;
      r += na > 0.56 ? (na - 0.56) * 3.2 * ra : 0;
      const sc = (u + 3 * row) % span;
      const ss = sS[sc];
      if (ss > 0 && py < sL[sc]) r += ss * (1 - py / sL[sc]) * (0.6 + nb * 0.6);
      r += pb + (ra - 0.45) * 0.4;
      let c;
      if (r > 0.86) c = rust[ih(X, Y, seed) < 0.35 ? 0 : 1];
      else if (r > 0.72) c = rust[ih(X, Y, seed + 1) < 0.25 ? 2 : 1];
      else if (r > 0.64) c = nb > 0.6 ? primer : rust[2];
      else if (r > 0.56) c = pr[t > 0 ? t - 1 : 0];
      else c = pr[t];
      // tiny paint chips showing bright metal
      if (r < 0.56 && nb > 0.74 && ih(X >> 1, Y >> 1, seed + 5) < 0.3) c = pr[4];
      if (py === 0 || px === 0) c = seam;
      if (gH && j > H - gH && grime) {
        const g = (j - (H - gH)) / gH;
        if (BY(X, Y) < g * 0.9 + nb * 0.3 - 0.15) c = grime[g > 0.6 ? 0 : 1];
      }
      d[Y * PW + X] = c;
    }
  }
  // rivets along seams (top + bottom rows of each plate, both vertical edges)
  if (o.rivets !== false) {
    for (let row = 0; row * ph < H; row++) {
      const off = o.stagger === false ? 0 : (row & 1) * Math.round(pw / 2);
      const y1 = Y0 + row * ph + 4, y2 = Y0 + row * ph + ph - 5;
      for (let X = X0 + 6 - (off % 8); X < X0 + W - 2; X += 8) {
        if (X < X0) continue;
        if (y1 < Y0 + H - 1) rivet(P, X, y1, rv);
        if (y2 < Y0 + H - 1 && y2 > Y0) rivet(P, X, y2, rv);
      }
      for (let col = -1; col * pw < W + pw; col++) {
        const Xa = X0 + col * pw - off + 4, Xb = X0 + col * pw - off + pw - 5;
        for (let y = Y0 + row * ph + 12; y < Y0 + row * ph + ph - 8 && y < Y0 + H - 2; y += 8) {
          if (Xa >= X0 && Xa < X0 + W - 2) rivet(P, Xa, y, rv);
          if (Xb >= X0 && Xb < X0 + W - 2) rivet(P, Xb, y, rv);
        }
      }
    }
  }
  // rust tears running from a few rivets
  if (o.drips !== false) {
    const rr = rng(seed + 77);
    const n = Math.round((W * H) / 2200);
    for (let k = 0; k < n; k++) {
      const row = Math.floor(rr() * (H / ph)), x = X0 + Math.floor(rr() * W), y = Y0 + row * ph + 6;
      const L = 5 + Math.floor(rr() * 20);
      for (let q = 0; q < L; q++) { const yy = y + q; if (yy >= Y0 + H) break; P.seti(x, yy, q < L * 0.5 ? rust[1] : rust[2]); if (q < L * 0.3) P.seti(x + 1, yy, rust[2]); }
    }
  }
}

// horizontal (or vertical) wood planks with grain, knots, nails and gaps.
// o: { dir: 'h'|'v', pw (plank width px), r (ramp), seed, gap (colour), nails, worn, lenMin, lenMax }
const SIN_T = new Float32Array(1024);
for (let i = 0; i < 1024; i++) SIN_T[i] = Math.sin((i / 1024) * TAU);
const fsin = (a) => SIN_T[((Math.round(a * 162.97) % 1024) + 1024) % 1024];
export function woodPlanks(P, X0, Y0, W, H, o = {}) {
  const r = o.r || PAL.wood, seed = o.seed ?? 5, pw = o.pw ?? 9, vert = o.dir === 'v';
  const gap = o.gap ?? PAL.ink2;
  const nf = noiseField(W, H, 1 / 20, seed, 2, 4, X0, Y0);
  const along = vert ? H : W, across = vert ? W : H;
  const PWd = P.w, d = P.d, nail = o.nail ?? PAL.steel[3];
  const segMin = o.lenMin ?? 70, segMax = o.lenMax ?? 160;
  for (let a = 0; a < across; a++) {
    const pl = Math.floor(a / pw), pa = a - pl * pw;
    const ps = ih(pl, 0, seed);
    const tb = ps < 0.25 ? -1 : ps > 0.8 ? 1 : 0; // plank tone bias
    const segL = segMin + Math.floor(ih(pl, 1, seed) * (segMax - segMin));
    const segOff = Math.floor(ih(pl, 2, seed) * segL);
    let lastSeg = -1, ss = 0;
    for (let b = 0; b < along; b++) {
      const i = vert ? a : b, j = vert ? b : a;
      const X = X0 + i, Y = Y0 + j;
      if (X < 0 || Y < 0 || X >= PWd || Y >= P.h) continue;
      const sb = b + segOff, seg = (sb / segL) | 0, sp = sb - seg * segL;
      if (seg !== lastSeg) { lastSeg = seg; ss = ih(pl, seg + 7, seed); }
      const n = nf[j * W + i];
      // grain: wavy lines along the plank
      const gw = fsin(b * 0.045 + ss * 20 + fsin(b * 0.11 + ss * 9) * 1.4) * 2.2 + pa;
      const g = Math.floor(gw * 0.9 + ss * 4) % 3;
      let t = 2 + tb + (ss < 0.3 ? -1 : 0);
      if (g === 0 && ih(X, Y, seed) < 0.55) t -= 1;
      if (n > 0.66) t -= 1;
      if (pa === 1) t += 1;
      if (pa === pw - 1) t = 0;
      let c = r[t < 0 ? 0 : t > 4 ? 4 : t];
      if (pa === 0 || sp === 0) c = gap;
      else if (sp === 1) c = r[Math.max(0, Math.min(4, t - 1))];
      // nails near plank ends
      if (o.nails !== false && (sp === 3 || sp === segL - 4) && (pa === 2 || pa === pw - 3)) c = nail;
      d[Y * PWd + X] = c;
    }
  }
  // knots
  const kr = rng(seed + 31), nk = Math.round((W * H) / 2400);
  for (let k = 0; k < nk; k++) {
    const x = X0 + Math.floor(kr() * W), y = Y0 + Math.floor(kr() * H);
    const rx = vert ? 1.4 : 2.6, ry = vert ? 2.6 : 1.4;
    P.ell(x, y, rx + 1, ry + 1, (xx, yy, nx, ny, q, c) => (c === gap ? undefined : q > 0.55 ? r[1] : r[0]));
    P.seti(x, y, r[3]);
  }
}

// grid of square tiles with grout. painter(P, x, y, s, i, j) draws the tile face
export function tiles(P, X0, Y0, W, H, s, grout, painter, o = {}) {
  for (let j = 0; j * s < H; j++) for (let i = 0; i * s < W; i++) {
    const x = X0 + i * s + (o.stagger && (j & 1) ? -s / 2 : 0), y = Y0 + j * s;
    painter(P, x + 1, y + 1, s - 1, i, j);
    P.rect(x, y, s, 1, grout); P.rect(x, y, 1, s, grout);
  }
}
// talavera tile face: cream glaze with blue/yellow motif (4 variants)
export function talavera(P, x, y, s, i, j, o = {}) {
  const base = o.base || C('#e6d8b8'), base2 = o.base2 || C('#d8c8a4'), blu = o.blue || C('#2a4aa0'), blu2 = o.blue2 || C('#5a7ad0'), yel = o.yel || C('#d8a030'), grn = o.grn || C('#3a8a5a');
  const v = o.v ?? ((i + j) & 1 ? 1 : 0) + ((j & 1) ? 2 : 0);
  P.rect(x, y, s, s, base);
  P.rect(x, y + s - 1, s, 1, base2); P.rect(x + s - 1, y, 1, s, base2);
  const cx = x + (s - 1) / 2, cy = y + (s - 1) / 2, R0 = s / 2;
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    const dx = xx - (s - 1) / 2, dy = yy - (s - 1) / 2, ad = Math.abs(dx) + Math.abs(dy), r = Math.hypot(dx, dy);
    let c = 0;
    if (v === 0) { if (ad <= R0 * 0.55 && ad >= R0 * 0.3) c = blu; else if (ad < R0 * 0.3) c = yel; else if (r > R0 * 0.95 && (Math.abs(dx) < 1 || Math.abs(dy) < 1)) c = blu2; }
    else if (v === 1) { if (r < R0 * 0.28) c = yel; else if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.8 && r < R0 * 0.9) c = blu; else if ((Math.abs(dx) > R0 - 1.6 && Math.abs(dy) > R0 - 1.6)) c = blu2; }
    else if (v === 2) { const a = Math.atan2(dy, dx); const pet = Math.abs(Math.cos(a * 2)); if (r < R0 * (0.35 + pet * 0.5) && r > R0 * 0.2) c = blu; else if (r <= R0 * 0.2) c = yel; else if (r > R0 * 0.92 && r < R0 * 1.1 && (Math.abs(dx) < 1 || Math.abs(dy) < 1)) c = grn; }
    else { if (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8) c = r < R0 * 0.75 ? blu : 0; if (r < R0 * 0.3) c = yel; if (Math.abs(r - R0 * 0.7) < 0.6) c = blu2; }
    if (c) P.seti(x + xx, y + yy, c);
  }
}

// grating (rows of slots) for catwalk faces / vents
export function grating(P, x, y, w, h, frame, hole, o = {}) {
  P.rect(x, y, w, h, frame);
  const sx = o.sx ?? 3, sy = o.sy ?? 3, hw = o.hw ?? 2, hhh = o.hh ?? 1;
  for (let j = 1; j + hhh < h; j += sy) for (let i = 1 + ((o.stagger && (j / sy) & 1) ? 1 : 0); i + hw < w; i += sx) P.rect(x + i, y + j, hw, hhh, hole);
}
// chain-link fence mesh (transparent holes). posts every `post` px
export function chainLink(P, X0, Y0, W, H, o = {}) {
  const wire = o.wire || C('#5a6670'), wire2 = o.wire2 || C('#3a444c'), s = o.s ?? 6, seed = o.seed || 4;
  const nf = noiseField(W, H, 1 / 30, seed, 2, 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = X0 + i, Y = Y0 + j;
    const a = ((X + Y) % s + s) % s, b = ((X - Y) % s + s) % s;
    if (a !== 0 && b !== 0) continue;
    // holes torn in the mesh
    if (o.tears && nf[j * W + i] > 0.74 && j > 4) continue;
    P.d[Y * P.w + X] = a === 0 ? wire : wire2;
  }
}
// kelp blade (static); returns nothing. sway = horizontal offset fn(t along 0..1)
export function kelp(P, x, y, h, r, o = {}) {
  const seed = o.seed || 1, sw = o.sway || 0, w0 = o.w ?? 3;
  let px = x;
  for (let j = 0; j < h; j++) {
    const t = j / h;
    const cx = Math.round(x + Math.sin(t * 3.1 + seed) * 2.5 * t + sw * t * t);
    const w = Math.max(1, Math.round(w0 * (1 - t * 0.6)));
    for (let i = 0; i < w; i++) P.seti(cx + i, y - j, i === 0 ? r[3] : i === w - 1 ? r[1] : r[2]);
    // leaves
    if (j > 4 && (j + seed * 3) % 9 === 0) {
      const dir = ((j / 9) | 0) % 2 ? 1 : -1, L = 3 + Math.round((1 - t) * 4);
      for (let k = 1; k <= L; k++) P.seti(cx + (dir > 0 ? w - 1 + k : -k), y - j + Math.round(k * 0.6), k === L ? r[1] : r[3]);
      for (let k = 1; k < L; k++) P.seti(cx + (dir > 0 ? w - 1 + k : -k), y - j + Math.round(k * 0.6) + 1, r[2]);
    }
    px = cx;
  }
  return px;
}
// papel picado flag sprite (cut paper with holes and zigzag bottom)
export function papelFlag(w, h, col, seed = 1) {
  const P = new Pix(w, h + 1);
  const light = lightU(col, 0.25), dark = darkU(col, 0.25);
  const v = seed % 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // zigzag bottom edge
    if (y > h - 3 && ((x + (y - (h - 3))) % 3 === 0 || y === h - 1 && x % 3 !== 1)) continue;
    const cx = x - (w - 1) / 2, cy = y - h * 0.45;
    let hole = false;
    if (v === 0) hole = Math.abs(Math.hypot(cx, cy) - w * 0.25) < 0.7 || (Math.abs(cx) < 0.6 && Math.abs(cy) < 1.6);
    else if (v === 1) hole = (Math.abs(cx) + Math.abs(cy) < w * 0.28 && Math.abs(cx) + Math.abs(cy) > w * 0.12) || (y === 2 && x % 2 === 0);
    else if (v === 2) hole = ((x % 3 === 1 && y % 3 === 1) && Math.hypot(cx, cy) < w * 0.42) || (Math.hypot(cx, cy) < 1);
    else hole = (Math.abs(cx) < 0.6 || Math.abs(cy) < 0.6) && Math.hypot(cx, cy) < w * 0.35 && Math.hypot(cx, cy) > 1.2;
    if (hole) continue;
    P.d[y * w + x] = y === 0 ? dark : (x === 0 ? light : col);
  }
  return P;
}
// lotería card: white card, red frame, number + a tiny emblem + title
export function loteria(P, x, y, w, h, kind, num) {
  const ink = C('#1a1418'), paper = C('#efe4c8'), paper2 = C('#d8c8a0'), red = C('#b8302a');
  P.rect(x, y, w, h, paper); P.rect(x, y + h - 1, w, 1, paper2); P.rect(x + w - 1, y, 1, h, paper2);
  P.rect(x + 1, y + 1, w - 2, 1, red); P.rect(x + 1, y + h - 8, w - 2, 1, red); P.rect(x + 1, y + 1, 1, h - 8, red); P.rect(x + w - 2, y + 1, 1, h - 8, red);
  text(P, String(num), x + 3, y + 3, ink, { font: 3 });
  const cx = x + Math.floor(w / 2), cy = y + Math.floor((h - 6) / 2) + 2;
  const E = EMBLEMS[kind] || EMBLEMS.corazon;
  E(P, cx, cy, Math.min(w, h) * 0.32);
  // title squiggle (illegible tiny text)
  for (let i = 3; i < w - 3; i++) if (hh(i, num, 3) < 0.7) P.seti(x + i, y + h - 4, ink);
  P.seti(x, y, 0); P.seti(x + w - 1, y, 0);
}
const EMBLEMS = {
  corazon(P, cx, cy, s) { P.ell(cx - s * 0.35, cy - s * 0.2, s * 0.45, s * 0.45, C('#c8202a')); P.ell(cx + s * 0.35, cy - s * 0.2, s * 0.45, s * 0.45, C('#c8202a')); P.poly([cx - s * 0.8, cy, cx + s * 0.8, cy, cx, cy + s * 0.9], C('#c8202a')); P.seti(cx - Math.round(s * 0.4), cy - Math.round(s * 0.4), C('#ff9a9a')); },
  luna(P, cx, cy, s) { P.disc(cx, cy, s * 0.8, C('#e8c040')); P.disc(cx + s * 0.35, cy - s * 0.2, s * 0.7, C('#efe4c8')); P.seti(cx - Math.round(s * 0.3), cy, C('#1a1418')); },
  sol(P, cx, cy, s) { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.line(cx, cy, cx + Math.cos(a) * s, cy + Math.sin(a) * s, C('#e88a20')); } P.disc(cx, cy, s * 0.55, C('#f0c030')); P.seti(cx - 1, cy - 1, C('#1a1418')); P.seti(cx + 1, cy - 1, C('#1a1418')); },
  nopal(P, cx, cy, s) { const g = C('#3a8a3a'), g2 = C('#2a6a2a'); P.ell(cx, cy + s * 0.3, s * 0.4, s * 0.6, g); P.ell(cx - s * 0.55, cy - s * 0.25, s * 0.3, s * 0.42, g); P.ell(cx + s * 0.5, cy - s * 0.4, s * 0.28, s * 0.4, g2); P.seti(cx, cy - Math.round(s * 0.1), C('#d83040')); P.seti(cx - 1, cy + 2, C('#efe4c8')); },
  estrella(P, cx, cy, s) { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.42 : s; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } P.poly(pts, C('#e8b030')); },
  camaron(P, cx, cy, s) { const o = C('#e8603a'); for (let k = 0; k < 6; k++) { const a = Math.PI * 0.2 + k * 0.42; P.disc(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55 - s * 0.2, s * 0.32 - k * 0.2, o); } P.seti(cx + Math.round(s * 0.5), cy - Math.round(s * 0.5), C('#1a1418')); P.line(cx + s * 0.6, cy - s * 0.6, cx + s * 1.1, cy - s * 1.0, o); },
  sirena(P, cx, cy, s) { P.disc(cx, cy - s * 0.6, s * 0.3, C('#e8b090')); P.poly([cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy - s * 0.3, cx + s * 0.1, cy + s * 0.8, cx - s * 0.1, cy + s * 0.8], C('#2a9a8a')); P.poly([cx - s * 0.5, cy + s * 0.9, cx + s * 0.5, cy + s * 0.9, cx, cy + s * 0.6], C('#2a9a8a')); P.rect(cx - s * 0.4, cy - s * 0.95, s * 0.8, 2, C('#c83a20')); },
  calavera(P, cx, cy, s) { P.ell(cx, cy - s * 0.15, s * 0.7, s * 0.65, C('#f5f0e0')); P.rect(cx - s * 0.35, cy + s * 0.35, s * 0.7, s * 0.35, C('#f5f0e0')); P.disc(cx - s * 0.3, cy - s * 0.15, s * 0.2, C('#1a1418')); P.disc(cx + s * 0.3, cy - s * 0.15, s * 0.2, C('#1a1418')); P.seti(cx, cy + Math.round(s * 0.15), C('#1a1418')); P.seti(cx - 2, cy - Math.round(s * 0.7), C('#e8402a')); P.seti(cx + 2, cy - Math.round(s * 0.7), C('#3a8ae0')); },
  gallo(P, cx, cy, s) { P.ell(cx, cy + s * 0.1, s * 0.6, s * 0.5, C('#c8502a')); P.disc(cx + s * 0.5, cy - s * 0.45, s * 0.28, C('#c8502a')); P.rect(cx + s * 0.4, cy - s * 0.85, 3, 2, C('#e02020')); P.poly([cx - s * 0.5, cy - s * 0.2, cx - s, cy - s * 0.7, cx - s * 0.7, cy + s * 0.3], C('#2a6a4a')); P.vl(cx, cy + s * 0.5, cy + s * 0.9, C('#d8a030')); },
};
export const EMBLEM_KEYS = Object.keys(EMBLEMS);

// luchador poster: colour background, mask emblem, title text
export function luchaPoster(P, x, y, w, h, o = {}) {
  const bg = o.bg || C('#c8302a'), bg2 = o.bg2 || darkU(bg, 0.3), m1 = o.mask || C('#f0c33c'), m2 = o.mask2 || C('#2a4ab0'), ink = C('#1a1418'), paper = C('#efe4c8');
  P.rect(x, y, w, h, bg);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((i + j) >> 2) % 2 === 0 && j > h * 0.45) P.seti(x + i, y + j, bg2);
  // sunburst rays behind the mask
  const cx = x + w / 2, cy = y + h * 0.42;
  for (let j = 0; j < h * 0.75; j++) for (let i = 0; i < w; i++) { const a = Math.atan2(y + j - cy, x + i - cx); if (Math.floor((a + 4) * 3.2) % 2 === 0) P.seti(x + i, y + j, mixU(bg, m1, 0.3)); }
  // mask
  const r = Math.min(w, h) * 0.3;
  P.ell(cx, cy, r * 0.85, r, m1);
  P.ell(cx - r * 0.38, cy - r * 0.05, r * 0.3, r * 0.2, paper); P.ell(cx + r * 0.38, cy - r * 0.05, r * 0.3, r * 0.2, paper);
  P.seti(cx - r * 0.3, cy - r * 0.05, ink); P.seti(cx + r * 0.45, cy - r * 0.05, ink);
  P.poly([cx, cy - r * 0.95, cx - r * 0.3, cy - r * 0.2, cx, cy + r * 0.1, cx + r * 0.3, cy - r * 0.2], m2);
  P.rect(cx - r * 0.3, cy + r * 0.5, r * 0.6, 1, ink);
  // text bands
  P.rect(x, y + h - 13, w, 9, ink);
  text(P, o.title || 'LUCHA', cx, y + h - 11, paper, { font: 3, align: 'center' });
  if (o.sub) text(P, o.sub, cx, y + 2, paper, { font: 3, align: 'center' });
  // torn corner + tape
  P.poly([x + w - 6, y + h, x + w, y + h, x + w, y + h - 7], 0);
  P.rect(x + 1, y - 1, 5, 3, C('#c8c0a0')); P.rect(x + w - 6, y - 1, 5, 3, C('#c8c0a0'));
}

// ------------------------------------------------------------------ perspective floor
// Bakes a floor band: rows from the back edge (y = backY world, scale pBack) to the front edge
// (frontY world, scale pFront); every row has a scale/parallax p linear in screen y. Texture
// coordinates (u along x, v into depth) are projected so seams converge on x = 0 and the floor
// shears correctly when drawn with per-row parallax.  tex(u, v, du, dv, X, Y, p) -> colour.
export class PerspFloor {
  constructor(x0, x1, backY, frontY, pBack, pFront, K, tex) {
    this.X0 = AX(x0); this.W = AX(x1) - this.X0;
    this.Y0 = AY(backY); this.H = AY(frontY) - this.Y0;
    this.pBack = pBack; this.pFront = pFront;
    this.P = new Pix(this.W, this.H);
    this.rows = new Float32Array(this.H);
    const Y0abs = this.Y0, yZero = -Y0abs; // row index of world y = 0
    for (let j = 0; j < this.H; j++) {
      const Y = Y0abs + j;
      this.rows[j] = Y < 0 ? 1 - (1 - pBack) * (Y / Y0abs) : 1 + (pFront - 1) * (Y / Math.max(1, this.H - yZero));
    }
    if (tex) this.paint(K, tex);
  }
  paint(K, tex) {
    const P = this.P, W = this.W;
    for (let j = 0; j < this.H; j++) {
      const p = this.rows[j], pn = this.rows[Math.min(this.H - 1, j + 1)];
      const v = K / p, vn = K / pn;
      for (let i = 0; i < W; i++) {
        const X = this.X0 + i;
        const u = X / p, du = 1 / p;
        const c = tex(u, v, du, v - vn, X, this.Y0 + j, p, j);
        if (c !== undefined) P.d[j * W + i] = c;
      }
    }
  }
  finish() { this.cv = this.P.canvas(); return this; }
  // per-row parallax draw (rows grouped in bands of similar p)
  draw(d) {
    if (!this.cv) this.finish();
    const g = d.g, cv = this.cv;
    let j = 0;
    while (j < this.H) {
      const p = this.rows[j];
      let k = j + 1;
      while (k < this.H && Math.abs(Math.round(d.camAX * (1 - this.rows[k])) - Math.round(d.camAX * (1 - p))) < 1 && k - j < 24) k++;
      const dy = this.Y0 + j - d.ay;
      const h = k - j;
      if (dy + h > 0 && dy < d.vh) {
        let dx = Math.round(this.X0 + d.camAX * (1 - p)) - d.ax, sx = 0, w = this.W;
        if (dx < 0) { sx = -dx; w += dx; dx = 0; }
        if (dx + w > d.vw) w = d.vw - dx;
        if (w > 0) g.drawImage(cv, sx, j, w, h, dx, dy, w, h);
      }
      j = k;
    }
  }
  // parallax of the row at world y (for objects standing at that depth)
  pAt(y) { const j = clamp(AY(y) - this.Y0, 0, this.H - 1); return this.rows[j]; }
  // generic band (e.g. a ceiling): rows from world yTop (scale pTop) to yBot (scale pBot), linear
  static band(x0, x1, yTop, yBot, pTop, pBot, K, tex) {
    const F = Object.create(PerspFloor.prototype);
    F.X0 = AX(x0); F.W = AX(x1) - F.X0; F.Y0 = AY(yTop); F.H = AY(yBot) - F.Y0;
    F.P = new Pix(F.W, F.H); F.rows = new Float32Array(F.H);
    for (let j = 0; j < F.H; j++) F.rows[j] = pTop + (pBot - pTop) * (j / Math.max(1, F.H - 1));
    if (tex) F.paint(K, tex);
    return F;
  }
}

// ------------------------------------------------------------------ layers
export class Layer {
  constructor(pix, X, Y, px = 1, py = 1) { this.cv = pix instanceof Pix ? pix.canvas() : pix; this.X = X; this.Y = Y; this.px = px; this.py = py; }
  draw(d, ox = 0, oy = 0) { d.layer(this.cv, this.X + ox, this.Y + oy - AY(PIV_Y) * (1 - this.py), this.px, this.py); }
}
// buffer coords for a world point seen through parallax (px, py) (vertical pivot PIV_Y)
export function pbx(d, x, p = 1) { return Math.round(x * PPU + d.camAX * (1 - p)) - d.ax; }
export function pby(d, y, p = 1) { return Math.round(-y * PPU + (d.camAY - AY(PIV_Y)) * (1 - p)) - d.ay; }
// draw a canvas with anchor at abs art (X, Y) with parallax
export function drawAt(d, cv, X, Y, px = 1, py = 1, flip = false) {
  const dx = Math.round(X + d.camAX * (1 - px)) - d.ax, dy = Math.round(Y + (d.camAY - AY(PIV_Y)) * (1 - py)) - d.ay;
  if (dx > d.vw || dy > d.vh || dx + cv.width < 0 || dy + cv.height < 0) return;
  if (!flip) { d.g.drawImage(cv, dx, dy); return; }
  d.g.save(); d.g.translate(dx + cv.width, dy); d.g.scale(-1, 1); d.g.drawImage(cv, 0, 0); d.g.restore();
}
// fill a buffer rect in a flat colour (css)
export function fillB(d, css, x, y, w, h) { d.g.fillStyle = css; d.g.fillRect(x, y, w, h); }

// ------------------------------------------------------------------ dithered light cone sprites
// cone from apex (top centre) pointing down rotated by ang; widths w0 (apex) -> w1 (end) px over len px.
// levels: [outer, inner] dither amounts; pool: floor ellipse at the end
export function coneSprite(len, w0, w1, ang, col, levels = [0.19, 0.38], o = {}) {
  const pad = Math.ceil(Math.abs(Math.sin(ang)) * len) + w1 + 4;
  const W = pad * 2, H = len + 8;
  const P = new Pix(W, H);
  const ax = W / 2, ay = 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  const fade = o.fade ?? 0.7;
  for (let y = 0; y < H; y++) {
    const xc = ax + Math.tan(ang) * y, hwMax = w0 / 2 + (w1 - w0) / 2 * Math.min(1, y / len) + 3;
    for (let x = Math.max(0, Math.floor(xc - hwMax / Math.max(0.5, c))); x < Math.min(W, Math.ceil(xc + hwMax / Math.max(0.5, c))); x++) {
    const dx = x + 0.5 - ax, dy = y + 0.5 - ay;
    const u = dx * s + dy * c, v = dx * c - dy * s; // u along axis (down), v across
    if (u < 0 || u > len) continue;
    if (o.floorY !== undefined && y > o.floorY) continue;
    const t = u / len, hw = w0 / 2 + (w1 - w0) / 2 * t;
    const av = Math.abs(v);
    if (av > hw) continue;
    let a = av < hw * 0.5 ? levels[1] : levels[0];
    if (t > fade) a *= 1 - (t - fade) / (1 - fade) * 0.75;
    if (t < 0.08) a = levels[1] * 1.2;
    if (BY(x, y) < a) P.d[y * W + x] = col;
    }
  }
  if (o.floorY !== undefined) {
    // light pool on the floor
    const fx = ax + Math.tan(ang) * o.floorY, rw = w0 / 2 + (w1 - w0) / 2 * Math.min(1, o.floorY / len);
    for (let y = o.floorY - 3; y <= o.floorY + 5; y++) for (let x = Math.floor(fx - rw - 6); x <= fx + rw + 6; x++) {
      const nx = (x - fx) / (rw + 6), ny = (y - o.floorY - 1) / 4;
      const q = nx * nx + ny * ny;
      if (q > 1 || x < 0 || x >= W || y < 0 || y >= H) continue;
      if (BY(x, y) < (q < 0.4 ? levels[1] * 1.3 : levels[0])) P.d[y * W + x] = col;
    }
  }
  P.ax = Math.round(ax); P.ay = ay;
  return P;
}

// ================================================================== ambient: snow, bubbles, fish
const BUB_RING = C('#8fd0d8'), BUB_DARK = C('#4f97a8'), BUB_HI = C('#f4ffff'), BUB_FILL = C('#2f7f90');
function bubbleSprite(r) {
  const s = r * 2 + 1, P = new Pix(s, s);
  if (r <= 0) { P.d[0] = BUB_RING; return P; }
  if (r === 1) { P.set(1, 0, BUB_RING); P.set(0, 1, BUB_RING); P.set(2, 1, BUB_DARK); P.set(1, 2, BUB_DARK); P.set(1, 1, 0); P.set(0, 0, 0); P.set(0, 1, BUB_HI); return P; }
  P.ring(r + 0.5, r + 0.5, r - 0.6, r + 0.5, (x, y, nx, ny) => (nx + ny > 0.35 ? BUB_DARK : BUB_RING));
  if (r >= 3) P.ell(r + 0.5, r + 0.5, r - 0.6, r - 0.6, (x, y, nx, ny, q) => (q > 0.55 && nx + ny > 0.5 && BY(x, y) < 0.5 ? BUB_FILL : undefined));
  P.set(r - Math.round(r * 0.45), r - Math.round(r * 0.45), BUB_HI);
  if (r >= 3) P.set(r - Math.round(r * 0.45) + 1, r - Math.round(r * 0.45), BUB_HI);
  return P;
}
let BUBS = null;
export function bubbleCanvases() { if (!BUBS) BUBS = [0, 1, 2, 3, 4, 5].map((r) => bubbleSprite(r).canvas()); return BUBS; }

// marine snow: tiled per depth band so it's never empty and costs nothing
export class Snow {
  constructor(o = {}) {
    this.S = o.tile || 384;
    this.bands = (o.bands || [
      { p: 0.35, n: 26, col: '#2f6a72', sz: 1, sp: 6 },
      { p: 0.65, n: 22, col: '#4f8f92', sz: 1, sp: 9 },
      { p: 0.95, n: 14, col: '#7fb8b4', sz: 1, sp: 13 },
    ]).map((b, k) => {
      const r = rng((o.seed || 7) + k * 13);
      const pts = [];
      for (let i = 0; i < b.n; i++) pts.push({ x: r() * this.S, y: r() * this.S, ph: r() * 6.28, f: 0.4 + r() * 0.8, big: r() < (b.big ?? 0.15) });
      return { ...b, pts };
    });
    this.dark = 0;
  }
  draw(d, t, which = 'back') {
    const g = d.g, S = this.S;
    for (const b of this.bands) {
      if ((which === 'front') !== (b.p > 1)) continue;
      g.fillStyle = b.col;
      const ox = d.camAX * b.p, oy = (d.camAY - AY(PIV_Y)) * b.p * 0.6;
      for (const q of b.pts) {
        if (this.dark > 0.5 && q.big) continue;
        const X = q.x + Math.round(Math.sin(t * q.f + q.ph) * 2.2) - ox - d.ax + 4096 * S;
        const Y = q.y + t * b.sp - oy - d.ay + 4096 * S;
        let bx = X % S, by = Y % S;
        for (let yy = by - S; yy < d.vh; yy += S) {
          if (yy < -2) continue;
          for (let xx = bx - S; xx < d.vw; xx += S) { if (xx < -2) continue; const sz = q.big ? b.sz + 1 : b.sz; g.fillRect(Math.round(xx), Math.round(yy), sz, sz); }
        }
      }
    }
  }
}

// world-space rising bubbles (with parallax per bubble)
export class Bubbles {
  constructor() { this.list = []; this.em = []; this.cv = bubbleCanvases(); }
  add(x, y, o = {}) {
    if (this.list.length > 600) return;
    this.list.push({ x, y, vy: o.vy ?? (0.9 + Math.random() * 0.9), vx: o.vx ?? 0, r: o.r ?? (Math.random() < 0.6 ? 1 : Math.random() < 0.7 ? 2 : 3), ph: Math.random() * 6.28, w: o.w ?? (0.6 + Math.random()), p: o.p ?? 1, top: o.top ?? 14, life: o.life ?? 99, amp: o.amp ?? 1.5 });
  }
  burst(x, y, n, spread = 0.6, o = {}) { for (let i = 0; i < n; i++) this.add(x + (Math.random() - 0.5) * spread * 2, y + (Math.random() - 0.5) * spread, { vy: 1 + Math.random() * 2.2, vx: (Math.random() - 0.5) * 1.2, r: Math.random() < 0.4 ? 1 : Math.random() < 0.6 ? 2 : Math.random() < 0.7 ? 3 : 4, ...o }); }
  emitter(x, y, rate, o = {}) { const e = { x, y, rate, acc: Math.random(), o, on: true }; this.em.push(e); return e; }
  update(dt) {
    for (const e of this.em) {
      if (!e.on) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) { e.acc -= 1; this.add(e.x + (Math.random() - 0.5) * (e.o.spread || 0.1), e.y, { p: e.o.p, r: e.o.r ?? (Math.random() < 0.7 ? 0 : 1), vy: e.o.vy, top: e.o.top, amp: e.o.amp }); }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.y += b.vy * dt; b.x += b.vx * dt; b.vx *= 1 - dt * 1.5; b.life -= dt;
      if (b.y > b.top || b.life <= 0) this.list.splice(i, 1);
    }
  }
  draw(d, t, pmin = -1, pmax = 9) {
    const g = d.g;
    for (const b of this.list) {
      if (b.p < pmin || b.p > pmax) continue;
      const cv = this.cv[Math.min(5, b.r)];
      const x = pbx(d, b.x, b.p) + Math.round(Math.sin(t * 5 * b.w + b.ph) * b.amp) - (cv.width >> 1), y = pby(d, b.y, b.p) - (cv.height >> 1);
      if (x < -8 || y < -8 || x > d.vw || y > d.vh) continue;
      g.drawImage(cv, x, y);
    }
  }
}

// distant fish silhouettes
function fishSprite(kind, col, belly, frame) {
  const P = new Pix(34, 16);
  const f = frame ? 1 : 0;
  if (kind === 'small') { P.ell(6, 3, 4.5, 2.2, col); P.poly([1.5, 3, -1 + 0, 0.5 - f, -1, 5.5 + f], col); P.hl(4, 8, 4, belly); P.set(9, 2, 0); }
  else if (kind === 'mid') { P.ell(10, 5, 8, 3.6, col); P.poly([3, 5, -0.5, 1 - f, -0.5, 9 + f], col); P.poly([8, 1.5, 12, -1, 13, 2], col); P.hl(6, 14, 7, belly); P.set(15, 4, 0); }
  else if (kind === 'big') { P.ell(15, 7, 12, 5.5, col); P.poly([4, 7, -0.5, 1 - f, -0.5, 13 + f], col); P.poly([11, 2, 18, -0.5, 20, 3], col); P.poly([14, 12, 17, 15, 19, 11], col); P.hl(8, 22, 10, belly); P.set(23, 5, 0); P.hl(24, 26, 9, belly); }
  else if (kind === 'eel') { for (let i = 0; i < 30; i++) { const y = 5 + Math.round(Math.sin(i * 0.4 + f * 1.6) * 2); P.rect(i, y, 1, i > 26 ? 1 : 2, col); } P.set(28, 4, 0); }
  else if (kind === 'ray') { P.poly([2, 6, 14, 1 - f, 22, 5, 14, 10 + f], col); P.poly([22, 5, 33, 6, 22, 6], col); P.hl(8, 16, 6, belly); }
  else if (kind === 'jelly') { P.ell(5, 3, 4.5, 3.2, (x, y, nx, ny) => (ny > 0.3 ? undefined : col)); for (let k = 0; k < 4; k++) for (let j = 0; j < 6 + f; j++) P.set(2 + k * 2 + ((j + k + f) % 3 === 0 ? 1 : 0), 4 + j, belly); }
  return P.canvas();
}
export class FishLayer {
  constructor(o = {}) {
    const r = rng(o.seed || 11);
    this.fish = [];
    this.x0 = o.x0 ?? -20; this.x1 = o.x1 ?? 20;
    const kinds = o.kinds || ['small', 'small', 'small', 'mid', 'mid', 'big', 'eel', 'ray', 'jelly'];
    const cache = new Map();
    for (let i = 0; i < (o.count || 10); i++) {
      const p = r.range(o.p?.[0] ?? 0.2, o.p?.[1] ?? 0.45);
      const kind = r.pick(kinds);
      const col = o.col ? o.col(p) : '#0d3440', belly = o.belly ? o.belly(p) : '#14485a';
      const key = kind + col + belly;
      if (!cache.has(key)) cache.set(key, [fishSprite(kind, C(col), C(belly), 0), fishSprite(kind, C(col), C(belly), 1)]);
      const school = kind === 'small' && r() < 0.6 ? 3 + r.int(0, 4) : 1;
      for (let s = 0; s < school; s++) {
        this.fish.push({ fr: cache.get(key), kind, p, x: r.range(this.x0, this.x1) + s * 0.35, y: r.range(o.y0 ?? 8, o.y1 ?? 13) + (s % 3) * 0.18 - s * 0.06, v: (r() < 0.5 ? -1 : 1) * r.range(0.25, 0.7) * (kind === 'jelly' ? 0.15 : 1), ph: r() * 6, bob: r.range(0.05, 0.2) });
      }
      if (school > 1) { const last = this.fish.slice(-school); for (const f of last) f.v = last[0].v; }
    }
  }
  update(dt) {
    const span = this.x1 - this.x0;
    for (const f of this.fish) { f.x += f.v * dt; if (f.x > this.x1) f.x -= span; if (f.x < this.x0) f.x += span; }
  }
  draw(d, t) {
    for (const f of this.fish) {
      const cv = f.fr[Math.floor(t * (f.kind === 'jelly' ? 2 : 5) + f.ph) & 1];
      const y = f.y + (f.kind === 'jelly' ? Math.sin(t * 0.8 + f.ph) * 0.3 : Math.sin(t * 0.7 + f.ph) * f.bob);
      const X = pbx(d, f.x, f.p), Y = pby(d, y, f.p * 0.8);
      if (X < -40 || X > d.vw + 40 || Y < -20 || Y > d.vh + 20) continue;
      if (f.v < 0 && f.kind !== 'jelly') { d.g.save(); d.g.translate(X + cv.width, Y); d.g.scale(-1, 1); d.g.drawImage(cv, 0, 0); d.g.restore(); }
      else d.g.drawImage(cv, X, Y);
    }
  }
}

// dithered light shafts from the surface (baked frames, slow shimmer by frame swap)
export function shaftLayer(W, H, X0, Y0, o = {}) {
  const frames = [];
  const r = rng(o.seed || 3);
  const shafts = [];
  for (let i = 0; i < (o.n || 7); i++) shafts.push({ x: r.range(0, W), w: r.range(30, 110), sl: r.range(0.25, 0.45) * (o.dir ?? 1), a: r.range(0.12, 0.3) * (o.amp ?? 1), ph: r() * 6 });
  for (let f = 0; f < (o.frames || 3); f++) {
    const P = new Pix(W, H);
    for (const s of shafts) {
      const a = s.a * (0.75 + 0.25 * Math.sin(f * 2.1 + s.ph));
      for (let y = 0; y < H; y++) {
        const t = y / H, fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        const cx = s.x + y * s.sl, hw = s.w / 2 * (0.6 + t * 0.6);
        for (let x = Math.max(0, Math.floor(cx - hw)); x < Math.min(W, cx + hw); x++) {
          const e = Math.abs(x - cx) / hw;
          const lv = (e < 0.45 ? a * 1.6 : a) * fade;
          if (BY(x, y) < lv && !P.d[y * W + x]) P.d[y * W + x] = o.col ?? C('#3a8a92');
        }
      }
    }
    frames.push(P.canvas());
  }
  return { frames, X: X0, Y: Y0 };
}

// ================================================================== debris / pixel FX
const DEB_GRAV = -7.5;
export class Debris {
  constructor() { this.list = []; this.sprites = null; }
  _spr() {
    if (this.sprites) return this.sprites;
    const S = {};
    // planks in 8 rotations, 3 tones
    S.plank = [PAL.woodL, PAL.wood, PAL.woodP].map((r) => {
      const b = new Pix(10, 3); b.rect(0, 0, 10, 3, r[2]); b.hl(0, 9, 0, r[3]); b.hl(0, 9, 2, r[1]); b.set(0, 1, r[0]); b.set(9, 1, r[0]); b.set(3, 1, r[1]); b.set(7, 0, r[4]);
      return Array.from({ length: 8 }, (_, k) => rotPix(b, (k * Math.PI) / 8).canvas());
    });
    S.splinter = [PAL.woodL, PAL.wood].map((r) => { const b = new Pix(5, 1); b.rect(0, 0, 5, 1, r[2]); b.set(0, 0, r[3]); return Array.from({ length: 8 }, (_, k) => rotPix(b, (k * Math.PI) / 8).canvas()); });
    const candyCol = ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a', '#c194ff', '#ff8a2a'];
    S.candy = candyCol.map((c) => { const b = new Pix(5, 3); const cc = C(c); b.rect(1, 0, 3, 3, cc); b.set(1, 0, lightU(cc, 0.5)); b.set(0, 0, lightU(cc, 0.6)); b.set(0, 2, lightU(cc, 0.6)); b.set(4, 0, lightU(cc, 0.6)); b.set(4, 2, lightU(cc, 0.6)); b.set(3, 2, darkU(cc, 0.3)); return b.canvas(); });
    S.note = ['#ff4fa0', '#4fe8d0', '#ffcf3a', '#c194ff'].map((c) => { const b = new Pix(6, 8); const cc = C(c), k = darkU(cc, 0.5); b.vl(3, 0, 5, cc); b.rect(1, 5, 3, 2, cc); b.set(0, 6, k); b.set(1, 7, k); b.set(2, 7, k); b.set(4, 1, cc); b.set(5, 2, cc); b.set(4, 0, cc); b.set(1, 5, lightU(cc, 0.5)); return b.canvas(); });
    S.note2 = ['#ff4fa0', '#4fe8d0', '#ffcf3a'].map((c) => { const b = new Pix(9, 8); const cc = C(c); b.vl(2, 0, 5, cc); b.vl(7, 0, 4, cc); b.hl(2, 7, 0, cc); b.hl(2, 7, 1, cc); b.rect(0, 5, 3, 2, cc); b.rect(5, 4, 3, 2, cc); return b.canvas(); });
    S.zz = [5, 3].map((f) => { const b = new Pix(8, 8); text(b, 'Z', 0, 0, C('#cfe8f0'), { font: f, outline: C('#1a3040') }); return b.canvas(); });
    S.star = [C('#fff8c0'), C('#ffffff')].map((c) => { const b = new Pix(5, 5); b.set(2, 0, c); b.set(2, 4, c); b.set(0, 2, c); b.set(4, 2, c); b.set(2, 2, c); b.set(1, 2, c); b.set(3, 2, c); b.set(2, 1, c); b.set(2, 3, c); return b.canvas(); });
    this.sprites = S;
    return S;
  }
  spawn(kind, x, y, o = {}) {
    if (this.list.length > 700) this.list.shift();
    const q = { kind, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, rot: o.rot ?? Math.random() * 8, vr: o.vr ?? (Math.random() - 0.5) * 20, life: o.life ?? 2.5, max: o.life ?? 2.5, col: o.col, v: o.v ?? Math.floor(Math.random() * 6), g: o.g ?? DEB_GRAV, drag: o.drag ?? 1.2, floor: o.floor ?? 0, rest: false, p: o.p ?? 1, bounce: o.bounce ?? 0.35, ph: Math.random() * 6 };
    this.list.push(q);
    return q;
  }
  burst(kind, x, y, n, sp = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = sp * (0.3 + Math.random() * 0.7);
      this.spawn(kind, x + (Math.random() - 0.5) * (o.spread ?? 0.3), y + (Math.random() - 0.5) * (o.spread ?? 0.3), { vx: Math.cos(a) * s * (o.sx ?? 1), vy: Math.sin(a) * s * 0.8 + (o.up ?? 2), ...o, life: (o.life ?? 2.5) * (0.6 + Math.random() * 0.6) });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      q.life -= dt;
      if (q.life <= 0) { this.list.splice(i, 1); continue; }
      if (q.rest) continue;
      q.vy += q.g * dt; const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= q.g > 0 ? k : Math.exp(-q.drag * 0.4 * dt);
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === 'confetti' || q.kind === 'papel') { q.vx += Math.sin(q.life * 6 + q.ph) * dt * 3; if (q.vy < -0.9) q.vy = -0.9; }
      if (q.g < 0 && q.y < q.floor) {
        q.y = q.floor;
        if (Math.abs(q.vy) > 1.2 && q.bounce > 0) { q.vy = -q.vy * q.bounce; q.vx *= 0.6; q.vr *= 0.5; }
        else { q.vy = 0; q.vx = 0; q.vr = 0; q.rest = true; if (q.kind === 'plank' || q.kind === 'splinter') q.rot = Math.round(q.rot / Math.PI) * Math.PI + (Math.random() < 0.3 ? 0.4 : 0); }
      }
    }
  }
  draw(d, t) {
    const S = this._spr(), g = d.g;
    for (const q of this.list) {
      if (q.life < 0.5 && Math.floor(q.life * 16) % 2 === 0) continue; // blink out
      const X = pbx(d, q.x, q.p), Y = pby(d, q.y, q.p);
      if (X < -16 || Y < -16 || X > d.vw + 16 || Y > d.vh + 16) continue;
      const ri = ((Math.round(q.rot / (Math.PI / 8)) % 8) + 8) % 8;
      switch (q.kind) {
        case 'plank': { const cv = S.plank[q.v % 3][ri]; g.drawImage(cv, X - (cv.width >> 1), Y - (cv.height >> 1) - (q.rest ? 1 : 0)); break; }
        case 'splinter': { const cv = S.splinter[q.v % 2][ri]; g.drawImage(cv, X - (cv.width >> 1), Y - (cv.height >> 1)); break; }
        case 'candy': { const cv = S.candy[q.v % S.candy.length]; g.drawImage(cv, X - 2, Y - 2); break; }
        case 'note': { const arr = q.v % 3 === 0 ? S.note2 : S.note; const cv = arr[q.v % arr.length]; g.drawImage(cv, X - 3 + Math.round(Math.sin(t * 4 + q.ph) * 2), Y - 4); break; }
        case 'zz': { const cv = S.zz[q.v % 2]; g.drawImage(cv, X + Math.round(Math.sin(t * 2 + q.ph) * 2), Y); break; }
        case 'star': { const cv = S.star[Math.floor(t * 10 + q.ph) & 1]; g.drawImage(cv, X - 2, Y - 2); break; }
        case 'confetti': case 'papel': {
          g.fillStyle = q.col || '#ff4f6a';
          const fl = Math.floor(t * 9 + q.ph) & 1;
          if (q.kind === 'papel') g.fillRect(X - 2, Y - 2, fl ? 4 : 2, fl ? 3 : 4);
          else g.fillRect(X, Y, fl ? 2 : 1, fl ? 1 : 2);
          break;
        }
        case 'glass': g.fillStyle = (Math.floor(t * 12 + q.ph) & 3) === 0 ? '#ffffff' : (q.col || '#9fe8c0'); g.fillRect(X, Y, q.v % 3 === 0 ? 2 : 1, 1); break;
        case 'spark': g.fillStyle = q.life > q.max * 0.5 ? '#fff6c0' : '#ffb040'; g.fillRect(X, Y, 1, 1); g.fillRect(X - Math.sign(q.vx), Y + Math.sign(q.vy), 1, 1); break;
        case 'silt': { const k = 1 - q.life / q.max, r = Math.round(2 + k * 6); g.fillStyle = q.col || '#5a6a5a'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + q.ph; if (k > 0.5 && i % 2) continue; g.fillRect(X + Math.round(Math.cos(a) * r), Y - Math.round(Math.abs(Math.sin(a)) * r * 0.6), 1, 1); } break; }
        case 'drop': g.fillStyle = q.col || '#1a1410'; g.fillRect(X, Y, 1, 2); g.fillRect(X, Y, 1, 1); break;
        case 'chunk': g.fillStyle = q.col || '#6b7682'; g.fillRect(X - 1, Y - 1, 2, 2); break;
        default: break;
      }
    }
  }
}

// ================================================================== shared prop sprites
const INK = PAL.ink;
const tint = (r, c, t) => (t ? fogRamp(r, c, t) : r);
function sprOf(P, ox, oy) { const cv = P.canvas(); return { cv, ox: ox ?? (cv.width >> 1), oy: oy ?? cv.height, P }; }

export const BARREL_COLS = ['#a8302a', '#2a5aa8', '#3a7e3a', '#c89a22'];
export function barrelUpright(hex, seed = 1, o = {}) {
  const W = 30, H = 42, P = new Pix(W + 2, H + 2);
  const r = tint(R(hex, { spread: 0.12 }), C('#1b4a63'), o.fog ?? 0.12), rust = PAL.rust;
  const prof = [1, 2, 3, 4, 4, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 0];
  const nf = noiseField(W, H, 1 / 7, seed, 2, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let t = prof[Math.floor((x / W) * prof.length)];
    if (y === 13 || y === 28) t = Math.min(4, t + 1);
    if (y === 14 || y === 29) t = Math.max(0, t - 2);
    if (y >= H - 3) t = Math.max(0, t - 1 - (y === H - 1 ? 1 : 0));
    let c = r[t];
    const n = nf[y * W + x];
    if (n > 0.66) c = rust[n > 0.74 ? 1 : 2];
    else if (n > 0.62) c = r[Math.max(0, t - 1)];
    if (hh(x, y, seed) < 0.03) c = r[Math.max(0, t - 1)];
    P.set(x + 1, y + 1, c);
  }
  // hoop ridges stick out 1px
  for (const y of [13, 28]) { P.set(0, y + 1, r[2]); P.set(W + 1, y + 1, r[0]); }
  // lid (seen slightly from above)
  P.ell(W / 2 + 1, 4, W / 2 - 0.5, 3.4, (x, y, nx, ny, q) => (q > 0.62 ? (ny < 0 ? r[4] : r[1]) : ny < -0.1 ? r[0] : r[1]));
  P.rect(W / 2 + 5, 3, 4, 2, r[0]); P.set(W / 2 + 5, 3, r[3]);
  // label / stencil
  const kind = seed % 3;
  if (kind === 0) {
    P.rect(6, 17, W - 10, 9, C('#d8cfb0')); P.rect(6, 25, W - 10, 1, C('#a89a78'));
    text(P, 'OIL', W / 2 + 1, 18, C('#2a2020'), { font: 3, align: 'center' });
    P.rect(8, 24, W - 14, 1, r[2]);
  } else if (kind === 1) {
    // hazard diamond
    const cx = W / 2 + 1, cy = 21;
    P.poly([cx, cy - 6, cx + 6, cy, cx, cy + 6, cx - 6, cy], C('#d8cfb0'));
    P.poly([cx, cy - 4, cx + 4, cy, cx, cy + 4, cx - 4, cy], C('#c83a2a'));
    P.vl(cx, cy - 2, cy + 1, C('#f0e8d0')); P.set(cx, cy + 3, C('#f0e8d0'));
  } else {
    // fish skeleton stencil
    const cy = 21, c2 = r[4];
    P.hl(9, W - 6, cy, c2); for (let x = 11; x < W - 8; x += 3) { P.set(x, cy - 2, c2); P.set(x, cy - 1, c2); P.set(x, cy + 1, c2); P.set(x, cy + 2, c2); }
    P.disc(W - 5, cy, 2.5, c2); P.set(W - 5, cy - 1, r[1]); P.poly([7, cy - 3, 10, cy, 7, cy + 3], c2);
  }
  // oil drips from the lid
  for (let k = 0; k < 3; k++) { const x = 5 + Math.floor(hh(k, 1, seed) * (W - 8)), L = 3 + Math.floor(hh(k, 2, seed) * 9); for (let j = 0; j < L; j++) P.set(x, 6 + j, j === L - 1 ? C('#2a2420') : C('#14100e')); }
  // dent
  P.set(W - 8, 34, r[0]); P.set(W - 7, 35, r[0]); P.set(W - 9, 34, r[3]);
  P.outline(INK);
  return sprOf(P);
}
export function barrelLid(hex, ang, seed = 1, o = {}) {
  const D = 34, S = D + 2, P = new Pix(S, S);
  const r = tint(R(hex, { spread: 0.12 }), C('#1b4a63'), o.fog ?? 0.12), rust = PAL.rust;
  const cx = S / 2, cy = S / 2, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > D / 2) continue;
    // rotate into barrel frame for details
    const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    const light = (-dx - dy) / (d || 1); // top-left lit
    let c;
    if (d > D / 2 - 2.2) c = light > 0.3 ? r[4] : light > -0.3 ? r[3] : r[1];
    else if (d > D / 2 - 3.4) c = r[0];
    else if (Math.abs(d - 10) < 0.6) c = r[1];
    else c = light > 0.5 && d > 12 ? r[3] : r[2];
    // bungs
    const b1 = Math.hypot(lx - 8, ly), b2 = Math.hypot(lx + 6, ly - 6);
    if (b1 < 2.6) c = b1 < 1.4 ? r[0] : r[3];
    if (b2 < 1.8) c = b2 < 0.9 ? r[0] : r[3];
    // stencil bar + rust spot (rotate with the barrel)
    if (Math.abs(ly + 7) < 1 && Math.abs(lx) < 5) c = C('#d8cfb0');
    if (Math.hypot(lx + 3, ly + 1) < 3 && hh(Math.round(lx), Math.round(ly), seed) < 0.6) c = rust[2];
    P.set(x, y, c);
  }
  P.outline(INK);
  return sprOf(P);
}
const CRATE_STENCILS = ['FRAGIL', 'PESCA', 'XXX', 'ESTE LADO'];
export function crateSprite(seed = 1, hp = 3, o = {}) {
  const S = 44, P = new Pix(S + 2, S + 2);
  const r = tint(o.r || PAL.woodL, C('#1b4a63'), o.fog ?? 0.08), fr = tint(o.fr || PAL.wood, C('#1b4a63'), o.fog ?? 0.08), st = PAL.steel;
  woodPlanks(P, 1, 1, S, S, { r, pw: 8, seed: seed * 7 + 1, lenMin: 300, lenMax: 300, nails: false });
  const ink = INK;
  // stencil (faded paint) under the brace
  const word = CRATE_STENCILS[seed % CRATE_STENCILS.length];
  if (word !== 'XXX') text(P, word, S / 2 + 1, S / 2 - 2, (x, y) => (hh(x, y, seed) < 0.25 ? r[1] : C('#8a3a2a')), { font: 3, align: 'center' });
  else { for (let k = 0; k < 3; k++) text(P, 'X', 12 + k * 9, 19, C('#2a2020'), { font: 5 }); }
  // frame planks
  const frame = (x, y, w, h) => { P.rect(x, y, w, h, fr[2]); P.rect(x, y, w, 1, fr[3]); P.rect(x, y + h - 1, w, 1, fr[0]); };
  frame(1, 1, S, 5); frame(1, S - 4, S, 5);
  P.rect(1, 1, 5, S, fr[2]); P.rect(S - 4, 1, 5, S, fr[2]); P.vl(1, 1, S, fr[3]); P.vl(S, 1, S, fr[0]); P.vl(5, 6, S - 5, fr[0]); P.vl(S - 4, 6, S - 5, fr[3]);
  for (let y = 2; y < S; y += 3) if (hh(1, y, seed) < 0.5) { P.set(3, y, fr[1]); P.set(S - 2, y, fr[1]); }
  // diagonal brace
  for (let k = 0; k < S - 10; k++) { const x = 6 + k, y = S - 5 - k; P.rect(x, y - 2, 1, 5, fr[2]); P.set(x, y - 3, fr[3]); P.set(x, y + 3, fr[0]); if (hh(k, 0, seed) < 0.2) P.set(x, y, fr[1]); }
  // corner brackets + nails
  for (const [x, y, fx, fy] of [[1, 1, 1, 1], [S - 6, 1, -1, 1], [1, S - 6, 1, -1], [S - 6, S - 6, -1, -1]]) {
    P.rect(x, y, 7, 7, (xx, yy) => ((fx > 0 ? xx - x : x + 6 - xx) < 3 || (fy > 0 ? yy - y : y + 6 - yy) < 3 ? st[2] : undefined));
    P.set(x + (fx > 0 ? 1 : 5), y + (fy > 0 ? 1 : 5), st[4]); P.set(x + (fx > 0 ? 4 : 2), y + (fy > 0 ? 1 : 5), st[0]); P.set(x + (fx > 0 ? 1 : 5), y + (fy > 0 ? 4 : 2), st[0]);
  }
  // algae creeping from the bottom
  for (let x = 1; x <= S; x++) { const hgt = Math.floor(hh(x, 3, seed) * 5 * (hh(x >> 2, 4, seed))); for (let j = 0; j < hgt; j++) P.set(x, S - j, PAL.algae[j === hgt - 1 ? 3 : 2]); }
  // cracks
  const crack = (x0, y0, len, ang) => { let x = x0, y = y0, a = ang; for (let i = 0; i < len; i++) { P.set(x, y, ink); P.set(x + 1, y, r[4]); a += (hh(i, x0, seed) - 0.5) * 1.2; x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a)) || 1; } };
  if (hp <= 2) { crack(14, 8, 14, 1.2); crack(30, 26, 12, 2.2); }
  if (hp <= 1) {
    crack(22, 14, 18, 1.6); crack(36, 10, 10, 2.6);
    P.poly([17, 20, 27, 17, 31, 25, 24, 31, 16, 27], C('#0c0806'));
    for (let k = 0; k < 9; k++) P.set(18 + Math.floor(hh(k, 5, seed) * 12), 21 + Math.floor(hh(k, 6, seed) * 8), C('#c8a050'));
    P.line(17, 20, 27, 17, r[4]);
  }
  P.outline(INK);
  return sprOf(P);
}
export function cratePile(seed = 1) {
  const P = new Pix(60, 14), r = PAL.woodL, fr = PAL.wood;
  const plank = (x, y, w, tilt, rr) => { for (let i = 0; i < w; i++) { const yy = y + Math.round((i / w) * tilt); P.rect(x + i, yy, 1, 3, rr[2]); P.set(x + i, yy, rr[3]); P.set(x + i, yy + 2, rr[1]); } P.set(x, y + 1, rr[0]); };
  plank(4, 9, 26, 1, fr); plank(26, 9, 28, -1, r); plank(12, 6, 22, 2, r); plank(30, 5, 20, 3, fr); plank(8, 3, 14, 4, r);
  P.rect(40, 9, 6, 2, PAL.steel[2]); P.set(40, 9, PAL.steel[4]);
  for (let k = 0; k < 10; k++) P.set(2 + Math.floor(hh(k, 1, seed) * 56), 11 + Math.floor(hh(k, 2, seed) * 2), r[k % 2 ? 1 : 3]);
  P.outline(INK);
  return sprOf(P);
}
export function mugSprite() {
  const P = new Pix(16, 19);
  const gl = C('#cfe8e0'), gl2 = C('#8ab8b0'), beer = C('#d8a030'), beer2 = C('#a8701e'), beer3 = C('#f0c860'), foam = C('#fff8e8'), foam2 = C('#e0d8c0');
  P.rect(2, 4, 10, 13, beer); P.rect(9, 6, 3, 11, beer2); P.vl(3, 6, 15, beer3);
  for (let y = 7; y < 16; y += 3) P.set(6 + (y % 2), y, beer3);
  P.vl(2, 3, 16, gl); P.vl(11, 3, 16, gl2); P.hl(2, 11, 17, gl2); P.hl(3, 10, 16, gl);
  P.rect(1, 1, 12, 4, foam); P.hl(2, 11, 0, foam); P.set(1, 0, 0); P.hl(2, 11, 4, foam2); P.set(4, 5, foam); P.set(8, 5, foam); P.set(8, 6, foam);
  P.ring(12.5, 10.5, 2.2, 4, gl2); P.set(14, 8, gl);
  P.outline(INK);
  return sprOf(P);
}
export function bottleSprite(hex = '#3a9a5a', seed = 0) {
  const P = new Pix(12, 24), r = R(hex, { spread: 0.1 }), cap = seed % 2 ? C('#c8302a') : C('#b8905a');
  P.rect(5, 1, 2, 7, r[2]); P.set(5, 2, r[4]);
  P.rect(4, 0, 4, 2, cap); P.set(4, 0, lightU(cap, 0.4));
  P.rect(4, 7, 4, 2, r[2]); P.rect(3, 9, 6, 2, r[2]); P.rect(2, 10, 8, 13, r[2]);
  P.vl(3, 10, 21, r[4]); P.vl(8, 10, 21, r[1]); P.vl(9, 11, 21, r[0]); P.hl(3, 8, 22, r[1]);
  P.rect(2, 13, 8, 6, C('#e8dcb8')); P.hl(2, 9, 13, C('#c8302a')); P.hl(2, 9, 18, C('#c8302a')); P.rect(4, 15, 4, 2, seed % 3 === 0 ? C('#2a4aa0') : C('#3a2a20'));
  P.vl(3, 14, 17, C('#fff8e8'));
  P.outline(INK);
  return sprOf(P);
}
export function stoolSprite(seat = '#9c2a2a') {
  const P = new Pix(28, 33), s = R(seat, { spread: 0.11 }), m = PAL.steelL, w = PAL.woodL;
  // legs
  const leg = (x0, x1, c) => { for (let y = 8; y < 32; y++) { const x = Math.round(x0 + (x1 - x0) * ((y - 8) / 24)); P.rect(x, y, 2, 1, c[2]); P.set(x, y, c[3]); } };
  leg(13, 13, w); leg(7, 2, w); leg(19, 24, w);
  P.rect(4, 22, 20, 2, m[2]); P.hl(4, 23, 22, m[4]); P.hl(4, 23, 23, m[0]);
  // seat cushion + chrome band
  P.ell(14, 4, 13, 4, (x, y, nx, ny, q) => (ny < -0.2 ? (q < 0.4 ? s[4] : s[3]) : s[2]));
  P.rect(1, 4, 26, 3, s[2]); P.hl(1, 26, 6, s[1]);
  for (const bx of [7, 14, 21]) { P.set(bx, 2, s[1]); P.set(bx, 3, s[4]); }
  P.rect(2, 7, 24, 2, m[3]); P.hl(2, 25, 8, m[1]); P.set(4, 7, m[4]);
  P.outline(INK);
  return sprOf(P);
}
export function snailSprite(frame = 0) {
  const P = new Pix(17, 14), g = PAL.gold, body = R('#f0b890', { spread: 0.1 });
  // foot / body
  P.rect(2, 10, 13, 3, body[2]); P.hl(2, 14, 10, body[3]); P.hl(1, 14, 12, body[1]); P.set(15, 11, body[2]);
  // head + eye stalks
  P.rect(12, 7, 3, 4, body[2]); P.set(12, 7, body[3]);
  const ey = frame ? 1 : 0;
  P.vl(13, 3 + ey, 7, body[2]); P.vl(15, 4 - ey, 7, body[1]); P.set(13, 2 + ey, INK); P.set(15, 3 - ey, INK);
  // shell spiral
  const cx = 7.5, cy = 6.5, R0 = 5.6;
  P.ell(cx, cy, R0, R0, (x, y, nx, ny, q) => {
    const a = Math.atan2(ny, nx), rr = Math.sqrt(q);
    const sp = ((a / TAU + rr * 2.2) % 1 + 1) % 1;
    if (sp < 0.14) return g[1];
    const lit = -nx - ny;
    return lit > 0.7 ? g[4] : lit > 0 ? g[3] : g[2];
  });
  P.set(5, 3, C('#ffffff')); P.set(6, 3, g[4]);
  P.outline(INK);
  return sprOf(P);
}
export function ventSprite() {
  const W = 54, H = 13, P = new Pix(W, H), st = PAL.steel, ru = PAL.rust;
  P.rect(0, 2, W, H - 2, st[2]); P.hl(0, W - 1, 2, st[4]); P.hl(1, W - 2, 3, st[3]); P.hl(0, W - 1, H - 1, st[0]);
  P.rect(4, 5, W - 8, 6, C('#08100f'));
  for (let x = 6; x < W - 6; x += 4) { P.rect(x, 5, 2, 6, st[1]); P.vl(x, 5, 10, st[3]); }
  hazard(P, 0, 0, 6, 3, { per: 4, seed: 9 }); hazard(P, W - 6, 0, 6, 3, { per: 4, seed: 8 });
  for (let x = 0; x < W; x++) if (hh(x, 9, 2) < 0.25) P.set(x, H - 2 - (x % 2), ru[1]);
  rivet(P, 2, 6, st); rivet(P, W - 3, 6, st);
  P.outline(INK);
  return sprOf(P);
}

// ================================================================== stage base
export class StageBase {
  constructor(def, o = {}) {
    this.def = def || {};
    this.t = 0; this.dark = 0; this.darkT = 0;
    this.fx = new Debris();
    this.bub = new Bubbles();
    this.pv = new Map();
    this.cache = new Map();
    this.flick = 1;
  }
  spr(key, fn) { let v = this.cache.get(key); if (!v) { v = fn(); this.cache.set(key, v); } return v; }
  setDark(a) { this.dark = clamp(a || 0, 0, 1); }
  update(dt, s) {
    this.t += dt;
    this.fx.update(dt);
    this.bub.update(dt);
    // lamp flicker while dark
    if (this.dark > 0.05) { this.darkT -= dt; if (this.darkT <= 0) { this.flick = Math.random() < 0.35 + this.dark * 0.4 ? 0 : 1; this.darkT = 0.04 + Math.random() * 0.18; } } else this.flick = 1;
    if (s && s.props) this.updateProps(dt, s);
  }
  view(p) { let v = this.pv.get(p.id); if (!v) { v = { tipped: false, tipT: 0, rot: 0, sw: 0, swv: 0, hp: p.hp, acc: 0, seen: 0, shake: 0 }; this.pv.set(p.id, v); } return v; }
  updateProps(dt, s) {
    for (const p of s.props) {
      const v = this.view(p);
      v.seen = this.t;
      if (p.hp !== v.hp) { if (p.hp < v.hp) v.shake = 0.18; v.hp = p.hp; }
      if (v.shake > 0) v.shake -= dt;
      switch (p.type) {
        case 'barrel':
          if (!v.tipped && (Math.abs(p.vx) > 0.01 || p.y > 0.05)) { v.tipped = true; v.tipT = 0.12; }
          if (v.tipT > 0) v.tipT -= dt;
          if (v.tipped && Math.abs(p.vx) > 0.05 && Math.random() < dt * 8) this.fx.spawn('silt', p.x - Math.sign(p.vx) * 0.3, 0.05, { life: 0.6, g: 0.3, col: '#4a5a52' });
          break;
        case 'mug': case 'bottle': case 'stool':
          if (p.state === 'fly' || p.state === 'thrown') v.rot += dt * 13 * (p.vx < 0 ? 1 : -1);
          else if (p.state === 'held') v.rot = -0.35;
          else v.rot = 0;
          break;
        case 'chandelier': case 'pinata': {
          const k = p.type === 'pinata' ? 7 : 3.2, c = p.type === 'pinata' ? 0.9 : 0.55;
          v.swv += (-v.sw * k - v.swv * c) * dt; v.sw += v.swv * dt;
          v.sw += Math.sin(this.t * 0.9 + p.id) * 0.002;
          break;
        }
        case 'vent':
          if (p.active > 0) {
            v.acc += dt * 70;
            while (v.acc > 1) { v.acc -= 1; this.bub.add(p.x + (Math.random() - 0.5) * 0.9, 0.25 + Math.random() * 0.3, { vy: 3.5 + Math.random() * 4, vx: (Math.random() - 0.5) * 0.4, r: Math.random() < 0.3 ? 1 : Math.random() < 0.6 ? 2 : Math.random() < 0.6 ? 3 : 4, top: 6.5 + Math.random() * 1.5, amp: 2 }); }
          } else if (Math.random() < dt * 2.5) this.bub.add(p.x + (Math.random() - 0.5) * 0.7, 0.25, { vy: 0.8 + Math.random() * 0.6, r: Math.random() < 0.6 ? 0 : 1, top: 3 + Math.random() * 3 });
          break;
        case 'snail':
          if (Math.random() < dt * 2.2) this.fx.spawn('star', p.x + (Math.random() - 0.5) * 0.4, p.y + 0.1 + Math.random() * 0.35, { g: 0.6, life: 0.45, drag: 3 });
          break;
        default: break;
      }
    }
    if (this.pv.size > 80) for (const [id, v] of this.pv) if (this.t - v.seen > 2) this.pv.delete(id);
  }
  // ------------------------------------------------ prop drawing
  drawProps(d, s, alpha, t) {
    if (!s) return;
    if (s.plats) for (const pl of s.plats) this.drawPlat(d, pl, t, s);
    if (s.props) {
      for (const p of s.props) if (p.type === 'vent') this.drawProp(d, p, t);
      for (const p of s.props) if (p.type !== 'vent' && p.type !== 'snail') this.drawProp(d, p, t);
      for (const p of s.props) if (p.type === 'snail') this.drawProp(d, p, t);
    }
    this.bub.draw(d, t, 0.99, 1.01);
    this.fx.draw(d, t);
    if (this.dark > 0.02) d.dither('#02060a', this.dark * 0.45);
  }
  drawPlat() {}
  put(d, sp, x, y, flip = false, dx = 0, dy = 0) { d.g.drawImage(sp.cv, d.bx(x) - sp.ox + dx, d.by(y) - sp.oy + dy); }
  putRot(d, key, base, ang, x, y, steps = 16) {
    const k = ((Math.round((ang / TAU) * steps) % steps) + steps) % steps;
    const sp = this.spr(key + ':r' + k, () => { const r = rotPix(base.P, (k / steps) * TAU); return { cv: r.canvas(), ox: r.cx, oy: r.cy }; });
    d.g.drawImage(sp.cv, d.bx(x) - Math.round(sp.ox), d.by(y) - Math.round(sp.oy));
  }
  drawProp(d, p, t) {
    const v = this.view(p);
    const sh = v.shake > 0 ? (Math.floor(this.t * 60) & 1 ? 1 : -1) : 0;
    switch (p.type) {
      case 'barrel': {
        const col = BARREL_COLS[p.id % BARREL_COLS.length];
        if (!v.tipped) { this.put(d, this.spr('barrel' + col + (p.id % 3), () => barrelUpright(col, p.id % 3 + 1)), p.x, p.y); break; }
        if (v.tipT > 0) { const up = this.spr('barrel' + col + (p.id % 3), () => barrelUpright(col, p.id % 3 + 1)); this.putRot(d, 'barrelTip' + col + (p.id % 3), up, Math.PI / 4 * (p.vx >= 0 ? 1 : -1), p.x, p.y + 0.45, 8); break; }
        const ang = -(p.x * PPU) / 17;
        const k = ((Math.round((ang / TAU) * 16) % 16) + 16) % 16;
        this.put(d, this.spr('lid' + col + k, () => barrelLid(col, (k / 16) * TAU, p.id % 3 + 1)), p.x, p.y);
        break;
      }
      case 'crate': {
        if (p.state === 'broken') { this.put(d, this.spr('cratePile' + (p.id % 3), () => cratePile(p.id % 3 + 1)), p.x, p.y); break; }
        const hp = Math.max(1, Math.min(3, p.hp));
        this.put(d, this.spr('crate' + (p.id % 4) + hp, () => crateSprite(p.id % 4 + 1, hp)), p.x, p.y, false, sh, 0);
        break;
      }
      case 'mug': case 'bottle': case 'stool': {
        const key = p.type === 'bottle' ? 'bottle' + (p.id % 3) : p.type;
        const base = this.spr(key, () => (p.type === 'mug' ? mugSprite() : p.type === 'bottle' ? bottleSprite(['#3a9a5a', '#8a5a2a', '#3a6aa0'][p.id % 3], p.id) : stoolSprite()));
        if (v.rot === 0) this.put(d, base, p.x, p.y);
        else this.putRot(d, key, base, v.rot, p.x, p.y + base.cv.height / PPU / 2, 12);
        break;
      }
      case 'snail': {
        const sp = this.spr('snail' + (Math.floor(t * 2 + p.id) & 1), () => snailSprite(Math.floor(t * 2 + p.id) & 1));
        const bob = p.state === 'rest' ? (Math.floor(t * 4 + p.id) & 1) : 0;
        this.put(d, sp, p.x, p.y, false, 0, -bob);
        break;
      }
      case 'vent': {
        const sp = this.spr('vent', ventSprite);
        if (p.active > 0) this.drawGeyser(d, p, t);
        this.put(d, sp, p.x, 0);
        break;
      }
      default: this.drawCustomProp(d, p, t, v); break;
    }
  }
  drawCustomProp() {}
  drawGeyser(d, p, t) {
    const g = d.g, k = Math.min(1, p.active / 40), x = d.bx(p.x), y0 = d.by(0) - 6, top = d.by(6.2 * k + 0.3);
    const outer = d.ditherTile('#7ad0d8', 0.22), inner = d.ditherTile('#c8f4f4', 0.34);
    g.save(); g.translate(-d.ax & 3, -d.ay & 3);
    for (let y = top; y < y0; y += 2) {
      const tt = (y0 - y) / Math.max(1, y0 - top);
      const w = Math.round(12 + tt * 10 + Math.sin(t * 9 + y * 0.15) * 2);
      const ox = Math.round(Math.sin(t * 5 + y * 0.07) * 2);
      g.fillStyle = outer; g.fillRect(x - w + ox - (-d.ax & 3), y - (-d.ay & 3), w * 2, 2);
      g.fillStyle = inner; g.fillRect(x - Math.round(w * 0.45) + ox - (-d.ax & 3), y - (-d.ay & 3), Math.round(w * 0.9), 2);
    }
    g.restore();
    // churning foam cap
    g.fillStyle = '#e8ffff';
    for (let i = 0; i < 10; i++) { const a = t * 7 + i * 2.1; g.fillRect(x + Math.round(Math.cos(a) * (10 + i)), top + Math.round(Math.sin(a * 1.3) * 3), 2, 1); }
  }
  // ------------------------------------------------ events
  onEvent(e) {
    const fx = this.fx;
    switch (e.t) {
      case 'propHit': {
        const v = e.id !== undefined ? this.pv.get(e.id) : null;
        if (v) v.shake = 0.18;
        if (e.type === 'crate') fx.burst('splinter', e.x, e.y, 7, 4, { life: 1.6 });
        else if (e.type === 'barrel' || e.type === 'barrelWall') { fx.burst('spark', e.x, e.y, 7, 5, { g: -2, life: 0.35, drag: 3 }); fx.spawn('silt', e.x, 0.05, { life: 0.8, g: 0.2 }); }
        else if (e.type === 'chandelier' || e.type === 'pinata') {
          for (const [, vv] of this.pv) if (vv === v) vv.swv += (e.dir || (Math.random() < 0.5 ? -1 : 1)) * (e.type === 'pinata' ? 3.4 : 1.6);
          if (e.type === 'pinata') fx.burst('confetti', e.x, e.y, 14, 3, { life: 2.2, g: -1.6, drag: 2.5, col: ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a'][Math.floor(Math.random() * 4)] });
          else fx.burst('spark', e.x, e.y, 6, 3, { g: -3, life: 0.4 });
        }
        break;
      }
      case 'propBreak':
        if (e.type === 'crate') {
          fx.burst('plank', e.x, e.y, 9, 4.5, { life: 3.5, up: 2.5 }); fx.burst('splinter', e.x, e.y, 16, 5, { life: 2 });
          for (let i = 0; i < 5; i++) fx.spawn('silt', e.x + (Math.random() - 0.5) * 1.2, 0.05, { life: 1 + Math.random(), g: 0.3 });
          this.bub.burst(e.x, e.y, 10, 0.5);
        } else if (e.type === 'pinata') {
          const cols = ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a', '#c194ff', '#ff8a2a'];
          for (let i = 0; i < 60; i++) fx.spawn('confetti', e.x + (Math.random() - 0.5) * 0.6, e.y + (Math.random() - 0.5) * 0.6, { vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4 - 0.5, g: -1.6, drag: 2.2, life: 2.5 + Math.random() * 2, col: cols[i % cols.length] });
          for (let i = 0; i < 16; i++) fx.spawn('papel', e.x, e.y, { vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3, g: -1.4, drag: 2.4, life: 3, col: cols[i % cols.length] });
          fx.burst('candy', e.x, e.y, 22, 4, { life: 4, up: 1.5, bounce: 0.4 });
        } else if (e.type === 'chandelier') {
          fx.burst('plank', e.x, 0.4, 10, 4, { life: 3.5 }); fx.burst('splinter', e.x, 0.4, 18, 5); fx.burst('spark', e.x, 0.5, 14, 5, { g: -3, life: 0.5 });
          for (let i = 0; i < 7; i++) fx.spawn('silt', e.x + (Math.random() - 0.5) * 1.8, 0.05, { life: 1.4, g: 0.3 });
        } else { fx.burst('splinter', e.x, e.y, 10, 4); }
        break;
      case 'itemBreak':
        if (e.type === 'stool') { fx.burst('plank', e.x, e.y + 0.3, 5, 3.5, { life: 3 }); fx.burst('splinter', e.x, e.y + 0.3, 10, 4); }
        else { fx.burst('glass', e.x, e.y + 0.2, 18, 4, { life: 1.6, col: e.type === 'bottle' ? '#7ad08a' : '#cfe8e0' }); this.bub.burst(e.x, e.y + 0.2, 10, 0.3); if (e.type === 'mug') this.bub.burst(e.x, e.y + 0.2, 8, 0.2, { r: 2 }); }
        break;
      case 'tableBreak': fx.burst('plank', e.x, e.y, 10, 4, { life: 3.5 }); fx.burst('splinter', e.x, e.y, 18, 5); for (let i = 0; i < 5; i++) fx.spawn('silt', e.x + (Math.random() - 0.5) * 1.6, 0.05, { life: 1.2, g: 0.3 }); break;
      case 'chandelierFall': fx.burst('spark', e.x, e.y + 0.4, 12, 4, { g: -4, life: 0.5 }); break;
      case 'jukebox': fx.burst('note', e.x, e.y + 0.6, 10, 2.5, { g: 1.2, life: 1.6, drag: 2 }); break;
      case 'ventBurst': this.bub.burst(e.x, 0.6, 26, 0.5, { vy: 3 }); break;
      case 'snailPickup': fx.burst('star', e.x, e.y + 0.2, 8, 2.5, { g: 0.5, life: 0.6, drag: 3 }); break;
      case 'propLand': if (e.type === 'barrel' || e.type === 'crate') fx.spawn('silt', e.x, 0.05, { life: 0.9, g: 0.2 }); break;
      case 'hit': if (e.heavy) for (let i = 0; i < 3; i++) fx.spawn('silt', (e.x ?? 0) + (Math.random() - 0.5), 0.05, { life: 0.8, g: 0.3 }); break;
      default: break;
    }
    this.onStageEvent?.(e);
  }
}
