// Mantis Mayhem audio — AudioEngine: one instance per BaseAudioContext (live or offline for tests).
//
// Graph:
//   voices ─► [gain ─► pan] ─► sfxIn ──────────────────────────────┐
//                       └─► send ─► sfxRevIn ─► convolver ─► sfxIn  │
//   voiceIn / stingIn ─► sfxIn                                      ├─► mix ─► slowLP ─► master ─► compressor ─► clipper ─► out
//   music channels ─► musicIn ─► duck ─► muffle LP×2 ─► muffleGain ─┘
//                └─► send ─► musicRevIn ─► convolver ─► musicIn
//   Slow-motion: ConstantSource "bend" nodes drive the detune of every playing sfx / music source.

import { SoundBank } from './bank.js';
import { TRACK_DEFS, TRACK_ALIASES } from './tracks.js';
import { compileTrack, MusicPlayer } from './music.js';
import { VoicePlayer, VOICES } from './voice.js';
import { LOOPS } from './loops.js';
import { Synth, bendConnect } from './synth.js';
import { makeIR, clipperCurve, clamp, setFallbackContext } from './dsp.js';

export const MUSIC_TRIM = 0.55;
export const SFX_TRIM = 1.0;
export const VOICE_TRIM = 0.6;
export const STING_TRIM = 0.85;
const MAX_VOICES = 32;
const MAX_SAME = 5;
const MAX_LOOPS = 12;

const banks = new Map();
/** One SoundBank per sample rate (shared by all engines at that rate). */
export function getBank(sr) {
  let b = banks.get(sr);
  if (!b) { b = new SoundBank(sr); banks.set(sr, b); }
  return b;
}

const compiled = new Map();
export function getTrack(name) {
  if (!compiled.has(name)) compiled.set(name, compileTrack(name, TRACK_DEFS[name]));
  return compiled.get(name);
}

