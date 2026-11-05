// Procedural 2D animation: simulation state -> skeleton pose. Every strike goes
// anticipation (wind) -> smear frame -> snap with overshoot -> follow-through -> recovery,
// with squash & stretch, expressions and per-character personality. Poses are authored in
// "Jim units" (world units for a Jim-sized fighter) and scaled per character.
import { BASE_POSE, mixPose, over } from './skeleton.js';
import { ease, clamp } from '../../core/math.js';

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos, abs = Math.abs;

export const STANCE = {
  jim: { s: 1, hip: 0.6, lean: 0.16, chest: 0.04, hF: [0.42, 1.0], hB: [0.22, 0.98], fF: 0.22, fB: -0.27, bob: 0.018, bs: 8, face: 'neutral', walk: 9 },
  brutus: { s: 1.12, hip: 0.57, lean: 0.03, chest: -0.05, hF: [0.62, 0.82], hB: [0.46, 0.8], fF: 0.28, fB: -0.32, bob: 0.014, bs: 3.4, face: 'grin', walk: 5.5 },
  bobby: { s: 0.66, hip: 0.6, lean: 0.12, chest: 0.06, hF: [0.42, 0.9], hB: [0.24, 0.88], fF: 0.2, fB: -0.2, bob: 0.024, bs: 6, face: 'grin', walk: 10, wobble: 1 },
  mimi: { s: 0.93, hip: 0.61, lean: 0.04, chest: 0.02, hF: [0.32, 0.92], hB: [0.18, 0.9], fF: 0.16, fB: -0.17, bob: 0.02, bs: 7, face: 'neutral', walk: 9.5 },
  demon: { s: 1.0, hip: 0.5, lean: 0.62, chest: 0.2, hF: [0.66, 0.56], hB: [0.46, 0.46], fF: 0.34, fB: -0.36, bob: 0.01, bs: 2.2, face: 'fangs', walk: 7, twitch: 1 },
};

export function stanceOf(f) {
  if (f.char === 'bobby' && f.cs && f.cs.demon) return STANCE.demon;
  return STANCE[f.char] || STANCE.jim;
}

function base(st, t, amt = 1) {
  const b = sin(t * st.bs), b2 = sin(t * st.bs * 0.5 + 1.3);
  const p = over(BASE_POSE, {
    hip: [0, st.hip - (b * 0.5 + 0.5) * st.bob * amt], lean: st.lean + b * 0.015 * amt, chest: st.chest,
    hF: [st.hF[0] + b2 * 0.015 * amt, st.hF[1] - b * 0.02 * amt], hB: [st.hB[0] - b2 * 0.015 * amt, st.hB[1] - b * 0.02 * amt],
    fF: [st.fF, 0], fB: [st.fB, 0], face: st.face, head: -b * 0.02 * amt, tail: sin(t * 2.1) * 0.08,
  });
  if (st.wobble) { p.cone = sin(t * 2.7) * 0.12; p.head += sin(t * 3.1 + 1) * 0.06; p.hip = [sin(t * 1.9) * 0.015, p.hip[1]]; }
  if (st.twitch) {
    const tw = Math.floor(t * 7), h = sin(tw * 12.9898) * 43758.5453, r = h - Math.floor(h);
    if (r > 0.8) { p.head += (r - 0.9) * 1.6; }
  }
  return p;
}

function walkCycle(st, t, dir, amt = 1) {
  const p = base(st, t, 0.4);
  const ph = t * st.walk;
  const s = sin(ph), c = cos(ph);
  const stride = 0.22 * amt;
  p.fF = [st.fF * 0.5 + s * stride * dir, Math.max(0, c) * 0.13 * amt];
  p.fB = [st.fB * 0.5 - s * stride * dir, Math.max(0, -c) * 0.13 * amt];
  p.hip = [p.hip[0] + 0.02 * dir, p.hip[1] - abs(s) * 0.03 * amt];
  p.lean += 0.06 * dir * amt;
  p.hF = [p.hF[0] - s * 0.05 * amt, p.hF[1] + abs(c) * 0.02];
  p.hB = [p.hB[0] + s * 0.05 * amt, p.hB[1]];
  return p;
}

const airBase = (p, t) => over(p, { fF: [0.26, 0.28], fB: [-0.12, 0.18], knF: 1, knB: 1, hip: [0, 0.6] });

// strike: wind (anticipation) -> smear -> hit (overshoot) -> hold -> recover
function strike(B, mf, m, wind, hit, o = {}) {
  const [S0, A, R] = m.t;
  const W = over(B, wind), H = over(B, hit);
  const limb = o.limb || 'hF';
  let p;
  const wEnd = Math.max(1, S0 - 1);
  if (mf < wEnd) {
    const k = mf / wEnd;
    p = mixPose(B, W, ease.outQuad(Math.min(1, k * 1.1)));
    p.sq = [1 + 0.03 * k, 1 - 0.04 * k];
  } else if (mf < S0 + A) {
    const k = mf - wEnd;
    if (k < 1) {
      p = mixPose(W, H, 0.55);
      p.smear = { limb, from: W[limb], to: H[limb], arc: o.arc || 0, k: 0 };
      p.sq = [1.06, 0.95];
    } else {
      // overshoot for 2 frames, then settle into the hit pose
      const os = k < 3 ? (3 - k) * 0.04 : 0;
      p = mixPose(H, over(H, { [limb]: [H[limb][0] + os * 2.4, H[limb][1]], lean: H.lean + os }), 1);
      if (k < 2) p.smear = { limb, from: W[limb], to: H[limb], arc: o.arc || 0, k: 1 };
      if (o.hold) p = mixPose(p, over(H, o.hold), (mf - S0) / Math.max(1, A));
      p.sq = [1.03, 0.98];
    }
  } else {
    const k = (mf - S0 - A) / Math.max(1, R);
    const Hf = o.hold ? over(H, o.hold) : H;
    p = mixPose(Hf, B, ease.inOutCubic(Math.min(1, k)));
  }
  if (o.face) p.face = mf < S0 + A + 4 ? o.face : B.face;
  else if (mf >= wEnd && mf < S0 + A + 2) p.face = 'shout';
  return p;
}

// multi-hit flurry: alternate hands
function flurry(B, mf, m, a, b, o = {}) {
  const [S0, A] = m.t;
  if (mf < S0 || mf >= S0 + A) return strike(B, mf, m, a.w || {}, a.h || {}, o);
  const every = Math.max(2, m.every || 4);
  const i = Math.floor((mf - S0) / every), ph = ((mf - S0) % every) / every;
  const src = i % 2 === 0 ? a : b;
  const H = over(B, src.h), W = over(B, src.w || {});
  const p = mixPose(W, H, ph < 0.5 ? ph * 2 : 1);
  const limb = src.limb || 'hF';
  if (ph < 0.5) p.smear = { limb, from: W[limb], to: H[limb], arc: o.arc || 0, k: 0 };
  p.face = 'shout';
  p.sq = [1 + 0.03 * sin(mf), 1];
  return p;
}

