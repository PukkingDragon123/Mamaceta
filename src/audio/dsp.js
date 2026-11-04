// Mantis Mayhem audio — shared DSP helpers (pure JS, context-agnostic).
// Everything here works for both realtime AudioContext and OfflineAudioContext.

export const TAU = Math.PI * 2;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, g));
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = (f) => 69 + 12 * Math.log2(f / 440);

// ---------------------------------------------------------------- random
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG -> () => [0,1) */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- buffers
let fallbackCtx = null;
/** Engine registers its context so buffers can be made where `new AudioBuffer` is unsupported. */
export function setFallbackContext(ctx) { if (ctx && !fallbackCtx) fallbackCtx = ctx; }

export function createBuffer(channels, length, sampleRate, ctx) {
  length = Math.max(1, length | 0);
  if (typeof AudioBuffer === 'function') {
    try { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate }); } catch (e) { /* old Safari */ }
  }
  const c = ctx || fallbackCtx;
  return c ? c.createBuffer(channels, length, sampleRate) : null;
}

function normalizeRms(d, target) {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  const rms = Math.sqrt(s / d.length) || 1;
  const k = target / rms;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

const noiseCache = new Map();
/** Shared looping noise buffers {white, pink, brown} at a sample rate (RMS 0.3 each). */
export function getNoise(sr, ctx) {
  let n = noiseCache.get(sr);
  if (n) return n;
  const len = Math.floor(sr * 2.5);
  const rng = makeRng(0xc0ffee);
  const W = createBuffer(1, len, sr, ctx), P = createBuffer(1, len, sr, ctx), B = createBuffer(1, len, sr, ctx);
  if (!W || !P || !B) return null;
  const w = W.getChannelData(0), p = P.getChannelData(0), b = B.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
  for (let i = 0; i < len; i++) {
    const x = rng() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    br = (br + 0.02 * x) / 1.02;
    b[i] = br;
  }
  // brown noise: remove DC + linear trend so the loop point is seamless
  let mean = 0;
  for (let i = 0; i < len; i++) mean += b[i];
  mean /= len;
  const drift = b[len - 1] - b[0];
  for (let i = 0; i < len; i++) b[i] -= mean + drift * (i / (len - 1) - 0.5);
  normalizeRms(w, 0.3); normalizeRms(p, 0.3); normalizeRms(b, 0.3);
  n = { white: W, pink: P, brown: B };
  noiseCache.set(sr, n);
  return n;
}

// ---------------------------------------------------------------- JS biquad (RBJ) for offline buffer work
export function biquadCoefs(type, f, q, sr, gainDb = 0) {
  const w0 = TAU * clamp(f, 10, sr * 0.49) / sr;
  const cs = Math.cos(w0), sn = Math.sin(w0);
  const alpha = sn / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
    default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function biquadRun(data, c, out = data) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const [b0, b1, b2, a1, a2] = c;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

// ---------------------------------------------------------------- reverb impulse
const irCache = new Map();
/**
 * Generated stereo impulse response. "Underwater steel cavern": dark diffuse tail whose high end
 * decays much faster than the lows, sparse early reflections and two faint resonant tank modes.
 */
export function makeIR(sr, opts = {}, ctx) {
  const { dur = 1.6, seed = 7, dark = 1, metal = 0.22, pre = 0.012, bright = 5200 } = opts;
  const key = [sr, dur, seed, dark, metal, pre, bright].join(':');
  if (irCache.has(key)) return irCache.get(key);
  const len = Math.floor(sr * dur);
  const buf = createBuffer(2, len, sr, ctx);
  if (!buf) return null;
  const decay = 6.9 / dur;
  for (let ch = 0; ch < 2; ch++) {
    const rng = makeRng(seed * 7919 + ch * 104729);
    const d = buf.getChannelData(ch);
    let lp1 = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * decay) * Math.min(1, Math.max(0, (t - pre * 0.5) / 0.02));
      const x = (rng() * 2 - 1) * env;
      const fc = 520 + bright * Math.exp(-t * 3.6 * dark);
      const a = 1 - Math.exp(-TAU * fc / sr);
      lp1 += a * (x - lp1);
      lp2 += a * (lp1 - lp2);
      d[i] = lp2;
    }
    // early reflections off steel walls (small filtered taps)
    for (let k = 0; k < 9; k++) {
      const te = pre + rng() * 0.075;
      const idx = Math.floor(te * sr);
      const amp = (0.9 - te * 7) * (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.5);
      for (let j = 0; j < 24 && idx + j < len; j++) d[idx + j] += amp * Math.exp(-j / 5) * 0.35;
    }
    if (metal > 0) {
      const tmp = Float32Array.from(d);
      const r1 = biquadRun(Float32Array.from(tmp), biquadCoefs('bandpass', 290 + ch * 13, 9, sr));
      const r2 = biquadRun(Float32Array.from(tmp), biquadCoefs('bandpass', 1130 - ch * 37, 12, sr));
      for (let i = 0; i < len; i++) d[i] += (r1[i] * 2.2 + r2[i] * 1.6) * metal;
    }
    // fade out the very end
    const fl = Math.floor(sr * 0.05);
    for (let i = 0; i < fl; i++) d[len - 1 - i] *= i / fl;
  }
  // energy normalisation: each channel sum(h^2) = 0.5  (wet ~ -3 dB of dry energy at send 1)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let e = 0;
    for (let i = 0; i < len; i++) e += d[i] * d[i];
    const k = Math.sqrt(0.5 / (e || 1));
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  irCache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------- shaper curves
const curveCache = new Map();
export function tanhCurve(drive = 2, n = 2048) {
  const key = 't' + drive;
  if (curveCache.has(key)) return curveCache.get(key);
  const c = new Float32Array(n);
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / k;
  }
  curveCache.set(key, c);
  return c;
}

