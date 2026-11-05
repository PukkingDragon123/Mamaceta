// BRUTUS - zebra mantis shrimp luchador. Big striped belly, lucha mask with the eye stalks popping
// through, walrus mustache with a gold tooth, flame-trim tights, gold title belt, tall boots and
// barbed spearer claws.
import { G, M, R, along, lerp2, texPlates, texCloth, texStripes, fist, foot, tailFan, antenna, u32, hexU, mixU, phash } from './kit.js';
import { torsoFrame, polyT, headFrame, eyes, face, backMat } from './common.js';

const PI = Math.PI;
const clampT = (t) => (t < 0 ? 0 : t > 4 ? 4 : t);
const angOf = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

const SKINS = {
  default: { shell: '#e2d2b0', stripe: '#3e2a20', belly: '#f8e8a8', mask: '#2fae5a', mask2: '#f0c33c', mask3: '#d8322a', tights: '#d8322a', trim: '#f0c33c', belt: '#f0c33c', gem: '#2fd0ff', boots: '#f2ece0', bootTrim: '#d8322a', stache: '#2a1a14', spear: '#f0e2c0', eye: '#fff4d0', eyeBand: '#d88a2a', tape: '#f4f0e6', ant: '#c8a070' },
  chef: { shell: '#e8dcc0', stripe: '#4a3426', belly: '#f2e6c8', mask: null, hat: '#ffffff', hachi: '#d8322a', tights: '#2a2a32', trim: '#ffffff', belt: '#ffffff', apron: '#f4f4f0', boots: '#2a2a32', bootTrim: '#ffffff', stache: '#2a1a14', spear: '#cfd8df', eye: '#fff4d0', eyeBand: '#d88a2a', tape: '#f4f0e6', ant: '#c8a070' },
  royal: { shell: '#e8dcc0', stripe: '#4a3426', belly: '#f2e6c8', mask: '#8a2ad0', mask2: '#f0c33c', mask3: '#ffffff', tights: '#8a2ad0', trim: '#f0c33c', belt: '#f0c33c', gem: '#ff3a6a', boots: '#f0c33c', bootTrim: '#8a2ad0', stache: '#2a1a14', spear: '#f0c33c', eye: '#fff4d0', eyeBand: '#d88a2a', tape: '#f0c33c', ant: '#c8a070', crown: '#f0c33c', robe: '#b0202a' },
  sumo: { shell: '#e8dcc0', stripe: '#4a3426', belly: '#f2e6c8', mask: null, topknot: '#1a1418', tights: null, mawashi: '#2a4ab0', trim: '#f4f0e6', belt: '#2a4ab0', boots: null, stache: null, spear: '#f0e2c0', eye: '#fff4d0', eyeBand: '#d88a2a', tape: '#f4f0e6', ant: '#c8a070', rope: '#f4f0e6' },
  mecha: { shell: '#8a96a6', stripe: '#3a4250', belly: '#b0bac6', mask: '#3a4250', mask2: '#ff7a1a', mask3: '#2ae8ff', tights: '#2e3442', trim: '#ff7a1a', belt: '#ff7a1a', gem: '#2ae8ff', boots: '#5a6272', bootTrim: '#ff7a1a', stache: '#3a4250', spear: '#cfd8df', eye: '#2ae8ff', eyeBand: '#ffffff', tape: '#5a6272', ant: '#ff7a1a', rivets: true },
};