// ------------------------------------------------------------------ move animations
function moveAnim(key, B, mf, m, f, t) {
  const S0 = m.t[0], A = m.t[1];
  switch (key) {
    // ---------- Jim (smasher / martial artist)
    case 'jab': return strike(B, mf, m, { hF: [0.3, 1.0], lean: B.lean - 0.04 }, { hF: [1.0, 1.08], lean: B.lean + 0.12, chest: 0.1, hB: [0.15, 0.96], fF: [0.3, 0] });
    case 'jab2': return strike(B, mf, m, { hB: [0.1, 0.98], lean: B.lean - 0.06 }, { hB: [1.02, 1.06], hF: [0.25, 0.98], lean: B.lean + 0.18, chest: 0.12, fF: [0.34, 0] }, { limb: 'hB' });
    case 'jab3': return strike(B, mf, m, { hF: [0.2, 0.85], hip: [-0.04, 0.54], lean: B.lean - 0.1 }, { hF: [1.05, 1.18], lean: B.lean + 0.25, chest: 0.15, fF: [0.42, 0], fB: [-0.34, 0], hip: [0.06, 0.6] }, { arc: 0.2 });
    case 'clight': return strike(over(B, { hip: [0, 0.4], lean: 0.35, fF: [0.34, 0], fB: [-0.36, 0], hF: [0.4, 0.62], hB: [0.24, 0.6] }), mf, m, { hF: [0.3, 0.45] }, { hF: [1.02, 0.36], lean: 0.45 });
    case 'uppercut': case 'dp': return strike(B, mf, m, { hip: [-0.02, 0.42], lean: 0.35, hF: [0.15, 0.55], hB: [0.3, 0.9], face: 'focus' }, { hip: [0.06, 0.72], lean: -0.22, chest: -0.2, hF: [0.42, 1.72], hB: [0.12, 0.88], fF: [0.2, 0.3], fB: [-0.24, 0], head: -0.3, sq: [0.94, 1.12] }, { arc: -0.4 });
    case 'heavy': return strike(B, mf, m, { hB: [-0.18, 0.96], hF: [0.3, 1.0], lean: B.lean - 0.15, hip: [-0.05, 0.56], face: 'focus' }, { hB: [1.1, 1.06], hF: [0.18, 0.95], lean: B.lean + 0.3, chest: 0.15, fF: [0.46, 0], fB: [-0.4, 0], hip: [0.08, 0.58] }, { limb: 'hB', arc: 0.15 });
    case 'charged': return strike(B, mf, m, { hB: [-0.3, 0.95], lean: B.lean - 0.25 }, { hB: [1.22, 1.06], hF: [0.1, 0.92], lean: B.lean + 0.42, chest: 0.2, fF: [0.6, 0], fB: [-0.5, 0], hip: [0.16, 0.54], sq: [1.1, 0.92] }, { limb: 'hB', arc: 0.1 });
    case 'barrage': return flurry(B, mf, m, { h: { hF: [1.02, 1.1], lean: B.lean + 0.18, fF: [0.32, 0] } }, { h: { hB: [1.02, 1.0], lean: B.lean + 0.22, fF: [0.32, 0] }, limb: 'hB' });
    case 'cannon': return strike(B, mf, m, { hF: [-0.1, 0.8], hB: [-0.15, 0.78], hip: [-0.06, 0.5], lean: -0.1, face: 'focus' }, { hF: [1.0, 0.94], hB: [0.94, 0.88], hip: [0.05, 0.52], lean: 0.34, fF: [0.5, 0], fB: [-0.46, 0] }, { hold: { hF: [0.98, 0.95], hB: [0.92, 0.89] } });
    case 'counter': {
      const p = over(B, { hF: [0.5, 1.22], hB: [0.15, 0.7], lean: -0.05, hip: [0, 0.56], face: 'focus', fistF: 'open', fistB: 'open' });
      p.hF = [p.hF[0] + sin(t * 9) * 0.02, p.hF[1]];
      return p;
    }
    case 'airL': return strike(airBase(B), mf, m, { hF: [0.3, 0.95] }, { hF: [0.96, 0.78], lean: 0.3, fF: [0.6, 0.38] }, { limb: 'hF' });
    case 'airH': return strike(airBase(B), mf, m, { hB: [-0.1, 1.5], hF: [0.2, 1.2], rot: -0.3, lean: -0.1 }, { hB: [0.95, 0.4], hF: [0.2, 0.9], rot: 0.5, lean: 0.4 }, { limb: 'hB', arc: -0.5 });
    case 'grab': return strike(B, mf, m, { hF: [0.3, 1.0], hB: [0.25, 0.95] }, { hF: [0.95, 1.0], hB: [0.9, 0.96], lean: B.lean + 0.25, fistF: 'open', fistB: 'open', fF: [0.4, 0] });
    case 'ultDash': {
      if (mf < S0) { const k = mf / S0; return over(B, { hip: [-0.1 * k, 0.6 - 0.15 * k], lean: 0.6 * k, hF: [0.1, 0.7], hB: [-0.3, 0.8], face: 'shout', fF: [0.5, 0], fB: [-0.6, 0], sq: [1 + 0.08 * k, 1 - 0.08 * k] }); }
      const p = over(B, { hip: [0.05, 0.48], lean: 0.75, hF: [1.1, 0.95], hB: [-0.3, 0.9], fF: [0.6, 0.05], fB: [-0.75, 0.2], face: 'shout', sq: [1.15, 0.92] });
      p.smear = { limb: 'hF', from: [0.1, 0.9], to: p.hF, arc: 0, k: 1, long: 1.5 };
      return p;
    }
    // ---------- Brutus (spearer luchador)
    case 'stab': return strike(B, mf, m, { hF: [0.3, 0.86] }, { hF: [1.25, 0.95], lean: B.lean + 0.12, fF: [0.38, 0] });
    case 'stab2': return strike(B, mf, m, { hB: [0.2, 0.82] }, { hB: [1.25, 0.9], hF: [0.4, 0.8], lean: B.lean + 0.15, fF: [0.4, 0] }, { limb: 'hB' });
    case 'lowStab': return strike(over(B, { hip: [0, 0.4], lean: 0.3, fF: [0.36, 0], fB: [-0.4, 0] }), mf, m, { hF: [0.3, 0.5] }, { hF: [1.25, 0.26], lean: 0.4 });
    case 'spearFlurry': return flurry(B, mf, m, { h: { hF: [1.25, 1.0], lean: B.lean + 0.1 } }, { h: { hB: [1.25, 0.86], lean: B.lean + 0.14 }, limb: 'hB' });
    case 'skewerToss': return strike(B, mf, m, { hF: [0.8, 0.5], hB: [0.7, 0.45], lean: 0.2 }, { hF: [0.2, 1.75], hB: [0.0, 1.7], lean: -0.32, head: -0.3, fistF: 'spear', sq: [0.96, 1.06] }, { arc: -0.6 });
    case 'bellyBump': case 'bellyBash': {
      const big = key === 'bellyBash';
      return strike(B, mf, m, { hip: [-0.12, 0.54], lean: -0.22, chest: -0.15, hF: [0.1, 1.0], hB: [-0.1, 0.95], belly: 0.12, sq: [0.92, 1.05] }, { hip: [big ? 0.3 : 0.18, 0.56], lean: -0.3, chest: -0.2, belly: big ? 0.45 : 0.3, hF: [0.25, 1.15], hB: [-0.2, 1.1], fF: [0.46, 0], fB: [-0.3, 0], face: 'grin', sq: [1.14, 0.92] }, { face: 'grin' });
    }
    case 'bellyLaunch': return strike(B, mf, m, { hip: [0, 0.44], lean: 0.25, belly: 0.1, sq: [1.1, 0.85] }, { hip: [0.05, 0.66], lean: -0.4, chest: -0.3, head: -0.4, belly: 0.3, hF: [0.3, 1.6], hB: [0.1, 1.55], sq: [0.92, 1.15] }, { face: 'shout' });
    case 'snag': return strike(B, mf, m, { hF: [0.1, 0.9], lean: -0.05 }, { hF: [1.45, 0.92], lean: B.lean + 0.3, fF: [0.5, 0], hip: [0.1, 0.55] });
    case 'snack': {
      const chew = Math.max(0, sin(mf * 0.5));
      const p = over(B, { hF: [0.42, 1.38], hB: [0.32, 1.1], head: -0.25, face: mf > 20 ? 'eat' : 'grin', lean: -0.08, belly: 0.06 * chew });
      p.sq = [1 + chew * 0.02, 1];
      return p;
    }
    case 'airStab': return strike(airBase(B), mf, m, { hF: [0.3, 0.9] }, { hF: [1.2, 0.5], lean: 0.32 });
    case 'bodySlam': {
      const p = over(airBase(B), { rot: 0.4 + Math.min(1, mf / 10) * 0.5, hF: [0.8, 0.6], hB: [0.6, 0.5], belly: 0.3, face: 'shout' });
      return p;
    }
    case 'flopJump': {
      if (mf < 14) { const k = mf / 14; return over(B, { hip: [0, 0.57 - k * 0.2], sq: [1 + 0.12 * k, 1 - 0.14 * k], hF: [0.2, 0.5], hB: [0, 0.48], face: 'grin' }); }
      if (mf < 70) return over(airBase(B), { rot: -0.3, hF: [0.3, 1.6], hB: [-0.2, 1.55], face: 'grin', sq: [0.92, 1.12] });
      return over(airBase(B), { rot: 1.35, hF: [0.9, 0.3], hB: [0.7, 0.3], fF: [0.3, -0.2], fB: [-0.5, -0.1], belly: 0.4, face: 'shout', sq: [1.2, 0.85] });
    }
    // ---------- Bobby (chaotic little guy)
    case 'flail': case 'flail2': {
      const s = sin(mf * 1.3), c = cos(mf * 1.1);
      const p = over(B, { hF: [0.75 + s * 0.25, 0.9 + c * 0.2], hB: [0.7 - s * 0.25, 0.85 - c * 0.2], lean: B.lean + 0.15, face: 'shout', head: s * 0.15 });
      if (mf >= S0 && mf < S0 + A) p.smear = { limb: mf % 6 < 3 ? 'hF' : 'hB', from: [0.4, 0.9], to: mf % 6 < 3 ? p.hF : p.hB, arc: 0.3, k: 0 };
      return p;
    }
    case 'coneBonk': return strike(B, mf, m, { head: -0.6, lean: -0.3, hip: [-0.04, 0.55] }, { head: 0.8, lean: 0.62, chest: 0.3, hip: [0.08, 0.5], hF: [0.3, 0.4], hB: [0.1, 0.3], fB: [-0.4, 0.15], face: 'shout' }, { limb: 'hF' });
    case 'wobbleRush': { const p = flurry(B, mf, m, { h: { hF: [0.9, 0.95], lean: 0.3 } }, { h: { hB: [0.9, 0.85], lean: 0.35 }, limb: 'hB' }); p.rot = sin(mf * 0.6) * 0.12; return p; }
    case 'conePoke': return strike(over(B, { hip: [0, 0.38], lean: 0.6, head: 0.4 }), mf, m, { head: 0.2, hip: [-0.06, 0.4] }, { head: 1.0, hip: [0.14, 0.36], lean: 0.85 });
    case 'headbutt': return strike(B, mf, m, { lean: -0.3, head: -0.4, hip: [-0.08, 0.58] }, { lean: 0.7, head: 0.5, hip: [0.18, 0.52], fB: [-0.45, 0.1], hF: [0.4, 0.4], hB: [0.2, 0.3] });
    case 'coneSpin': { const p = over(B, { lean: 0.9, head: 0.6, hip: [0, 0.5], hF: [0.3, 0.2], hB: [-0.3, 0.2], face: 'shout' }); p.rot = mf * 0.5; return p; }
    case 'oops': return strike(B, mf, m, { hip: [0, 0.42], lean: 0.3 }, { hip: [0, 0.62], lean: -0.3, hF: [0.5, 1.5], hB: [0.2, 1.4], head: -0.4, face: 'scared', sq: [0.94, 1.1] }, { face: 'scared', arc: -0.5 });
    case 'junkToss': return strike(B, mf, m, { hB: [-0.3, 1.2], lean: -0.2 }, { hB: [0.9, 1.0], lean: 0.3, fF: [0.35, 0] }, { limb: 'hB', arc: -0.3 });
    case 'coneHide': return over(B, { hip: [0, 0.28], lean: 0.9, head: 0.9, hF: [0.2, 0.3], hB: [0, 0.3], fF: [0.25, 0], fB: [-0.25, 0], face: 'scared', sq: [1.1, 0.8] });
    case 'coneDrill': { const p = over(airBase(B), { rot: 1.6, hF: [0.1, 0.3], hB: [-0.1, 0.3], head: 0.4, face: 'shout' }); p.rot += sin(mf * 1.5) * 0.08; return p; }
    case 'trafficJam': {
      const s = sin(mf * 0.9);
      const p = over(B, { hF: [0.9, 1.1 + s * 0.2], hB: [0.85, 0.7 - s * 0.2], lean: 0.25, face: 'grin', head: s * 0.2 });
      p.fF = [0.2 + s * 0.15, Math.max(0, s) * 0.15]; p.fB = [-0.2 - s * 0.15, Math.max(0, -s) * 0.15];
      p.rot = sin(mf * 0.35) * 0.1;
      return p;
    }
    // ---------- Demon Bobby
    case 'rend': case 'rend2': {
      const a = key === 'rend' ? 'hF' : 'hB';
      return strike(B, mf, m, { [a]: [0.1, 1.2], lean: B.lean - 0.15 }, { [a]: [1.05, 0.3], lean: B.lean + 0.15 }, { limb: a, arc: 0.5, face: 'fangs' });
    }
    case 'abyssRise': return strike(B, mf, m, { hip: [0, 0.36], lean: 0.9, hF: [0.4, 0.3], hB: [0.2, 0.2] }, { hip: [0.05, 0.7], lean: -0.3, hF: [0.5, 1.8], hB: [0.3, 1.7], head: -0.6, rot: -0.3 }, { arc: -0.5, face: 'fangs' });
    case 'frenzy': return flurry(B, mf, m, { h: { hF: [1.05, 0.7] }, w: { hF: [0.3, 1.1] } }, { h: { hB: [1.05, 0.5] }, w: { hB: [0.3, 1.0] }, limb: 'hB' }, { arc: 0.4 });
    case 'crawlSlash': return strike(over(B, { hip: [0, 0.3], lean: 1.1 }), mf, m, { hF: [0.3, 0.3] }, { hF: [1.2, 0.08] }, { face: 'fangs' });
    case 'nightClub': return strike(B, mf, m, { hB: [-0.4, 1.3], lean: 0.1 }, { hB: [1.2, 0.3], lean: 0.85 }, { limb: 'hB', arc: 0.6, face: 'fangs' });
    case 'shadowLunge': return over(B, { hip: [0.1, 0.3], lean: 1.25, hF: [1.3, 0.25], hB: [-0.4, 0.5], fF: [0.6, 0.05], fB: [-0.9, 0.2], face: 'fangs', sq: [1.2, 0.85] });
    case 'vanish': return over(B, { sq: [0.5, 1.4], hip: [0, 0.6] });
    case 'nightfall': return over(airBase(B), { rot: 1.1, hF: [1.0, 0.2], hB: [0.9, 0.0], face: 'fangs' });
    // ---------- Mimi
    case 'slap': return strike(B, mf, m, { hF: [0.2, 1.3], head: -0.1 }, { hF: [0.95, 0.9], lean: B.lean + 0.12, head: 0.12 }, { arc: 0.5, face: 'angry' });
    case 'twirlSlap': { const p = strike(B, mf, m, { hB: [-0.2, 1.2] }, { hB: [1.0, 0.95], lean: 0.2 }, { limb: 'hB', arc: 0.6, face: 'angry' }); if (mf < S0) p.rot = 0; return p; }
    case 'jellySmack': return strike(B, mf, m, { hB: [-0.4, 1.4], lean: -0.2 }, { hB: [1.15, 0.7], lean: 0.32, fF: [0.4, 0] }, { limb: 'hB', arc: 0.5, face: 'angry' });
    case 'kick': return strike(B, mf, m, { fF: [0.1, 0.4], lean: -0.1 }, { fF: [0.95, 0.72], lean: -0.32, hF: [0.25, 1.1], hB: [-0.1, 1.0], hip: [-0.04, 0.62] }, { limb: 'fF', face: 'angry' });
    case 'pattycake': return flurry(B, mf, m, { h: { hF: [0.9, 1.05], fistF: 'open' } }, { h: { hB: [0.9, 0.95], fistB: 'open' }, limb: 'hB' });
    case 'tippyKick': return strike(over(B, { hip: [0, 0.42], lean: 0.2 }), mf, m, { fF: [0.15, 0.08] }, { fF: [0.95, 0.12], lean: -0.1 }, { limb: 'fF' });
    case 'puruBonk': return strike(B, mf, m, { hB: [-0.2, 1.5], hF: [-0.1, 1.45], lean: -0.3 }, { hB: [0.9, 0.55], hF: [0.85, 0.6], lean: 0.4 }, { limb: 'hB', arc: -0.6, face: 'angry' });
    case 'heavySlap': return strike(B, mf, m, { hB: [-0.2, 1.3], lean: -0.2 }, { hB: [1.0, 0.9], lean: 0.3, fF: [0.35, 0] }, { limb: 'hB', arc: 0.5, face: 'angry' });
    case 'jellySpring': return strike(B, mf, m, { hip: [0, 0.4], sq: [1.15, 0.8] }, { hip: [0, 0.64], hF: [0.4, 1.7], hB: [0.2, 1.6], sq: [0.9, 1.15], fF: [0.1, 0.3] }, { arc: -0.4 });
    case 'puruThrow': return strike(B, mf, m, { hB: [-0.35, 1.25], lean: -0.15 }, { hB: [1.0, 1.05], lean: 0.25, fF: [0.35, 0], fistB: 'open' }, { limb: 'hB', arc: -0.3 });
    case 'bubbleBlow': { const p = over(B, { hF: [0.45, 1.25], hB: [0.35, 1.2], head: -0.1, face: 'cute', fistF: 'open', fistB: 'open' }); p.sq = [1 + sin(mf * 0.4) * 0.03, 1]; return p; }
    case 'airTwirl': { const p = strike(airBase(B), mf, m, { hF: [0.4, 1.1] }, { hF: [0.95, 0.85], hB: [0.8, 0.9] }, { face: 'angry' }); return p; }
    case 'stingDive': return over(airBase(B), { rot: 0.8, hF: [0.8, 0.3], hB: [0.7, 0.2], fF: [0.2, 0.5], fB: [-0.3, 0.6], face: 'angry' });
    case 'tornado': { const p = over(B, { hF: [0.9, 1.25], hB: [-0.6, 1.2], face: 'happy', fistF: 'open', fistB: 'open' }); p.spin = mf; p.fF = [0.1, 0.15 + abs(sin(mf * 0.3)) * 0.1]; return p; }
    default: return strike(B, mf, m, { hF: [0.3, 1.0] }, { hF: [1.0, 1.05], lean: B.lean + 0.15 });
  }
}

