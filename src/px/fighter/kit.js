// Shared drawing kit for the humanoid mantis-shrimp fighters: a local-space painter on top of
// PixBuf, reusable materials/textures (shell plates, cloth folds, bandages, stripes) and body
// parts every fighter shares (stalk eyes, antennae, tail fan, dactyl feet, fists & gloves, mouths).
import { ramp, rampOf, hexU, darkU, lightU, mixU, phash, u32 } from '../pal.js';
import { GLOVES } from '../../data/cosmetics.js';

export const TAU = Math.PI * 2;

export class Painter {
  constructor(buf, ox, oy) { this.b = buf; this.ox = ox; this.oy = oy; }
  X(p) { return this.ox + p[0]; }
  Y(p) { return this.oy - p[1]; }
  cap(a, b, r0, r1, m, z, g) { this.b.capsule(this.ox + a[0], this.oy - a[1], this.ox + b[0], this.oy - b[1], r0, r1, m, z, g); }
  ell(c, rx, ry, ang, m, z, g) { this.b.ellipse(this.ox + c[0], this.oy - c[1], rx, ry, -ang, m, z, g); }
  poly(pts, m, z, g, o) {
    const a = new Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) { a[i * 2] = this.ox + pts[i][0]; a[i * 2 + 1] = this.oy - pts[i][1]; }
    this.b.poly(a, m, z, g, o);
  }
  stroke(pts, w0, w1, m, z, g) {
    const a = new Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) { a[i * 2] = this.ox + pts[i][0]; a[i * 2 + 1] = this.oy - pts[i][1]; }
    this.b.stroke(a, w0, w1, m, z, g);
  }
  line(a, b, c, z, g) { this.b.line(this.ox + a[0], this.oy - a[1], this.ox + b[0], this.oy - b[1], c, z, g); }
  px(p, c, z, g) { this.b.write(Math.round(this.ox + p[0] - 0.5), Math.round(this.oy - p[1] - 0.5), c, z, g); }
  rect(p, w, h, c, z, g) { this.b.rect(Math.round(this.ox + p[0]), Math.round(this.oy - p[1]), w, h, c, z, g); }
  paint(p, c, grp = 0) { this.b.paint(this.ox + p[0] - 0.5, this.oy - p[1] - 0.5, c, grp); }
  dot(p, r, c, grp = 0) { this.b.paintCircle(this.ox + p[0], this.oy - p[1], r, c, grp); }
}

// ------------------------------------------------------------------ vector helpers
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const perp = (a) => [-a[1], a[0]];
export const dir = (ang) => [Math.sin(ang), Math.cos(ang)]; // angle from +y (up), positive -> forward
export const along = (p, ang, d) => [p[0] + Math.sin(ang) * d, p[1] + Math.cos(ang) * d];
export const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

// ------------------------------------------------------------------ materials & textures
export const R = (hex, o) => ramp(hex, o);
export const RO = (list) => rampOf(list);
export const M = (r, o = {}) => ({ r, ...o });
const clampT = (t) => (t < 0 ? 0 : t > 4 ? 4 : t);

// crustacean shell segments along a capsule axis
export const texPlates = (period = 4, o = {}) => (t, u, v, x, y) => {
  const k = Math.floor(u + (o.off || 0)) % period;
  if (k === 0) return clampT(t - 1);
  if (k === 1 && t >= 2 && Math.abs(v) < 0.6) return clampT(t + 1);
  if (o.spots && phash(Math.floor(u / 2), Math.floor((v + 1) * 2), o.seed || 3) < o.spots) return clampT(t + (o.spotDir || 1));
  return t;
};
// fabric: soft fold lines + weave noise
export const texCloth = (o = {}) => (t, u, v, x, y) => {
  const f = Math.sin(u * (o.fold || 0.55) + v * (o.skew || 2.2) + (o.ph || 0));
  if (f > 0.93) return clampT(t - 1);
  if (o.weave && ((x + y) & 1) && t === 2 && phash(x, y, 7) < 0.25) return 1;
  return t;
};
// bandage wraps: diagonal bands
export const texWrap = (period = 4) => (t, u, v) => {
  const k = Math.floor(u + v * 2.4) % period;
  return k === 0 ? clampT(t - 1) : k === 1 && t > 1 ? clampT(t + 1) : t;
};
// stripes across the axis (zebra), alternating between two ramps
export const texStripes = (period, alt, o = {}) => (t, u, v, x, y) => {
  const w = Math.sin(v * (o.wav || 1.5) + (o.ph || 0)) * (o.amp || 1.2);
  const k = Math.floor((u + w) / period) % 2;
  if (k === 0) return alt[clampT(t + (o.shift || 0))];
  return t;
};
export const texSpots = (dens, alt, seed = 1, size = 2) => (t, u, v, x, y) => {
  if (phash(Math.floor(x / size), Math.floor(y / size), seed) < dens) return alt[clampT(t)];
  return t;
};
// horizontal reflective bands (traffic cone)
export const texBands = (rows, alt) => (t, u, v, x, y) => (rows(y) ? alt[clampT(t)] : t);

