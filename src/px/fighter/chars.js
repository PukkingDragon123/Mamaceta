// Character definitions for the 2D pixel fighters. Each fighter is a humanoid mantis shrimp in
// real clothes, drawn procedurally from the skeleton every frame (so every pose stays crisp).
//   Jim     - peacock mantis shrimp martial-arts dreamer: torn white gi, red headband, sealed arm
//   Brutus  - zebra mantis shrimp luchador: mask, mustache, tights, title belt, spear claws
//   Bobby   - purple-spot mantis shrimp kid: oversized hoodie, high-tops, traffic cone hat
//   Mimi    - pink-eared mantis shrimp sweetheart: frilly embroidered dress, twin-tail scales
//   Demon   - Bobby unleashed: torn hoodie, cracked burning cone, horns, long claws
import { G, M, R, RO, along, add, sub, norm, mul, lerp2, texPlates, texCloth, texWrap, texStripes, texSpots, texBands, fist, foot, tailFan, antenna, u32, hexU, mixU, darkU, lightU, phash } from './kit.js';
import { torsoFrame, polyT, headFrame, eyes, face, backMat } from './common.js';

const PI = Math.PI;
const clampT = (t) => (t < 0 ? 0 : t > 4 ? 4 : t);
const plateTex = (rows = 3, off = 0) => (t, u, v, x, y) => ((y + off) % rows === 0 ? clampT(t - 1) : t);

// ======================================================================= JIM
const JIM_SKINS = {
  default: { shell: '#3c9a62', shell2: '#2f7fa8', belly: '#cfe39a', limb: '#e2622c', club: '#e8506a', gi: '#ece6da', belt: '#2a2422', band: '#d8282a', wrap: '#f1e9d2', hair: '#ff7a2a', hairTip: '#ffd25a', eye: '#dafff0', eyeBand: '#2fb890', spots: '#1f4a30', ant: '#e47a30' },
  shonen: { shell: '#3c9a62', shell2: '#2f7fa8', belly: '#cfe39a', limb: '#e2622c', club: '#e8506a', gi: '#ff8a2a', giTrim: '#2050c0', belt: '#2050c0', band: '#2a52d8', wrap: '#f1e9d2', hair: '#ffd23a', hairTip: '#fff6a0', eye: '#79e8c6', eyeBand: '#f2d24a', spots: '#1f4a30', ant: '#ffb030', spiky: true },
  luchador: { shell: '#3c9a62', shell2: '#2f7fa8', belly: '#cfe39a', limb: '#e2622c', club: '#e8506a', gi: '#5a2a8a', belt: '#f0c33c', band: '#f0c33c', wrap: '#f0c33c', hair: '#a04ae0', hairTip: '#f0c33c', eye: '#79e8c6', eyeBand: '#f2d24a', spots: '#1f4a30', ant: '#e47a30', mask: ['#f0c33c', '#7a2ab0'], cape: '#8a2ad0', capeIn: '#f0c33c' },
  abyss: { shell: '#2a2050', shell2: '#4a2a7a', belly: '#6a5aa0', limb: '#3a2a6a', club: '#8a3ae0', gi: '#1a1626', belt: '#a04ae0', band: '#b04aff', wrap: '#3a3050', hair: '#7a3aff', hairTip: '#e0a0ff', eye: '#ff6ae0', eyeBand: '#ffffff', spots: '#120c26', ant: '#a060ff', flames: ['#2a0a4a', '#6a20c0', '#c060ff', '#f0c0ff'] },
  neon: { shell: '#4a5262', shell2: '#2e3442', belly: '#7a8494', limb: '#3a4050', club: '#5a6272', gi: '#1c2230', giTrim: '#2ae8ff', belt: '#2ae8ff', band: '#ff2a8a', wrap: '#2e3442', hair: '#2ae8ff', hairTip: '#d0ffff', eye: '#2ae8ff', eyeBand: '#ffffff', spots: '#262a34', ant: '#2ae8ff', visor: '#2ae8ff', circuit: '#2ae8ff' },
};

