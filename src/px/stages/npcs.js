// Background NPCs for the 2D stages, drawn with the same PixBuf rasterizer + Painter as the
// fighters (banded shading, crisp outlines). Each NPC bakes a small set of pose frames once at
// construction; per frame we only pick a frame and blit it.
//   Referee      - little old mantis shrimp in a striped shirt with a whistle (Rust Pit)
//   Spectator    - sad grouper / blue tang with a flag / crab with a sign
//   Bartender    - mustachioed octopus in a bowler hat polishing glasses (Cantina, Bar)
//   Mechanic     - drunk crab mechanic asleep on a barrel, snoring bubbles
//   Patron       - cantina crowd: pufferfish, sombrero crab, seahorse, octopus guitarist, lobster
//   MadamMolt    - elegant old mantis shrimp lady with shawl, pearls, spectacles and a turban
import { PixBuf } from '../raster.js';
import { Painter, M, R, eyeStalk, mouth, G, along, u32, hexU, mixU } from '../fighter/kit.js';
import { PPU } from '../display.js';
import { pbx, pby, C, clamp, Pix, text } from './common.js';

const INK = hexU('#140c12');
const INKL = hexU('#3a2430');
const TAU = Math.PI * 2;

function setup(buf) { for (let g = 1; g < 32; g++) buf.group(g, INK, INKL); }
function copyCanvas(src, fog, fogAmt) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  if (fog && fogAmt > 0) {
    const img = g.getImageData(0, 0, c.width, c.height), d = new Uint32Array(img.data.buffer);
    for (let i = 0; i < d.length; i++) if (d[i] >>> 24) d[i] = mixU(d[i], fog, fogAmt);
    g.putImageData(img, 0, 0);
  }
  return c;
}
// bake a frame: fn(P, buf) draws in local coords (origin = feet, y up)
function frame(w, h, ox, oy, fn, o = {}) {
  const B = new PixBuf(w, h); setup(B); B.clear(); B.face = 1;
  if (o.light) B.setLight(...o.light);
  const P = new Painter(B, ox, oy);
  fn(P, B);
  const cv = copyCanvas(B.finish(), o.fog, o.fogAmt ?? 0);
  return { cv, ox, oy };
}
const stripes = (alt, w = 2) => (t, u, v, x) => (((x / w) | 0) & 1 ? alt[t < 0 ? 0 : t > 4 ? 4 : t] : t);
const spots = (alt, dens, seed, sz = 2) => (t, u, v, x, y) => (hash(Math.floor(x / sz), Math.floor(y / sz), seed) < dens ? alt[t < 0 ? 0 : t > 4 ? 4 : t] : t);
function hash(x, y, s) { let n = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 999, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); n = Math.imul(n ^ (n >>> 15), 0x85ebca6b); n ^= n >>> 13; return ((n >>> 0) % 10000) / 10000; }

// base class: frames dictionary, position, parallax drawing
class NPC {
  constructor() { this.x = 0; this.y = 0; this.face = 1; this.t = 0; this.cur = null; this.react0 = 0; }
  drawFrame(d, f, p = 1, flip = this.face < 0, dy = 0) {
    if (!f) return;
    const X = pbx(d, this.x, p), Y = pby(d, this.y, 1) + dy;
    const cv = f.cv;
    if (X - cv.width > d.vw || X + cv.width < 0 || Y - cv.height > d.vh || Y + cv.height < 0) return;
    if (!flip) d.g.drawImage(cv, X - f.ox, Y - f.oy);
    else { d.g.save(); d.g.translate(X + f.ox, Y - f.oy); d.g.scale(-1, 1); d.g.drawImage(cv, 0, 0); d.g.restore(); }
  }
}

