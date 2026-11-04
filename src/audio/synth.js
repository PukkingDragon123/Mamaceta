// Mantis Mayhem audio — node-building helpers ("Synth") shared by SFX recipes, instruments,
// stingers, voices and loops. A Synth wraps one (realtime or offline) BaseAudioContext.

import { getNoise, tanhCurve, createBuffer, getWave, clamp } from './dsp.js';

const MIN_A = 0.0008;

/** Connect a detune ConstantSource (slow-motion bend) to a source and auto-disconnect when it ends. */
export function bendConnect(bend, src) {
  if (!bend || !src || !src.detune) return;
  try {
    bend.connect(src.detune);
    src.addEventListener('ended', () => { try { bend.disconnect(src.detune); } catch (e) { /* already gone */ } });
  } catch (e) { /* ignore */ }
}

/** 0 -> peak (linear, a) -> hold -> exponential decay to -60 dB over d. Returns end time. */
export function envPerc(p, t, a, d, peak, hold = 0) {
  a = Math.max(MIN_A, a);
  d = Math.max(0.004, d);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  const end = t + a + hold + d;
  p.exponentialRampToValueAtTime(Math.max(1e-6, Math.abs(peak) * 0.001), end);
  p.setValueAtTime(0, end + 0.001);
  return end;
}

/**
 * ADSR for sustained notes, robust when the note is released during attack/decay.
 * Values are offset by `base` (useful for filter cutoffs). Returns end time.
 */
export function envADSR(p, t, dur, o) {
  const a = Math.max(MIN_A, o.a ?? 0.01), d = Math.max(0.005, o.d ?? 0.1);
  const s = o.s ?? 0.7, r = Math.max(0.01, o.r ?? 0.1), peak = o.peak ?? 1, base = o.base ?? 0;
  const tr = t + Math.max(MIN_A, dur);
  let vr;
  p.setValueAtTime(base, t);
  if (tr <= t + a) {
    vr = peak * ((tr - t) / a);
    p.linearRampToValueAtTime(base + vr, tr);
  } else {
    p.linearRampToValueAtTime(base + peak, t + a);
    const sv = Math.max(peak * s, peak * 0.0011, 1e-5);
    if (tr <= t + a + d) {
      const k = (tr - t - a) / d;
      vr = peak * Math.pow(sv / peak, k);
      p.exponentialRampToValueAtTime(base + vr, tr);
    } else {
      p.exponentialRampToValueAtTime(base + sv, t + a + d);
      p.setValueAtTime(base + sv, tr);
      vr = sv;
    }
  }
  const end = tr + r;
  if (base > 0) p.exponentialRampToValueAtTime(Math.max(1, base * (o.baseEnd ?? 0.6)), end);
  else { p.exponentialRampToValueAtTime(Math.max(1e-6, vr * 0.001), end); p.setValueAtTime(0, end + 0.001); }
  return end;
}

/** Arbitrary envelope: pts = [[dt, value, kind]] with kind 'l' (linear, default), 'e' (exp), 's' (set). */
export function envPoints(p, t, pts) {
  p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    const [dt, v, k] = pts[i];
    if (k === 'e') p.exponentialRampToValueAtTime(Math.max(1e-6, v), t + dt);
    else if (k === 's') p.setValueAtTime(v, t + dt);
    else p.linearRampToValueAtTime(v, t + dt);
  }
  const last = pts[pts.length - 1];
  if (last[2] === 'e') p.setValueAtTime(0, t + last[0] + 0.001);
  return t + last[0];
}

/** Frequency glide (exp by default). */
export function glide(p, t, f0, f1, dur, curve = 'exp') {
  p.setValueAtTime(f0, t);
  if (curve === 'lin') p.linearRampToValueAtTime(f1, t + dur);
  else p.exponentialRampToValueAtTime(Math.max(1, f1), t + Math.max(0.001, dur));
}

const METAL = [1, 1.504, 1.97, 2.58, 3.2, 4.05, 4.94, 5.85, 6.9];

