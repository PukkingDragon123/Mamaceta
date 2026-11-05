// MIMI - pink-eared mantis shrimp sweetheart. Frilly embroidered dress (otomi-style flowers),
// puffy sleeves, a big chest bow, white stockings and mary-janes; her antennal scales are styled
// into twin tails with ribbons; big lashed eyes and blush. Puru the jellyfish is drawn separately.
import { G, M, R, along, lerp2, texCloth, texSpots, fist, foot, tailFan, antenna, u32, hexU, mixU, phash } from './kit.js';
import { torsoFrame, polyT, headFrame, eyes, face, backMat } from './common.js';

const PI = Math.PI;
const clampT = (t) => (t < 0 ? 0 : t > 4 ? 4 : t);
const angOf = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

const SKINS = {
  default: { shell: '#ff8ab8', shell2: '#e05a96', belly: '#ffd0e2', dress: '#ff6fb0', dress2: '#ffffff', frill: '#fff4fa', bow: '#e8204a', flowers: ['#ffcf3a', '#4fd0ff', '#6aff8a'], stock: '#fff8fc', shoe: '#c0245a', hair: '#ff6fb0', ribbon: '#e8204a', eye: '#ffffff', eyeBand: '#ff8ab8', pupil: '#3a1030', ant: '#ff9ac8', glove: '#ffffff' },
  idol: { shell: '#ff8ab8', shell2: '#e05a96', belly: '#ffd0e2', dress: '#4fd0ff', dress2: '#ffffff', frill: '#ffffff', bow: '#ffcf3a', flowers: ['#ffcf3a', '#ff4f6a', '#ffffff'], stock: '#ffffff', shoe: '#4fd0ff', hair: '#ff6fb0', ribbon: '#ffcf3a', eye: '#ffffff', eyeBand: '#4fd0ff', pupil: '#102a5a', ant: '#ff9ac8', glove: '#ffffff', mic: true, stars: true },
  sakura: { shell: '#ff8ab8', shell2: '#e05a96', belly: '#ffd0e2', dress: '#ffd0e2', dress2: '#ff6fb0', frill: '#ffb6d9', bow: '#b8357a', flowers: ['#ff6fb0', '#ffffff', '#ff6fb0'], stock: '#fff8fc', shoe: '#8a2a4a', hair: '#ff6fb0', ribbon: '#b8357a', eye: '#ffffff', eyeBand: '#ff8ab8', pupil: '#3a1030', ant: '#ff9ac8', glove: '#ffd0e2', kimono: true },
  goth: { shell: '#c0a0d8', shell2: '#6a4a8a', belly: '#e0d0f0', dress: '#1e1424', dress2: '#6a2a8a', frill: '#2a2030', bow: '#8a2ad0', flowers: ['#8a2ad0', '#c194ff', '#e0e0e0'], stock: '#1a1420', shoe: '#2a1a30', hair: '#3a2a4a', ribbon: '#8a2ad0', eye: '#ffffff', eyeBand: '#8a2ad0', pupil: '#5a0a2a', ant: '#8a6aa0', glove: '#1e1424' },
  magical: { shell: '#ff8ab8', shell2: '#e05a96', belly: '#ffd0e2', dress: '#ffffff', dress2: '#ffcf3a', frill: '#ffe8f4', bow: '#ffcf3a', flowers: ['#ffcf3a', '#4fd0ff', '#ff6fb0'], stock: '#ffffff', shoe: '#ffcf3a', hair: '#ff8ab8', ribbon: '#ffcf3a', eye: '#ffffff', eyeBand: '#ffcf3a', pupil: '#5a2a8a', ant: '#ff9ac8', glove: '#ffffff', stars: true, wand: true },
};

