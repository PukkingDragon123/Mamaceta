// Mantis Mayhem audio — "Animal Crossing" style dialogue babble.
// Text is split into syllables (onset consonants + vowel nucleus); each syllable is a short blip:
// a glottal source (saw / pulse / custom wave) through two band-pass formants picked from its vowel,
// with a consonant noise burst, per-character pitch, range, timbre and intonation (?, !, CAPS).

import { envPoints, glide } from './synth.js';
import { hashStr, makeRng, clamp, tanhCurve } from './dsp.js';
import { Synth } from './synth.js';

/** Per-character voice settings. base Hz, range ±semitones, rate = speed factor, fs = formant scale. */
export const VOICES = {
  jim: { base: 185, range: 3, rate: 1.1, wave: '~pulse25', fs: 1.06, q1: 7, q2: 10, nasal: 1, glide: [0.98, 1.05], gain: 0.88 },
  brutus: { base: 72, range: 2, rate: 0.72, wave: '~soft', fs: 0.76, q1: 5, q2: 7, lp: 1300, glide: [1.0, 0.95], gain: 0.59, body: 0.55 },
  bobby: { base: 360, range: 9, rate: 1.25, wave: 'square', fs: 1.3, q1: 6, q2: 9, erratic: 1, glide: [0.9, 1.15], gain: 0.78 },
  mimi: { base: 430, range: 4, rate: 1.12, wave: 'triangle', fs: 1.32, q1: 6, q2: 9, bounce: 4, glide: [0.96, 1.08], gain: 0.57 },
  molt: { base: 205, range: 3, rate: 0.88, wave: 'sawtooth', fs: 1.08, q1: 7, q2: 10, vib: [5.6, 0.03], rasp: 0.35, glide: [1.03, 0.96], gain: 1.75 },
  ref: { base: 118, range: 2.5, rate: 1.12, wave: 'sawtooth', fs: 0.92, q1: 6, q2: 8, drive: 2.5, rasp: 0.12, glide: [1.0, 0.93], gain: 1.32 },
  bartender: { base: 96, range: 2, rate: 0.85, wave: '~voice', fs: 0.86, q1: 6, q2: 8, lp: 2300, glide: [1.0, 0.97], gain: 0.66, body: 0.4 },
  demon: { base: 56, range: 2, rate: 0.62, wave: 'sawtooth', fs: 0.68, q1: 7, q2: 9, drive: 3.5, sub: 0.6, rasp: 0.16, glide: [1.0, 0.9], gain: 0.48, body: 0.4, lp: 1100 },
  puru: { base: 980, range: 5, rate: 1.3, squeak: 1, gain: 0.8 },
};

const FORMANTS = { a: [730, 1090], e: [530, 1840], i: [300, 2250], o: [570, 860], u: [330, 900], y: [300, 2100] };
const ACC = { á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ñ: 'n', ç: 's' };
const DIGIT = ['o', 'a', 'u', 'i', 'o', 'a', 'i', 'e', 'e', 'a'];

function consClass(c) {
  if (!c) return 'none';
  if ('pbtdkgcq'.includes(c)) return 'plosive';
  if ('szfvhxj'.includes(c)) return 'fric';
  if ('mn'.includes(c)) return 'nasal';
  return 'liquid';
}
const FRIC_F = { s: 5500, z: 5000, x: 4500, j: 3200, f: 2600, v: 2200, h: 1500 };

function syllabify(word) {
  const w = word.toLowerCase().split('').map((c) => ACC[c] || c).join('').replace(/[^a-z0-9]/g, '');
  if (!w) return [];
  if (/^\d+$/.test(w)) return w.split('').map((d) => ({ onset: 'n', nucleus: DIGIT[+d] }));
  const out = [];
  const re = /([^aeiouy]*)([aeiouy]+)/g;
  let m, last = 0;
  while ((m = re.exec(w))) { out.push({ onset: m[1], nucleus: m[2] }); last = re.lastIndex; }
  const coda = w.slice(last);
  if (!out.length) out.push({ onset: w, nucleus: 'u', hum: true });
  else if (coda) out[out.length - 1].coda = coda;
  return out.slice(0, 8);
}

