// Playwright driver for the Mantis Mayhem audio tests.
//   node tools/audio-test/run.cjs            full offline render + live API smoke tests (prints table, exits 1 on failure)
//   node tools/audio-test/run.cjs spec OUT.png name1 name2 ...   spectrogram contact sheet (music:x, voice:x, loop:x allowed)
//   node tools/audio-test/run.cjs wav OUT.wav name               render one sound / music:track to a WAV
const { chromium } = require('playwright');
const fs = require('fs');
const { start } = require('./serve.cjs');

const PORT = 5199;
const BASE = `http://localhost:${PORT}/tools/audio-test`;

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function num(x, d = 1) { return x == null || !isFinite(x) ? '   -' : x.toFixed(d); }

// expected loudness windows (dB of max 50 ms RMS after the master chain)
function expectedSt(r) {
  const n = r.name;
  if (r.kind === 'music') return [-34, -14];
  if (r.kind === 'voice') return [-32, -14];
  if (r.kind === 'loop') return [-36, -12];
  if (r.kind === 'stinger') return [-20, -5];
  if (n === 'step') return [-40, -22];
  if (n.startsWith('ui_')) return ['ui_door_slam', 'ui_lock_in'].includes(n) ? [-22, -6] : [-38, -12];
  return [-30, -4];
}

async function newPage(browser, { noAudio = false, policy = false } = {}) {
  const ctx = await browser.newContext();
  if (noAudio) await ctx.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; window.AudioContext = undefined; window.webkitAudioContext = undefined; });
  if (policy) {
    // Headless Chromium allows autoplay, so emulate the real policy: contexts start suspended and
    // resume() only works after a user activation. Also tap the destination with an analyser.
    await ctx.addInitScript(() => {
      const Orig = window.AudioContext;
      class Gated extends Orig {
        constructor(...a) { super(...a); Orig.prototype.suspend.call(this); window.__ctx = this; }
        resume() { return navigator.userActivation && navigator.userActivation.hasBeenActive ? Orig.prototype.resume.call(this) : Promise.resolve(); }
      }
      window.AudioContext = Gated; window.webkitAudioContext = Gated;
      const conn = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && !(dest.context instanceof OfflineAudioContext)) {
          const c = dest.context;
          if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; window.__an = c.__an; }
          conn.call(this, c.__an);
        }
        return conn.call(this, dest, ...rest);
      };
      window.__level = async (ms) => { // max RMS (dB) over ~ms of live output
        const an = window.__an; if (!an) return -999;
        const buf = new Float32Array(an.fftSize); let best = -999; const t0 = performance.now();
        while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; best = Math.max(best, 10 * Math.log10(s / buf.length + 1e-20)); await new Promise((r) => setTimeout(r, 30)); }
        return best;
      };
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  return { page, errors, ctx };
}

