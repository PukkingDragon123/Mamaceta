// BOBBY - purple-spot mantis shrimp kid in an oversized hoodie, ripped shorts and big high-tops,
// wearing a traffic cone he found. DEMON BOBBY - the cone cracks, the hoodie shreds, horns and
// pixel hellfire come out, and his little clubs grow into long claws.
import { G, M, R, along, lerp2, texPlates, texCloth, texSpots, fist, foot, tailFan, antenna, u32, hexU, mixU, phash } from './kit.js';
import { torsoFrame, polyT, headFrame, eyes, face, backMat } from './common.js';

const PI = Math.PI;
const clampT = (t) => (t < 0 ? 0 : t > 4 ? 4 : t);
const angOf = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);

const SKINS = {
  default: { shell: '#8a5ac9', spot: '#e8d24a', belly: '#c9a8f0', hood: '#3fa08a', hood2: '#2a6a5e', shorts: '#3a5aa0', shoes: '#e03a3a', sole: '#f4f0e6', sock: '#f4f0e6', cone: '#ff7a1a', coneBand: '#f8f8f0', eye: '#fff4c0', eyeBand: '#8a5ac9', ant: '#b080f0', club: '#c03aa0' },
  party: { shell: '#8a5ac9', spot: '#e8d24a', belly: '#c9a8f0', hood: '#ff6fb0', hood2: '#b8357a', shorts: '#3a5aa0', shoes: '#4fd0ff', sole: '#f4f0e6', sock: '#ffcf3a', cone: '#4fd0ff', coneBand: '#ff4f6a', coneDots: '#ffcf3a', pom: '#ffffff', eye: '#fff4c0', eyeBand: '#8a5ac9', ant: '#b080f0', club: '#c03aa0' },
  icecream: { shell: '#8a5ac9', spot: '#e8d24a', belly: '#c9a8f0', hood: '#f4e6d0', hood2: '#c8a070', shorts: '#ff8ab0', shoes: '#8a5a3a', sole: '#f4f0e6', sock: '#ffb6d9', cone: '#d8a05e', coneBand: '#b97f46', waffle: true, scoop: '#ff8ab0', eye: '#fff4c0', eyeBand: '#8a5ac9', ant: '#b080f0', club: '#c03aa0' },
  pumpkin: { shell: '#5a3a8a', spot: '#ff8a2a', belly: '#9a78c0', hood: '#2a2030', hood2: '#1a1420', shorts: '#4a3a5a', shoes: '#ff8a2a', sole: '#2a2030', sock: '#6a3aa0', cone: '#ff8a2a', coneBand: '#ff8a2a', pumpkin: true, eye: '#ffd040', eyeBand: '#ff8a2a', ant: '#6a4aa0', club: '#7a3aa0' },
  wizard: { shell: '#8a5ac9', spot: '#e8d24a', belly: '#c9a8f0', hood: '#2a3a9a', hood2: '#1a2060', shorts: '#2a3a9a', shoes: '#6a4a2a', sole: '#3a2a1a', sock: '#f4f0e6', cone: '#2a3a9a', coneBand: '#2a3a9a', stars: '#fff08a', beard: '#f4f4f0', eye: '#fff4c0', eyeBand: '#8a5ac9', ant: '#b080f0', club: '#c03aa0' },
};