function palette(skin) {
  const S = SKINS[skin] || SKINS.default;
  const p = { S, ink: hexU('#1a0e10'), inkLight: hexU('#3a2420') };
  const stripe = R(S.stripe, { spread: 0.08 });
  p.shell = M(R(S.shell, { spread: 0.11 }), { tex: (t, u, v, x, y) => (Math.floor((y + Math.sin(x * 0.45) * 1.6) / 3) % 2 === 0 ? stripe[clampT(t)] : t) });
  p.arm = M(R(S.shell, { spread: 0.11 }), { tex: (t, u, v) => (Math.floor((u + v * 1.5) / 3) % 2 === 0 && Math.abs(v) < 0.92 ? stripe[clampT(t)] : (Math.floor(u) % 4 === 1 && t > 1 ? clampT(t + 1) : t)) });
  p.belly = M(R(S.belly, { spread: 0.09 }), { tex: (t, u, v, x, y) => (y % 4 === 0 ? clampT(t - 1) : t) });
  p.tights = S.tights ? M(R(S.tights), { tex: texCloth({ fold: 0.8, skew: 1.2 }) }) : null;
  p.trim = M(R(S.trim));
  p.belt = M(R(S.belt, { spread: 0.12 }), { tex: (t, u, v, x, y) => ((x + y) % 5 === 0 && t > 1 ? clampT(t + 1) : t) });
  p.gem = S.gem ? M(R(S.gem), { bias: 0.4 }) : null;
  p.boots = S.boots ? M(R(S.boots, { spread: 0.1 })) : null;
  p.bootTrim = S.bootTrim ? hexU(S.bootTrim) : 0;
  p.mask = S.mask ? M(R(S.mask)) : null; p.mask2 = S.mask2 ? M(R(S.mask2)) : null; p.mask3 = S.mask3 ? M(R(S.mask3)) : null;
  p.stache = S.stache ? M(R(S.stache, { spread: 0.08 })) : null;
  p.spear = M(R(S.spear));
  p.tape = M(R(S.tape, { spread: 0.07 }), { tex: (t, u) => (Math.floor(u) % 3 === 0 ? clampT(t - 1) : t) });
  p.eye = M(R(S.eye, { spread: 0.08 }), { bias: 0.3 });
  p.eyeBand = hexU(S.eyeBand);
  p.stalk = M(R(S.shell));
  p.ant = M(R(S.ant), { flat: 2 });
  p.face = M(R(S.belly));
  p.tail = { seg: p.shell, telson: M(R(S.shell)), uro: M(R(S.stripe)) };
  if (S.hat) { p.hat = M(R(S.hat, { spread: 0.07 })); p.hachi = M(R(S.hachi)); p.apron = M(R(S.apron, { spread: 0.07 }), { tex: texCloth({ fold: 0.6, skew: 0.3 }) }); }
  if (S.crown) { p.crown = M(R(S.crown), { bias: 0.2 }); p.robe = M(R(S.robe), { tex: texCloth({ fold: 0.7, skew: 0.5 }) }); }
  if (S.mawashi) { p.mawashi = M(R(S.mawashi), { tex: texCloth({ fold: 1.2, skew: 0.2 }) }); p.rope = M(R(S.rope), { tex: (t, u) => (Math.floor(u) % 2 ? clampT(t - 1) : t) }); p.topknot = M(R(S.topknot)); }
  p.rivets = !!S.rivets;
  return p;
}

