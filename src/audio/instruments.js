// Mantis Mayhem audio — instruments.
//  * SAMPLE_DEFS: percussive melodic instruments pre-rendered per zone (marimba, vibes, music box, basses, e-piano)
//  * DRUM_DEFS:   drum / latin percussion one-shots pre-rendered (kick, snare, güiro, congas, claves, clanks...)
//  * live synths: brass/trumpet, muted trumpet, trombone, accordion, organ, tuba, pads, bells
//  * Karplus-Strong nylon / vihuela / requinto guitar (cached per pitch)
//  * INST: the table the sequencer and stingers use: (S, ev, t, dur, vel, to, ch) => void

import { mtof, clamp, ksNote, tanhCurve, fuzzCurve } from './dsp.js';
import { envADSR, envPoints } from './synth.js';

const KS_RATE = { nylon: 22050, vihuela: 32000, requinto: 32000 }; // warm nylon needs less bandwidth

// ====================================================================== sampled melodic instruments
export const SAMPLE_DEFS = {
  marimba: {
    zones: [48, 55, 62, 69, 76, 83, 90], lvl: -13,
    len: (m) => clamp(1.5 - (m - 48) * 0.028, 0.32, 1.5) + 0.05,
    fn(S, t, m) {
      const f = mtof(m), T = clamp(1.5 - (m - 48) * 0.028, 0.32, 1.5);
      S.tone({ f, t, a: 0.0018, d: T, peak: 0.8 });
      S.tone({ f: f * 3.98, t, a: 0.0012, d: T * 0.3, peak: m < 78 ? 0.22 : 0.1 });
      if (f * 9.2 < 14000) S.tone({ f: f * 9.2, t, a: 0.0008, d: T * 0.1, peak: 0.05 });
      S.noise({ t, a: 0.0006, d: 0.012, peak: 0.1, f: [['bp', Math.min(f * 2.5, 5000), 1.5]] });
    },
  },
  vibes: {
    zones: [53, 60, 67, 74, 81, 88], lvl: -14,
    len: (m) => clamp(3.0 - (m - 53) * 0.045, 1.2, 3.0) + 0.05,
    fn(S, t, m) {
      const f = mtof(m), T = clamp(3.0 - (m - 53) * 0.045, 1.2, 3.0);
      S.tone({ f, t, a: 0.002, d: T, peak: 0.75 });
      S.tone({ f: f * 4.0, t, a: 0.0015, d: T * 0.22, peak: 0.13 });
      if (f * 10 < 14000) S.tone({ f: f * 10, t, a: 0.001, d: T * 0.05, peak: 0.035 });
      S.noise({ t, a: 0.001, d: 0.01, peak: 0.04, f: [['bp', 2800, 1]] });
    },
  },
  musicbox: {
    zones: [72, 79, 86, 93], lvl: -15, sr: 'hi',
    len: (m) => clamp(1.9 - (m - 72) * 0.035, 0.7, 1.9) + 0.05,
    fn(S, t, m) {
      const f = mtof(m), T = clamp(1.9 - (m - 72) * 0.035, 0.7, 1.9);
      S.tone({ f, t, a: 0.0008, d: T, peak: 0.6 });
      S.tone({ f: f * 2.0, t, a: 0.0006, d: T * 0.45, peak: 0.16 });
      S.tone({ f: f * 3.01, t, a: 0.0006, d: T * 0.25, peak: 0.07 });
      if (f * 4.95 < 18000) S.tone({ f: f * 4.95, t, a: 0.0005, d: T * 0.12, peak: 0.06 });
      S.noise({ t, a: 0.0004, d: 0.004, peak: 0.06, f: [['hp', 4000]] });
    },
  },
  ubass: { // upright, finger plucked
    zones: [28, 35, 42, 49, 56], lvl: -12, sr: 'lo',
    len: () => 1.6,
    fn(S, t, m) {
      const f = mtof(m), T = clamp(1.6 - (m - 28) * 0.015, 0.9, 1.6);
      const l = S.lp(1100, 0.6);
      S.tone({ type: 'triangle', f, t, a: 0.005, d: T * 0.8, peak: 0.55, to: l });
      S.tone({ f, t, a: 0.004, d: T, peak: 0.6, to: l });
      S.tone({ f: f * 2, t, a: 0.004, d: T * 0.35, peak: 0.16, to: l });
      S.noise({ t, a: 0.001, d: 0.035, peak: 0.1, f: [['lp', 900], ['hp', 120]] });
    },
  },
  ebass: { // picked electric
    zones: [28, 35, 42, 49], lvl: -12, sr: 'lo',
    len: () => 1.3,
    fn(S, t, m) {
      const f = mtof(m);
      const l = S.lp(2000, 1.4);
      envPoints(l.frequency, t, [[0, 2600], [0.25, 700, 'e'], [1.2, 400, 'e']]);
      S.tone({ type: 'sawtooth', f, t, a: 0.003, d: 1.2, peak: 0.45, to: l });
      S.tone({ f, t, a: 0.003, d: 1.2, peak: 0.55 });
    },
  },
  dbass: { // distorted, for the rust pit
    zones: [28, 35, 42, 49], lvl: -12, sr: 'lo',
    len: () => 1.0,
    fn(S, t, m) {
      const f = mtof(m);
      const h = S.hp(45, 0.7);
      const l = S.lp(1500, 1.2, h);
      envPoints(l.frequency, t, [[0, 2400], [0.18, 900, 'e'], [0.95, 600, 'e']]);
      const fz = S.shaper(fuzzCurve(4), l);
      const pre = S.gain(1, fz);
      S.tone({ type: 'sawtooth', f, t, a: 0.003, d: 0.95, peak: 0.6, to: pre });
      S.tone({ type: 'square', f: f * 0.5, t, a: 0.003, d: 0.95, peak: 0.25, to: pre });
      S.tone({ f, t, a: 0.003, d: 0.9, peak: 0.5 }); // clean sub under the fuzz
    },
  },
  epiano: { // FM tine piano
    zones: [48, 55, 62, 69, 76], lvl: -14,
    len: () => 2.4,
    fn(S, t, m) {
      const f = mtof(m), T = clamp(2.4 - (m - 48) * 0.03, 1.2, 2.4);
      const amp = S.gain(0);
      envPoints(amp.gain, t, [[0, 0], [0.002, 0.6], [T, 0.0006, 'e']]);
      const car = S.osc('sine', f, t, t + T + 0.02, amp);
      const mod = S.osc('sine', f, t, t + T + 0.02, null);
      const mg = S.gain(0, null);
      envPoints(mg.gain, t, [[0, f * 1.8], [0.5, f * 0.25, 'e'], [T, f * 0.1, 'e']]);
      mod.connect(mg); mg.connect(car.frequency);
      S.tone({ f: f * 7.02, t, a: 0.001, d: 0.06, peak: 0.05 });
    },
  },
};

