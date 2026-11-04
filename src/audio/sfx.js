// Mantis Mayhem audio — one-shot SFX recipes.
// Each recipe renders (offline, once, at init) into an AudioBuffer which is then loudness-normalised.
//   lvl : target loudness = max 50 ms RMS in dBFS (hits/booms loudest, UI ticks quiet)
//   v   : number of variants (different seeds)      len : render length in seconds
//   rev : reverb send at playback                    jit : random pitch jitter (default 0.04 if v>1)
//   sr  : 'lo' (22.05 kHz) | 'hi' (context rate) | default 32 kHz      ch: 2 for stereo renders
//   ui  : immune to slow-motion pitch bend           prio: voice-stealing priority (higher survives)

import { mtof, makeIR } from './dsp.js';
import { envPoints, glide } from './synth.js';
import { SAMPLE_DEFS, brass, mute, bone } from './instruments.js';

/** Clean decaying mallet/bell note for jingles (no bank dependency). */
function chime(S, m, t, peak, to, len = 1) {
  S.modal({ t, f: mtof(m), ratios: [1, 2.0, 3.01, 4.2], amps: [1, 0.3, 0.12, 0.06], decays: [0.9 * len, 0.45 * len, 0.25 * len, 0.12 * len], peak, to });
}

/** Detuned-saw chord stab with closing filter. */
function stab(S, midis, t, peak, d = 0.3, open = 6500, close = 900, to) {
  const lpf = S.lp(open, 2, to);
  envPoints(lpf.frequency, t, [[0, open], [d * 0.85, close, 'e']]);
  const g = S.gain(0, lpf);
  envPoints(g.gain, t, [[0, 0], [0.004, peak], [d, peak * 0.003, 'e']]);
  for (const m of midis) for (const dt of [-10, 10]) { const o = S.osc('sawtooth', mtof(m), t, t + d + 0.02, g); o.detune.value = dt; }
}

/** Tremolo-shimmer pair of high partials. */
function shimmer(S, f, t, dur, peak, rate = 15) {
  const trem = S.gain(0.6);
  S.lfo(rate, 0.4, trem.gain, t, t + dur + 0.02);
  const sh = S.gain(0, trem);
  envPoints(sh.gain, t, [[0, 0], [Math.min(0.3, dur * 0.25), peak], [dur, peak * 0.002, 'e']]);
  S.osc('sine', f, t, t + dur + 0.02, sh);
  S.osc('sine', f * 1.0065, t, t + dur + 0.02, sh);
}

/** Glass shards: many short high pings. */
function shards(S, t, n, spread, peak, fmin = 2500, fmax = 8000, panW = 0) {
  for (let i = 0; i < n; i++) {
    const x = Math.pow(S.rng(), 1.5);
    const to = panW && S.hasPanner ? S.pan(S.r(-panW, panW)) : undefined;
    S.modal({ t: t + x * spread, f: S.r(fmin, fmax), ratios: [1, 2.7], amps: [1, 0.3], decays: [S.r(0.04, 0.18), 0.03], peak: S.r(0.4, 1) * peak * (1 - x * 0.6), to });
  }
}

