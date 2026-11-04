// Mantis Mayhem audio — sustained loops for Audio.loopStart(name, opts).
// start(S, E, o, t) -> { tick(horizon), stop(t) }.
//   S: Synth that tracks continuous sources (stopped on loopStop); E: Synth for one-shot events
//   (bubbles, heartbeats, squelches) scheduled with lookahead from tick().

import { glide, envPoints } from './synth.js';
import { playDrum } from './instruments.js';

export const LOOPS = {
  /** Creaking strain of an exoskeleton being stretched. */
  molt_loop: {
    gain: 0.83, rev: 0.15,
    start(S, E, o, t) {
      const p = o.pitch || 1;
      const r = S.res([[520 * p, 9, 1], [1150 * p, 12, 0.6], [2300 * p, 9, 0.3]]);
      const cr = S.pulses({ t, dur: 3.2, width: 0.0007, jit: 0.22, peak: 3.5, to: r,
        rate: (x) => 30 + 34 * Math.pow(Math.sin(x * Math.PI * 4), 2) + 9 * Math.sin(x * 43),
        amp: (x) => 0.55 + 0.45 * Math.abs(Math.sin(x * Math.PI * 6)) });
      cr.src.loop = true;
      const gl = S.lp(650 * p, 2);
      const gg = S.gain(0.1, gl);
      const osc = S.osc('sawtooth', 92 * p, t, null, gg);
      S.lfo(3.1, 3 * p, osc.frequency, t, null);
      S.lfo(0.7, 0.05, gg.gain, t, null);
      let next = t + 0.25;
      return {
        tick(h) {
          while (next < h) {
            E.noise({ t: next, a: 0.02, d: 0.12, peak: 0.3, color: 'pink', f: [['bp', E.r(1300, 2000) * p, 4, E.r(350, 520) * p, 0.14]] });
            next += E.r(0.35, 0.8);
          }
        },
      };
    },
  },

  /** Rising tension hum: pitch climbs an octave over ~1.1 s, then trembles. */
  charge_loop: {
    gain: 0.09, rev: 0.12,
    start(S, E, o, t) {
      const p = o.pitch || 1, T = 1.1;
      const lpf = S.lp(300, 4);
      envPoints(lpf.frequency, t, [[0, 300], [T * 1.1, 2600, 'e']]);
      const trem = S.gain(0.75, lpf);
      const tl = S.lfo(6, 0.25, trem.gain, t, null);
      glide(tl.o.frequency, t, 6, 15, T);
      for (const det of [-12, 0, 12]) {
        const osc = S.osc('sawtooth', 110 * p, t, null, trem);
        osc.detune.value = det;
        glide(osc.frequency, t, 110 * p, 220 * p, T);
        const v = S.lfo(9, 0, osc.frequency, t, null);
        v.g.gain.setValueAtTime(0, t + T);
        v.g.gain.linearRampToValueAtTime(220 * p * 0.012, t + T + 0.3);
      }
      const wg = S.gain(0.035);
      const wh = S.osc('sine', 880 * p, t, null, wg);
      glide(wh.frequency, t, 880 * p, 1760 * p, T);
      S.lfo(14, 0.02, wg.gain, t, null);
      const sg = S.gain(0.22);
      const sub = S.osc('sine', 55 * p, t, null, sg);
      glide(sub.frequency, t, 55 * p, 110 * p, T);
      return {};
    },
  },

  /** QTE: heartbeat + low beating drone + eerie high tone. */
  qte_tension: {
    gain: 0.32, rev: 0.12,
    start(S, E, o, t) {
      const p = o.pitch || 1;
      const lpf = S.lp(320, 1.2);
      const dg = S.gain(0.28, lpf);
      S.osc('sawtooth', 55 * p, t, null, dg);
      S.osc('sawtooth', 55.6 * p, t, null, dg);
      const sg = S.gain(0.14);
      S.osc('sine', 110 * p, t, null, sg);
      const hg = S.gain(0.02);
      const hi = S.osc('sine', 1318 * p, t, null, hg);
      S.lfo(5.5, 9, hi.frequency, t, null);
      const rate = o.bpm ? 60 / o.bpm : 0.82;
      let next = t + 0.05;
      return {
        tick(h) {
          while (next < h) { playDrum(E, 'heart', next, 0.9, E.out); next += rate; }
        },
      };
    },
  },

  /** Bubbling vent column. */
  bubble_vent: {
    gain: 0.43, rev: 0.2,
    start(S, E, o, t) {
      const p = o.pitch || 1;
      const rg = S.gain(0.4, S.lp(260, 0.7));
      S.noiseSrc('brown', t, null, rg);
      const hg = S.gain(0.035, S.bp(2500, 0.7));
      S.noiseSrc('white', t, null, hg);
      let next = t + 0.02;
      return {
        tick(h) {
          while (next < h) {
            E.bubble({ t: next, f: E.r(280, 1100) * p, rise: E.r(1.4, 2.3), d: E.r(0.03, 0.08), peak: E.r(0.1, 0.35) });
            next += -Math.log(1 - E.rng() * 0.98) / 22;
          }
        },
      };
    },
  },

  /** Whirling spin (ultimate): swept noise rotating L/R + rising whine with tremolo. */
  ult_spin: {
    gain: 1.17, rev: 0.2,
    start(S, E, o, t) {
      const p = o.pitch || 1;
      const pan = S.pan(0);
      if (pan.pan) S.lfo(1.6, 0.8, pan.pan, t, null);
      const nb = S.bp(900 * p, 3, null);
      const ng = S.gain(0.7, pan);
      nb.connect(ng);
      S.lfo(6, 600 * p, nb.frequency, t, null);
      S.noiseSrc('pink', t, null, nb);
      const tg = S.gain(0.1, S.lp(1400, 1, pan));
      S.lfo(12, 0.06, tg.gain, t, null);
      const osc = S.osc('sawtooth', 180 * p, t, null, tg);
      glide(osc.frequency, t, 180 * p, 360 * p, 2);
      const wg = S.gain(0.025, pan);
      const wh = S.osc('sine', 1200 * p, t, null, wg);
      S.lfo(6, 220 * p, wh.frequency, t, null);
      return {};
    },
  },
};
