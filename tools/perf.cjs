const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || '';
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(process.argv[3]||640), height: +(process.argv[4]||360) } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  const t0 = Date.now();
  await p.goto('http://localhost:5173/' + q);
  await p.waitForFunction(() => window.__booted || window.__bootError, null, { timeout: 90000 });
  console.log('boot ms', Date.now() - t0);
  for (let i = 0; i < 4; i++) {
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => { const g = window.__game; const r = g.renderer.gl.info; return { fps: Math.round(g.fps), calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, prog: r.programs?.length, phase: g.screen?.sim?.s?.phase, frame: g.screen?.sim?.s?.frame, err: window.__lastError }; });
    console.log(JSON.stringify(info));
  }
  if (process.argv[5]) await p.screenshot({ path: process.argv[5] });
  console.log(logs.slice(0, 20).join('\n'));
  await b.close();
})();
