// CharSprite: turns a pose into a freshly rasterized pixel-art sprite every frame.
// Handles secondary motion (verlet chains for headband tails, ribbons, antennae, skirts),
// facing, flash/tint modes and the per-character draw functions.
import { PixBuf } from '../raster.js';
import { Painter, setupGroups, gloveMats } from './kit.js';
import { buildJoints, BASE_POSE } from './skeleton.js';
import { PPU } from '../display.js';
import { CHAR_DEFS } from './chars.js';

class Chain {
  constructor(n, seg, o = {}) {
    this.n = n; this.seg = seg; this.o = o;
    this.p = []; this.q = [];
    for (let i = 0; i < n; i++) { this.p.push([0, -i * seg]); this.q.push([0, -i * seg]); }
    this.init = false;
  }
  // anchor in local px; shift = inertial offset applied this frame (local px); gravity (px/frame^2)
  step(anchor, shift, dt, wind = 0, t = 0) {
    const o = this.o;
    if (!this.init) {
      this.init = true;
      for (let i = 0; i < this.n; i++) {
        const d = o.rest || [-0.7, -0.7];
        this.p[i] = [anchor[0] + d[0] * this.seg * i, anchor[1] + d[1] * this.seg * i];
        this.q[i] = [this.p[i][0], this.p[i][1]];
      }
    }
    const grav = (o.grav ?? -0.35) * (dt * 60);
    const damp = o.damp ?? 0.86;
    this.p[0] = [anchor[0], anchor[1]]; this.q[0] = [anchor[0], anchor[1]];
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], q = this.q[i];
      const vx = (p[0] - q[0]) * damp, vy = (p[1] - q[1]) * damp;
      q[0] = p[0]; q[1] = p[1];
      p[0] += vx - shift[0] * (o.inertia ?? 0.9) + (o.drift ? o.drift[0] : 0) + Math.sin(t * (o.wf || 3) + i * 0.9) * wind;
      p[1] += vy - shift[1] * (o.inertia ?? 0.9) + grav + (o.drift ? o.drift[1] : 0);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = (d - this.seg) / d;
        if (i === 1) { b[0] -= dx * k; b[1] -= dy * k; }
        else { a[0] += dx * k * 0.5; a[1] += dy * k * 0.5; b[0] -= dx * k * 0.5; b[1] -= dy * k * 0.5; }
      }
      // stiffness: keep near the rest direction
      if (o.stiff) {
        const rd = o.rest || [-0.7, -0.7];
        for (let i = 1; i < this.n; i++) {
          const tx = this.p[0][0] + rd[0] * this.seg * i, ty = this.p[0][1] + rd[1] * this.seg * i;
          this.p[i][0] += (tx - this.p[i][0]) * o.stiff; this.p[i][1] += (ty - this.p[i][1]) * o.stiff;
        }
      }
      if (o.floor !== undefined) for (let i = 1; i < this.n; i++) if (this.p[i][1] < o.floor) this.p[i][1] = o.floor;
    }
  }
  snapTo(anchor) { this.init = false; this.step(anchor, [0, 0], 1 / 60); }
}