function palette(skin) {
  const S = SKINS[skin] || SKINS.default;
  const p = { S, ink: hexU('#2a0c1e'), inkLight: hexU('#5a2040') };
  p.shell = M(R(S.shell, { spread: 0.1 }), { tex: (t, u) => (Math.floor(u) % 3 === 0 ? clampT(t - 1) : t) });
  p.head = M(R(S.shell, { spread: 0.1 }));
  p.belly = M(R(S.belly));
  const fl = S.flowers.map(hexU);
  // embroidered dress: little cross-stitch flowers scattered
  p.dress = M(R(S.dress, { spread: 0.1 }), { tex: (t, u, v, x, y) => {
    const cx = Math.floor(x / 5), cy = Math.floor(y / 5);
    const h = phash(cx, cy, 31);
    if (h < 0.36) { const lx = x - cx * 5, ly = y - cy * 5; if ((lx === 2 && ly >= 1 && ly <= 3) || (ly === 2 && lx >= 1 && lx <= 3)) return lx === 2 && ly === 2 ? hexU('#ffffff') : fl[Math.floor(h * 8.3) % 3]; }
    return t;
  } });
  p.bodice = M(R(S.dress, { spread: 0.1 }), { tex: texCloth({ fold: 0.9, skew: 0.3 }) });
  p.dress2 = M(R(S.dress2, { spread: 0.08 }));
  p.frill = M(R(S.frill, { spread: 0.06 }), { tex: (t, u, v, x, y) => ((x % 3 === 0) ? clampT(t - 1) : t) });
  p.bow = M(R(S.bow, { spread: 0.12 }));
  p.stock = M(R(S.stock, { spread: 0.06 }));
  p.shoe = M(R(S.shoe, { spread: 0.12 }));
  p.hair = M(R(S.hair, { spread: 0.11 }), { tex: (t, u, v) => (Math.abs(v) > 0.55 && Math.floor(u) % 4 === 0 ? clampT(t - 1) : t) });
  p.ribbon = M(R(S.ribbon, { spread: 0.12 }));
  p.eye = M(R(S.eye, { spread: 0.05 }), { bias: 0.3 });
  p.eyeBand = hexU(S.eyeBand);
  p.pupil = hexU(S.pupil);
  p.stalk = M(R(S.shell));
  p.ant = M(R(S.ant), { flat: 2 });
  p.face = M(R(S.belly));
  p.glove = M(R(S.glove, { spread: 0.06 }));
  p.blush = hexU('#ff5a8a');
  p.tail = { seg: p.shell, telson: M(R(S.shell2)), uro: M(R(S.shell)) };
  p.kimono = !!S.kimono; p.mic = !!S.mic; p.wand = !!S.wand; p.stars = !!S.stars;
  return p;
}

function draw(P, J, pose, ctx) {
  const k = ctx.scale, pal = ctx.pal, ink = pal.ink, t = ctx.t;
  const T = torsoFrame(J), H = headFrame(J);
  const gl = ctx.glove;
  // twin tails behind everything (chains)
  const ch = ctx.chains;
  if (ch.tailL) {
    P.stroke(ch.tailL.p, 6 * k, 2.4 * k, backMat(pal.hair, -0.25), 2, G.hair);
    P.stroke(ch.tailR.p, 6.4 * k, 2.6 * k, pal.hair, 14.5, G.hair);
  }
  armMimi(P, J.armB, pal, k, 4, G.armB, true, pose, gl);
  legMimi(P, J.legB, pal, k, 8, G.legB, true);
  tailFan(P, T(-5 * k, 3 * k), -PI * 0.62 + (pose.tail || 0), 9 * k, { seg: backMat(pal.tail.seg, -0.2), telson: backMat(pal.tail.telson, -0.2), uro: backMat(pal.tail.uro, -0.2) }, 12);
  // body under the dress (visible at neck)
  P.poly(polyT(T, [[4.5, 8], [5, 15], [3, 20.5], [-3, 20.5], [-5.6, 16], [-5, 8]], k), pal.shell, 19, G.torso);
  // skirt: bell shape with a sway driven by the hem chain
  const sway = ch.skirt ? (ch.skirt.p[ch.skirt.n - 1][0] - ch.skirt.p[0][0]) * 0.35 : 0;
  const hemY = -13.5, hemW = 15;
  const sk = [[-5.6, 6.5], [5.6, 6.5], [8.5 + sway * 0.2, 0], [hemW + sway * 0.6, hemY], [-hemW + sway * 0.6, hemY], [-8.5 + sway * 0.2, 0]];
  if (pal.kimono) {
    P.poly(polyT(T, [[-6, 8], [6, 8], [7, -16], [-7, -16]], k), pal.dress, 21, G.clothB);
    P.poly(polyT(T, [[-6.5, 9], [6.5, 9], [6.5, 3], [-6.5, 3]], k), pal.bow, 21.5, G.clothB);
    P.ell(T(-8 * k, 6 * k), 4.5 * k, 3.6 * k, 0.4, pal.bow, 21.6, G.clothB);
  } else {
    P.poly(polyT(T, sk, k), pal.dress, 21, G.clothB, { bulge: 0.5 });
    // two frill layers along the hem (scalloped)
    for (let layer = 0; layer < 2; layer++) {
      const yy = hemY + 1.5 + layer * 2.2;
      for (let i = -7; i <= 7; i++) {
        const f = i * 2.05 + sway * (0.6 - layer * 0.15);
        P.ell(T(f * k, yy * k), 1.8 * k, 1.5 * k, 0, layer ? pal.dress2 : pal.frill, 21.4 + layer * 0.1, G.clothB);
      }
    }
  }
  // bodice + lace collar + chest bow
  P.poly(polyT(T, [[5.4, 6], [6, 13], [4.5, 18], [-4.5, 18.5], [-6.4, 13], [-6, 6]], k), pal.bodice, 22, G.clothB);
  for (let i = -3; i <= 3; i++) P.ell(T(i * 1.7 * k, 18.8 * k), 1.3 * k, 1.1 * k, 0, pal.frill, 22.4, G.clothB);
  const bw = T(3.5 * k, 15 * k);
  P.poly([bw, [bw[0] - 4.2 * k, bw[1] + 3 * k], [bw[0] - 4.2 * k, bw[1] - 3 * k]], pal.bow, 22.6, G.clothF);
  P.poly([bw, [bw[0] + 4.2 * k, bw[1] + 3 * k], [bw[0] + 4.2 * k, bw[1] - 3 * k]], pal.bow, 22.6, G.clothF);
  P.ell(bw, 1.6 * k, 1.6 * k, 0, pal.bow, 22.7, G.clothF);
  P.stroke([bw, [bw[0] - 1.4 * k, bw[1] - 6 * k]], 1.8 * k, 1.4 * k, pal.bow, 22.65, G.clothF);
  P.stroke([bw, [bw[0] + 1.8 * k, bw[1] - 5.4 * k]], 1.8 * k, 1.4 * k, pal.bow, 22.65, G.clothF);
  headMimi(P, J, H, pose, ctx, pal, k);
  legMimi(P, J.legF, pal, k, 30, G.legF, false);
  armMimi(P, J.armF, pal, k, 40, G.armF, false, pose, gl);
  if (pal.stars) for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1; const p = [J.head[0] + Math.cos(a) * 14 * k, J.head[1] + Math.sin(a * 1.3) * 6 * k + 4 * k]; P.px(p, hexU('#fff08a'), 60, G.fx); P.px([p[0] + 1, p[1]], hexU('#ffffff'), 60, G.fx); }
}

