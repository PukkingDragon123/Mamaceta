// In-browser offline test harness: renders every sfx / stinger / voice / loop / music track through
// the real engine graph (master compressor + clipper) in an OfflineAudioContext and measures it.
import { AudioEngine, getBank, getTrack } from '/src/audio/engine.js';
import { SFX } from '/src/audio/sfx.js';
import { STINGERS } from '/src/audio/stingers.js';
import { TRACK_DEFS } from '/src/audio/tracks.js';
import { VOICES } from '/src/audio/voice.js';
import { LOOPS } from '/src/audio/loops.js';
import { analyzeBuffer } from '/src/audio/dsp.js';
import { dryRun } from '/src/audio/music.js';

const SR = 48000;
const log = (m) => { document.getElementById('log').textContent += '\n' + m; };

let bank = null;
async function getReadyBank() {
  if (bank) return bank;
  bank = getBank(SR);
  const t0 = performance.now();
  await bank.renderAll({ batch: 6 });
  bank.renderMs = performance.now() - t0;
  return bank;
}

/**
 * Render `len` seconds through a fresh engine. Everything is triggered after WARM seconds so the
 * DynamicsCompressor is past its start-up state (as it always is in the live game); the returned
 * buffer is the part after the warm-up. `setup(eng)` runs at t=0 (after warm-up), events = [[t, fn]].
 */
const WARM = 0.3;
async function render(len, setup, events = [], pumpStep = 0.05) {
  const total = len + WARM;
  const oc = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const eng = new AudioEngine(oc, { bank });
  const sched = new Map();
  const at = (t, fn) => { const q = Math.round(t * SR / 128); if (!sched.has(q)) sched.set(q, []); if (fn) sched.get(q).push(fn); };
  for (let t = pumpStep; t < total - 0.01; t += pumpStep) at(t, null);
  at(WARM, (e) => setup(e, oc));
  for (const [t, fn] of events) at(WARM + t, fn);
  for (const [q, fns] of sched) {
    oc.suspend((q * 128) / SR).then(() => { for (const f of fns) f(eng); eng.pump(); oc.resume(); });
  }
  eng.pump();
  const t0 = performance.now();
  const full = await oc.startRendering();
  const off = Math.round(WARM * SR / 128) * 128;
  const buf = new AudioBuffer({ numberOfChannels: 2, length: full.length - off, sampleRate: SR });
  for (let c = 0; c < 2; c++) buf.getChannelData(c).set(full.getChannelData(c).subarray(off));
  return { buf, ms: performance.now() - t0, eng };
}

function measure(name, kind, buf, extra = {}) {
  const a = analyzeBuffer(buf, 0.05);
  // tail check: last 10 ms level relative to peak
  let tail = 0;
  const n = buf.length, w = Math.floor(0.01 * SR);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = n - w; i < n; i++) tail = Math.max(tail, Math.abs(d[i])); }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
  return { name, kind, peak: a.peak, peakDb: db(a.peak), rmsDb: db(a.rms), stDb: db(a.st), dur: a.dur, nan: a.nan, tailDb: db(tail) - db(a.peak), ...extra };
}

const SAMPLE_TEXT = {
  jim: 'Hey hey! Welcome to the Rust Pit, amigo. Ready to rumble?',
  brutus: 'Brutus... SMASH. Brutus hungry.',
  bobby: 'Heh heh! Bobby is the fastest shrimp in the whole wide ocean!',
  mimi: 'Hiii! I love your shell, it is sooo shiny!',
  molt: 'Snails up front, sweetie. Madam Molt never gives credit, dear.',
  ref: 'Fighters ready. Keep it clean. FIGHT!',
  bartender: 'What will it be, friend? The usual kelp tequila?',
  demon: 'You cannot escape the deep...',
  puru: 'Puru puru! Pu?',
};