export class AudioEngine {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.live = !!opts.live;
    setFallbackContext(ctx);
    this.bank = opts.bank || getBank(ctx.sampleRate);
    this.vol = { master: 1, music: 1, sfx: 1 };
    this.intensity = 0;
    this.tape = 1;
    this.tapeTarget = 1;
    this.slowmo = 1;
    this.voices = [];
    this.lastVariant = new Map();
    this.warned = new Set();
    this.loops = new Map();
    this.loopId = opts.loopIdBase || 0;
    this.player = null;
    this.current = null;
    this.dying = [];
    this.vp = null;
    this.duckUntil = 0;
    this.duckDepth = 1;
    this.lastCtxTime = null;
    this.lastUpdate = 0;
    this.timer = null;
    this.build();
  }

  build() {
    const c = this.ctx;
    const nyq = c.sampleRate / 2;
    const g = (v, to) => { const n = c.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
    const lp = (f, q, to) => { const n = c.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q; if (to) n.connect(to); return n; };

    // master chain: gentle bus compressor/limiter + safety clipper
    this.clip = c.createWaveShaper();
    this.clip.curve = clipperCurve();
    this.clip.connect(c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.2;
    this.comp.connect(this.clip);
    this.master = g(this.vol.master, this.comp);
    this.slowLP = lp(nyq * 0.98, 0.5, this.master);
    this.mix = g(1, this.slowLP);

    // sfx bus (+ steel cavern reverb inside the bus so sfx volume governs it)
    this.sfxIn = g(SFX_TRIM, this.mix);
    this.sfxRevIn = g(1);
    this.sfxConv = c.createConvolver();
    this.sfxConv.normalize = false;
    this.sfxRevIn.connect(this.sfxConv);
    this.sfxConv.connect(this.sfxIn);
    this.voiceIn = g(VOICE_TRIM, this.sfxIn);
    this.stingIn = g(STING_TRIM, this.sfxIn);

    // music bus: volume -> duck -> muffle (2 lowpasses = 24 dB/oct) ; reverb inside the bus
    this.muffleGain = g(1, this.mix);
    this.muffle2 = lp(nyq * 0.98, 0.6, this.muffleGain);
    this.muffle1 = lp(nyq * 0.98, 0.6, this.muffle2);
    this.musicDuck = g(1, this.muffle1);
    this.musicIn = g(MUSIC_TRIM, this.musicDuck);
    this.musicRevIn = g(1);
    this.musicConv = c.createConvolver();
    this.musicConv.normalize = false;
    // Impulse responses are generated in JS; live engines do it in later tasks so init() stays light.
    const irs = [
      () => { this.sfxConv.buffer = makeIR(c.sampleRate, { dur: 1.6, seed: 7, dark: 1, metal: 0.22 }, c); },
      () => { this.musicConv.buffer = makeIR(c.sampleRate, { dur: 1.8, seed: 3, dark: 0.8, metal: 0.08, bright: 6500 }, c); },
    ];
    if (this.live && typeof setTimeout !== 'undefined') irs.forEach((f, i) => setTimeout(() => { try { f(); } catch (e) { /* no reverb */ } }, 30 + i * 40));
    else irs.forEach((f) => f());
    this.musicRevIn.connect(this.musicConv);
    this.musicConv.connect(this.musicIn);

    // slow-motion pitch bend sources (cents)
    this.sfxBend = null;
    this.musicBend = null;
    if (typeof c.createConstantSource === 'function') {
      this.sfxBend = c.createConstantSource();
      this.sfxBend.offset.value = 0;
      this.sfxBend.start();
      this.musicBend = c.createConstantSource();
      this.musicBend.offset.value = 0;
      this.musicBend.start();
    }
  }

  warnOnce(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    if (typeof console !== 'undefined') console.warn('[audio] ' + (msg || `unknown sound "${key}"`));
  }

  // ------------------------------------------------------------------ volumes
  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx']) if (v[k] != null && isFinite(+v[k])) this.vol[k] = clamp(+v[k], 0, 1);
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, now, 0.02);
    this.musicIn.gain.setTargetAtTime(this.vol.music * MUSIC_TRIM, now, 0.02);
    this.sfxIn.gain.setTargetAtTime(this.vol.sfx * SFX_TRIM, now, 0.02);
  }

  /** One-shots are dropped while a live context is suspended (they would all fire at once on unlock). */
  canPlayNow() { return !this.live || this.ctx.state === 'running'; }

  // ------------------------------------------------------------------ one-shots
  sfx(name, o = {}) {
    const e = this.bank.entries.get(name);
    if (!e || (e.kind !== 'sfx' && e.kind !== 'stinger')) { this.warnOnce(name); return; }
    if (!e.ready) { this.bank.bump(name); return; }
    if (!this.canPlayNow()) return;
    this.playEntry(e, o || {}, e.kind === 'stinger' ? this.stingIn : this.sfxIn);
  }

  stinger(name) {
    const e = this.bank.entries.get(name);
    if (!e || e.kind !== 'stinger') { this.warnOnce(name, `unknown stinger "${name}"`); return; }
    if (!e.ready) { this.bank.bump(name); return; }
    if (!this.canPlayNow()) return;
    this.playEntry(e, {}, this.stingIn);
    const d = e.bufs[0].duration;
    this.duck(0.6, clamp(d * 0.55, 0.6, 2.4));
  }

  reap(now) {
    if (!this.voices.length) return;
    this.voices = this.voices.filter((v) => !v.done && now < v.end);
  }

  steal(v, now) {
    v.done = true;
    try {
      const p = v.g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 0.02);
      v.src.stop(now + 0.03);
    } catch (e) { /* already stopped */ }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  playEntry(e, o, dest) {
    const c = this.ctx, def = e.def;
    const now = c.currentTime;
    const t = now + Math.max(0, +o.delay || 0);
    const prio = def.prio ?? 1;
    this.reap(now);
    const same = this.voices.filter((v) => v.name === e.key);
    if (same.length >= (def.max || MAX_SAME)) this.steal(same[0], now);
    if (this.voices.length >= MAX_VOICES) {
      let victim = null;
      for (const v of this.voices) if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start)) victim = v;
      if (victim && victim.prio > prio) return; // everything playing matters more than this sound
      if (victim) this.steal(victim, now);
    }
    const n = e.bufs.length;
    let vi = 0;
    if (n > 1) {
      vi = Math.floor(Math.random() * n);
      if (vi === this.lastVariant.get(e.key)) vi = (vi + 1) % n;
      this.lastVariant.set(e.key, vi);
    }
    const buf = e.bufs[vi];
    const jit = def.jit ?? (def.v > 1 ? 0.04 : 0.015);
    const rate = clamp((+o.pitch || 1) * (1 + (Math.random() * 2 - 1) * jit), 0.2, 4);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (!def.ui) bendConnect(this.sfxBend, src);
    const gn = c.createGain();
    gn.gain.value = clamp(o.vol == null ? 1 : +o.vol || 0, 0, 4);
    src.connect(gn);
    let node = gn;
    const pan = clamp(+o.pan || 0, -1, 1);
    if (pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      gn.connect(p);
      node = p;
    }
    node.connect(dest);
    const rev = def.rev ?? 0.1;
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; node.connect(s); s.connect(this.sfxRevIn); }
    src.start(t);
    const v = { name: e.key, src, g: gn, start: t, end: t + (buf.duration / rate) * 4 + 0.1, prio, done: false };
    src.onended = () => { v.done = true; try { node.disconnect(); } catch (err) { /* ok */ } };
    this.voices.push(v);
  }

  // ------------------------------------------------------------------ music
  music(name, o = {}) {
    const fade = Math.max(0, o && o.fade != null ? +o.fade : 1.2);
    const canon = name == null ? null : (TRACK_ALIASES[name] || name);
    if (canon != null && !TRACK_DEFS[canon]) { this.warnOnce('music:' + name, `unknown music track "${name}"`); return; }
    if (canon === this.current) return;
    this.current = canon;
    if (this.player) { this.player.stop(fade); this.dying.push(this.player); this.player = null; }
    if (canon == null) return;
    const p = new MusicPlayer(this, getTrack(canon));
    p.start(Math.max(0.05, fade));
    this.player = p;
    this.pump();
  }

  setMusicIntensity(x) {
    this.intensity = clamp(+x || 0, 0, 1);
    if (this.player) this.player.setIntensity(this.intensity);
  }

  setSlowmo(f) {
    f = clamp(f == null || !isFinite(+f) ? 1 : +f, 0.05, 1);
    this.slowmo = f;
    const now = this.ctx.currentTime, tau = 0.12;
    const nyq = this.ctx.sampleRate / 2;
    if (this.sfxBend) this.sfxBend.offset.setTargetAtTime(1200 * Math.log2(Math.pow(f, 0.3)), now, tau);
    this.tapeTarget = Math.pow(f, 0.22);
    if (this.musicBend) this.musicBend.offset.setTargetAtTime(1200 * Math.log2(this.tapeTarget), now, tau);
    const fc = f >= 0.999 ? nyq * 0.98 : Math.min(nyq * 0.98, 300 + 21000 * f * f);
    this.slowLP.frequency.setTargetAtTime(fc, now, tau);
  }

  muffle(on) {
    const now = this.ctx.currentTime;
    const nyq = this.ctx.sampleRate / 2;
    const fc = on ? 380 : nyq * 0.98;
    const tau = on ? 0.07 : 0.15;
    this.muffle1.frequency.setTargetAtTime(fc, now, tau);
    this.muffle2.frequency.setTargetAtTime(fc, now, tau);
    this.muffleGain.gain.setTargetAtTime(on ? 0.9 : 1, now, 0.1);
  }

  duck(amount = 0.5, seconds = 0.6) {
    const now = this.ctx.currentTime;
    const p = this.musicDuck.gain;
    const target = 1 - clamp(amount == null ? 0.5 : +amount || 0, 0, 1);
    this.duckDepth = now < this.duckUntil ? Math.min(this.duckDepth, target) : target;
    this.duckUntil = Math.max(this.duckUntil, now + Math.max(0.05, seconds == null ? 0.6 : +seconds || 0));
    const cur = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(cur, now);
    p.linearRampToValueAtTime(this.duckDepth, now + 0.04);
    p.setValueAtTime(this.duckDepth, this.duckUntil);
    p.linearRampToValueAtTime(1, this.duckUntil + 0.4);
  }

  // ------------------------------------------------------------------ dialogue voice
  voice(who, text, o = {}) {
    if (!VOICES[who]) this.warnOnce('voice:' + who, `unknown voice "${who}" (using jim)`);
    this.stopVoice(0.03);
    const vp = new VoicePlayer(this, VOICES[who] ? who : 'jim', text, o || {});
    if (!this.canPlayNow()) { vp.dispose(); return vp.plan.total; }
    this.vp = vp;
    this.pump();
    return vp.plan.total;
  }

  stopVoice(fade = 0.05) {
    if (!this.vp) return;
    this.vp.stop(fade);
    this.dying.push(this.vp);
    this.vp = null;
  }

  // ------------------------------------------------------------------ loops
  loopStart(name, o = {}) {
    const id = ++this.loopId;
    const def = LOOPS[name];
    if (!def) { this.warnOnce('loop:' + name, `unknown loop "${name}"`); return id; }
    if (this.loops.size >= MAX_LOOPS) this.loopStop(this.loops.keys().next().value, 0.05);
    const c = this.ctx;
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(clamp(o.vol == null ? 1 : +o.vol || 0, 0, 4) * def.gain, now + 0.06);
    let node = out;
    const pan = clamp(+o.pan || 0, -1, 1);
    if (pan && typeof c.createStereoPanner === 'function') { const p = c.createStereoPanner(); p.pan.value = pan; out.connect(p); node = p; }
    node.connect(this.sfxIn);
    if (def.rev) { const s = c.createGain(); s.gain.value = def.rev; node.connect(s); s.connect(this.sfxRevIn); }
    const S = new Synth(c, out, { keep: true, bend: this.sfxBend, bank: this.bank });
    const E = new Synth(c, out, { bend: this.sfxBend, bank: this.bank });
    let inst = {};
    try { inst = def.start(S, E, o || {}, now + 0.01) || {}; } catch (e) { this.warnOnce('loopfail:' + name, `loop ${name} failed: ${e.message}`); }
    this.loops.set(id, { name, out, node, S, inst });
    this.pump();
    return id;
  }

  loopStop(id, fade = 0.15) {
    const l = this.loops.get(id);
    if (!l) return;
    this.loops.delete(id);
    const now = this.ctx.currentTime;
    fade = Math.max(0.01, fade == null ? 0.15 : +fade || 0.01);
    const p = l.out.gain;
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
    p.linearRampToValueAtTime(0, now + fade);
    l.S.stopAll(now + fade + 0.02);
    l.killAt = now + fade + 0.3;
    l.dispose = () => { try { l.node.disconnect(); l.out.disconnect(); } catch (e) { /* ok */ } };
    this.dying.push(l);
  }

  stopAll(fade = 0.1) {
    const now = this.ctx.currentTime;
    for (const v of this.voices.slice()) this.steal(v, now);
    for (const id of [...this.loops.keys()]) this.loopStop(id, fade);
    this.stopVoice(fade);
  }

  // ------------------------------------------------------------------ scheduling
  lookahead() {
    return typeof document !== 'undefined' && document.hidden ? 1.5 : 0.16;
  }

  /** Schedule everything up to now + lookahead (idempotent; called from update() and a timer). */
  pump() {
    const c = this.ctx;
    const now = c.currentTime;
    const dt = this.lastCtxTime == null ? 0 : Math.max(0, now - this.lastCtxTime);
    this.lastCtxTime = now;
    if (this.tape !== this.tapeTarget) {
      this.tape += (this.tapeTarget - this.tape) * (1 - Math.exp(-dt / 0.12));
      if (Math.abs(this.tape - this.tapeTarget) < 1e-4) this.tape = this.tapeTarget;
    }
    const h = now + this.lookahead();
    if (this.player) this.player.schedule(h);
    if (this.vp) {
      this.vp.schedule(h);
      if (this.vp.finished) { this.vp.dispose(); this.vp = null; }
    }
    for (const l of this.loops.values()) if (l.inst.tick) { try { l.inst.tick(h); } catch (e) { /* keep running */ } }
    if (this.dying.length) {
      this.dying = this.dying.filter((d) => {
        if (now > d.killAt) { try { d.dispose(); } catch (e) { /* ok */ } return false; }
        return true;
      });
    }
  }

  update() {
    this.lastUpdate = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.pump();
  }

  /** Backup pump for when the game loop isn't calling update() (menus, hidden tabs). */
  startTimer() {
    if (this.timer || typeof setTimeout === 'undefined') return;
    const tick = () => {
      this.timer = setTimeout(tick, 40);
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - this.lastUpdate > 60) { try { this.pump(); } catch (e) { /* never throw from timer */ } }
    };
    this.timer = setTimeout(tick, 40);
  }

  resume() {
    const c = this.ctx;
    if (c.state !== 'running' && typeof c.resume === 'function') {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
      try { // iOS unlock: play one silent sample inside the gesture
        const b = c.createBuffer(1, 1, c.sampleRate);
        const s = c.createBufferSource();
        s.buffer = b;
        s.connect(c.destination);
        s.start(0);
      } catch (e) { /* ignore */ }
    }
  }
}
