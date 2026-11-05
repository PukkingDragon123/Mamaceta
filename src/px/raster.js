// Software pixel rasterizer for procedural pixel art. Shapes (tapered capsules, ellipses,
// polygons, strokes) are scan-converted into a small buffer with per-pixel depth and part
// groups, lit with clean banded "cel" tones from a fake 3D normal, textured by callbacks,
// then finished with selective outlines (outer silhouette + inner lines between parts).
import { u32, darkU, mixU, phash } from './pal.js';

const EMPTY = 0;

export class PixBuf {
  constructor(w = 64, h = 64) {
    this.canvas = document.createElement('canvas');
    this.g = this.canvas.getContext('2d', { willReadFrequently: false });
    this.resize(w, h);
    this.face = 1;
    // light direction (x toward facing side, y up, z toward viewer)
    this.setLight(-0.5, 0.66, 0.46);
    this.bands = [-0.36, 0.04, 0.5, 0.8];
    this.olc = new Uint32Array(256);
    this.olLight = new Uint32Array(256);
    this.noLine = new Uint8Array(256 * 256 / 8);
    this.flatGroups = new Uint8Array(256);
  }
  resize(w, h) {
    w = Math.max(4, Math.ceil(w)); h = Math.max(4, Math.ceil(h));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.col = new Uint32Array(w * h);
    this.zb = new Float32Array(w * h);
    this.gb = new Uint8Array(w * h);
    this.out = new Uint32Array(w * h);
    this.img = new ImageData(w, h);
    this.img32 = new Uint32Array(this.img.data.buffer);
    this.canvas.width = w; this.canvas.height = h;
  }
  setLight(x, y, z) { const l = Math.hypot(x, y, z); this.L = [x / l, y / l, z / l]; }
  clear() { this.col.fill(EMPTY); this.zb.fill(-1e9); this.gb.fill(0); this.noLine.fill(0); }
  group(g, outline, outlineLight) { this.olc[g] = outline; this.olLight[g] = outlineLight ?? outline; }
  noLineBetween(a, b) { const i = a * 256 + b, j = b * 256 + a; this.noLine[i >> 3] |= 1 << (i & 7); this.noLine[j >> 3] |= 1 << (j & 7); }
  _noLine(a, b) { const i = a * 256 + b; return (this.noLine[i >> 3] >> (i & 7)) & 1; }