// =========================================================================== REFEREE
const REF = {
  shell: M(R('#e2703e', { spread: 0.12 })), shellB: M(R('#c85a32', { spread: 0.12 })), belly: M(R('#f0c8a0', { spread: 0.1 })),
  shirt: null, pants: M(R('#2c2a36', { spread: 0.08 })), shoe: M(R('#1c1a22', { spread: 0.06 })), white: M(R('#ece8e0', { spread: 0.07 })),
  eye: M(R('#f4f0dc', { spread: 0.08 }), { bias: 0.3 }), whistle: M(R('#b8c4cc', { spread: 0.12 })),
};
REF.shirt = M(R('#ece6da', { spread: 0.1 }), { tex: stripes(R('#24222a', { spread: 0.06 }), 2) });
function drawRef(P, o) {
  const bob = o.bob || 0, lean = o.lean ?? 0.3;
  const hy = 20 + bob, nx = 6 + lean * 6;
  const hip = [0, hy], neck = [nx, 40 + bob];
  // back arm
  arm(P, [2, 37 + bob], o.armB || 'back', REF, 6, true);
  // legs (black trousers, little shoes)
  const leg = (h, k, a, z, back) => {
    const m = back ? { ...REF.pants, bias: -0.3 } : REF.pants;
    P.cap(h, k, 3.6, 3.0, m, z, G.legB); P.cap(k, a, 3.0, 2.6, m, z + 0.1, G.legB);
    P.poly([[a[0] - 3, a[1] + 1], [a[0] + 2, a[1] + 2], [a[0] + 6, a[1] - 1], [a[0] + 6, a[1] - 2.5], [a[0] - 3.5, a[1] - 2.5]], back ? { ...REF.shoe, bias: -0.3 } : REF.shoe, z + 0.2, G.legB);
    P.line([a[0] - 3, a[1] - 2.2], [a[0] + 5.5, a[1] - 2.2], hexU('#5a5660'), z + 0.3, G.legB);
  };
  const st = o.step || 0;
  leg([-2, hy], [-1 - st, 10 + bob * 0.5], [-3 - st * 2, 2.5], 8, true);
  // tail fan
  P.cap([-6, 19 + bob], [-11, 15 + bob], 2.4, 2, REF.shellB, 10, G.tail);
  for (const a of [-0.5, 0, 0.5]) P.cap([-11, 15 + bob], along([-11, 15 + bob], -2.1 + a, 6), 0.8, 2, REF.shellB, 10.2, G.tail);
  // torso: shirt with a bit of a paunch
  const T = [[-7, hy - 2], [6, hy - 2], [11, hy + 5], [11, hy + 12], [nx + 3, 39 + bob], [nx - 2, 42 + bob], [-3, 40 + bob], [-8, 35 + bob], [-9, hy + 7]];
  P.poly(T, REF.shirt, 20, G.torso);
  P.ell([5, hy + 6], 7, 7, 0, REF.shirt, 20.2, G.torso);
  // belt
  P.poly([[-7.5, hy - 2], [7, hy - 2], [7.5, hy + 1], [-8, hy + 1]], REF.pants, 21, G.clothB);
  P.px([5, hy - 0.5], hexU('#c8b060'), 21.2, G.clothB);
  // collar + whistle cord
  P.cap([nx - 4, 40 + bob], [nx + 3, 39 + bob], 1.8, 1.6, REF.white, 22, G.clothB);
  if (o.armF !== 'whistle') {
    P.line([nx + 2, 39 + bob], [nx + 4, 30 + bob], INK, 23, G.acc);
    P.cap([nx + 3.5, 29.5 + bob], [nx + 6, 29.5 + bob], 1.4, 1.2, REF.whistle, 23.5, G.acc);
  }
  // head
  const H = (x, y) => [nx + 4 + x, 47 + bob + y];
  P.ell(H(0, 0), 7.6, 6.6, 0, REF.shell, 26, G.head);
  P.ell(H(3, -2.5), 4.6, 3.8, -0.2, REF.belly, 26.3, G.head);
  P.cap(H(3, 4), H(8.5, 2.5), 1.5, 0.8, REF.shellB, 26.4, G.head);
  // antennae (long, droopy)
  P.stroke([H(1, 6), H(-3, 12), H(-9, 14), H(-14, 11)], 1.4, 0.8, REF.shellB, 24, G.ant);
  P.stroke([H(2, 6), H(0, 13), H(-5, 17), H(-10, 17)], 1.2, 0.8, REF.shellB, 23.8, G.ant);
  // eyes on stalks (old: heavy lids) + bushy white brows
  const look = o.look || [1, 0];
  eyeStalk(P, H(-0.5, 5.2), 0.15, 3.2, 2.5, { stalk: { ...REF.shell, bias: -0.3 }, eye: { ...REF.eye, bias: 0 }, ink: INK, look, lid: o.lid ?? 0.38, slant: 0.4, z: 26.6, open: o.open ?? 1 });
  eyeStalk(P, H(3, 4.6), 0.45, 3.4, 2.8, { stalk: REF.shell, eye: REF.eye, ink: INK, look, lid: o.lid ?? 0.38, slant: 0.4, z: 27.6, open: o.open ?? 1 });
  P.cap(H(-3, 9.6), H(1.5, 10.4), 1.6, 1.2, REF.white, 28, G.hair);
  P.cap(H(2, 10), H(7.5, 9.2), 1.8, 1.2, REF.white, 28.1, G.hair);
  // droopy white mustache
  P.poly([H(4, -1), H(9, -1.5), H(10, -4.5), H(8, -3.2), H(6, -5), H(4.5, -3)], REF.white, 28.2, G.hair);
  if (o.armF === 'whistle') {
    P.cap(H(8, -3.5), H(12, -4), 1.6, 1.4, REF.whistle, 29, G.acc);
    P.px(H(12.5, -4.2), hexU('#ffffff'), 29.5, G.acc);
  }
  mouth(P, H(7, -5.4), o.mouth || 'flat', 3, { ink: INK });
  // front leg
  leg([2, hy], [4 + st, 10 + bob * 0.5], [3 + st * 2, 2.5], 30, false);
  // front arm
  arm(P, [4, 37 + bob], o.armF || 'back', REF, 40, false);
}
function arm(P, sh, kind, MAT, z, back) {
  const sl = back ? { ...MAT.shirt, bias: -0.35 } : MAT.shirt, sk = back ? { ...MAT.shell, bias: -0.3 } : MAT.shell;
  const A = {
    back: [[-3, -7], [-6, -11]], whistle: [[6, -4], [10, 6]], up: [[3, 10], [5, 21]], chopU: [[7, 2], [15, 7]], chopD: [[7, -2], [14, -7]],
    point: [[7, 0], [16, 2]], wave0: [[6, 8], [11, 16]], wave1: [[7, 7], [15, 13]], cheer: [[2, 9], [4, 19]], flinch: [[4, 4], [9, 12]], rest: [[1, -8], [3, -16]],
  }[kind] || [[-3, -7], [-6, -11]];
  const e = [sh[0] + A[0][0], sh[1] + A[0][1]], h = [sh[0] + A[1][0], sh[1] + A[1][1]];
  P.cap(sh, e, 2.6, 2.3, sl, z, back ? G.armB : G.armF);
  P.cap(e, h, 1.9, 1.7, sk, z + 0.1, back ? G.armB : G.armF);
  P.ell(h, 2.6, 2.3, 0, sk, z + 0.2, back ? G.armB : G.armF);
}
export class Referee extends NPC {
  constructor(o = {}) {
    super();
    const fog = o.fog ?? C('#0d3440'), fa = o.fogAmt ?? 0.18;
    const mk = (opts) => frame(52, 78, 20, 74, (P) => drawRef(P, opts), { fog, fogAmt: fa });
    this.F = {
      idle0: mk({}), idle1: mk({ bob: -0.6 }), lookB: mk({ look: [-1, 0.2] }), blink: mk({ open: 0 }),
      walk0: mk({ step: 1.5, bob: 0.4 }), walk1: mk({ step: -1.5, bob: 0.4 }),
      whistle: mk({ armF: 'whistle', armB: 'back', lid: 0.2 }), whistleUp: mk({ armF: 'whistle', armB: 'up', lid: 0.15 }),
      chopU: mk({ armF: 'chopU', armB: 'back', mouth: 'shout', lid: 0.2 }), chopD: mk({ armF: 'chopD', armB: 'back', mouth: 'shout', lid: 0.2 }),
      raise: mk({ armF: 'up', armB: 'back', mouth: 'grin', lid: 0.25 }), wave0: mk({ armF: 'wave0', armB: 'back', mouth: 'grin' }), wave1: mk({ armF: 'wave1', armB: 'back', mouth: 'grin' }),
      flinch: mk({ armF: 'flinch', armB: 'flinch', mouth: 'scared', lid: 0, lean: -0.1 }), point: mk({ armF: 'point', armB: 'back', mouth: 'shout', lid: 0.2 }),
    };
    this.home = 0; this.state = 'idle'; this.st = 0; this.blinkT = 2; this.walkPh = 0; this.target = 0; this.winSide = 1;
  }
  react(e) {
    switch (e.t) {
      case 'round': case 'fight': this.state = e.t === 'fight' ? 'whistle' : 'wave'; this.st = e.t === 'fight' ? 0.9 : 1.6; break;
      case 'hit': if (e.heavy && this.state === 'idle') { this.state = 'flinch'; this.st = 0.35; } break;
      case 'ko': this.state = 'count'; this.st = 3.2; break;
      case 'roundWin': this.state = 'raise'; this.st = 2.4; this.winSide = e.winner === 0 ? -1 : 1; break;
      default: break;
    }
  }
  update(dt, s) {
    this.t += dt; this.st -= dt; this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + Math.random() * 3;
    let mid = this.home;
    const fs = s?.fighters;
    if (fs && fs.length >= 2) mid = (fs[0].x + fs[1].x) / 2;
    if (this.state !== 'idle' && this.st <= 0) this.state = 'idle';
    // shuffle to keep the fight in view, never too close
    this.target = clamp(this.home + (mid - this.home) * 0.35, this.home - 2.4, this.home + 2.4);
    const dx = this.target - this.x;
    this.walking = this.state === 'idle' && Math.abs(dx) > 0.35;
    if (this.walking) { this.x += Math.sign(dx) * dt * 0.9; this.walkPh += dt * 7; }
    if (this.state === 'raise') this.face = this.winSide;
    else this.face = mid >= this.x ? 1 : -1;
  }
  draw(d, t, p = 0.96) {
    const F = this.F;
    let f = F.idle0;
    switch (this.state) {
      case 'whistle': f = Math.floor(this.st * 6) & 1 ? F.whistle : F.whistleUp; break;
      case 'wave': f = Math.floor(this.st * 5) & 1 ? F.wave0 : F.wave1; break;
      case 'count': f = Math.floor(this.st * 2.2) & 1 ? F.chopU : F.chopD; break;
      case 'raise': f = F.raise; break;
      case 'flinch': f = F.flinch; break;
      default:
        if (this.walking) f = Math.floor(this.walkPh) & 1 ? F.walk0 : F.walk1;
        else if (this.blinkT < 0) f = F.blink;
        else f = Math.floor(t * 1.4) & 1 ? F.idle0 : F.idle1;
    }
    this.drawFrame(d, f, p, this.face < 0, this.state === 'flinch' ? -1 : 0);
  }
}