export class Synth {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} out default destination
   * @param {{rng?:Function, bank?:object, bend?:AudioNode, keep?:boolean}} opts
   */
  constructor(ctx, out, opts = {}) {
    this.ctx = ctx;
    this.out = out;
    this.sr = ctx.sampleRate;
    this.rng = opts.rng || Math.random;
    this.bank = opts.bank || null;
    this.bend = opts.bend || null;
    this.keep = opts.keep ? [] : null;
    this.noiseBufs = getNoise(this.sr, ctx);
    this.hasPanner = typeof ctx.createStereoPanner === 'function';
  }

  // ------------------------------------------------------------ random helpers
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  ri(a, b) { return Math.floor(a + (b - a + 1) * this.rng()); }
  pick(arr) { return arr[Math.min(arr.length - 1, Math.floor(this.rng() * arr.length))]; }
  jit(x, amt = 0.05) { return x * (1 + (this.rng() * 2 - 1) * amt); }
  chance(p) { return this.rng() < p; }

  // ------------------------------------------------------------ plumbing
  /** Same synth, different default destination. */
  with(out) { const s = Object.create(this); s.out = out; return s; }
  _to(node, to) { if (to !== null) node.connect(to || this.out); return node; }
  _src(src) {
    if (this.keep) this.keep.push(src);
    if (this.bend) bendConnect(this.bend, src);
    return src;
  }
  /** Stop every tracked long-running source at time t (loops). */
  stopAll(t) {
    if (!this.keep) return;
    for (const s of this.keep) { try { s.stop(t); } catch (e) { /* already stopped */ } }
    this.keep.length = 0;
  }

  gain(v = 1, to) { const g = this.ctx.createGain(); g.gain.value = v; return this._to(g, to); }
  filter(type, f, q, to, gainDb) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = clamp(f, 10, this.sr * 0.49);
    if (q != null) b.Q.value = q;
    if (gainDb) b.gain.value = gainDb;
    return this._to(b, to);
  }
  lp(f, q = 0.707, to) { return this.filter('lowpass', f, q, to); }
  hp(f, q = 0.707, to) { return this.filter('highpass', f, q, to); }
  bp(f, q = 1, to) { return this.filter('bandpass', f, q, to); }
  shaper(curve, to, over = '2x') {
    const w = this.ctx.createWaveShaper();
    w.curve = curve;
    w.oversample = over;
    return this._to(w, to);
  }
  drive(amount, to) { return this.shaper(tanhCurve(amount), to); }
  pan(p, to) {
    if (!this.hasPanner) return this.gain(1, to);
    const n = this.ctx.createStereoPanner();
    n.pan.value = clamp(p, -1, 1);
    return this._to(n, to);
  }
  /** Feedback echo. Returns the input node. */
  echo(time, fb, wet, to, lpf = 2500) {
    const input = this.gain(1, to);
    const dl = this.ctx.createDelay(Math.max(1, time * 2));
    dl.delayTime.value = time;
    const f = this.lp(lpf, 0.5, null);
    const g = this.gain(fb, null);
    const w = this.gain(wet, to);
    input.connect(dl); dl.connect(f); f.connect(g); g.connect(dl); f.connect(w);
    return input;
  }
  conv(ir, to) {
    const c = this.ctx.createConvolver();
    c.normalize = false;
    c.buffer = ir;
    return this._to(c, to);
  }

  /** Chain of filters from compact specs: ['bp', f, q, fEnd?, sweepTime?, curve?]. Returns [first, last]. */
  chain(specs, t, to) {
    let first = null, last = null;
    const names = { bp: 'bandpass', lp: 'lowpass', hp: 'highpass', pk: 'peaking', no: 'notch', ls: 'lowshelf', hs: 'highshelf' };
    for (const s of specs) {
      const [kind, f, q, f1, ft, curve, gdb] = s;
      const b = this.filter(names[kind] || kind, f, q ?? (kind === 'lp' || kind === 'hp' ? 0.707 : 1), null, gdb);
      if (f1 != null) glide(b.frequency, t, clamp(f, 10, this.sr * 0.49), clamp(f1, 10, this.sr * 0.49), ft ?? 0.1, curve);
      if (last) last.connect(b); else first = b;
      last = b;
    }
    if (last) this._to(last, to);
    return [first, last];
  }

  // ------------------------------------------------------------ sources
  osc(type, f, t, end, to) {
    const o = this.ctx.createOscillator();
    if (type[0] === '~') {
      const w = getWave(this.ctx, type.slice(1));
      if (w) o.setPeriodicWave(w); else o.type = 'sawtooth';
    } else o.type = type;
    o.frequency.setValueAtTime(clamp(f, 0.01, this.sr * 0.49), t);
    this._to(o, to);
    o.start(t);
    if (end != null) o.stop(end);
    return this._src(o);
  }
  noiseSrc(color = 'white', t = 0, end, to, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBufs[color] || this.noiseBufs.white;
    s.loop = true;
    s.playbackRate.value = rate;
    this._to(s, to);
    s.start(t, this.rng() * 2.2);
    if (end != null) s.stop(end);
    return this._src(s);
  }
  bufSrc(buf, t, to, rate = 1, end) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    this._to(s, to);
    s.start(t);
    if (end != null) s.stop(end);
    return this._src(s);
  }
  /** LFO into a param: returns {o, g}. */
  lfo(rate, depth, param, t, end, type = 'sine') {
    const o = this.osc(type, rate, t, end, null);
    const g = this.gain(depth, null);
    o.connect(g); g.connect(param);
    return { o, g };
  }

  // ------------------------------------------------------------ composite voices
  /** Enveloped oscillator. o: {type,f,f1,ft,fc,fpts,t,a,d,hold,peak,to,detune,vib:{rate,depth},pts} */
  tone(o) {
    const { type = 'sine', f = 440, t = 0, a = 0.002, d = 0.2, hold = 0, peak = 1 } = o;
    const g = this.gain(0, o.to);
    const end = o.pts ? envPoints(g.gain, t, o.pts) : envPerc(g.gain, t, a, d, peak, hold);
    const osc = this.osc(type, f, t, end + 0.02, g);
    if (o.fpts) {
      osc.frequency.setValueAtTime(f, t);
      for (const [dt, fv, k] of o.fpts) {
        if (k === 'l') osc.frequency.linearRampToValueAtTime(fv, t + dt);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, fv), t + dt);
      }
    } else if (o.f1 != null && o.f1 !== f) glide(osc.frequency, t, f, o.f1, o.ft ?? (a + hold + d), o.fc);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) this.lfo(o.vib.rate, f * o.vib.depth, osc.frequency, t, end + 0.02);
    return { osc, g, end };
  }

  /** Enveloped filtered noise. o: {color,t,a,d,hold,peak,to,f:[filter specs],rate,pts} */
  noise(o) {
    const { color = 'white', t = 0, a = 0.002, d = 0.2, hold = 0, peak = 1 } = o;
    const g = this.gain(0, o.to);
    const end = o.pts ? envPoints(g.gain, t, o.pts) : envPerc(g.gain, t, a, d, peak, hold);
    const src = this.noiseSrc(color, t, end + 0.02, null, o.rate || 1);
    if (o.f && o.f.length) {
      const [first, last] = this.chain(o.f, t, g);
      src.connect(first);
      return { src, g, end, filt: first, last };
    }
    src.connect(g);
    return { src, g, end };
  }

  /** Low body thump with exponential pitch drop (+ optional click and saturation). */
  thump(o) {
    const { t = 0, f0 = 120, f1 = 45, ft = 0.07, d = 0.3, peak = 1, click = 0.2, drive = 0, type = 'sine' } = o;
    const dest = drive ? this.drive(drive, o.to) : (o.to || this.out);
    this.tone({ type, f: f0, f1, ft, t, a: o.a ?? 0.0015, d, peak, to: dest });
    if (click) this.noise({ t, a: 0.0005, d: o.cd ?? 0.012, peak: click * peak, f: [['hp', o.cf ?? 1800, 0.7]], to: o.to });
  }

  /** Single underwater bubble: damped sine with rising pitch. */
  bubble(o) {
    const { t = 0, f = 600, rise = 1.8, d = 0.06, peak = 0.5 } = o;
    return this.tone({ f, f1: f * rise, ft: d, t, a: o.a ?? 0.0015, d, peak, to: o.to });
  }

  /** A cluster of bubbles. */
  bubbles(o) {
    const { t = 0, n = 6, spread = 0.3, fmin = 350, fmax = 1400, peak = 0.4, d = 0.06, curve = 1 } = o;
    for (let i = 0; i < n; i++) {
      const x = Math.pow(this.rng(), curve);
      const f = fmin * Math.pow(fmax / fmin, this.rng());
      this.bubble({
        t: t + x * spread, f, rise: this.r(1.3, 2.3), d: this.jit(d, 0.4),
        peak: peak * this.r(0.4, 1) * (o.fade ? 1 - x * 0.7 : 1), to: o.pan != null && this.hasPanner ? this.pan(this.r(-o.pan, o.pan), o.to) : o.to,
      });
    }
  }

  /** Additive modal synthesis (bells, clinks, metal). */
  modal(o) {
    const { t = 0, f = 440, ratios = [1], amps = [1], decays = [0.5], peak = 1, a = 0.0008, jit = 0 } = o;
    const bus = this.gain(peak, o.to);
    for (let i = 0; i < ratios.length; i++) {
      const fr = f * ratios[i] * (jit ? this.jit(1, jit) : 1);
      if (fr > this.sr * 0.45) continue;
      this.tone({ f: fr, t, a, d: decays[Math.min(i, decays.length - 1)], peak: amps[Math.min(i, amps.length - 1)], to: bus });
    }
    return bus;
  }

  /** Struck metal object (clang). */
  metal(o) {
    const { t = 0, f = 300, d = 0.8, peak = 1, strike = 0.5, bright = 1, n = 7 } = o;
    const ratios = o.ratios || METAL;
    const bus = this.gain(peak, o.to);
    for (let i = 0; i < Math.min(n, ratios.length); i++) {
      const fr = f * ratios[i] * this.jit(1, 0.012);
      if (fr > this.sr * 0.45) continue;
      const amp = (o.amps ? o.amps[Math.min(i, o.amps.length - 1)] : 1 / (1 + i * 0.55)) * (i ? bright : 1);
      this.tone({ f: fr, t, a: 0.0008, d: d * Math.pow(o.dk ?? 0.8, i) * this.r(0.85, 1.15), peak: amp * 0.45, to: bus });
    }
    if (strike) this.noise({ t, a: 0.0005, d: o.sd ?? 0.025, peak: strike, f: [['bp', Math.min(f * 4, 7000), 1.1]], to: bus });
    return bus;
  }

  /** Wooden knock. */
  wood(o) {
    const { t = 0, f = 600, d = 0.06, peak = 1, click = 0.45 } = o;
    const bus = this.gain(peak, o.to);
    this.tone({ f: f * 1.05, f1: f, ft: 0.015, t, a: 0.0006, d, peak: 0.7, to: bus });
    this.tone({ f: f * 2.31, t, a: 0.0005, d: d * 0.5, peak: 0.28, to: bus });
    this.tone({ f: f * 3.86, t, a: 0.0004, d: d * 0.3, peak: 0.12, to: bus });
    if (click) this.noise({ t, a: 0.0004, d: 0.008, peak: click, f: [['bp', Math.min(f * 5, 6500), 1.3]], to: bus });
    return bus;
  }

  /** Filtered-noise swoosh. o: {t,d,f0,f1,f2,q,peak,color,att,lp,to} */
  whoosh(o) {
    const { t = 0, d = 0.3, f0 = 400, f1 = 1600, q = 1.2, peak = 1, color = 'pink', att = 0.45, lp = 4000 } = o;
    const g = this.gain(0, o.to);
    const src = this.noiseSrc(color, t, t + d + 0.05, null);
    const b = this.bp(f0, q, null);
    b.frequency.setValueAtTime(f0, t);
    b.frequency.exponentialRampToValueAtTime(f1, t + d * att);
    b.frequency.exponentialRampToValueAtTime(o.f2 ?? f0 * 0.8, t + d);
    const l = this.lp(lp, 0.5, null);
    src.connect(b); b.connect(l); l.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * 0.3, t + d * att * 0.55);
    g.gain.linearRampToValueAtTime(peak, t + d * att);
    g.gain.exponentialRampToValueAtTime(peak * 0.002, t + d);
    g.gain.setValueAtTime(0, t + d + 0.002);
    return { src, b, g, end: t + d };
  }

  /** Grain texture (crackle, crunch, paper, sizzle) rendered into a JS buffer, then filtered. */
  grains(o) {
    const { t = 0, dur = 0.2, rate = 300, glen = 0.002, peak = 1, jit = 0.7 } = o;
    const sr = this.sr;
    const gl = Math.max(1, Math.floor(glen * sr));
    const glMax = gl * 6;
    const len = Math.ceil(dur * sr) + glMax + 2;
    const buf = createBuffer(1, len, sr, this.ctx);
    const dd = buf.getChannelData(0);
    const ampf = o.amp || ((x) => 1 - x);
    const ratef = typeof rate === 'function' ? rate : () => rate;
    let time = 0, guard = 0;
    while (time < dur && guard++ < 20000) {
      const x = time / dur;
      const a = ampf(x) * (1 - jit * this.rng());
      const i0 = Math.floor(time * sr);
      const k0 = o.glv ? Math.max(1, gl * this.r(0.4, 1.6)) : gl;
      const sign = o.tonal ? (this.rng() < 0.5 ? -1 : 1) : 0;
      for (let k = 0; k < glMax && i0 + k < len; k++) {
        const s = o.tonal ? sign * Math.cos(k * o.tonal) : (this.rng() * 2 - 1);
        dd[i0 + k] += a * s * Math.exp(-k / k0);
      }
      time += -Math.log(1 - this.rng() * 0.999) / Math.max(1, ratef(x));
    }
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(dd[i]));
    if (pk > 0) for (let i = 0; i < len; i++) dd[i] *= 0.9 / pk;
    const g = this.gain(peak, o.to);
    const src = this.bufSrc(buf, t, null);
    if (o.f && o.f.length) { const [first, last] = this.chain(o.f, t, g); src.connect(first); }
    else src.connect(g);
    return { src, g, end: t + len / sr };
  }

  /** Stick-slip impulse train (creaks, ratchets, rattles). rate in Hz (number or fn(x)). */
  pulses(o) {
    const { t = 0, dur = 1, peak = 1, jit = 0.12, width = 0.0004 } = o;
    const sr = this.sr;
    const len = Math.ceil((dur + 0.01) * sr);
    const buf = createBuffer(1, len, sr, this.ctx);
    const dd = buf.getChannelData(0);
    const ratef = typeof o.rate === 'function' ? o.rate : () => o.rate || 50;
    const ampf = o.amp || (() => 1);
    const w = Math.max(1, Math.floor(width * sr));
    let time = 0, guard = 0;
    while (time < dur && guard++ < 50000) {
      const x = time / dur;
      const a = ampf(x) * (1 - (o.ajit ?? 0.3) * this.rng());
      const i0 = Math.floor(time * sr);
      for (let k = 0; k < w * 5 && i0 + k < len; k++) dd[i0 + k] += a * Math.exp(-k / w) * (k === 0 ? 1 : (this.rng() * 1.4 - 0.4));
      time += (1 / Math.max(0.5, ratef(x))) * (1 + jit * (this.rng() * 2 - 1));
    }
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(dd[i]));
    if (pk > 0) for (let i = 0; i < len; i++) dd[i] *= 0.9 / pk;
    const src = this.bufSrc(buf, t, null);
    const g = this.gain(peak, o.to);
    if (o.f && o.f.length) { const [first, last] = this.chain(o.f, t, g); src.connect(first); }
    else src.connect(g);
    return { src, g };
  }

  /** Parallel resonator bank: input -> [bandpass f,q,gain]... -> to. Returns input node. */
  res(list, to) {
    const input = this.gain(1, null);
    for (const [f, q, g] of list) {
      const b = this.bp(f, q, null);
      const gg = this.gain(g, to);
      input.connect(b); b.connect(gg);
    }
    return input;
  }

  /** Random high pings (sparkles / twinkles). */
  sparkle(o) {
    const { t = 0, n = 6, spread = 0.4, fmin = 2000, fmax = 6000, peak = 0.3, d = 0.25, rising = false } = o;
    for (let i = 0; i < n; i++) {
      const x = rising ? i / Math.max(1, n - 1) : this.rng();
      const f = rising ? fmin * Math.pow(fmax / fmin, x) * this.jit(1, 0.03) : fmin * Math.pow(fmax / fmin, this.rng());
      const to = o.pan != null && this.hasPanner ? this.pan(this.r(-o.pan, o.pan), o.to) : o.to;
      const tt = t + x * spread;
      const pk = peak * this.r(0.5, 1) * (o.fade ? 1 - x * 0.6 : 1);
      this.tone({ f, t: tt, a: 0.001, d: this.jit(d, 0.3), peak: pk, to });
      this.tone({ f: f * 2.76, t: tt, a: 0.001, d: d * 0.3, peak: pk * 0.25, to });
    }
  }
}