/** Asymmetric "fuzz" for distorted bass / industrial grit. */
export function fuzzCurve(drive = 4, n = 2048) {
  const key = 'f' + drive;
  if (curveCache.has(key)) return curveCache.get(key);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = x >= 0 ? Math.tanh(drive * x) : Math.tanh(drive * 0.7 * x) * 0.9;
    c[i] = y;
  }
  curveCache.set(key, c);
  return c;
}

/** Master safety clipper: identity below 0.8, smooth knee, never exceeds ~0.95. */
export function clipperCurve(n = 4096) {
  if (curveCache.has('clip')) return curveCache.get('clip');
  const c = new Float32Array(n);
  const knee = 0.8, ceil = 0.985 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax < knee ? ax : knee + ceil * Math.tanh((ax - knee) / ceil);
    c[i] = Math.sign(x) * y;
  }
  curveCache.set('clip', c);
  return c;
}

// ---------------------------------------------------------------- periodic waves
const waveCache = new WeakMap();
function pulseCoefs(duty, n = 48) {
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.pow(0.97, k);
  return [real, imag];
}
export function getWave(ctx, kind) {
  let m = waveCache.get(ctx);
  if (!m) { m = {}; waveCache.set(ctx, m); }
  if (m[kind]) return m[kind];
  let real, imag;
  switch (kind) {
    case 'pulse10': [real, imag] = pulseCoefs(0.1); break;
    case 'pulse18': [real, imag] = pulseCoefs(0.18); break;
    case 'pulse25': [real, imag] = pulseCoefs(0.25); break;
    case 'pulse35': [real, imag] = pulseCoefs(0.35); break;
    case 'organ': { // drawbar-ish 8' 4' 2 2/3' with a soft square body
      const n = 16; real = new Float32Array(n); imag = new Float32Array(n);
      const amps = [0, 1, 0.55, 0.42, 0.25, 0.12, 0.18, 0.05, 0.1, 0.04, 0.03, 0.02, 0.03, 0.01, 0.01, 0.01];
      for (let k = 1; k < n; k++) imag[k] = amps[k];
      break;
    }
    case 'reed': { // nasal clarinet/accordion-ish: strong odd + some even
      const n = 24; real = new Float32Array(n); imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = (k % 2 ? 1 : 0.45) / Math.pow(k, 1.05) * (k > 5 ? 0.8 : 1);
      break;
    }
    case 'voice': { // glottal-ish: -12 dB/oct falling spectrum
      const n = 40; real = new Float32Array(n); imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.35);
      break;
    }
    case 'soft': { // rounded saw (bass / tuba)
      const n = 12; real = new Float32Array(n); imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = 1 / (k * k * 0.6 + k * 0.4);
      break;
    }
    default: return null;
  }
  try { m[kind] = ctx.createPeriodicWave(real, imag); } catch (e) { m[kind] = null; }
  return m[kind];
}