// ------------------------------------------------------------------ state poses
export function computePose(f, o = {}) {
  const st = stanceOf(f);
  const t = o.t || 0;
  const B = base(st, t);
  const sf = (f.sf || 0) + (o.alpha || 0);
  let p;
  const m = o.move;
  switch (f.st) {
    case 'idle': case 'dashEnd': case 'intro': p = f.st === 'intro' ? introPose(f, B, sf, t) : B; break;
    case 'walk': {
      const dir = (f.vx || 0) * f.face >= 0 ? 1 : -1;
      p = walkCycle(st, t, dir, 1); break;
    }
    case 'crouch': p = over(B, { hip: [0, 0.4], lean: B.lean + 0.25, fF: [0.32, 0], fB: [-0.36, 0], hF: [0.46, 0.68], hB: [0.3, 0.64] }); break;
    case 'prejump': p = over(B, { hip: [0, 0.42], sq: [1.12, 0.86], hF: [0.3, 0.72], hB: [0.15, 0.7], lean: B.lean + 0.2 }); break;
    case 'land': p = over(B, { hip: [0, 0.44], sq: [1.1, 0.88], lean: B.lean + 0.15 }); break;
    case 'air': {
      const up = (f.vy || 0) > 0;
      p = over(airBase(B), up ? { hF: [0.36, 1.2], hB: [0.1, 1.15], fF: [0.18, 0.22], fB: [-0.2, 0.05], sq: [0.95, 1.06], lean: 0.05 } : { hF: [0.5, 1.15], hB: [0.2, 1.2], fF: [0.25, 0.08], fB: [-0.24, 0.12], lean: 0.12 });
      if (f.floating) p = over(p, { hF: [0.2, 1.75], hB: [0.05, 1.72], face: 'happy' });
      if (f.airJ < stanceAirJumps(f) && sf < 12 && up) p.rot = (sf / 12) * TAU;
      break;
    }
    case 'dash': p = over(B, { lean: 0.5, hip: [0.05, 0.5], fF: [0.42, 0.05], fB: [-0.55, 0.15], hF: [0.6, 0.85], hB: [-0.2, 0.8], sq: [1.1, 0.94], face: 'grin' }); break;
    case 'backdash': p = over(B, { lean: -0.25, hip: [-0.04, 0.55], fF: [0.35, 0.12], fB: [-0.3, 0], head: -0.2, face: 'focus' }); break;
    case 'dodge': {
      const k = Math.min(1, sf / 22);
      p = over(B, { hip: [0, 0.34], lean: 0.8, hF: [0.3, 0.45], hB: [0.1, 0.4], fF: [0.15, 0.1], fB: [-0.2, 0.1], sq: [1.05, 0.9], face: 'focus' });
      p.rot = k * TAU * ((f.dodgeDir || 1) * f.face > 0 ? 1 : -1);
      p.rootY = 0.18;
      break;
    }
    case 'airdodge': p = over(airBase(B), { rot: -Math.min(1, sf / 16) * TAU, hip: [0, 0.4], sq: [1, 0.9] }); break;
    case 'block': case 'crouchblock': case 'blockstun': {
      const low = f.st === 'crouchblock' || (f.st === 'blockstun' && o.crouching);
      p = over(B, low ? { hip: [0, 0.4], lean: 0.32, hF: [0.42, 0.78], hB: [0.34, 0.72], fF: [0.3, 0], fB: [-0.36, 0] } : { hF: [0.4, 1.24], hB: [0.32, 1.16], lean: B.lean + 0.06, hip: [0, B.hip[1] - 0.03] });
      p.face = 'focus'; p.wrF = -0.9; p.wrB = -0.9;
      if (f.st === 'blockstun') { const k = Math.max(0, 1 - sf / Math.max(1, f.blockstun || 8)); p.hip = [p.hip[0] - 0.06 * k, p.hip[1]]; p.lean -= 0.12 * k; p.sq = [1 - 0.04 * k, 1]; }
      break;
    }
    case 'hitstun': {
      const k = Math.max(0, 1 - sf / Math.max(1, f.hitstun || 14));
      const e = ease.outQuad(k);
      p = over(B, { lean: B.lean - 0.45 * e, chest: -0.25 * e, head: -0.45 * e, hip: [-0.1 * e, B.hip[1] - 0.04 * e], hF: [0.2, 1.1], hB: [-0.15, 1.0], face: 'hurt', fF: [0.32, 0], fB: [-0.3, 0] });
      p.sq = [1 - 0.08 * e, 1 + 0.05 * e];
      if (sf < 3) p.hitFlash = true;
      break;
    }
    case 'airhit': case 'ko': {
      const spin = f.launched ? Math.min(1.6, sf * 0.09) : 0;
      p = over(airBase(B), { rot: -0.6 - spin, hF: [0.2, 1.5], hB: [-0.3, 1.3], fF: [0.4, 0.5], fB: [-0.1, 0.4], face: f.st === 'ko' ? 'ko' : 'hurt', lean: -0.3, head: -0.4 });
      if (f.st === 'ko' && f.ground) { p = lyingPose(B, sf); p.face = 'ko'; }
      if (sf < 3) p.hitFlash = true;
      break;
    }
    case 'knockdown': p = lyingPose(B, sf); p.face = sf < 14 ? 'ko' : 'hurt'; break;
    case 'getup': { const k = ease.outBack(Math.min(1, sf / 14)); p = mixPose(lyingPose(B, 30), B, k); break; }
    case 'dizzy': {
      p = over(B, { lean: B.lean + sin(t * 4) * 0.2, head: sin(t * 5) * 0.4, hF: [0.3, 0.7], hB: [0.1, 0.65], face: 'dizzy', hip: [sin(t * 3) * 0.04, B.hip[1] - 0.06] });
      p.dizzy = true;
      break;
    }
    case 'molt': {
      const k = Math.min(1, sf / 180);
      p = over(B, { hip: [0, 0.38], lean: 0.85, head: 0.7, hF: [0.3, 0.7], hB: [0.1, 0.6], fF: [0.3, 0], fB: [-0.3, 0], face: 'focus' });
      p.sq = [1 + sin(t * 40) * 0.02 * k, 1 - 0.05 * k];
      p.rootX = sin(t * 47) * 0.015 * (0.4 + k);
      p.molt = k;
      break;
    }
    case 'moltEnd': { const k = Math.min(1, sf / 24); p = mixPose(over(B, { hip: [0, 0.66], lean: -0.3, head: -0.4, hF: [0.6, 1.6], hB: [0.3, 1.55], sq: [0.92, 1.12], face: 'grin' }), B, ease.inQuad(k)); break; }
    case 'taunt': p = tauntPose(f, B, sf, t); break;
    case 'charging': {
      const k = Math.min(1, (f.charge || 0) / 50);
      p = over(B, { hB: [-0.3 - 0.1 * k, 0.95], hF: [0.35, 1.0], lean: B.lean - 0.2 * k, hip: [-0.05, B.hip[1] - 0.06 * k], face: 'focus', fF: [0.36, 0], fB: [-0.4, 0] });
      p.rootX = sin(t * 60) * 0.012 * k;
      p.sq = [1 - 0.05 * k, 1 + 0.03 * k];
      break;
    }
    case 'attack': p = m ? moveAnim(m.anim, B, (f.mf || 0) + (o.alpha || 0), m, f, t) : B; break;
    case 'throwing': {
      const T = o.throwFrames || 40;
      const k = sf / T;
      if (k < 0.35) p = over(B, { hF: [0.85, 1.0], hB: [0.8, 0.95], lean: B.lean + 0.2, fistF: 'open', fistB: 'open', face: 'grin' });
      else if (k < 0.8) p = over(B, { hF: [0.3, 1.7], hB: [0.1, 1.65], lean: -0.3, face: 'shout', sq: [0.95, 1.06] });
      else p = over(B, { hF: [1.0, 0.6], hB: [0.9, 0.55], lean: 0.6, face: 'shout' });
      break;
    }
    case 'thrown': case 'snagged': p = over(B, { hip: [0, 0.6], hF: [0.1, 1.3], hB: [-0.1, 1.2], fF: [0.3, 0.3], fB: [-0.3, 0.4], head: -0.4, face: 'scared' }); p.rot = sin(t * 20) * 0.1; break;
    case 'stagger': { const k = Math.max(0, 1 - sf / Math.max(1, f.stagger || 14)); p = over(B, { lean: B.lean - 0.4 * k, head: -0.4 * k, hF: [0.3, 1.2], hB: [0.1, 1.1], face: 'scared' }); p.hip = [-0.06 * k, B.hip[1]]; break; }
    case 'bubbled': p = over(B, { hip: [0, 0.6], hF: [0.5 + sin(t * 14) * 0.3, 1.2], hB: [0.3 + cos(t * 13) * 0.3, 1.1], fF: [0.3, 0.3 + sin(t * 10) * 0.2], fB: [-0.3, 0.3 + cos(t * 10) * 0.2], face: 'scared' }); p.rot = sin(t * 2) * 0.4; break;
    case 'sleep': p = over(B, { hip: [0, 0.3], lean: 0.6, chest: 0.3, head: 0.6, hF: [0.3, 0.2], hB: [0.2, 0.15], face: 'sleep', fF: [0.4, 0], fB: [-0.4, 0] }); p.sq = [1, 1 + sin(t * 2.5) * 0.03]; break;
    case 'drink': { const k = Math.min(1, sf / 20); p = over(B, { hF: [0.4, 1.0 + 0.45 * k], head: -0.35 * k, lean: B.lean - 0.15 * k, face: k > 0.6 ? 'happy' : 'neutral' }); break; }
    case 'toss': p = strike(B, sf, { t: [6, 3, 9] }, { hF: [-0.2, 1.2], lean: -0.2 }, { hF: [1.0, 1.05], lean: 0.3 }, { arc: -0.3 }); break;
    case 'pickup': p = over(B, { hip: [0, 0.4], lean: 0.8, hF: [0.55, 0.15] }); break;
    case 'stumble': p = over(B, { lean: 0.75, head: 0.4, hF: [0.8, 1.2], hB: [0.6, 1.3], fB: [-0.6, 0.3], face: 'scared' }); p.rot = 0.2; break;
    case 'stuck': p = over(B, { rot: 1.6, hip: [0.2, 0.4], hF: [-0.3, 0.5], hB: [-0.4, 0.6], face: 'hurt' }); p.fF = [sin(t * 22) * 0.3, 0.5]; break;
    case 'noSnack': p = over(B, { head: 0.6, lean: 0.4, hF: [0.5, 0.6], hB: [0.4, 0.55], face: 'hurt' }); break;
    case 'recall': p = over(B, { hF: [0.9, 1.35], hB: [0.2, 0.9], face: 'happy', fistF: 'open' }); break;
    case 'roundWin': case 'victory': p = victoryPose(f, B, sf, t, o.victory); break;
    case 'defeat': p = over(B, { hip: [0, 0.36], lean: 0.8, chest: 0.4, head: 0.8, hF: [0.4, 0.2], hB: [0.3, 0.15], face: 'hurt' }); break;
    case 'qteAtk': p = over(B, { hip: [0.02, 0.5], lean: 0.5, hF: [0.95, 0.95], hB: [0.9, 0.85], fF: [0.5, 0], fB: [-0.55, 0], face: 'shout' }); p.rootX = sin(t * 50) * 0.015; break;
    case 'qteDef': p = over(B, { hip: [-0.02, 0.46], lean: 0.2, hF: [0.45, 1.25], hB: [0.35, 1.15], face: 'scared', wrF: -1, wrB: -1 }); p.rootX = sin(t * 47) * 0.015; break;
    case 'finisher': p = finisherPose(f, B, sf, t); break;
    case 'finished': { const k = Math.min(1, sf / 30); p = over(B, { lean: -0.2 * k, head: -0.3, face: 'scared', hF: [0.2, 1.3], hB: [0.0, 1.2] }); if (sf > 118) { p = over(airBase(B), { rot: -1.2, face: 'ko', hF: [0.1, 1.5], hB: [-0.2, 1.4] }); } break; }
    case 'ultAtk': {
      const k = (f.cs?.seqT || 0);
      const i = Math.floor(k / 5) % 2;
      p = over(B, i ? { hF: [1.05, 1.1], hB: [0.2, 0.9], lean: 0.35 } : { hB: [1.05, 1.0], hF: [0.25, 1.0], lean: 0.4 });
      p.smear = { limb: i ? 'hF' : 'hB', from: [0.25, 0.95], to: i ? p.hF : p.hB, arc: 0.2, k: 0 };
      p.face = 'shout'; p.fF = [0.45, 0]; p.fB = [-0.45, 0];
      break;
    }
    case 'ultVictim': p = over(B, { lean: -0.35, head: -0.5 + sin(t * 40) * 0.2, hF: [0.1, 1.3], hB: [0.0, 1.2], face: 'hurt' }); p.rootX = sin(t * 60) * 0.02; if (Math.floor(t * 30) % 4 === 0) p.hitFlash = true; break;
    case 'demonize': p = demonizePose(f, B, sf, t); break;
    case 'skill': p = skillPose(f, B, sf, t); break;
    case 'ucAtk': p = ucAtkPose(f, B, o.cineT ?? sf, t); break;
    case 'ucVictim': p = ucVicPose(f, B, o.cineT ?? sf, t); break;
    case 'shocked': p = over(B, { lean: -0.2 + Math.sin(t * 50) * 0.1, hF: [0.3 + Math.sin(t * 70) * 0.1, 1.3], hB: [0.1, 1.25], face: 'scared' }); p.rootX = Math.sin(t * 60) * 0.02; if (Math.floor(t * 20) % 2) p.hitFlash = true; break;
    default: p = B;
  }
  return scalePose(p, st.s);
}