function armMimi(P, A, pal, k, z, g, back, pose, gl) {
  const B = back ? backMat : (m) => m;
  // puffy sleeve
  P.ell(A.s, 4.4 * k, 3.8 * k, 0, B(pal.dress2), z, g);
  P.ell(lerp2(A.s, A.e, 0.35), 3.4 * k, 3 * k, 0, B(pal.frill), z + 0.05, g);
  P.cap(lerp2(A.s, A.e, 0.4), A.e, 2.1 * k, 1.9 * k, B(pal.shell), z - 0.1, g);
  // lace glove up to the forearm
  P.cap(A.e, A.h, 2 * k, 2 * k, B(pal.glove), z + 0.1, g);
  P.cap(A.e, lerp2(A.e, A.h, 0.2), 2.6 * k, 2.6 * k, B(pal.frill), z + 0.12, g);
  const ang = angOf(A.e, A.h) + ((back ? pose.wrB : pose.wrF) || 0);
  fist(P, A.h, ang, 4.6 * k, B(pal.glove), z + 0.2, g, { glove: gl ? (back ? { ...gl, main: B(gl.main), cuff: B(gl.cuff) } : gl) : null, kind: back ? pose.fistB : pose.fistF });
  if (!back && pal.mic && !gl) P.cap(A.h, along(A.h, ang - 1.2, 6 * k), 1 * k, 1.6 * k, M(R('#2a2a32')), z + 0.3, g);
  if (!back && pal.wand && !gl) { const tip = along(A.h, ang - 0.4, 10 * k); P.cap(A.h, tip, 0.8 * k, 0.8 * k, M(R('#ffffff')), z + 0.3, g); P.ell(tip, 2.4 * k, 2.4 * k, 0, M(R('#ffcf3a'), { bias: 0.3 }), z + 0.31, g); }
}

function legMimi(P, L, pal, k, z, g, back) {
  const B = back ? backMat : (m) => m;
  P.cap(L.s, L.k, 2.4 * k, 1.9 * k, B(pal.shell), z, g);
  P.cap(lerp2(L.k, L.a, 0.08), L.a, 2 * k, 1.6 * k, B(pal.stock), z + 0.05, g);
  // frilled sock cuff just under the knee
  const cuff = lerp2(L.k, L.a, 0.12);
  for (let i = -1; i <= 1; i++) P.ell([cuff[0] + i * 1.4 * k, cuff[1]], 1.3 * k, 1.1 * k, 0, B(pal.frill), z + 0.1, g);
  // mary-janes with a strap
  const a = L.a;
  P.poly([[a[0] - 2.5 * k, a[1] + 1.5 * k], [a[0] + 2 * k, a[1] + 1.5 * k], [a[0] + 5 * k, a[1] - 0.8 * k], [a[0] + 5 * k, a[1] - 2.6 * k], [a[0] - 3 * k, a[1] - 2.6 * k]], B(pal.shoe), z + 0.3, g);
  P.line([a[0] - 1 * k, a[1] + 1.5 * k], [a[0] + 2 * k, a[1] + 1.5 * k], pal.shoe.r[1], z + 0.35, g);
}