function palette(skin) {
  const S = SKINS[skin] || SKINS.default;
  const p = { S, ink: hexU('#160c1c'), inkLight: hexU('#38204a') };
  const spot = R(S.spot);
  p.shell = M(R(S.shell), { tex: (t, u, v, x, y) => (phash(x >> 1, y >> 1, 4) < 0.08 ? spot[clampT(t)] : (Math.floor(u) % 3 === 0 ? clampT(t - 1) : t)) });
  p.head = M(R(S.shell), { tex: texSpots(0.07, spot, 9, 2) });
  p.belly = M(R(S.belly));
  p.hood = M(R(S.hood, { spread: 0.1 }), { tex: texCloth({ fold: 0.45, skew: 1.6, weave: true }) });
  p.hood2 = M(R(S.hood2));
  p.shorts = M(R(S.shorts), { tex: (t, u, v, x, y) => (phash(x, y, 12) < 0.06 ? clampT(t + 2) : t) });
  p.shoes = M(R(S.shoes, { spread: 0.12 }));
  p.sole = M(R(S.sole, { spread: 0.06 }));
  p.sock = M(R(S.sock, { spread: 0.07 }));
  p.club = M(R(S.club));
  const band = R(S.coneBand, { spread: 0.06 });
  p.cone = M(R(S.cone, { spread: 0.12 }), { tex: S.waffle ? (t, u, v, x, y) => (((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) ? clampT(t - 1) : t) : S.coneDots ? (t, u, v, x, y) => (phash(x >> 1, y >> 1, 5) < 0.12 ? hexU(S.coneDots) : t) : S.stars ? (t, u, v, x, y) => (phash(x, y, 8) < 0.05 ? hexU(S.stars) : t) : null });
  p.coneBand = M(band);
  p.eye = M(R(S.eye, { spread: 0.08 }), { bias: 0.3 });
  p.eyeBand = hexU(S.eyeBand);
  p.stalk = M(R(S.shell));
  p.ant = M(R(S.ant), { flat: 2 });
  p.face = M(R(S.belly));
  p.tail = { seg: M(R(S.shell)), telson: M(R(S.spot)), uro: M(R(S.shell)) };
  if (S.scoop) p.scoop = M(R(S.scoop), { bias: 0.1 });
  if (S.pom) p.pom = M(R(S.pom));
  if (S.beard) p.beard = M(R(S.beard), { tex: (t, u, v, x, y) => (y % 3 === 0 ? clampT(t - 1) : t) });
  p.pumpkin = !!S.pumpkin;
  return p;
}

function draw(P, J, pose, ctx) {
  const k = ctx.scale, pal = ctx.pal, ink = pal.ink, t = ctx.t;
  const T = torsoFrame(J), H = headFrame(J);
  const gl = ctx.glove;
  // back arm (hoodie sleeve)
  armBobby(P, J.armB, pal, k, 4, G.armB, true, pose, gl);
  legBobby(P, J.legB, pal, k, 8, G.legB, true);
  tailFan(P, T(-6 * k, 2 * k), -PI * 0.62 + (pose.tail || 0), 8 * k, { seg: backMat(pal.tail.seg, -0.2), telson: backMat(pal.tail.telson, -0.2), uro: backMat(pal.tail.uro, -0.2) }, 12);
  // shorts
  P.poly(polyT(T, [[-6.6, 3], [6.6, 3], [7.4, -3], [6, -6], [-6.8, -6], [-7.4, -2]], k), pal.shorts, 18, G.clothB);
  // oversized hoodie torso (long, baggy, kangaroo pocket)
  const hood = [[7, -3], [8.4, 4], [7.6, 11], [5.6, 15.5], [-5, 16], [-8.4, 12], [-8.8, 4], [-8, -3.5], [0, -4.6]];
  P.poly(polyT(T, hood, k), pal.hood, 20, G.clothB);
  P.poly(polyT(T, [[0.5, 0], [7.2, 0], [7.8, 5.5], [1, 6]], k), backMat(pal.hood, -0.15), 20.3, G.clothB);
  // drawstrings
  const ds = T(4 * k, 14.5 * k);
  P.line(ds, [ds[0] + 0.5, ds[1] - 6 * k], pal.sock.r[3], 20.6, G.clothB);
  P.line([ds[0] + 2 * k, ds[1]], [ds[0] + 2.6 * k, ds[1] - 5 * k], pal.sock.r[3], 20.6, G.clothB);
  // hood bunched behind the neck
  P.ell(T(-4.5 * k, 15.5 * k), 5.2 * k, 3.6 * k, 0.4, backMat(pal.hood, -0.25), 19.5, G.clothB);
  headBobby(P, J, H, pose, ctx, pal, k);
  legBobby(P, J.legF, pal, k, 30, G.legF, false);
  armBobby(P, J.armF, pal, k, 40, G.armF, false, pose, gl);
}

function armBobby(P, A, pal, k, z, g, back, pose, gl) {
  const B = back ? backMat : (m) => m;
  // baggy sleeve over most of the arm
  P.cap(A.s, A.e, 3.4 * k, 3.1 * k, B(pal.hood), z, g);
  P.cap(A.e, lerp2(A.e, A.h, 0.7), 3.1 * k, 3.4 * k, B(pal.hood), z + 0.1, g);
  P.cap(lerp2(A.e, A.h, 0.62), lerp2(A.e, A.h, 0.78), 3.5 * k, 3.4 * k, B(pal.hood2), z + 0.15, g);
  const ang = angOf(A.e, A.h) + ((back ? pose.wrB : pose.wrF) || 0);
  fist(P, A.h, ang, 4 * k, B(pal.club), z + 0.2, g, { glove: gl ? (back ? { ...gl, main: B(gl.main), cuff: B(gl.cuff) } : gl) : null, kind: back ? pose.fistB : pose.fistF });
}

function legBobby(P, L, pal, k, z, g, back) {
  const B = back ? backMat : (m) => m;
  P.cap(L.s, L.k, 2.6 * k, 2.2 * k, B(pal.shorts), z, g);
  P.cap(L.k, L.a, 1.7 * k, 1.5 * k, B(pal.shell), z + 0.05, g);
  P.cap(lerp2(L.k, L.a, 0.55), L.a, 2 * k, 2 * k, B(pal.sock), z + 0.1, g);
  // chunky high-top sneakers
  const a = L.a;
  P.poly([[a[0] - 3.5 * k, a[1] + 2.5 * k], [a[0] + 2.5 * k, a[1] + 2.5 * k], [a[0] + 6.5 * k, a[1] - 1 * k], [a[0] + 6.5 * k, a[1] - 3.2 * k], [a[0] - 4 * k, a[1] - 3.2 * k]], B(pal.shoes), z + 0.3, g);
  P.poly([[a[0] - 4 * k, a[1] - 1.8 * k], [a[0] + 6.8 * k, a[1] - 1.8 * k], [a[0] + 6.8 * k, a[1] - 3.4 * k], [a[0] - 4 * k, a[1] - 3.4 * k]], B(pal.sole), z + 0.35, g);
  P.px([a[0] + 1 * k, a[1] + 1 * k], pal.sole.r[4], z + 0.4, g);
}

function headBobby(P, J, H, pose, ctx, pal, k) {
  const z = 26, ink = pal.ink;
  P.ell(H(0, 0), 8 * k, 7.4 * k, -H.ang, pal.head, z, G.head);
  P.ell(H(3.4 * k, -2.6 * k), 4.8 * k, 4 * k, -H.ang - 0.2, pal.face, z + 0.2, G.head);
  // band-aid on the cheek
  P.rect(H(1 * k, -1 * k), Math.max(2, Math.round(3 * k)), Math.max(1, Math.round(2 * k)), hexU('#f0c090'), z + 0.3, G.head);
  // eyes peek out from under the cone brim
  eyes(P, H, pose, { k, z: z + 2, stalk: pal.stalk, eye: pal.eye, band: pal.eyeBand, ink, farX: 1, nearX: 4.6, baseY: 5, stalkL: 3.2, er: 3.4, blink: ctx.blink, angFar: 0.35, angNear: 0.7 });
  if (pal.beard) P.poly([H(3 * k, -5 * k), H(9 * k, -5 * k), H(5 * k, -16 * k)], pal.beard, z + 1.2, G.faceAcc);
  face(P, H, pose, { k, mx: 5.8, my: -3.6, mw: 4, ink });
  if (pose.face === 'grin' || pose.face === 'neutral') P.paint(H(6 * k, -4.4 * k), hexU('#fffbe8'));
  const ch = ctx.chains;
  if (ch.antA) { antenna(P, ch.antA.p, pal.ant, z - 2, 1.4 * k, 1 * k); antenna(P, ch.antB.p, backMat(pal.ant, -0.3), z - 2.2, 1.3 * k, 1 * k); }
  // traffic cone (tilted, wobbling)
  const tilt = (pose.cone || 0) + Math.sin(ctx.t * 3) * 0.04;
  const base = H(-1 * k, 5.5 * k);
  const ang = H.ang + tilt - 0.15;
  const up = [Math.sin(ang), Math.cos(ang)], side = [Math.cos(ang), -Math.sin(ang)];
  const pt = (a, b) => [base[0] + side[0] * a + up[0] * b, base[1] + side[1] * a + up[1] * b];
  if (pal.pumpkin) {
    P.ell(pt(0, 5 * k), 10 * k, 8 * k, -ang, pal.cone, z + 3, G.hat);
    for (const [a, b] of [[-3, 7], [3, 7]]) P.poly([pt((a - 1.5) * k, (b - 1) * k), pt((a + 1.5) * k, (b - 1) * k), pt(a * k, (b + 2) * k)], { r: [hexU('#ffe060'), hexU('#ffe060'), hexU('#ffd040'), hexU('#ffd040'), hexU('#fff0a0')], flat: 2 }, z + 3.2, G.hat);
    P.cap(pt(0, 12.5 * k), pt(1 * k, 15 * k), 1.2 * k, 1 * k, M(R('#3a8a2a')), z + 3.1, G.hat);
    return;
  }
  // brim
  P.poly([pt(-11 * k, 0), pt(11 * k, 0), pt(11 * k, 2.4 * k), pt(-11 * k, 2.4 * k)], pal.cone, z + 3, G.hat);
  // cone body
  P.poly([pt(-8 * k, 2 * k), pt(8 * k, 2 * k), pt(1.6 * k, 19 * k), pt(-1.6 * k, 19 * k)], pal.cone, z + 3.1, G.hat, { bulge: 0.9 });
  if (!pal.S.waffle && !pal.S.stars && pal.S.coneBand !== pal.S.cone) {
    P.poly([pt(-6.4 * k, 6 * k), pt(6.4 * k, 6 * k), pt(5.2 * k, 9 * k), pt(-5.2 * k, 9 * k)], pal.coneBand, z + 3.2, G.hat, { bulge: 0.9 });
    P.poly([pt(-4.3 * k, 11.5 * k), pt(4.3 * k, 11.5 * k), pt(3.4 * k, 13.8 * k), pt(-3.4 * k, 13.8 * k)], pal.coneBand, z + 3.2, G.hat, { bulge: 0.9 });
  }
  if (pal.scoop) P.ell(pt(0, 21 * k), 5 * k, 4.2 * k, -ang, pal.scoop, z + 3.3, G.hat);
  if (pal.pom) P.ell(pt(0, 20 * k), 2.8 * k, 2.8 * k, 0, pal.pom, z + 3.3, G.hat);
  // scuffs
  P.paint(pt(-3 * k, 4 * k), pal.cone.r[1]); P.paint(pt(2 * k, 15 * k), pal.cone.r[1]);
}

// ======================================================================= DEMON
const DEMON = { shell: '#4a2a6a', spot: '#ff2a4a', belly: '#7a4a8a', hood: '#2a2030', hood2: '#6a1424', shorts: '#241a2a', cone: '#3a2a32', crack: '#ff4a2a', eye: '#ff3a3a', ant: '#ff5a7a', claw: '#f0e8f0', horn: '#f0e0d0' };

function demonPalette() {
  const S = DEMON;
  const p = { S, ink: hexU('#08040a'), inkLight: hexU('#40101c') };
  p.shell = M(R(S.shell, { spread: 0.12 }), { tex: (t, u, v, x, y) => (phash(x >> 1, y >> 1, 4) < 0.05 ? hexU(S.spot) : (Math.floor(u) % 3 === 0 ? clampT(t - 1) : t)) });
  p.head = M(R(S.shell, { spread: 0.12 }));
  p.hood = M(R(S.hood, { spread: 0.1 }), { tex: (t, u, v, x, y) => (phash(x, y, 21) < 0.05 ? hexU(S.hood2) : t) });
  p.shorts = M(R(S.shorts));
  p.cone = M(R(S.cone, { spread: 0.08 }));
  p.crack = hexU(S.crack);
  p.eye = M(R(S.eye), { bias: 0.5 });
  p.stalk = M(R(S.shell));
  p.ant = M(R(S.ant), { flat: 2 });
  p.claw = M(R(S.claw, { spread: 0.1 }));
  p.horn = M(R(S.horn, { spread: 0.1 }), { tex: (t, u) => (Math.floor(u) % 3 === 0 ? clampT(t - 1) : t) });
  p.face = M(R(S.belly));
  p.flames = ['#3a0a2a', '#a0102a', '#ff3a2a', '#ffb040'].map(hexU);
  p.tail = { seg: p.shell, telson: M(R('#5a0a1a')), uro: p.shell };
  return p;
}

function drawDemon(P, J, pose, ctx) {
  const k = ctx.scale, pal = ctx.pal, ink = pal.ink, t = ctx.t;
  const T = torsoFrame(J), H = headFrame(J);
  // shadow-fire aura behind the body (flat pixel flames, no glow)
  demonFire(P, J, t, pal.flames, k, 2);
  clawArm(P, J.armB, pal, k, 4, G.armB, true);
  legDemon(P, J.legB, pal, k, 8, G.legB, true);
  tailFan(P, T(-7 * k, 2 * k), -PI * 0.6 + (pose.tail || 0), 12 * k, { seg: backMat(pal.tail.seg, -0.2), telson: pal.tail.telson, uro: backMat(pal.tail.uro, -0.2) }, 12);
  P.poly(polyT(T, [[-7.5, 3], [7.5, 3], [8, -4], [-8, -4]], k), pal.shorts, 18, G.clothB);
  // shredded hoodie: ragged hem + torn holes showing the shell
  const hood = [[8, -2], [9.4, 6], [8.6, 14], [6, 19], [-6, 20], [-10, 15], [-10.5, 6], [-9.5, -1], [-6, -4], [-4, -1.5], [-1.5, -5], [1.5, -2], [4, -5.5], [6, -2]];
  P.poly(polyT(T, hood, k), pal.hood, 20, G.clothB);
  for (const [f, h, r] of [[3, 9, 2.4], [-5, 12, 2], [5, 2, 1.6]]) P.ell(T(f * k, h * k), r * k, r * 0.8 * k, 0.3, pal.shell, 20.4, G.clothB);
  P.ell(T(-6 * k, 19 * k), 5 * k, 3.6 * k, 0.4, backMat(pal.hood, -0.25), 19.5, G.clothB);
  headDemon(P, J, H, pose, ctx, pal, k);
  legDemon(P, J.legF, pal, k, 30, G.legF, false);
  clawArm(P, J.armF, pal, k, 40, G.armF, false);
  demonFire(P, J, t, pal.flames, k, 60, true);
}

function clawArm(P, A, pal, k, z, g, back) {
  const B = back ? backMat : (m) => m;
  P.cap(A.s, A.e, 3.2 * k, 2.6 * k, B(pal.hood), z, g);
  P.cap(A.e, A.h, 2.6 * k, 2.2 * k, B(pal.shell), z + 0.1, g);
  const ang = angOf(A.e, A.h);
  // three long hooked claws
  for (let i = -1; i <= 1; i++) {
    const a = ang + i * 0.32;
    const m1 = along(A.h, a, 5 * k), tip = along(m1, a + 0.55, 5 * k);
    P.stroke([A.h, m1, tip], 2.4 * k, 0.8 * k, B(pal.claw), z + 0.2 + i * 0.01, g);
  }
}
function legDemon(P, L, pal, k, z, g, back) {
  const B = back ? backMat : (m) => m;
  P.cap(L.s, L.k, 3.4 * k, 2.8 * k, B(pal.shorts), z, g);
  P.cap(L.k, L.a, 2.4 * k, 1.8 * k, B(pal.shell), z + 0.05, g);
  // bare clawed feet
  const toe = [L.a[0] + 7 * k, L.a[1] - 2.5 * k];
  P.stroke([L.a, [L.a[0] + 4 * k, L.a[1] - 1 * k], toe], 3 * k, 1 * k, B(pal.shell), z + 0.2, g);
  P.stroke([[L.a[0] + 1 * k, L.a[1] - 1 * k], [L.a[0] + 4 * k, L.a[1] - 2.6 * k], [L.a[0] + 6 * k, L.a[1] - 2.6 * k]], 2 * k, 0.8 * k, B(pal.claw), z + 0.25, g);
}
function headDemon(P, J, H, pose, ctx, pal, k) {
  const z = 26, ink = pal.ink;
  P.ell(H(0, 0), 9 * k, 8 * k, -H.ang, pal.head, z, G.head);
  P.ell(H(4 * k, -3 * k), 5.4 * k, 4.4 * k, -H.ang - 0.2, pal.face, z + 0.2, G.head);
  // horns curling forward
  for (const [x, s] of [[-5, -1], [2.5, 1]]) {
    const b = H(x * k, 6 * k);
    P.stroke([b, along(b, H.ang - 0.4 + s * 0.1, 5 * k), along(along(b, H.ang - 0.4, 5 * k), H.ang + 0.7, 5 * k)], 3.4 * k, 0.8 * k, x < 0 ? backMat(pal.horn, -0.3) : pal.horn, z + (x < 0 ? -0.5 : 2.5), G.hat);
  }
  // cracked cone shard fragments, burning
  const base = H(-1.5 * k, 6.5 * k);
  P.poly([[base[0] - 9 * k, base[1]], [base[0] + 8 * k, base[1]], [base[0] + 6 * k, base[1] + 4 * k], [base[0] + 2 * k, base[1] + 3 * k], [base[0] - 1 * k, base[1] + 7 * k], [base[0] - 4 * k, base[1] + 3.5 * k], [base[0] - 7 * k, base[1] + 4.5 * k]], pal.cone, z + 3, G.hat);
  for (let i = -6; i <= 5; i += 3) P.paint([base[0] + i * k, base[1] + 2 * k], pal.crack);
  // burning slit eyes (no stalks visible: they're sunk into the shadow)
  const ex = EXPR_DEMON(pose);
  for (const [x, y] of [[2.5, 2.5], [6.5, 2]]) {
    const c = H(x * k, y * k);
    for (let i = -1; i <= 1; i++) P.paint([c[0] + i * k, c[1] + i * 0.4 * k * ex], pal.eye.r[4]);
    P.paint([c[0] + 1.5 * k, c[1] + 0.8 * k], pal.eye.r[2]);
  }
  face(P, H, { ...pose, face: pose.face === 'hurt' ? 'hurt' : 'fangs' }, { k, mx: 6, my: -4, mw: 5, ink, teeth: hexU('#f4ecf0') });
  const ch = ctx.chains;
  if (ch.antA) { antenna(P, ch.antA.p, pal.ant, z - 2, 1.4 * k, 1 * k); antenna(P, ch.antB.p, backMat(pal.ant, -0.3), z - 2.2, 1.3 * k, 1 * k); }
}
const EXPR_DEMON = (pose) => (pose.face === 'hurt' ? -1 : 1);

function demonFire(P, J, t, cols, k, z, front = false) {
  const pts = front ? [J.armF.h, J.head] : [J.head, J.neck, J.hip, J.armB.h];
  for (let n = 0; n < pts.length; n++) {
    const base = pts[n];
    const cnt = front ? 3 : 6;
    for (let i = 0; i < cnt; i++) {
      const ph = (t * (front ? 2.6 : 1.8) + i / cnt + n * 0.13) % 1;
      const x = base[0] + Math.sin(i * 2.7 + n + t * 3) * (front ? 3 : 7) * k, y = base[1] + ph * (front ? 10 : 18) * k - (front ? 0 : 4 * k);
      const r = (1 - ph) * (front ? 1.6 : 3.2) * k + 0.5;
      const c = cols[Math.min(3, Math.floor((1 - ph) * (front ? 4 : 3.2)))];
      P.ell([x, y], r, r * 1.4, 0, { r: [c, c, c, c, c], flat: 2 }, z + i * 0.01, G.fx);
    }
  }
}

export const BOBBY = {
  id: 'bobby',
  dims: { thigh: 0.23, shin: 0.22, ankle: 0.07, upper: 0.2, fore: 0.19, hand: 0.1, torso: 0.36, neck: 0.02, headR: 0.17, shoulderX: 0.18, shoulderDrop: 0.06, hipW: 0.2 },
  box: [130, 150, 65, 112],
  palette,
  draw,
  chains: [
    { id: 'antA', n: 6, seg: 3, rest: [-0.4, 0.92], grav: -0.07, damp: 0.78, stiff: 0.2, wind: 0.1, anchor: (J, P, c) => headFrame(J)(6 * c.scale, 2.5 * c.scale) },
    { id: 'antB', n: 6, seg: 2.8, rest: [-0.65, 0.76], grav: -0.07, damp: 0.78, stiff: 0.2, wind: 0.1, anchor: (J, P, c) => headFrame(J)(4.6 * c.scale, 3 * c.scale) },
  ],
};

export const DEMON_BOBBY = {
  id: 'demon',
  demon: true,
  dims: { thigh: 0.3, shin: 0.3, ankle: 0.06, upper: 0.32, fore: 0.32, hand: 0.12, torso: 0.46, neck: 0.03, headR: 0.2, shoulderX: 0.26, shoulderDrop: 0.08, hipW: 0.24 },
  box: [180, 180, 90, 136],
  palette: demonPalette,
  draw: drawDemon,
  chains: [
    { id: 'antA', n: 8, seg: 3.4, rest: [-0.8, 0.6], grav: -0.03, damp: 0.82, stiff: 0.12, wind: 0.22, wf: 7, anchor: (J, P, c) => headFrame(J)(6 * c.scale, 3 * c.scale) },
    { id: 'antB', n: 8, seg: 3.2, rest: [-0.9, 0.4], grav: -0.03, damp: 0.82, stiff: 0.12, wind: 0.22, wf: 8, anchor: (J, P, c) => headFrame(J)(4.6 * c.scale, 3.4 * c.scale) },
  ],
};