// skill animations
function skillPose(f, B, sf, t) {
  switch (f.skill) {
    case 'mine': return sf < 10 ? over(B, { hip: [0, 0.4], lean: 0.7, hF: [0.55, 0.2], face: 'focus' }) : over(B, { hip: [0, 0.5], lean: 0.4, hF: [0.5, 0.4], face: 'grin' });
    case 'riptide': { const p = over(B, { lean: 0.9, hip: [0.1, 0.46], hF: [1.05, 0.9], hB: [-0.4, 0.8], fF: [0.5, 0.15], fB: [-0.7, 0.3], face: 'shout', sq: [1.2, 0.86] }); p.smear = { limb: 'hF', from: [-0.6, 0.8], to: p.hF, arc: 0, k: 1, long: 1.4 }; return p; }
    case 'habanero': { const chew = Math.max(0, Math.sin(sf * 0.6)); return sf < 22 ? over(B, { hF: [0.42, 1.38], head: -0.3, face: 'eat', lean: -0.05 }) : over(B, { hF: [0.6, 1.6], hB: [0.4, 1.5], head: -0.4, face: 'shout', sq: [1, 1.04 + chew * 0.02] }); }
    case 'eyes': return over(B, { hF: [0.55, 1.42], hB: [0.4, 1.1], head: -0.15, face: 'focus', fistF: 'point' });
    case 'coral': return sf < 12 ? over(B, { hip: [0, 0.4], lean: 0.6, hF: [0.6, 0.2], hB: [0.5, 0.2], face: 'focus', fistF: 'open', fistB: 'open' }) : over(B, { hF: [0.8, 1.3], hB: [0.7, 1.2], face: 'shout', fistF: 'open', fistB: 'open' });
    case 'hook': return strike(B, sf, { t: [9, 6, 13] }, { hF: [-0.3, 1.3], lean: -0.2 }, { hF: [1.05, 1.05], lean: 0.3, fF: [0.4, 0] }, { arc: -0.4 });
    case 'loteria': return over(B, { hF: [0.5, 1.5], hB: [0.2, 1.0], head: -0.2, face: sf > 16 ? 'grin' : 'focus', fistF: 'open' });
    case 'hermit': return sf < 12 ? over(B, { hip: [0, 0.38], lean: 0.9, head: 0.6, hF: [0.3, 0.5], hB: [0.1, 0.45], face: 'focus' }) : over(B, { hF: [0.4, 1.0], hB: [0.3, 0.95], face: 'grin', sq: [1.06, 0.96] });
    case 'decoy': return over(B, { sq: [0.6, 1.3], face: 'smug' });
    case 'eel': { const p = over(B, { hF: [0.4, 1.6], hB: [-0.3, 1.5], face: 'shout', fistF: 'open', fistB: 'open' }); p.rootX = Math.sin(t * 50) * 0.01; return p; }
    case 'mariachi': { const s = Math.sin(t * 30); return over(B, { hF: [0.6, 0.85], hB: [0.3, 0.72 + s * 0.05], head: 0.2, face: 'grin', fF: [0.36, 0] }); }
    case 'pinata': return strike(B, sf, { t: [10, 4, 6] }, { hB: [-0.4, 1.2], lean: -0.2 }, { hB: [0.8, 1.5], lean: 0.2 }, { limb: 'hB', arc: -0.5 });
    default: return over(B, { hF: [0.6, 1.4], hB: [0.4, 1.3], face: 'shout' });
  }
}
// cinematic ultimate choreography (ct = cinematic frame 0..330)
function ucAtkPose(f, B, ct, t) {
  const steps = [72, 124, 176, 228];
  if (ct < 50) { const p = over(B, { hF: [0.4, 1.0], hB: [0.3, 0.95], lean: 0.1, face: 'shout', hip: [0, B.hip[1] - 0.04] }); p.rootX = Math.sin(t * 60) * 0.01; return p; }
  for (let k = 0; k < steps.length; k++) {
    const d = ct - steps[k];
    if (d >= -12 && d < 14) {
      const lim = k % 2 ? 'hB' : 'hF';
      const W = over(B, { [lim]: [-0.2, 1.0], lean: B.lean - 0.15, face: 'shout' });
      const H = k === 2 ? over(B, { hF: [0.5, 1.75], lean: -0.25, hip: [0.05, 0.7], face: 'shout' }) : over(B, { [lim]: [1.15, 1.05], lean: B.lean + 0.35, fF: [0.5, 0], fB: [-0.5, 0], face: 'shout' });
      if (d < -2) return mixPose(B, W, (d + 12) / 10);
      const p = over(H, {});
      if (d < 3) p.smear = { limb: k === 2 ? 'hF' : lim, from: [-0.2, 1.0], to: H[k === 2 ? 'hF' : lim], arc: k === 2 ? -0.5 : 0.15, k: 0 };
      return p;
    }
  }
  if (ct >= 250 && ct < 288) { const p = over(B, { hB: [-0.6, 1.1], hF: [0.5, 1.0], lean: -0.35, hip: [-0.1, 0.52], face: 'shout', sq: [0.95, 1.04] }); p.rootX = Math.sin(t * 70) * 0.012; return p; }
  if (ct >= 288) { const p = over(B, { hB: [1.4, 1.05], hF: [0.1, 0.9], lean: 0.6, hip: [0.2, 0.5], fF: [0.7, 0], fB: [-0.6, 0], face: 'shout', sq: [1.14, 0.92] }); if (ct < 296) p.smear = { limb: 'hB', from: [-0.6, 1.1], to: p.hB, arc: 0.1, k: 0, long: 1.5 }; return p; }
  return over(B, { hF: [0.5, 1.0], hB: [0.3, 0.96], face: 'angry', lean: B.lean + 0.1 });
}
function ucVicPose(f, B, ct, t) {
  const steps = [72, 124, 176, 228, 290];
  let last = -999;
  for (const s of steps) if (ct >= s) last = s;
  const d = ct - last;
  if (ct >= 290) return over(airBase(B), { rot: -0.9 - Math.min(1.5, d * 0.05), hF: [0.2, 1.5], hB: [-0.3, 1.4], face: 'ko' });
  if (d < 14) { const e = 1 - d / 14; const p = over(B, { lean: -0.5 * e, head: -0.5 * e, chest: -0.3 * e, hF: [0.1, 1.3], hB: [-0.2, 1.2], face: 'hurt', hip: [-0.12 * e, B.hip[1]] }); if (d < 3) p.hitFlash = true; return p; }
  return over(B, { lean: -0.1, hF: [0.3, 1.2], hB: [0.2, 1.15], face: ct < 60 ? 'scared' : 'hurt' });
}

