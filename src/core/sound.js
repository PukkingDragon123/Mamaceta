// Thin, failure-proof facade over the audio engine (src/audio/audio.js).
// Game code only talks to this, so a missing/broken audio module can never crash the game.

let impl = null;
let pending = [];
const noop = () => {};

// import.meta.glob keeps the game working (silently) if the audio module is missing
const audioModules = import.meta.glob('../audio/audio.js');
const audioLoad = audioModules['../audio/audio.js'];
const loader = (audioLoad ? audioLoad() : Promise.reject(new Error('src/audio/audio.js not found')))
  .then((m) => {
    impl = m.Audio || m.default || null;
    try { impl && impl.init && impl.init(); } catch (e) { console.warn('audio init failed', e); impl = null; }
    if (impl) for (const [fn, args] of pending) { try { impl[fn]?.(...args); } catch (e) { /* ignore */ } }
    pending = [];
  })
  .catch((e) => { console.warn('Audio module unavailable:', e?.message || e); });

function call(fn, ...args) {
  if (!impl) {
    if (fn === 'music' || fn === 'setVolumes' || fn === 'muffle') { pending = pending.filter((p) => p[0] !== fn); pending.push([fn, args]); }
    return undefined;
  }
  try { return impl[fn]?.(...args); } catch (e) { console.warn('audio', fn, e); return undefined; }
}

export const Sound = {
  ready: loader,
  resume: () => call('resume'),
  setVolumes: (v) => call('setVolumes', v),
  sfx: (name, opts) => call('sfx', name, opts),
  music: (track, opts) => call('music', track, opts),
  stinger: (name) => call('stinger', name),
  intensity: (x) => call('setMusicIntensity', x),
  slowmo: (f) => call('setSlowmo', f),
  muffle: (on) => call('muffle', on),
  duck: (a, s) => call('duck', a, s),
  voice: (who, text, opts) => call('voice', who, text, opts) || Math.min(3, 0.3 + text.length / 16),
  stopVoice: () => call('stopVoice'),
  loopStart: (name, opts) => call('loopStart', name, opts),
  loopStop: (id, fade) => (id != null ? call('loopStop', id, fade) : undefined),
  update: (dt) => call('update', dt),
  noop,
};