// ------------------------------------------------------------------ outlines / groups
// group ids (also z-ordering hints)
export const G = { legB: 1, armB: 2, tail: 3, torso: 4, belly: 5, clothB: 6, head: 7, eyes: 8, ant: 9, legF: 10, clothF: 11, armF: 12, acc: 13, fx: 14, prop: 15, hair: 16, cape: 17, hat: 18, puru: 19, faceAcc: 20 };

export function setupGroups(buf, pal) {
  const ink = pal.ink ?? u32(22, 12, 18);
  for (let g = 1; g < 32; g++) buf.group(g, ink, pal.inkLight ? pal.inkLight : mixU(ink, u32(90, 60, 70), 0.35));
}

// ------------------------------------------------------------------ parts
// stalk eye: stalk from base to eye; eyeball painted per pixel: sclera, mid-band, pupil, lid
export function eyeStalk(P, base, ang, L, er, o) {
  const tip = along(base, ang, L);
  P.cap(base, tip, o.stalkR ?? 1.5, o.stalkR2 ?? 1.3, o.stalk, o.z, G.eyes);
  const c = [tip[0] + Math.sin(ang) * er * 0.55, tip[1] + Math.cos(ang) * er * 0.55];
  const rx = er * 0.86, ry = er;
  P.ell(c, rx, ry, 0, o.eye, o.z + 0.2, G.eyes);
  const ink = o.ink;
  const lk = o.look || [1, 0];
  const open = o.open ?? 1;
  const lid = open <= 0.2 ? 1.2 : (o.lid ?? 0.15);
  const slant = o.slant ?? 0;
  const pr = Math.max(1, er * 0.46 * (o.pupil ?? 1));
  const px0 = c[0] + lk[0] * er * 0.3, py0 = c[1] + lk[1] * er * 0.25 - 0.3;
  const lidC = o.lidC ?? o.stalk.r[3], lidLine = ink;
  for (let y = Math.floor(c[1] - ry - 1); y <= Math.ceil(c[1] + ry + 1); y++) {
    for (let x = Math.floor(c[0] - rx - 1); x <= Math.ceil(c[0] + rx + 1); x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const nx = (cx - c[0]) / rx, ny = (cy - c[1]) / ry;
      if (nx * nx + ny * ny > 1) continue;
      // lid: everything above the (slanted) lid line
      const lidY = 1 - lid * 2 + nx * slant; // in normalised units (+1 = top)
      if (ny > lidY - 1e-3 && lid > 0) {
        P.paint([cx, cy], ny < lidY + 2 / ry ? lidLine : lidC, G.eyes);
        continue;
      }
      if (Math.hypot(cx - px0, cy - py0) <= pr) { P.paint([cx, cy], o.pupilC ?? ink, G.eyes); continue; }
      if (o.band && Math.abs(cy - c[1]) < 0.5) P.paint([cx, cy], o.band, G.eyes);
    }
  }
  if (o.shine !== false && open > 0.2 && lid < 0.7) P.paint([px0 - pr * 0.6 + 0.5, py0 + pr * 0.6], o.shineC ?? u32(255, 255, 255), G.eyes);
  return c;
}

// antenna: chain of points (local), drawn as a 1-2px tapered whip
export function antenna(P, pts, m, z, w0 = 2, w1 = 1) { P.stroke(pts, w0, w1, m, z, G.ant); }

// tail fan (telson + uropods) attached behind the pelvis, pointing back/down
export function tailFan(P, root, ang, size, mats, z) {
  const segA = along(root, ang, size * 0.35);
  P.cap(root, segA, size * 0.22, size * 0.2, mats.seg, z, G.tail);
  const fanC = along(segA, ang, size * 0.25);
  const spread = 0.62;
  for (let k = -1; k <= 1; k++) {
    const a = ang + k * spread;
    const tip = along(fanC, a, size * (k === 0 ? 0.62 : 0.55));
    const m = k === 0 ? mats.telson : mats.uro;
    P.cap(fanC, tip, size * 0.08, size * (k === 0 ? 0.16 : 0.2), m, z - Math.abs(k) * 0.1, G.tail);
  }
}

