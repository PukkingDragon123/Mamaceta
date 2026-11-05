// Standalone dev view for the pixel fighters: ?c=jim,brutus&pose=idle,jab&zoom=3
import { Display } from '../px/display.js';
import { CharSprite } from '../px/fighter/sprite.js';
import { BASE_POSE, over } from '../px/fighter/skeleton.js';

const q = new URLSearchParams(location.search);
const chars = (q.get('c') || 'jim').split(',');
const poses = (q.get('pose') || 'idle').split(',');
const zoom = +(q.get('zoom') || 2.6);
const skins = (q.get('skin') || '').split(',');
const camY = +(q.get('y') || 1.0);
const disp = new Display(document.getElementById('c'));
const POSES = {
  idle: {},
  guard: { hF: [0.42, 1.0], hB: [0.28, 0.98], face: 'angry', lean: 0.12, hip: [0, 0.62] },
  jab: { hF: [0.9, 1.06], hB: [0.2, 0.98], lean: 0.25, face: 'shout', fF: [0.35, 0], fB: [-0.3, 0] },
  kick: { fF: [0.75, 0.6], hip: [-0.05, 0.68], lean: -0.15, hF: [0.3, 1.05], hB: [-0.1, 0.95], face: 'angry' },
  hurt: { face: 'hurt', lean: -0.25, hF: [0.1, 1.2], hB: [-0.2, 1.1], hip: [-0.06, 0.62] },
  ko: { face: 'ko', rot: 1.3, hip: [0, 0.3] },
  cute: { face: 'cute', hF: [0.25, 0.85], hB: [0.15, 0.85] },
  grin: { face: 'grin', hF: [0.3, 1.35], hB: [0.1, 0.9] },
};
const sprites = [];
chars.forEach((c, i) => poses.forEach((p, j) => sprites.push({ s: new CharSprite(c, { skin: skins[i] || 'default' }), pose: over(BASE_POSE, POSES[p] || {}), x: 0, i, j })));
const n = sprites.length;
sprites.forEach((sp, k) => { sp.x = (k - (n - 1) / 2) * +(q.get('sp') || 2.4); });
let t = 0;
function frame() {
  t += 1 / 60;
  const g = disp.begin({ x: +(q.get('x') || 0), y: camY, zoom }, '#2a4a5a');
  g.fillStyle = '#3a2a22'; g.fillRect(0, disp.by(0), disp.vw, disp.vh);
  g.fillStyle = '#5a4030'; g.fillRect(0, disp.by(0), disp.vw, 2);
  for (const sp of sprites) {
    const breathe = Math.sin(t * 4 + sp.x) * 0.012;
    const pose = { ...sp.pose, hip: [sp.pose.hip[0], sp.pose.hip[1] - breathe] };
    const cv = sp.s.render(pose, { face: 1 });
    g.drawImage(cv, disp.bx(sp.x) - sp.s.ox, disp.by(0) - sp.s.oy);
  }
  disp.present();
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
