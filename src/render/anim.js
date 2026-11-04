// Procedural animation: maps simulation state -> rig pose, with anticipation, snap, overshoot,
// follow-through, squash & stretch and per-character personality.
import { DEFAULT_POSE } from './rig.js';
import { ease, clamp, lerp } from '../core/math.js';

const TAU = Math.PI * 2;
const S = (t) => t * t * (3 - 2 * t);

function mixInto(out, a, b, t) {
  for (const k in b) {
    const vb = b[k];
    const va = a[k] ?? DEFAULT_POSE[k];
    if (Array.isArray(vb)) out[k] = Array.isArray(va) ? [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)] : (t < 0.5 ? va : vb);
    else if (typeof vb === 'number') out[k] = lerp(typeof va === 'number' ? va : 0, vb, t);
    else if (vb !== undefined) out[k] = t < 0.5 && va !== undefined ? va : vb;
  }
  return out;
}
export function over(base, o) { return Object.assign({}, base, o); }
function blend(a, b, t) { return mixInto(Object.assign({}, a), a, b, clamp(t, 0, 1)); }

// ---------------- character stances
export const STYLE = {
  jim: {
    stance: { hipDrop: 0.15, hipRot: 0.1, sp1: 0.08, sp2: 0.16, head: -0.12, hF: [0.62, 0.66], hB: [0.42, 0.5], fF: [0.34, 0], fB: [-0.32, 0], wrF: -0.3, wrB: -0.2, tail: 0.1 },
    bounce: 0.03, bspeed: 8.5, walkLift: 0.16,
  },
  brutus: {
    stance: { hipDrop: 0.05, hipRot: -0.04, sp1: 0.0, sp2: 0.06, head: 0.05, hF: [0.78, 0.18], hB: [0.66, 0.06], fF: [0.42, 0], fB: [-0.42, 0], wrF: 0.0, wrB: 0.05, tail: 0.0 },
    bounce: 0.015, bspeed: 3.6, walkLift: 0.1,
  },
  bobby: {
    stance: { hipDrop: 0.12, hipRot: 0.06, sp1: 0.06, sp2: 0.1, head: -0.08, hF: [0.55, 0.38], hB: [0.35, 0.25], fF: [0.3, 0], fB: [-0.28, 0], wrF: 0.4, wrB: 0.3, tail: 0.15 },
    bounce: 0.025, bspeed: 6, walkLift: 0.2, wobble: 1,
  },
  mimi: {
    stance: { hipDrop: 0.1, hipRot: 0.04, sp1: 0.04, sp2: 0.08, head: -0.06, hF: [0.5, 0.72], hB: [0.38, 0.68], fF: [0.26, 0], fB: [-0.22, 0], wrF: -0.5, wrB: -0.5, tail: 0.2, headRoll: 0.1 },
    bounce: 0.03, bspeed: 7, walkLift: 0.22,
  },
  demon: {
    stance: { hipDrop: 0.36, hipRot: 0.5, sp1: 0.45, sp2: 0.55, head: -0.55, hF: [0.42, -0.5], hB: [0.22, -0.62], fF: [0.42, 0], fB: [-0.4, 0], wrF: 0.9, wrB: 0.8, tail: 0.5, eyesOpen: 1.25 },
    bounce: 0.01, bspeed: 2, walkLift: 0.12, twitch: 1,
  },
};

export function styleFor(f) {
  if (f.char === 'bobby' && f.cs && f.cs.demon) return STYLE.demon;
  return STYLE[f.char] || STYLE.jim;
}

// stance with idle motion (t in seconds)
export function stance(st, t, amt = 1) {
  const p = over(DEFAULT_POSE, st.stance);
  const b = Math.sin(t * st.bspeed);
  const b2 = Math.sin(t * st.bspeed * 0.5 + 1.3);
  p.hipDrop += (b * 0.5 + 0.5) * st.bounce * 2.2 * amt;
  p.hF = [p.hF[0] + b2 * 0.02 * amt, p.hF[1] - b * 0.03 * amt];
  p.hB = [p.hB[0] - b2 * 0.02 * amt, p.hB[1] - b * 0.025 * amt];
  p.sp2 += b * 0.02 * amt;
  p.head += -b * 0.02 * amt;
  p.tail += Math.sin(t * 2.1) * 0.08;
  p.fan = Math.sin(t * 3.3) * 0.08;
  if (st.wobble) { p.hipRoll = Math.sin(t * 2.7) * 0.06; p.headRoll = Math.sin(t * 3.1 + 1) * 0.15; p.hipX = Math.sin(t * 1.9) * 0.02; }
  if (st.twitch) {
    const tw = Math.floor(t * 7);
    const h = Math.sin(tw * 12.9898) * 43758.5453;
    const r = h - Math.floor(h);
    if (r > 0.82) { p.head += (r - 0.9) * 2.2; p.headRoll = (r - 0.82) * 4; }
    p.hF = [p.hF[0] + Math.sin(t * 13) * 0.01, p.hF[1]];
  }
  return p;
}

function walkCycle(st, t, dir, speed, amt = 1) {
  const p = stance(st, t, 0.4);
  const ph = t * speed;
  const s = Math.sin(ph), c = Math.cos(ph);
  const stride = 0.34 * amt;
  p.fF = [p.fF[0] * 0.6 + s * stride * dir, Math.max(0, c) * st.walkLift * amt];
  p.fB = [p.fB[0] * 0.6 - s * stride * dir, Math.max(0, -c) * st.walkLift * amt];
  p.hipDrop += Math.abs(s) * 0.03 * amt;
  p.hipRot += 0.06 * dir * amt;
  p.hipYaw = s * 0.08 * amt;
  p.hF = [p.hF[0] - s * 0.05 * amt, p.hF[1]];
  p.hB = [p.hB[0] + s * 0.05 * amt, p.hB[1]];
  return p;
}

// Attack builder: wind (anticipation) -> hit (snap w/ overshoot) -> recover
function strike(base, mf, m, wind, hit, o = {}) {
  const [s, a, r] = m.t;
  const W = over(base, wind), Hh = over(base, hit);
  const Ho = o.hold ? over(Hh, o.hold) : Hh;
  let p;
  if (mf < s) {
    const k = mf / Math.max(1, s);
    p = blend(base, W, ease.inOutQuad(Math.min(1, k * 1.15)));
    p.sqY = (p.sqY ?? 1) * (1 - 0.06 * k); p.sqX = (p.sqX ?? 1) * (1 + 0.04 * k);
  } else if (mf < s + a) {
    const k = (mf - s) / Math.max(1, a);
    const snap = Math.min(1, (mf - s + 1) / 2);
    p = blend(W, Hh, ease.outBack(snap, 2.2));
    if (o.hold) p = blend(p, Ho, k);
    p.sqX = (p.sqX ?? 1) * (1.06 - k * 0.04); p.sqY = (p.sqY ?? 1) * 0.97;
  } else {
    const k = (mf - s - a) / Math.max(1, r);
    p = blend(Ho, base, ease.inOutCubic(Math.min(1, k)));
  }
  return p;
}