/** Pure planning step (no audio): syllable list with times + total duration. */
export function planUtterance(who, text, opts = {}) {
  const P = VOICES[who] || VOICES.jim;
  const speed = clamp(+(opts.speed ?? 1) || 1, 0.25, 4);
  const sd = 1 / (14 * speed * P.rate);
  const rng = makeRng(hashStr(who + '|' + text));
  const syl = [];
  let t = 0, sentence = [];
  const s = String(text ?? '').slice(0, 600);
  const tokens = s.match(/[\p{L}\p{N}']+|\.\.\.|…|[.!?]+|[,;:]|[—–-]|\n|\s+|./gu) || [];
  let wordIdx = 0;
  const endSentence = (mark) => {
    if (!sentence.length) return;
    const n = sentence.length;
    sentence.forEach((x, i) => { x.semi -= 1.6 * (i / Math.max(1, n - 1)); });
    if (mark === '?') {
      const a = sentence[n - 1], b = sentence[n - 2];
      a.semi += 4; a.g1 = 1.18;
      if (b) b.semi += 1.5;
    } else if (mark === '!') {
      const w = sentence[n - 1].word;
      for (const x of sentence) if (x.word === w) { x.semi += 2; x.vel = Math.min(1, x.vel * 1.15); }
      sentence[n - 1].g1 = 0.92;
    }
    sentence = [];
  };
  for (const tok of tokens) {
    if (/^\s+$/u.test(tok)) { t += tok.includes('\n') ? 0.2 / speed : sd * 0.3; continue; }
    if (/^[\p{L}\p{N}']+$/u.test(tok)) {
      const caps = tok.length > 1 && tok === tok.toUpperCase() && /\p{L}/u.test(tok);
      const parts = syllabify(tok);
      parts.forEach((p, i) => {
        let semi = (rng() * 2 - 1) * P.range * 0.55 + (i === 0 ? P.range * 0.25 : 0);
        if (P.erratic) semi = (rng() * 2 - 1) * P.range;
        if (P.bounce) semi += (syl.length % 2 ? -1 : 1) * P.bounce * 0.5;
        if (caps) semi += 2;
        const dur = sd * (0.82 + rng() * 0.32) * (p.coda ? 1.12 : 1) * (p.hum ? 1.4 : 1);
        const x = {
          t, dur, vowel: p.nucleus[0], v2: p.nucleus[1] || null, cons: consClass(p.onset[0]), onset: p.onset[0] || '',
          coda: p.coda ? consClass(p.coda[p.coda.length - 1]) : null, semi, vel: (caps ? 1 : 0.85) * (0.88 + rng() * 0.12),
          g0: (P.glide ? P.glide[0] : 1) * (1 + (rng() - 0.5) * 0.03), g1: (P.glide ? P.glide[1] : 1) * (1 + (rng() - 0.5) * 0.04), hum: !!p.hum, word: wordIdx,
        };
        syl.push(x);
        sentence.push(x);
        t += dur;
      });
      wordIdx++;
      continue;
    }
    if (tok === '...' || tok === '…') { endSentence('.'); t += 0.42 / speed; continue; }
    if (/^[.!?]+$/.test(tok)) { endSentence(tok.includes('?') ? '?' : tok.includes('!') ? '!' : '.'); t += 0.3 / speed; continue; }
    if (/^[,;:]$/.test(tok)) { t += 0.16 / speed; continue; }
    if (/^[—–-]$/.test(tok)) { t += 0.1 / speed; continue; }
  }
  endSentence('.');
  if (syl.length > 360) syl.length = 360;
  const last = syl[syl.length - 1];
  const total = Math.max(t, last ? last.t + last.dur : 0);
  return { P, syl, total };
}

/** Render one syllable at absolute time t into `to`. */
export function renderSyllable(S, P, s, t, to) {
  const f0 = P.base * Math.pow(2, s.semi / 12);
  const dur = Math.max(0.03, s.dur * 0.92);
  const vel = s.vel * P.gain;
  if (P.squeak) {
    S.tone({ f: f0 * 0.85, fpts: [[dur * 0.4, f0 * 1.25], [dur * 0.9, f0 * 1.05]], t, a: 0.004, d: dur * 0.55, hold: dur * 0.25, peak: vel * 0.5, to, vib: { rate: 24, depth: 0.03 } });
    return;
  }
  const delay = s.cons === 'fric' ? 0.022 : 0;
  const tv = t + delay;
  const dv = Math.max(0.025, dur - delay);
  // consonant
  if (s.cons === 'fric') {
    const ff = FRIC_F[s.onset] || 3000;
    S.noise({ t, a: 0.006, d: 0.035, peak: vel * (s.onset === 'h' ? 0.12 : 0.2), f: [['bp', ff, 1.8]], to });
  } else if (s.cons === 'plosive') {
    S.noise({ t, a: 0.0008, d: 0.012, peak: vel * 0.25, f: [['bp', s.onset === 't' || s.onset === 'd' ? 3000 : 1600, 1.2]], to });
  }
  // envelope
  const g = S.gain(0, to);
  const a = s.cons === 'plosive' ? 0.004 : s.cons === 'nasal' ? 0.022 : 0.012;
  envPoints(g.gain, tv, [[0, 0], [a, vel], [dv * 0.62, vel * 0.82], [dv, 0]]);
  // formants
  const [F1, F2] = FORMANTS[s.vowel] || FORMANTS.u;
  const fs = P.fs;
  const b1 = S.bp(F1 * fs, P.q1, g);
  const b2g = S.gain(P.nasal ? 0.55 : 0.7, g);
  const b2 = S.bp(F2 * fs, P.q2, b2g);
  if (s.v2 && FORMANTS[s.v2]) {
    const [G1, G2] = FORMANTS[s.v2];
    glide(b1.frequency, tv + dv * 0.3, F1 * fs, G1 * fs, dv * 0.6);
    glide(b2.frequency, tv + dv * 0.3, F2 * fs, G2 * fs, dv * 0.6);
  }
  if (s.cons === 'nasal') { b2.frequency.setValueAtTime(900 * fs, tv); b2.frequency.exponentialRampToValueAtTime(F2 * fs, tv + 0.04); }
  const pre = S.gain(1, null);
  pre.connect(b1); pre.connect(b2);
  if (P.nasal) { const nz = S.gain(0.4, g); const nb = S.bp(1050 * fs, 5, nz); pre.connect(nb); }
  if (P.body) { const bg = S.gain(P.body, g); const bl = S.lp(P.lp || 900, 0.7, bg); pre.connect(bl); }
  let src = pre;
  if (P.drive) src = S.shaper(tanhCurve(P.drive), pre);
  // source
  const osc = S.osc(P.wave, f0 * s.g0, tv, tv + dv + 0.02, src);
  glide(osc.frequency, tv, f0 * s.g0, f0 * s.g1, dv);
  if (P.vib) S.lfo(P.vib[0] * (0.9 + (s.semi % 1) * 0.1), f0 * P.vib[1], osc.frequency, tv, tv + dv + 0.02);
  if (P.sub) { const sg = S.gain(P.sub, src); const so = S.osc('square', f0 * 0.5 * s.g0, tv, tv + dv + 0.02, sg); glide(so.frequency, tv, f0 * 0.5 * s.g0, f0 * 0.5 * s.g1, dv); }
  if (P.rasp) { // breathy noise, amplitude-modulated near the pitch rate (old / gruff rasp)
    const am = S.gain(0.6, src);
    S.lfo(f0 * 0.5, 0.4, am.gain, tv, tv + dv + 0.02, 'square');
    const rg = S.gain(P.rasp, am);
    S.noiseSrc('pink', tv, tv + dv + 0.02, rg);
  }
  if (s.coda === 'plosive') S.noise({ t: tv + dv * 0.92, a: 0.0006, d: 0.01, peak: vel * 0.15, f: [['bp', 2200, 1.2]], to });
}

/** Live/offline player for one utterance; scheduled from the engine pump. */
export class VoicePlayer {
  constructor(engine, who, text, opts = {}) {
    const ctx = engine.ctx;
    this.ctx = ctx;
    this.plan = planUtterance(who, text, opts);
    this.out = ctx.createGain();
    this.out.gain.value = clamp(opts.vol ?? 1, 0, 4);
    this.out.connect(engine.voiceIn);
    const send = ctx.createGain();
    send.gain.value = who === 'demon' ? 0.35 : 0.06;
    this.out.connect(send);
    send.connect(engine.sfxRevIn);
    this.S = new Synth(ctx, this.out, { rng: makeRng(hashStr(who + text)) });
    this.t0 = ctx.currentTime + 0.03;
    this.i = 0;
    this.killAt = Infinity;
  }
  schedule(horizon) {
    const syl = this.plan.syl;
    while (this.i < syl.length && this.t0 + syl[this.i].t < horizon) {
      try { renderSyllable(this.S, this.plan.P, syl[this.i], Math.max(this.ctx.currentTime, this.t0 + syl[this.i].t), this.out); } catch (e) { /* keep going */ }
      this.i++;
    }
  }
  get finished() { return this.i >= this.plan.syl.length && this.ctx.currentTime > this.t0 + this.plan.total + 0.3; }
  stop(fade = 0.05) {
    const now = this.ctx.currentTime;
    this.i = this.plan.syl.length;
    const p = this.out.gain;
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
    p.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    this.killAt = now + fade + 0.4;
  }
  dispose() { try { this.out.disconnect(); } catch (e) { /* ok */ } }
}