// ---------------------------------------------------------------- Karplus-Strong plucked string
const ksCache = new Map();
const KS_MAX = 64;
/**
 * Returns {buf, rate} — a plucked nylon/vihuela string; play with playbackRate = rate for exact pitch.
 * kind: 'nylon' (warm, long) | 'vihuela' (bright, short) | 'requinto' (bright, mid)
 */
export function ksNote(sr, midi, kind = 'nylon', ctx) {
  midi = Math.round(midi);
  const key = sr + ':' + midi + ':' + kind;
  const hit = ksCache.get(key);
  if (hit) { ksCache.delete(key); ksCache.set(key, hit); return hit; }
  const f = mtof(midi);
  const N = Math.max(2, Math.round(sr / f - 0.5));
  const fAct = sr / (N + 0.5);
  const bright = kind === 'vihuela' ? 0.82 : kind === 'requinto' ? 0.7 : 0.42;
  const t60 = kind === 'vihuela' ? clamp(1.5 - (midi - 52) * 0.02, 0.5, 1.4) : clamp(2.4 - (midi - 40) * 0.028, 0.8, 2.3);
  const dur = Math.min(2.2, t60 * 0.85);
  const len = Math.floor(dur * sr);
  const buf = createBuffer(1, len, sr, ctx);
  if (!buf) return null;
  const y = buf.getChannelData(0);
  const rng = makeRng(midi * 131 + kind.length * 977);
  const exc = new Float32Array(N + 1);
  let lp = 0, mean = 0;
  for (let i = 0; i <= N; i++) { lp += bright * ((rng() * 2 - 1) - lp); exc[i] = lp; mean += lp; }
  mean /= N + 1;
  const pp = Math.max(1, Math.round(N * (kind === 'nylon' ? 0.17 : 0.11)));
  for (let i = N; i >= 0; i--) exc[i] = exc[i] - mean - 0.55 * (i - pp >= 0 ? exc[i - pp] - mean : 0);
  const rho = Math.pow(10, -3 / (t60 * fAct));
  for (let n = 0; n < len; n++) {
    const xn = n <= N ? exc[n] : 0;
    const a = n - N >= 0 ? y[n - N] : 0;
    const b = n - N - 1 >= 0 ? y[n - N - 1] : 0;
    y[n] = xn + rho * 0.5 * (a + b);
  }
  let pk = 0;
  for (let n = 0; n < len; n++) pk = Math.max(pk, Math.abs(y[n]));
  const k = 0.7 / (pk || 1);
  const fl = Math.floor(sr * 0.04);
  for (let n = 0; n < len; n++) y[n] *= k * (n > len - fl ? (len - n) / fl : 1);
  const res = { buf, rate: f / fAct };
  ksCache.set(key, res);
  if (ksCache.size > KS_MAX) ksCache.delete(ksCache.keys().next().value);
  return res;
}

// ---------------------------------------------------------------- analysis
/** Loudness-ish analysis of an AudioBuffer (all channels mixed by max). */
export function analyzeBuffer(buf, win = 0.05) {
  const sr = buf.sampleRate, n = buf.length, chs = buf.numberOfChannels;
  let peak = 0, nan = 0, sum = 0;
  const mono = new Float32Array(n);
  for (let c = 0; c < chs; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (v !== v) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      mono[i] += (v * v) / chs;
    }
  }
  let last = 0, first = -1;
  const thr = Math.max(peak * 0.001, 1e-5); // -60 dB below peak
  for (let i = 0; i < n; i++) if (mono[i] > thr * thr) { if (first < 0) first = i; last = i; }
  if (first < 0) first = 0;
  for (let i = first; i <= last; i++) sum += mono[i];
  const rms = Math.sqrt(sum / Math.max(1, last - first + 1));
  // max short-term RMS over windows
  const w = Math.max(1, Math.floor(win * sr)), hop = Math.max(1, Math.floor(w / 4));
  let st = 0, acc = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + mono[i];
  for (let i = 0; i + w <= n; i += hop) {
    acc = (pre[i + w] - pre[i]) / w;
    if (acc > st) st = acc;
  }
  if (n < w) st = pre[n] / Math.max(1, n);
  return { peak, rms, st: Math.sqrt(st), nan, first, last, dur: (last + 1) / sr, sr };
}