// ====================================================================== drum kit / percussion
export const DRUM_DEFS = {
  kick: { v: 2, len: 0.5, lvl: -10, sr: 'lo', fn(S, t) { S.thump({ t, f0: 145, f1: 48, ft: 0.06, d: 0.42, peak: 1, click: 0.16, drive: 1.4 }); } },
  kick_soft: { len: 0.45, lvl: -12, sr: 'lo', fn(S, t) { S.thump({ t, f0: 105, f1: 50, ft: 0.07, d: 0.38, peak: 1, click: 0.05 }); } },
  kick_hard: {
    v: 2, len: 0.5, lvl: -9, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: 175, f1: 44, ft: 0.05, d: 0.45, peak: 1, click: 0.3, drive: 3 });
      S.noise({ t, a: 0.001, d: 0.03, peak: 0.25, f: [['bp', 900, 1]] });
    },
  },
  snare: {
    v: 3, len: 0.35, lvl: -13,
    fn(S, t) {
      S.noise({ t, a: 0.001, d: S.r(0.17, 0.23), peak: 0.75, f: [['hp', 600], ['bp', S.r(1700, 2100), 0.6]] });
      S.tone({ type: 'triangle', f: 195, f1: 172, ft: 0.03, t, a: 0.001, d: 0.1, peak: 0.6 });
      S.tone({ f: 335, t, a: 0.001, d: 0.06, peak: 0.25 });
    },
  },
  snare_hard: {
    v: 2, len: 0.45, lvl: -11,
    fn(S, t) {
      const dr = S.drive(2.2);
      S.noise({ t, a: 0.001, d: 0.28, peak: 0.8, f: [['hp', 500], ['bp', 1900, 0.5]], to: dr });
      S.tone({ type: 'triangle', f: 210, f1: 175, ft: 0.03, t, a: 0.001, d: 0.12, peak: 0.7, to: dr });
      S.noise({ t, a: 0.0005, d: 0.01, peak: 0.4, f: [['hp', 3000]] });
    },
  },
  rim: { len: 0.12, lvl: -15, fn(S, t) { S.tone({ f: 1750, t, a: 0.0005, d: 0.03, peak: 0.6 }); S.tone({ f: 470, t, a: 0.0005, d: 0.04, peak: 0.5 }); S.noise({ t, a: 0.0004, d: 0.015, peak: 0.5, f: [['bp', 3200, 1.2]] }); } },
  clap: {
    len: 0.35, lvl: -13,
    fn(S, t) {
      for (let i = 0; i < 3; i++) S.noise({ t: t + i * 0.0095, a: 0.0006, d: 0.012, peak: 0.7, f: [['bp', 1150, 1.6]] });
      S.noise({ t: t + 0.028, a: 0.001, d: 0.16, peak: 0.6, f: [['bp', 1250, 1.2]] });
    },
  },
  hat: {
    v: 3, len: 0.12, lvl: -19, sr: 'hi',
    fn(S, t) {
      const bus = S.gain(1);
      const h = S.hp(7200, 0.7, bus);
      const b = S.bp(10000, 0.9, h);
      const g = S.gain(0, b);
      envPoints(g.gain, t, [[0, 0], [0.0008, 0.55], [S.r(0.04, 0.06), 0.0005, 'e']]);
      for (const f of [263, 400, 421, 474, 587, 845]) S.osc('square', f * 1.5, t, t + 0.1, g);
      S.noise({ t, a: 0.0008, d: 0.04, peak: 0.35, f: [['hp', 8000]] });
    },
  },
  hat_open: {
    len: 0.55, lvl: -18, sr: 'hi',
    fn(S, t) {
      const h = S.hp(6800, 0.7);
      const b = S.bp(9500, 0.8, h);
      const g = S.gain(0, b);
      envPoints(g.gain, t, [[0, 0], [0.001, 0.5], [0.45, 0.0005, 'e']]);
      for (const f of [263, 400, 421, 474, 587, 845]) S.osc('square', f * 1.5, t, t + 0.5, g);
      S.noise({ t, a: 0.001, d: 0.4, peak: 0.3, f: [['hp', 7500]] });
    },
  },
  ride: {
    v: 2, len: 1.2, lvl: -21, sr: 'hi',
    fn(S, t) {
      const h = S.hp(3500, 0.7);
      const b = S.bp(7000, 0.6, h);
      const g = S.gain(0, b);
      envPoints(g.gain, t, [[0, 0], [0.001, 0.4], [0.02, 0.18, 'e'], [1.1, 0.0004, 'e']]);
      for (const f of [263, 400, 421, 474, 587, 845]) S.osc('square', f * 2.1, t, t + 1.15, g);
      S.tone({ f: 3350, t, a: 0.001, d: 0.7, peak: 0.12 });
      S.tone({ f: 5120, t, a: 0.001, d: 0.4, peak: 0.05 });
    },
  },
  crash: {
    len: 2.0, lvl: -15, sr: 'hi',
    fn(S, t) {
      const h = S.hp(2600, 0.7);
      const g = S.gain(0, h);
      envPoints(g.gain, t, [[0, 0], [0.002, 0.5], [0.08, 0.3, 'e'], [1.9, 0.0004, 'e']]);
      for (const f of [263, 400, 421, 474, 587, 845, 1130]) S.osc('square', f * 1.9, t, t + 1.95, g);
      S.noise({ t, a: 0.002, d: 1.7, peak: 0.55, f: [['hp', 3500], ['lp', 12000]] });
    },
  },
  shaker: {
    v: 2, len: 0.14, lvl: -22, sr: 'hi',
    fn(S, t) { S.noise({ t, a: S.r(0.006, 0.014), d: 0.07, peak: 0.6, f: [['hp', 4500], ['bp', 8500, 0.8]] }); },
  },
  tamb: {
    len: 0.25, lvl: -20, sr: 'hi',
    fn(S, t) {
      S.noise({ t, a: 0.002, d: 0.16, peak: 0.5, f: [['hp', 6000], ['bp', 9500, 1.2]] });
      for (let i = 0; i < 5; i++) S.tone({ f: S.r(6200, 9800), t: t + S.r(0, 0.012), a: 0.0006, d: S.r(0.06, 0.14), peak: 0.06 });
    },
  },
  claves: {
    v: 2, len: 0.12, lvl: -16, sr: 'hi',
    fn(S, t) {
      const f = S.r(2450, 2550);
      S.tone({ f, t, a: 0.0006, d: 0.075, peak: 0.8 });
      S.tone({ f: f * 2.03, t, a: 0.0005, d: 0.025, peak: 0.12 });
      S.noise({ t, a: 0.0003, d: 0.004, peak: 0.25, f: [['bp', 3500, 1]] });
    },
  },
  woodblock: { len: 0.1, lvl: -16, fn(S, t) { S.wood({ t, f: 1900, d: 0.06, peak: 1, click: 0.3 }); } },
  tick: { len: 0.08, lvl: -18, sr: 'hi', fn(S, t) { S.wood({ t, f: 2600, d: 0.03, peak: 1, click: 0.5 }); S.tone({ f: 5200, t, a: 0.0004, d: 0.012, peak: 0.15 }); } },
  tock: { len: 0.08, lvl: -18, fn(S, t) { S.wood({ t, f: 1650, d: 0.035, peak: 1, click: 0.4 }); } },
  guiro_long: {
    len: 0.22, lvl: -19, sr: 'hi',
    fn(S, t) {
      const g = S.gain(0);
      const src = S.noiseSrc('white', t, t + 0.21, null);
      const [first] = S.chain([['bp', 3600, 2.2], ['hp', 1300]], t, g);
      src.connect(first);
      const n = 15;
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.0115 * (1 - i * 0.006);
        const a = 0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / n);
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(a, tt + 0.0015);
        g.gain.linearRampToValueAtTime(0, tt + 0.0085);
      }
    },
  },
  guiro_short: {
    len: 0.08, lvl: -20, sr: 'hi',
    fn(S, t) {
      const g = S.gain(0);
      const src = S.noiseSrc('white', t, t + 0.07, null);
      const [first] = S.chain([['bp', 3900, 2.2], ['hp', 1300]], t, g);
      src.connect(first);
      for (let i = 0; i < 5; i++) {
        const tt = t + i * 0.009;
        g.gain.setValueAtTime(0, tt);
        g.gain.linearRampToValueAtTime(0.5 + 0.5 * Math.sin(Math.PI * (i + 0.5) / 5), tt + 0.0012);
        g.gain.linearRampToValueAtTime(0, tt + 0.0065);
      }
    },
  },
  conga_hi: {
    len: 0.4, lvl: -15,
    fn(S, t) {
      S.tone({ f: 372, f1: 345, ft: 0.025, t, a: 0.001, d: 0.32, peak: 0.8 });
      S.tone({ f: 345 * 1.52, t, a: 0.001, d: 0.1, peak: 0.18 });
      S.noise({ t, a: 0.0005, d: 0.016, peak: 0.25, f: [['bp', 1900, 1.2]] });
    },
  },
  conga_lo: {
    len: 0.45, lvl: -15,
    fn(S, t) {
      S.tone({ f: 250, f1: 228, ft: 0.03, t, a: 0.001, d: 0.38, peak: 0.85 });
      S.tone({ f: 228 * 1.55, t, a: 0.001, d: 0.12, peak: 0.15 });
      S.noise({ t, a: 0.0005, d: 0.016, peak: 0.2, f: [['bp', 1600, 1.2]] });
    },
  },
  conga_slap: {
    len: 0.15, lvl: -15,
    fn(S, t) {
      S.tone({ f: 380, t, a: 0.0008, d: 0.07, peak: 0.5 });
      S.noise({ t, a: 0.0005, d: 0.05, peak: 0.75, f: [['bp', 2500, 0.9]] });
    },
  },
  bongo: { len: 0.25, lvl: -16, fn(S, t) { S.tone({ f: 560, f1: 520, ft: 0.02, t, a: 0.0008, d: 0.16, peak: 0.8 }); S.noise({ t, a: 0.0005, d: 0.012, peak: 0.25, f: [['bp', 2600, 1.2]] }); } },
  cowbell: {
    len: 0.35, lvl: -18,
    fn(S, t) {
      const l = S.bp(2000, 0.9);
      const g = S.gain(0, l);
      envPoints(g.gain, t, [[0, 0], [0.001, 0.6], [0.03, 0.22, 'e'], [0.32, 0.0004, 'e']]);
      S.osc('square', 562, t, t + 0.34, g);
      S.osc('square', 845, t, t + 0.34, g);
    },
  },
  timbale_hi: {
    len: 0.45, lvl: -15,
    fn(S, t) {
      S.tone({ f: 660, f1: 615, ft: 0.03, t, a: 0.0008, d: 0.35, peak: 0.6 });
      S.tone({ f: 615 * 1.49, t, a: 0.0008, d: 0.18, peak: 0.25 });
      S.tone({ f: 2950, t, a: 0.0006, d: 0.09, peak: 0.08 });
      S.noise({ t, a: 0.0005, d: 0.05, peak: 0.35, f: [['bp', 4000, 1.2]] });
    },
  },
  timbale_lo: {
    len: 0.45, lvl: -15,
    fn(S, t) {
      S.tone({ f: 470, f1: 440, ft: 0.03, t, a: 0.0008, d: 0.38, peak: 0.6 });
      S.tone({ f: 440 * 1.5, t, a: 0.0008, d: 0.2, peak: 0.22 });
      S.noise({ t, a: 0.0005, d: 0.05, peak: 0.3, f: [['bp', 3500, 1.2]] });
    },
  },
  tom_lo: { len: 0.6, lvl: -13, sr: 'lo', fn(S, t) { S.thump({ t, f0: 150, f1: 98, ft: 0.12, d: 0.5, peak: 1, click: 0.12 }); } },
  tom_hi: { len: 0.5, lvl: -13, fn(S, t) { S.thump({ t, f0: 225, f1: 155, ft: 0.1, d: 0.4, peak: 1, click: 0.12 }); } },
  timpani: {
    len: 2.4, lvl: -12, sr: 'lo',
    fn(S, t) {
      const f = 73.4;
      S.tone({ f: f * 1.04, f1: f, ft: 0.15, t, a: 0.003, d: 2.3, peak: 0.8 });
      S.tone({ f: f * 1.5, t, a: 0.003, d: 1.2, peak: 0.35 });
      S.tone({ f: f * 1.99, t, a: 0.003, d: 0.9, peak: 0.25 });
      S.tone({ f: f * 2.44, t, a: 0.003, d: 0.5, peak: 0.12 });
      S.noise({ t, a: 0.001, d: 0.06, peak: 0.3, f: [['lp', 400]] });
    },
  },
  clank: {
    v: 3, len: 0.6, lvl: -15,
    fn(S, t, _m, v) {
      const f = [340, 470, 610][v % 3];
      S.metal({ t, f, d: 0.42, peak: 1, strike: 0.7, ratios: [1, 2.31, 3.98, 5.67, 7.7, 9.3], dk: 0.72 });
      S.noise({ t, a: 0.0005, d: 0.02, peak: 0.4, f: [['bp', 3000, 1]] });
    },
  },
  anvil: { len: 0.8, lvl: -16, sr: 'hi', fn(S, t) { S.metal({ t, f: 1180, d: 0.7, peak: 1, strike: 0.4, ratios: [1, 2.71, 5.2, 8.1], dk: 0.6 }); } },
  brush_tap: { v: 2, len: 0.18, lvl: -21, fn(S, t) { S.noise({ t, a: 0.003, d: 0.12, peak: 0.6, f: [['bp', 3200, 0.6], ['lp', 8000]] }); } },
  brush_swish: {
    len: 0.42, lvl: -25,
    fn(S, t) { S.noise({ t, pts: [[0, 0], [0.16, 0.5], [0.4, 0.0005, 'e']], f: [['bp', 1800, 0.7, 3400, 0.38]] }); },
  },
  bubble: { len: 0.12, lvl: -20, fn(S, t) { S.bubble({ t, f: 620, rise: 1.9, d: 0.075, peak: 0.6 }); } },
  boom: { len: 1.6, lvl: -11, sr: 'lo', fn(S, t) { S.thump({ t, f0: 72, f1: 32, ft: 0.35, d: 1.45, peak: 1, click: 0, drive: 1.3 }); } },
  revcym: {
    len: 1.6, lvl: -18, sr: 'hi',
    fn(S, t) {
      S.noise({ t, pts: [[0, 0], [0.05, 0.004], [1.45, 0.6, 'e'], [1.5, 0]], f: [['hp', 2500], ['bp', 7000, 0.5]] });
    },
  },
  heart: {
    len: 0.55, lvl: -13, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: 66, f1: 42, ft: 0.06, d: 0.2, peak: 1, click: 0, drive: 1.2 });
      S.thump({ t: t + 0.23, f0: 60, f1: 40, ft: 0.06, d: 0.22, peak: 0.7, click: 0, drive: 1.2 });
    },
  },
};