function draw(P, J, pose, ctx) {
  const k = ctx.scale, pal = ctx.pal, ink = pal.ink, t = ctx.t;
  const T = torsoFrame(J), H = headFrame(J);
  const gl = ctx.glove;
  const belly = 1 + (pose.belly || 0);
  // royal robe behind
  if (pal.robe) {
    const a = T(-11 * k, 30 * k), b = T(-6 * k, 31 * k);
    const sw = Math.sin(t * 2.2) * 2 * k;
    P.poly([a, b, [b[0] - 4 * k + sw, J.hip[1] - 18 * k], [a[0] - 10 * k + sw, J.hip[1] - 20 * k]], pal.robe, 1, G.cape);
  }
  // back arm
  armBrutus(P, J.armB, pal, k, 4, G.armB, true, pose.fistB, gl, pose.wrB);
  // back leg
  legBrutus(P, J.legB, pal, k, 8, G.legB, true);
  tailFan(P, T(-11 * k, 5 * k), -PI * 0.64 + (pose.tail || 0), 11 * k, { seg: backMat(pal.tail.seg, -0.2), telson: backMat(pal.tail.telson, -0.2), uro: backMat(pal.tail.uro, -0.2) }, 12);
  // torso: broad striped back + chest
  const body = [[8, -2], [10, 6], [9.5, 14], [8, 22], [6, 28], [1, 30.5], [-6, 30], [-11, 26], [-13, 18], [-12.5, 9], [-11.5, 1], [-8, -4], [2, -4]];
  P.poly(polyT(T, body, k), pal.shell, 20, G.torso);
  // big belly (pale plated) bulging forward
  const bc = T(7.5 * k * belly, 10 * k);
  P.ell(bc, 11.5 * k * belly, 12.5 * k, -J.lean, pal.belly, 21, G.belly);
  P.ell(T(5 * k, 22.5 * k), 7 * k, 5.6 * k, -J.la2, pal.belly, 21.2, G.belly);
  // belly button + chest hair tuft (very luchador)
  P.dot(T(14 * k * belly, 8 * k), 0.9 * k, pal.belly.r[0], G.belly);
  if (pal.rivets) for (const [f, h] of [[4, 4], [10, 10], [3, 16], [9, 18]]) P.dot(T(f * k, h * k), 0.7 * k, pal.belly.r[4], G.belly);
  // lower clothing
  if (pal.mawashi) {
    P.poly(polyT(T, [[-12.5, -5], [12, -5], [13, 4], [-12, 4]], k), pal.mawashi, 23, G.clothB);
    P.stroke([T(-12 * k, 3 * k), T(0, 4.5 * k), T(13 * k, 3.5 * k)], 2.4 * k, 2.4 * k, pal.rope, 23.5, G.clothB);
    for (let i = 0; i < 3; i++) { const a = T((6 + i * 2.2) * k, 3 * k); P.stroke([a, [a[0] + 0.5 * k, a[1] - 7 * k]], 1.4 * k, 1.2 * k, pal.rope, 23.6, G.clothB); }
  } else if (pal.tights) {
    P.poly(polyT(T, [[-12, -6], [11.5, -6], [12.5, 3], [-12.5, 3]], k), pal.tights, 22.5, G.clothB);
  }
  if (pal.apron) {
    P.poly(polyT(T, [[2, 16], [12, 13], [14, 0], [12, -12], [-1, -12], [-2, 4]], k), pal.apron, 24, G.clothF);
  }
  // title belt: big gold plate with a gem
  if (!pal.mawashi) {
    P.poly(polyT(T, [[-12.5, -1], [12, -1], [12.6, 4.6], [-12.8, 4.6]], k), pal.belt, 24.5, G.clothB);
    const pc = T(9 * k, 2 * k);
    P.ell(pc, 4.6 * k, 4.2 * k, 0, pal.belt, 25, G.clothB);
    if (pal.gem) P.ell(pc, 1.8 * k, 1.8 * k, 0, pal.gem, 25.2, G.clothB);
  }
  // head
  headBrutus(P, J, H, pose, ctx, pal, k);
  // front leg + arm
  legBrutus(P, J.legF, pal, k, 30, G.legF, false);
  armBrutus(P, J.armF, pal, k, 40, G.armF, false, pose.fistF, gl, pose.wrF);
}