// ---------------- move animations (wind, hit) per anim key
function moveAnim(key, base, mf, m, f, t) {
  const B = base;
  switch (key) {
    // --- Jim / smashers
    case 'jab': return strike(B, mf, m, { hF: [0.42, 0.62], sp2: B.sp2 + 0.05, sp2Yaw: 0.2 }, { hF: [1.0, 0.68], wrF: -1.4, sp2: B.sp2 + 0.18, sp2Yaw: -0.35, armZF: 0.15, head: B.head + 0.05 });
    case 'jab2': return strike(B, mf, m, { hB: [0.3, 0.55], sp2Yaw: -0.3 }, { hB: [1.0, 0.62], wrB: -1.4, sp2: B.sp2 + 0.2, sp2Yaw: 0.45, armZB: 0.2, hipYaw: 0.2 });
    case 'jab3': return strike(B, mf, m, { hF: [0.3, 0.4], sp2Yaw: 0.4, hipDrop: B.hipDrop + 0.08 }, { hF: [1.0, 0.85], wrF: -1.6, sp2: B.sp2 + 0.25, sp2Yaw: -0.5, fF: [0.5, 0], hipX: 0.06 });
    case 'clight': {
      const cb = over(B, { hipDrop: 0.42, sp1: 0.2, sp2: 0.3, head: -0.1, hF: [0.5, 0.2], hB: [0.35, 0.25] });
      return strike(cb, mf, m, { hF: [0.4, 0.05] }, { hF: [1.0, -0.25], wrF: -1.2, sp2: 0.45, armZF: 0.1 });
    }
    case 'uppercut': case 'dp': {
      const p = strike(B, mf, m, { hipDrop: 0.4, hB: [0.25, -0.3], sp2: B.sp2 + 0.25, sp2Yaw: -0.4 }, { hipDrop: 0.0, hB: [0.35, 1.0], wrB: -2.2, sp2: -0.15, sp2Yaw: 0.5, head: -0.35, fF: [0.2, 0.25], fB: [-0.15, 0.05], armZB: 0.25 });
      if (key === 'dp' && mf >= m.t[0]) p.rootRot = -Math.min(1, (mf - m.t[0]) / 14) * 0.25;
      return p;
    }
    case 'heavy': return strike(B, mf, m, { hB: [0.05, 0.42], sp2Yaw: -0.6, sp2: B.sp2 - 0.05, hipYaw: -0.25, hipDrop: B.hipDrop + 0.05, fF: [0.4, 0] }, { hB: [1.05, 0.55], wrB: -1.6, sp2Yaw: 0.6, sp2: B.sp2 + 0.25, hipYaw: 0.35, fF: [0.55, 0], fB: [-0.4, 0], armZB: 0.3, hipX: 0.05 });
    case 'charged': return strike(B, mf, m, { hB: [-0.1, 0.4], sp2Yaw: -0.8 }, { hB: [1.1, 0.55], wrB: -1.7, sp2Yaw: 0.8, sp2: B.sp2 + 0.35, hipYaw: 0.4, fF: [0.65, 0], fB: [-0.5, 0], armZB: 0.35, hipX: 0.12, hipDrop: 0.25 });
    case 'barrage': {
      const [s, a] = m.t;
      if (mf < s || mf >= s + a) return strike(B, mf, m, { hF: [0.4, 0.6], hB: [0.3, 0.5] }, { hF: [0.9, 0.7] });
      const k = ((mf - s) % m.every) / m.every;
      const alt = Math.floor((mf - s) / m.every) % 2;
      const p = over(B, { sp2: B.sp2 + 0.15, hipDrop: B.hipDrop + 0.04 });
      const ext = Math.sin(k * Math.PI);
      const yv = 0.55 + Math.sin((mf - s) * 1.7) * 0.15;
      if (alt) { p.hF = [0.4 + ext * 0.6, yv]; p.wrF = -1.3 * ext; p.sp2Yaw = -0.3 * ext; }
      else { p.hB = [0.35 + ext * 0.65, yv]; p.wrB = -1.3 * ext; p.sp2Yaw = 0.35 * ext; }
      p.sqX = 1 + ext * 0.04;
      return p;
    }
    case 'cannon': return strike(B, mf, m, { hF: [0.1, 0.3], hB: [0.0, 0.35], hipDrop: 0.28, sp2: B.sp2 - 0.1, sp2Yaw: -0.5, hipYaw: -0.4, head: B.head - 0.15 }, { hF: [1.0, 0.5], hB: [0.95, 0.45], wrF: -1.5, wrB: -1.5, sp2: B.sp2 + 0.25, sp2Yaw: 0.2, fF: [0.55, 0], fB: [-0.45, 0], hipDrop: 0.2 }, { hold: { hF: [0.98, 0.52], hB: [0.93, 0.47] } });
    case 'counter': {
      const p = over(B, { hipDrop: 0.25, sp2Yaw: -0.3, hF: [0.25, 0.75], hB: [0.6, 0.15], head: -0.2, wrF: -0.8, eyesOpen: 0.55 });
      p.hipDrop += Math.sin(t * 20) * 0.005;
      return p;
    }
    case 'airL': return strike(over(B, airBase()), mf, m, { hF: [0.4, 0.4] }, { hF: [1.0, 0.25], wrF: -1.3, fF: [0.5, 0.35], sp2: 0.3 });
    case 'airH': return strike(over(B, airBase()), mf, m, { hB: [-0.1, 0.9], sp2: -0.2, rootRot: 0.3 }, { hB: [0.95, -0.4], wrB: -1.8, sp2: 0.6, rootRot: -0.4, fF: [0.2, 0.4], fB: [-0.2, 0.3] });
    case 'grab': return strike(B, mf, m, { hF: [0.35, 0.4], hB: [0.3, 0.35] }, { hF: [0.95, 0.4], hB: [0.9, 0.35], wrF: -0.6, wrB: -0.6, sp2: B.sp2 + 0.25 });
    case 'ultDash': {
      const p = over(B, { hipDrop: 0.3, hipRot: 0.45, sp1: 0.2, sp2: 0.35, hB: [-0.1, 0.4], hF: [0.6, 0.5], fF: [0.6, 0], fB: [-0.6, 0.1], head: -0.25 });
      if (mf < m.t[0]) { p.hipDrop = 0.4; p.sqY = 0.9; }
      return p;
    }
    // --- Brutus
    case 'stab': return strike(B, mf, m, { hF: [0.45, 0.15], sp2Yaw: 0.2 }, { hF: [1.05, 0.2], sp2: B.sp2 + 0.12, sp2Yaw: -0.3, fF: [0.5, 0] });
    case 'stab2': return strike(B, mf, m, { hB: [0.4, 0.05] }, { hB: [1.05, 0.12], sp2: B.sp2 + 0.12, sp2Yaw: 0.35, hipYaw: 0.15 });
    case 'lowStab': return strike(over(B, { hipDrop: 0.3, sp2: 0.2 }), mf, m, { hF: [0.4, -0.2] }, { hF: [1.05, -0.45], sp2: 0.35 });
    case 'spearFlurry': {
      const [s, a] = m.t;
      if (mf < s || mf >= s + a) return strike(B, mf, m, { hF: [0.45, 0.2], hB: [0.4, 0.1] }, { hF: [1.0, 0.2] });
      const k = ((mf - s) % m.every) / m.every, alt = Math.floor((mf - s) / m.every) % 2;
      const ext = Math.sin(k * Math.PI);
      const p = over(B, { sp2: B.sp2 + 0.1 });
      if (alt) p.hF = [0.45 + ext * 0.6, 0.2 + Math.sin(mf) * 0.1]; else p.hB = [0.4 + ext * 0.65, 0.1 + Math.cos(mf) * 0.1];
      return p;
    }
    case 'skewerToss': return strike(B, mf, m, { hF: [0.55, 0.0], hB: [0.5, -0.05] }, { hF: [0.1, 1.0], hB: [0.0, 0.95], sp2: -0.35, head: -0.3, hipDrop: 0.0, rootRot: 0.1 });
    case 'bellyBump': case 'bellyBash': {
      const p = strike(B, mf, m, { hipX: -0.12, sp1: -0.25, sp2: -0.2, hipDrop: 0.18, hF: [0.3, 0.6], hB: [0.2, 0.55], sqX: 0.92 }, { hipX: 0.18, sp1: -0.35, sp2: -0.15, hipRot: -0.25, hipDrop: 0.08, hF: [0.1, 0.75], hB: [0.0, 0.7], fF: [0.6, 0], fB: [-0.5, 0], head: -0.2 });
      if (mf >= m.t[0] && mf < m.t[0] + m.t[1]) { p.sqX = 1.18; p.sqY = 0.92; }
      return p;
    }
    case 'bellyLaunch': return strike(B, mf, m, { hipDrop: 0.35, sp1: 0.3, sp2: 0.25, sqY: 0.85 }, { hipDrop: 0.0, sp1: -0.4, sp2: -0.25, head: -0.45, hF: [0.2, 0.95], hB: [0.1, 0.9], sqY: 1.15, sqX: 0.92 });
    case 'snag': return strike(B, mf, m, { hF: [0.2, 0.2], sp2Yaw: 0.35, hipYaw: 0.2 }, { hF: [1.15, 0.22], wrF: 0, sp2: B.sp2 + 0.3, sp2Yaw: -0.5, fF: [0.6, 0], hipX: 0.1 });
    case 'snack': {
      const p = over(B, { hipDrop: 0.08, sp2: -0.05, head: -0.2 });
      const k = mf / 70;
      if (k < 0.3) { p.hF = [0.45, 0.35]; p.hB = [0.4, 0.4]; p.head = 0.15; }
      else if (k < 0.65) { const c = Math.sin(t * 30) > 0; p.hF = [0.4, 0.55]; p.hB = c ? [0.55, 0.85] : [0.5, 0.45]; }
      else { p.hF = [0.35, 0.9]; p.hB = [0.3, 0.88]; p.head = -0.35; p.mouth = 1; p.sqY = 1 + Math.sin(t * 25) * 0.02; }
      p.eyesOpen = k > 0.65 ? 0.3 : 1;
      return p;
    }
    case 'airStab': return strike(over(B, airBase()), mf, m, { hF: [0.4, 0.1] }, { hF: [1.05, -0.2], sp2: 0.25 });
    case 'bodySlam': {
      const p = over(B, { rootRot: -0.9, hipDrop: 0.2, hF: [0.3, 0.9], hB: [0.2, 0.95], fF: [0.0, 0.4], fB: [-0.4, 0.5], sqX: 1.15, sqY: 0.9 });
      if (mf < m.t[0]) { p.rootRot = 0.3 * (mf / m.t[0]); p.sqY = 1.1; }
      return p;
    }
    case 'flopJump': {
      const p = over(B, {});
      if (mf < 14) { p.hipDrop = 0.1 + mf / 14 * 0.3; p.sqY = 1 - mf / 14 * 0.2; p.hF = [0.2, -0.2]; p.hB = [0.1, -0.3]; }
      else if (mf < 70) { p.rootRot = -1.4; p.hF = [0.2, 1.0]; p.hB = [0.1, 1.0]; p.fF = [0.3, 0.6]; p.fB = [-0.3, 0.6]; p.sqY = 1.25; p.sqX = 0.9; }
      else if (mf < 200) { p.rootRot = -1.5; p.hF = [0.9, 0.3]; p.hB = [0.8, 0.2]; p.fF = [-0.1, 0.5]; p.fB = [-0.5, 0.6]; p.sqX = 1.2; p.sqY = 0.85; p.eyesOpen = 1.3; }
      else { const k = Math.min(1, (mf - 200) / 20); p.rootRot = -1.5 * (1 - k); p.hipDrop = 0.45 * (1 - k) + 0.05; p.sqX = 1.3 - 0.3 * k; p.sqY = 0.7 + 0.3 * k; }
      return p;
    }
    // --- Bobby
    case 'flail': case 'flail2': {
      const p = over(B, { sp2: B.sp2 + 0.1 });
      const [s, a] = m.t;
      const k = mf < s ? mf / s : mf < s + a ? 1 : 1 - (mf - s - a) / m.t[2];
      p.hF = [0.4 + k * 0.5 + Math.sin(t * 40) * 0.1 * k, 0.4 + Math.cos(t * 35) * 0.3 * k];
      p.hB = [0.35 + k * 0.45 + Math.cos(t * 38) * 0.1 * k, 0.3 + Math.sin(t * 42) * 0.3 * k];
      p.wrF = Math.sin(t * 50) * k; p.wrB = Math.cos(t * 47) * k;
      p.headRoll = Math.sin(t * 30) * 0.2 * k;
      p.eyeL = [Math.sin(t * 20) * 0.6, 0.2]; p.eyeR = [-Math.sin(t * 17) * 0.6, -0.2];
      return p;
    }
    case 'coneBonk': return strike(B, mf, m, { head: -0.6, sp2: -0.3, hipDrop: 0.2 }, { head: 0.8, sp2: 0.6, sp1: 0.3, hipDrop: 0.05, hF: [0.2, -0.3], hB: [0.1, -0.4], fB: [-0.5, 0.2] });
    case 'wobbleRush': {
      const p = walkCycle(B.__st || STYLE.bobby, t * 1.8, 1, 18, 1.2);
      p.hF = [0.6 + Math.sin(t * 40) * 0.3, 0.5 + Math.cos(t * 33) * 0.4]; p.hB = [0.5 + Math.cos(t * 37) * 0.3, 0.4 + Math.sin(t * 29) * 0.4];
      p.hipRot = 0.35; p.sp2 = 0.4; p.headRoll = Math.sin(t * 25) * 0.25;
      p.eyeL = [0.8, 0.3]; p.eyeR = [-0.5, -0.3];
      return p;
    }
    case 'conePoke': return strike(over(B, { hipDrop: 0.4, sp2: 0.4, head: 0.4 }), mf, m, { head: 0.2, hipX: -0.05 }, { head: 0.9, hipX: 0.12, sp2: 0.6 });
    case 'headbutt': {
      const p = strike(B, mf, m, { head: -0.5, sp2: -0.3, sp1: -0.2, hipDrop: 0.25, hipX: -0.08 }, { head: 0.6, sp2: 0.7, sp1: 0.4, hipRot: 0.4, hipX: 0.15, hF: [-0.1, -0.2], hB: [-0.2, -0.3], fB: [-0.6, 0.15] });
      if (f.cs && f.cs.stuck > 0 && mf > m.t[0] + m.t[1]) { p.hipRot = 1.2; p.sp2 = 0.9; p.head = 0.8; p.hipDrop = 0.4; p.fB = [-0.6, 0.6]; p.hF = [-0.2, 0.4]; p.hB = [-0.3, 0.5]; p.eyesOpen = 0.2; }
      return p;
    }
    case 'coneSpin': {
      const p = over(B, { hipDrop: 0.3, sp2: 0.5, head: 0.7, hF: [0.1, 0.9], hB: [0.0, 0.85], fF: [0.3, 0.3], fB: [-0.3, 0.3] });
      if (mf >= m.t[0] && mf < m.t[0] + m.t[1]) p.hipYaw = t * 30;
      return p;
    }
    case 'oops': {
      const p = strike(B, mf, m, { hipDrop: 0.3, rootRot: 0.2 }, { rootRot: -0.6, head: 0.5, sp2: -0.3, hF: [0.3, 1.0], hB: [-0.2, 0.9], fF: [0.5, 0.5] });
      p.eyesOpen = 1.3;
      return p;
    }
    case 'junkToss': return strike(B, mf, m, { hB: [-0.2, 0.8], head: 0.3, sp2: -0.2, sp2Yaw: -0.5 }, { hB: [0.9, 0.6], wrB: -1.5, sp2: 0.3, sp2Yaw: 0.6, head: 0.0 });
    case 'coneHide': {
      const p = over(B, { hipDrop: 0.55, sp1: 0.6, sp2: 0.8, head: 1.0, hF: [0.2, -0.6], hB: [0.1, -0.7], fF: [0.15, 0], fB: [-0.15, 0], sqY: 0.75, sqX: 1.1, eyesOpen: 0.2 });
      p.hipX = Math.sin(t * 9) * 0.01;
      return p;
    }
    case 'coneDrill': {
      const p = over(B, airBase(), { rootRot: -1.9, head: 0.6, hF: [0.1, 1.0], hB: [0.0, 1.0], fF: [-0.2, 0.5], fB: [-0.4, 0.5] });
      p.hipYaw = t * 25;
      return p;
    }
    case 'trafficJam': {
      const p = over(B, { hipDrop: 0.3, sp2: 0.6, head: 0.9, hF: [0.5, 0.2], hB: [-0.3, 0.2], fF: [0.3, 0.2], fB: [-0.3, 0.2] });
      if (mf >= m.t[0]) { p.hipYaw = t * 28; p.rootRot = Math.sin(t * 9) * 0.3; }
      return p;
    }
    // --- Bobby demon
    case 'rend': case 'rend2': {
      const alt = key === 'rend2';
      return strike(B, mf, m, alt ? { hB: [0.0, 0.9] } : { hF: [0.1, 1.0] }, alt ? { hB: [1.05, -0.3], wrB: -2, sp2Yaw: 0.6, sp2: 0.8 } : { hF: [1.05, -0.35], wrF: -2, sp2Yaw: -0.6, sp2: 0.8 });
    }
    case 'abyssRise': return strike(B, mf, m, { hipDrop: 0.5, sp2: 0.9, hF: [0.3, -0.6], hB: [0.2, -0.7] }, { hipDrop: 0.0, sp2: -0.4, sp1: -0.3, head: -0.6, hF: [0.5, 1.0], hB: [0.3, 1.0], wrF: -2.4, rootRot: -0.4, fF: [0.2, 0.3] });
    case 'frenzy': {
      const p = over(B, { sp2: 0.7, hipDrop: 0.35 });
      p.hF = [0.7 + Math.sin(t * 60) * 0.35, Math.cos(t * 53) * 0.6]; p.hB = [0.6 + Math.cos(t * 57) * 0.35, Math.sin(t * 49) * 0.6];
      p.wrF = Math.sin(t * 70) * 2; p.wrB = Math.cos(t * 66) * 2; p.headRoll = Math.sin(t * 40) * 0.3;
      return p;
    }
    case 'crawlSlash': return strike(over(B, { hipDrop: 0.55, sp2: 1.0, head: -0.2 }), mf, m, { hF: [0.3, -0.5] }, { hF: [1.05, -0.8], wrF: -1.5 });
    case 'nightClub': return strike(B, mf, m, { hB: [-0.3, 0.9], sp2Yaw: -0.7, sp2: 0.2 }, { hB: [1.1, 0.1], wrB: -2.2, sp2Yaw: 0.7, sp2: 0.9, hipX: 0.1 });
    case 'shadowLunge': {
      const p = over(B, { hipDrop: 0.6, hipRot: 1.0, sp1: 0.6, sp2: 0.7, head: -0.4, hF: [1.0, -0.6], hB: [0.8, -0.7], fB: [-0.7, 0.1], fF: [0.4, 0] });
      p.hF = [1.0, -0.6 + Math.sin(t * 40) * 0.2]; p.hB = [0.8, -0.7 + Math.cos(t * 40) * 0.2];
      return p;
    }
    case 'vanish': return over(B, { sqY: 1.4, sqX: 0.6, hipDrop: 0.0 });
    case 'nightfall': return over(B, airBase(), { rootRot: -1.2, hF: [1.0, -0.4], hB: [0.9, -0.5], sp2: 0.6 });
    // --- Mimi
    case 'slap': return strike(B, mf, m, { hF: [0.35, 0.95], sp2Yaw: 0.25, headRoll: -0.15 }, { hF: [1.0, 0.55], wrF: -1.0, sp2Yaw: -0.4, sp2: B.sp2 + 0.12, headRoll: 0.2 });
    case 'twirlSlap': {
      const p = strike(B, mf, m, { hB: [0.3, 0.9], hipYaw: -0.6 }, { hB: [1.0, 0.6], wrB: -1.1, hipYaw: 0.5, sp2Yaw: 0.4 });
      if (mf < m.t[0] + m.t[1]) p.hipYaw += Math.min(1, mf / (m.t[0] + 2)) * TAU;
      return p;
    }
    case 'jellySmack': return strike(B, mf, m, { hB: [-0.4, 0.8], sp2Yaw: -0.7, hipYaw: -0.3 }, { hB: [1.05, 0.3], wrB: -1.6, sp2Yaw: 0.7, hipYaw: 0.4, sp2: 0.3, fF: [0.5, 0] });
    case 'kick': return strike(B, mf, m, { fF: [0.1, 0.35], hipRot: -0.2 }, { fF: [0.95, 0.55], hipRot: -0.35, sp2: -0.1, hF: [0.3, 0.9], hB: [0.1, 0.8] });
    case 'pattycake': {
      const [s, a] = m.t;
      const p = over(B, { sp2: B.sp2 + 0.1 });
      if (mf >= s && mf < s + a) {
        const k = ((mf - s) % m.every) / m.every, alt = Math.floor((mf - s) / m.every) % 2;
        const e = Math.sin(k * Math.PI);
        if (alt) p.hF = [0.45 + e * 0.5, 0.7 - e * 0.1]; else p.hB = [0.4 + e * 0.55, 0.65 - e * 0.1];
        p.headRoll = Math.sin(mf * 0.8) * 0.15; p.eyesOpen = 0.4;
      }
      return p;
    }
    case 'tippyKick': return strike(over(B, { hipDrop: 0.35, sp2: 0.15 }), mf, m, { fF: [0.2, 0.05] }, { fF: [0.95, 0.1], hipRot: -0.2 });
    case 'puruBonk': return strike(B, mf, m, { hB: [-0.2, 1.0], hF: [-0.1, 1.0], sp2: -0.35, head: -0.3 }, { hB: [0.95, 0.1], hF: [0.9, 0.15], wrB: -1.8, sp2: 0.5, head: 0.2, hipDrop: 0.2 });
    case 'heavySlap': return strike(B, mf, m, { hB: [-0.1, 0.9], sp2Yaw: -0.6 }, { hB: [1.0, 0.5], wrB: -1.4, sp2Yaw: 0.6 });
    case 'jellySpring': {
      const p = strike(B, mf, m, { hipDrop: 0.45, sqY: 0.8 }, { hipDrop: 0.0, sqY: 1.2, sqX: 0.9, hF: [0.3, 1.0], hB: [0.2, 1.0], fF: [0.1, 0.1], fB: [-0.1, 0.05] });
      if (mf >= m.t[0]) p.rootRot = Math.min(1, (mf - m.t[0]) / 18) * TAU * -1;
      return p;
    }
    case 'puruThrow': return strike(B, mf, m, { hB: [-0.3, 0.8], sp2Yaw: -0.6, hipYaw: -0.3, fF: [0.4, 0.1] }, { hB: [1.0, 0.6], wrB: -1.4, sp2Yaw: 0.5, hipYaw: 0.3, fF: [0.55, 0], sp2: 0.25 });
    case 'bubbleBlow': {
      const p = over(B, { hF: [0.7, 0.55], hB: [0.6, 0.5], sp2: 0.15, head: 0.1, eyesOpen: 0.4 });
      const k = Math.min(1, mf / m.t[0]);
      p.sqX = 1 + k * 0.05; p.sqY = 1 - k * 0.03; p.mouth = k;
      return p;
    }
    case 'airTwirl': { const p = strike(over(B, airBase()), mf, m, { hF: [0.4, 0.6] }, { hF: [0.95, 0.4], hB: [0.8, 0.5] }); if (mf < m.t[0] + m.t[1]) p.hipYaw = (mf / (m.t[0] + m.t[1])) * TAU; return p; }
    case 'stingDive': return over(B, airBase(), { rootRot: -0.5, hF: [0.6, -0.5], hB: [0.5, -0.6], fF: [0.0, 0.5], fB: [-0.4, 0.6] });
    case 'tornado': {
      const p = over(B, { hipDrop: 0.15, hF: [0.95, 0.5], hB: [0.9, 0.55], sp2: 0.05, head: -0.1, fF: [0.2, 0.05], fB: [-0.2, 0.0] });
      if (mf >= m.t[0]) p.hipYaw = t * 22;
      return p;
    }
    default:
      return strike(B, mf, m, { hF: [0.4, 0.6] }, { hF: [1.0, 0.6], wrF: -1.3 });
  }
}

