// Builds every fighter rig for every skin x glove combination (and Bobby's demon form) headlessly.
import { Rig } from '../src/render/rig.js';
import { buildSpec } from '../src/render/rigs/characters.js';
import { SKINS, GLOVES } from '../src/data/cosmetics.js';
let n = 0, fails = 0;
const t0 = Date.now();
for (const c of Object.keys(SKINS)) {
  for (const s of SKINS[c]) {
    for (const g of GLOVES) {
      try {
        const rig = new Rig(buildSpec(c, { skin: s.key, gloves: g.key }));
        rig.applyPose(rig.pose); rig.update(1 / 60, {});
        let tris = 0; rig.root.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
        if (g.key === 'default') console.log(c.padEnd(7), s.key.padEnd(10), 'tris', tris);
        n++;
      } catch (e) { fails++; console.log('FAIL', c, s.key, g.key, e.message); }
    }
    if (c === 'bobby') { try { new Rig(buildSpec(c, { skin: s.key }, { demon: true })); n++; } catch (e) { fails++; console.log('FAIL demon', s.key, e.message); } }
  }
}
console.log(`built ${n} rigs, ${fails} failures in ${Date.now() - t0}ms`);
