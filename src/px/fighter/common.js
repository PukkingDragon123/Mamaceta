// Helpers shared by the character definitions: torso frames, expressions, limbs.
import { G, M, R, along, add, sub, norm, mul, texPlates, eyeStalk, mouth, fist, foot, u32, mixU } from './kit.js';

// torso frame: map (fw = forward px, h = up px from hip) to local coords, bending at the waist
export function torsoFrame(J) {
  const hip = J.hip, waist = J.waist, neck = J.neck;
  const u1 = norm(sub(waist, hip)), u2 = norm(sub(neck, waist));
  const f1 = [u1[1], -u1[0]], f2 = [u2[1], -u2[0]];
  const hw = Math.hypot(waist[0] - hip[0], waist[1] - hip[1]);
  const T = (fw, h) => (h <= hw
    ? [hip[0] + f1[0] * fw + u1[0] * h, hip[1] + f1[1] * fw + u1[1] * h]
    : [waist[0] + f2[0] * fw + u2[0] * (h - hw), waist[1] + f2[1] * fw + u2[1] * (h - hw)]);
  T.hw = hw; T.len = hw + Math.hypot(neck[0] - waist[0], neck[1] - waist[1]);
  return T;
}
export const polyT = (T, list, k = 1) => list.map(([f, h]) => T(f * k, h * k));

// head frame: (x forward, y up) px relative to head centre, rotated by head angle
export function headFrame(J) {
  const a = J.headAng, c = Math.cos(a), s = Math.sin(a), h = J.head;
  // headAng: positive tilts forward (nod)
  const H = (x, y) => [h[0] + x * c + y * s, h[1] - x * s + y * c];
  H.ang = a;
  return H;
}

export const EXPR = {
  neutral: { lid: 0.2, slant: -0.3, mouth: 'smug' },
  angry: { lid: 0.34, slant: -0.7, mouth: 'shout' },
  shout: { lid: 0.2, slant: -0.5, mouth: 'shout' },
  grin: { lid: 0.18, slant: -0.35, mouth: 'grin' },
  smug: { lid: 0.4, slant: -0.15, mouth: 'smug' },
  hurt: { lid: 0.4, slant: 0.6, mouth: 'hurt', look: [-1, 0.3] },
  ko: { x: true, mouth: 'ko' },
  sleep: { open: 0, mouth: 'sleep' },
  cute: { lid: 0, slant: 0, mouth: 'cute' },
  happy: { lid: 0.15, slant: 0.2, mouth: 'grin', arc: true },
  scared: { lid: 0, slant: 0.6, mouth: 'scared', pupil: 0.6 },
  eat: { lid: 0.3, slant: 0.2, mouth: 'eat', arc: true },
  focus: { lid: 0.42, slant: -0.5, mouth: 'neutral' },
  fangs: { lid: 0.35, slant: -0.7, mouth: 'fangs' },
  dizzy: { spiral: true, mouth: 'hurt' },
};

// draw both eye stalks (far + near) with an expression
export function eyes(P, H, pose, o) {
  const ex = EXPR[pose.face] || EXPR.neutral;
  const look = ex.look || pose.look || [1, 0];
  const open = (ex.open ?? 1) * (pose.eyes ?? 1);
  const blink = o.blink ? 0 : 1;
  const common = { stalk: o.stalk, eye: o.eye, band: o.band, ink: o.ink, look, lid: ex.lid, slant: ex.slant, open: open * blink, pupil: (ex.pupil ?? 1) * (o.pupil ?? 1), pupilC: o.pupilC, lidC: o.lidC, shine: o.shine, stalkR: o.stalkR, stalkR2: o.stalkR2 };
  const k = o.k || 1;
  const er = (o.er || 3) * k;
  const cFar = eyeStalk(P, H(o.farX * k, o.baseY * k), H.ang + (o.angFar ?? 0.25), (o.stalkL || 4) * k, er * 0.9, { ...common, stalk: backMat(o.stalk, -0.3), eye: backMat(o.eye, -0.35), z: o.z - 0.5 });
  const cNear = eyeStalk(P, H(o.nearX * k, o.baseY * k - 0.5), H.ang + (o.angNear ?? 0.45), (o.stalkL || 4) * k, er, { ...common, z: o.z + 0.5 });
  if (ex.x || ex.spiral) {
    for (const c of [cFar, cNear]) {
      const r = Math.max(1.5, er * 0.6);
      for (let i = -1; i <= 1; i++) { P.paint([c[0] + i, c[1] + i], o.ink, G.eyes); P.paint([c[0] + i, c[1] - i], o.ink, G.eyes); }
      if (r > 2) { P.paint([c[0] + 2, c[1] + 2], o.ink, G.eyes); P.paint([c[0] - 2, c[1] - 2], o.ink, G.eyes); P.paint([c[0] + 2, c[1] - 2], o.ink, G.eyes); P.paint([c[0] - 2, c[1] + 2], o.ink, G.eyes); }
    }
  }
  if (ex.arc) {
    // happy closed arcs
    for (const c of [cFar, cNear]) for (let i = -2; i <= 2; i++) P.paint([c[0] + i, c[1] + (Math.abs(i) === 2 ? -1 : 0)], o.ink, G.eyes);
  }
  if (o.lashes) for (const c of [cFar, cNear]) { P.px([c[0] + er * 0.9, c[1] + er * 0.6], o.ink, o.z + 1, G.eyes); P.px([c[0] + er * 0.6, c[1] + er * 1.05], o.ink, o.z + 1, G.eyes); }
  return { cFar, cNear, ex };
}

export function face(P, H, pose, o) {
  const ex = EXPR[pose.face] || EXPR.neutral;
  mouth(P, H(o.mx * (o.k || 1), o.my * (o.k || 1)), pose.mouthKind || ex.mouth, o.mw * (o.k || 1), { ink: o.ink, teeth: o.teeth, tongue: o.tongue });
}

// segmented shell limb
export function limb(P, a, b, r0, r1, m, z, g) { P.cap(a, b, r0, r1, m, z, g); }

export function backMat(m, amt = -0.45) { return { ...m, bias: (m.bias || 0) + amt }; }

export { G, M, R, along, add, sub, norm, mul, texPlates, fist, foot, u32, mixU };
