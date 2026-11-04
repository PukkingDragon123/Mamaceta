// Low-level pixel buffer painter used to generate hand-styled pixel-art sprites procedurally.
import { hexToRgb } from './palette.js';

const u32Cache = new Map();
export function u32(hex, a = 255) {
  const k = hex + a;
  let v = u32Cache.get(k);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(hex);
    v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    u32Cache.set(k, v);
  }
  return v;
}

export class PixelCanvas {
  constructor(w, h) {
    this.w = w | 0; this.h = h | 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, this.w); this.canvas.height = Math.max(1, this.h);
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) { x |= 0; y |= 0; if (this.inb(x, y)) this.buf[y * this.w + x] = typeof c === 'string' ? u32(c) : c; }
  get(x, y) { x |= 0; y |= 0; return this.inb(x, y) ? this.buf[y * this.w + x] : 0; }
  alpha(x, y) { return this.get(x, y) >>> 24; }
  blend(x, y, hex, a) {
    x |= 0; y |= 0; if (!this.inb(x, y)) return;
    const i = y * this.w + x, d = this.buf[i];
    const [r, g, b] = hexToRgb(hex);
    const dr = d & 255, dg = (d >> 8) & 255, db = (d >> 16) & 255, da = d >>> 24;
    if (da === 0) { this.buf[i] = u32(hex, Math.round(a * 255)); return; }
    const nr = dr + (r - dr) * a, ng = dg + (g - dg) * a, nb = db + (b - db) * a;
    this.buf[i] = ((da << 24) | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255)) >>> 0;
  }
  rect(x, y, w, h, c) { const v = typeof c === 'string' ? u32(c) : c; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inb(i, j)) this.buf[j * this.w + i] = v; }
  hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c);
      }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  ring(cx, cy, r0, r1, c) {
    for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++)
      for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
        if (d <= r1 * r1 && d >= r0 * r0) this.set(x, y, c);
      }
  }
  // 1px outline around opaque pixels
  outline(c, diag = false) {
    const v = typeof c === 'string' ? u32(c) : c;
    const src = this.buf.slice();
    const W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (src[y * W + x] >>> 24) continue;
      let n = false;
      const chk = (i, j) => { if (i >= 0 && j >= 0 && i < W && j < H && (src[j * W + i] >>> 24)) n = true; };
      chk(x - 1, y); chk(x + 1, y); chk(x, y - 1); chk(x, y + 1);
      if (diag) { chk(x - 1, y - 1); chk(x + 1, y - 1); chk(x - 1, y + 1); chk(x + 1, y + 1); }
      if (n) this.buf[y * W + x] = v;
    }
  }
  // draw string-art: rows of chars, map char->hex
  art(rows, map, ox = 0, oy = 0) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (map[ch]) this.set(ox + i, oy + j, map[ch]); } });
  }
  commit() { this.ctx.putImageData(this.img, 0, 0); return this.canvas; }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return [c, g];
}