// dactyl foot: little pointed shrimp foot or a shoe
export function foot(P, ankle, facing, m, z, g, o = {}) {
  const L = o.len ?? 7, H = o.h ?? 3;
  const toe = [ankle[0] + L * facing, ankle[1] - (o.drop ?? 2)];
  if (o.shoe) {
    const s = o.shoe;
    P.poly([[ankle[0] - 3, ankle[1] + 2], [ankle[0] + 2, ankle[1] + 2], [toe[0] + 1, toe[1] + 1], [toe[0] + 2, toe[1] - 1], [ankle[0] - 4, toe[1] - 1]], s.m, z, g);
    if (s.sole) P.poly([[ankle[0] - 4, toe[1]], [toe[0] + 2, toe[1]], [toe[0] + 2, toe[1] - 1.2], [ankle[0] - 4, toe[1] - 1.2]], s.sole, z + 0.05, g);
    if (s.lace) { P.px([ankle[0] + 1, ankle[1] + 1], s.lace, z + 0.1, g); P.px([ankle[0] + 3, ankle[1]], s.lace, z + 0.1, g); }
    if (s.toecap) P.px([toe[0] + 1, toe[1] + 0.5], s.toecap, z + 0.1, g);
    return toe;
  }
  P.cap(ankle, toe, H * 0.6, 0.8, m, z, g);
  P.cap([ankle[0] - facing, ankle[1] - 1], [ankle[0] - facing * 3, ankle[1] - 2.2], 1.2, 0.6, m, z - 0.05, g);
  return toe;
}

// glove/fist. kind: 'fist' | 'open' | 'club' | 'spear' | 'point'
export function fist(P, wrist, ang, size, look, z, g, o = {}) {
  const gl = o.glove;
  if (gl) {
    // boxing glove style cosmetic (chunkier than a bare fist)
    size *= 1.3;
    const c = along(wrist, ang, size * 0.62);
    P.cap(wrist, along(wrist, ang, size * 0.18), size * 0.42, size * 0.42, gl.cuff, z, g);
    P.ell(c, size * 0.62, size * 0.56, ang, gl.main, z + 0.1, g);
    const th = along(c, ang - 1.4, size * 0.38);
    P.ell(th, size * 0.22, size * 0.2, ang, gl.main, z + 0.15, g);
    if (gl.band) for (let k = -2; k <= 2; k++) { const p = along(along(wrist, ang, size * 0.2), ang + Math.PI / 2, k * 0.8); P.paint(p, gl.band, g); }
    if (gl.spikes) for (let k = -1; k <= 1; k++) { const p = along(c, ang + k * 0.6, size * 0.62); P.px(p, gl.spikes, z + 0.3, g); }
    if (gl.glint) P.paint(along(c, ang - 0.5, size * 0.3), u32(255, 255, 240), g);
    return c;
  }
  const kind = o.kind || 'fist';
  if (kind === 'spear') {
    // spearer claw: long barbed dactyl
    const tip = along(wrist, ang, size * 2.0);
    P.cap(wrist, along(wrist, ang, size * 0.7), size * 0.38, size * 0.32, look, z, g);
    P.cap(along(wrist, ang, size * 0.6), tip, size * 0.24, 0.6, o.spear || look, z + 0.05, g);
    for (let k = 1; k <= 3; k++) {
      const b = along(wrist, ang, size * (0.75 + k * 0.32));
      const bt = along(b, ang - 2.4, size * 0.32);
      P.line(b, bt, o.barb || look.r[3], z + 0.1, g);
    }
    return tip;
  }
  if (kind === 'open') {
    const c = along(wrist, ang, size * 0.5);
    P.ell(c, size * 0.5, size * 0.36, ang, look, z, g);
    for (let k = -1; k <= 1; k++) P.cap(along(c, ang, size * 0.3), along(c, ang + k * 0.35, size * 0.85), 0.9, 0.7, look, z + 0.05, g);
    return c;
  }
  // raptorial "club" fist: rounded knuckle with a heel and a folded dactyl
  const c = along(wrist, ang, size * 0.55);
  P.cap(wrist, c, size * 0.36, size * 0.48, look, z, g);
  P.ell(along(c, ang, size * 0.1), size * 0.58, size * 0.5, ang, look, z + 0.05, g);
  if (o.wrap) {
    // wrapped knuckles: lighter bandage bands across the fist
    P.ell(along(c, ang, size * 0.12), size * 0.5, size * 0.44, ang, o.wrap, z + 0.1, g);
  }
  // dactyl crease (the folded finger)
  const a1 = along(c, ang + Math.PI * 0.55, size * 0.35), a2 = along(c, ang + Math.PI * 0.15, size * 0.5);
  P.line(a1, a2, o.crease ?? look.r[0], z + 0.2, g);
  if (o.knuckle !== false) P.paint(along(c, ang - 0.6, size * 0.35), look.r[4], g);
  return c;
}