function armBrutus(P, A, pal, k, z, g, back, kind, gl, wr) {
  const B = back ? backMat : (m) => m;
  P.ell(A.s, 4.6 * k, 4.2 * k, 0, B(pal.arm), z - 0.1, g);
  P.cap(A.s, A.e, 4.6 * k, 3.8 * k, B(pal.arm), z, g);
  P.cap(A.e, A.h, 4.1 * k, 3.4 * k, B(pal.arm), z + 0.1, g);
  // wrist tape
  P.cap(lerp2(A.e, A.h, 0.62), A.h, 3.7 * k, 3.5 * k, B(pal.tape), z + 0.2, g);
  const ang = angOf(A.e, A.h) + (wr || 0);
  if (gl) { fist(P, A.h, ang, 7 * k, null, z + 0.3, g, { glove: back ? { ...gl, main: B(gl.main), cuff: B(gl.cuff) } : gl }); return; }
  fist(P, A.h, ang, 5 * k, B(pal.arm), z + 0.3, g, { kind: kind === 'open' ? 'open' : 'spear', spear: B(pal.spear), barb: pal.spear.r[1] });
}

function legBrutus(P, L, pal, k, z, g, back) {
  const B = back ? backMat : (m) => m;
  const tm = pal.tights || pal.mawashi ? (pal.tights || pal.arm) : pal.arm;
  P.cap(L.s, L.k, 5.6 * k, 4.4 * k, B(pal.tights || pal.arm), z, g);
  if (pal.tights) {
    // flame trim at the knee
    const kn = L.k;
    for (let i = -2; i <= 2; i++) P.cap(along(kn, PI / 2, i * 1.6 * k), along(along(kn, PI / 2, i * 1.6 * k), PI + i * 0.2, (2.5 + (i & 1) * 1.6) * k), 1.1 * k, 0.5 * k, B(pal.trim), z + 0.2, g);
  }
  if (pal.boots) {
    P.cap(L.k, L.a, 4.2 * k, 3.6 * k, B(pal.arm), z + 0.05, g);
    const top = lerp2(L.k, L.a, 0.3);
    P.cap(top, L.a, 4.2 * k, 3.8 * k, B(pal.boots), z + 0.1, g);
    for (let i = 0; i < 3; i++) { const p = lerp2(top, L.a, 0.2 + i * 0.25); P.px([p[0] + 3 * k, p[1]], pal.bootTrim, z + 0.3, g); P.px([p[0] + 2 * k, p[1] - 1], pal.bootTrim, z + 0.3, g); }
    foot(P, L.a, 1, null, z + 0.3, g, { shoe: { m: B(pal.boots), sole: B({ r: pal.boots.r, flat: 0 }) }, len: 8 * k, drop: 2.6 * k });
  } else {
    P.cap(L.k, L.a, 4.2 * k, 3.4 * k, B(pal.arm), z + 0.05, g);
    foot(P, L.a, 1, B(pal.arm), z + 0.3, g, { len: 8 * k, h: 4 * k, drop: 2.6 * k });
  }
}

