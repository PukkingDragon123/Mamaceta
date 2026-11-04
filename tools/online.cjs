// Two-browser online test against a local PeerJS server. node tools/online.cjs
const { chromium } = require('playwright');
const PORT = process.env.PORT || '5173';
const SP = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log(name, 'PAGEERROR', e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log(name, 'console.error', m.text().slice(0, 200)); });
    await p.goto(`http://localhost:${PORT}/?q=low&skiptitle=1&peer=127.0.0.1:9000/mm`);
    await p.waitForFunction(() => window.__booted, null, { timeout: 90000 });
    return p;
  };
  const A = await mk('HOST'), B = await mk('GUEST');
  const scr = (p) => p.evaluate(() => [__game.screen?.constructor?.name, __game.screen?.state || __game.screen?.phase, window.__lastError]);
  const press = async (p, k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(700); } };
  await A.waitForTimeout(1500); await B.waitForTimeout(500);
  // main menu: ONLINE is index 2
  await A.evaluate(() => { __game.screen.sel = 2; }); await press(A, 'Enter');
  await B.evaluate(() => { __game.screen.sel = 2; }); await press(B, 'Enter');
  await A.waitForTimeout(4000);
  console.log('A', await scr(A), 'B', await scr(B));
  // host
  await press(A, 'Enter');
  await A.waitForFunction(() => __game.screen?.state === 'waiting' || __game.screen?.state === 'error', null, { timeout: 30000 });
  const code = await A.evaluate(() => __game.screen.net?.code);
  console.log('host state', await scr(A), 'code', code);
  // guest: JOIN WITH CODE is index 1
  await B.evaluate(() => { __game.screen.sel = 1; }); await press(B, 'Enter');
  await B.waitForFunction(() => __game.screen?.state === 'typing', null, { timeout: 30000 });
  for (const ch of code) { await B.keyboard.press(ch); await B.waitForTimeout(100); }
  await B.keyboard.press('Enter');
  await B.waitForFunction(() => __game.screen?.state === 'lobby' || __game.screen?.state === 'error', null, { timeout: 40000 }).catch(() => {});
  await A.waitForFunction(() => __game.screen?.state === 'lobby', null, { timeout: 20000 }).catch(() => {});
  console.log('lobby A', await scr(A), 'B', await scr(B), 'rtt', await A.evaluate(() => __game.screen.net?.rtt));
  // both ready
  await press(A, 'Enter'); await press(B, 'Enter');
  await A.waitForTimeout(6000);
  console.log('after ready A', await scr(A), 'B', await scr(B));
  // char select: lock + ready
  await press(A, 'Enter'); await press(B, 'ArrowRight'); await press(B, 'Enter');
  await A.waitForTimeout(1500);
  await press(A, 'Enter'); await press(B, 'Enter');
  const waitPhase = async (ph, ms) => { await Promise.all([A, B].map((p) => p.waitForFunction((x) => __game.screen?.phase === x, ph, { timeout: ms }).catch(() => {}))); };
  await waitPhase('vote', 120000);
  console.log('vote A', await scr(A), 'B', await scr(B));
  await press(A, 'Enter'); await press(B, 'ArrowRight'); await press(B, 'Enter');
  await Promise.all([A, B].map((p) => p.waitForFunction(() => !!__game.screen?.sim, null, { timeout: 150000 }).catch(() => {})));
  console.log('match A', await scr(A), 'B', await scr(B));
  await Promise.all([A, B].map((p) => p.waitForFunction(() => __game.screen?.sim?.s?.frame > 30, null, { timeout: 120000 }).catch(() => {})));
  await A.screenshot({ path: SP + '/online_A.png' }); await B.screenshot({ path: SP + '/online_B.png' });
  // fight for a bit with random inputs
  for (let i = 0; i < 20; i++) {
    const keys = ['KeyF', 'KeyG', 'KeyD', 'KeyA', 'KeyW'];
    await A.keyboard.press(keys[i % 5]); await B.keyboard.press(keys[(i + 2) % 5]);
    await A.waitForTimeout(400);
  }
  const st = (p) => p.evaluate(() => { const s = __game.screen?.sim?.s; const n = __game.screen?.cfg?.net; return s ? { frame: s.frame, phase: s.phase, hp: s.fighters.map((f) => f.hp), netFrame: n?.frame, delay: n?.delay, rtt: Math.round(n?.rtt || 0), desync: n?.desync, hash: __game.screen.sim.hash() } : null; });
  // let both catch up to the same frame and compare at a common frame
  await A.waitForTimeout(3000);
  const sa = await st(A), sb = await st(B);
  const common = await A.evaluate(() => [...__game.screen.cfg.net.hashes.entries()]);
  const commonB = await B.evaluate(() => [...__game.screen.cfg.net.hashes.entries()]);
  const mb = new Map(commonB); let same = 0, diff = 0;
  for (const [f, h] of common) { if (mb.has(f)) { if (mb.get(f) === h) same++; else diff++; } }
  console.log('hash checkpoints: same', same, 'diff', diff);
  console.log('A', JSON.stringify(sa)); console.log('B', JSON.stringify(sb));
  await b.close();
})();