export const SFX = {
  // ================================================================== UI
  ui_move: { lvl: -29, v: 3, len: 0.07, rev: 0.04, ui: 1, jit: 0.03, sr: 'hi',
    fn(S, t) { S.wood({ t, f: S.r(1750, 1950), d: 0.035, peak: 1, click: 0.35 }); } },

  ui_select: { lvl: -24, v: 2, len: 0.16, rev: 0.06, ui: 1, jit: 0.02,
    fn(S, t) {
      S.wood({ t, f: 720, d: 0.07, peak: 0.9, click: 0.4 });
      S.bubble({ t: t + 0.035, f: 520, rise: 2.4, d: 0.07, peak: 0.55 });
      S.noise({ t: t + 0.035, a: 0.0005, d: 0.006, peak: 0.12, f: [['bp', 3000, 1]] });
    } },

  ui_back: { lvl: -26, len: 0.2, rev: 0.05, ui: 1, jit: 0.02, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: 210, f1: 110, ft: 0.06, d: 0.16, peak: 1, click: 0.04 });
      S.noise({ t, a: 0.004, d: 0.08, peak: 0.25, color: 'pink', f: [['lp', 900]] });
      S.bubble({ t: t + 0.02, f: 480, rise: 0.6, d: 0.06, peak: 0.25 });
    } },

  ui_error: { lvl: -23, len: 0.32, rev: 0.04, ui: 1, jit: 0,
    fn(S, t) {
      S.wood({ t, f: 230, d: 0.09, peak: 0.9, click: 0.3 });
      const l = S.lp(1100, 0.8);
      const pts = [[0, 0], [0.006, 0.25], [0.07, 0.25], [0.08, 0], [0.11, 0], [0.116, 0.22], [0.2, 0.22], [0.235, 0]];
      S.tone({ type: 'square', f: 116, t: t + 0.03, pts, to: l });
      S.tone({ type: 'square', f: 123, t: t + 0.03, pts, to: l });
    } },

  ui_tab: { lvl: -26.5, v: 2, len: 0.16, rev: 0.05, ui: 1,
    fn(S, t) {
      S.noise({ t, a: 0.03, d: 0.09, peak: 0.6, color: 'pink', f: [['bp', 900, 1.4, 2600, 0.1], ['lp', 5000]] });
      S.wood({ t: t + 0.1, f: 1300, d: 0.03, peak: 0.35, click: 0.2 });
    } },

  ui_type: { lvl: -29, v: 4, len: 0.06, rev: 0.02, ui: 1, jit: 0.05, sr: 'hi',
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.8, f: [['hp', 2500]] });
      S.tone({ f: S.r(2900, 3500), t, a: 0.0004, d: 0.02, peak: 0.25 });
      S.tone({ f: S.r(280, 340), t, a: 0.0006, d: 0.025, peak: 0.5 });
      S.noise({ t: t + S.r(0.018, 0.026), a: 0.0004, d: 0.005, peak: 0.3, f: [['bp', 1800, 1.2]] });
    } },

  ui_coin: { lvl: -24, v: 3, len: 0.35, rev: 0.1, ui: 1, jit: 0.02, sr: 'hi',
    fn(S, t) {
      const f = S.r(2400, 2800);
      S.modal({ t, f, ratios: [1, 2.32, 3.71, 5.1], amps: [1, 0.45, 0.25, 0.12], decays: [0.28, 0.14, 0.08, 0.05], peak: 0.8 });
      S.noise({ t, a: 0.0004, d: 0.005, peak: 0.25, f: [['hp', 3000]] });
    } },

  ui_coins: { lvl: -23, len: 1.3, ch: 2, rev: 0.12, ui: 1, jit: 0, sr: 'hi',
    fn(S, t) {
      const n = 16, set = [2349, 2637, 2960, 3136, 3520];
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        const tt = t + Math.pow(x, 1.35) * 0.95 + S.r(-0.008, 0.008);
        const p = S.pan(S.r(-0.5, 0.5));
        S.modal({ t: Math.max(t, tt), f: S.pick(set) * S.jit(1, 0.015), ratios: [1, 2.32, 3.71], amps: [1, 0.4, 0.2], decays: [0.22, 0.1, 0.06], peak: (0.9 - x * 0.45) * S.r(0.7, 1), to: p });
        S.noise({ t: Math.max(t, tt), a: 0.0004, d: 0.004, peak: 0.12, f: [['hp', 3500]], to: p });
      }
    } },

  ui_purchase: { lvl: -19, len: 1.5, rev: 0.2, ui: 1, jit: 0,
    fn(S, t) {
      S.noise({ t, a: 0.001, d: 0.05, peak: 0.7, f: [['bp', 2200, 1.2]] });
      S.metal({ t, f: 900, d: 0.12, peak: 0.35, strike: 0.3, n: 4 });
      S.noise({ t: t + 0.04, a: 0.02, d: 0.12, peak: 0.35, color: 'pink', f: [['bp', 1200, 2, 600, 0.15]] });
      S.wood({ t: t + 0.17, f: 380, d: 0.06, peak: 0.5 });
      const tb = t + 0.18;
      S.modal({ t: tb, f: 1975, ratios: [1, 2.0, 2.76, 4.1, 5.4], amps: [1, 0.35, 0.3, 0.12, 0.08], decays: [1.1, 0.6, 0.5, 0.25, 0.15], peak: 0.7 });
      S.modal({ t: tb + 0.005, f: 2637, ratios: [1, 2.76], amps: [0.6, 0.2], decays: [0.8, 0.3], peak: 0.5 });
      S.tone({ f: 3951, t: tb, a: 0.002, d: 0.7, peak: 0.06, vib: { rate: 5, depth: 0.004 } });
      S.bubbles({ t: tb + 0.05, n: 5, spread: 0.4, fmin: 700, fmax: 1600, peak: 0.12 });
    } },

  ui_locker_open: { lvl: -20, len: 1.0, rev: 0.2, ui: 1, jit: 0.02,
    fn(S, t) {
      S.metal({ t, f: 1300, d: 0.05, peak: 0.4, strike: 0.5, n: 3 });
      const r = S.res([[620, 14, 1], [1340, 18, 0.7], [2450, 16, 0.4]]);
      S.pulses({ t: t + 0.04, dur: 0.38, rate: (x) => 55 + 70 * x, amp: (x) => Math.sin(Math.PI * x), jit: 0.1, peak: 5, to: r });
      S.metal({ t: t + 0.45, f: 310, d: 0.5, peak: 0.8, strike: 0.6, bright: 0.8 });
      S.thump({ t: t + 0.45, f0: 140, f1: 80, d: 0.12, peak: 0.4, click: 0 });
    } },

  ui_locker_close: { lvl: -19, len: 0.8, rev: 0.2, ui: 1, jit: 0.02,
    fn(S, t) {
      S.whoosh({ t, d: 0.12, f0: 300, f1: 900, q: 1, peak: 0.25 });
      S.metal({ t: t + 0.11, f: 280, d: 0.45, peak: 1, strike: 0.8, bright: 0.9 });
      S.thump({ t: t + 0.11, f0: 160, f1: 70, d: 0.15, peak: 0.6, click: 0.2 });
      S.metal({ t: t + 0.16, f: 1500, d: 0.05, peak: 0.25, strike: 0.4, n: 3 });
      S.grains({ t: t + 0.12, dur: 0.15, rate: 120, glen: 0.002, peak: 0.25, f: [['bp', 2500, 2]] });
    } },

  ui_door_creak: { lvl: -22, len: 2.4, rev: 0.35, ui: 1, jit: 0, sr: 'lo',
    fn(S, t) {
      const r = S.res([[180, 10, 1.2], [410, 12, 1], [870, 14, 0.7], [1650, 12, 0.35]]);
      S.pulses({
        t, dur: 2.2, width: 0.0008, jit: 0.18, peak: 6, to: r,
        rate: (x) => 18 + 30 * Math.pow(Math.sin(x * 9.4), 2) + 22 * x,
        amp: (x) => Math.min(1, x * 6) * (1 - Math.pow(x, 3)) * (0.6 + 0.4 * Math.sin(x * 23)),
      });
      S.tone({ f: 640, t: t + 0.2, a: 0.4, d: 1.4, hold: 0.2, peak: 0.05, vib: { rate: 3.2, depth: 0.012 } });
      S.noise({ t, a: 0.3, d: 1.8, hold: 0.2, peak: 0.3, color: 'brown', f: [['lp', 160]] });
    } },

  ui_door_slam: { lvl: -14, len: 2.0, rev: 0.45, ui: 1, jit: 0, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: 85, f1: 34, ft: 0.25, d: 1.2, peak: 1, click: 0.3, drive: 1.5 });
      S.metal({ t, f: 112, d: 1.4, peak: 0.8, strike: 0.9, bright: 0.7, dk: 0.85 });
      S.noise({ t, a: 0.002, d: 0.35, peak: 0.5, color: 'brown', f: [['lp', 500]] });
      S.noise({ t, a: 0.001, d: 0.06, peak: 0.4, f: [['bp', 1800, 0.8]] });
      S.grains({ t: t + 0.03, dur: 0.4, rate: 90, glen: 0.003, peak: 0.12, f: [['bp', 1400, 3]] });
    } },

  ui_whoosh: { lvl: -22, v: 2, len: 0.8, rev: 0.25, ui: 1,
    fn(S, t) {
      S.whoosh({ t, d: 0.45, f0: 280, f1: 1900, f2: 600, q: 1.1, peak: 1, att: 0.5 });
      S.whoosh({ t: t + 0.02, d: 0.4, f0: 600, f1: 3200, f2: 1200, q: 2, peak: 0.35, att: 0.5, color: 'white' });
      S.bubbles({ t: t + 0.18, n: 9, spread: 0.45, fmin: 450, fmax: 1500, peak: 0.25, fade: 1 });
    } },

  ui_lock_in: { lvl: -16.5, len: 1.4, rev: 0.3, ui: 1, jit: 0, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: 130, f1: 48, ft: 0.06, d: 0.35, peak: 1, click: 0.4, drive: 2 });
      S.noise({ t, a: 0.0008, d: 0.05, peak: 0.6, f: [['bp', 1400, 0.9]] });
      S.metal({ t, f: 190, d: 0.4, peak: 0.35, strike: 0.3 });
      [[81, 0.02], [85, 0.035], [88, 0.05], [93, 0.065]].forEach(([m, dl]) => chime(S, m, t + dl, 0.28));
      S.sparkle({ t: t + 0.06, n: 5, spread: 0.3, fmin: 3000, fmax: 7000, peak: 0.08 });
    } },

  ui_timer_tick: { lvl: -25.5, v: 2, len: 0.07, rev: 0.05, ui: 1, jit: 0.01, sr: 'hi',
    fn(S, t, _p, v) {
      S.wood({ t, f: v ? 1700 : 2300, d: 0.03, peak: 1, click: 0.5 });
      S.tone({ f: v ? 3400 : 4600, t, a: 0.0004, d: 0.01, peak: 0.2 });
    } },

  ui_vote: { lvl: -23, v: 2, len: 0.5, rev: 0.2, ui: 1,
    fn(S, t) {
      S.metal({ t, f: S.r(480, 560), d: 0.32, peak: 1, strike: 0.7, n: 6 });
      S.thump({ t, f0: 200, f1: 120, d: 0.06, peak: 0.3, click: 0 });
    } },

  ui_roulette: { lvl: -28.5, v: 3, len: 0.05, rev: 0.03, ui: 1, jit: 0.03, sr: 'hi',
    fn(S, t) {
      S.wood({ t, f: S.r(1400, 1600), d: 0.02, peak: 1, click: 0.6 });
      S.tone({ f: 3000, t, a: 0.0003, d: 0.008, peak: 0.2 });
    } },

  ui_rope: { lvl: -26, v: 2, len: 0.6, rev: 0.12, ui: 1,
    fn(S, t) {
      const r = S.res([[480, 6, 1], [950, 7, 0.6], [1900, 5, 0.3]]);
      S.pulses({ t, dur: 0.45, rate: (x) => 70 + 50 * Math.sin(x * Math.PI), amp: (x) => Math.sin(Math.PI * x), jit: 0.25, peak: 4, to: r, width: 0.0006 });
      S.noise({ t, a: 0.1, d: 0.3, peak: 0.08, color: 'pink', f: [['bp', 1200, 1]] });
    } },

  ui_equip: { lvl: -22.5, len: 0.8, rev: 0.2, ui: 1, jit: 0.01,
    fn(S, t) {
      S.grains({ t, dur: 0.22, rate: 400, glen: 0.0015, peak: 0.6, amp: (x) => Math.sin(Math.PI * Math.min(1, x * 1.3)), f: [['bp', 2600, 0.8], ['lp', 6000]] });
      S.noise({ t, a: 0.05, d: 0.15, peak: 0.25, color: 'pink', f: [['bp', 1500, 0.8]] });
      S.sparkle({ t: t + 0.15, n: 5, spread: 0.3, fmin: 2600, fmax: 5200, peak: 0.25, rising: true, d: 0.35 });
    } },

  ui_levelup: { lvl: -19, len: 1.7, rev: 0.25, ui: 1, jit: 0,
    fn(S, t) {
      [72, 76, 79, 84].forEach((m, i) => SAMPLE_DEFS.marimba.fn(S.with(S.gain(0.7)), t + i * 0.075, m));
      for (const m of [72, 76, 79, 84]) brass(S, m, t + 0.3, 0.55, 0.75, S.out, { scoop: 20 });
      S.sparkle({ t: t + 0.3, n: 6, spread: 0.5, fmin: 2500, fmax: 6000, peak: 0.1 });
    } },

  ui_challenge: { lvl: -20.5, len: 2.0, rev: 0.3, ui: 1, jit: 0,
    fn(S, t) {
      [[79, 0], [84, 0.09], [88, 0.18], [91, 0.27]].forEach(([m, dt], i) => SAMPLE_DEFS.vibes.fn(S.with(S.gain(i === 3 ? 0.8 : 0.6)), t + dt, m));
      S.sparkle({ t: t + 0.27, n: 7, spread: 0.6, fmin: 3000, fmax: 8000, peak: 0.1, fade: 1 });
    } },

  ui_pop: { lvl: -26, v: 3, len: 0.09, rev: 0.05, ui: 1, jit: 0.04,
    fn(S, t) {
      S.bubble({ t, f: S.r(480, 560), rise: 2.2, d: 0.045, peak: 0.8 });
      S.noise({ t, a: 0.0003, d: 0.004, peak: 0.2, f: [['bp', 3500, 1]] });
    } },

  ui_paper: { lvl: -26.5, v: 2, len: 0.4, rev: 0.05, ui: 1,
    fn(S, t) {
      S.grains({ t, dur: 0.3, rate: (x) => 60 + 140 * Math.sin(Math.PI * x), glen: 0.003, peak: 0.7, amp: (x) => Math.sin(Math.PI * x), f: [['bp', 3000, 0.7], ['hp', 900]] });
      S.noise({ t, a: 0.05, d: 0.2, peak: 0.2, f: [['bp', 4500, 1]] });
    } },

  // ================================================================== combat: movement
  whiff_light: { lvl: -25, v: 3, len: 0.25, rev: 0.08,
    fn(S, t) {
      S.whoosh({ t, d: S.r(0.14, 0.18), f0: S.r(380, 480), f1: S.r(1400, 1800), q: 1.3, peak: 1, att: 0.42, lp: 3500 });
      S.tone({ f: 170, f1: 110, t, a: 0.02, d: 0.08, peak: 0.12 });
    } },

  whiff_heavy: { lvl: -23, v: 3, len: 0.45, rev: 0.1,
    fn(S, t) {
      S.whoosh({ t, d: S.r(0.28, 0.34), f0: 220, f1: S.r(800, 1000), q: 1.0, peak: 1, att: 0.5, color: 'pink', lp: 2500 });
      S.whoosh({ t, d: 0.3, f0: 120, f1: 300, q: 0.8, peak: 0.6, att: 0.5, color: 'brown', lp: 800 });
      S.bubbles({ t: t + 0.18, n: 4, spread: 0.15, fmin: 400, fmax: 900, peak: 0.15 });
    } },

  dash: { lvl: -23, v: 2, len: 0.5, rev: 0.12,
    fn(S, t) {
      S.whoosh({ t, d: 0.24, f0: 350, f1: 1500, q: 1.2, peak: 1, att: 0.35 });
      S.bubbles({ t: t + 0.05, n: 10, spread: 0.3, fmin: 500, fmax: 1700, peak: 0.3, fade: 1 });
    } },

  dodge: { lvl: -23.5, v: 3, len: 0.18, rev: 0.06,
    fn(S, t) { S.whoosh({ t, d: S.r(0.1, 0.13), f0: 800, f1: S.r(2300, 2800), q: 1.6, peak: 1, att: 0.4, color: 'white', lp: 6000 }); } },

  jump: { lvl: -24, v: 2, len: 0.22, rev: 0.08,
    fn(S, t) {
      S.tone({ f: S.r(230, 260), f1: S.r(650, 720), ft: 0.11, t, a: 0.002, d: 0.13, peak: 0.8 });
      S.whoosh({ t, d: 0.12, f0: 500, f1: 1500, q: 1.2, peak: 0.25, att: 0.3 });
    } },

  double_jump: { lvl: -23, v: 2, len: 0.45, rev: 0.12,
    fn(S, t) {
      S.whoosh({ t, d: 0.22, f0: 260, f1: 900, q: 1.1, peak: 0.8, att: 0.55, color: 'pink' });
      S.tone({ f: 300, f1: 820, ft: 0.13, t: t + 0.02, a: 0.002, d: 0.14, peak: 0.45 });
      S.bubbles({ t: t + 0.06, n: 8, spread: 0.28, fmin: 600, fmax: 1800, peak: 0.28, fade: 1 });
    } },

  land: { lvl: -24, v: 3, len: 0.25, rev: 0.05, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: S.r(125, 140), f1: 68, ft: 0.05, d: 0.12, peak: 1, click: 0.05 });
      S.noise({ t, a: 0.003, d: 0.1, peak: 0.35, color: 'pink', f: [['lp', 1200]] });
    } },

  land_heavy: { lvl: -18, v: 2, len: 0.6, rev: 0.12, sr: 'lo', prio: 2,
    fn(S, t) {
      S.thump({ t, f0: 95, f1: 38, ft: 0.08, d: 0.35, peak: 1, click: 0.12, drive: 1.8 });
      S.noise({ t, a: 0.004, d: 0.25, peak: 0.45, color: 'brown', f: [['lp', 700]] });
      S.grains({ t: t + 0.01, dur: 0.18, rate: 200, glen: 0.002, peak: 0.12, f: [['bp', 1500, 1]] });
    } },

  step: { lvl: -31, v: 4, len: 0.08, rev: 0, prio: 0, jit: 0.06,
    fn(S, t) {
      S.tone({ f: S.r(260, 330), f1: 170, ft: 0.02, t, a: 0.001, d: 0.03, peak: 0.7 });
      S.noise({ t, a: 0.0006, d: 0.015, peak: 0.4, color: 'pink', f: [['bp', S.r(900, 1400), 1]] });
    } },

  // ================================================================== combat: hits
  hit_light: { lvl: -15, v: 4, len: 0.2, rev: 0.08, prio: 2,
    fn(S, t) {
      S.noise({ t, a: 0.0005, d: S.r(0.025, 0.035), peak: 0.9, f: [['bp', S.r(2200, 2800), 0.9]] });
      S.noise({ t, a: 0.0003, d: 0.004, peak: 0.6, f: [['hp', 4000]] });
      S.thump({ t, f0: S.r(240, 280), f1: 120, ft: 0.03, d: 0.07, peak: 0.7, click: 0 });
    } },

  hit_medium: { lvl: -13, v: 4, len: 0.3, rev: 0.1, prio: 2,
    fn(S, t) {
      const dr = S.drive(1.8);
      S.noise({ t, a: 0.0005, d: 0.045, peak: 0.9, f: [['bp', S.r(1600, 2000), 0.8]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.005, peak: 0.5, f: [['hp', 3500]] });
      S.thump({ t, f0: S.r(170, 200), f1: 72, ft: 0.05, d: 0.14, peak: 0.9, click: 0, drive: 1.5 });
      S.grains({ t: t + 0.003, dur: 0.05, rate: 500, glen: 0.0008, peak: 0.2, f: [['bp', 3000, 1]] });
    } },

  hit_heavy: { lvl: -11, v: 3, len: 0.6, rev: 0.15, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: S.r(115, 130), f1: 42, ft: 0.1, d: 0.38, peak: 1, click: 0, drive: 2 });
      const dr = S.drive(2.5);
      S.noise({ t, a: 0.0005, d: 0.07, peak: 0.85, f: [['bp', S.r(1300, 1700), 0.7]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.6, f: [['hp', 3000]] });
      S.grains({ t: t + 0.004, dur: 0.09, rate: 700, glen: 0.0007, peak: 0.25, f: [['bp', 2500, 0.9]] });
      S.noise({ t, a: 0.003, d: 0.25, peak: 0.25, color: 'brown', f: [['lp', 300]] });
    } },

  hit_super: { lvl: -10, v: 2, len: 1.3, rev: 0.25, prio: 4,
    fn(S, t) {
      S.thump({ t, f0: 100, f1: 30, ft: 0.18, d: 0.9, peak: 1, click: 0, drive: 2.5 });
      const dr = S.drive(3);
      S.noise({ t, a: 0.0005, d: 0.1, peak: 0.9, f: [['bp', 1200, 0.6]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.008, peak: 0.7, f: [['hp', 2500]] });
      S.noise({ t: t + 0.005, a: 0.01, d: 0.7, peak: 0.45, color: 'brown', f: [['lp', 700, 0.7, 200, 0.6]] });
      S.grains({ t, dur: 0.25, rate: (x) => 900 * (1 - x) + 50, glen: 0.0008, peak: 0.3, f: [['hp', 3000]] });
      S.metal({ t, f: 160, d: 0.5, peak: 0.15, strike: 0 });
    } },

  cavitation: { lvl: -11, v: 3, len: 0.45, rev: 0.14, prio: 4, sr: 'hi',
    fn(S, t) {
      // 1) the snap: ultra-sharp transient + a short saturated burst (firecracker-like, dense not just peaky)
      const dr = S.drive(5);
      S.noise({ t, a: 0.0002, d: 0.004, peak: 1, f: [['hp', 600]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.014, peak: 0.6, f: [['bp', 2600, 0.7]], to: dr });
      // 2) ringing crack body (shell + bubble-wall resonances) into the same saturator
      const r = S.res([[S.r(2300, 2800), 5, 1], [S.r(4600, 5400), 6, 0.8], [S.r(8200, 9200), 5, 0.5]], dr);
      S.noise({ t, a: 0.0002, d: 0.012, peak: 3, to: r });
      // 3) the "pop" of the collapsing cavitation bubble, with weight
      S.tone({ f: 1100, f1: 180, ft: 0.025, t, a: 0.0004, d: 0.06, peak: 0.9, to: S.drive(2.5) });
      S.thump({ t, f0: 170, f1: 55, ft: 0.05, d: 0.14, peak: 0.8, click: 0, drive: 2 });
      // 4) a smaller reflected snap
      S.noise({ t: t + 0.007, a: 0.0002, d: 0.004, peak: 0.45, f: [['hp', 1500]], to: dr });
      // 5) brief high-frequency sizzle: dense micro-crackle + mid crackle + hiss
      S.grains({ t: t + 0.003, dur: 0.3, rate: (x) => 5000 * Math.pow(1 - x, 1.3) + 150, glen: 0.00012, peak: 0.8, amp: (x) => Math.pow(1 - x, 1.4), f: [['hp', 3800]] });
      S.grains({ t: t + 0.004, dur: 0.12, rate: (x) => 1500 * (1 - x) + 100, glen: 0.0004, peak: 0.35, f: [['bp', 2500, 0.8]] });
      S.noise({ t: t + 0.004, a: 0.003, d: 0.22, peak: 0.3, f: [['hp', 5000]] });
    } },

  shockwave: { lvl: -11, v: 2, len: 2.0, rev: 0.3, prio: 3, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: 78, f1: 28, ft: 0.3, d: 1.1, peak: 1, click: 0.15, drive: 2 });
      S.noise({ t, a: 0.004, d: 0.4, peak: 0.6, color: 'brown', f: [['lp', 900, 0.8, 120, 0.35]] });
      S.noise({ t: t + 0.05, a: 0.25, d: 1.4, peak: 0.35, color: 'brown', f: [['lp', 150]] });
      S.tone({ f: 46, t, a: 0.2, d: 1.3, peak: 0.25 });
    } },

  block: { lvl: -16, v: 4, len: 0.15, rev: 0.06, prio: 2,
    fn(S, t) {
      const dr = S.drive(2.5);
      S.modal({ t, f: S.r(1300, 1500), ratios: [1, 1.52, 2.33], amps: [1, 0.6, 0.35], decays: [0.05, 0.035, 0.02], peak: 0.7, to: dr });
      S.noise({ t, a: 0.0003, d: 0.014, peak: 0.8, f: [['bp', 3200, 1.2]], to: dr });
      S.wood({ t, f: S.r(330, 380), d: 0.04, peak: 0.6, click: 0 });
      S.noise({ t: t + 0.009, a: 0.0003, d: 0.006, peak: 0.35, f: [['bp', 2600, 1.5]] });
    } },

  block_heavy: { lvl: -14, v: 3, len: 0.35, rev: 0.1, prio: 2,
    fn(S, t) {
      S.modal({ t, f: S.r(850, 950), ratios: [1, 1.48, 2.21, 3.1], amps: [1, 0.6, 0.4, 0.2], decays: [0.09, 0.06, 0.04, 0.03], peak: 0.8 });
      S.noise({ t, a: 0.0004, d: 0.02, peak: 0.8, f: [['bp', 2400, 1]] });
      S.thump({ t, f0: 180, f1: 85, ft: 0.04, d: 0.14, peak: 0.8, click: 0, drive: 1.5 });
      S.grains({ t: t + 0.002, dur: 0.06, rate: 400, glen: 0.0008, peak: 0.2, f: [['bp', 2000, 1]] });
    } },

  perfect_block: { lvl: -15, v: 2, len: 1.4, rev: 0.25, prio: 3, sr: 'hi', jit: 0.01,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.01, peak: 0.6, f: [['bp', 3500, 1.5]] });
      const f = S.r(2280, 2420);
      S.modal({ t, f, ratios: [1, 2.76, 5.4], amps: [1, 0.4, 0.15], decays: [1.0, 0.45, 0.2], peak: 0.7 });
      shimmer(S, f * 2, t, 1.1, 0.22, 17);
      S.sparkle({ t: t + 0.03, n: 6, spread: 0.5, fmin: 4000, fmax: 9000, peak: 0.1, fade: 1 });
    } },

  shell_crack: { lvl: -15, v: 3, len: 0.35, rev: 0.1, prio: 2,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.01, peak: 0.9, f: [['bp', 2800, 1]] });
      S.grains({ t, dur: 0.14, rate: (x) => 1400 * (1 - x) + 100, glen: 0.0006, peak: 0.7, amp: (x) => Math.pow(1 - x, 1.5), f: [['bp', S.r(1800, 2600), 0.8]] });
      S.thump({ t, f0: 320, f1: 150, ft: 0.03, d: 0.06, peak: 0.5, click: 0 });
      S.modal({ t: t + 0.01, f: S.r(1700, 2100), ratios: [1, 1.6], amps: [1, 0.5], decays: [0.05, 0.03], peak: 0.25 });
    } },

  shell_break: { lvl: -13, v: 2, len: 1.0, rev: 0.2, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: 150, f1: 60, ft: 0.06, d: 0.25, peak: 0.8, click: 0.3, drive: 1.6 });
      S.noise({ t, a: 0.0004, d: 0.04, peak: 0.8, f: [['bp', 2200, 0.7]] });
      S.grains({ t, dur: 0.45, rate: (x) => 1600 * Math.pow(1 - x, 2) + 40, glen: 0.0008, peak: 0.7, amp: (x) => Math.pow(1 - x, 1.2), f: [['bp', 2400, 0.6]] });
      shards(S, t + 0.02, 9, 0.5, 0.2, 1500, 5200);
    } },

  molt_start: { lvl: -19, len: 3.3, rev: 0.2, jit: 0,
    fn(S, t) {
      const D = 3.0;
      const body = S.res([[480, 9, 1], [1100, 11, 0.6], [2200, 9, 0.3]]);
      const sweep = S.gain(1);
      const [first] = S.chain([['bp', 420, 7, 1500, D]], t, sweep);
      const split = S.gain(1, body);
      split.connect(first);
      S.pulses({ t, dur: D, width: 0.0007, jit: 0.2, peak: 4, to: split,
        rate: (x) => 22 + 75 * x * x + 10 * Math.sin(x * 37),
        amp: (x) => Math.min(1, x * 4) * (0.5 + 0.5 * Math.abs(Math.sin(x * 13))) });
      for (let i = 0; i < 7; i++) {
        const tt = t + 0.25 + i * 0.4 + S.r(-0.08, 0.08);
        S.noise({ t: tt, a: 0.02, d: 0.12, peak: 0.4, color: 'pink', f: [['bp', S.r(1400, 2000), 4, S.r(350, 500), 0.14]] });
      }
      S.tone({ type: 'sawtooth', f: 90, f1: 360, ft: D, t, a: 0.6, d: 0.5, hold: D - 1.0, peak: 0.08, to: S.lp(900) });
    } },

  molt_done: { lvl: -16, len: 1.4, rev: 0.25, jit: 0.01,
    fn(S, t) {
      S.grains({ t, dur: 0.32, rate: (x) => 1200 * (1 - x * 0.6), glen: 0.0006, peak: 0.6, amp: (x) => Math.sin(Math.PI * Math.min(1, x * 1.2)), f: [['bp', 3200, 1.5, 900, 0.32]] });
      S.noise({ t, a: 0.05, d: 0.25, peak: 0.3, color: 'pink', f: [['bp', 1800, 2, 600, 0.3]] });
      const tp = t + 0.33;
      S.tone({ f: 750, f1: 260, ft: 0.03, t: tp, a: 0.0005, d: 0.05, peak: 0.9 });
      S.noise({ t: tp, a: 0.0003, d: 0.01, peak: 0.6, f: [['bp', 2000, 1]] });
      S.bubbles({ t: tp + 0.02, n: 6, spread: 0.3, fmin: 500, fmax: 1400, peak: 0.25 });
      S.sparkle({ t: tp + 0.08, n: 8, spread: 0.7, fmin: 2500, fmax: 7500, peak: 0.18, rising: true, d: 0.4 });
    } },

  charge_start: { lvl: -22, len: 0.75, rev: 0.12, jit: 0.01,
    fn(S, t) {
      let tt = t;
      while (tt < t + 0.6) {
        const x = (tt - t) / 0.6;
        S.metal({ t: tt, f: 1600 + 1400 * x, d: 0.025, peak: 0.25 + 0.2 * x, strike: 0.5, n: 3 });
        tt += 0.06 - 0.035 * x;
      }
      const r = S.res([[700, 10, 1], [1500, 12, 0.5]]);
      S.pulses({ t, dur: 0.6, rate: (x) => 60 + 100 * x, peak: 3, to: r, amp: (x) => Math.min(1, x * 5) });
      S.tone({ type: 'triangle', f: 200, f1: 420, ft: 0.6, t, a: 0.1, d: 0.15, hold: 0.4, peak: 0.08 });
    } },

  charge_full: { lvl: -20, len: 1.0, rev: 0.25, sr: 'hi', jit: 0,
    fn(S, t) {
      S.modal({ t, f: 2637, ratios: [1, 2, 2.76, 5.4], amps: [1, 0.4, 0.25, 0.1], decays: [0.7, 0.4, 0.3, 0.12], peak: 0.7 });
      S.modal({ t: t + 0.003, f: 1318.5, ratios: [1, 3], amps: [1, 0.2], decays: [0.6, 0.2], peak: 0.35 });
      S.noise({ t, a: 0.0003, d: 0.008, peak: 0.3, f: [['hp', 4000]] });
      S.sparkle({ t: t + 0.02, n: 4, spread: 0.25, fmin: 4000, fmax: 8000, peak: 0.08 });
    } },

  throw_grab: { lvl: -20.5, v: 2, len: 0.3, rev: 0.08,
    fn(S, t) {
      S.whoosh({ t, d: 0.14, f0: 400, f1: 1300, q: 1.2, peak: 0.7, att: 0.6 });
      S.thump({ t: t + 0.12, f0: 220, f1: 120, d: 0.06, peak: 0.6, click: 0 });
      S.noise({ t: t + 0.12, a: 0.001, d: 0.04, peak: 0.5, color: 'pink', f: [['bp', 1200, 1]] });
      S.modal({ t: t + 0.125, f: 1250, ratios: [1, 1.5], amps: [1, 0.5], decays: [0.03, 0.02], peak: 0.3 });
    } },

  throw_impact: { lvl: -12, v: 2, len: 0.7, rev: 0.18, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: 105, f1: 38, ft: 0.08, d: 0.45, peak: 1, click: 0.25, drive: 2.2 });
      S.noise({ t, a: 0.0005, d: 0.06, peak: 0.7, f: [['bp', 1300, 0.8]] });
      S.metal({ t, f: 140, d: 0.35, peak: 0.3, strike: 0.2 });
      S.grains({ t: t + 0.01, dur: 0.2, rate: 150, glen: 0.002, peak: 0.15, f: [['bp', 1800, 1.2]] });
    } },

  knockdown: { lvl: -14, v: 2, len: 0.7, rev: 0.15, prio: 2,
    fn(S, t) {
      S.thump({ t, f0: 120, f1: 50, ft: 0.06, d: 0.3, peak: 1, click: 0.1, drive: 1.6 });
      S.wood({ t, f: 190, d: 0.15, peak: 0.6, click: 0.2 });
      S.metal({ t, f: 300, d: 0.3, peak: 0.2, strike: 0.15 });
      S.thump({ t: t + 0.19, f0: 110, f1: 55, ft: 0.05, d: 0.18, peak: 0.45, click: 0.05 });
      S.wood({ t: t + 0.19, f: 210, d: 0.08, peak: 0.25, click: 0.1 });
    } },

  wall_bounce: { lvl: -14, v: 2, len: 1.0, rev: 0.25, prio: 2,
    fn(S, t) {
      S.metal({ t, f: S.r(220, 260), d: 0.9, peak: 1, strike: 0.9, bright: 0.9 });
      S.thump({ t, f0: 130, f1: 60, d: 0.2, peak: 0.6, click: 0.15, drive: 1.5 });
    } },

  counter: { lvl: -14, len: 0.7, rev: 0.2, jit: 0.01, prio: 3,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.012, peak: 0.8, f: [['bp', 3000, 1]] });
      stab(S, [76, 80, 83, 88], t, 0.35, 0.3);
      S.modal({ t, f: 2960, ratios: [1, 2.76], amps: [1, 0.3], decays: [0.4, 0.15], peak: 0.4 });
    } },

  // ================================================================== ultimates / KO / QTE
  ult_ready: { lvl: -20, len: 1.8, rev: 0.3, sr: 'hi', jit: 0,
    fn(S, t) {
      [76, 83, 88, 95].forEach((m, i) => chime(S, m, t + i * 0.06, 0.35, undefined, 1.3));
      shimmer(S, mtof(100), t, 1.6, 0.2, 14);
      S.sparkle({ t: t + 0.1, n: 8, spread: 1.0, fmin: 3500, fmax: 9000, peak: 0.08, fade: 1 });
    } },

  ult_start: { lvl: -13, len: 1.8, rev: 0.3, prio: 4, sr: 'hi', jit: 0,
    fn(S, t) {
      S.noise({ t, a: 0.002, d: 0.35, peak: 0.6, f: [['bp', 3000, 3, 9000, 0.12], ['hp', 2000]] });
      S.modal({ t: t + 0.02, f: 3520, ratios: [1, 1.5, 2.76, 4.1], amps: [1, 0.5, 0.3, 0.15], decays: [0.9, 0.6, 0.35, 0.2], peak: 0.45 });
      S.whoosh({ t: t + 0.05, d: 0.5, f0: 300, f1: 2500, f2: 400, q: 1, peak: 0.6, att: 0.6 });
      const dr = S.drive(2.5);
      S.tone({ f: 180, f1: 32, ft: 0.7, t: t + 0.12, a: 0.01, d: 1.2, peak: 0.9, to: dr });
      S.tone({ type: 'triangle', f: 360, f1: 64, ft: 0.7, t: t + 0.12, a: 0.01, d: 0.8, peak: 0.25, to: dr });
    } },

  ult_hit: { lvl: -9, v: 2, len: 1.6, rev: 0.3, prio: 5,
    fn(S, t) {
      S.thump({ t, f0: 110, f1: 28, ft: 0.25, d: 1.2, peak: 1, click: 0, drive: 2.8 });
      S.thump({ t: t + 0.012, f0: 70, f1: 30, ft: 0.3, d: 1.0, peak: 0.6, click: 0, drive: 1.5 });
      const dr = S.drive(3);
      S.noise({ t, a: 0.0005, d: 0.12, peak: 0.9, f: [['bp', 1100, 0.5]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.01, peak: 0.7, f: [['hp', 2500]] });
      S.noise({ t: t + 0.01, a: 0.02, d: 1.0, peak: 0.45, color: 'brown', f: [['lp', 900, 0.7, 150, 0.9]] });
      S.metal({ t, f: 130, d: 0.9, peak: 0.25, strike: 0.2 });
      S.grains({ t, dur: 0.35, rate: (x) => 1200 * (1 - x) + 30, glen: 0.0008, peak: 0.3, f: [['hp', 2500]] });
    } },

  ko: { lvl: -9, len: 4.0, rev: 0.12, prio: 5, jit: 0,
    fn(S, t) {
      const ir = makeIR(S.sr, { dur: 3.2, seed: 99, dark: 1.3, metal: 0.3 }, S.ctx);
      const wet = S.gain(0.55);
      const conv = S.conv(ir, wet);
      const both = S.gain(1);
      both.connect(conv);
      S.thump({ t, f0: 95, f1: 26, ft: 0.4, d: 1.6, peak: 1, click: 0, drive: 2.5, to: both });
      const dr = S.drive(3, both);
      S.noise({ t, a: 0.0005, d: 0.15, peak: 0.9, f: [['bp', 1000, 0.5]], to: dr });
      S.noise({ t, a: 0.0003, d: 0.012, peak: 0.8, f: [['hp', 2500]], to: both });
      S.noise({ t: t + 0.01, a: 0.02, d: 1.4, peak: 0.5, color: 'brown', f: [['lp', 800, 0.7, 120, 1.2]], to: both });
      S.metal({ t, f: 98, d: 1.8, peak: 0.35, strike: 0.3, to: both });
      S.grains({ t, dur: 0.4, rate: (x) => 1500 * (1 - x) + 30, glen: 0.0008, peak: 0.3, f: [['hp', 2500]], to: both });
    } },

  qte_heartbeat: { lvl: -17.5, len: 0.6, rev: 0.05, sr: 'lo', jit: 0.01,
    fn(S, t) {
      S.thump({ t, f0: 70, f1: 42, ft: 0.06, d: 0.2, peak: 1, click: 0, drive: 1.4 });
      S.noise({ t, a: 0.004, d: 0.08, peak: 0.25, color: 'pink', f: [['lp', 300]] });
      S.thump({ t: t + 0.22, f0: 62, f1: 40, ft: 0.06, d: 0.22, peak: 0.75, click: 0, drive: 1.4 });
      S.noise({ t: t + 0.22, a: 0.004, d: 0.08, peak: 0.18, color: 'pink', f: [['lp', 300]] });
    } },

  qte_press: { lvl: -18.5, v: 2, len: 0.2, rev: 0.05, ui: 1, jit: 0.02,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.8, f: [['bp', 2500, 1]] });
      S.thump({ t, f0: 260, f1: 140, ft: 0.03, d: 0.07, peak: 0.8, click: 0 });
      S.modal({ t, f: 1760, ratios: [1, 2.76], amps: [1, 0.2], decays: [0.08, 0.03], peak: 0.25 });
    } },

  qte_win: { lvl: -15, len: 1.2, rev: 0.25, jit: 0,
    fn(S, t) {
      stab(S, [72, 76, 79, 86], t, 0.3, 0.45, 8000, 1500);
      S.noise({ t, a: 0.001, d: 0.3, peak: 0.4, f: [['bp', 2000, 0.6, 6000, 0.2]] });
      S.bubbles({ t: t + 0.03, n: 12, spread: 0.5, fmin: 500, fmax: 2000, peak: 0.25, fade: 1 });
      S.sparkle({ t: t + 0.05, n: 8, spread: 0.6, fmin: 3000, fmax: 8000, peak: 0.12, fade: 1 });
    } },

  qte_escape: { lvl: -16, len: 0.9, rev: 0.2,
    fn(S, t) {
      S.noise({ t, a: 0.001, d: 0.08, peak: 0.6, f: [['bp', 1500, 0.8]] });
      S.whoosh({ t, d: 0.55, f0: 1800, f1: 600, f2: 200, q: 1, peak: 0.9, att: 0.15 });
      S.bubbles({ t: t + 0.02, n: 14, spread: 0.6, fmin: 400, fmax: 1600, peak: 0.25, fade: 1 });
      S.tone({ f: 600, f1: 180, ft: 0.08, t, a: 0.0005, d: 0.1, peak: 0.5 });
    } },

  dizzy: { lvl: -22, len: 1.3, ch: 2, rev: 0.2, sr: 'hi', jit: 0.02,
    fn(S, t) {
      for (let i = 0; i < 6; i++) {
        const tt = t + i * 0.17;
        const p = S.pan(Math.sin(i * 1.4) * 0.7);
        const f0 = S.r(2800, 3400);
        S.tone({ f: f0, fpts: [[0.03, f0 * 1.35], [0.07, f0 * 0.95], [0.1, f0 * 1.2]], t: tt, a: 0.004, d: 0.09, hold: 0.02, peak: 0.35, to: p });
        S.modal({ t: tt + 0.06, f: S.pick([4186, 4699, 5274, 6271]), ratios: [1, 2.76], amps: [1, 0.2], decays: [0.25, 0.08], peak: 0.15, to: p });
      }
    } },

  // ================================================================== projectiles, eating, critters
  projectile_bubble: { lvl: -20.5, v: 2, len: 0.55, rev: 0.15,
    fn(S, t) {
      S.tone({ f: 260, f1: 560, ft: 0.35, t, a: 0.01, d: 0.3, hold: 0.08, peak: 0.6, vib: { rate: 11, depth: 0.12 } });
      S.whoosh({ t, d: 0.3, f0: 300, f1: 1200, q: 1.2, peak: 0.5, att: 0.3 });
      S.bubble({ t, f: 300, rise: 2.5, d: 0.08, peak: 0.5 });
    } },

  bubble_pop: { lvl: -20, v: 3, len: 0.1, rev: 0.06,
    fn(S, t) {
      S.tone({ f: S.r(850, 1000), f1: S.r(1700, 2100), ft: 0.025, t, a: 0.0006, d: 0.03, peak: 0.8 });
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.5, f: [['bp', 3500, 1]] });
      S.grains({ t: t + 0.002, dur: 0.04, rate: 600, glen: 0.0004, peak: 0.15, f: [['hp', 4000]] });
    } },

  snail_crunch: { lvl: -18, v: 2, len: 0.3, rev: 0.06,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.008, peak: 0.8, f: [['bp', 3500, 1]] });
      S.grains({ t, dur: 0.12, rate: (x) => 1200 * (1 - x) + 150, glen: 0.0005, peak: 0.7, f: [['bp', 3200, 0.9]] });
      S.modal({ t: t + 0.005, f: S.r(2600, 3000), ratios: [1, 2.3], amps: [1, 0.3], decays: [0.06, 0.03], peak: 0.3 });
      S.grains({ t: t + 0.07, dur: 0.08, rate: 400, glen: 0.0006, peak: 0.3, f: [['bp', 2500, 1]] });
    } },

  munch: { lvl: -20.5, v: 2, len: 0.65, rev: 0.04,
    fn(S, t) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.17 + S.r(0, 0.02);
        S.grains({ t: tt, dur: 0.07, rate: 900, glen: 0.0007, peak: 0.6 - i * 0.12, f: [['bp', S.r(1800, 2600), 0.8], ['lp', 5000]] });
        S.thump({ t: tt, f0: 180, f1: 110, ft: 0.03, d: 0.06, peak: 0.4, click: 0 });
        S.noise({ t: tt + 0.02, a: 0.01, d: 0.06, peak: 0.2, color: 'pink', f: [['bp', 900, 2]] });
      }
    } },

  gulp: { lvl: -21, v: 2, len: 0.35, rev: 0.06,
    fn(S, t) {
      S.noise({ t, pts: [[0, 0], [0.01, 0.8], [0.09, 0.4], [0.16, 0]], color: 'pink', f: [['bp', 1000, 6, 320, 0.12]] });
      S.tone({ type: 'triangle', f: 220, f1: 90, ft: 0.1, t, a: 0.005, d: 0.12, peak: 0.6 });
      S.bubble({ t: t + 0.12, f: 380, rise: 1.8, d: 0.08, peak: 0.4 });
    } },

  hiccup: { lvl: -21, v: 2, len: 0.25, rev: 0.05,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.6, f: [['bp', 1500, 1]] });
      const g = S.gain(0, null);
      const f1 = S.bp(320, 5), f2 = S.bp(2300, 9);
      const f2g = S.gain(0.6, f2);
      g.connect(f1); g.connect(f2g);
      envPoints(g.gain, t, [[0, 0], [0.006, 0.9], [0.06, 0.5], [0.09, 0]]);
      const o = S.osc('~voice', S.r(270, 300), t, t + 0.1, g);
      glide(o.frequency, t, 280, 440, 0.08);
      S.noise({ t: t + 0.085, a: 0.0003, d: 0.01, peak: 0.4, f: [['bp', 2500, 1.5]] });
    } },

  burp: { lvl: -17, v: 2, len: 0.85, rev: 0.12,
    fn(S, t) {
      const D = S.r(0.55, 0.7);
      const lp = S.lp(1800);
      const f1 = S.bp(520, 4, lp), f2 = S.bp(850, 5, null);
      const f2g = S.gain(0.7, lp);
      f2.connect(f2g);
      const trem = S.gain(0.7, null);
      trem.connect(f1); trem.connect(f2);
      S.lfo(31, 0.35, trem.gain, t, t + D + 0.02);
      const g = S.gain(0, trem);
      envPoints(g.gain, t, [[0, 0], [0.04, 1], [D * 0.7, 0.8], [D, 0]]);
      const o = S.osc('~voice', 95, t, t + D + 0.02, g);
      glide(o.frequency, t, 98, 76, D);
      S.lfo(23, 7, o.frequency, t, t + D + 0.02);
      S.lfo(3.1, 5, o.frequency, t, t + D + 0.02);
    } },

  puru_squeak: { lvl: -20, v: 3, len: 0.25, rev: 0.12, sr: 'hi',
    fn(S, t) {
      const f = S.r(1150, 1350);
      S.tone({ f, fpts: [[0.05, f * 1.5], [0.14, f * 1.15]], t, a: 0.008, d: 0.1, hold: 0.05, peak: 0.7, vib: { rate: 22, depth: 0.03 } });
      S.tone({ type: 'triangle', f: f * 2, fpts: [[0.05, f * 3], [0.14, f * 2.3]], t, a: 0.008, d: 0.08, hold: 0.05, peak: 0.12 });
    } },

  puru_boing: { lvl: -20, v: 2, len: 0.6, rev: 0.12,
    fn(S, t) {
      const l = S.lp(1400, 1);
      const g = S.gain(0, l);
      envPoints(g.gain, t, [[0, 0], [0.005, 0.8], [0.5, 0.0008, 'e']]);
      const o = S.osc('sine', 200, t, t + 0.52, g);
      glide(o.frequency, t, 200, 330, 0.08);
      const w = S.lfo(13, 60, o.frequency, t, t + 0.52);
      envPoints(w.g.gain, t, [[0, 60], [0.5, 2, 'e']]);
      S.tone({ type: 'triangle', f: 400, f1: 660, ft: 0.08, t, a: 0.005, d: 0.25, peak: 0.12, to: l });
    } },

  puru_zap: { lvl: -18, v: 2, len: 0.45, rev: 0.12, sr: 'hi',
    fn(S, t) {
      const D = 0.35;
      const h = S.hp(600);
      const g = S.gain(0, h);
      envPoints(g.gain, t, [[0, 0], [0.003, 0.5], [0.05, 0.35], [D, 0.001, 'e']]);
      const o = S.osc('sawtooth', 180, t, t + D + 0.02, g);
      const nz = S.noiseSrc('white', t, t + D + 0.02, null, 0.05);
      const ng = S.gain(400, o.frequency);
      nz.connect(ng);
      S.grains({ t, dur: D, rate: 300, glen: 0.0004, peak: 0.6, amp: (x) => 1 - x, f: [['hp', 3000]] });
      S.tone({ type: 'square', f: 120, t, a: 0.002, d: D, peak: 0.15, to: S.bp(2500, 2) });
    } },

  // ================================================================== stage props & hazards
  cone_bonk: { lvl: -17, v: 2, len: 0.3, rev: 0.12,
    fn(S, t) {
      const f = S.r(400, 450);
      S.modal({ t, f, ratios: [1, 1.58, 2.31, 3.15], amps: [1, 0.55, 0.3, 0.12], decays: [0.16, 0.1, 0.06, 0.04], peak: 0.8 });
      S.tone({ f: f * 1.1, f1: f * 0.92, ft: 0.08, t, a: 0.0008, d: 0.12, peak: 0.3 });
      S.noise({ t, a: 0.0004, d: 0.01, peak: 0.4, f: [['bp', 1800, 1.2]] });
    } },

  cone_crack: { lvl: -17, v: 2, len: 0.35, rev: 0.1,
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.015, peak: 0.9, f: [['bp', 2600, 1]] });
      S.grains({ t, dur: 0.12, rate: (x) => 800 * (1 - x) + 100, glen: 0.0007, peak: 0.6, f: [['bp', 2000, 1.2]] });
      S.modal({ t, f: 520, ratios: [1, 1.6, 2.4], amps: [1, 0.5, 0.25], decays: [0.08, 0.05, 0.03], peak: 0.4 });
    } },

  demon_transform: { lvl: -15.5, len: 3.4, ch: 2, rev: 0.35, prio: 4, jit: 0,
    fn(S, t) {
      // 1) glass / plastic crack
      S.noise({ t, a: 0.0003, d: 0.02, peak: 0.9, f: [['bp', 3000, 0.8]] });
      S.grains({ t, dur: 0.5, rate: (x) => 1400 * Math.pow(1 - x, 2) + 30, glen: 0.0007, peak: 0.5, f: [['hp', 1500]] });
      shards(S, t, 6, 0.4, 0.15, 2500, 6000, 0.6);
      // 2) lights powering down: falling whine, mains hum dropping out, relay clunks
      S.tone({ type: 'sawtooth', f: 1400, f1: 70, ft: 1.4, t: t + 0.15, a: 0.02, d: 0.4, hold: 1.0, peak: 0.12, to: S.lp(2500) });
      S.tone({ type: 'square', f: 60, t, a: 0.01, d: 0.2, hold: 0.9, peak: 0.08, to: S.lp(400) });
      S.metal({ t: t + 0.45, f: 520, d: 0.08, peak: 0.25, strike: 0.4, n: 3 });
      S.metal({ t: t + 0.85, f: 440, d: 0.08, peak: 0.2, strike: 0.4, n: 3 });
      // 3) deep detuned drone swell
      const dl = S.lp(150, 2);
      envPoints(dl.frequency, t, [[0, 150], [2.6, 700, 'e'], [3.3, 200, 'e']]);
      const dg = S.gain(0, dl);
      envPoints(dg.gain, t, [[0, 0], [0.6, 0.02], [2.6, 0.5], [3.3, 0.0005, 'e']]);
      for (const f of [41.2, 41.7, 61.7, 82.4, 87.3]) S.osc('sawtooth', f, t, t + 3.35, dg);
      // 4) whisper-like breathy formant noise drifting L/R
      for (let k = 0; k < 2; k++) {
        const p = S.pan(k ? 0.6 : -0.6);
        const w = S.gain(0, p);
        envPoints(w.gain, t, [[0, 0], [1.0 + k * 0.3, 0], [1.8 + k * 0.3, 0.45], [2.6, 0.3], [3.25, 0]]);
        const trem = S.gain(0.6, w);
        S.lfo(4 + k * 1.3, 0.35, trem.gain, t, t + 3.3);
        const nz = S.noiseSrc('pink', t, t + 3.3, null);
        const b1 = S.bp(700, 7, trem), b2 = S.bp(1900, 9, trem);
        glide(b1.frequency, t + 1, 600 + k * 150, 1000 - k * 200, 2.2);
        glide(b2.frequency, t + 1, 2200 - k * 300, 1500 + k * 400, 2.2);
        nz.connect(b1); nz.connect(b2);
      }
    } },

  demon_whisper: { lvl: -23.5, v: 2, len: 1.2, ch: 2, rev: 0.4, jit: 0.03,
    fn(S, t) {
      const p = S.pan(S.r(-0.4, 0.4));
      S.noise({ t, pts: [[0, 0], [0.15, 0.6], [0.45, 0.3], [0.58, 0]], color: 'pink', f: [['bp', S.r(650, 750), 6, 480, 0.5]], to: p });
      S.noise({ t, pts: [[0, 0], [0.15, 0.4], [0.45, 0.25], [0.58, 0]], color: 'pink', f: [['bp', 1200, 8, 1800, 0.5]], to: p });
      S.noise({ t: t + 0.5, pts: [[0, 0], [0.1, 0.3], [0.45, 0]], f: [['bp', 5500, 3]], to: p });
      S.tone({ f: 55, t, a: 0.2, d: 0.8, peak: 0.12, to: p });
      S.tone({ f: 880, t: t + 0.1, a: 0.2, d: 0.7, peak: 0.03, vib: { rate: 6, depth: 0.02 }, to: p });
    } },

  demon_slash: { lvl: -17.5, v: 2, len: 0.5, rev: 0.25,
    fn(S, t) {
      S.whoosh({ t, d: 0.26, f0: 180, f1: 1400, f2: 250, q: 1.4, peak: 1, att: 0.4, color: 'pink', lp: 3000 });
      const dr = S.drive(4);
      S.noise({ t: t + 0.06, a: 0.02, d: 0.15, peak: 0.25, f: [['bp', 3000, 2, 900, 0.15]], to: dr });
      S.tone({ type: 'sawtooth', f: 110, f1: 55, ft: 0.25, t, a: 0.02, d: 0.25, peak: 0.3, to: S.lp(400) });
    } },

  belly_flop: { lvl: -10, len: 1.5, rev: 0.25, prio: 4,
    fn(S, t) {
      S.thump({ t, f0: 85, f1: 30, ft: 0.15, d: 0.8, peak: 1, click: 0, drive: 2.2 });
      S.noise({ t, a: 0.0006, d: 0.05, peak: 0.9, f: [['bp', 1500, 0.6]] });
      S.noise({ t, a: 0.002, d: 0.25, peak: 0.6, color: 'pink', f: [['bp', 1800, 2.5, 280, 0.22]] });
      S.grains({ t: t + 0.01, dur: 0.4, rate: (x) => 600 * (1 - x) + 30, glen: 0.002, peak: 0.25, f: [['bp', 1200, 0.8]] });
      S.bubbles({ t: t + 0.08, n: 14, spread: 0.7, fmin: 250, fmax: 1100, peak: 0.25, fade: 1 });
      S.noise({ t, a: 0.01, d: 0.8, peak: 0.3, color: 'brown', f: [['lp', 250]] });
    } },

  belly_bounce: { lvl: -19, v: 2, len: 0.7, rev: 0.12,
    fn(S, t) {
      const g = S.gain(0, S.lp(900));
      envPoints(g.gain, t, [[0, 0], [0.006, 0.9], [0.6, 0.0008, 'e']]);
      const o = S.osc('triangle', 95, t, t + 0.62, g);
      glide(o.frequency, t, 80, 150, 0.1);
      const w = S.lfo(7.5, 40, o.frequency, t, t + 0.62);
      envPoints(w.g.gain, t, [[0, 40], [0.6, 2, 'e']]);
      S.thump({ t, f0: 120, f1: 60, d: 0.12, peak: 0.5, click: 0 });
    } },

  spear_stab: { lvl: -16, v: 3, len: 0.3, rev: 0.08,
    fn(S, t) {
      S.whoosh({ t, d: 0.09, f0: 1500, f1: 4200, q: 1.5, peak: 0.7, att: 0.6, color: 'white', lp: 8000 });
      const tt = t + 0.085;
      S.tone({ f: 340, f1: 130, ft: 0.03, t: tt, a: 0.0005, d: 0.07, peak: 0.8 });
      S.noise({ t: tt, a: 0.0004, d: 0.025, peak: 0.8, f: [['bp', 1300, 1]] });
      S.modal({ t: tt, f: 1900, ratios: [1, 2.6], amps: [1, 0.3], decays: [0.08, 0.04], peak: 0.25 });
    } },

  spear_snag: { lvl: -18, v: 2, len: 0.5, rev: 0.1,
    fn(S, t) {
      const g = S.gain(0);
      envPoints(g.gain, t, [[0, 0], [0.02, 0.6], [0.14, 0.4], [0.16, 0]]);
      const am = S.gain(0.5, g);
      S.lfo(90, 0.5, am.gain, t, t + 0.17, 'sawtooth');
      const nz = S.noiseSrc('white', t, t + 0.17, null);
      const b = S.bp(2000, 2, am);
      glide(b.frequency, t, 1800, 5200, 0.15);
      nz.connect(b);
      for (let i = 0; i < 10; i++) S.metal({ t: t + 0.17 + i * 0.025 + S.r(0, 0.008), f: S.r(1800, 3200), d: 0.03, peak: 0.25 * (1 - i / 12), strike: 0.4, n: 3 });
    } },

  junk_toss: { lvl: -22, v: 2, len: 0.45, rev: 0.1,
    fn(S, t) {
      S.whoosh({ t, d: 0.32, f0: 300, f1: 1300, q: 1.1, peak: 0.9, att: 0.4 });
      S.whoosh({ t: t + 0.1, d: 0.2, f0: 500, f1: 900, q: 3, peak: 0.25, att: 0.5 });
    } },

  duck_squeak: { lvl: -20, v: 2, len: 0.35, rev: 0.08,
    fn(S, t) {
      const D = 0.24, f = S.r(1000, 1150);
      const fm = S.bp(2200, 3);
      const body = S.lp(1500, 0.7);
      const g = S.gain(0, fm);
      g.connect(body);
      envPoints(g.gain, t, [[0, 0], [0.015, 0.8], [D * 0.8, 0.6], [D, 0]]);
      const o = S.osc('sawtooth', f * 0.8, t, t + D + 0.02, g);
      o.frequency.exponentialRampToValueAtTime(f * 1.15, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + D);
      S.lfo(28, 30, o.frequency, t, t + D + 0.02);
      S.noise({ t, a: 0.01, d: D, peak: 0.12, f: [['bp', 3000, 1]] });
    } },

  boot_thud: { lvl: -18, v: 2, len: 0.3, rev: 0.08, sr: 'lo',
    fn(S, t) {
      S.thump({ t, f0: 150, f1: 70, ft: 0.04, d: 0.13, peak: 1, click: 0.08 });
      S.noise({ t, a: 0.001, d: 0.05, peak: 0.6, color: 'pink', f: [['bp', 700, 1.2]] });
      S.noise({ t, a: 0.0005, d: 0.012, peak: 0.25, f: [['bp', 2200, 1]] });
    } },

  fish_slap: { lvl: -16, v: 3, len: 0.35, rev: 0.1,
    fn(S, t) {
      S.noise({ t, a: 0.0005, d: 0.04, peak: 0.9, f: [['bp', 1400, 0.7]] });
      S.noise({ t, a: 0.001, d: 0.16, peak: 0.5, color: 'pink', f: [['bp', 2600, 3, 700, 0.12]] });
      S.thump({ t, f0: 200, f1: 100, ft: 0.03, d: 0.08, peak: 0.6, click: 0 });
      S.grains({ t: t + 0.005, dur: 0.12, rate: 300, glen: 0.0015, peak: 0.2, f: [['bp', 1800, 1]] });
    } },

  can_clang: { lvl: -17, v: 2, len: 0.5, rev: 0.15,
    fn(S, t) {
      S.metal({ t, f: S.r(720, 820), d: 0.22, peak: 1, strike: 0.6, ratios: [1, 1.57, 2.3, 3.4, 4.6], dk: 0.75 });
      S.grains({ t: t + 0.02, dur: 0.2, rate: 60, glen: 0.002, peak: 0.25, f: [['bp', 2500, 3]] });
    } },

  anchor_clang: { lvl: -13, len: 1.8, rev: 0.3, prio: 3,
    fn(S, t) {
      S.metal({ t, f: 172, d: 1.5, peak: 1, strike: 0.9, ratios: [1, 2.62, 4.13, 5.94, 7.82, 9.7], dk: 0.82, bright: 0.85 });
      S.thump({ t, f0: 110, f1: 45, d: 0.35, peak: 0.8, click: 0.2, drive: 1.6 });
    } },

  barrel_hit: { lvl: -15, v: 2, len: 0.7, rev: 0.2,
    fn(S, t) {
      S.metal({ t, f: S.r(140, 160), d: 0.5, peak: 0.8, strike: 0.5, ratios: [1, 1.48, 2.05, 2.7, 3.4], dk: 0.75 });
      S.tone({ f: 105, f1: 88, ft: 0.15, t, a: 0.001, d: 0.35, peak: 0.7 });
      S.noise({ t, a: 0.0005, d: 0.02, peak: 0.4, f: [['bp', 900, 1]] });
    } },

  barrel_roll: { lvl: -21.5, v: 2, len: 0.5, rev: 0.12, sr: 'lo',
    fn(S, t) {
      const g = S.gain(0);
      envPoints(g.gain, t, [[0, 0], [0.04, 0.8], [0.32, 0.6], [0.42, 0]]);
      const am = S.gain(0.6, g);
      S.lfo(13, 0.4, am.gain, t, t + 0.45);
      const nz = S.noiseSrc('brown', t, t + 0.45, null);
      nz.connect(S.lp(350, 0.7, am));
      for (let i = 0; i < 6; i++) S.metal({ t: t + 0.02 + i * 0.07 + S.r(0, 0.01), f: S.r(400, 700), d: 0.05, peak: 0.12, strike: 0.2, n: 3 });
    } },

  crate_break: { lvl: -14, v: 2, len: 0.9, rev: 0.18, prio: 2,
    fn(S, t) {
      S.wood({ t, f: 210, d: 0.12, peak: 0.9, click: 0.5 });
      S.noise({ t, a: 0.0004, d: 0.035, peak: 0.9, f: [['bp', 1800, 0.8]] });
      S.grains({ t: t + 0.005, dur: 0.45, rate: (x) => 900 * Math.pow(1 - x, 2) + 30, glen: 0.0012, peak: 0.6, f: [['bp', 1600, 0.7]] });
      for (let i = 0; i < 5; i++) S.wood({ t: t + 0.08 + S.r(0, 0.5), f: S.r(300, 900), d: 0.04, peak: S.r(0.15, 0.35), click: 0.3 });
      S.thump({ t, f0: 140, f1: 70, d: 0.15, peak: 0.6, click: 0 });
    } },

  crate_hit: { lvl: -17, v: 3, len: 0.3, rev: 0.1,
    fn(S, t) {
      S.wood({ t, f: S.r(210, 250), d: 0.12, peak: 1, click: 0.5 });
      S.thump({ t, f0: 150, f1: 85, d: 0.1, peak: 0.5, click: 0 });
      S.grains({ t, dur: 0.06, rate: 300, glen: 0.001, peak: 0.15, f: [['bp', 1500, 1]] });
    } },

  bottle_break: { lvl: -15, v: 2, len: 1.0, rev: 0.18, sr: 'hi',
    fn(S, t) {
      S.noise({ t, a: 0.0003, d: 0.03, peak: 0.9, f: [['hp', 2000]] });
      S.modal({ t, f: S.r(1100, 1300), ratios: [1, 2.3, 3.9], amps: [1, 0.5, 0.3], decays: [0.12, 0.08, 0.05], peak: 0.4 });
      S.grains({ t, dur: 0.35, rate: (x) => 1500 * Math.pow(1 - x, 2) + 40, glen: 0.0004, peak: 0.6, f: [['hp', 2500]] });
      shards(S, t, 14, 0.6, 0.25);
    } },

  mug_clink: { lvl: -23, v: 2, len: 0.6, rev: 0.15, sr: 'hi',
    fn(S, t) {
      S.modal({ t, f: S.r(2100, 2400), ratios: [1, 2.12, 3.3, 4.7], amps: [1, 0.45, 0.2, 0.08], decays: [0.4, 0.22, 0.12, 0.06], peak: 0.8 });
      S.noise({ t, a: 0.0003, d: 0.006, peak: 0.3, f: [['bp', 4000, 1]] });
    } },

  wood_break: { lvl: -13, v: 2, len: 1.1, rev: 0.2, prio: 3,
    fn(S, t) {
      S.thump({ t, f0: 120, f1: 50, ft: 0.06, d: 0.3, peak: 0.9, click: 0.2, drive: 1.6 });
      S.wood({ t, f: 170, d: 0.15, peak: 0.9, click: 0.6 });
      S.noise({ t, a: 0.0004, d: 0.05, peak: 1, f: [['bp', 1500, 0.7]] });
      S.grains({ t: t + 0.005, dur: 0.6, rate: (x) => 1100 * Math.pow(1 - x, 2) + 25, glen: 0.0014, peak: 0.6, f: [['bp', 1400, 0.6]] });
      for (let i = 0; i < 7; i++) S.wood({ t: t + 0.1 + S.r(0, 0.7), f: S.r(250, 800), d: 0.04, peak: S.r(0.12, 0.3), click: 0.3 });
    } },

  stool_hit: { lvl: -17, v: 2, len: 0.35, rev: 0.12,
    fn(S, t) {
      S.wood({ t, f: S.r(380, 440), d: 0.09, peak: 1, click: 0.5 });
      S.wood({ t: t + S.r(0.04, 0.06), f: S.r(500, 560), d: 0.05, peak: 0.45, click: 0.3 });
      S.thump({ t, f0: 180, f1: 100, d: 0.07, peak: 0.4, click: 0 });
    } },

  pipe_hiss: { lvl: -24, len: 1.7, rev: 0.15,
    fn(S, t) {
      S.noise({ t, a: 0.04, d: 0.5, hold: 0.9, peak: 0.5, f: [['bp', 4200, 0.9], ['hp', 1800]] });
      S.noise({ t, a: 0.05, d: 0.4, hold: 1.0, peak: 0.25, color: 'brown', f: [['lp', 300]] });
      for (let i = 0; i < 26; i++) S.bubble({ t: t + 0.05 + S.r(0, 1.35), f: S.r(250, 900), rise: S.r(1.3, 2), d: S.r(0.03, 0.07), peak: S.r(0.08, 0.25) });
    } },

  chain_rattle: { lvl: -21, v: 2, len: 0.7, rev: 0.15, sr: 'hi',
    fn(S, t) {
      for (let i = 0; i < 16; i++) {
        const tt = t + Math.pow(i / 16, 1.2) * 0.5 + S.r(0, 0.012);
        S.modal({ t: tt, f: S.r(1600, 4200), ratios: [1, 2.4, 3.9], amps: [1, 0.4, 0.2], decays: [S.r(0.03, 0.08), 0.03, 0.02], peak: S.r(0.15, 0.35) * (1 - i / 22) });
      }
      S.grains({ t, dur: 0.5, rate: 120, glen: 0.0008, peak: 0.2, f: [['hp', 2500]] });
    } },

  metal_clang: { lvl: -16, v: 3, len: 0.9, rev: 0.22,
    fn(S, t) {
      S.metal({ t, f: S.r(290, 360), d: 0.75, peak: 1, strike: 0.7 });
      S.thump({ t, f0: 160, f1: 90, d: 0.08, peak: 0.3, click: 0 });
    } },

  valve_steam: { lvl: -19, len: 1.2, rev: 0.18,
    fn(S, t) {
      S.metal({ t, f: 600, d: 0.12, peak: 0.4, strike: 0.5, n: 4 });
      S.noise({ t: t + 0.03, pts: [[0, 0], [0.02, 0.9], [0.25, 0.6], [1.0, 0.0008, 'e']], f: [['hp', 1500], ['bp', 4500, 0.7]] });
      S.noise({ t: t + 0.03, pts: [[0, 0], [0.02, 0.4], [0.6, 0.001, 'e']], color: 'pink', f: [['bp', 1200, 1]] });
      S.tone({ f: 1850, t: t + 0.05, a: 0.03, d: 0.5, hold: 0.1, peak: 0.06, vib: { rate: 9, depth: 0.01 } });
    } },

  lamp_swing: { lvl: -25, v: 2, len: 0.9, rev: 0.2,
    fn(S, t) {
      const r = S.res([[1150, 14, 1], [2550, 16, 0.6], [3900, 12, 0.3]]);
      S.pulses({ t, dur: 0.32, rate: (x) => 90 + 60 * x, amp: (x) => Math.sin(Math.PI * x), peak: 4, to: r });
      S.pulses({ t: t + 0.42, dur: 0.3, rate: (x) => 140 - 50 * x, amp: (x) => Math.sin(Math.PI * x) * 0.8, peak: 3.5, to: r });
    } },

  chandelier_fall: { lvl: -12, len: 2.2, ch: 2, rev: 0.3, prio: 4, jit: 0,
    fn(S, t) {
      S.metal({ t, f: 1400, d: 0.08, peak: 0.5, strike: 0.8, n: 4 });
      S.noise({ t, a: 0.0003, d: 0.01, peak: 0.6, f: [['hp', 2000]] });
      for (let i = 0; i < 5; i++) S.metal({ t: t + 0.03 + i * 0.03, f: S.r(2000, 3200), d: 0.03, peak: 0.15, strike: 0.3, n: 3 });
      S.whoosh({ t: t + 0.05, d: 0.45, f0: 400, f1: 1500, f2: 1800, q: 1.4, peak: 0.4, att: 0.9 });
      const tc = t + 0.5;
      S.thump({ t: tc, f0: 110, f1: 40, d: 0.5, peak: 1, click: 0.3, drive: 2 });
      S.metal({ t: tc, f: 260, d: 0.9, peak: 0.6, strike: 0.6 });
      S.noise({ t: tc, a: 0.0003, d: 0.04, peak: 0.8, f: [['hp', 2000]] });
      S.grains({ t: tc, dur: 0.5, rate: (x) => 1500 * Math.pow(1 - x, 2) + 40, glen: 0.0005, peak: 0.5, f: [['hp', 2500]] });
      shards(S, tc, 18, 0.9, 0.25, 2200, 8000, 0.8);
    } },

  pinata_hit: { lvl: -17, v: 3, len: 0.3, rev: 0.1,
    fn(S, t) {
      S.grains({ t, dur: 0.1, rate: 900, glen: 0.001, peak: 0.8, f: [['bp', S.r(1800, 2400), 0.7]] });
      S.tone({ f: 210, f1: 150, ft: 0.04, t, a: 0.001, d: 0.1, peak: 0.6 });
      S.noise({ t, a: 0.0005, d: 0.02, peak: 0.5, color: 'pink', f: [['bp', 1000, 1]] });
    } },

  pinata_break: { lvl: -15, len: 1.2, ch: 2, rev: 0.2, jit: 0.01,
    fn(S, t) {
      S.noise({ t, a: 0.0005, d: 0.06, peak: 0.9, f: [['bp', 1500, 0.6]] });
      S.thump({ t, f0: 180, f1: 80, d: 0.12, peak: 0.6, click: 0 });
      S.grains({ t, dur: 0.5, rate: (x) => 600 * (1 - x) + 50, glen: 0.002, peak: 0.5, f: [['bp', 2600, 0.8]] });
      for (let i = 0; i < 18; i++) S.modal({ t: t + 0.1 + S.r(0, 0.8), f: S.r(1800, 3600), ratios: [1, 2.3], amps: [1, 0.3], decays: [S.r(0.03, 0.07), 0.02], peak: S.r(0.1, 0.3), to: S.pan(S.r(-0.7, 0.7)) });
      S.sparkle({ t: t + 0.05, n: 5, spread: 0.4, fmin: 3000, fmax: 7000, peak: 0.08, pan: 0.6 });
    } },

  referee_whistle: { lvl: -18, len: 0.75, rev: 0.15, sr: 'hi', jit: 0.01,
    fn(S, t) {
      const D = 0.55;
      const trem = S.gain(0.8);
      S.lfo(34, 0.2, trem.gain, t, t + D + 0.02);
      const g = S.gain(0, trem);
      envPoints(g.gain, t, [[0, 0], [0.02, 0.8], [D - 0.05, 0.75], [D, 0]]);
      const o = S.osc('sine', 2700, t, t + D + 0.02, g);
      o.frequency.exponentialRampToValueAtTime(3050, t + 0.03);
      S.lfo(34, 160, o.frequency, t, t + D + 0.02, 'triangle');
      const o2g = S.gain(0.08, g);
      const o2 = S.osc('sine', 6100, t, t + D + 0.02, o2g);
      S.lfo(34, 320, o2.frequency, t, t + D + 0.02, 'triangle');
      S.noise({ t, pts: [[0, 0], [0.02, 0.18], [D - 0.05, 0.15], [D, 0]], f: [['bp', 3050, 3]] });
    } },

  jukebox: { lvl: -20, len: 1.0, rev: 0.12, jit: 0,
    fn(S, t) {
      const g = S.gain(0);
      envPoints(g.gain, t, [[0, 0], [0.01, 0.7], [0.12, 0.7], [0.14, 0.1], [0.16, 0.7], [0.3, 0.6], [0.34, 0]]);
      const b = S.bp(1200, 1.5, g);
      const fp = [[0, 600], [0.12, 2400, 'e'], [0.16, 500, 'e'], [0.3, 2000, 'e']];
      envPoints(b.frequency, t, fp);
      S.noiseSrc('pink', t, t + 0.36, b);
      const vb = S.bp(900, 2, g);
      const o = S.osc('sawtooth', 200, t, t + 0.36, vb);
      envPoints(o.frequency, t, [[0, 120], [0.12, 420, 'e'], [0.16, 90, 'e'], [0.3, 360, 'e']]);
      S.metal({ t: t + 0.45, f: 700, d: 0.06, peak: 0.5, strike: 0.6, n: 3 });
      S.thump({ t: t + 0.45, f0: 200, f1: 120, d: 0.06, peak: 0.4, click: 0 });
      S.tone({ type: 'sawtooth', f: 40, f1: 120, ft: 0.4, t: t + 0.5, a: 0.05, d: 0.3, hold: 0.1, peak: 0.08, to: S.lp(600) });
    } },

  glass_clink: { lvl: -23, v: 2, len: 0.8, rev: 0.2, sr: 'hi',
    fn(S, t) {
      const f = S.r(2900, 3300);
      S.modal({ t, f, ratios: [1, 2.38, 4.1, 6.2], amps: [1, 0.4, 0.15, 0.06], decays: [0.6, 0.3, 0.15, 0.08], peak: 0.7 });
      S.modal({ t: t + 0.002, f: f * 1.06, ratios: [1, 2.4], amps: [0.6, 0.2], decays: [0.5, 0.2], peak: 0.5 });
    } },

  bubbles: { lvl: -25.5, v: 2, len: 1.0, rev: 0.15,
    fn(S, t) {
      S.bubbles({ t, n: 14, spread: 0.8, fmin: 300, fmax: 1100, peak: 0.5, d: 0.07 });
      S.noise({ t, a: 0.1, d: 0.5, hold: 0.2, peak: 0.08, color: 'brown', f: [['lp', 400]] });
    } },

  taunt: { lvl: -19, len: 1.2, rev: 0.15, jit: 0,
    fn(S, t) {
      mute(S, 67, t, 0.2, 0.95, S.out, { wah: 1500 });
      bone(S, 62, t + 0.27, 0.55, 0.85, S.out, { wah: 6, fall: 2 });
    } },

  snail_pickup: { lvl: -21, len: 0.9, rev: 0.2, sr: 'hi', jit: 0.01,
    fn(S, t) {
      S.modal({ t, f: 2794, ratios: [1, 2.32, 3.71], amps: [1, 0.4, 0.2], decays: [0.35, 0.15, 0.08], peak: 0.7 });
      S.modal({ t: t + 0.07, f: 3729, ratios: [1, 2.32], amps: [1, 0.3], decays: [0.4, 0.12], peak: 0.6 });
      S.sparkle({ t: t + 0.08, n: 6, spread: 0.4, fmin: 4000, fmax: 9000, peak: 0.12, rising: true });
    } },
};
