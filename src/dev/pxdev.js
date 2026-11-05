// Standalone dev view for the pixel fighters.
//   ?c=jim,brutus&pose=idle,jab&zoom=3          static test poses
//   ?c=jim&move=jab,heavy,uppercut&mf=7         real move animations at frame mf
import { Display } from '../px/display.js';
import { CharSprite } from '../px/fighter/sprite.js';
import { BASE_POSE, over } from '../px/fighter/skeleton.js';
import { computePose } from '../px/fighter/anim.js';
import { moveFor } from '../sim/data.js';

const q = new URLSearchParams(location.search);
const chars = (q.get('c') || 'jim').split(',');
const poses = (q.get('pose') || 'idle').split(',');
const moves = q.get('move') ? q.get('move').split(',') : null;
const states = q.get('st') ? q.get('st').split(',') : null;
const mf = +(q.get('mf') || 6);
const zoom = +(q.get('zoom') || 2.6);
const skins = (q.get('skin') || '').split(',');
const gloves = (q.get('gl') || '').split(',');
const camY = +(q.get('y') || 1.0);
const disp = new Display(document.getElementById('c'));
const POSES = {
  idle: {}, guard: { hF: [0.42, 1.0], hB: [0.28, 0.98], face: 'angry', lean: 0.12, hip: [0, 0.62] },
  hurt: { face: 'hurt', lean: -0.25, hF: [0.1, 1.2], hB: [-0.2, 1.1], hip: [-0.06, 0.62] },
};
const sprites = [];
const list = moves || states || poses;
chars.forEach((c, i) => list.forEach((p, j) => sprites.push({ c, s: new CharSprite(c === 'demon' ? 'demon' : c, { skin: skins[i] || 'default', gloves: gloves[i] || 'default' }), key: p, x: 0 })));
const n = sprites.length;
sprites.forEach((sp, k) => { sp.x = (k - (n - 1) / 2) * +(q.get('sp') || 2.4); });
let t = 0;
function poseFor(sp) {
  const char = sp.c === 'demon' ? 'bobby' : sp.c;
  const f = { char, st: 'idle', sf: 20, face: 1, cs: { demon: sp.c === 'demon', seqT: 0 }, inCur: 0, vx: 0, vy: 0, airJ: 1, hitstun: 20, stagger: 14, blockstun: 8 };
  if (moves) { f.st = 'attack'; f.mv = sp.key; f.mf = mf; return computePose(f, { t, move: moveFor(char, sp.c === 'demon', sp.key) }); }
  if (states) { f.st = sp.key; f.sf = mf; f.skill = q.get('skill') || 'eel'; return computePose(f, { t, cineT: mf }); }
  return over(BASE_POSE, POSES[sp.key] || {});
}
function frame() {
  t += 1 / 60;
  const g = disp.begin({ x: +(q.get('x') || 0), y: camY, zoom }, '#2a4a5a');
  g.fillStyle = '#3a2a22'; g.fillRect(0, disp.by(0), disp.vw, disp.vh);
  g.fillStyle = '#5a4030'; g.fillRect(0, disp.by(0), disp.vw, 2);
  for (const sp of sprites) {
    const cv = sp.s.render(poseFor(sp), { face: 1 });
    g.drawImage(cv, disp.bx(sp.x) - sp.s.ox, disp.by(0) - sp.s.oy);
  }
  disp.present();
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
