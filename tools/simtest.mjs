// Headless sim soak + determinism test: node tools/simtest.mjs
import { Sim } from '../src/sim/sim.js';
const chars = ['jim', 'brutus', 'bobby', 'mimi'];
function randInputs(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let cur = [0, 0], hold = [0, 0];
  return () => {
    for (let i = 0; i < 2; i++) {
      if (hold[i]-- <= 0) { cur[i] = Math.floor(r() * 128); if (r() < 0.3) cur[i] &= ~(64); hold[i] = 1 + Math.floor(r() * 12); }
    }
    return [cur[0], cur[1]];
  };
}
function run(c0, c1, stage, seed, frames) {
  const sim = new Sim({ p: [{ char: c0 }, { char: c1 }], stage, seed, rounds: 3 });
  const inp = randInputs(seed * 7 + 1);
  const counts = {};
  for (let f = 0; f < frames && !sim.s.done; f++) {
    sim.step(inp());
    for (const e of sim.consumeEvents()) counts[e.t] = (counts[e.t] || 0) + 1;
    for (const F of sim.s.fighters) {
      for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'shell', 'meter']) if (!Number.isFinite(F[k])) throw new Error(`NaN ${k} char=${F.char} st=${F.st} mv=${F.mv} frame=${sim.s.frame}`);
      if (F.x < -14 || F.x > 14 || F.y < -0.01 || F.y > 20) throw new Error(`out of bounds ${F.char} ${F.x},${F.y} st=${F.st} mv=${F.mv}`);
    }
  }
  return { hash: sim.hash(), frame: sim.s.frame, done: sim.s.done, wins: sim.s.wins, phase: sim.s.phase, counts };
}
let n = 0;
const t0 = Date.now();
for (const stage of ['rustpit', 'cantina']) {
  for (const a of chars) for (const b of chars) {
    const seed = 1000 + n++;
    const r1 = run(a, b, stage, seed, 20000);
    const r2 = run(a, b, stage, seed, 20000);
    if (r1.hash !== r2.hash) throw new Error('NON-DETERMINISTIC ' + a + ' vs ' + b);
    console.log(stage.padEnd(8), (a + ' vs ' + b).padEnd(16), 'frames', r1.frame, 'done', r1.done, 'wins', r1.wins.join('-'), 'phase', r1.phase, 'hits', r1.counts.hit || 0, 'blocks', r1.counts.block || 0, 'qte', r1.counts.qteStart || 0, 'ko', r1.counts.ko || 0, 'ult', r1.counts.ult || 0, 'molt', r1.counts.molt || 0, 'demon', r1.counts.demonStart || 0, 'perf', r1.counts.perfect || 0, 'sb', r1.counts.shellBreak || 0);
  }
}
console.log('OK in', Date.now() - t0, 'ms');