async function full(browser) {
  let fail = 0;
  const { page, errors } = await newPage(browser);
  await page.goto(`${BASE}/harness.html`);
  await page.waitForFunction(() => window.harnessReady, null, { timeout: 30000 });
  const t0 = Date.now();
  const res = await page.evaluate(() => window.runHarness());
  console.log(`offline harness: ${((Date.now() - t0) / 1000).toFixed(1)} s, bank pre-render ${res.bankMs.toFixed(0)} ms (${res.bankStats.length} keys)`);
  const rows = [...res.sfx, ...res.stinger, ...res.voice, ...res.loop, ...res.music, ...res.fx];
  console.log(pad('name', 22) + pad('kind', 8) + pad('peak', 7) + pad('pk dB', 7) + pad('RMS dB', 8) + pad('ST dB', 7) + pad('dur s', 7) + pad('var', 4) + 'notes');
  for (const r of rows) {
    const notes = [];
    if (r.nan) notes.push(`NaN x${r.nan}`);
    if (!(r.peak < 0.99)) notes.push('PEAK>=0.99');
    const exp = r.kind === 'fx' ? null : expectedSt(r);
    if (exp && (r.stDb < exp[0] || r.stDb > exp[1])) notes.push(`ST out of [${exp}]`);
    if (r.peak < 1e-4) notes.push('SILENT');
    if (r.kind === 'sfx' || r.kind === 'stinger') { if (r.dur < 0.02 || r.dur > 6) notes.push('dur?'); }
    if (r.kind === 'voice' && (!r.est || r.est < 0.5 || r.est > 8)) notes.push(`est=${r.est}`);
    if (r.kind === 'music') {
      if (r.warnings && r.warnings.length) notes.push('WARN: ' + r.warnings.join('; '));
      const gaps = (r.perSec || []).slice(1).filter((x) => x < -60).length;
      if (gaps) notes.push(`silent seconds: ${gaps}`);
      notes.push(`ev240=${r.events240} sec=${r.sections} render=${(r.ms / 1000).toFixed(2)}s/8s`);
    }
    if (r.maxVoices != null) notes.push(`maxVoices=${r.maxVoices}`);
    const bad = notes.some((x) => /NaN|PEAK|SILENT|out of|dur\?|WARN|est=|silent/.test(x));
    if (bad) fail++;
    console.log(pad(r.name, 22) + pad(r.kind, 8) + pad(num(r.peak, 3), 7) + pad(num(r.peakDb), 7) + pad(num(r.rmsDb), 8) + pad(num(r.stDb), 7) + pad(num(r.dur, 2), 7) + pad(r.variants || '', 4) + (bad ? '!! ' : '') + notes.join(' '));
  }
  if (res.errors.length) { fail += res.errors.length; console.log('ERRORS:\n  ' + res.errors.join('\n  ')); }
  if (res.bankWarnings.length) { fail += res.bankWarnings.length; console.log('BANK WARNINGS:\n  ' + res.bankWarnings.join('\n  ')); }
  const otherWarn = res.warnings.filter((w) => !/unknown/.test(w));
  if (otherWarn.length) console.log('console.warn during harness:\n  ' + otherWarn.slice(0, 20).join('\n  '));
  const sm = await page.evaluate(() => window.runSlowmoCheck());
  const smOk = Math.abs(sm.sfxRatio - sm.sfxExpected) < 0.03 && Math.abs(sm.musRatio - sm.musExpected) < 0.04;
  console.log(`slow-mo pitch: sfx ${sm.sfxNormal}->${sm.sfxSlow} Hz (x${sm.sfxRatio}, expect x${sm.sfxExpected}); music ${sm.musNormal}->${sm.musSlow} Hz (x${sm.musRatio}, expect x${sm.musExpected}) ${smOk ? 'OK' : '!! MISMATCH'}`);
  if (!smOk) fail++;
  if (errors.length) { fail += errors.length; console.log('PAGE ERRORS:\n  ' + errors.join('\n  ')); }
  const notReady = res.bankStats.filter((s) => !s.ready);
  if (notReady.length) { fail++; console.log('NOT RENDERED: ' + notReady.map((s) => s.key).join(', ')); }
  const totalSec = res.bankStats.reduce((a, s) => a + (s.dur || 0) * (s.variants || 0), 0);
  const bytes = res.bankStats.reduce((a, s) => a + (s.dur || 0) * (s.variants || 0) * (s.sr || 0) * 4, 0);
  console.log(`bank: ${res.bankStats.length} keys, ${totalSec.toFixed(1)} s of audio, ~${(bytes / 1e6).toFixed(1)} MB float32`);
  return fail;
}

