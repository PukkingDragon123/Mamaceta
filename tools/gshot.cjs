// Usage: node tools/gshot.cjs "<query>" out.png [waitMs] [w] [h] [steps...]
// steps: key names, wait:ms, eval:js, shot:path, down:Key, up:Key
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || '';
  const out = process.argv[3] || 'shot.png';
  const wait = +(process.argv[4] || 3000);
  const w = +(process.argv[5] || 1280), h = +(process.argv[6] || 720);
  const steps = process.argv.slice(7);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.goto('http://127.0.0.1:5173/' + q);
  try { await p.waitForFunction(() => window.__booted || window.__bootError, null, { timeout: 60000 }); } catch (e) { logs.push('boot timeout'); }
  const be = await p.evaluate(() => window.__bootError || null);
  if (be) logs.push('BOOTERROR: ' + be);
  for (const k of steps) {
    if (k.startsWith('wait:')) { await p.waitForTimeout(+k.slice(5)); continue; }
    if (k.startsWith('eval:')) { const r = await p.evaluate(k.slice(5)); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); continue; }
    if (k.startsWith('shot:')) { await p.screenshot({ path: k.slice(5) }); continue; }
    if (k.startsWith('down:')) { await p.keyboard.down(k.slice(5)); continue; }
    if (k.startsWith('up:')) { await p.keyboard.up(k.slice(3)); continue; }
    await p.keyboard.press(k); await p.waitForTimeout(80);
  }
  await p.waitForTimeout(wait);
  await p.screenshot({ path: out });
  const err = await p.evaluate(() => window.__lastError || null);
  if (err) logs.push('LASTERROR: ' + err);
  const fps = await p.evaluate(() => (window.__game ? Math.round(window.__game.fps) : -1));
  console.log('fps', fps);
  console.log(logs.slice(0, 25).join('\n'));
  await b.close();
})();