function jimPalette(skin) {
  const S = JIM_SKINS[skin] || JIM_SKINS.default;
  const ink = hexU('#1a0e16');
  const p = { S, ink, inkLight: hexU('#3a2030') };
  p.shell = M(R(S.shell), { tex: texPlates(4) });
  p.shellArm = M(R(S.shell), { tex: texPlates(3) });
  p.shell2 = M(R(S.shell2));
  p.belly = M(R(S.belly), { tex: plateTex(3) });
  p.limb = M(R(S.limb), { tex: texPlates(3) });
  p.club = M(R(S.club, { spread: 0.11 }));
  p.wrapM = M(R(S.wrap, { spread: 0.08 }), { tex: texWrap(4) });
  p.gi = M(R(S.gi, { spread: 0.12, cool: 230 }), { tex: texCloth({ fold: 0.5, skew: 2.6 }) });
  p.giPants = M(R(S.gi, { spread: 0.12, cool: 230 }), { tex: texCloth({ fold: 0.9, skew: 0.8, ph: 1 }) });
  p.giTrim = S.giTrim ? M(R(S.giTrim)) : null;
  p.belt = M(R(S.belt, { spread: 0.07 }));
  p.band = M(R(S.band, { spread: 0.12 }));
  p.hair = M(R(S.hair), { tex: (t, u) => (u > 5 ? clampT(t + 1) : t) });
  p.hairTip = M(R(S.hairTip));
  p.eye = M(R(S.eye, { spread: 0.1 }), { bias: 0.25 });
  p.eyeBand = hexU(S.eyeBand);
  p.stalk = M(R(S.shell));
  p.ant = M(R(S.ant), { flat: 2 });
  p.face = M(R(S.belly, { spread: 0.1 }));
  p.spots = hexU(S.spots);
  p.tail = { seg: M(R(S.shell), { tex: texPlates(3) }), telson: M(R(S.limb)), uro: M(R(S.shell2), { tex: (t, u) => (u > 6 ? hexU(S.limb) : t) }) };
  if (S.mask) { p.mask = M(R(S.mask[0])); p.mask2 = M(R(S.mask[1])); }
  if (S.cape) { p.cape = M(R(S.cape), { tex: texCloth({ fold: 0.7, skew: 0.4 }) }); p.capeIn = M(R(S.capeIn)); }
  if (S.visor) p.visor = M(R(S.visor, { spread: 0.08 }), { bias: 0.5 });
  if (S.flames) p.flames = S.flames.map(hexU);
  if (S.circuit) p.circuit = hexU(S.circuit);
  return p;
}

