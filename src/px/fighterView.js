// FighterView2D: everything needed to show one fighter in the 2D world: pose computation from
// the sim (with interpolation + snappy blending), sprite rasterization, drop shadow, hit flash,
// molt husks, afterimages, cosmetic trails, dizzy stars, Puru, and silhouette mode for impact frames.
import { CharSprite } from './fighter/sprite.js';
import { computePose } from './fighter/anim.js';
import { mixPose } from './fighter/skeleton.js';
import { Puru } from './puru.js';
import { PPU } from './display.js';
import { moveFor, THROWS, CHARS } from '../sim/data.js';
import { TRAILS } from '../data/cosmetics.js';
import { pxDisc, bitmap } from './fx.js';

const SNAP = new Set(['attack', 'hitstun', 'airhit', 'blockstun', 'thrown', 'ko', 'ultAtk', 'ultVictim', 'knockdown', 'dash', 'dodge', 'prejump', 'skill']);

export class FighterView2D {
  constructor(i, char, cos = {}, fx = null) {
    this.i = i; this.char = char; this.cos = cos; this.fx = fx;
    this.sprite = new CharSprite(char, cos);
    this.demonSprite = char === 'bobby' ? new CharSprite('demon', cos) : null;
    this.demon = false;
    this.puru = char === 'mimi' ? new Puru(cos.skin) : null;
    this.pose = null; this.prevPose = null; this.blendT = 1; this.blendDur = 0.08; this.lastSt = null; this.lastMv = null;
    this.x = 0; this.y = 0; this.face = 1; this.lx = 0; this.ly = 0;
    this.flash = 0; this.flashCol = null;
    this.husks = []; this.after = [];
    this.trail = TRAILS.find((t) => t.key === cos.trail);
    this.trailT = 0; this.t = Math.random() * 5;
    this.canvas = null; this.blink = 0; this.blinkT = 2 + Math.random() * 3;
    this.visible = true;
    this.puruPos = null;
    this.shadowY = 0;
  }
  get active() { return this.demon ? this.demonSprite : this.sprite; }
  setDemon(on) { if (this.demonSprite) this.demon = !!on; }
  flashHit(color = '#ffffff', amt = 1) { this.flash = Math.max(this.flash, amt * 0.09); this.flashCol = color; }
  kickSquash() { this.squash = 0.12; }