// =========================================================================== SPECTATORS
function drawGrouper(P, o) {
  const body = M(R('#7a6a48', { spread: 0.11 }), { tex: spots(R('#5a4a30'), 0.12, 3, 3) }), fin = M(R('#6a5a3a', { spread: 0.1 })), lip = M(R('#a88a62', { spread: 0.1 })), eye = M(R('#e8e0c8'), { bias: 0.3 });
  const f = o.f || 0;
  P.poly([[-20, 14], [-30, 22 + f], [-31, 4 - f], [-21, 10]], fin, 4, G.tail);
  P.ell([-2, 14], 20, 12, 0, body, 10, G.torso);
  P.poly([[-6, 24], [2, 31], [8, 24]], fin, 8, G.torso);
  P.poly([[-4, 3], [2, -2 - f], [6, 4]], fin, 9, G.torso);
  P.ell([13, 9], 6, 4, 0.2, lip, 12, G.head);
  P.ell([12, 7], 5, 2.5, 0.3, { ...lip, bias: -0.2 }, 12.2, G.head);
  P.ell([8, 17], 3.4, 3.4, 0, eye, 13, G.eyes);
  P.dot([9, 16.5], 1.4, INK, G.eyes);
  P.line([5, 22], [11, 20.5], INK, 14, G.eyes); // sad brow
  if (o.mouth === 'oh') P.dot([16, 9], 1.5, INK, G.head);
  P.poly([[0, 12], [4, 6], [6, 14]], { ...fin, bias: 0.2 }, 11, G.armF);
}
function drawTang(P, o) {
  const body = M(R('#2a5ab8', { spread: 0.12 })), tail = M(R('#e8c030')), eye = M(R('#f0f0e0'), { bias: 0.3 });
  const f = o.f || 0;
  P.poly([[-9, 9], [-15, 14 + f], [-15, 3 - f]], tail, 4, G.tail);
  P.ell([0, 9], 10, 8, 0, body, 10, G.torso);
  P.poly([[-5, 16], [4, 18], [6, 15]], { ...body, bias: -0.3 }, 9, G.torso);
  P.ell([5, 11], 2.2, 2.4, 0, eye, 12, G.eyes); P.dot([6, 11], 1, INK, G.eyes);
  P.line([3, 14], [7, 13], INK, 13, G.eyes);
  // tiny flag (sad, drooping)
  P.line([2, 4], [8, 26], hexU('#8a6a4a'), 14, G.acc);
  const up = o.cheer ? 4 : 0;
  P.poly([[8, 26], [14, 24 - (o.cheer ? 0 : 3)], [8, 21]], M(R('#c83a2a')), 14.2, G.acc);
  P.ell([2, 5], 2.4, 1.8, 0, { ...body, bias: 0.2 }, 13, G.armF);
  if (up) P.px([10, 23], hexU('#ffffff'), 15, G.acc);
}
function drawCrab(P, o) {
  const sh = M(R('#b8402a', { spread: 0.12 })), leg = M(R('#a03a28', { spread: 0.1 })), eye = M(R('#f0ecd8'), { bias: 0.3 }), bucket = M(R('#5a6a6a', { spread: 0.1 })), sign = M(R('#d8c8a0', { spread: 0.08 }));
  // upturned bucket
  P.poly([[-9, 0], [9, 0], [7, 12], [-7, 12]], bucket, 2, G.prop);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.stroke([[s * (5 + k * 2), 16], [s * (10 + k * 2), 18], [s * (12 + k * 2), 12]], 1.8, 1.4, leg, 4, G.legB);
  P.ell([0, 18], 10, 6, 0, sh, 10, G.torso);
  for (const s of [-1, 1]) { P.line([s * 3, 22], [s * 4, 27], INK, 11, G.eyes); P.ell([s * 4, 28], 1.8, 1.8, 0, eye, 12, G.eyes); P.dot([s * 4 + 0.5, 28], 0.8, INK, G.eyes); }
  const up = o.cheer ? 8 : 0;
  // claws holding a sign
  P.stroke([[-7, 18], [-12, 24 + up * 0.5], [-10, 30 + up]], 2.2, 2, leg, 14, G.armF);
  P.stroke([[7, 18], [12, 24 + up * 0.5], [10, 30 + up]], 2.2, 2, leg, 14, G.armF);
  P.poly([[-12, 29 + up], [12, 29 + up], [12, 39 + up], [-12, 39 + up]], sign, 15, G.acc);
  P.line([-10, 36 + up], [10, 36 + up], hexU('#c83a2a'), 16, G.acc);
  for (let x = -9; x < 9; x += 2) P.px([x + 0.5, 33.5 + up], hexU('#3a2a20'), 16, G.acc);
  P.line([-3, 14], [3, 14], INK, 13, G.head);
}
export class Spectator extends NPC {
  constructor(kind, x, y, face = 1, o = {}) {
    super();
    this.kind = kind; this.x = x; this.y = y; this.face = face; this.y0 = y;
    this.behind = kind !== 'crab';
    const fog = o.fog ?? C('#0d3440'), fa = o.fogAmt ?? 0.3;
    const fn = kind === 'grouper' ? drawGrouper : kind === 'tang' ? drawTang : drawCrab;
    const sz = kind === 'grouper' ? [70, 44, 34, 40] : kind === 'tang' ? [36, 34, 17, 30] : [36, 52, 18, 50];
    const mk = (opts) => frame(sz[0], sz[1], sz[2], sz[3], (P) => fn(P, opts), { fog, fogAmt: fa });
    this.F = { a: mk({ f: 0 }), b: mk({ f: 1.5 }), oh: mk({ f: 0, mouth: 'oh' }), cheer: mk({ f: 1, cheer: true }) };
    this.ph = x * 3; this.rt = 0; this.rk = 'oh';
  }
  react(e) { if (e.t === 'hit' && e.heavy) { this.rt = 0.6; this.rk = 'oh'; } if (e.t === 'ko' || e.t === 'roundWin') { this.rt = 2; this.rk = 'cheer'; } }
  update(dt) { this.t += dt; this.rt -= dt; if (this.kind !== 'crab') this.y = this.y0 + Math.round(Math.sin(this.t * 1.1 + this.ph) * 3) / PPU; }
  draw(d, t, p) {
    const f = this.rt > 0 ? (this.rk === 'cheer' ? this.F.cheer : this.F.oh) : (Math.floor(t * 2.5 + this.ph) & 1 ? this.F.a : this.F.b);
    this.drawFrame(d, f, p, this.face < 0, this.rt > 0 && this.rk === 'cheer' ? -(Math.floor(t * 8) & 1) * 2 : 0);
  }
}