export function gloveMats(key) {
  const G0 = GLOVES.find((g) => g.key === key);
  if (!G0 || key === 'default') return null;
  const h = (n) => '#' + n.toString(16).padStart(6, '0');
  const main = M(R(h(G0.main)));
  const tex = G0.pattern?.type === 'stripes' ? texStripes(2, R(h(G0.pattern.color)), { amp: 0 }) : G0.pattern?.type === 'spots' ? texSpots(0.25, R(h(G0.pattern.color)), 3, 1) : G0.pattern?.type === 'flame' ? (t, u, v, x, y) => (phash(x, y, 2) < 0.18 ? hexU('#ff8a2a') : t) : null;
  if (tex) main.tex = tex;
  return { main, cuff: M(R(h(G0.cuff))), band: hexU(h(G0.band)), spikes: G0.spikes ? hexU(h(G0.spikes)) : 0, glint: !!G0.glint };
}

// mouth decals. kind: neutral, grin, shout, hurt, smug, ko, sleep, cute, fangs, eat, scared, flat
export function mouth(P, c, kind, w, o) {
  const ink = o.ink, teeth = o.teeth ?? u32(250, 246, 230), tongue = o.tongue ?? u32(214, 80, 90);
  const fx = 1; // faces forward (+x)
  const x0 = c[0] - w / 2, y = c[1];
  const row = (y0, xa, xb, col) => { for (let x = Math.floor(xa); x <= Math.ceil(xb); x++) P.paint([x + 0.5, y0 + 0.5], col, G.head); };
  switch (kind) {
    case 'grin': row(y, x0, x0 + w, ink); row(y - 1, x0 + 1, x0 + w - 1, ink); row(y, x0 + 1, x0 + w - 1, teeth); P.paint([x0 + w + 0.5, y + 1.5], ink, G.head); break;
    case 'shout': row(y + 1, x0, x0 + w, ink); row(y, x0, x0 + w, ink); row(y - 1, x0, x0 + w, tongue); row(y - 2, x0 + 1, x0 + w - 1, ink); row(y + 1, x0 + 1, x0 + w - 1, teeth); break;
    case 'hurt': row(y, x0, x0 + w, ink); row(y - 1, x0 + 1, x0 + w - 1, teeth); P.paint([x0 + 0.5, y - 0.5], ink, G.head); P.paint([x0 + w + 0.5, y - 0.5], ink, G.head); break;
    case 'smug': row(y, x0 + 1, x0 + w, ink); P.paint([x0 + w + 0.5, y + 1.5], ink, G.head); break;
    case 'ko': row(y, x0, x0 + w, ink); row(y - 1, x0 + 1, x0 + 2, tongue); break;
    case 'sleep': row(y, x0 + 1, x0 + w - 1, ink); break;
    case 'cute': P.paint([x0 + 1.5, y + 0.5], ink, G.head); P.paint([x0 + 2.5, y - 0.5], ink, G.head); P.paint([x0 + 3.5, y + 0.5], ink, G.head); break;
    case 'fangs': row(y, x0, x0 + w, ink); row(y - 1, x0, x0 + w, u32(120, 10, 30)); P.paint([x0 + 1.5, y - 0.5], teeth, G.head); P.paint([x0 + w - 0.5, y - 0.5], teeth, G.head); row(y - 2, x0 + 1, x0 + w - 1, ink); break;
    case 'eat': row(y, x0, x0 + w, ink); row(y - 1, x0, x0 + w, ink); row(y - 1, x0 + 1, x0 + w - 1, tongue); break;
    case 'scared': row(y, x0 + 1, x0 + w - 1, ink); row(y - 1, x0, x0 + w, ink); row(y - 1, x0 + 1, x0 + w - 1, u32(60, 20, 30)); break;
    default: row(y, x0 + 1, x0 + w, ink); break;
  }
}

export { ramp, rampOf, hexU, darkU, lightU, mixU, phash, u32 };