  // f: sim fighter; prev: {x,y} previous tick position; alpha: interpolation; s: sim state
  update(dt, f, prev, alpha, s, o = {}) {
    this.t += dt;
    const x = prev ? prev.x + (f.x - prev.x) * alpha : f.x;
    const y = prev ? prev.y + (f.y - prev.y) * alpha : f.y;
    const vx = x - this.x, vy = y - this.y;
    this.x = x; this.y = y; this.face = f.face;
    if (f.char === 'bobby') this.setDemon(f.cs?.demon && f.st !== 'demonize' || (f.st === 'demonize' && f.sf >= 80));
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    const m = f.st === 'attack' && f.mv ? moveFor(f.char, f.cs?.demon, f.mv) : null;
    const target = computePose(f, { t: this.t, alpha, move: m, victory: this.cos.victory, throwFrames: THROWS[f.char]?.frames, crouching: (f.inCur & 8) !== 0, cineT: o.cineT });
    const key = f.st + '|' + (f.mv || '');
    if (key !== this.lastSt) {
      this.prevPose = this.pose || target;
      this.blendT = 0;
      this.blendDur = SNAP.has(f.st) ? 0.0 : 0.09;
      this.lastSt = key;
    }
    this.blendT += dt;
    const k = this.blendDur <= 0 ? 1 : Math.min(1, this.blendT / this.blendDur);
    let pose = k >= 1 ? target : mixPose(this.prevPose, target, 1 - (1 - k) * (1 - k));
    if (this.squash > 0) { this.squash = Math.max(0, this.squash - dt); pose = { ...pose, sq: [(pose.sq?.[0] ?? 1) * (1 + this.squash), (pose.sq?.[1] ?? 1) * (1 - this.squash)] }; }
    this.pose = pose;
    // render mode
    let mode = null;
    if (this.flash > 0) { this.flash -= dt; mode = this.flashCol === '#ffffff' ? 'flash' : { tint: cssU(this.flashCol), amt: 0.55 }; }
    else if (pose.hitFlash) mode = 'flash';
    else if (f.soft > 0 && Math.floor(this.t * 8) % 2 === 0) mode = { tint: 0xffe8f0ff, amt: 0.35 };
    else if (f.cs?.armorT > 0) mode = { tint: 0xff40c8f0, amt: 0.35 };
    let alphaV;
    if (f.inv > 0 && f.inv < 200 && f.st !== 'ultAtk' && f.st !== 'attack' && Math.floor(this.t * 20) % 2 === 0) alphaV = 0.55;
    if (f.cs?.invisT > 0) alphaV = 0.25;
    const spr = this.active;
    // spinning moves: fake rotation by flipping + squashing horizontally
    let face = f.face;
    if (pose.spin !== undefined) { const c = Math.cos(pose.spin * 0.45); if (c < 0) face = -face; pose.sq = [Math.max(0.35, Math.abs(c)) * (pose.sq?.[0] ?? 1), pose.sq?.[1] ?? 1]; }
    this.flip = face < 0;
    this.canvas = spr.render(pose, { face, dt, vx: vx, vy: vy, mode, alpha: alphaV, reset: o.reset });
    this.spr = spr;
    // shadow height: highest platform under the fighter
    let gy = 0;
    if (s) for (const pl of s.plats) if (!pl.broken && f.x >= pl.x0 && f.x <= pl.x1 && pl.y <= f.y + 0.01 && pl.y > gy) gy = pl.y;
    this.shadowY = gy;
    // husks fade
    for (let i = this.husks.length - 1; i >= 0; i--) { const h = this.husks[i]; h.t += dt; if (h.t > 4) this.husks.splice(i, 1); }
    for (let i = this.after.length - 1; i >= 0; i--) { const a = this.after[i]; a.t += dt; if (a.t > a.life) this.after.splice(i, 1); }
    // afterimages on fast moves
    if ((f.st === 'dash' || f.st === 'dodge' || (m && (m.dash || m.rush)) || f.st === 'ultAtk') && Math.floor(this.t * 30) % 2 === 0) this.addAfterimage(0.18);
    // cosmetic trail
    if (this.trail && this.trail.key !== 'none' && this.fx) {
      this.trailT -= dt;
      const moving = Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01;
      if (this.trailT <= 0 && moving) {
        this.trailT = 0.05;
        const cols = (this.trail.colors || [0xffffff]);
        const name = { bubbleS: 'bubble', note: 'note', sparkle: 'star', dot: 'px', pixelS: 'px', petal: 'petal' }[this.trail.spr] || 'px';
        const hx = x + (Math.random() - 0.5) * 0.4, hy = y + 0.4 + Math.random() * 0.8;
        if (name === 'bubble') this.fx.bubbleBurst(hx, hy, 1, 0.6);
        else if (name === 'px') this.fx.pixels(hx, hy, 2, { colors: cols, sp1: 0.6, up: 0.8, grav: 1, l1: 0.6 });
        else this.fx.icons(hx, hy, 1, name, cols, { sp1: 0.6, up: 0.6, grav: 0.5, l1: 0.8 });
      }
    }
    // Puru follows Mimi when held
    if (this.puru) this.puruHeld = f.cs?.puru === 'held';
    this.f = f;
  }
  addAfterimage(life = 0.2) {
    if (!this.canvas) return;
    const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d'); g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = this.demon ? '#c0182a' : ['#ff5a3a', '#3f8fff'][this.i] || '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    // checkerboard dither instead of soft transparency
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < c.height; y++) for (let x = (y & 1); x < c.width; x += 2) g.fillRect(x, y, 1, 1);
    g.globalCompositeOperation = 'source-over';
    this.after.push({ c, x: this.x, y: this.y, flip: this.flip, t: 0, life, ox: this.spr.ox, oy: this.spr.oy });
    if (this.after.length > 8) this.after.shift();
  }
  spawnHusk() {
    if (!this.canvas) return;
    const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d'); g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.55; g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, c.width, c.height);
    this.husks.push({ c, x: this.x - this.face * 0.15, y: this.y, flip: this.flip, t: 0, ox: this.spr.ox, oy: this.spr.oy });
  }
  headPos() {
    const spr = this.active;
    const h = spr.J ? spr.J.head : [0, 60];
    return { x: this.x + (this.flip ? -h[0] : h[0]) / PPU, y: this.y + h[1] / PPU };
  }
  handPos(front = true) {
    const spr = this.active;
    const h = spr.J ? (front ? spr.J.armF.h : spr.J.armB.h) : [20, 40];
    return { x: this.x + (this.flip ? -h[0] : h[0]) / PPU, y: this.y + h[1] / PPU };
  }
  blit(d, canvas, x, y, flip, ox, oy) {
    const g = d.g;
    const dx = d.bx(x) - (flip ? canvas.width - ox : ox), dy = d.by(y) - oy;
    if (!flip) g.drawImage(canvas, dx, dy);
    else { g.save(); g.translate(dx + canvas.width, dy); g.scale(-1, 1); g.drawImage(canvas, 0, 0); g.restore(); }
  }
  drawShadow(d) {
    if (!this.visible) return;
    const g = d.g;
    const h = Math.max(0, this.y - this.shadowY);
    const w = Math.max(4, Math.round((CHARS[this.char]?.w || 0.6) * PPU * 0.75 * (1 - Math.min(0.6, h * 0.12)) * (this.demon ? 1.2 : 1)));
    const cx = d.bx(this.x), cy = d.by(this.shadowY);
    g.fillStyle = 'rgba(6,10,14,0.42)';
    for (let yy = -1; yy <= 1; yy++) { const ww = Math.round(w * (yy === 0 ? 1 : 0.75)); g.fillRect(cx - ww, cy + yy, ww * 2, 1); }
  }
  draw(d, o = {}) {
    if (!this.visible || !this.canvas) return;
    const g = d.g;
    for (const h of this.husks) {
      if (h.t > 3 && Math.floor(h.t * 20) % 2) continue;
      this.blit(d, h.c, h.x, h.y, h.flip, h.ox, h.oy);
    }
    for (const a of this.after) {
      const k = a.t / a.life;
      if (k > 0.5 && (Math.floor(this.t * 60) & 1)) continue;
      this.blit(d, a.c, a.x, a.y, a.flip, a.ox, a.oy);
    }
    if (this.puru && this.puruHeld && !o.noPuru) this.drawPuru(d, this.x - this.face * 0.55, this.y + 1.45 + Math.sin(this.t * 3) * 0.06, 'happy');
    this.blit(d, this.canvas, this.x, this.y, this.flip, this.spr.ox, this.spr.oy);
    // dizzy stars orbit the head
    if (this.f?.st === 'dizzy' || this.f?.st === 'bubbled' && false) {
      const hp = this.headPos();
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + i * 2.1;
        const img = bitmap('star', '#fff08a');
        g.drawImage(img, d.bx(hp.x + Math.cos(a) * 0.32) - 4, d.by(hp.y + 0.38 + Math.sin(a) * 0.08) - 4);
      }
    }
    if (this.f?.st === 'sleep') { const hp = this.headPos(); const img = bitmap('zz', '#cfe8ff'); g.drawImage(img, d.bx(hp.x + 0.3) + Math.round(Math.sin(this.t * 2) * 2), d.by(hp.y + 0.5 + (this.t % 1) * 0.3)); }
  }
  drawPuru(d, x, y, mood, mode) {
    const c = this.puru.render(1 / 60, { face: this.face, mood, mode });
    this.blit(d, c, x, y, this.face < 0, 17, 14);
  }
  // white/black silhouette for anime impact frames
  drawSilhouette(d, color = '#ffffff') {
    if (!this.canvas) return;
    if (!this._sil) { this._sil = document.createElement('canvas'); }
    const c = this._sil; c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over';
    this.blit(d, c, this.x, this.y, this.flip, this.spr.ox, this.spr.oy);
  }
  dispose() {}
}

function cssU(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
}