function airBase() { return { hipDrop: 0.25, fF: [0.25, 0.3], fB: [-0.25, 0.2], sp2: 0.2 }; }

// ---------------- main entry
export function computePose(f, ctx) {
  const st = styleFor(f);
  const t = ctx.time;
  const sf = f.sf + (ctx.alpha || 0);
  const base = stance(st, t, 1);
  base.__st = st;
  const C = ctx.charStats;
  const m = ctx.move;
  let p;
  switch (f.st) {
    case 'idle': case 'dashEnd': p = base; break;
    case 'walk': {
      const dir = Math.sign(f.vx * f.face) || 1;
      const speed = 8 + Math.abs(f.vx) * 120;
      p = walkCycle(st, t, dir, speed, 1);
      if (dir < 0) { p.hipRot -= 0.1; p.head -= 0.08; }
      break;
    }
    case 'crouch': p = over(base, { hipDrop: 0.42, sp1: base.sp1 + 0.12, sp2: base.sp2 + 0.15, fF: [0.38, 0], fB: [-0.36, 0], hF: [0.55, 0.45], hB: [0.4, 0.38] }); break;
    case 'prejump': p = over(base, { hipDrop: 0.38, sqY: 0.84, sqX: 1.1, hF: [0.4, 0.3], hB: [0.3, 0.25] }); break;
    case 'land': p = over(base, { hipDrop: 0.32, sqY: 0.88, sqX: 1.08 }); break;
    case 'air': {
      const rising = f.vy > 0.02;
      p = over(base, rising ? { hipDrop: 0.3, fF: [0.25, 0.42], fB: [-0.15, 0.3], hF: [0.5, 0.85], hB: [0.4, 0.75], sqY: 1.08, sqX: 0.95, sp2: 0.05 } : { hipDrop: 0.12, fF: [0.2, 0.05], fB: [-0.2, 0.12], hF: [0.6, 0.6], hB: [0.45, 0.55], sp2: 0.15 });
      if (f.floating) { p.hF = [0.2, 1.05]; p.hB = [0.15, 1.0]; p.fF = [0.1, 0.1]; p.fB = [-0.1, 0.05]; }
      // air-jump flip
      if (f.airJumpT !== undefined && ctx.airFlip > 0) p.rootRot = -ctx.airFlip * TAU;
      break;
    }
    case 'dash': p = over(base, { hipRot: 0.45, sp2: 0.3, hipDrop: 0.22, fF: [0.6, 0.05], fB: [-0.6, 0.15], hF: [0.6, 0.4], hB: [0.2, 0.35], sqX: 1.1, sqY: 0.94 }); break;
    case 'backdash': p = over(base, { hipRot: -0.25, sp2: -0.1, hipDrop: 0.2, fF: [0.5, 0.15], fB: [-0.3, 0], head: -0.2 }); break;
    case 'dodge': {
      const k = Math.min(1, sf / 22);
      p = over(base, { hipDrop: 0.5, sp1: 0.5, sp2: 0.7, head: 0.6, hF: [0.3, 0.1], hB: [0.2, 0.05], fF: [0.2, 0.25], fB: [-0.2, 0.25], sqY: 0.8 });
      p.rootRot = -k * TAU * (f.dodgeDir === f.face ? 1 : -1);
      p.rootY = Math.sin(k * Math.PI) * 0.35;
      break;
    }
    case 'airdodge': p = over(base, airBase(), { rootRot: -Math.min(1, sf / 16) * TAU, hipDrop: 0.4, sqY: 0.85 }); break;
    case 'block': case 'crouchblock': case 'blockstun': {
      const low = f.st === 'crouchblock' || (f.st === 'blockstun' && ctx.lowBlock);
      p = over(base, {
        hipDrop: low ? 0.45 : 0.24, sp1: 0.25, sp2: 0.38, head: 0.25, hipRot: 0.15,
        hF: [0.42, 0.42], hB: [0.48, 0.32], wrF: 0.9, wrB: 0.9, armZF: -0.35, armZB: -0.35,
        tail: -1.15, tail2: -0.9, fan: -0.4, fanSpread: 1.25, eyesOpen: 0.75,
      });
      if (f.st === 'blockstun') { const k = Math.max(0, 1 - sf / Math.max(1, f.blockstun)); p.hipX = -0.07 * k; p.sp2 -= 0.12 * k; p.sqX = 1 - 0.05 * k; }
      break;
    }
    case 'hitstun': {
      const k = clamp(1 - sf / Math.max(4, f.hitstun), 0, 1);
      const v = (f.combo || 0) % 2;
      p = over(base, {
        hipRot: -0.4 * k, sp1: -0.25 * k, sp2: -0.35 * k, head: -0.55 * k, headRoll: (v ? 0.3 : -0.3) * k,
        hF: [0.2, 0.9 * k + 0.2], hB: [0.0, 0.6 * k + 0.3], hipX: -0.08 * k, eyesOpen: 0.3 + (1 - k) * 0.7,
        fF: [0.4, 0.05 * k], tail: 0.4 * k,
      });
      p.sqX = 1 - 0.08 * k; p.sqY = 1 + 0.05 * k;
      break;
    }
    case 'airhit': case 'ko': {
      const spin = (f.st === 'ko' ? 1.2 : 0.8) * (f.launched ? 1 : 0.4);
      p = over(base, { hipDrop: 0.15, hF: [0.1, 1.0], hB: [-0.2, 0.9], fF: [0.4, 0.4], fB: [-0.4, 0.6], head: -0.5, sp2: -0.3, eyesOpen: 0.2 });
      p.rootRot = f.ground ? -1.5 : clamp(sf * 0.12 * spin, 0, 1.6) * (f.vy < 0 ? 1 : 0.7);
      if (f.st === 'ko' && f.ground) { p.rootRot = -1.55; p.hipDrop = 0.15; p.hF = [0.6, -0.3]; p.hB = [0.4, -0.5]; p.eyesOpen = 0; }
      break;
    }
    case 'knockdown': p = over(base, { rootRot: -1.52, hipDrop: 0.12, hF: [0.5, -0.4], hB: [0.3, -0.6], fF: [0.35, 0.1], fB: [-0.3, 0.3], head: -0.3, eyesOpen: sf < 14 ? 0.15 : 0.7 }); p.rootY = sf < 8 ? Math.sin(sf / 8 * Math.PI) * 0.15 : 0; break;
    case 'getup': { const k = ease.outBack(Math.min(1, sf / 14)); p = blend(over(base, { rootRot: -1.5, hipDrop: 0.4 }), base, k); break; }
    case 'dizzy': {
      p = over(base, { hipDrop: 0.25, hF: [0.3, -0.2], hB: [0.2, -0.3], head: 0.3, eyesOpen: 0.6 });
      p.hipRoll = Math.sin(t * 5) * 0.18; p.sp2Yaw = Math.cos(t * 5) * 0.3; p.headRoll = Math.sin(t * 5 + 1) * 0.35;
      p.eyeL = [Math.sin(t * 12) * 0.8, Math.cos(t * 12) * 0.5]; p.eyeR = [Math.cos(t * 12) * 0.8, Math.sin(t * 12) * 0.5];
      break;
    }
    case 'molt': {
      const k = Math.min(1, sf / 180);
      p = over(base, { hipDrop: 0.35 + k * 0.1, sp1: 0.4, sp2: 0.6, head: 0.5, hF: [0.25, 0.8], hB: [0.15, 0.85], tail: -0.6, eyesOpen: 0.2 });
      const sh = (0.01 + k * 0.04);
      p.hipX = Math.sin(t * 60) * sh; p.sqX = 1 + Math.sin(t * 9) * 0.05 * k + k * 0.06; p.sqY = 1 - k * 0.04;
      break;
    }
    case 'moltEnd': { const k = Math.min(1, sf / 24); p = blend(over(base, { hipDrop: 0.0, sp2: -0.3, head: -0.4, hF: [0.6, 1.1], hB: [0.4, 1.1], sqY: 1.15, sqX: 0.95, eyesOpen: 1.3 }), base, ease.inQuad(k)); break; }
    case 'taunt': p = tauntPose(f, base, sf, t); break;
    case 'charging': {
      const k = Math.min(1, (f.charge || 0) / 50);
      const shake = k >= 1 ? 0.02 : 0.008 * k;
      if (f.char === 'brutus') p = over(base, { hipX: -0.15 * k, sp1: -0.3, sp2: -0.25, hipDrop: 0.25, sqX: 0.9 - 0.06 * k, sqY: 1.05 });
      else if (f.char === 'mimi') p = over(base, { hB: [-0.4, 0.8], sp2Yaw: -0.7, hipYaw: -0.4, hipDrop: 0.25 });
      else if (f.char === 'bobby') p = over(base, { hipDrop: 0.35, sp2: 0.5, head: 0.7, hF: [0.1, 0.9], hB: [0.0, 0.85] });
      else p = over(base, { hB: [-0.15 - 0.1 * k, 0.4], sp2Yaw: -0.7 - 0.2 * k, sp2: base.sp2 - 0.05, hipYaw: -0.3, hipDrop: 0.22 + 0.06 * k, fF: [0.45, 0], fB: [-0.42, 0], head: base.head - 0.1, wrB: 0.5 });
      p.hipX = (p.hipX || 0) + Math.sin(t * 70) * shake; p.eyesOpen = 0.6 + k * 0.6;
      break;
    }
    case 'attack': p = m ? moveAnim(m.anim, base, sf, m, f, t) : base; break;
    case 'throwing': {
      const k = sf;
      if (k < 14) p = over(base, { hF: [0.85, 0.45], hB: [0.8, 0.4], sp2: 0.25 });
      else if (k < 30) p = over(base, { hF: [0.5, 1.0], hB: [0.4, 1.0], sp2: -0.25, head: -0.3, hipDrop: 0.05, sqY: 1.06 });
      else p = over(base, { hF: [0.9, -0.2], hB: [0.8, -0.3], sp2: 0.6, hipDrop: 0.3, head: 0.3 });
      break;
    }
    case 'thrown': case 'snagged': p = over(base, { hipDrop: 0.2, hF: [0.1, 1.0], hB: [-0.1, 0.9], fF: [0.3, 0.3], fB: [-0.3, 0.4], head: -0.4, eyesOpen: 1.3, rootRot: Math.sin(t * 20) * 0.1 }); break;
    case 'stagger': { const k = Math.max(0, 1 - sf / Math.max(1, f.stagger || 14)); p = over(base, { hipRot: -0.3 * k, sp2: -0.3 * k, head: -0.4 * k, hF: [0.3, 0.9], hB: [0.1, 0.8], eyesOpen: 1.2 }); p.hipX = -0.05 * k; break; }
    case 'bubbled': p = over(base, { hipDrop: 0.3, hF: [0.5 + Math.sin(t * 14) * 0.3, 0.9], hB: [0.3 + Math.cos(t * 13) * 0.3, 0.8], fF: [0.3, 0.3 + Math.sin(t * 10) * 0.2], fB: [-0.3, 0.3 + Math.cos(t * 10) * 0.2], eyesOpen: 1.3 }); p.rootRot = Math.sin(t * 2) * 0.4; break;
    case 'sleep': p = over(base, { hipDrop: 0.55, sp1: 0.5, sp2: 0.6, head: 0.7, hF: [0.3, -0.5], hB: [0.2, -0.6], eyesOpen: 0, fF: [0.4, 0], fB: [-0.4, 0] }); p.sqY = 1 + Math.sin(t * 2.5) * 0.03; break;
    case 'drink': {
      const k = sf / 44;
      p = over(base, { hF: [0.45, 0.85], head: -0.45 * Math.sin(Math.min(1, k * 1.5) * Math.PI / 1), sp2: -0.2, eyesOpen: 0.2 });
      break;
    }
    case 'toss': p = strike(base, sf, { t: [6, 3, 9] }, { hF: [-0.2, 0.9], sp2Yaw: -0.5 }, { hF: [1.0, 0.6], sp2Yaw: 0.5, sp2: 0.3 }); break;
    case 'pickup': p = over(base, { hipDrop: 0.45, sp2: 0.6, hF: [0.6, -0.6] }); break;
    case 'stumble': p = over(base, { hipRot: 0.6, sp2: 0.5, head: 0.4, hF: [0.8, 0.9], hB: [0.6, 1.0], fB: [-0.6, 0.3], eyesOpen: 1.3 }); p.rootRot = -0.25; break;
    case 'stuck': p = over(base, { hipRot: 1.3, sp2: 0.9, head: 0.9, hipDrop: 0.4, fB: [-0.7, 0.7], fF: [-0.3, 0.5], hF: [-0.3, 0.5], hB: [-0.4, 0.6] }); p.fF = [Math.sin(t * 22) * 0.3, 0.5]; break;
    case 'noSnack': p = over(base, { head: 0.6, sp2: 0.4, hF: [0.5, 0.3], hB: [0.4, 0.2], eyesOpen: 0.5, hipDrop: 0.2 }); break;
    case 'recall': p = over(base, { hF: [0.9, 1.0], hB: [0.2, 0.5], headRoll: 0.2 }); break;
    case 'intro': p = introPose(f, base, sf, t); break;
    case 'roundWin': case 'victory': p = victoryPose(f, base, sf, t, ctx.victory); break;
    case 'defeat': p = over(base, { hipDrop: 0.5, sp1: 0.5, sp2: 0.7, head: 0.9, hF: [0.3, -0.7], hB: [0.2, -0.8], eyesOpen: 0.35, tail: -0.3 }); break;
    case 'qteAtk': p = over(base, { hipDrop: 0.3, hipRot: 0.4, sp2: 0.4, hF: [0.95, 0.55], hB: [0.9, 0.45], fF: [0.6, 0], fB: [-0.6, 0], eyesOpen: 1.25 }); p.hipX = Math.sin(t * 50) * 0.02; break;
    case 'qteDef': p = over(base, { hipDrop: 0.42, hipRot: -0.1, sp2: 0.2, hF: [0.6, 0.85], hB: [0.5, 0.75], wrF: 1, wrB: 1, eyesOpen: 1.3, head: -0.2 }); p.hipX = Math.sin(t * 47) * 0.02; break;
    case 'finisher': p = finisherPose(f, base, sf, t); break;
    case 'finished': {
      const k = Math.min(1, sf / 150);
      p = over(base, { hipDrop: 0.35, hF: [0.2, 0.8], hB: [0.1, 0.7], head: -0.3, eyesOpen: 1.3 - k, sp2: -0.2 });
      if (sf > 110) { p.rootRot = -0.3; p.sqY = 0.9; }
      break;
    }
    case 'ultAtk': {
      const k = f.cs ? f.cs.seqT : sf;
      p = over(base, { hipDrop: 0.25, sp2: 0.3 });
      const ph = k % 9 / 9;
      const alt = Math.floor(k / 9) % 2;
      const e = Math.sin(ph * Math.PI);
      if (k < 90) {
        if (alt) { p.hF = [0.5 + e * 0.6, 0.4 + Math.sin(k) * 0.4]; p.wrF = -1.6 * e; p.sp2Yaw = -0.5 * e; }
        else { p.hB = [0.45 + e * 0.65, 0.4 + Math.cos(k) * 0.4]; p.wrB = -1.6 * e; p.sp2Yaw = 0.5 * e; }
        p.hipX = e * 0.05;
      } else { p = over(base, { hB: [1.15, 0.9], wrB: -2.2, sp2: 0.4, sp2Yaw: 0.8, fF: [0.7, 0], fB: [-0.6, 0], hipDrop: 0.3, hipX: 0.15 }); }
      break;
    }
    case 'ultVictim': p = over(base, { hipRot: -0.3, sp2: -0.3, head: -0.5 + Math.sin(t * 40) * 0.2, headRoll: Math.cos(t * 37) * 0.3, hF: [0.1, 0.9], hB: [0.0, 0.8], eyesOpen: 0.2 }); p.hipX = Math.sin(t * 60) * 0.03; break;
    case 'demonize': p = demonizePose(f, base, sf, t); break;
    default: p = base;
  }
  return p;
}