function drawJim(P, J, pose, ctx) {
  const k = ctx.scale, pal = ctx.pal, S = pal.S, ink = pal.ink, t = ctx.t;
  const T = torsoFrame(J), H = headFrame(J);
  const gl = ctx.glove;
  // ---------------- cape (luchador skin) behind everything
  if (pal.cape && ctx.chains.cape) capeDraw(P, J, ctx, pal, k);
  // ---------------- back arm
  const aB = J.armB;
  P.cap(aB.s, aB.e, 2.6 * k, 2.3 * k, backMat(pal.shellArm), 4, G.armB);
  P.cap(aB.e, aB.h, 2.8 * k, 2.5 * k, backMat(pal.shellArm), 4.2, G.armB);
  fist(P, aB.h, angOf(aB.e, aB.h) + (pose.wrB || 0), 6.0 * k, backMat(pal.club), 4.4, G.armB, { glove: gl && { ...gl, main: backMat(gl.main), cuff: backMat(gl.cuff) }, wrap: backMat(pal.wrapM, -0.3), kind: pose.fistB });
  // ---------------- back leg
  legJim(P, J.legB, pal, k, 8, G.legB, true, pose.footB);
  // ---------------- tail fan
  tailFan(P, T(-6 * k, 2 * k), -PI * 0.66 + (pose.tail || 0), 10 * k, { seg: backMat(pal.tail.seg, -0.2), telson: backMat(pal.tail.telson, -0.2), uro: backMat(pal.tail.uro, -0.2) }, 12);
  // ---------------- torso: shell body
  const body = [[6, -1], [6, 5], [5.2, 10], [6.6, 15], [7, 18.5], [5, 21.5], [2.5, 23.5], [-3, 23.5], [-6.5, 21], [-7.6, 16.5], [-6.6, 11], [-6, 5], [-6.4, 0], [-4, -3], [3, -3]];
  P.poly(polyT(T, body, k), pal.shell, 20, G.torso);
  // pale chest plates visible in the gi opening
  P.poly(polyT(T, [[2.5, 22.5], [6.8, 18.5], [6.4, 13], [3.4, 9.5], [1.2, 14], [1, 20]], k), pal.belly, 20.5, G.belly);
  if (pal.circuit) for (let h = 12; h < 22; h += 3) P.paint(T(4 * k, h * k), pal.circuit);
  // gi top (torn sleeves) with a deep V
  const giTop = [[-7.4, -1.5], [-8.4, 9], [-8.6, 16.5], [-6.6, 21.8], [-3.2, 24.6], [0.6, 24.2], [2.2, 22.4], [3.4, 10.5], [6.9, 17.8], [7.6, 14.5], [6.4, 9.5], [7, 3], [6.8, -1.5]];
  P.poly(polyT(T, giTop, k), pal.gi, 22, G.clothB);
  if (pal.giTrim) { P.stroke([T(2.2 * k, 22.4 * k), T(3.4 * k, 10.5 * k), T(6.9 * k, 17.8 * k)], 1.6 * k, 1.6 * k, pal.giTrim, 22.3, G.clothB); }
  // torn sleeve edge at the near shoulder
  for (let i = 0; i < 4; i++) P.paint(T((5.5 - i * 0.8) * k, (20.5 + (i % 2)) * k), mixU(pal.gi.r[1], ink, 0.3));
  // belt with knot + tails
  P.poly(polyT(T, [[-7.8, -0.8], [7.4, -0.8], [7.6, 2.6], [-8, 2.6]], k), pal.belt, 23, G.clothB);
  const knot = T(5.5 * k, 1 * k);
  P.ell(knot, 2.2 * k, 1.8 * k, 0, pal.belt, 23.5, G.clothB);
  const sw = Math.sin(t * 5) * 0.8;
  P.stroke([knot, [knot[0] + 2 * k + sw, knot[1] - 4 * k], [knot[0] + 1.5 * k + sw * 1.5, knot[1] - 8 * k]], 2.2 * k, 1.6 * k, pal.belt, 23.4, G.clothB);
  P.stroke([knot, [knot[0] - 0.5 * k + sw, knot[1] - 4.5 * k], [knot[0] - 1.5 * k + sw * 1.2, knot[1] - 7.5 * k]], 2 * k, 1.4 * k, pal.belt, 23.3, G.clothB);
  // ---------------- head
  headJim(P, J, H, pose, ctx, pal, k);
  // ---------------- front leg
  legJim(P, J.legF, pal, k, 30, G.legF, false, pose.footF);
  // ---------------- front arm: fully bandaged "sealed" arm with a paper charm
  const aF = J.armF;
  P.cap(aF.s, aF.e, 2.9 * k, 2.5 * k, pal.wrapM, 40, G.armF);
  P.cap(aF.e, aF.h, 3.0 * k, 2.6 * k, pal.wrapM, 40.2, G.armF);
  // shoulder shell cap peeking out
  P.ell(aF.s, 3.1 * k, 2.8 * k, 0, pal.shellArm, 40.3, G.armF);
  const charm = lerp2(aF.s, aF.e, 0.55);
  P.rect([charm[0] - 1, charm[1] + 2], Math.max(2, Math.round(2.4 * k)), Math.max(3, Math.round(4 * k)), hexU('#f5e6b0'), 40.5, G.armF);
  P.px([charm[0] + 0.2, charm[1] + 0.6], hexU('#d82a2a'), 40.6, G.armF);
  fist(P, aF.h, angOf(aF.e, aF.h) + (pose.wrF || 0), 6.4 * k, pal.club, 40.4, G.armF, { glove: gl, wrap: pal.wrapM, kind: pose.fistF });
  // headband tails (chain) in front of the head but behind the front arm
  const ch = ctx.chains;
  if (ch.band1) {
    P.stroke(ch.band1.p, 2.8 * k, 1.6 * k, pal.band, 15, G.acc);
    P.stroke(ch.band2.p, 2.4 * k, 1.3 * k, backMat(pal.band, -0.3), 14.8, G.acc);
  }
  if (pal.flames) auraFlames(P, J, t, pal.flames, k);
}