// =========================================================================== BARTENDER (octopus)
const OCT = {
  skin: M(R('#a8406e', { spread: 0.12 }), { tex: spots(R('#86305a', { spread: 0.1 }), 0.1, 7, 2) }), skinB: M(R('#8a3058', { spread: 0.11 })),
  shirt: M(R('#e8e0cc', { spread: 0.08 })), vest: M(R('#6a1e2a', { spread: 0.1 }), { tex: (t, u, v, x, y) => ((x + y) % 5 === 0 ? (t > 0 ? t - 1 : 0) : t) }),
  hat: M(R('#22202a', { spread: 0.07 })), band: M(R('#7a2232', { spread: 0.08 })), stache: M(R('#1e1418', { spread: 0.06 })),
  eye: M(R('#f4f0dc', { spread: 0.08 }), { bias: 0.3 }), tie: M(R('#c82a3a')), glass: M(R('#bfe0dc', { spread: 0.1 }), { bias: 0.3 }), towel: M(R('#e8e4d8', { spread: 0.08 })),
};
function drawBartender(P, o) {
  const dy = o.duck ? -16 : 0, wipe = o.wipe || 0, push = o.push || 0;
  // tentacles below (mostly hidden by the counter)
  for (let k = 0; k < 4; k++) { const x = -10 + k * 6; P.stroke([[x, 40 + dy], [x - 3 + k, 22], [x + 2, 10], [x - 2 + k * 2, 2]], 5, 2.4, k % 2 ? OCT.skinB : OCT.skin, 4 + k, G.legB); }
  // back arm (towel)
  const tw = [[-4 + Math.cos(wipe) * 3, 52 + dy + Math.sin(wipe) * 2]];
  P.stroke([[-8, 62 + dy], [-12, 54 + dy], [6 + Math.cos(wipe) * 4, 50 + dy + Math.sin(wipe) * 2]], 5, 3.4, OCT.skinB, 8, G.armB);
  // torso: shirt + vest
  P.ell([0, 52 + dy], 15, 15, 0, OCT.shirt, 20, G.torso);
  P.poly([[-15, 52 + dy], [-6, 68 + dy], [-2, 46 + dy], [-6, 38 + dy], [-14, 42 + dy]], OCT.vest, 21, G.clothB);
  P.poly([[15, 52 + dy], [8, 68 + dy], [5, 46 + dy], [8, 38 + dy], [14, 44 + dy]], OCT.vest, 21, G.clothB);
  for (let k = 0; k < 3; k++) P.px([6.5, 58 - k * 5 + dy], hexU('#d8b060'), 21.5, G.clothB);
  // bow tie
  P.poly([[2, 66 + dy], [10, 69 + dy], [10, 63 + dy]], OCT.tie, 22, G.acc); P.poly([[2, 66 + dy], [-5, 69 + dy], [-5, 63 + dy]], OCT.tie, 22, G.acc); P.ell([2.5, 66 + dy], 1.8, 1.8, 0, OCT.tie, 22.2, G.acc);
  // head (mantle)
  const H = (x, y) => [x + 2, y + 82 + dy];
  P.ell(H(-2, 6), 15, 15, -0.25, OCT.skin, 26, G.head);
  P.ell(H(4, -3), 12, 10, 0, OCT.skin, 26.2, G.head);
  // eyes
  for (const [ex, ez] of [[3, 27], [9.5, 27.6]]) { P.ell(H(ex, 0), 3.4, 3.8, 0, OCT.eye, ez, G.eyes); P.dot(H(ex + 1, -0.4), 1.4, INK, G.eyes); if (o.blink) P.dot(H(ex, 0), 3.4, OCT.skin.r[1], G.eyes); else P.poly([H(ex - 3.6, 1.4), H(ex + 3.6, 2.4), H(ex + 3.6, 4.4), H(ex - 3.6, 4.4)], OCT.skin, ez + 0.3, G.eyes); }
  // handlebar mustache
  P.poly([H(2, -5), H(10, -4), H(16, -6), H(19, -3), H(18, -8), H(12, -9), H(6, -8)], OCT.stache, 28, G.hair);
  P.poly([H(2, -5), H(-4, -6), H(-7, -3), H(-6, -8), H(0, -8.5)], OCT.stache, 27.9, G.hair);
  // bowler hat
  P.cap(H(-12, 15), H(14, 13), 2.2, 2.0, OCT.hat, 29, G.hat);
  P.ell(H(0, 20), 10.5, 7.5, -0.05, OCT.hat, 28.8, G.hat);
  P.cap(H(-10, 16), H(10, 15.4), 1.6, 1.6, OCT.band, 29.2, G.hat);
  // front arm: glass or pushing a drink
  const hx = 18 + push * 10, hy = 56 + dy - push * 4;
  P.stroke([[8, 62 + dy], [14, 54 + dy], [hx, hy]], 5.5, 3.6, OCT.skin, 40, G.armF);
  if (!push) { P.poly([[hx - 3, hy + 9], [hx + 4, hy + 9], [hx + 3, hy - 1], [hx - 2, hy - 1]], OCT.glass, 41, G.prop); P.px([hx - 1, hy + 6], hexU('#ffffff'), 41.5, G.prop); }
  // towel in the back hand (in front of the shirt)
  P.poly([[tw[0][0] - 4, tw[0][1] + 3], [tw[0][0] + 5, tw[0][1] + 4], [tw[0][0] + 4, tw[0][1] - 6], [tw[0][0] - 3, tw[0][1] - 4]], OCT.towel, 30, G.acc);
  if (o.duck) { P.stroke([[-8, 62 + dy], [-6, 80 + dy], [-2, 92 + dy]], 5, 3.4, OCT.skinB, 42, G.armB); P.stroke([[8, 62 + dy], [12, 80 + dy], [10, 94 + dy]], 5, 3.4, OCT.skin, 42, G.armF); }
}
export class Bartender extends NPC {
  constructor(o = {}) {
    super();
    const fog = o.fog ?? C('#1a1a22'), fa = o.fogAmt ?? 0.12;
    const mk = (opts) => frame(64, 116, 30, 112, (P) => drawBartender(P, opts), { fog, fogAmt: fa });
    this.F = { w: [0, 1, 2, 3].map((k) => mk({ wipe: (k * TAU) / 4 })), blink: mk({ blink: true }), push: mk({ push: 1 }), duck: mk({ duck: true }) };
    this.x = o.x ?? 9.5; this.home = this.x; this.state = 'idle'; this.st = 0; this.tx = this.x; this.blinkT = 3; this.wander = 2;
    this.minX = o.minX ?? 7.4; this.maxX = o.maxX ?? 11.2;
  }
  react(e) {
    if (e.t === 'bartenderSlide') { this.state = 'push'; this.st = 0.5; this.tx = Math.min(this.maxX, 11.0); }
    if (e.t === 'hit' && e.heavy && this.state === 'idle' && Math.random() < 0.5) { this.state = 'duck'; this.st = 0.6; }
    if (e.t === 'ko') { this.state = 'duck'; this.st = 1.2; }
  }
  update(dt) {
    this.t += dt; this.st -= dt; this.blinkT -= dt; this.wander -= dt;
    if (this.blinkT < -0.15) this.blinkT = 2 + Math.random() * 3;
    if (this.state !== 'idle' && this.st <= 0) this.state = 'idle';
    if (this.wander <= 0 && this.state === 'idle') { this.wander = 3 + Math.random() * 4; this.tx = this.minX + Math.random() * (this.maxX - this.minX); }
    const dx = this.tx - this.x;
    if (Math.abs(dx) > 0.05) { this.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 1.6); this.face = dx > 0 ? 1 : -1; } else this.face = -1;
    if (this.state === 'push') this.face = -1;
  }
  draw(d, t, p = 0.97) {
    const F = this.F;
    const f = this.state === 'push' ? F.push : this.state === 'duck' ? F.duck : this.blinkT < 0 ? F.blink : F.w[Math.floor(t * 5) & 3];
    this.drawFrame(d, f, p, this.face < 0, Math.abs(this.tx - this.x) > 0.05 ? -(Math.floor(t * 8) & 1) : 0);
  }
}