// ====================================================================== sample / drum playback
function nearestZone(zones, m) {
  let best = zones[0];
  for (const z of zones) if (Math.abs(z - m) < Math.abs(best - m)) best = z;
  return best;
}

/** Play a zone sample. dur=null lets the sample ring out naturally. */
export function playSample(S, inst, midi, t, dur, vel, to, rel = 0.12, detuneCents = 0) {
  const def = SAMPLE_DEFS[inst];
  if (!def || !S.bank) return;
  const z = nearestZone(def.zones, midi);
  const e = S.bank.get('@' + inst + ':' + z);
  if (!e) return;
  const buf = e.bufs[0];
  const rate = Math.pow(2, (midi - z + detuneCents / 100) / 12);
  const src = S.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  S._src(src);
  const g = S.gain(0, to);
  src.connect(g);
  g.gain.setValueAtTime(vel, t);
  let end = t + buf.duration / rate;
  if (dur != null && t + dur + rel < end) {
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    end = t + dur + rel;
  }
  src.start(t);
  src.stop(end + 0.01);
}

export function playDrum(S, name, t, vel, to, rate = 1) {
  const e = S.bank && S.bank.get('@' + name);
  if (!e) return;
  const buf = e.bufs[e.bufs.length > 1 ? Math.floor(S.rng() * e.bufs.length) : 0];
  const src = S.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  S._src(src);
  const g = S.gain(vel, to);
  src.connect(g);
  src.start(t);
  src.stop(t + buf.duration / rate + 0.01);
}