function tauntPose(f, base, sf, t) {
  const c = f.char === 'bobby' && f.cs?.demon ? 'demon' : f.char;
  const k = sf / 70;
  switch (c) {
    case 'jim': {
      // dramatic anime pose... then slips
      if (k < 0.7) { const p = over(base, { hipDrop: 0.3, hipRot: -0.1, hF: [0.95, 1.05], hB: [-0.1, 0.25], wrF: -2.2, sp2Yaw: -0.5, head: -0.35, fF: [0.6, 0], fB: [-0.55, 0], eyesOpen: 0.6 }); p.hF[1] += Math.sin(t * 4) * 0.03; return p; }
      const s = Math.min(1, (k - 0.7) / 0.15);
      return over(base, { rootRot: 0.5 * s, hipDrop: 0.4 * s, hF: [0.3, 1.1], hB: [0.0, 1.0], fF: [0.6, 0.5 * s], eyesOpen: 1.3, head: -0.4 });
    }
    case 'brutus': { const p = over(base, { hF: [0.3, -0.1], hB: [0.2, -0.1], sp2: -0.25, head: -0.3, hipRot: -0.2, eyesOpen: 0.5 }); p.sqX = 1 + Math.sin(t * 10) * 0.05; p.mouth = Math.max(0, Math.sin(t * 6)); return p; }
    case 'bobby': { const p = over(base, { hF: [0.2, 1.0], hB: [0.1, 0.95], head: 0.3 }); p.hipYaw = Math.sin(t * 6) * 0.8; p.headRoll = Math.sin(t * 9) * 0.4; p.eyeL = [Math.sin(t * 8), 0]; p.eyeR = [-Math.sin(t * 8), 0]; return p; }
    case 'mimi': { const p = over(base, { hF: [0.4, 1.0], hB: [0.35, 0.95], headRoll: 0.3, wrF: -0.8, wrB: -0.8, eyesOpen: 0.15 }); p.fB = [-0.3, 0.25 + Math.sin(t * 8) * 0.05]; p.hipRoll = 0.1; return p; }
    case 'demon': { const p = over(base, { head: -0.9, headRoll: 0.9, hF: [0.5, 1.0], hB: [-0.2, -0.6], eyesOpen: 1.3 }); return p; }
    default: return base;
  }
}