function legJim(P, L, pal, k, z, g, back, footAng) {
  const B = back ? backMat : (m) => m;
  P.cap(L.s, L.k, 3.8 * k, 3.1 * k, B(pal.giPants), z, g);
  const mid = lerp2(L.k, L.a, 0.42);
  P.cap(L.k, mid, 3.1 * k, 3.0 * k, B(pal.giPants), z + 0.1, g);
  // rolled cuff
  P.cap(mid, lerp2(L.k, L.a, 0.52), 3.3 * k, 3.2 * k, B({ ...pal.giPants, bias: 0.2 }), z + 0.2, g);
  P.cap(lerp2(L.k, L.a, 0.5), L.a, 1.9 * k, 1.5 * k, B(pal.limb), z + 0.05, g);
  foot(P, L.a, 1, B(pal.limb), z + 0.3, g, { len: 6 * k, h: 3 * k, drop: 2.2 * k });
}

function headJim(P, J, H, pose, ctx, pal, k) {
  const z = 26, S = pal.S, ink = pal.ink;
  // spiky antennal-scale "hair" swept back
  const bob = Math.sin(ctx.t * 6) * 0.06 + (pose.hairBob || 0);
  const spikes = S.spiky ? [[-1, 6.5, -1.2, 11], [-4, 5, -1.7, 12], [-6, 2, -2.1, 10.5], [-5.5, -1.5, -2.5, 8], [1.5, 7.5, -0.7, 8]] : [[-1.5, 6.5, -1.35, 10], [-4.5, 4.5, -1.8, 11], [-6.5, 1, -2.25, 9], [1, 7.4, -0.9, 6.5]];
  for (const [x, y, a, L] of spikes) {
    const b = H(x * k, y * k);
    const tip = along(b, H.ang + a + bob, L * k);
    P.cap(b, tip, 2.4 * k, 0.6 * k, pal.hair, z - 1.2, G.hair);
    P.cap(lerp2(b, tip, 0.62), tip, 1.2 * k, 0.5 * k, pal.hairTip, z - 1.1, G.hair);
  }
  // head shell
  P.ell(H(0, 0), 8.4 * k, 7.8 * k, -H.ang, pal.shell, z, G.head);
  // leopard spots on the carapace
  for (const [x, y] of [[-3, 4], [-5, 1], [-2, 1.5], [-4.5, -2.5], [0.5, 5]]) P.dot(H(x * k, y * k), 0.9 * k, pal.spots, G.head);
  // face plate + rostrum
  P.ell(H(3.6 * k, -2.2 * k), 5.2 * k, 4.6 * k, -H.ang - 0.2, pal.face, z + 0.3, G.head);
  P.cap(H(4 * k, 4.5 * k), H(8.6 * k, 2.6 * k), 1.6 * k, 0.9 * k, pal.shell2, z + 0.4, G.head);
  // maxillipeds (little mouth legs) under the jaw
  P.line(H(4 * k, -7 * k), H(5.5 * k, -9 * k), pal.limb.r[2], z + 0.2, G.head);
  P.line(H(6 * k, -6.5 * k), H(7.4 * k, -8.4 * k), pal.limb.r[1], z + 0.2, G.head);
  // mask (luchador skin)
  if (pal.mask) {
    P.ell(H(0.5 * k, 0.5 * k), 8.6 * k, 8 * k, -H.ang, pal.mask, z + 0.5, G.head);
    P.poly([H(-1 * k, 7 * k), H(3 * k, 7.5 * k), H(6 * k, 2 * k), H(2 * k, -1 * k)], pal.mask2, z + 0.6, G.head);
    P.cap(H(-7 * k, 1 * k), H(-11 * k, -3 * k), 1 * k, 0.7 * k, pal.mask2, z - 0.5, G.head);
  }
  // headband round the forehead + knot at the back
  if (!pal.mask) {
    P.cap(H(-8.2 * k, 3.6 * k), H(7.4 * k, 4.4 * k), 1.6 * k, 1.5 * k, pal.band, z + 0.8, G.acc);
    P.ell(H(-8.4 * k, 3.2 * k), 1.9 * k, 1.7 * k, 0, pal.band, z + 0.9, G.acc);
  }
  // visor (neon skin)
  if (pal.visor) P.cap(H(1 * k, 5.5 * k), H(9 * k, 5 * k), 1.8 * k, 1.6 * k, pal.visor, z + 2.5, G.faceAcc);
  // eyes on stalks
  eyes(P, H, pose, { k, z: z + 2, stalk: pal.stalk, eye: pal.eye, band: pal.eyeBand, ink, farX: 0.6, nearX: 4.6, baseY: 7.2, stalkL: 4.6, er: 3.6, blink: ctx.blink, angFar: 0.05, angNear: 0.42 });
  // antennae (chains)
  const ch = ctx.chains;
  if (ch.antA) { antenna(P, ch.antA.p, pal.ant, z - 2, 1.6 * k, 1 * k); antenna(P, ch.antB.p, backMat(pal.ant, -0.3), z - 2.2, 1.4 * k, 1 * k); }
  face(P, H, pose, { k, mx: 6, my: -3.6, mw: 4.4, ink });
}