// ====================================================================== guitar (Karplus-Strong)
export function pluck(S, midi, t, dur, vel, to, kind = 'nylon') {
  const ks = ksNote(KS_RATE[kind] || 32000, midi, kind, S.ctx);
  if (!ks) return;
  const src = S.ctx.createBufferSource();
  src.buffer = ks.buf;
  src.playbackRate.value = ks.rate;
  S._src(src);
  const g = S.gain(0, to);
  src.connect(g);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.0015);
  let end = t + ks.buf.duration / ks.rate;
  if (dur != null && t + dur + 0.07 < end) {
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.07);
    end = t + dur + 0.07;
  }
  src.start(t);
  src.stop(end + 0.01);
}

/** Strum a chord. dir 1 = down (low->high), -1 = up. */
export function strum(S, midis, t, dur, vel, to, kind = 'nylon', dir = 1, spread = 0.014) {
  const ns = dir > 0 ? midis : midis.slice().reverse();
  let tt = t;
  for (let i = 0; i < ns.length; i++) {
    pluck(S, ns[i], tt, Math.max(0.03, dur - (tt - t)), vel * (1 - i * 0.04) * S.r(0.85, 1), to, kind);
    tt += spread * S.r(0.7, 1.3);
  }
}

/** Muted percussive strum ("chuck"). */
export function chuck(S, midis, t, vel, to, kind = 'vihuela') {
  for (let i = 0; i < midis.length; i++) pluck(S, midis[i], t + i * 0.006, 0.025, vel * 0.6, to, kind);
  S.noise({ t, a: 0.001, d: 0.03, peak: vel * 0.35, f: [['bp', 2400, 1.1]], to });
}