function introPose(f, base, sf, t) {
  const k = Math.min(1, sf / 120);
  switch (f.char) {
    case 'jim': {
      if (sf < 70) return over(base, { hipDrop: 0.35, hF: [0.5, 1.1], hB: [0.4, 1.05], head: -0.5, eyesOpen: 0.4, sp2: -0.2 });
      return over(base, { hipDrop: 0.3, hF: [1.0, 0.95], hB: [0.0, 0.3], wrF: -2.2, head: -0.3, fF: [0.6, 0], fB: [-0.55, 0] });
    }
    case 'brutus': { const p = walkCycle(STYLE.brutus, t, 1, 4, 0.6); p.hF = [0.4, 0.6]; p.hB = [0.35, 0.65]; p.mouth = Math.max(0, Math.sin(t * 9)); return p; }
    case 'bobby': { const p = over(base, { hF: [0.3, 1.0], hB: [-0.2, 0.9] }); p.hipYaw = Math.sin(t * 3) * 0.5; p.headRoll = Math.sin(t * 5) * 0.3; return p; }
    case 'mimi': { const p = over(base, { hF: [0.5, 1.05], hB: [0.2, 0.5], wrF: -1.2, headRoll: 0.25, eyesOpen: sf > 60 && sf < 90 ? 0.1 : 1 }); p.fB = [-0.3, 0.3]; return p; }
    default: return base;
  }
}