function capeDraw(P, J, ctx, pal, k) {
  const ch = ctx.chains.cape;
  const T = torsoFrame(J);
  const a = T(-5 * k, 22 * k), b = T(3 * k, 22.5 * k);
  const pts = ch.p;
  const poly = [a, ...pts.map((p, i) => [p[0] - (4 + i * 1.6) * k, p[1]]), ...pts.slice().reverse().map((p, i) => [p[0] + 2 * k, p[1]]), b];
  P.poly(poly, pal.cape, 1, G.cape);
}

function auraFlames(P, J, t, cols, k) {
  // pixel flame licks rising off the shoulders/fists (no glow, just flat pixel flames)
  const pts = [J.armF.h, J.armB.h, J.neck];
  for (let n = 0; n < pts.length; n++) {
    const base = pts[n];
    for (let i = 0; i < 5; i++) {
      const ph = (t * 3 + i * 0.37 + n * 0.21) % 1;
      const x = base[0] + Math.sin(i * 2.3 + t * 4) * 3 * k, y = base[1] + ph * 12 * k;
      const r = (1 - ph) * 2.2 * k;
      const c = cols[Math.min(3, Math.floor((1 - ph) * 3.5))];
      P.ell([x, y], Math.max(0.6, r), Math.max(0.8, r * 1.3), 0, { r: [c, c, c, c, c], flat: 2 }, 60, G.fx);
    }
  }
}

const angOf = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

// ======================================================================= registry
export const CHAR_DEFS = {};

CHAR_DEFS.jim = {
  id: 'jim',
  dims: { thigh: 0.35, shin: 0.33, ankle: 0.07, upper: 0.26, fore: 0.25, hand: 0.12, torso: 0.52, neck: 0.04, headR: 0.2, shoulderX: 0.2, shoulderDrop: 0.08, hipW: 0.22 },
  box: [150, 170, 75, 126],
  palette: jimPalette,
  draw: drawJim,
  chains: [
    { id: 'band1', n: 7, seg: 3.2, rest: [-0.96, -0.2], grav: -0.08, damp: 0.9, stiff: 0.06, wind: 0.3, wf: 5, anchor: (J, P, c) => headFrame(J)(-9 * c.scale, 3 * c.scale) },
    { id: 'band2', n: 6, seg: 3.2, rest: [-0.9, -0.42], grav: -0.1, damp: 0.9, stiff: 0.06, wind: 0.26, wf: 6, anchor: (J, P, c) => headFrame(J)(-9 * c.scale, 2.4 * c.scale) },
    { id: 'antA', n: 7, seg: 3.4, rest: [-0.55, 0.85], grav: -0.05, damp: 0.8, stiff: 0.22, wind: 0.1, anchor: (J, P, c) => headFrame(J)(6.5 * c.scale, 4.2 * c.scale) },
    { id: 'antB', n: 7, seg: 3.2, rest: [-0.75, 0.66], grav: -0.05, damp: 0.8, stiff: 0.22, wind: 0.1, anchor: (J, P, c) => headFrame(J)(5.2 * c.scale, 4.8 * c.scale) },
    { id: 'cape', n: 6, seg: 5, rest: [-0.6, -0.8], grav: -0.25, damp: 0.88, stiff: 0.05, wind: 0.3, anchor: (J, P, c) => torsoFrame(J)(-2 * c.scale, 22 * c.scale) },
  ],
};

export { angOf, clampT, plateTex, capeDraw, auraFlames };

import { BRUTUS } from './brutus.js';
import { BOBBY, DEMON_BOBBY } from './bobby.js';
import { MIMI } from './mimi.js';
CHAR_DEFS.brutus = BRUTUS;
CHAR_DEFS.bobby = BOBBY;
CHAR_DEFS.demon = DEMON_BOBBY;
CHAR_DEFS.mimi = MIMI;
