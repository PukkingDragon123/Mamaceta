// Local menu flow smoke test (menu -> select -> versus -> map vote) with freeze detection.
// Usage: PORT=5174 node tools/flowtest.cjs outdir
const { chromium } = require('playwright');
(async () => {
  const S = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200)); });
  await p.goto('http://localhost:' + (process.env.PORT || 5174) + '/?skiptitle=1');
  await p.waitForFunction(() => window.__booted, null, { timeout: 60000 });
  const st = async () => { try { return await Promise.race([p.evaluate(() => [__game.screen.constructor.name, __game.screen.phase, Math.round(__game.fps)]), new Promise((r) => setTimeout(() => r('TIMEOUT (frozen?)'), 4000))]); } catch (e) { return 'ERR ' + e.message; } };
  await p.waitForTimeout(1500);
  console.log('menu', await st());
  await p.keyboard.press('Enter'); await p.waitForTimeout(2000);
  console.log('select', await st());
  await p.screenshot({ path: S + '/ft_select.png' });
  await p.keyboard.press('KeyF'); await p.waitForTimeout(500);
  await p.keyboard.press('KeyK'); await p.waitForTimeout(500);
  console.log('locked', await st());
  await p.keyboard.press('KeyF'); await p.waitForTimeout(400); await p.keyboard.press('KeyF'); await p.waitForTimeout(400);
  await p.keyboard.press('KeyK'); await p.waitForTimeout(400); await p.keyboard.press('KeyK'); await p.waitForTimeout(800);
  console.log('ready', await st());
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + '/ft_versus.png' });
  console.log('versus', await st());
  await p.waitForTimeout(6000);
  console.log('vote', await st());
  await p.screenshot({ path: S + '/ft_vote.png' });
  await b.close();
})();
