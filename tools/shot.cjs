// Usage: node tools/shot.cjs "<url query>" out.png [waitMs] [w] [h] [keys...]
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || '';
  const out = process.argv[3] || 'shot.png';
  const wait = +(process.argv[4] || 3000);
  const w = +(process.argv[5] || 1280), h = +(process.argv[6] || 720);
  const keys = process.argv.slice(7);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:5173/' + q);
  try { await p.waitForFunction(() => window.__booted || window.__bootError, null, { timeout: 60000 }); } catch (e) { logs.push('boot timeout'); }
  const be = await p.evaluate(() => window.__bootError || null);
  if (be) logs.push('BOOTERROR: ' + be);
  for (const k of keys) {
    if (k.startsWith('wait:')) { await p.waitForTimeout(+k.slice(5)); continue; }
    if (k.startsWith('eval:')) { const r = await p.evaluate(k.slice(5)); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); continue; }
    if (k.startsWith('hold:')) { const [code, ms] = k.slice(5).split(','); await p.keyboard.down(code); await p.waitForTimeout(+ms); await p.keyboard.up(code); continue; }
    await p.keyboard.press(k); await p.waitForTimeout(120);
  }
  await p.waitForTimeout(wait);
  await p.screenshot({ path: out });
  const err = await p.evaluate(() => window.__lastError || null);
  if (err) logs.push('LASTERROR: ' + err);
  const fps = await p.evaluate(() => window.__game ? Math.round(window.__game.fps) : -1);
  console.log('fps', fps);
  console.log(logs.slice(0, 30).join('\n'));
  await b.close();
})();