function headBrutus(P, J, H, pose, ctx, pal, k) {
  const z = 26, ink = pal.ink, S = pal.S;
  if (pal.topknot) P.ell(H(-4 * k, 10 * k), 3.2 * k, 2.6 * k, 0.3, pal.topknot, z - 0.5, G.hair);
  P.ell(H(0, 0), 10.5 * k, 9.8 * k, -H.ang, pal.shell, z, G.head);
  P.ell(H(4.5 * k, -3.5 * k), 6.5 * k, 5.4 * k, -H.ang - 0.15, pal.face, z + 0.2, G.head);
  if (pal.mask) {
    // full lucha mask (leaves mouth/jaw open)
    P.ell(H(0.4 * k, 1.2 * k), 10.8 * k, 9.6 * k, -H.ang, pal.mask, z + 0.4, G.head);
    // gold flame/diamond pattern around the eye holes + red centre stripe
    P.poly([H(-2 * k, 9.8 * k), H(2 * k, 10 * k), H(9 * k, 2 * k), H(5 * k, 0.5 * k)], pal.mask2, z + 0.5, G.head);
    P.cap(H(-9 * k, 6 * k), H(4 * k, 10.3 * k), 1.1 * k, 1.1 * k, pal.mask3, z + 0.55, G.head);
    // mask laces at the back
    for (let i = 0; i < 3; i++) P.line(H(-10 * k, (3 - i * 2.5) * k), H(-12 * k, (2 - i * 2.5) * k), pal.mask2.r[3], z + 0.6, G.head);
    // jaw/mouth opening
    P.ell(H(6.4 * k, -5.2 * k), 4.6 * k, 3.4 * k, -H.ang, pal.face, z + 0.7, G.head);
  }
  if (pal.hat) {
    P.cap(H(-7 * k, 6 * k), H(7 * k, 7.5 * k), 2 * k, 2 * k, pal.hachi, z + 0.8, G.acc);
    P.ell(H(-1 * k, 14 * k), 8.5 * k, 7 * k, 0, pal.hat, z + 0.85, G.hat);
    P.cap(H(-7 * k, 9 * k), H(6 * k, 9.5 * k), 2.6 * k, 2.6 * k, pal.hat, z + 0.86, G.hat);
  }
  // eye stalks poke through the mask's top holes
  eyes(P, H, pose, { k, z: z + 2, stalk: pal.mask || pal.stalk, eye: pal.eye, band: pal.eyeBand, ink, farX: 1, nearX: 5.8, baseY: 8.8, stalkL: 4.2, er: 3.8, blink: ctx.blink, angFar: 0.05, angNear: 0.35 });
  if (pal.crown) {
    const base = [H(-6 * k, 9 * k), H(5 * k, 11 * k)];
    P.poly([base[0], H(-6.5 * k, 15 * k), H(-3 * k, 12.5 * k), H(-0.5 * k, 17 * k), H(2 * k, 13 * k), H(5.5 * k, 16 * k), base[1]], pal.crown, z + 3, G.hat);
  }
  const ch = ctx.chains;
  if (ch.antA) { antenna(P, ch.antA.p, pal.ant, z - 2, 1.8 * k, 1 * k); antenna(P, ch.antB.p, backMat(pal.ant, -0.3), z - 2.2, 1.6 * k, 1 * k); }
  // big grin + walrus mustache
  face(P, H, pose, { k, mx: 7.2, my: -6.2, mw: 5.4, ink, teeth: hexU('#fff8e0') });
  if (pose.face === 'grin' || pose.face === 'neutral' || pose.face === 'smug') P.paint(H(8.8 * k, -6.4 * k), hexU('#f0c33c'));
  if (pal.stache) {
    const m = pal.stache;
    P.cap(H(4 * k, -3.8 * k), H(10.4 * k, -4 * k), 1.8 * k, 1.6 * k, m, z + 1, G.faceAcc);
    P.cap(H(4.2 * k, -4 * k), H(2.6 * k, -7.6 * k), 1.5 * k, 0.9 * k, m, z + 1, G.faceAcc);
    P.cap(H(10.2 * k, -4.2 * k), H(11.6 * k, -7.4 * k), 1.5 * k, 0.9 * k, m, z + 1, G.faceAcc);
  }
}

export const BRUTUS = {
  id: 'brutus',
  dims: { thigh: 0.31, shin: 0.29, ankle: 0.09, upper: 0.3, fore: 0.3, hand: 0.14, torso: 0.68, neck: 0.02, headR: 0.24, shoulderX: 0.34, shoulderDrop: 0.13, hipW: 0.36 },
  box: [210, 210, 105, 160],
  palette,
  draw,
  chains: [
    { id: 'antA', n: 7, seg: 3.6, rest: [-0.5, 0.86], grav: -0.06, damp: 0.8, stiff: 0.22, wind: 0.08, anchor: (J, P, c) => headFrame(J)(8 * c.scale, 4 * c.scale) },
    { id: 'antB', n: 7, seg: 3.4, rest: [-0.72, 0.7], grav: -0.06, damp: 0.8, stiff: 0.22, wind: 0.08, anchor: (J, P, c) => headFrame(J)(6.5 * c.scale, 5 * c.scale) },
  ],
};