window.runHarness = async function (opts = {}) {
  const out = { sfx: [], stinger: [], voice: [], loop: [], music: [], fx: [], errors: [], warnings: [] };
  const origWarn = console.warn;
  console.warn = (...a) => { out.warnings.push(a.join(' ')); origWarn(...a); };
  try {
    await getReadyBank();
    out.bankMs = bank.renderMs;
    out.bankWarnings = bank.warnings.slice();
    out.bankStats = bank.stats();
    log(`bank rendered in ${bank.renderMs.toFixed(0)} ms`);
    const only = opts.only ? new Set(opts.only) : null;

    for (const name of Object.keys(SFX)) {
      if (only && !only.has(name)) continue;
      const e = bank.get(name);
      if (!e) { out.errors.push(`sfx ${name} not rendered`); continue; }
      const len = Math.max(...e.bufs.map((b) => b.duration)) + 0.7;
      const { buf, ms } = await render(len, (eng) => eng.sfx(name));
      out.sfx.push(measure(name, 'sfx', buf, { ms, variants: e.bufs.length, raw: e.info[0].dur }));
    }
    for (const name of Object.keys(STINGERS)) {
      if (only && !only.has(name)) continue;
      const e = bank.get(name);
      if (!e) { out.errors.push(`stinger ${name} not rendered`); continue; }
      const len = e.bufs[0].duration + 0.8;
      const { buf, ms } = await render(len, (eng) => eng.stinger(name));
      out.stinger.push(measure(name, 'stinger', buf, { ms, raw: e.info[0].dur }));
    }
    if (!only) {
      for (const who of Object.keys(VOICES)) {
        let total = 0;
        const { buf, ms } = await render(6.5, (eng) => { total = eng.voice(who, SAMPLE_TEXT[who]); });
        out.voice.push(measure(who, 'voice', buf, { ms, est: total }));
      }
      for (const name of Object.keys(LOOPS)) {
        let id = 0;
        const { buf, ms } = await render(2.6, (eng) => { id = eng.loopStart(name); }, [[1.9, (eng) => eng.loopStop(id, 0.15)]]);
        out.loop.push(measure(name, 'loop', buf, { ms }));
      }
      for (const name of Object.keys(TRACK_DEFS)) {
        const tr = getTrack(name);
        const dr = dryRun(tr, 240);
        const LEN = 24;
        const { buf, ms } = await render(LEN, (eng) => { eng.music(name, { fade: 0.01 }); eng.setMusicIntensity(name === 'rustpit' ? 1 : 0); });
        // loudness judged on the main sections (8..24 s), gap check on every second
        const main = new AudioBuffer({ numberOfChannels: 2, length: (LEN - 8) * SR, sampleRate: SR });
        for (let c = 0; c < 2; c++) main.getChannelData(c).set(buf.getChannelData(c).subarray(8 * SR, LEN * SR));
        const whole = measure(name, 'music', buf);
        const m = measure(name, 'music', main, { ms: ms / 3, warnings: tr.warnings, events240: dr.events, sections: dr.sectionsSeen.slice(0, 12).join(','), deps: tr.deps.length, wholePeak: whole.peak });
        m.peak = Math.max(m.peak, whole.peak);
        m.peakDb = 20 * Math.log10(m.peak);
        const secs = [];
        const d0 = buf.getChannelData(0);
        for (let s2 = 0; s2 < LEN; s2++) { let acc = 0; for (let i = s2 * SR; i < (s2 + 1) * SR; i++) acc += d0[i] * d0[i]; secs.push(+(10 * Math.log10(acc / SR + 1e-20)).toFixed(1)); }
        m.perSec = secs;
        out.music.push(m);
      }
      // effect checks: slowmo / muffle / duck / crossfade / intensity during music
      {
        const { buf } = await render(7, (eng) => eng.music('rustpit', { fade: 0.01 }), [
          [1.5, (eng) => eng.setSlowmo(0.25)], [2.0, (eng) => eng.sfx('hit_heavy')], [3.5, (eng) => eng.setSlowmo(1)],
          [4.0, (eng) => eng.muffle(true)], [5.0, (eng) => eng.muffle(false)], [5.5, (eng) => eng.duck(0.7, 0.5)],
          [6.0, (eng) => eng.music('menu', { fade: 0.8 })], [6.2, (eng) => eng.setMusicIntensity(0.5)],
        ]);
        out.fx.push(measure('fx_combo', 'fx', buf));
      }
      // stress: 60 overlapping hits in 1 s must stay under the limiter and the voice cap
      {
        let maxVoices = 0;
        const evs = [];
        const names = ['hit_heavy', 'hit_super', 'ko', 'cavitation', 'ult_hit', 'belly_flop', 'shockwave', 'hit_medium'];
        for (let i = 0; i < 60; i++) evs.push([0.05 + i * 0.016, (eng) => { eng.sfx(names[i % names.length], { pan: (i % 5) / 2 - 1 }); maxVoices = Math.max(maxVoices, eng.voices.length); }]);
        const { buf } = await render(3, (eng) => eng.music('rustpit', { fade: 0.01 }), evs, 0.05);
        out.fx.push(measure('stress_60_hits', 'fx', buf, { maxVoices }));
      }
    }
  } catch (e) {
    out.errors.push(String(e && e.stack || e));
  }
  console.warn = origWarn;
  log('done');
  return out;
};

