// Colour helpers for the 2D pixel renderer. Pixels are stored as little-endian ABGR Uint32
// (the layout of an ImageData Uint32 view). Ramps are hue-shifted the way pixel artists do it:
// shadows drift toward blue/violet, highlights toward warm yellow.

export const rgbOf = (hex) => {
  if (typeof hex === 'number') return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const u32 = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const hexU = (hex) => { const [r, g, b] = rgbOf(hex); return u32(r, g, b); };
export const uR = (c) => c & 255, uG = (c) => (c >>> 8) & 255, uB = (c) => (c >>> 16) & 255;
export const uCss = (c) => `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
export const hexCss = (hex) => (typeof hex === 'number' ? '#' + hex.toString(16).padStart(6, '0') : hex);

export function mixU(a, b, t) {
  const r = (a & 255) + (((b & 255) - (a & 255)) * t);
  const g = ((a >>> 8) & 255) + ((((b >>> 8) & 255) - ((a >>> 8) & 255)) * t);
  const bl = ((a >>> 16) & 255) + ((((b >>> 16) & 255) - ((a >>> 16) & 255)) * t);
  return u32(r | 0, g | 0, bl | 0);
}
export function darkU(c, f) { return mixU(c, u32(8, 6, 14), f); }
export function lightU(c, f) { return mixU(c, u32(255, 250, 230), f); }

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const shiftHue = (h, target, amt) => { let d = target - h; while (d > 180) d -= 360; while (d < -180) d += 360; return h + d * amt; };

// 5-tone ramp: [deep shadow, shadow, base, light, highlight]
export function ramp(hex, o = {}) {
  const [r, g, b] = rgbOf(hex);
  const [h, s, l] = rgb2hsl(r, g, b);
  const dl = o.spread ?? 0.13, hs = o.hue ?? 0.18;
  const out = [];
  for (let k = -2; k <= 2; k++) {
    let hh = h, ss = s, ll = l;
    if (k < 0) { hh = shiftHue(h, o.cool ?? 250, hs * -k * 0.5); ll = l + k * dl * (k === -2 ? 1.05 : 1); ss = Math.min(1, s * (1 + 0.08 * -k)); }
    if (k > 0) { hh = shiftHue(h, o.warm ?? 52, hs * k * 0.5); ll = l + k * dl * 0.85; ss = s * (1 - 0.1 * k); }
    ll = Math.max(0.04, Math.min(0.97, ll));
    const [R, G, B] = hsl2rgb(hh, ss, ll);
    out.push(u32(R, G, B));
  }
  return Uint32Array.from(out);
}
// explicit ramp from hex list (any length, padded to 5)
export function rampOf(list) {
  const a = list.map(hexU);
  while (a.length < 5) a.push(a[a.length - 1]);
  return Uint32Array.from(a.slice(0, 5));
}
export function outlineOf(rmp, f = 0.55) { return darkU(rmp[0], f); }

// 4x4 ordered dither matrix (0..1)
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

// hash for per-pixel texture noise
export function phash(x, y, s = 0) {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