// ====================================================================== live synth instruments
/** Trumpet: detuned saws + pulse, saturation, envelope-tracking lowpass, scoop & delayed vibrato. */
export function brass(S, midi, t, dur, vel, to, o = {}) {
  const f = mtof(midi);
  dur = Math.max(0.05, dur);
  const a = o.a ?? (0.02 + (1 - vel) * 0.02);
  const r = o.r ?? 0.08;
  const amp = S.gain(0, to);
  const end = envADSR(amp.gain, t, dur, { a, d: 0.12, s: o.s ?? 0.78, r, peak: vel * 0.5 });
  const lpf = S.lp(f * 2, 1.1, amp);
  envADSR(lpf.frequency, t, dur, { a: a * 1.15, d: 0.2, s: 0.62, r, peak: Math.min(f * (2.2 + 5.5 * vel) * (o.bright ?? 1), 9000), base: f * 1.1 });
  const sat = S.shaper(tanhCurve(1.7), lpf, 'none');
  const scoop = o.scoop ?? 40;
  const oscs = [];
  const spec = [['sawtooth', -7, 0.42], ['sawtooth', 7, 0.42], ['~pulse35', 0, 0.28]];
  for (const [type, det, gv] of spec) {
    const g = S.gain(gv, sat);
    const osc = S.osc(type, f, t, end + 0.03, g);
    osc.detune.setValueAtTime(det - scoop, t);
    osc.detune.linearRampToValueAtTime(det, t + 0.05);
    if (o.fall) { osc.detune.setValueAtTime(det, t + dur * 0.6); osc.detune.linearRampToValueAtTime(det - o.fall, t + dur + r); }
    oscs.push(osc);
  }
  if (dur > 0.3 && !o.noVib) {
    const lfo = S.osc('sine', o.vibRate ?? 5.4, t, end + 0.03, null);
    const lg = S.gain(0, null);
    lfo.connect(lg);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * (o.vib ?? 0.0065), t + Math.min(0.5, dur * 0.7));
    for (const osc of oscs) lg.connect(osc.frequency);
  }
}

