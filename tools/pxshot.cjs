// Usage: node tools/pxshot.cjs "<page?query>" out.png [waitMs] [w] [h]
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || 'devpx.html';
  const out = process.argv[3] || 'shot.png';
  const wait = +(process.argv[4] || 1500);
  const w = +(process.argv[5] || 1280), h = +(process.argv[6] || 720);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
  await p.goto('http://127.0.0.1:5173/' + q);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: out });
  console.log(logs.slice(0, 20).join('\n'));
  await b.close();
})();