async function live(browser) {
  let fail = 0;
  // 1) never had a user gesture. NB: page.evaluate() counts as a user gesture in Playwright, so this
  //    phase runs by itself on page load (live.html?auto=1) and we only read the results afterwards.
  {
    const { page, errors } = await newPage(browser, { policy: true });
    const done = page.waitForEvent('console', { predicate: (m) => m.text().startsWith('AUTO_DONE '), timeout: 40000 });
    await page.goto(`${BASE}/live.html?auto=1`);
    const a = JSON.parse((await done).text().slice('AUTO_DONE '.length));
    const nErr = a.r1.errs.length + a.r2.errs.length + a.r3.errs.length;
    console.log(`live/no-gesture: state=${a.st}, output=${a.lvl.toFixed(1)} dB, errs=${nErr}, voicesOk=${a.r1.voicesOk}, idsOk=${a.r1.idsOk}, bankReady=${a.ready}`);
    console.log(`  Audio.init() ${a.initMs.toFixed(1)} ms sync; full pre-render ${a.readyMs.toFixed(0)} ms; long tasks (>50ms) during load: ${a.longTasks.length ? a.longTasks.join(',') + ' ms' : 'none'}`);
    console.log(`  voice() durations: ${Object.entries(a.r1.durs).map(([k, v]) => k + '=' + (+v).toFixed(2)).join(' ')}`);
    if (nErr || !a.r1.voicesOk || !a.r1.idsOk || a.st !== 'suspended' || a.lvl > -100) { fail++; console.log(a.r1.errs, a.r2.errs, a.r3.errs); }
    // 2) now a real user gesture: resume() inside the click handler must start sound
    await page.click('#go');
    await page.waitForTimeout(2600); // the duck(0.8, 2) issued while suspended releases first
    const st = await page.evaluate(() => window.AudioAPI.state());
    const lvlMusic = await page.evaluate(() => window.__level(1500));
    await page.evaluate(() => window.playScene());
    const lvlScene = await page.evaluate(() => window.__level(2500));
    const r4 = await page.evaluate(() => window.callAll());
    await page.waitForTimeout(1500);
    console.log(`live/after-gesture: state=${st}, menu music output=${lvlMusic.toFixed(1)} dB, scene output=${lvlScene.toFixed(1)} dB, errs=${r4.errs.length}, pageErrors=${errors.length}`);
    if (st !== 'running' || r4.errs.length || errors.length || lvlMusic < -50 || lvlScene < -40) { fail++; console.log(r4.errs, errors); }
  }
  // 3) Web Audio unavailable: everything must be a silent no-op
  {
    const { page, errors } = await newPage(browser, { noAudio: true });
    await page.goto(`${BASE}/live.html`);
    await page.waitForFunction(() => window.liveReady, null, { timeout: 20000 });
    const r = await page.evaluate(() => window.callAll());
    console.log(`live/no-webaudio: state=${r.state}, errs=${r.errs.length}, voicesOk=${r.voicesOk}, idsOk=${r.idsOk}, pageErrors=${errors.length}`);
    if (r.errs.length || errors.length || r.state !== 'unavailable' || !r.voicesOk || !r.idsOk) { fail++; console.log(r.errs, errors); }
  }
  return fail;
}

(async () => {
  const server = await start(PORT);
  const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  let code = 0;
  try {
    const [mode, ...rest] = process.argv.slice(2);
    if (mode === 'spec') {
      const [outFile, ...names] = rest;
      const { page } = await newPage(browser);
      await page.goto(`${BASE}/harness.html`);
      await page.waitForFunction(() => window.harnessReady);
      const opts = JSON.parse(process.env.SPEC_OPTS || '{}');
      const url = await page.evaluate(([n, o]) => window.runSpectro(n, o), [names, opts]);
      fs.writeFileSync(outFile, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', outFile);
    } else if (mode === 'mix') {
      const { page } = await newPage(browser);
      await page.goto(`${BASE}/harness.html`);
      await page.waitForFunction(() => window.harnessReady);
      for (const name of rest) {
        const r = await page.evaluate((n) => window.runMix(n), name);
        console.log(name.padEnd(10) + Object.entries(r).map(([k, v]) => `${k}:${v.rms}`).join('  '));
      }
    } else if (mode === 'wav') {
      const [outFile, name, sec] = rest;
      const { page } = await newPage(browser);
      await page.goto(`${BASE}/harness.html`);
      await page.waitForFunction(() => window.harnessReady);
      const b64 = await page.evaluate(([n, s]) => window.runWav(n, s), [name, +(sec || 8)]);
      fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
      console.log('wrote', outFile);
    } else {
      const f1 = await full(browser);
      const f2 = mode === 'offline' ? 0 : await live(browser);
      code = f1 + f2 ? 1 : 0;
      console.log(code ? `FAILED (${f1} offline issues, ${f2} live issues)` : 'ALL CHECKS PASSED');
    }
  } catch (e) {
    console.error(e);
    code = 2;
  }
  await browser.close();
  server.close();
  process.exit(code);
})();