// =========================================================================== MECHANIC (drunk crab asleep on a barrel)
function drawMechanic(P, o) {
  const sh = M(R('#b8482c', { spread: 0.12 })), shB = M(R('#9a3a24', { spread: 0.1 })), cap = M(R('#2a4a8a', { spread: 0.1 })), eye = M(R('#e8e0c8'), { bias: 0.2 });
  const wood = M(R('#6a4428', { spread: 0.12 }), { tex: (t, u, v, x) => (x % 6 === 0 ? (t > 0 ? t - 1 : 0) : t) }), hoop = M(R('#5a5a60', { spread: 0.1 })), wr = M(R('#9aa6b2', { spread: 0.12 })), bot = M(R('#3a8a4a'), { bias: 0.2 });
  const b = o.breath || 0;
  // barrel
  P.poly([[-11, 0], [11, 0], [13, 12], [11, 26], [-11, 26], [-13, 12]], wood, 2, G.prop);
  P.cap([-12.5, 6], [12.5, 6], 1, 1, hoop, 2.5, G.prop); P.cap([-12.5, 20], [12.5, 20], 1, 1, hoop, 2.5, G.prop);
  // tipped bottle on the floor
  P.cap([16, 1.5], [25, 2.5], 2.2, 1.6, bot, 1, G.prop);
  // legs dangling
  for (let k = 0; k < 3; k++) { P.stroke([[-6 + k * 5, 30], [-9 + k * 6, 22], [-10 + k * 6, 14]], 2, 1.6, shB, 3, G.legB); }
  // body slumped forward over the barrel
  P.ell([2, 33 + b * 0.5], 14 + b * 0.4, 8 + b * 0.6, -0.15, sh, 10, G.torso);
  P.poly([[-6, 36 + b], [10, 38 + b], [12, 30], [-8, 28]], { ...sh, bias: 0.2 }, 10.2, G.torso);
  // overall straps
  P.line([-3, 26], [0, 40 + b], hexU('#2a3a6a'), 11, G.clothB); P.line([7, 27], [8, 40 + b], hexU('#2a3a6a'), 11, G.clothB);
  // head down, cap pulled over the eyes
  P.ell([14, 33 + b * 0.3], 6, 5, 0, sh, 12, G.head);
  P.ell([15, 37 + b * 0.3], 6, 3.5, 0.2, cap, 13, G.hat); P.cap([17, 35 + b * 0.3], [23, 33 + b * 0.3], 1.4, 1, cap, 13.2, G.hat);
  for (const ex of [12, 15]) { P.line([ex, 39 + b * 0.3], [ex - 1, 43 + b * 0.3], INK, 12.5, G.eyes); P.line([ex - 2, 43.5 + b * 0.3], [ex, 43.5 + b * 0.3], INK, 12.6, G.eyes); }
  P.line([17, 30], [20, 30.5], INK, 14, G.head);
  // claws: one hanging with a wrench
  P.stroke([[-8, 32], [-14, 26], [-15, 18]], 3, 2.4, shB, 14, G.armF);
  P.ell([-15, 16], 3, 2.4, 0.5, sh, 14.2, G.armF);
  P.cap([-15, 15], [-17, 6], 1.2, 1.2, wr, 14.4, G.prop); P.ell([-17.5, 5], 2, 1.6, 0, wr, 14.5, G.prop);
}
export class Mechanic extends NPC {
  constructor(x, y = 0, o = {}) {
    super();
    this.x = x; this.y = y;
    const fog = o.fog ?? C('#1a1a22'), fa = o.fogAmt ?? 0.2;
    const mk = (opts) => frame(58, 52, 28, 48, (P) => drawMechanic(P, opts), { fog, fogAmt: fa });
    this.F = [mk({ breath: 0 }), mk({ breath: 1.2 }), mk({ breath: 2.2 })];
    this.zT = 1;
    this.face = o.face ?? 1;
  }
  update(dt, fx) { this.t += dt; this.zT -= dt; if (this.zT <= 0 && fx) { this.zT = 1.6 + Math.random(); fx.spawn('zz', this.x + 0.35 * this.face, this.y + 1.0, { g: 0.5, vx: 0.15, life: 2.2, drag: 0.8, v: Math.random() < 0.5 ? 0 : 1, p: this.p ?? 0.94 }); } }
  draw(d, t, p = 0.94) { this.p = p; const k = Math.floor(t * 1.3) % 4; this.drawFrame(d, this.F[k === 3 ? 1 : k], p, this.face < 0); }
}

