// Renders every fighter x skin x glove combination in several poses and reports failures.
// Usage: PORT=5173 node tools/skintest.cjs   (needs the dev server: imports source modules)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${process.env.PORT || 5173}/devpx.html?c=jim`);
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const { CharSprite } = await import('/src/px/fighter/sprite.js');
    const { computePose } = await import('/src/px/fighter/anim.js');
    const { SKINS, GLOVES } = await import('/src/data/cosmetics.js');
    const { moveFor } = await import('/src/sim/data.js');
    let ok = 0; const fails = [];
    const states = [['idle'], ['walk'], ['attack', 'jab'], ['attack', 'heavy'], ['attack', 'ult'], ['hitstun'], ['knockdown'], ['victory'], ['skill']];
    for (const c of ['jim', 'brutus', 'bobby', 'mimi', 'demon']) {
      const base = c === 'demon' ? 'bobby' : c;
      for (const sk of SKINS[base]) for (const gl of GLOVES) {
        try {
          const s = new CharSprite(c, { skin: sk.key, gloves: gl.key });
          for (const [st, mv] of states) {
            const f = { char: base, st, sf: 8, mf: 8, mv, face: 1, cs: { demon: c === 'demon' }, skill: 'eel', vx: 0.05, hitstun: 20 };
            const cv = s.render(computePose(f, { t: 1, move: mv ? moveFor(base, c === 'demon', mv) : null }), { face: 1 });
            if (!cv || !cv.width) throw new Error('no canvas');
          }
          ok++;
        } catch (e) { fails.push(`${c}/${sk.key}/${gl.key}: ${e.message}`); }
      }
    }
    return { ok, fails: fails.slice(0, 20), nf: fails.length };
  });
  console.log('rendered', r.ok, 'combos, failures', r.nf);
  for (const f of r.fails) console.log('  ', f);
  await b.close();
  process.exit(r.nf ? 1 : 0);
})();
