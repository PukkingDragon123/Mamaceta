// Mantis Mayhem audio — musical stingers (pre-rendered one-shots, played through Audio.stinger()).
// They use the same instruments as the music (drum samples from the bank, KS guitars, live brass).

import { mtof } from './dsp.js';
import { envPoints } from './synth.js';
import { brass, bone, pad, bell, strum, playDrum, playSample } from './instruments.js';

const D = (S, name, t, vel = 1) => playDrum(S, name, t, vel, S.out);

/** Snare roll (32nd notes) with crescendo. */
function roll(S, t, dur, v0 = 0.15, v1 = 0.6, rate = 0.045) {
  for (let x = 0; x < dur; x += rate) D(S, 'snare', t + x, v0 + (v1 - v0) * (x / dur));
}

export const STINGERS = {
  stinger_round: { lvl: -12, len: 2.6, rev: 0.22,
    fn(S, t) {
      roll(S, t, 0.36, 0.12, 0.5, 0.04);
      const h = t + 0.4;
      D(S, 'kick_hard', h, 1); D(S, 'timpani', h, 0.9); D(S, 'crash', h, 0.8); D(S, 'snare_hard', h, 0.7);
      // "ta-ta-TAAA" trumpets in octaves/thirds
      brass(S, 69, t + 0.0, 0.11, 0.8, S.out, { scoop: 20, noVib: 1 });
      brass(S, 69, t + 0.2, 0.11, 0.85, S.out, { scoop: 20, noVib: 1 });
      for (const m of [62, 66, 69, 74]) brass(S, m, h, 1.15, 0.95, S.out, { scoop: 50, vibRate: 6, vib: 0.008 });
      D(S, 'tom_lo', h + 1.2, 0.5);
    } },

  stinger_fight: { lvl: -11, len: 1.9, rev: 0.22,
    fn(S, t) {
      D(S, 'kick_hard', t, 1); D(S, 'snare_hard', t, 0.9); D(S, 'boom', t, 0.8);
      for (const m of [65, 69, 72, 77]) brass(S, m, t, 0.16, 1, S.out, { scoop: 120, noVib: 1, bright: 1.2 });
      const h = t + 0.24;
      D(S, 'kick_hard', h, 1); D(S, 'crash', h, 0.9); D(S, 'snare_hard', h, 1); D(S, 'clap', h, 0.7);
      for (const m of [67, 71, 74, 79]) brass(S, m, h, 0.55, 1, S.out, { scoop: 90, fall: 180, bright: 1.2, vibRate: 6.5 });
    } },

  stinger_ko: { lvl: -12, len: 4.6, rev: 0.25,
    fn(S, t) {
      D(S, 'boom', t, 1); D(S, 'timpani', t, 0.9); D(S, 'kick_hard', t, 1);
      // gong: inharmonic partials, upper ones "bloom" after the strike
      const f = 92;
      const ratios = [1, 1.47, 1.83, 2.24, 2.78, 3.31, 3.98, 4.62, 5.37, 6.2, 7.1, 8.3];
      ratios.forEach((r, i) => {
        const bloom = i < 3 ? 0.004 : 0.08 + i * 0.05;
        const peak = (i < 3 ? 0.5 : 0.3) / (1 + i * 0.15);
        S.tone({ f: f * r * S.jit(1, 0.004), t, pts: [[0, 0], [bloom, peak], [bloom + 3.6 * Math.pow(0.9, i), peak * 0.001, 'e']] });
      });
      S.noise({ t, pts: [[0, 0], [0.3, 0.12], [3.2, 0.0001, 'e']], f: [['bp', 2600, 0.8], ['hp', 1500]] });
      S.noise({ t, a: 0.001, d: 0.08, peak: 0.6, f: [['lp', 1200]] });
    } },

  stinger_victory: { lvl: -12, len: 3.8, rev: 0.22,
    fn(S, t) {
      const e = 0.13; // eighth note
      // trumpet 1 + trumpet 2 a diatonic third below (D major)
      const lead = [[69, 0, 1], [74, 1, 1], [78, 2, 1], [81, 3, 3], [78, 6, 1], [81, 7, 1], [83, 8, 2], [81, 10, 1], [86, 12, 12]];
      const harm = [[66, 0, 1], [69, 1, 1], [74, 2, 1], [78, 3, 3], [74, 6, 1], [78, 7, 1], [79, 8, 2], [78, 10, 1], [81, 12, 12]];
      for (const [m, s, l] of lead) brass(S, m, t + s * e, l * e * 0.92, 0.95, S.out, { scoop: 35, vibRate: 6.2, vib: 0.009 });
      for (const [m, s, l] of harm) brass(S, m, t + s * e, l * e * 0.92, 0.8, S.out, { scoop: 35, vibRate: 6.0, vib: 0.009 });
      // vihuela + guitar strums: D | A7 | D
      const Dm = [50, 57, 62, 66, 69, 74], A7 = [45, 52, 57, 61, 67, 69];
      [[0, Dm, 1], [2, Dm, -1], [3, Dm, 1], [6, A7, 1], [7, A7, -1], [8, A7, 1], [10, A7, -1]].forEach(([s, c, d]) => strum(S, c, t + s * e, e * 1.6, 0.55, S.out, 'vihuela', d, 0.009));
      strum(S, Dm, t + 12 * e, 1.6, 0.7, S.out, 'vihuela', 1, 0.012);
      strum(S, Dm, t + 12 * e, 1.8, 0.6, S.out, 'nylon', 1, 0.02);
      // bass + drums
      [[0, 38], [3, 45], [6, 45], [8, 40], [12, 38]].forEach(([s, m]) => playSample(S, 'ubass', m, t + s * e, e * 2.5, 0.8, S.out));
      roll(S, t + 8 * e, 4 * e, 0.15, 0.55, 0.033);
      D(S, 'kick', t, 0.8); D(S, 'kick', t + 6 * e, 0.7);
      D(S, 'kick_hard', t + 12 * e, 1); D(S, 'crash', t + 12 * e, 0.8); D(S, 'timpani', t + 12 * e, 0.7);
    } },

  stinger_perfect: { lvl: -13, len: 2.6, rev: 0.3,
    fn(S, t) {
      [84, 88, 91, 96, 100, 103].forEach((m, i) => playSample(S, 'vibes', m, t + i * 0.055, null, 0.65, S.out));
      pad(S, [60, 64, 67, 71, 74], t + 0.1, 1.2, 0.8, S.out, { a: 0.25, r: 1.0, cut: 3200 });
      bell(S, 96, t + 0.35, 1, 0.5, S.out, { len: 0.8 });
      S.sparkle({ t: t + 0.1, n: 10, spread: 1.0, fmin: 3000, fmax: 9000, peak: 0.08, fade: 1 });
      D(S, 'crash', t + 0.35, 0.35);
    } },

  stinger_timeup: { lvl: -12, len: 2.6, rev: 0.22,
    fn(S, t) {
      bell(S, 84, t, 1, 0.5, S.out, { len: 0.7 });
      bell(S, 84, t + 0.16, 1, 0.4, S.out, { len: 0.7 });
      [[67, 0.35, 0.18], [64, 0.6, 0.18], [60, 0.85, 1.1]].forEach(([m, s, l], i) => {
        for (const o of [0, -12]) brass(S, m + o, t + s, l, 0.9, S.out, { scoop: 30, fall: i === 2 ? 60 : 0, vibRate: 5 });
        D(S, 'timpani', t + s, 0.7); D(S, 'kick', t + s, 0.6);
      });
      D(S, 'crash', t + 0.85, 0.5);
    } },

  stinger_demon: { lvl: -12, len: 3.4, rev: 0.35,
    fn(S, t) {
      D(S, 'boom', t, 1); D(S, 'kick_hard', t, 0.8);
      for (const m of [36, 37, 42, 43, 48]) bone(S, m, t, 1.4, 0.8, S.out, { vibRate: 7, vib: 0.02 });
      const g = S.gain(0.5);
      [[95, 0.5], [101, 0.9], [96, 1.25], [90, 1.7]].forEach(([m, dt]) => playSample(S, 'musicbox', m, t + dt, null, 0.7, g, 0.1, S.r(-45, 45)));
      S.noise({ t, pts: [[0, 0], [0.02, 0.3], [2.5, 0.0001, 'e']], color: 'pink', f: [['lp', 500]] });
      S.tone({ type: 'sawtooth', f: 65.4, f1: 61.7, ft: 2.5, t, a: 0.05, d: 2.6, peak: 0.2, to: S.lp(300) });
    } },

  stinger_ult: { lvl: -11, len: 2.3, rev: 0.25,
    fn(S, t) {
      D(S, 'crash', t, 0.9); D(S, 'kick_hard', t, 1); D(S, 'boom', t, 0.7);
      S.noise({ t, a: 0.002, d: 0.4, peak: 0.4, f: [['bp', 2500, 3, 9000, 0.15], ['hp', 2000]] });
      const lpf = S.lp(400, 3);
      envPoints(lpf.frequency, t, [[0, 400], [0.3, 7500, 'e'], [1.6, 1200, 'e']]);
      const g = S.gain(0, lpf);
      envPoints(g.gain, t, [[0, 0], [0.01, 0.22], [0.4, 0.16], [1.9, 0.0002, 'e']]);
      for (const m of [52, 59, 64, 68, 71, 78]) for (const dt of [-12, 0, 12]) { const o = S.osc('sawtooth', mtof(m), t, t + 2, g); o.detune.value = dt; }
      S.tone({ f: 110, f1: 40, ft: 0.8, t, a: 0.01, d: 1.0, peak: 0.6, to: S.drive(2) });
    } },

  stinger_purchase: { lvl: -14, len: 1.7, rev: 0.2,
    fn(S, t) {
      const e = 0.085;
      [[79, 0], [81, 1], [83, 2], [86, 3], [91, 5]].forEach(([m, s]) => playSample(S, 'marimba', m, t + s * e, null, s === 5 ? 1 : 0.75, S.out));
      D(S, 'cowbell', t + 5 * e, 0.4); D(S, 'claves', t + 3 * e, 0.4);
      bell(S, 91, t + 6.5 * e, 1, 0.35, S.out, { len: 0.5 });
      bell(S, 98, t + 7.5 * e, 1, 0.3, S.out, { len: 0.5 });
      playSample(S, 'ubass', 43, t + 5 * e, 0.3, 0.6, S.out);
    } },

  stinger_lose: { lvl: -13, len: 3.4, rev: 0.2,
    fn(S, t) {
      const n = [[58, 0, 0.36], [57, 0.45, 0.36], [56, 0.9, 0.36]];
      for (const [m, s, l] of n) bone(S, m, t + s, l, 0.85, S.out, { vib: 0.004 });
      bone(S, 55, t + 1.35, 1.35, 0.9, S.out, { wah: 5.5, vibRate: 5.5, vib: 0.018, fall: 1 });
      D(S, 'kick_soft', t + 1.35, 0.5);
    } },
};