// ---------------------------------------------------------------- spectrogram contact sheets
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function drawSpec(ctx2d, buf, x0, y0, W, H, label, maxSec) {
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  const N = 2048, fmin = 40, fmax = 16000;
  const dur = Math.min(maxSec || buf.duration, buf.duration);
  const img = ctx2d.createImageData(W, H);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let x = 0; x < W; x++) {
    const c = Math.floor((x / W) * dur * sr);
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) { const k = c - N / 2 + i; re[i] = (k >= 0 && k < d.length ? d[k] : 0) * win[i]; }
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - y / (H - 1));
      const bin = Math.min(N / 2 - 1, Math.round((f * N) / sr));
      const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2) / (N / 4);
      const db = 20 * Math.log10(mag + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 90) / 85));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * Math.max(0, v * 1.4 - 0.35); img.data[o + 2] = 255 * Math.max(0, (v - 0.6) * 2.4) + 40 * (1 - v); img.data[o + 3] = 255;
    }
  }
  ctx2d.putImageData(img, x0, y0);
  // envelope strip
  ctx2d.fillStyle = '#111'; ctx2d.fillRect(x0, y0 + H, W, 24);
  ctx2d.fillStyle = '#6cf';
  const spp = (dur * sr) / W;
  for (let x = 0; x < W; x++) {
    let pk = 0;
    for (let i = Math.floor(x * spp); i < Math.floor((x + 1) * spp) && i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    const h = Math.max(0, (20 * Math.log10(pk + 1e-9) + 60) / 60) * 22;
    ctx2d.fillRect(x0 + x, y0 + H + 23 - h, 1, h);
  }
  ctx2d.fillStyle = '#fff'; ctx2d.font = '11px monospace';
  ctx2d.fillText(`${label} (${dur.toFixed(2)}s)`, x0 + 3, y0 + 12);
}

const SCENARIOS = {
  slowmo: [(e) => e.music('rustpit', { fade: 0.01 }), [[2, (e) => e.setSlowmo(0.25)], [2.6, (e) => e.sfx('hit_heavy')], [4.5, (e) => e.setSlowmo(1)], [5.2, (e) => e.sfx('hit_heavy')]]],
  muffle: [(e) => e.music('select', { fade: 0.01 }), [[2, (e) => e.muffle(true)], [5, (e) => e.muffle(false)]]],
  duck: [(e) => e.music('select', { fade: 0.01 }), [[2, (e) => e.duck(0.8, 1.0)], [5, (e) => e.stinger('stinger_fight')]]],
  xfade: [(e) => e.music('menu', { fade: 0.01 }), [[3, (e) => e.music('rustpit', { fade: 1.2 })]]],
  intensity: [(e) => e.music('rustpit', { fade: 0.01 }), [[1, (e) => e.setMusicIntensity(0)], [4, (e) => e.setMusicIntensity(1)]]],
};

window.runSpectro = async function (names, opts = {}) {
  await getReadyBank();
  const W = opts.w || 300, H = opts.h || 140, cols = opts.cols || 4;
  const rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * (W + 6); cv.height = rows * (H + 30);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < names.length; i++) {
    const nm = names[i];
    let buf;
    if (nm.startsWith('music:')) buf = (await render(opts.sec || 8, (eng) => eng.music(nm.slice(6), { fade: 0.01 }))).buf;
    else if (nm.startsWith('voice:')) { const who = nm.slice(6); buf = (await render(4, (eng) => eng.voice(who, SAMPLE_TEXT[who]))).buf; }
    else if (nm.startsWith('scenario:')) buf = (await render(8, ...SCENARIOS[nm.slice(9)])).buf;
    else if (nm.startsWith('loop:')) { let id; buf = (await render(2.4, (eng) => { id = eng.loopStart(nm.slice(5)); }, [[1.9, (eng) => eng.loopStop(id)]])).buf; }
    else if (STINGERS[nm]) buf = (await render(bank.get(nm).bufs[0].duration + 0.3, (eng) => eng.stinger(nm))).buf;
    else buf = (await render(bank.get(nm).bufs[0].duration + 0.3, (eng) => eng.sfx(nm))).buf;
    drawSpec(g, buf, (i % cols) * (W + 6), Math.floor(i / cols) * (H + 30), W, H, nm, opts.maxSec);
  }
  return cv.toDataURL('image/png');
};