/** Harmon-muted trumpet (nasal, wah-ish), for the lounge. */
export function mute(S, midi, t, dur, vel, to, o = {}) {
  const f = mtof(midi);
  dur = Math.max(0.05, dur);
  const amp = S.gain(0, to);
  const end = envADSR(amp.gain, t, dur, { a: 0.035, d: 0.15, s: 0.72, r: 0.08, peak: vel * 0.9 });
  const b = S.bp(1500, 2.4, amp);
  envADSR(b.frequency, t, dur, { a: 0.05, d: 0.25, s: 0.6, r: 0.08, peak: o.wah ?? 1000, base: 850 });
  const h = S.hp(450, 0.7, b);
  const oscs = [S.osc('sawtooth', f, t, end + 0.03, h), S.osc('sawtooth', f, t, end + 0.03, h)];
  oscs[0].detune.value = -5; oscs[1].detune.value = 5;
  if (dur > 0.3) {
    const lfo = S.osc('sine', 5.0, t, end + 0.03, null);
    const lg = S.gain(0, null);
    lfo.connect(lg);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur * 0.7));
    for (const osc of oscs) lg.connect(osc.frequency);
  }
}

/** Trombone (optionally sliding from another note). */
export function bone(S, midi, t, dur, vel, to, o = {}) {
  const f = mtof(midi);
  dur = Math.max(0.05, dur);
  const amp = S.gain(0, to);
  const a = o.swell ? dur * o.swell : (o.a ?? 0.045), r = o.swell ? 0.35 : (o.r ?? 0.1);
  const end = envADSR(amp.gain, t, dur, { a, d: 0.15, s: 0.8, r, peak: vel * 0.55 });
  const lpf = S.lp(f * 2, 1.0, amp);
  envADSR(lpf.frequency, t, dur, { a: a * 1.2, d: 0.2, s: 0.7, r, peak: Math.min(f * (1.8 + 3.5 * vel), 4000), base: f * 1.2 });
  if (o.wah) { // plunger wah: periodic filter opening
    const w = S.lfo(o.wah, f * 1.2, lpf.frequency, t, end);
    w.g.gain.setValueAtTime(0, t); w.g.gain.linearRampToValueAtTime(f * 1.2, t + 0.15);
  }
  const sat = S.shaper(tanhCurve(1.4), lpf, 'none');
  const oscs = [];
  for (const det of [-5, 5]) {
    const osc = S.osc('sawtooth', o.from ? mtof(o.from) : f, t, end + 0.03, sat);
    osc.detune.value = det;
    if (o.from) osc.frequency.exponentialRampToValueAtTime(f, t + (o.slide ?? 0.12));
    if (o.fall) { osc.frequency.setValueAtTime(f, t + dur * 0.55); osc.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -o.fall / 12), t + dur + 0.1); }
    oscs.push(osc);
  }
  if (dur > 0.35) {
    const lfo = S.osc('sine', o.vibRate ?? 4.8, t, end + 0.03, null);
    const lg = S.gain(0, null);
    lfo.connect(lg);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * (o.vib ?? 0.008), t + Math.min(0.6, dur * 0.8));
    for (const osc of oscs) lg.connect(osc.frequency);
  }
}

