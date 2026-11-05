// The game's world view: everything in the world is drawn into a low-resolution "view buffer"
// at a fixed art density (PPU art pixels per world unit), then scaled up with nearest-neighbour
// sampling. Camera zoom simply changes how many art pixels are visible, so zoomed shots get
// chunkier pixels instead of smoother art. A sub-pixel offset keeps camera motion smooth.
import { BAYER4 } from './pal.js';

export const PPU = 44;        // art pixels per world unit
export const VIEW_H = 12.4;   // world units visible vertically at zoom 1

export class Display {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.vb = document.createElement('canvas');
    this.vb.width = 64; this.vb.height = 64;
    this.g = this.vb.getContext('2d');
    this.cam = { x: 0, y: 4, zoom: 1 };
    this.ditherTiles = new Map();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.devW = Math.max(64, Math.round(window.innerWidth * dpr));
    this.devH = Math.max(64, Math.round(window.innerHeight * dpr));
    this.canvas.width = this.devW; this.canvas.height = this.devH;
    this.canvas.style.width = '100vw'; this.canvas.style.height = '100vh';
    this.aspect = this.devW / this.devH;
  }
  get viewW() { return (VIEW_H / this.cam.zoom) * this.aspect; }
  get viewH() { return VIEW_H / this.cam.zoom; }

  // start a world frame for camera {x, y, zoom} (world units; y up)
  begin(cam, bg = '#04121a') {
    this.cam = cam;
    const viewH = VIEW_H / Math.max(0.2, cam.zoom);
    this.scale = this.devH / (viewH * PPU);
    const vwF = this.devW / this.scale, vhF = this.devH / this.scale;
    this.vw = Math.ceil(vwF) + 2; this.vh = Math.ceil(vhF) + 2;
    if (this.vb.width < this.vw || this.vb.height < this.vh) {
      this.vb.width = Math.max(this.vb.width, this.vw + 32); this.vb.height = Math.max(this.vb.height, this.vh + 32);
      this.g = this.vb.getContext('2d');
    }
    this.camAX = cam.x * PPU; this.camAY = -cam.y * PPU;
    const lx = this.camAX - vwF / 2, ty = this.camAY - vhF / 2;
    this.ax = Math.floor(lx); this.ay = Math.floor(ty);
    this.fx = lx - this.ax; this.fy = ty - this.ay;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
    g.fillStyle = bg; g.fillRect(0, 0, this.vw, this.vh);
    return g;
  }
  // world -> buffer pixel
  bx(x) { return Math.round(x * PPU) - this.ax; }
  by(y) { return Math.round(-y * PPU) - this.ay; }
  // absolute art -> buffer
  ix(X) { return Math.round(X) - this.ax; }
  iy(Y) { return Math.round(Y) - this.ay; }
  // world -> UI coordinates (for name tags, popups, bubbles)
  toUI(x, y, ui) {
    return {
      x: ((x * PPU - this.ax - this.fx) * this.scale) / ui.scale,
      y: ((-y * PPU - this.ay - this.fy) * this.scale) / ui.scale,
    };
  }
  // UI -> world
  fromUI(ux, uy, ui) {
    return { x: ((ux * ui.scale) / this.scale + this.ax + this.fx) / PPU, y: -((uy * ui.scale) / this.scale + this.ay + this.fy) / PPU };
  }
  visibleWorld() {
    return { x0: (this.ax) / PPU, x1: (this.ax + this.vw) / PPU, y1: -(this.ay) / PPU, y0: -(this.ay + this.vh) / PPU };
  }
  // draw a pre-baked art-space layer whose top-left is (X, Y) in absolute art px; parallax px/py
  layer(img, X, Y, px = 1, py = px) {
    const ox = this.camAX * (1 - px), oy = this.camAY * (1 - py);
    let dx = Math.round(X + ox) - this.ax, dy = Math.round(Y + oy) - this.ay;
    let sx = 0, sy = 0, w = img.width, h = img.height;
    if (dx < 0) { sx = -dx; w += dx; dx = 0; }
    if (dy < 0) { sy = -dy; h += dy; dy = 0; }
    if (dx + w > this.vw) w = this.vw - dx;
    if (dy + h > this.vh) h = this.vh - dy;
    if (w <= 0 || h <= 0) return;
    this.g.drawImage(img, sx, sy, w, h, dx, dy, w, h);
  }
  // horizontally tiling layer
  tile(img, X, Y, px = 1, py = px) {
    const ox = this.camAX * (1 - px), oy = this.camAY * (1 - py);
    const w = img.width;
    let dx = Math.round(X + ox) - this.ax;
    dx = ((dx % w) + w) % w - w;
    const dy = Math.round(Y + oy) - this.ay;
    for (let x = dx; x < this.vw; x += w) this.g.drawImage(img, x, dy);
  }
  // sprite (canvas) with its anchor at world (x,y); ox/oy = anchor pixel inside the sprite
  sprite(img, x, y, ox, oy, flip = false) {
    const dx = this.bx(x) - (flip ? img.width - ox : ox), dy = this.by(y) - oy;
    const g = this.g;
    if (!flip) { g.drawImage(img, dx, dy); return; }
    g.save(); g.translate(dx + img.width, dy); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore();
  }
  // ordered-dither overlay (pixel-art translucency), amount 0..1
  ditherTile(color, a) {
    const lv = Math.max(0, Math.min(16, Math.round(a * 16)));
    const key = color + lv;
    let pat = this.ditherTiles.get(key);
    if (!pat) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 4;
      const x = c.getContext('2d'); x.fillStyle = color;
      for (let i = 0; i < 16; i++) if (BAYER4[i] < lv / 16) x.fillRect(i & 3, i >> 2, 1, 1);
      pat = this.g.createPattern(c, 'repeat');
      this.ditherTiles.set(key, pat);
    }
    return pat;
  }
  dither(color, a, x = 0, y = 0, w = this.vw, h = this.vh) {
    if (a <= 0.02) return;
    const g = this.g;
    g.fillStyle = this.ditherTile(color, a);
    g.save(); g.translate(-this.ax & 3, -this.ay & 3); g.fillRect(x - (-this.ax & 3), y - (-this.ay & 3), w + 4, h + 4); g.restore();
  }
  overlay(color, a) {
    if (a <= 0.01) return;
    const g = this.g;
    g.globalAlpha = Math.min(1, a); g.fillStyle = color; g.fillRect(0, 0, this.vw, this.vh); g.globalAlpha = 1;
  }
  present() {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.vb, 0, 0, this.vw, this.vh, -this.fx * this.scale, -this.fy * this.scale, this.vw * this.scale, this.vh * this.scale);
  }
  clearScreen(color = '#04121a') { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.devW, this.devH); }
}
