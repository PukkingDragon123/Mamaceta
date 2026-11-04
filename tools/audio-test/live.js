// Live-page smoke test: every public API call must be safe before/after a user gesture,
// and when Web Audio is missing entirely.
import { Audio } from '/src/audio/audio.js';

window.AudioAPI = Audio;
let last = performance.now();
function frame(now) { Audio.update((now - last) / 1000); last = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
document.getElementById('go').addEventListener('click', () => { Audio.resume(); Audio.sfx('ui_select'); });

window.callAll = function () {
  const errs = [];
  const t = (label, fn) => { try { return fn(); } catch (e) { errs.push(label + ': ' + (e && e.message)); return undefined; } };
  const names = t('names', () => Audio.names());
  t('init', () => Audio.init());
  t('init again', () => Audio.init());
  t('resume', () => Audio.resume());
  t('setVolumes', () => Audio.setVolumes({ master: 0.8, music: 0.5, sfx: 0.9 }));
  t('setVolumes partial', () => Audio.setVolumes({ music: 0.3 }));
  t('setVolumes junk', () => Audio.setVolumes(null));
  t('setVolumes junk2', () => Audio.setVolumes({ master: 'loud', sfx: -4 }));
  for (const n of names.sfx) t('sfx ' + n, () => Audio.sfx(n, { vol: 0.4, pitch: 1.05, pan: -0.4, delay: 0.01 }));
  t('sfx unknown', () => Audio.sfx('definitely_not_a_sound'));
  t('sfx unknown again', () => Audio.sfx('definitely_not_a_sound'));
  t('sfx junk opts', () => Audio.sfx('hit_light', { vol: 'x', pitch: NaN, pan: 9, delay: -3 }));
  t('sfx no opts', () => Audio.sfx('hit_light'));
  for (const s of names.stingers) t('stinger ' + s, () => Audio.stinger(s));
  t('stinger unknown', () => Audio.stinger('stinger_nope'));
  t('music menu', () => Audio.music('menu'));
  t('music same', () => Audio.music('menu'));
  t('music title alias', () => Audio.music('title'));
  for (const m of names.music) t('music ' + m, () => Audio.music(m, { fade: 0.2 }));
  t('music unknown', () => Audio.music('nonexistent_track'));
  t('music null', () => Audio.music(null));
  t('music null again', () => Audio.music(null));
  t('music rustpit', () => Audio.music('rustpit', { fade: 0.5 }));
  t('intensity', () => Audio.setMusicIntensity(0.8));
  t('intensity junk', () => Audio.setMusicIntensity('high'));
  t('intensity >1', () => Audio.setMusicIntensity(4));
  t('slowmo', () => Audio.setSlowmo(0.25));
  t('slowmo junk', () => Audio.setSlowmo(undefined));
  t('slowmo back', () => Audio.setSlowmo(1));
  t('muffle on', () => Audio.muffle(true));
  t('muffle off', () => Audio.muffle(false));
  t('duck default', () => Audio.duck());
  t('duck args', () => Audio.duck(0.8, 2));
  t('duck junk', () => Audio.duck('a', 'b'));
  const durs = {};
  for (const v of names.voices) durs[v] = t('voice ' + v, () => Audio.voice(v, 'Hola amigo, welcome to the Rust Pit! Ready?', { speed: 1 }));
  durs.unknown = t('voice unknown', () => Audio.voice('nobody', 'hello there'));
  durs.empty = t('voice empty', () => Audio.voice('jim', ''));
  durs.nul = t('voice null', () => Audio.voice('jim', null));
  durs.fast = t('voice fast', () => Audio.voice('molt', 'Snails. Now.', { speed: 2 }));
  t('stopVoice', () => Audio.stopVoice());
  t('stopVoice again', () => Audio.stopVoice());
  const ids = [];
  for (const l of names.loops) ids.push(t('loopStart ' + l, () => Audio.loopStart(l, { vol: 0.5 })));
  ids.push(t('loopStart unknown', () => Audio.loopStart('nope_loop')));
  for (const id of ids) t('loopStop ' + id, () => Audio.loopStop(id));
  t('loopStop bogus', () => Audio.loopStop(123456));
  t('loopStop undefined', () => Audio.loopStop());
  t('update', () => Audio.update(0.016));
  t('update junk', () => Audio.update());
  t('ready', () => Audio.ready());
  t('getVolumes', () => Audio.getVolumes());
  t('stopAll', () => Audio.stopAll());
  return { errs, state: Audio.state(), durs, ids, voicesOk: Object.values(durs).every((d) => typeof d === 'number' && isFinite(d)), idsOk: ids.every((i) => typeof i === 'number') };
};

window.playScene = function () {
  Audio.setVolumes({ master: 1, music: 1, sfx: 1 });
  Audio.music('menu', { fade: 0.3 });
  setTimeout(() => Audio.sfx('ui_move'), 300);
  setTimeout(() => Audio.sfx('hit_heavy', { pan: 0.4 }), 600);
  setTimeout(() => Audio.voice('molt', 'Snails up front, sweetie.'), 900);
  setTimeout(() => Audio.stinger('stinger_fight'), 1500);
};
// Auto mode: exercise the whole API on load, before any user gesture has happened.
if (location.search.includes('auto')) {
  const longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* unsupported */ }
  (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const tInit = performance.now();
    Audio.init();
    const initMs = performance.now() - tInit;
    const tReady = performance.now();
    await Audio.ready();
    const readyMs = performance.now() - tReady;
    const r1 = window.callAll();
    Audio.music('menu');
    await sleep(600);
    const r2 = window.callAll();
    let ready = false;
    await Promise.race([Audio.ready().then(() => { ready = true; }), sleep(8000)]);
    const r3 = window.callAll();
    Audio.music('menu');
    const lvl = window.__level ? await window.__level(600) : -999;
    window.__auto = { r1, r2, r3, ready, st: Audio.state(), lvl, act: !!(navigator.userActivation && navigator.userActivation.hasBeenActive), initMs, readyMs, longTasks };
    console.log('AUTO_DONE ' + JSON.stringify(window.__auto));
  })();
}
document.getElementById('log').textContent = 'live test ready';
window.liveReady = true;