function stanceAirJumps(f) { return f.char === 'bobby' ? 2 : 1; }

function lyingPose(B, sf) {
  const p = over(B, { rot: -1.48, hip: [0, 0.6], hF: [0.4, 0.4], hB: [0.2, 0.3], fF: [0.3, 0.1], fB: [-0.2, 0.15], head: -0.2, lean: 0.1 });
  p.rootY = -0.42 + (sf < 8 ? sin(sf / 8 * Math.PI) * 0.12 : 0);
  return p;
}

function scalePose(p, s) {
  if (s === 1) return p;
  const q = Object.assign({}, p);
  for (const k of ['hip', 'hF', 'hB', 'fF', 'fB']) if (q[k]) q[k] = [q[k][0] * s, q[k][1] * s];
  q.rootX = (q.rootX || 0) * s; q.rootY = (q.rootY || 0) * s;
  if (q.smear) q.smear = { ...q.smear, from: [q.smear.from[0] * s, q.smear.from[1] * s], to: [q.smear.to[0] * s, q.smear.to[1] * s] };
  return q;
}

// ------------------------------------------------------------------ personality poses
function tauntPose(f, B, sf, t) {
  switch (f.cs?.demon ? 'demon' : f.char) {
    case 'jim': { const p = over(B, { hF: [0.55, 1.6], hB: [-0.2, 0.7], fistF: 'point', face: 'grin', lean: -0.1, head: -0.2 }); if (sf > 30) p.hF = [0.9, 1.25]; return p; }
    case 'brutus': { const p = over(B, { hF: [0.3, 1.0], hB: [0.2, 0.95], belly: 0.15 + abs(sin(t * 10)) * 0.1, face: 'grin', lean: -0.25 }); p.sq = [1 + sin(t * 10) * 0.04, 1]; return p; }
    case 'bobby': { const p = over(B, { hF: [0.2, 1.3], hB: [0.0, 1.25], face: 'grin' }); p.rootY = abs(sin(t * 9)) * 0.15; p.cone = sin(t * 9) * 0.3; return p; }
    case 'mimi': { const p = over(B, { hF: [0.5, 1.3], hB: [0.35, 1.25], face: 'cute', fistF: 'open', fistB: 'open', head: 0.15 }); p.fB = [-0.25, 0.25]; return p; }
    case 'demon': return over(B, { head: -0.8, hF: [0.6, 1.2], hB: [0.4, 0.3], face: 'fangs' });
    default: return B;
  }
}
function introPose(f, B, sf, t) {
  switch (f.char) {
    case 'jim': { const p = over(B, { hF: [0.55, 1.55], hB: [0.1, 0.7], fistF: 'fist', face: 'shout', head: -0.2 }); if (sf > 120) return over(B, { hF: [0.5, 1.05], hB: [0.3, 1.0], face: 'focus' }); return p; }
    case 'brutus': { const p = over(B, { hF: [0.2, 1.6], hB: [0.0, 1.6], face: 'grin', lean: -0.2, belly: 0.2 }); p.sq = [1 + abs(sin(t * 6)) * 0.04, 1]; return p; }
    case 'bobby': { const p = over(B, { hF: [0.3, 1.2], hB: [-0.2, 1.1], face: 'grin' }); p.cone = sin(t * 4) * 0.3; return p; }
    case 'mimi': { const p = over(B, { hF: [0.5, 1.4], hB: [0.3, 1.2], face: 'happy', fistF: 'open', head: 0.15 }); p.fB = [-0.25, 0.3]; return p; }
    default: return B;
  }
}
function victoryPose(f, B, sf, t, key = 'default') {
  const c = f.cs?.demon ? 'demon' : f.char;
  switch (key) {
    case 'flex': { const p = over(B, { hF: [0.3, 1.35], hB: [0.1, 1.3], wrF: -2.2, wrB: -2.2, face: 'grin', lean: -0.1 }); p.sq = [1.04 + sin(t * 5) * 0.03, 1]; return p; }
    case 'cumbia': { const b = sin(t * 7.5); const p = over(B, { hip: [b * 0.06, 0.56 + abs(b) * 0.04], hF: [0.45, 0.9 + b * 0.25], hB: [0.4, 0.9 - b * 0.25], face: 'happy' }); p.fF = [0.25 + b * 0.12, Math.max(0, b) * 0.12]; p.fB = [-0.25 + b * 0.12, Math.max(0, -b) * 0.12]; return p; }
    case 'snack': return over(B, { hF: [0.42, 1.38], hB: [0.3, 1.0], head: -0.3, face: 'eat' });
    case 'guitar': { const s = sin(t * 18); return over(B, { hF: [0.55, 0.85], hB: [0.3, 0.7 + s * 0.08], head: 0.3 + sin(t * 6) * 0.2, hip: [0, 0.52], fF: [0.45, 0], face: 'grin' }); }
    case 'spin': { const p = over(B, { hip: [0, 0.4], hF: [0.4, 0.2], hB: [-0.3, 0.2], face: 'happy' }); p.rot = Math.PI; p.rootY = 0.9; p.spin = t * 30; return p; }
    case 'fireworks': { const p = over(B, { hF: [0.3, 1.7], hB: [0.2, 1.65], head: -0.5, face: 'happy' }); p.rootY = abs(sin(t * 4)) * 0.12; return p; }
    default: break;
  }
  switch (c) {
    case 'jim': { const p = over(B, { hF: [0.4, 1.75], hB: [0.0, 0.7], head: -0.35, face: 'shout', fF: [0.4, 0], fB: [-0.36, 0] }); if (sf > 90) p.face = 'grin'; return p; }
    case 'brutus': { const p = over(B, { hF: [0.4, 1.25], hB: [0.3, 1.2], head: -0.3, belly: 0.2 + abs(sin(t * 6)) * 0.1, face: 'grin', lean: -0.2 }); return p; }
    case 'bobby': { const p = over(B, { hF: [0.1, 1.4], hB: [-0.1, 1.35], face: 'grin' }); p.rootY = abs(sin(t * 7)) * 0.3; p.cone = sin(t * 7) * 0.4; return p; }
    case 'demon': return over(B, { head: -0.7, hF: [0.6, 1.3], hB: [0.5, 0.2], face: 'fangs' });
    case 'mimi': { const p = over(B, { hF: [0.5, 1.3], hB: [0.35, 1.25], face: 'happy', fistF: 'open', head: 0.2 }); p.fB = [-0.3, 0.35]; p.rootY = abs(sin(t * 5)) * 0.1; return p; }
    default: return B;
  }
}
function finisherPose(f, B, sf, t) {
  if (sf < 40) return over(B, { hF: [0.2, 1.0], hB: [-0.4, 1.1], lean: -0.2, face: 'focus', hip: [-0.05, 0.54] });
  if (sf < 115) { const p = over(B, { hB: [-0.5, 1.0], hF: [0.4, 1.0], lean: -0.3, hip: [-0.1, 0.5], face: 'shout' }); p.rootX = sin(t * 50) * 0.012; return p; }
  const p = over(B, { hB: [1.3, 1.05], hF: [0.1, 0.9], lean: 0.55, hip: [0.15, 0.52], fF: [0.6, 0], fB: [-0.55, 0], face: 'shout', sq: [1.12, 0.92] });
  if (sf < 122) p.smear = { limb: 'hB', from: [-0.4, 1.0], to: p.hB, arc: 0.1, k: 0, long: 1.4 };
  return p;
}
function demonizePose(f, B, sf, t) {
  if (sf < 40) return over(B, { hip: [0, 0.4], lean: 0.8, head: 0.8, hF: [0.3, 0.9], hB: [0.2, 0.85], face: 'scared' });
  if (sf < 80) { const p = over(B, { hip: [0, 0.35], lean: 0.9, head: 0.9, hF: [0.2, 1.2], hB: [0.1, 1.15], face: 'hurt' }); p.rootX = sin(t * 60) * 0.02; return p; }
  return over(B, { hip: [0, 0.62], lean: -0.3, head: -0.6, hF: [0.7, 1.4], hB: [0.4, 1.35], face: 'fangs', sq: [1.05, 1.05] });
}

export { strike, base as stancePose };
