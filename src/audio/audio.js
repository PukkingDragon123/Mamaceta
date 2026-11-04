// Mantis Mayhem audio — public entry point.
//
//   import { Audio } from './audio/audio.js';
//   Audio.init(); Audio.resume();            // resume() on any user gesture
//   Audio.sfx('hit_heavy', { pan: -0.3 });   Audio.music('rustpit');   Audio.stinger('stinger_fight');
//
// Everything is synthesized at runtime (Web Audio API). One-shots are pre-rendered into AudioBuffers
// with OfflineAudioContext during init() (async, small batches). If Web Audio is unavailable every
// call is a silent no-op; no method ever throws.

import { AudioEngine, getBank } from './engine.js';
import { planUtterance, VOICES } from './voice.js';
import { SFX } from './sfx.js';
import { STINGERS } from './stingers.js';
import { TRACK_DEFS, TRACK_ALIASES } from './tracks.js';
import { LOOPS } from './loops.js';

let engine = null;
let disabled = false;
let loopCounter = 0;
let readyPromise = null;
const pendingVol = { master: 1, music: 1, sfx: 1 };
const errs = new Set();

function report(e) {
  const k = (e && e.message) || String(e);
  if (errs.has(k)) return;
  errs.add(k);
  if (typeof console !== 'undefined') console.warn('[audio] internal error (ignored):', e);
}

/** Wrap a method so it can never throw; `fb` is returned (or called) on failure / when disabled. */
function safe(fn, fb) {
  return function (...args) {
    try { return fn.apply(this, args); } catch (e) { report(e); return typeof fb === 'function' ? fb(...args) : fb; }
  };
}

function ctxClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function installUnlock() {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  const evs = ['pointerdown', 'keydown', 'touchend', 'mousedown'];
  const h = () => {
    if (!engine) return;
    engine.resume();
    if (engine.ctx.state === 'running') evs.forEach((ev) => window.removeEventListener(ev, h, true));
  };
  evs.forEach((ev) => window.addEventListener(ev, h, { capture: true, passive: true }));
}

function ensure() {
  if (!engine && !disabled) Audio.init();
  return engine;
}

function estimateVoice(who, text, opts) {
  try { return planUtterance(who, text, opts || {}).total; } catch (e) { return 0; }
}

export const Audio = {
  /** Safe to call many times; creates the AudioContext lazily and starts pre-rendering. */
  init: safe(() => {
    if (engine || disabled) return;
    const C = ctxClass();
    if (!C) { disabled = true; return; }
    let ctx;
    try { ctx = new C({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new C(); } catch (e2) { disabled = true; return; } }
    try {
      engine = new AudioEngine(ctx, { live: true, bank: getBank(ctx.sampleRate), loopIdBase: loopCounter });
    } catch (e) {
      disabled = true;
      engine = null;
      report(e);
      try { ctx.close(); } catch (e2) { /* ignore */ }
      return;
    }
    engine.setVolumes(pendingVol);
    engine.startTimer();
    readyPromise = engine.bank.renderAll().catch(report);
    try { ctx.addEventListener('statechange', () => { if (engine) engine.pump(); }); } catch (e) { /* ignore */ }
    installUnlock();
  }),

  /** Call from any user gesture (autoplay policy). */
  resume: safe(() => { if (ensure()) engine.resume(); }),

  /** {master, music, sfx} each 0..1 (any subset). */
  setVolumes: safe((v) => {
    if (!v || typeof v !== 'object') return;
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && isFinite(+v[k])) pendingVol[k] = Math.max(0, Math.min(1, +v[k]));
    if (engine) engine.setVolumes(pendingVol);
  }),

  /** One-shot SFX. opts {vol=1, pitch=1, pan=0, delay=0}. Unknown names warn once. */
  sfx: safe((name, opts) => { if (ensure()) engine.sfx(name, opts || {}); }),

  /** Crossfade to a looping track (null stops). Same track again is a no-op. */
  music: safe((track, opts) => { if (ensure()) engine.music(track, opts || {}); }),

  /** Musical stinger; briefly ducks the music. */
  stinger: safe((name) => { if (ensure()) engine.stinger(name); }),

  /** 0..1 — extra percussion layers on tracks that support it. */
  setMusicIntensity: safe((x) => { if (ensure()) engine.setMusicIntensity(x); }),

  /** 1 = normal, ~0.25 = dramatic slow motion (pitch drop + low-pass), smoothly ramped. */
  setSlowmo: safe((f) => { if (ensure()) engine.setSlowmo(f); }),

  /** Underwater muffle on the music bus (pause menus, cinematics). */
  muffle: safe((on) => { if (ensure()) engine.muffle(!!on); }),

  /** Momentary music duck. */
  duck: safe((amount = 0.5, seconds = 0.6) => { if (ensure()) engine.duck(amount, seconds); }),

  /** Dialogue babble; returns the estimated duration in seconds. A new call stops the previous one. */
  voice: safe((who, text, opts) => (ensure() ? engine.voice(who, text, opts || {}) : estimateVoice(who, text, opts)), estimateVoice),

  stopVoice: safe(() => { if (engine) engine.stopVoice(); }),

  /** Sustained loop ('molt_loop','charge_loop','qte_tension','bubble_vent','ult_spin'); returns a handle id. */
  loopStart: safe((name, opts) => {
    if (ensure()) { const id = engine.loopStart(name, opts || {}); loopCounter = Math.max(loopCounter, id); return id; }
    return ++loopCounter;
  }, () => ++loopCounter),

  loopStop: safe((id, fade = 0.15) => { if (engine) engine.loopStop(id, fade); }),

  /** Call every animation frame (drives the lookahead scheduler; timing uses ctx.currentTime). */
  update: safe((dt) => { if (engine) engine.update(dt); }),

  // ------------------------------------------------------------------ extras
  /** Promise that resolves once every one-shot has been pre-rendered (handy for a loading screen). */
  ready: safe(() => { ensure(); return readyPromise || Promise.resolve(); }, () => Promise.resolve()),

  /** Stop all sfx voices, loops and dialogue (music keeps playing). */
  stopAll: safe(() => { if (engine) engine.stopAll(); }),

  /** Current volume settings. */
  getVolumes: safe(() => ({ ...pendingVol }), () => ({ ...pendingVol })),

  /** Names of everything the engine can play (for debug menus / tests). */
  names: safe(() => ({
    sfx: Object.keys(SFX), stingers: Object.keys(STINGERS), music: [...Object.keys(TRACK_DEFS), ...Object.keys(TRACK_ALIASES)],
    voices: Object.keys(VOICES), loops: Object.keys(LOOPS),
  }), () => ({ sfx: [], stingers: [], music: [], voices: [], loops: [] })),

  /** Debug: the AudioContext state ('running', 'suspended', or 'unavailable'). */
  state: safe(() => (engine ? engine.ctx.state : 'unavailable'), 'unavailable'),
};

export default Audio;
