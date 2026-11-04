// Mantis Mayhem audio — SoundBank: renders every one-shot (SFX, stingers, instrument zone samples,
// drum hits) into AudioBuffers with OfflineAudioContext, in small async batches, then normalises
// loudness per recipe (`lvl`), trims silence and fades the tail.

import { SFX } from './sfx.js';
import { STINGERS } from './stingers.js';
import { SAMPLE_DEFS, DRUM_DEFS } from './instruments.js';
import { Synth } from './synth.js';
import { makeRng, hashStr, analyzeBuffer, dbToGain, createBuffer } from './dsp.js';

const RATE_DEFAULT = 32000;
const RATE_LO = 22050;

/** Sounds the game spams during fights: rendered right after UI + instrument samples. */
const COMMON = new Set([
  'hit_light', 'hit_medium', 'hit_heavy', 'block', 'block_heavy', 'whiff_light', 'whiff_heavy', 'step',
  'jump', 'land', 'dash', 'dodge', 'cavitation', 'hit_super', 'perfect_block', 'double_jump', 'land_heavy',
  'throw_grab', 'throw_impact', 'knockdown', 'counter', 'bubble_pop', 'ko',
]);

export function offlineCtor() {
  if (typeof OfflineAudioContext !== 'undefined') return OfflineAudioContext;
  if (typeof webkitOfflineAudioContext !== 'undefined') return webkitOfflineAudioContext; // eslint-disable-line no-undef
  return null;
}

/** startRendering() that works with both the promise and the legacy event API. */
export function renderOffline(oc) {
  return new Promise((resolve, reject) => {
    let done = false;
    oc.oncomplete = (e) => { if (!done) { done = true; resolve(e.renderedBuffer); } };
    try {
      const p = oc.startRendering();
      if (p && typeof p.then === 'function') p.then((b) => { if (!done) { done = true; resolve(b); } }, (e) => { if (!done) { done = true; reject(e); } });
    } catch (e) { if (!done) { done = true; reject(e); } }
  });
}

function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    } else setTimeout(resolve, 0);
  });
}

export class SoundBank {
  constructor(liveRate = 48000) {
    this.liveRate = liveRate;
    this.entries = new Map();
    this.jobs = [];
    this.done = 0;
    this.total = 0;
    this.complete = false;
    this.promise = null;
    this.warnings = [];
    this.slices = []; // debug: synchronous ms per render slice
    this.buildJobs();
  }

  buildJobs() {
    const add = (key, def, kind, param, prio) => {
      const v = def.v || 1;
      this.entries.set(key, { key, def, kind, bufs: [], info: [], ready: false });
      for (let i = 0; i < v; i++) this.jobs.push({ key, def, variant: i, param, prio, order: this.jobs.length });
    };
    for (const [name, def] of Object.entries(SFX)) if (name.startsWith('ui_')) add(name, def, 'sfx', 0, 0);
    for (const [name, def] of Object.entries(DRUM_DEFS)) add('@' + name, def, 'drum', 0, 1);
    for (const [name, def] of Object.entries(SAMPLE_DEFS)) for (const z of def.zones) add('@' + name + ':' + z, def, 'sample', z, 1);
    for (const [name, def] of Object.entries(SFX)) if (!name.startsWith('ui_')) add(name, def, 'sfx', 0, COMMON.has(name) ? 2 : 3);
    for (const [name, def] of Object.entries(STINGERS)) add(name, def, 'stinger', 0, 4);
    this.jobs.sort((a, b) => a.prio - b.prio || a.order - b.order);
    this.total = this.jobs.length;
  }

  /** Ready entry or null. */
  get(key) { const e = this.entries.get(key); return e && e.ready ? e : null; }
  has(key) { return this.entries.has(key); }
  hasAll(keys) { for (const k of keys) { const e = this.entries.get(k); if (e && !e.ready) return false; } return true; }
  def(key) { const e = this.entries.get(key); return e ? e.def : null; }

  /** Move pending jobs for a key to the front of the queue. */
  bump(key) {
    const mine = this.jobs.filter((j) => j.key === key);
    if (!mine.length) return;
    this.jobs = mine.concat(this.jobs.filter((j) => j.key !== key));
  }

  rateFor(def) {
    if (def.sr === 'lo') return RATE_LO;
    if (def.sr === 'hi') return Math.min(48000, Math.max(44100, this.liveRate || 44100));
    return RATE_DEFAULT;
  }

