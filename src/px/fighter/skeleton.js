// 2D side-view skeleton. Poses are authored as targets in body units (world units relative to
// the feet, x = forward): hip position, torso lean, hand/foot targets (2-bone IK), head tilt,
// squash & stretch and whole-body rotation. Output joints are in local art pixels (y up).
import { PPU } from '../display.js';

export const BASE_POSE = {
  hip: [0, 0.66], lean: 0.08, chest: 0.04, head: 0, neck: 0,
  hF: [0.34, 0.95], hB: [0.2, 0.92], fF: [0.18, 0], fB: [-0.2, 0],
  elF: 1, elB: 1, knF: 1, knB: 1, wrF: 0, wrB: 0, fistF: 'fist', fistB: 'fist',
  sq: [1, 1], rot: 0, rootX: 0, rootY: 0, tail: 0, face: 'neutral', eyes: 1, look: [1, 0],
  footF: 0, footB: 0, mouth: 0, shoulder: 0, belly: 0, arms: null,
};

export function solveIK(sx, sy, tx, ty, l1, l2, bend) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const maxR = (l1 + l2) * 0.999, minR = Math.abs(l1 - l2) + 0.5;
  if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
  const dc = Math.max(minR, Math.min(maxR, d));
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = sx + ux * a, my = sy + uy * a;
  // bend > 0 -> joint on the "clockwise" side
  const ex = mx - uy * h * bend, ey = my + ux * h * bend;
  return { ex, ey, hx: sx + ux * dc, hy: sy + uy * dc };
}

const rotP = (x, y, cx, cy, c, s) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];

// dims (body units): thigh, shin, foot, upper, fore, hand, torso, neck, headR, shoulderX, hipW
export function buildJoints(dims, P) {
  const U = PPU;
  const sqx = P.sq?.[0] ?? 1, sqy = P.sq?.[1] ?? 1;
  const hipX = (P.hip[0] + P.rootX) * U, hipY = (P.hip[1] + P.rootY) * U;
  const lean = P.lean, chest = P.chest || 0;
  const tl = dims.torso * U;
  // spine: pelvis -> waist -> chest -> neck
  const waistX = hipX + Math.sin(lean) * tl * 0.45, waistY = hipY + Math.cos(lean) * tl * 0.45;
  const la2 = lean + chest;
  const neckX = waistX + Math.sin(la2) * tl * 0.55, neckY = waistY + Math.cos(la2) * tl * 0.55;
  const chestX = waistX + Math.sin(la2) * tl * 0.3, chestY = waistY + Math.cos(la2) * tl * 0.3;
  const hn = la2 + (P.neck || 0);
  const headX = neckX + Math.sin(hn) * (dims.neck + dims.headR) * U, headY = neckY + Math.cos(hn) * (dims.neck + dims.headR) * U;
  const sx = dims.shoulderX * U, sh = (P.shoulder || 0) * U;
  const shF = [neckX + Math.cos(la2) * sx * 0.25 - Math.sin(la2) * (dims.shoulderDrop * U) + sh, neckY - Math.cos(la2) * (dims.shoulderDrop * U) - Math.sin(la2) * sx * 0.25];
  const shB = [neckX - Math.cos(la2) * sx * 0.25 - Math.sin(la2) * (dims.shoulderDrop * U) - sh * 0.5, neckY - Math.cos(la2) * (dims.shoulderDrop * U) + Math.sin(la2) * sx * 0.25];
  const hw = dims.hipW * U;
  const hpF = [hipX + hw * 0.3, hipY - 2], hpB = [hipX - hw * 0.3, hipY - 2];
  const arm = (s, tgt, bend) => {
    const r = solveIK(s[0], s[1], (tgt[0] + P.rootX) * U, (tgt[1] + P.rootY) * U, dims.upper * U, dims.fore * U, bend);
    return { s, e: [r.ex, r.ey], h: [r.hx, r.hy] };
  };
  const leg = (s, tgt, bend) => {
    const r = solveIK(s[0], s[1], (tgt[0] + P.rootX) * U, (tgt[1] + P.rootY) * U + dims.ankle * U, dims.thigh * U, dims.shin * U, bend);
    return { s, k: [r.ex, r.ey], a: [r.hx, r.hy] };
  };
  const J = {
    hip: [hipX, hipY], waist: [waistX, waistY], chest: [chestX, chestY], neck: [neckX, neckY], head: [headX, headY],
    lean, la2, hn, headAng: hn + (P.head || 0),
    armF: arm(shF, P.hF, -(P.elF ?? 1)), armB: arm(shB, P.hB, -(P.elB ?? 1)),
    legF: leg(hpF, P.fF, P.knF ?? 1), legB: leg(hpB, P.fB, P.knB ?? 1),
  };
  // global squash/stretch about the feet + body rotation about the pelvis
  const rot = P.rot || 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const pivX = hipX, pivY = hipY;
  const tf = (p) => {
    let x = p[0], y = p[1];
    if (rot) [x, y] = rotP(x, y, pivX, pivY, c, -s);
    return [x * sqx, y * sqy];
  };
  const T = (o) => { for (const k in o) { const v = o[k]; if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') o[k] = tf(v); } };
  T(J); T(J.armF); T(J.armB); T(J.legF); T(J.legB);
  J.lean = lean - rot; J.la2 = la2 - rot; J.hn = hn - rot; J.headAng = J.headAng - rot; J.rot = rot;
  J.sqx = sqx; J.sqy = sqy;
  return J;
}

// blend two poses (numbers, [x,y] arrays; strings switch at 0.5)
export function mixPose(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  const o = {};
  for (const k in a) o[k] = a[k];
  for (const k in b) {
    const va = a[k], vb = b[k];
    if (Array.isArray(vb) && Array.isArray(va) && typeof vb[0] === 'number') o[k] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t];
    else if (typeof vb === 'number' && typeof va === 'number') o[k] = va + (vb - va) * t;
    else o[k] = t < 0.5 && va !== undefined ? va : vb;
  }
  return o;
}
export const over = (a, b) => Object.assign({}, a, b);