export function victoryPose(f, base, sf, t, kind = 'default') {
  if (kind === 'default' || !kind) kind = f.char === 'bobby' && f.cs?.demon ? 'demonWin' : f.char + 'Win';
  switch (kind) {
    case 'jimWin': { const p = over(base, { hipDrop: 0.25, hF: [1.0, 1.1], hB: [0.0, 0.25], wrF: -2.4, head: -0.4, fF: [0.6, 0], fB: [-0.5, 0], eyesOpen: 0.55 }); if (sf > 150) { const s = Math.min(1, (sf - 150) / 12); p.rootRot = s * 1.2; p.hipDrop = 0.3 + s * 0.2; p.eyesOpen = 1.3; } return p; }
    case 'brutusWin': { const p = over(base, { hF: [0.35, 0.95], hB: [0.3, 0.9], head: -0.3, sp2: -0.2 }); p.sqX = 1 + Math.abs(Math.sin(t * 6)) * 0.06; p.mouth = Math.max(0, Math.sin(t * 8)); return p; }
    case 'bobbyWin': { const p = over(base, { hF: [0.1, 1.05], hB: [-0.1, 1.0] }); p.rootY = Math.abs(Math.sin(t * 7)) * 0.3; p.hipYaw = t * 4; p.eyeL = [Math.sin(t * 9) * 0.8, 0]; p.eyeR = [Math.cos(t * 9) * 0.8, 0]; return p; }
    case 'demonWin': { const p = over(base, { head: -0.7, headRoll: 0.6, hF: [0.6, 0.95], hB: [0.5, -0.5], eyesOpen: 1.3 }); p.headRoll = 0.6 + Math.sin(t * 2) * 0.2; return p; }
    case 'mimiWin': { const p = over(base, { hF: [0.5, 1.05], hB: [0.35, 0.95], wrF: -1, wrB: -1, eyesOpen: 0.12, headRoll: 0.3 }); p.fB = [-0.35, 0.35]; p.rootY = Math.abs(Math.sin(t * 5)) * 0.12; return p; }
    case 'flex': { const p = over(base, { hF: [0.2, 0.95], hB: [0.1, 0.9], wrF: -2.3, wrB: -2.3, armZF: 0.8, armZB: 0.8, sp2: -0.15, eyesOpen: 0.6 }); p.sqX = 1.04 + Math.sin(t * 5) * 0.03; return p; }
    case 'cumbia': { const b = Math.sin(t * 7.5); const p = over(base, { hipDrop: 0.18 + Math.abs(b) * 0.08, hF: [0.45, 0.4 + b * 0.25], hB: [0.4, 0.4 - b * 0.25] }); p.hipYaw = b * 0.4; p.hipX = b * 0.08; p.fF = [0.3 + b * 0.15, Math.max(0, b) * 0.15]; p.fB = [-0.3 + b * 0.15, Math.max(0, -b) * 0.15]; p.headRoll = b * 0.2; return p; }
    case 'snack': { const p = over(base, { hF: [0.35, 0.95], hB: [0.3, 0.9], head: -0.35, eyesOpen: 0.3 }); p.mouth = Math.max(0, Math.sin(t * 9)); return p; }
    case 'guitar': { const s = Math.sin(t * 18); const p = over(base, { hF: [0.55, 0.3], hB: [0.3, 0.1 + s * 0.1], head: 0.3 + Math.sin(t * 6) * 0.2, hipDrop: 0.25, fF: [0.5, 0] }); p.headRoll = Math.sin(t * 6) * 0.3; return p; }
    case 'spin': { const p = over(base, { rootRot: Math.PI, hipDrop: 0.2, fF: [0.6, 0.5], fB: [-0.6, 0.5], hF: [0.3, -0.9], hB: [0.2, -0.9] }); p.hipYaw = t * 18; p.rootY = 1.5; return p; }
    case 'fireworks': { const p = over(base, { hF: [0.3, 1.1], hB: [0.2, 1.1], head: -0.5, eyesOpen: 1.2 }); p.rootY = Math.abs(Math.sin(t * 4)) * 0.2; return p; }
    default: return base;
  }
}

