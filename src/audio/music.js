// Mantis Mayhem audio — music sequencer.
//  * tiny music theory (notes, chords, keys, voicings)
//  * a compile-time pattern Builder (melody notation, drum/bass/arp/strum patterns, pads, walking bass)
//  * MusicPlayer: 16th-note lookahead scheduler with swing, humanisation, intensity layers, tape slow-mo.

import { Synth } from './synth.js';
import { INST, depsFor } from './instruments.js';
import { clamp } from './dsp.js';

// ====================================================================== theory
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteMidi(s) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  const pc = PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

function pcOf(s) {
  const m = /^([A-G])([#b]?)/.exec(s);
  return m ? (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12 : 0;
}

const QUAL = {
  '': [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  '7b9': [0, 4, 7, 10, 13], add9: [0, 4, 7, 14], '7#9': [0, 4, 7, 10, 15], '13': [0, 4, 7, 10, 14, 21],
  m11: [0, 3, 7, 10, 14, 17], '5': [0, 7], '7sus4': [0, 5, 7, 10], mmaj7: [0, 3, 7, 11],
};

const chordCache = new Map();
export function parseChord(name, warn) {
  if (chordCache.has(name)) return chordCache.get(name);
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(name);
  let root = 0, iv = [0, 4, 7], bass = null;
  if (!m || !QUAL[m[2]]) { if (warn) warn(`bad chord "${name}"`); }
  if (m) { root = pcOf(m[1]); iv = QUAL[m[2]] || iv; bass = m[3] ? pcOf(m[3]) : null; }
  const c = { name, root, iv, pcs: [...new Set(iv.map((i) => (root + i) % 12))], bass: bass ?? root };
  chordCache.set(name, c);
  return c;
}

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygdom: [0, 1, 4, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
};
export function parseKey(k) {
  const [r, mode = 'major'] = k.split(' ');
  const root = pcOf(r);
  return (SCALES[mode] || SCALES.major).map((i) => (root + i) % 12);
}

/** Move a note by `steps` scale degrees (diatonic harmony). Chromatic notes fall back to a minor 3rd. */
export function diatonic(m, scale, steps) {
  const root = scale[0];
  const offs = scale.map((pc) => (((pc - root) % 12) + 12) % 12); // ascending semitones above the key root
  const idx = offs.indexOf((((m % 12) - root) % 12 + 12) % 12);
  if (idx < 0) return m + (steps < 0 ? -3 : 3);
  const n = offs.length;
  const tgt = idx + steps;
  const oct = Math.floor(tgt / n);
  return m + offs[((tgt % n) + n) % n] - offs[idx] + 12 * oct;
}

/** All chord tones within [lo, hi]. */
export function chordTones(ch, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (ch.pcs.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

/** Root in [lo, lo+11]. */
function rootIn(pc, lo) { return lo + ((pc - lo) % 12 + 12) % 12; }

/** Guitar-ish voicing: bass note + 3–5 chord tones in a mid register. */
export function guitarVoicing(ch, lo = 40, top = 67) {
  const bass = rootIn(ch.bass, lo);
  const upper = chordTones(ch, Math.max(bass + 5, 52), top).slice(-5);
  return [bass, ...upper];
}

/** Closed voicing of n notes starting from the lowest chord tone >= lo. */
export function closeVoicing(ch, lo, n = 3) {
  const tones = chordTones(ch, lo, lo + 24);
  return tones.slice(0, n);
}

// ====================================================================== builder (compile time)
const DRUMV = { X: 1, x: 0.75, o: 0.5, g: 0.3 };

function parseChordLine(str, bars, warn) {
  const spans = [];
  const parts = (str || 'C').split('|').map((s) => s.trim()).filter(Boolean);
  let prev = null;
  for (let b = 0; b < bars; b++) {
    let seg = parts[b % parts.length];
    if (seg === '%' && prev) seg = prev;
    prev = seg;
    const toks = seg.split(/\s+/).filter(Boolean);
    const lens = toks.map((t) => (t.includes(':') ? parseFloat(t.split(':')[1]) : null));
    const fixed = lens.reduce((a, l) => a + (l || 0), 0);
    const free = lens.filter((l) => l == null).length;
    let pos = b * 16;
    toks.forEach((t, i) => {
      const len = lens[i] ?? (16 - fixed) / Math.max(1, free);
      spans.push({ ch: parseChord(t.split(':')[0], warn), start: pos, len });
      pos += len;
    });
  }
  return spans;
}

class Builder {
  constructor(track, name, sec) {
    this.track = track;
    this.name = name;
    this.bars = sec.bars;
    this.len = sec.bars * 16;
    this.warn = (m) => track.warnings.push(`${track.name}/${name}: ${m}`);
    this.spans = parseChordLine(sec.chords, sec.bars, this.warn);
    this.scale = track.scale;
    this.events = [];
  }
  spanAt(step) {
    for (const s of this.spans) if (step >= s.start && step < s.start + s.len) return s;
    return this.spans[this.spans.length - 1];
  }
  chordAt(step) { return this.spanAt(step).ch; }
  nextChord(step) {
    const i = this.spans.indexOf(this.spanAt(step));
    return this.spans[(i + 1) % this.spans.length].ch;
  }
  /** Diatonic harmony that never clashes with the chord underneath (falls back to a chord tone). */
  harmNote(m, step, steps) {
    const ch = this.chordAt(step);
    const isCT = (x) => ch.pcs.includes(((x % 12) + 12) % 12);
    let h = diatonic(m, this.scale, steps);
    if (isCT(m) && !isCT(h)) {
      const dir = steps < 0 ? -1 : 1;
      for (let x = m + 3 * dir; Math.abs(x - m) < 10; x += dir) if (isCT(x)) { h = x; break; }
    }
    return h;
  }
  barList(o) { if (o.bars) return o.bars; const a = []; for (let i = 0; i < this.bars; i++) a.push(i); return a; }
  push(ev) { this.events.push(ev); return ev; }

  /** Melody: "E5:4 D5:2 r:2 C5+E5:4! _:2 ..." (lengths in 16ths, carried over). */
  mel(ch, str, o = {}) {
    const start = (o.bar || 0) * 16 + (o.at || 0);
    let step = start, len = o.len || 4, last = null;
    const tr = (o.tr || 0) + 12 * (o.oct || 0);
    for (let tok of str.split(/\s+/)) {
      if (!tok || tok === '|') continue;
      let vel = o.vel ?? 0.8;
      if (tok.endsWith('!')) { vel *= 1.22; tok = tok.slice(0, -1); } else if (tok.endsWith('~')) { vel *= 0.68; tok = tok.slice(0, -1); }
      const [body, l] = tok.split(':');
      if (l) len = parseFloat(l);
      if (body === 'r') { step += len; last = null; continue; }
      if (body === '_') { if (last) { last.len += len; if (last.h) last.h.len += len; } step += len; continue; }
      const midis = body.split('+').map(noteMidi);
      if (midis.some((m) => m == null)) { this.warn(`bad note "${tok}"`); step += len; continue; }
      const notes = midis.map((m) => m + tr);
      const ev = this.push(notes.length > 1 ? { ch, step, len, vel, midis: notes } : { ch, step, len, vel, midi: notes[0] });
      if (o.harm) {
        const hm = notes.map((m) => this.harmNote(m, step, o.harm));
        ev.h = this.push(hm.length > 1 ? { ch: o.harmCh || ch, step, len, vel: vel * (o.harmVel ?? 0.8), midis: hm } : { ch: o.harmCh || ch, step, len, vel: vel * (o.harmVel ?? 0.8), midi: hm[0] });
      }
      if (o.trem && len >= o.trem && !ev.midis) { // marimba-style tremolo roll on long notes
        for (let k = 1; k < len * 2 - 1; k++) this.push({ ch, step: step + (k >> 1), dt: (k & 1) * 0.5, len: 1, vel: vel * (0.4 + 0.12 * (k & 1)), midi: ev.midi, roll: 1 });
        ev.roll = 1;
      }
      last = ev;
      step += len;
    }
    const used = step - start;
    if (o.expect != null ? used !== o.expect : used % 16 !== 0) this.warn(`melody on ${ch} spans ${used} steps`);
    if (start + used > this.len) this.warn(`melody on ${ch} overruns section (${start + used} > ${this.len})`);
    for (const ev of this.events) delete ev.h;
    return this;
  }

  /** Drum pattern: chars X x o g . (16 per bar, repeats). o.map: {char: [drum, vel]}. */
  drum(ch, pat, o = {}) {
    const p = pat.replace(/[\s|]/g, '');
    for (const b of this.barList(o)) {
      for (let s = 0; s < 16; s++) {
        const c = p[(b * 16 + s) % p.length];
        let drum = o.drum, v = DRUMV[c];
        if (o.map && o.map[c]) { [drum, v] = o.map[c]; }
        if (v == null || !drum) continue;
        this.push({ ch, step: b * 16 + s, len: 1, vel: v * (o.vel ?? 1), drum, prob: o.prob });
      }
    }
    return this;
  }

  /** Snare-style roll from step for n steps (32nds), crescendo v0->v1. */
  roll(ch, drum, step, n, v0 = 0.2, v1 = 0.8, per = 2) {
    const total = n * per;
    for (let i = 0; i < total; i++) {
      const s = step + Math.floor(i / per);
      this.push({ ch, step: s, dt: (i % per) / per, len: 1, vel: v0 + (v1 - v0) * (i / total), drum });
    }
    return this;
  }

  degree(c, chd, abs, lo) {
    const root = rootIn(chd.bass, lo);
    switch (c) {
      case 'R': case 'r': return root;
      case '5': return rootIn((chd.root + 7) % 12, lo) < root ? rootIn((chd.root + 7) % 12, lo) + 12 : rootIn((chd.root + 7) % 12, lo);
      case 'f': return rootIn((chd.root + 7) % 12, lo) > root ? rootIn((chd.root + 7) % 12, lo) - 12 : rootIn((chd.root + 7) % 12, lo);
      case '3': { const t = rootIn((chd.root + chd.iv[1]) % 12, lo); return t < root ? t + 12 : t; }
      case '7': { const iv = chd.iv[3] ?? 10; const t = rootIn((chd.root + iv) % 12, lo); return t < root ? t + 12 : t; }
      case '8': return root + 12;
      case '>': return rootIn(this.nextChord(abs).bass, lo) - 1;
      case '<': return rootIn(this.nextChord(abs).bass, lo) + 1;
      case 'n': return rootIn(this.nextChord(abs).bass, lo) - 2;
      default: return null;
    }
  }

  /** Bass pattern over chords: R r 5 f 3 7 8 > < n, '-' hold, '.' rest. */
  bass(ch, pat, o = {}) {
    const p = pat.replace(/[\s|]/g, '');
    const lo = o.lo ?? 31;
    let prev = null;
    for (const b of this.barList(o)) {
      for (let s = 0; s < 16; s++) {
        const abs = b * 16 + s;
        const c = p[abs % p.length];
        if (c === '-') { if (prev) prev.len++; continue; }
        if (c === '.') { prev = null; continue; }
        const midi = this.degree(c, this.chordAt(abs), abs, lo);
        if (midi == null) { prev = null; continue; }
        prev = this.push({ ch, step: abs, len: 1, vel: (o.vel ?? 0.85) * (c === 'r' ? 0.7 : 1), midi });
      }
      prev = o.tie ? prev : null;
    }
    return this;
  }

  /** Arpeggio: digits index the chord tones in [lo, hi]; '-' hold; '.' rest. o.ring lets notes ring. */
  arp(ch, pat, o = {}) {
    const p = pat.replace(/[\s|]/g, '');
    const lo = o.lo ?? 48, hi = o.hi ?? 76;
    let prev = null;
    for (const b of this.barList(o)) {
      for (let s = 0; s < 16; s++) {
        const abs = b * 16 + s;
        const c = p[abs % p.length];
        if (c === '-') { if (prev) prev.len++; continue; }
        if (c === '.') { prev = null; continue; }
        const idx = parseInt(c, 16);
        if (isNaN(idx)) { prev = null; continue; }
        const tones = o.gv ? guitarVoicing(this.chordAt(abs), o.lo ?? 40, o.top ?? 67) : chordTones(this.chordAt(abs), lo, hi);
        const midi = tones[Math.min(idx, tones.length - 1)];
        prev = this.push({ ch, step: abs, len: o.ring || 1, vel: (o.vel ?? 0.7) * (s % 4 === 0 ? 1.1 : 1), midi, kind: 'n' });
      }
    }
    return this;
  }

  /** Strum pattern: D d U u x, '-' hold, '.' rest. */
  strum(ch, pat, o = {}) {
    const p = pat.replace(/[\s|]/g, '');
    let prev = null;
    for (const b of this.barList(o)) {
      for (let s = 0; s < 16; s++) {
        const abs = b * 16 + s;
        const c = p[abs % p.length];
        if (c === '-') { if (prev) prev.len++; continue; }
        if (c === '.') { prev = null; continue; }
        if (!'DdUux'.includes(c)) { prev = null; continue; }
        const midis = guitarVoicing(this.chordAt(abs), o.lo ?? 40, o.top ?? 67);
        const vel = (o.vel ?? 0.7) * (c === 'D' || c === 'U' ? 1 : c === 'x' ? 0.8 : 0.65);
        prev = this.push({ ch, step: abs, len: o.ring || 1, vel, midis, kind: c });
      }
    }
    return this;
  }

  /** Chord hits (accordion/brass stabs): X x o, '-' hold, '.' rest. */
  hits(ch, pat, o = {}) {
    const p = pat.replace(/[\s|]/g, '');
    let prev = null;
    for (const b of this.barList(o)) {
      for (let s = 0; s < 16; s++) {
        const abs = b * 16 + s;
        const c = p[abs % p.length];
        if (c === '-') { if (prev) prev.len++; continue; }
        if (c === '.') { prev = null; continue; }
        const v = DRUMV[c];
        if (v == null) { prev = null; continue; }
        const midis = o.top ? chordTones(this.chordAt(abs), o.top - 12, o.top).slice(-(o.n ?? 3)) : closeVoicing(this.chordAt(abs), o.lo ?? 55, o.n ?? 3);
        prev = this.push({ ch, step: abs, len: 1, vel: v * (o.vel ?? 0.7), midis });
      }
    }
    return this;
  }

  /** Sustained chord per chord change. */
  pad(ch, o = {}) {
    const lo = o.lo ?? 55;
    for (const sp of this.spans) {
      if (o.bars && !o.bars.includes(Math.floor(sp.start / 16))) continue;
      let midis = closeVoicing(sp.ch, lo, o.n ?? 4);
      if (o.bass) midis = [rootIn(sp.ch.bass, o.bass), ...midis];
      this.push({ ch, step: sp.start, len: sp.len, vel: o.vel ?? 0.6, midis });
    }
    return this;
  }

  /** Walking bass in quarter notes with chromatic approach tones. */
  walk(ch, o = {}) {
    const lo = o.lo ?? 31, hi = o.hi ?? 55;
    let prevNote = null;
    for (const sp of this.spans) {
      const beats = Math.max(1, Math.round(sp.len / 4));
      const c = sp.ch;
      const next = this.nextChord(sp.start);
      let root = rootIn(c.bass, lo);
      if (prevNote != null && Math.abs(root + 12 - prevNote) < Math.abs(root - prevNote) && root + 12 <= hi) root += 12;
      const third = root + c.iv[1], fifth = root + (c.iv[2] ?? 7), sev = root + (c.iv[3] ?? 10);
      let nextRoot = rootIn(next.bass, lo);
      if (Math.abs(nextRoot + 12 - root) < Math.abs(nextRoot - root) && nextRoot + 12 <= hi) nextRoot += 12;
      const appr = nextRoot + (nextRoot > root ? -1 : 1);
      let line;
      if (beats >= 4) line = [root, (sp.start / 4) % 2 ? fifth : third, (sp.start / 4) % 2 ? sev : fifth, appr];
      else if (beats === 3) line = [root, fifth, appr];
      else if (beats === 2) line = [root, appr];
      else line = [root];
      for (let i = 0; i < beats; i++) {
        let m = line[Math.min(i, line.length - 1)];
        while (m > hi) m -= 12;
        while (m < lo) m += 12;
        this.push({ ch, step: sp.start + i * 4, len: 4, vel: (o.vel ?? 0.8) * (i === 0 ? 1.08 : i === 2 ? 0.95 : 0.88), midi: m });
        prevNote = m;
      }
    }
    return this;
  }

  /** Random ornaments: on given steps play a random note from `notes` with probability. */
  sprinkle(ch, o = {}) {
    for (const b of this.barList(o)) for (const s of o.steps || [0]) {
      this.push({ ch, step: b * 16 + s, len: o.len || 2, vel: o.vel ?? 0.5, choices: o.notes, midi: o.notes[0], prob: o.prob ?? 0.3 });
    }
    return this;
  }
}

/** Compile a track definition (from tracks.js) into per-step event tables. */
export function compileTrack(name, def) {
  const track = {
    name, bpm: def.bpm, stepDur: 60 / def.bpm / 4, swing8: def.swing8 || 0.5, swing16: def.swing16 || 0.5,
    gain: def.gain ?? 1, channels: def.channels, form: def.form, loopTo: def.loopTo ?? 0,
    scale: parseKey(def.key || 'C major'), secs: {}, warnings: [], deps: [],
  };
  const drums = new Set();
  for (const [sname, sec] of Object.entries(def.sections)) {
    const b = new Builder(track, sname, sec);
    sec.build(b);
    const byStep = new Array(b.len);
    for (const ev of b.events) {
      if (!def.channels[ev.ch]) { track.warnings.push(`${name}/${sname}: unknown channel ${ev.ch}`); continue; }
      if (ev.step < 0 || ev.step >= b.len) { track.warnings.push(`${name}/${sname}: event outside section at ${ev.step}`); continue; }
      if (ev.drum) drums.add(ev.drum);
      (byStep[ev.step] || (byStep[ev.step] = [])).push(ev);
    }
    track.secs[sname] = { len: b.len, byStep, count: b.events.length };
  }
  for (const f of track.form) if (!track.secs[f]) track.warnings.push(`${name}: form references missing section ${f}`);
  const deps = new Set();
  for (const c of Object.values(def.channels)) {
    if (!INST[c.inst]) track.warnings.push(`${name}: unknown instrument ${c.inst}`);
    for (const k of depsFor(c.inst, drums)) deps.add(k);
  }
  track.deps = [...deps];
  return track;
}

// ====================================================================== player
function layerLevel(layer, x) {
  const [a, b] = layer;
  return clamp((x - a) / (b - a), 0, 1);
}

export class MusicPlayer {
  constructor(engine, track) {
    const ctx = engine.ctx;
    this.e = engine;
    this.ctx = ctx;
    this.track = track;
    this.name = track.name;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(engine.musicIn);
    this.rev = ctx.createGain();
    this.rev.gain.value = 0;
    this.rev.connect(engine.musicRevIn);
    this.S = new Synth(ctx, this.out, { bank: engine.bank, bend: engine.musicBend });
    this.persist = [];
    this.ch = {};
    for (const [k, c] of Object.entries(track.channels)) this.ch[k] = this.makeChannel(c);
    this.fi = 0;
    this.step = 0;
    this.started = false;
    this.stopped = false;
    this.next = 0;
    this.fadeIn = 1;
    this.killAt = Infinity;
  }

  makeChannel(c) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = (c.gain ?? 0.5) * this.track.gain;
    let node = input;
    const ch = { def: c, input, opts: c.opts, detune: c.detune, layerGain: null, level: 1 };
    if (c.layer) {
      const lg = ctx.createGain();
      ch.level = layerLevel(c.layer, this.e.intensity);
      lg.gain.value = ch.level;
      node.connect(lg);
      node = lg;
      ch.layerGain = lg;
    }
    if (c.trem) { // vibraphone motor / tremolo: shared LFO on the channel
      const tg = ctx.createGain();
      tg.gain.value = 1 - c.trem[1];
      const lfo = ctx.createOscillator();
      lfo.frequency.value = c.trem[0];
      const lg = ctx.createGain();
      lg.gain.value = c.trem[1];
      lfo.connect(lg); lg.connect(tg.gain);
      lfo.start();
      this.persist.push(lfo);
      node.connect(tg);
      node = tg;
    }
    if (c.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = c.lp; f.Q.value = 0.6; node.connect(f); node = f; }
    if (c.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = c.hp; f.Q.value = 0.6; node.connect(f); node = f; }
    let out = node;
    if (c.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = c.pan;
      node.connect(p);
      out = p;
    }
    out.connect(this.out);
    if (c.rev) { const s = ctx.createGain(); s.gain.value = c.rev; out.connect(s); s.connect(this.rev); }
    return ch;
  }

  start(fade = 1.2) { this.fadeIn = Math.max(0.01, fade); }

  setIntensity(x) {
    const now = this.ctx.currentTime;
    for (const ch of Object.values(this.ch)) {
      if (!ch.layerGain) continue;
      ch.level = layerLevel(ch.def.layer, x);
      ch.layerGain.gain.setTargetAtTime(ch.level, now, 0.35);
    }
  }

  swing(posInBeat, stepDur) {
    const t = this.track;
    let off = 0;
    if (t.swing8 !== 0.5) {
      const frac = posInBeat / 4, s = t.swing8;
      const mapped = frac < 0.5 ? frac * (s / 0.5) : s + (frac - 0.5) * ((1 - s) / 0.5);
      off += (mapped - frac) * 4 * stepDur;
    }
    if (t.swing16 !== 0.5 && posInBeat % 2 === 1) off += (t.swing16 - 0.5) * 2 * stepDur;
    return off;
  }

  /** Schedule all steps whose time is < horizon. */
  schedule(horizon) {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    if (!this.started) {
      if (!this.e.bank.hasAll(this.track.deps)) return;
      this.started = true;
      this.next = now + 0.06;
      for (const g of [this.out.gain, this.rev.gain]) {
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(0.0001, this.next);
        g.linearRampToValueAtTime(1, this.next + this.fadeIn);
      }
    }
    if (this.next < now - 0.2) this.next = now + 0.04; // fell behind (throttled tab): resync, keep musical position
    let guard = 0;
    while (this.next < horizon && guard++ < 512) {
      const sec = this.track.secs[this.track.form[this.fi]];
      const stepDur = this.track.stepDur / this.e.tape;
      if (sec) {
        const evs = sec.byStep[this.step];
        if (evs) for (const ev of evs) this.play(ev, this.next, stepDur, now);
      }
      this.next += stepDur;
      this.step++;
      if (!sec || this.step >= sec.len) {
        this.step = 0;
        this.fi++;
        if (this.fi >= this.track.form.length) this.fi = Math.min(this.track.loopTo, this.track.form.length - 1);
      }
    }
  }

  play(ev, t, stepDur, now) {
    const ch = this.ch[ev.ch];
    if (!ch) return;
    if (ch.layerGain && ch.level < 0.02) return;
    if (ev.prob != null && Math.random() >= ev.prob) return;
    const d = ch.def;
    let tt = t + this.swing(ev.step % 4, stepDur) + (ev.dt || 0) * stepDur;
    tt += (Math.random() * 2 - 1) * (d.hum ?? (d.inst === 'drum' ? 0.003 : 0.007));
    if (tt < now) tt = now;
    const dur = Math.max(0.03, ev.len * stepDur * (d.legato ?? 0.95));
    const vel = ev.vel * (1 + (Math.random() * 2 - 1) * (d.vrand ?? 0.08));
    const e2 = ev.choices ? Object.assign({}, ev, { midi: ev.choices[Math.floor(Math.random() * ev.choices.length)] }) : ev;
    try { INST[d.inst](this.S, e2, tt, dur, vel, ch.input, ch); } catch (err) { /* never break the scheduler */ }
  }

  stop(fade = 1.2) {
    if (this.stopped && this.killAt !== Infinity) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    fade = Math.max(0.01, fade);
    for (const g of [this.out.gain, this.rev.gain]) {
      const v = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      g.linearRampToValueAtTime(0, now + fade);
    }
    this.killAt = now + fade + 0.5;
  }

  dispose() {
    for (const o of this.persist) { try { o.stop(); } catch (e) { /* ok */ } }
    try { this.out.disconnect(); this.rev.disconnect(); } catch (e) { /* ok */ }
  }
}

/** Debug helper: walk a compiled track for `seconds` without audio; returns stats. */
export function dryRun(track, seconds) {
  let t = 0, fi = 0, step = 0, events = 0, sectionsSeen = [];
  while (t < seconds) {
    const sec = track.secs[track.form[fi]];
    if (step === 0) sectionsSeen.push(track.form[fi]);
    const evs = sec.byStep[step];
    if (evs) events += evs.length;
    t += track.stepDur;
    step++;
    if (step >= sec.len) { step = 0; fi++; if (fi >= track.form.length) fi = track.loopTo; }
  }
  return { events, sectionsSeen };
}