/** Accordion: musette-detuned reed pair (+ optional low reed), nasal peak. */
export function accordion(S, midi, t, dur, vel, to, o = {}) {
  const f = mtof(midi);
  const amp = S.gain(0, to);
  const end = envADSR(amp.gain, t, Math.max(0.04, dur), { a: 0.016, d: 0.08, s: 0.85, r: 0.06, peak: vel * 0.3 });
  const pk = S.filter('peaking', 1300, 1.0, amp, 5);
  const lpf = S.lp(Math.min(4500, f * 9), 0.6, pk);
  for (const det of [-8, 8]) { const osc = S.osc('~reed', f, t, end + 0.02, lpf); osc.detune.value = det; }
  if (o.low) { const g = S.gain(0.4, lpf); S.osc('~reed', f / 2, t, end + 0.02, g); }
}

/** Combo organ (sonidero cumbia lead). */
export function organ(S, midi, t, dur, vel, to) {
  const f = mtof(midi);
  const amp = S.gain(0, to);
  const end = envADSR(amp.gain, t, Math.max(0.04, dur), { a: 0.008, d: 0.06, s: 0.9, r: 0.05, peak: vel * 0.32 });
  const lpf = S.lp(3800, 0.6, amp);
  const osc = S.osc('~organ', f, t, end + 0.02, lpf);
  if (dur > 0.2) {
    const v = S.lfo(6.2, f * 0.0045, osc.frequency, t, end + 0.02);
    v.g.gain.setValueAtTime(0, t); v.g.gain.linearRampToValueAtTime(f * 0.0045, t + 0.2);
  }
}

/** Oom-pah tuba / sousaphone. */
export function tuba(S, midi, t, dur, vel, to) {
  const f = mtof(midi);
  const amp = S.gain(0, to);
  const end = envADSR(amp.gain, t, Math.max(0.05, dur), { a: 0.022, d: 0.14, s: 0.6, r: 0.07, peak: vel * 0.6 });
  const lpf = S.lp(f * 3, 0.8, amp);
  envADSR(lpf.frequency, t, Math.max(0.05, dur), { a: 0.03, d: 0.15, s: 0.5, r: 0.07, peak: Math.min(f * 4, 1300), base: f * 1.5 });
  S.osc('~soft', f, t, end + 0.02, lpf);
  const g = S.gain(0.5, lpf);
  S.osc('triangle', f, t, end + 0.02, g);
}