function finisherPose(f, base, sf, t) {
  const c = f.char === 'bobby' && f.cs?.demon ? 'demon' : f.char;
  const k = sf / 150;
  if (c === 'jim') {
    if (sf < 100) { const ph = (sf % 6) / 6, alt = Math.floor(sf / 6) % 2; const e = Math.sin(ph * Math.PI); const p = over(base, { hipDrop: 0.28, sp2: 0.3 }); if (alt) { p.hF = [0.5 + e * 0.6, 0.5 + Math.sin(sf) * 0.3]; p.wrF = -1.5 * e; } else { p.hB = [0.45 + e * 0.65, 0.5 + Math.cos(sf) * 0.3]; p.wrB = -1.5 * e; } return p; }
    if (sf < 120) return over(base, { hB: [-0.3, 0.5], sp2Yaw: -0.9, hipDrop: 0.35, eyesOpen: 0.5 });
    return over(base, { hB: [1.2, 0.6], wrB: -2.2, sp2Yaw: 0.9, sp2: 0.4, fF: [0.7, 0], fB: [-0.6, 0], hipDrop: 0.3, hipX: 0.15, eyesOpen: 0.4 });
  }
  if (c === 'brutus') {
    if (sf < 60) return over(base, { hF: [0.9, 0.4], hB: [0.85, 0.35], sp2: 0.3 });
    if (sf < 115) { const p = over(base, { rootY: Math.min(2.5, (sf - 60) * 0.06), rootRot: -0.3, hF: [0.3, 1.0], hB: [0.2, 1.0], sqY: 1.15 }); return p; }
    return over(base, { rootRot: -1.5, hipDrop: 0.2, sqX: 1.25, sqY: 0.8, hF: [0.9, 0.3], hB: [0.8, 0.2] });
  }
  if (c === 'demon') {
    const p = over(base, { hipDrop: 0.5, sp2: 0.9, head: -0.5, hF: [1.1, -0.2], hB: [1.0, -0.4], eyesOpen: 1.3 });
    if (sf > 110) { p.hF = [1.15, -0.8]; p.wrF = -2.5; p.hipX = 0.2; }
    return p;
  }
  if (c === 'mimi') {
    const p = over(base, { hF: [0.8, 1.0], hB: [0.6, 0.9], head: -0.2 });
    if (sf > 100) { p.hF = [0.95, 0.4]; p.hB = [0.9, 0.35]; p.sp2 = 0.3; }
    p.hipYaw = sf < 100 ? Math.sin(sf * 0.3) * 0.3 : 0;
    return p;
  }
  // bobby
  const p = over(base, { hipDrop: 0.3, head: 0.6, sp2: 0.5 });
  if (sf < 110) { p.hipX = -0.2 + Math.sin(sf * 0.5) * 0.03; p.headRoll = Math.sin(sf * 0.6) * 0.2; }
  else { p.hipX = 0.25; p.head = 1.0; p.sp2 = 0.8; p.hipRot = 0.6; }
  return p;
}

function demonizePose(f, base, sf, t) {
  if (sf < 40) { const p = over(base, { hipDrop: 0.1, head: -0.3, hF: [0.2, 1.0], hB: [0.1, 0.95], eyesOpen: 1.3 }); p.hipX = Math.sin(t * 40) * 0.01; return p; }
  if (sf < 80) { const p = over(base, { hipDrop: 0.55, sp1: 0.6, sp2: 0.8, head: 1.0, hF: [0.2, -0.6], hB: [0.1, -0.7], eyesOpen: 0 }); p.hipX = Math.sin(t * 70) * 0.03; p.sqY = 0.85; return p; }
  const p = over(STYLE.demon.stance, {});
  const k = Math.min(1, (sf - 80) / 40);
  p.head = -0.55 - (1 - k) * 0.6; p.headRoll = (1 - k) * 1.2;
  p.eyesOpen = 1.3;
  return Object.assign({}, DEFAULT_POSE, p);
}

export function lerpPose(a, b, t) { return blend(a, b, t); }