export class CharSprite {
  constructor(charId, cos = {}, o = {}) {
    this.charId = charId;
    this.def = CHAR_DEFS[charId] || CHAR_DEFS.jim;
    this.cos = cos;
    this.scale = o.scale || 1; // art density multiplier (portraits / cut-ins)
    const S = this.def.box;
    this.buf = new PixBuf(Math.ceil(S[0] * this.scale), Math.ceil(S[1] * this.scale));
    this.ox = Math.round(S[2] * this.scale); this.oy = Math.round(S[3] * this.scale);
    this.pal = this.def.palette(cos.skin || 'default', cos);
    this.glove = gloveMats(cos.gloves || 'default');
    setupGroups(this.buf, this.pal);
    this.chains = {};
    for (const c of this.def.chains || []) this.chains[c.id] = new Chain(c.n, c.seg * this.scale, c);
    this.lastAnch = null;
    this.t = 0;
    this.dims = this.def.dims;
  }
  setCos(cos) {
    this.cos = cos;
    this.pal = this.def.palette(cos.skin || 'default', cos);
    this.glove = gloveMats(cos.gloves || 'default');
    setupGroups(this.buf, this.pal);
  }
  // pose: skeleton pose; o: { face (+1/-1), dt, vx, vy (world units/frame), mode, alpha, t }
  render(pose, o = {}) {
    const dt = o.dt ?? 1 / 60;
    this.t += dt;
    const P0 = pose || BASE_POSE;
    const s = this.scale;
    const J = buildJoints(this.def.dims, P0);
    if (s !== 1) scaleJ(J, s);
    const B = this.buf;
    B.clear();
    B.face = o.face ?? 1;
    const P = new Painter(B, this.ox, this.oy);
    // secondary motion: inertial shift from world motion (in local px, facing-corrected)
    const face = o.face ?? 1;
    const shift = [((o.vx || 0) * PPU * s) * face, (o.vy || 0) * PPU * s];
    const ctx = { pal: this.pal, pose: P0, t: this.t, glove: this.glove, cos: this.cos, scale: s, chains: this.chains, demon: this.def.demon, o };
    for (const c of this.def.chains || []) {
      const ch = this.chains[c.id];
      const a = c.anchor(J, P0, ctx);
      if (o.reset) ch.snapTo(a);
      ch.step(a, shift, dt, c.wind || 0, this.t);
    }
    this.def.draw(P, J, P0, ctx);
    if (P0.smear) this.drawSmear(P, J, P0, s);
    this.J = J;
    const canvas = B.finish({ mode: o.mode, alpha: o.alpha });
    return canvas;
  }
  // anime smear: a flat, outlined arc trailing the striking limb (pure pixel shapes, no blur)
  drawSmear(P, J, pose, s) {
    const sm = pose.smear;
    const U = PPU * s;
    const end = sm.limb === 'hF' ? J.armF.h : sm.limb === 'hB' ? J.armB.h : sm.limb === 'fF' ? J.legF.a : J.legB.a;
    const from = [(sm.from[0] + (pose.rootX || 0)) * U * (pose.sq?.[0] ?? 1), (sm.from[1] + (pose.rootY || 0)) * U * (pose.sq?.[1] ?? 1)];
    const dx = end[0] - from[0], dy = end[1] - from[1];
    const L = Math.hypot(dx, dy);
    if (L < 4 * s) return;
    const nx = -dy / L, ny = dx / L, arc = (sm.arc || 0) * L * 0.6;
    const n = 8, pts = [];
    const long = sm.long || 1;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const bu = 1 - (1 - u) * long;
      const b = 4 * bu * (1 - bu);
      pts.push([from[0] + dx * bu + nx * arc * b, from[1] + dy * bu + ny * arc * b]);
    }
    const pal = this.pal;
    const c0 = pal.smear0 ?? 0xfff4f0ff, c1 = pal.smear1 ?? 0xffffffff;
    const z = sm.limb === 'hB' || sm.limb === 'fB' ? 3.8 : 39.5;
    const w = (sm.k ? 5 : 8) * s;
    P.stroke(pts, 1 * s, w, { r: [c0, c0, c0, c0, c0], flat: 2 }, z, 21);
    P.stroke(pts.slice(3), 0.6 * s, w * 0.5, { r: [c1, c1, c1, c1, c1], flat: 2 }, z + 0.01, 21);
  }
  // head position (local px, y up) after last render
  headLocal() { return this.J ? this.J.head : [0, 60]; }
}

function scaleJ(J, s) {
  const S = (o) => { for (const k in o) { const v = o[k]; if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') o[k] = [v[0] * s, v[1] * s]; } };
  S(J); S(J.armF); S(J.armB); S(J.legF); S(J.legB);
}