/** Warm detuned pad chord. */
export function pad(S, midis, t, dur, vel, to, o = {}) {
  const cut = o.cut ?? 1200;
  const lpf = S.lp(cut, o.q ?? 0.5, to);
  const amp = S.gain(0, lpf);
  const end = envADSR(amp.gain, t, dur, { a: o.a ?? 0.8, d: 0.6, s: 0.8, r: o.r ?? 1.3, peak: vel * 0.3 / Math.sqrt(midis.length) });
  for (const m of midis) {
    const f = mtof(m);
    for (const det of [-9, 9]) {
      const g = S.gain(0.5, amp);
      const osc = S.osc(o.wave ?? 'sawtooth', f, t, end + 0.05, g);
      osc.detune.value = det + S.r(-3, 3);
    }
  }
  if (o.sweep) S.lfo(o.sweep, cut * 0.35, lpf.frequency, t, end + 0.05);
}

/** Inharmonic struck bell (tubular / church-ish). */
export function bell(S, midi, t, dur, vel, to, o = {}) {
  const k = o.len ?? 1;
  S.modal({
    t, f: mtof(midi), to, peak: vel * 0.35,
    ratios: [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166],
    amps: [0.25, 1, 0.45, 0.3, 0.35, 0.12, 0.1, 0.08, 0.05],
    decays: [3, 2.2, 1.6, 1.2, 1.0, 0.6, 0.5, 0.4, 0.25].map((x) => x * k),
  });
}

// ====================================================================== sequencer instrument table
function each(ev, fn) {
  if (ev.midis) for (const m of ev.midis) fn(m);
  else if (ev.midi != null) fn(ev.midi);
}

function guitar(S, ev, t, dur, vel, to, kind) {
  switch (ev.kind) {
    case 'x': chuck(S, ev.midis, t, vel, to, kind); break;
    case 'U': case 'u': strum(S, ev.midis.slice(-4), t, dur, vel, to, kind, -1, 0.011); break;
    case 'D': case 'd': strum(S, ev.midis, t, dur, vel, to, kind, 1, kind === 'nylon' ? 0.018 : 0.012); break;
    default: each(ev, (m) => pluck(S, m, t, dur, vel, to, kind));
  }
}

export const INST = {
  nylon: (S, ev, t, dur, vel, to) => guitar(S, ev, t, dur, vel, to, 'nylon'),
  vihuela: (S, ev, t, dur, vel, to) => guitar(S, ev, t, dur, vel, to, 'vihuela'),
  requinto: (S, ev, t, dur, vel, to) => guitar(S, ev, t, dur, vel, to, 'requinto'),
  marimba: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'marimba', m, t, null, vel, to)),
  vibes: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'vibes', m, t, dur + 0.45, vel, to, 0.35)),
  musicbox: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => playSample(S, 'musicbox', m, t, null, vel, to, 0.1, (ch && ch.detune ? S.r(-ch.detune, ch.detune) : 0))),
  ubass: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'ubass', m, t, dur, vel, to, 0.06)),
  ebass: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'ebass', m, t, dur, vel, to, 0.05)),
  dbass: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'dbass', m, t, dur, vel, to, 0.04)),
  epiano: (S, ev, t, dur, vel, to) => each(ev, (m) => playSample(S, 'epiano', m, t, dur + 0.15, vel, to, 0.25)),
  brass: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => brass(S, m, t, dur, vel, to, ch && ch.opts)),
  mute: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => mute(S, m, t, dur, vel, to, ch && ch.opts)),
  bone: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => bone(S, m, t, dur, vel, to, ch && ch.opts)),
  accordion: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => accordion(S, m, t, dur, vel, to, ch && ch.opts)),
  organ: (S, ev, t, dur, vel, to) => each(ev, (m) => organ(S, m, t, dur, vel, to)),
  tuba: (S, ev, t, dur, vel, to) => each(ev, (m) => tuba(S, m, t, dur, vel, to)),
  bell: (S, ev, t, dur, vel, to, ch) => each(ev, (m) => bell(S, m, t, dur, vel, to, ch && ch.opts)),
  pad: (S, ev, t, dur, vel, to, ch) => pad(S, ev.midis || [ev.midi], t, dur, vel, to, ch && ch.opts),
  drum: (S, ev, t, dur, vel, to) => playDrum(S, ev.drum, t, vel, to, ev.rate || 1),
  bubble: (S, ev, t, dur, vel, to) => playDrum(S, 'bubble', t, vel, to, ev.rate || Math.pow(2, ((ev.midi ?? 76) - 76) / 12)),
};

/** Bank keys an instrument depends on (for music readiness). */
export function depsFor(inst, drums) {
  if (SAMPLE_DEFS[inst]) return SAMPLE_DEFS[inst].zones.map((z) => '@' + inst + ':' + z);
  if (inst === 'drum') return [...drums].map((d) => '@' + d);
  if (inst === 'bubble') return ['@bubble'];
  return [];
}