function headMimi(P, J, H, pose, ctx, pal, k) {
  const z = 26, ink = pal.ink;
  P.ell(H(0, 0), 8.6 * k, 8.2 * k, -H.ang, pal.head, z, G.head);
  P.ell(H(3.6 * k, -2.6 * k), 5.2 * k, 4.4 * k, -H.ang - 0.2, pal.face, z + 0.2, G.head);
  // blush
  P.dot(H(2.2 * k, -3.8 * k), 1.2 * k, pal.blush, G.head);
  P.dot(H(7.2 * k, -3.2 * k), 1 * k, pal.blush, G.head);
  // ribbons where the twin tails attach
  for (const [x, y, z2] of [[-6, 5, -1], [-2, 8, 3]]) {
    const c = H(x * k, y * k);
    const m = z2 < 0 ? backMat(pal.ribbon, -0.3) : pal.ribbon;
    P.poly([c, [c[0] - 3.4 * k, c[1] + 2.6 * k], [c[0] - 3.4 * k, c[1] - 2.4 * k]], m, z + z2, G.acc);
    P.poly([c, [c[0] + 3.4 * k, c[1] + 2.6 * k], [c[0] + 3.4 * k, c[1] - 2.4 * k]], m, z + z2, G.acc);
    P.ell(c, 1.3 * k, 1.3 * k, 0, m, z + z2 + 0.1, G.acc);
  }
  eyes(P, H, pose, { k, z: z + 2, stalk: pal.stalk, eye: pal.eye, band: pal.eyeBand, ink, pupilC: pal.pupil, farX: 0.6, nearX: 4.8, baseY: 7.2, stalkL: 4.2, er: 3.9, blink: ctx.blink, angFar: 0.1, angNear: 0.4, lashes: true, pupil: 1.15 });
  face(P, H, pose.face === 'neutral' ? { ...pose, face: 'cute' } : pose, { k, mx: 6, my: -4, mw: 3.6, ink });
  const ch = ctx.chains;
  if (ch.antA) { antenna(P, ch.antA.p, pal.ant, z - 2, 1.4 * k, 1 * k); antenna(P, ch.antB.p, backMat(pal.ant, -0.3), z - 2.2, 1.3 * k, 1 * k); }
}

export const MIMI = {
  id: 'mimi',
  dims: { thigh: 0.33, shin: 0.31, ankle: 0.06, upper: 0.23, fore: 0.22, hand: 0.1, torso: 0.48, neck: 0.04, headR: 0.2, shoulderX: 0.17, shoulderDrop: 0.06, hipW: 0.2 },
  box: [150, 165, 75, 122],
  palette,
  draw,
  chains: [
    { id: 'tailL', n: 6, seg: 3.4, rest: [-0.55, -0.83], grav: -0.25, damp: 0.86, wind: 0.2, wf: 4, anchor: (J, P, c) => headFrame(J)(-7 * c.scale, 4.5 * c.scale) },
    { id: 'tailR', n: 6, seg: 3.4, rest: [-0.35, -0.94], grav: -0.25, damp: 0.86, wind: 0.2, wf: 4.5, anchor: (J, P, c) => headFrame(J)(-3 * c.scale, 7.5 * c.scale) },
    { id: 'antA', n: 6, seg: 3.2, rest: [-0.45, 0.89], grav: -0.06, damp: 0.8, stiff: 0.22, wind: 0.1, anchor: (J, P, c) => headFrame(J)(6.5 * c.scale, 4 * c.scale) },
    { id: 'antB', n: 6, seg: 3, rest: [-0.7, 0.72], grav: -0.06, damp: 0.8, stiff: 0.22, wind: 0.1, anchor: (J, P, c) => headFrame(J)(5 * c.scale, 4.6 * c.scale) },
    { id: 'skirt', n: 3, seg: 6, rest: [0, -1], grav: -0.4, damp: 0.85, anchor: (J, P, c) => torsoFrame(J)(0, 0) },
  ],
};
