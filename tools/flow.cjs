// Scripted UI walkthrough: node tools/flow.cjs "<query>" outPrefix  step...  (step = key | wait:ms | shot:name | eval:js)
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || '';
  const prefix = process.argv[3] || 'flow';
  const steps = process.argv.slice(4);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:' + (process.env.PORT || '5173') + '/' + q);
  await p.waitForFunction(() => window.__booted || window.__bootError, null, { timeout: 90000 });
  for (const s of steps) {
    if (s.startsWith('wait:')) await p.waitForTimeout(+s.slice(5));
    else if (s.startsWith('shot:')) { await p.screenshot({ path: prefix + '_' + s.slice(5) + '.png' }); console.log('shot', s.slice(5), await p.evaluate(() => (window.__game?.screen?.constructor?.name) + ' err=' + (window.__lastError ? window.__lastError.slice(0, 200) : ''))); }
    else if (s.startsWith('eval:')) console.log('eval', JSON.stringify(await p.evaluate(s.slice(5))));
    else if (s.startsWith('down:')) await p.keyboard.down(s.slice(5));
    else if (s.startsWith('up:')) await p.keyboard.up(s.slice(3));
    else { await p.keyboard.press(s); await p.waitForTimeout(150); }
  }
  console.log(logs.slice(0, 15).join('\n'));
  await b.close();
})();