// =========================================================================== PATRONS (cantina crowd)
function drawPuffer(P, o) {
  const big = o.cheer ? 1.35 : 1, body = M(R('#c8a040', { spread: 0.12 }), { tex: spots(R('#8a6a2a'), 0.14, 5, 2) }), fin = M(R('#d8b860')), eye = M(R('#f4f0dc'), { bias: 0.3 });
  const r = 9 * big;
  P.poly([[-r + 1, 12], [-r - 5, 17], [-r - 5, 7]], fin, 4, G.tail);
  P.ell([0, 12], r, r * 0.92, 0, body, 10, G.torso);
  if (o.cheer) for (let k = 0; k < 12; k++) { const a = k * TAU / 12; P.line([Math.cos(a) * r, 12 + Math.sin(a) * r], [Math.cos(a) * (r + 3), 12 + Math.sin(a) * (r + 3)], hexU('#e8d080'), 11, G.acc); }
  P.ell([r * 0.45, 15], 3, 3.2, 0, eye, 12, G.eyes); P.dot([r * 0.45 + 1, 15], 1.3, INK, G.eyes);
  P.ell([r * 0.95, 9], 1.6, 1.4, 0, M(R('#e88a7a')), 12, G.head);
  P.ell([1, 6], 3, 2, 0.4, fin, 13, G.armF);
}
function drawSombreroCrab(P, o) {
  const sh = M(R('#c04a2e', { spread: 0.12 })), straw = M(R('#d8b060', { spread: 0.12 }), { tex: (t, u, v, x, y) => ((x + y) % 3 === 0 ? (t > 0 ? t - 1 : 0) : t) }), trim = M(R('#2a8a5a')), eye = M(R('#f0ecd8'), { bias: 0.3 });
  const up = o.cheer ? 7 : 0;
  P.ell([0, 10], 10, 6.5, 0, sh, 10, G.torso);
  for (const s of [-1, 1]) { P.line([s * 3, 15], [s * 3, 19], INK, 11, G.eyes); P.ell([s * 3, 20], 1.8, 1.8, 0, eye, 12, G.eyes); P.dot([s * 3 + 0.6, 20], 0.8, INK, G.eyes); }
  P.line([-3, 6], [3, 6], INK, 11, G.head);
  for (const s of [-1, 1]) { P.stroke([[s * 8, 10], [s * 13, 14 + up], [s * 12, 19 + up]], 2.4, 2.2, sh, 14, G.armF); P.ell([s * 12, 21 + up], 3, 3.4, 0, sh, 14.2, G.armF); P.line([s * 12, 21 + up], [s * 12, 24 + up], INK, 14.4, G.armF); }
  // sombrero
  P.ell([0, 24], 16, 3, 0, straw, 20, G.hat); P.ell([0, 29], 6, 6, 0, straw, 19.8, G.hat); P.cap([-6, 26], [6, 26], 1.2, 1.2, trim, 20.2, G.hat);
  P.ell([0, 23], 16, 1.2, 0, M(R('#a83a2a')), 20.1, G.hat);
}
function drawSeahorse(P, o) {
  const b = M(R('#d8783a', { spread: 0.12 }), { tex: (t, u, v, x, y) => (y % 3 === 0 ? (t > 0 ? t - 1 : 0) : t) }), eye = M(R('#f4f0dc'), { bias: 0.3 }), fin = M(R('#f0b070'));
  const k = o.cheer ? 3 : 0;
  P.stroke([[0, 32 + k], [4, 26 + k], [3, 18 + k], [0, 10], [2, 4], [6, 2], [7, 6], [4, 7]], 6, 2, b, 10, G.torso);
  P.cap([2, 33 + k], [10, 32 + k], 3.2, 1.6, b, 11, G.head);
  P.ell([2, 34 + k], 1.6, 1.6, 0, eye, 12, G.eyes); P.dot([2.6, 34 + k], 0.8, INK, G.eyes);
  P.poly([[-3, 22 + k], [-7, 26 + k], [-6, 18 + k]], fin, 9, G.armB);
  P.poly([[0, 37 + k], [2, 40 + k], [3, 36 + k]], fin, 12, G.hat);
}
function drawOctoGuitar(P, o) {
  const sk = M(R('#6a4aa0', { spread: 0.12 }), { tex: spots(R('#4e3480'), 0.12, 3, 2) }), hat = M(R('#2a2030', { spread: 0.07 })), trim = M(R('#c8a040')), wood = M(R('#b8783a', { spread: 0.12 })), eye = M(R('#f4f0dc'), { bias: 0.3 });
  const st = o.f ? 1 : 0;
  for (let k = 0; k < 4; k++) P.stroke([[-6 + k * 4, 12], [-9 + k * 5, 6], [-7 + k * 5, 1]], 3.4, 1.8, sk, 4, G.legB);
  P.ell([0, 22], 10, 11, 0, sk, 10, G.head);
  for (const ex of [2, 6]) { P.ell([ex, 23], 2, 2.4, 0, eye, 12, G.eyes); P.dot([ex + 0.6, 22.6], 0.9, INK, G.eyes); }
  P.line([3, 17], [7, 18], INK, 12, G.head);
  // charro hat
  P.ell([0, 33], 14, 2.6, 0, hat, 20, G.hat); P.ell([0, 37], 6, 5, 0, hat, 19.8, G.hat); P.cap([-13, 33], [13, 33], 0.8, 0.8, trim, 20.2, G.hat);
  // guitar across the body
  P.ell([2, 9], 7, 6, 0, wood, 30, G.prop); P.ell([2, 9], 2, 2, 0, M(R('#2a1a10')), 30.3, G.prop);
  P.cap([7, 11], [18, 16], 1.4, 1.2, M(R('#5a3a20')), 30.2, G.prop);
  P.stroke([[-4, 18], [0, 12 + st * 2], [2, 9 + st * 2]], 3, 2, sk, 32, G.armF);
  P.stroke([[6, 18], [12, 18], [15, 15]], 3, 2, sk, 32, G.armF);
}
function drawLobster(P, o) {
  const sh = M(R('#b03028', { spread: 0.12 }), { tex: (t, u, v, x, y) => (y % 4 === 0 ? (t > 0 ? t - 1 : 0) : t) }), eye = M(R('#f0ecd8'), { bias: 0.3 }), mug = M(R('#e0b040', { spread: 0.1 })), foam = M(R('#f8f0e0'));
  const up = o.cheer ? 9 : 0;
  P.ell([0, 14], 8, 12, 0.1, sh, 10, G.torso);
  P.ell([3, 27], 6, 5, 0, sh, 12, G.head);
  for (const ex of [3, 6]) { P.line([ex, 31], [ex + 1, 34], INK, 13, G.eyes); P.ell([ex + 1, 35], 1.5, 1.5, 0, eye, 13.5, G.eyes); }
  P.stroke([[5, 30], [12, 38], [18, 40]], 1, 0.8, sh, 9, G.ant); P.stroke([[4, 30], [8, 40], [12, 44]], 1, 0.8, sh, 9, G.ant);
  P.stroke([[6, 18], [12, 20 + up], [14, 25 + up]], 2.6, 2.2, sh, 20, G.armF);
  P.poly([[11, 22 + up], [18, 22 + up], [18, 31 + up], [11, 31 + up]], mug, 21, G.prop); P.ell([14.5, 31 + up], 4, 1.8, 0, foam, 21.2, G.prop);
  P.stroke([[-5, 18], [-10, 22], [-10, 28]], 2.6, 2.2, { ...sh, bias: -0.3 }, 5, G.armB); P.ell([-10, 30], 3.4, 4, 0, { ...sh, bias: -0.3 }, 5.2, G.armB);
}
const PATRON_KINDS = {
  puffer: { fn: drawPuffer, sz: [44, 34, 22, 30] }, crab: { fn: drawSombreroCrab, sz: [44, 40, 22, 34] }, seahorse: { fn: drawSeahorse, sz: [28, 48, 12, 44] },
  guitar: { fn: drawOctoGuitar, sz: [44, 46, 20, 42] }, lobster: { fn: drawLobster, sz: [44, 54, 20, 50] },
};
export class Patron extends NPC {
  constructor(kind, x, y, face = 1, o = {}) {
    super();
    this.kind = kind; this.x = x; this.y = y; this.y0 = y; this.face = face;
    const K = PATRON_KINDS[kind] || PATRON_KINDS.puffer;
    const fog = o.fog ?? C('#1a1a22'), fa = o.fogAmt ?? 0.28;
    const mk = (opts) => frame(K.sz[0], K.sz[1], K.sz[2], K.sz[3], (P) => K.fn(P, opts), { fog, fogAmt: fa });
    this.F = { a: mk({ f: 0 }), b: mk({ f: 1 }), cheer: mk({ cheer: true, f: 1 }) };
    this.ph = x * 1.7; this.ct = 0; this.hop = 0;
  }
  react(e) {
    if (e.t === 'hit') { if (e.heavy || Math.random() < 0.4) { this.ct = 0.5 + Math.random() * 0.5; this.hop = 0.25; } }
    if (e.t === 'ko' || e.t === 'roundWin') { this.ct = 2.2; this.hop = 2; }
    if (e.t === 'round' || e.t === 'fight') { this.ct = 1; this.hop = 0.6; }
  }
  update(dt) { this.t += dt; this.ct -= dt; this.hop -= dt; }
  draw(d, t, p = 0.93) {
    const f = this.ct > 0 ? this.F.cheer : this.kind === 'guitar' ? (Math.floor(t * 6 + this.ph) & 1 ? this.F.a : this.F.b) : this.F.a;
    const bob = this.hop > 0 ? -Math.round(Math.abs(Math.sin((this.hop) * 12)) * 5) : (this.kind === 'seahorse' || this.kind === 'puffer' ? Math.round(Math.sin(t * 1.6 + this.ph) * 1.5) : 0);
    this.drawFrame(d, f, p, this.face < 0, bob);
  }
}
export { NPC, frame, INK };