  // tone index from a lighting value
  tone(s, m) {
    const b = this.bands;
    s = s * (m.contrast ?? 1) + (m.bias ?? 0);
    return s < b[0] ? 0 : s < b[1] ? 1 : s < b[2] ? 2 : s < b[3] ? 3 : 4;
  }
  shade(nx, ny, nz) {
    const L = this.L;
    return nx * L[0] * this.face + ny * L[1] + nz * L[2];
  }
  // write one pixel (x,y integer in buffer space)
  write(x, y, c, z, g) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (z < this.zb[i]) return;
    this.zb[i] = z; this.col[i] = c; if (g) this.gb[i] = g;
  }
  // final colour for a material at a pixel. info: {u,v,s,t}
  matColor(m, x, y, s, u, v) {
    let t = m.flat !== undefined ? m.flat : this.tone(s, m);
    if (m.tex) {
      const r = m.tex(t, u, v, x, y, s);
      if (r !== undefined) { if (r >= 16) return r >>> 0; t = r; }
    }
    if (t < 0) t = 0; else if (t > 4) t = 4;
    return m.r[t];
  }

  // tapered capsule a->b with radii ra, rb (buffer coords, y down)
  capsule(ax, ay, bx, by, ra, rb, m, z, g) {
    const x0 = Math.floor(Math.min(ax - ra, bx - rb)), x1 = Math.ceil(Math.max(ax + ra, bx + rb));
    const y0 = Math.floor(Math.min(ay - ra, by - rb)), y1 = Math.ceil(Math.max(ay + ra, by + rb));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, len = Math.sqrt(L2);
    const ux = dx / len, uy = dy / len;
    const zt = m.zTilt || 0;
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      const py = y + 0.5;
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const px = x + 0.5;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + dx * t, cy = ay + dy * t;
        const r = ra + (rb - ra) * t;
        const ex = px - cx, ey = py - cy;
        const d2 = ex * ex + ey * ey;
        if (d2 > r * r) continue;
        const i = y * this.w + x;
        const zz = z + zt * t;
        if (zz < this.zb[i]) continue;
        const nx = ex / r, ny = ey / r;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const s = this.shade(nx, -ny, nz);
        const across = (ex * -uy + ey * ux) / r; // -1..1 across the axis
        this.zb[i] = zz; if (g) this.gb[i] = g;
        this.col[i] = this.matColor(m, x, y, s, t * len, across);
      }
    }
  }
  // rotated ellipse
  ellipse(cx, cy, rx, ry, ang, m, z, g) {
    const c = Math.cos(ang), s0 = Math.sin(ang);
    const R = Math.max(rx, ry);
    const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      const py = y + 0.5 - cy;
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const px = x + 0.5 - cx;
        const lx = px * c + py * s0, ly = -px * s0 + py * c;
        const nx = lx / rx, ny = ly / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const i = y * this.w + x;
        if (z < this.zb[i]) continue;
        const nz = Math.sqrt(1 - d);
        // rotate normal back to buffer space
        const wx = nx * c - ny * s0, wy = nx * s0 + ny * c;
        const sh = this.shade(wx, -wy, nz);
        this.zb[i] = z; if (g) this.gb[i] = g;
        this.col[i] = this.matColor(m, x, y, sh, nx, ny);
      }
    }
  }
  // filled polygon (even-odd). Shading: pseudo-normal from edge distance (bevel) unless m.flat.
  poly(pts, m, z, g, o = {}) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const n = pts.length >> 1;
    for (let k = 0; k < n; k++) { const x = pts[k * 2], y = pts[k * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(1, (x1 - x0) / 2), hh = Math.max(1, (y1 - y0) / 2);
    const bulge = o.bulge ?? 0.65;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const py = y + 0.5;
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5;
        let inside = false;
        for (let a = 0, b = n - 1; a < n; b = a++) {
          const ya = pts[a * 2 + 1], yb = pts[b * 2 + 1];
          if ((ya > py) !== (yb > py)) {
            const xa = pts[a * 2], xb = pts[b * 2];
            if (px < xa + ((py - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
          }
        }
        if (!inside) continue;
        const i = y * this.w + x;
        if (z < this.zb[i]) continue;
        const nx = ((px - cx) / hw) * bulge, ny = ((py - cy) / hh) * bulge;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        const sh = this.shade(nx, -ny, nz);
        this.zb[i] = z; if (g) this.gb[i] = g;
        this.col[i] = this.matColor(m, x, y, sh, (px - cx) / hw, (py - cy) / hh);
      }
    }
  }
  // stroke through points (array x,y,...) with width w0->w1 (tapering)
  stroke(pts, w0, w1, m, z, g) {
    const n = pts.length >> 1;
    for (let k = 0; k < n - 1; k++) {
      const t0 = k / (n - 1), t1 = (k + 1) / (n - 1);
      this.capsule(pts[k * 2], pts[k * 2 + 1], pts[k * 2 + 2], pts[k * 2 + 3], (w0 + (w1 - w0) * t0) / 2, (w0 + (w1 - w0) * t1) / 2, m, z, g);
    }
  }
  // 1px line (Bresenham) with a fixed colour
  line(x0, y0, x1, y1, c, z, g) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
      this.write(x0, y0, c, z, g);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  rect(x, y, w, h, c, z, g) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.write(Math.round(x) + i, Math.round(y) + j, c, z, g); }
  // overwrite colour of already-filled pixels inside a circle (for decals) without touching depth
  paintCircle(cx, cy, r, c, onlyGroup = 0) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * this.w + x;
      if (this.col[i] === EMPTY) continue;
      if (onlyGroup && this.gb[i] !== onlyGroup) continue;
      this.col[i] = c;
    }
  }
  paint(x, y, c, onlyGroup = 0) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.col[i] === EMPTY) return;
    if (onlyGroup && this.gb[i] !== onlyGroup) return;
    this.col[i] = c;
  }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.col[y * this.w + x]; }

  // Outline pass. mode: null | 'flash' | 'white' | 'black' | {tint, amt}
  finish(o = {}) {
    const W = this.w, H = this.h, col = this.col, gb = this.gb, zb = this.zb, out = this.out;
    const inner = o.inner !== false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = col[i];
        if (c === EMPTY) {
          // outer outline
          let best = -1, bz = -1e9, side = 0;
          if (x > 0 && col[i - 1] !== EMPTY && zb[i - 1] > bz) { best = i - 1; bz = zb[i - 1]; side = 1; }
          if (x < W - 1 && col[i + 1] !== EMPTY && zb[i + 1] > bz) { best = i + 1; bz = zb[i + 1]; side = 0; }
          if (y > 0 && col[i - W] !== EMPTY && zb[i - W] > bz) { best = i - W; bz = zb[i - W]; side = 0; }
          if (y < H - 1 && col[i + W] !== EMPTY && zb[i + W] > bz) { best = i + W; bz = zb[i + W]; side = 1; }
          if (best < 0) { out[i] = 0; continue; }
          const g = gb[best];
          // light-facing side (top / toward light) gets the softer "selout" outline
          out[i] = side ? this.olc[g] : this.olLight[g];
          continue;
        }
        let v = c;
        if (inner) {
          const g = gb[i], z = zb[i];
          let line = false;
          const chk = (j) => { const gj = gb[j]; if (col[j] !== EMPTY && gj !== g && zb[j] > z + 0.5 && !this._noLine(g, gj)) line = true; };
          if (x > 0) chk(i - 1); if (x < W - 1) chk(i + 1); if (y > 0) chk(i - W); if (y < H - 1) chk(i + W);
          if (line) v = this.olc[g] ? mixU(this.olc[g], c, 0.25) : darkU(c, 0.55);
        }
        out[i] = v;
      }
    }
    // modes
    const mode = o.mode;
    if (mode) {
      for (let i = 0; i < out.length; i++) {
        const v = out[i];
        if (!v) continue;
        if (mode === 'white') out[i] = 0xffffffff;
        else if (mode === 'black') out[i] = 0xff000000;
        else if (mode === 'flash') out[i] = col[i] === EMPTY ? 0xff2a1a1a : 0xffffffff;
        else if (mode.tint !== undefined) out[i] = mixU(v, mode.tint, mode.amt);
      }
    }
    if (o.alpha !== undefined && o.alpha < 1) {
      // dithered transparency (keeps the pixel look; no blending)
      const a = o.alpha;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (out[i] && phashD(x, y) > a) out[i] = 0;
      }
    }
    this.img32.set(out);
    this.g.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function phashD(x, y) { return (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

// convenience material constructor
export function mat(r, o = {}) { return { r, ...o }; }
export { EMPTY, u32, phash };