/** Render one item and return 16-bit PCM WAV bytes as base64 (for offline inspection). */
window.runWav = async function (nm, sec = 8) {
  await getReadyBank();
  let buf;
  if (nm.startsWith('music:')) buf = (await render(sec, (eng) => eng.music(nm.slice(6), { fade: 0.01 }))).buf;
  else buf = (await render(bank.get(nm).bufs[0].duration + 0.3, (eng) => (STINGERS[nm] ? eng.stinger(nm) : eng.sfx(nm)))).buf;
  const n = buf.length, ch = 2;
  const ab = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = '';
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Mix balance: RMS of each channel soloed over [from, from+len] seconds of a track. */
window.runMix = async function (name, from = 8, len = 12) {
  await getReadyBank();
  const tr = getTrack(name);
  const res = {};
  const chans = ['ALL', ...Object.keys(tr.channels)];
  for (const solo of chans) {
    const { buf } = await render(from + len, (eng) => {
      eng.music(name, { fade: 0.01 });
      eng.setMusicIntensity(1);
      if (solo !== 'ALL') for (const [k, ch] of Object.entries(eng.player.ch)) if (k !== solo) ch.input.gain.value = 0;
    });
    const d = buf.getChannelData(0), e = buf.getChannelData(1);
    let acc = 0, pk = 0;
    const n1 = Math.min(buf.length, (from + len) * SR);
    for (let i = from * SR; i < n1; i++) { acc += (d[i] * d[i] + e[i] * e[i]) / 2; pk = Math.max(pk, Math.abs(d[i])); }
    res[solo] = { rms: +(10 * Math.log10(acc / (len * SR) + 1e-20)).toFixed(1), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1) };
  }
  return res;
};

/** Dominant frequency (Hz) of `buf` channel 0 in [t, t+0.4] within [fmin, fmax]. */
function peakFreq(buf, t, fmin, fmax) {
  const N = 16384, d = buf.getChannelData(0), s0 = Math.floor(t * SR);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = (d[s0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  fft(re, im);
  let best = 0, bf = 0;
  for (let k = Math.floor((fmin * N) / SR); k < Math.ceil((fmax * N) / SR); k++) { const m = re[k] * re[k] + im[k] * im[k]; if (m > best) { best = m; bf = (k * SR) / N; } }
  return +bf.toFixed(1);
}

/** Slow-motion pitch check on the sfx bus (pure tone) and the music bus (sustained trombone swell). */
window.runSlowmoCheck = async function () {
  await getReadyBank();
  const a = (await render(4, (e) => e.sfx('charge_full'), [[1.4, (e) => e.setSlowmo(0.25)], [2.0, (e) => e.sfx('charge_full')]])).buf;
  const sfxNormal = peakFreq(a, 0.05, 2000, 3200), sfxSlow = peakFreq(a, 2.05, 1200, 3200);
  const b = (await render(4.5, (e) => e.music('doors', { fade: 0.01 }), [[2.2, (e) => e.setSlowmo(0.25)]])).buf;
  const musNormal = peakFreq(b, 1.4, 180, 260), musSlow = peakFreq(b, 3.4, 120, 260);
  return { sfxNormal, sfxSlow, sfxRatio: +(sfxSlow / sfxNormal).toFixed(3), sfxExpected: +Math.pow(0.25, 0.3).toFixed(3), musNormal, musSlow, musRatio: +(musSlow / musNormal).toFixed(3), musExpected: +Math.pow(0.25, 0.22).toFixed(3) };
};

log('ready');
window.harnessReady = true;