  async renderJob(job) {
    const OC = offlineCtor();
    const { def } = job;
    const sr = this.rateFor(def);
    const lenS = typeof def.len === 'function' ? def.len(job.param) : def.len || 1;
    const ch = def.ch || 1;
    const oc = new OC(ch, Math.ceil((lenS + 0.02) * sr), sr);
    const out = oc.createGain();
    out.connect(oc.destination);
    const seed = hashStr(job.key) ^ Math.imul(job.variant + 1, 0x9e3779b1);
    const S = new Synth(oc, out, { rng: makeRng(seed), bank: this });
    def.fn(S, 0.004, job.param, job.variant);
    const buf = await renderOffline(oc);
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    const r = this.finish(buf, def, job);
    if (r && typeof performance !== 'undefined') r.finishMs = performance.now() - t1;
    return r;
  }

  finish(buf, def, job) {
    const a = analyzeBuffer(buf);
    if (a.nan || !isFinite(a.peak)) { this.warn(`NaN in render of ${job.key}`); return null; }
    if (a.peak < 1e-7) { this.warn(`silent render: ${job.key}`); return null; }
    let g = 1;
    if (def.lvl != null) g = Math.min(dbToGain(def.lvl) / Math.max(a.st, 1e-9), 0.95 / a.peak);
    const sr = buf.sampleRate;
    const start = Math.max(0, a.first - Math.floor(0.001 * sr));
    const end = Math.min(buf.length, a.last + Math.floor(0.012 * sr) + 1);
    const n = Math.max(1, end - start);
    const out = createBuffer(buf.numberOfChannels, n, sr);
    const fade = Math.min(Math.floor(0.008 * sr), n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = out.getChannelData(c);
      for (let i = 0; i < n; i++) dst[i] = src[start + i] * g;
      for (let i = 0; i < fade; i++) dst[n - 1 - i] *= i / fade;
    }
    return { buf: out, gain: g, peak: a.peak * g, st: a.st * g, dur: n / sr };
  }

  store(job, r) {
    const e = this.entries.get(job.key);
    if (!e || !r) return;
    e.bufs.push(r.buf);
    e.info.push(r);
    e.ready = true;
  }

  warn(msg) { this.warnings.push(msg); if (typeof console !== 'undefined') console.warn('[audio] ' + msg); }

  /**
   * Render everything (idempotent). Work is time-sliced: each main-thread slice builds render graphs
   * for at most ~`budgetMs` (and `batch` jobs), then yields while the renders run off-thread.
   */
  renderAll({ batch = 4, budgetMs = 6, onProgress } = {}) {
    if (this.promise) return this.promise;
    this.promise = (async () => {
      if (!offlineCtor()) { this.warn('OfflineAudioContext unavailable: no pre-rendered sounds'); this.complete = true; return; }
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      await yieldToMain(); // never do render work inside the caller's task (e.g. Audio.init())
      while (this.jobs.length) {
        const t0 = now();
        const inflight = [];
        const first = this.jobs[0].key;
        while (this.jobs.length && inflight.length < batch && (inflight.length === 0 || now() - t0 < budgetMs)) {
          const j = this.jobs.shift();
          let p;
          try { p = this.renderJob(j); } catch (e) { p = Promise.reject(e); }
          inflight.push(p.then((r) => this.store(j, r), (e) => this.warn(`render failed ${j.key}: ${e && e.message}`)));
        }
        if (this.slices.length < 400) this.slices.push({ ms: +(now() - t0).toFixed(1), n: inflight.length, first });
        await Promise.all(inflight);
        this.done += inflight.length;
        if (onProgress) { try { onProgress(this.done, this.total); } catch (e) { /* ignore */ } }
        await yieldToMain();
      }
      this.complete = true;
    })();
    return this.promise;
  }

  /** Debug: per-key loudness info. */
  stats() {
    const out = [];
    for (const e of this.entries.values()) {
      if (!e.info.length) { out.push({ key: e.key, kind: e.kind, ready: false }); continue; }
      const i = e.info[0];
      out.push({ key: e.key, kind: e.kind, ready: true, variants: e.bufs.length, peak: i.peak, st: i.st, dur: i.dur, gain: i.gain, sr: e.bufs[0].sampleRate });
    }
    return out;
  }
}
