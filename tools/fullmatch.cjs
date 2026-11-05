// AI vs AI full match with screenshots at key moments: node tools/fullmatch.cjs outdir "query"
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2], q = process.argv[3];
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto('http://localhost:' + (process.env.PORT || 5173) + '/' + q);
  await p.waitForFunction(() => window.__booted, null, { timeout: 90000 });
  const shots = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 520000) {
    const st = await p.evaluate(() => { const sc = window.__game.screen; const s = sc?.sim?.s; return { scr: sc?.constructor?.name, phase: s?.phase, frame: s?.frame, round: s?.round, wins: s?.wins, hp: s?.fighters?.map((f) => f.hp), cine: sc?.cine?.kind, res: !!sc?.rewards, err: window.__lastError }; });
    const key = st.res ? 'results' : st.phase === 'pick' && st.round > 1 ? 'pick' : st.phase === 'ucine' ? 'ucine' : st.cine ? 'cine_' + st.cine : st.phase;
    if (key && !shots.has(key) && ['pick', 'ucine', 'qte', 'ko', 'cine_demon', 'cine_finisher', 'results', 'roundEnd', 'matchEnd', 'cine_qte'].includes(key)) {
      shots.add(key);
      await p.waitForTimeout(key === 'results' ? 2500 : 300);
      await p.screenshot({ path: `${out}/fm_${key}.png` });
      console.log('shot', key, JSON.stringify(st));
    }
    if (st.res && shots.has('results')) break;
    await p.waitForTimeout(400);
  }
  console.log('errors:', errs.slice(0, 10).join('\n'));
  await b.close();
})();
