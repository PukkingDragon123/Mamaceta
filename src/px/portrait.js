// Pixel portraits rendered from the live character renderer (same art as in-game): a head &
// shoulders crop at 2x density for HUD portholes, select cards, results and cut-ins.
import { CharSprite } from './fighter/sprite.js';
import { BASE_POSE, over } from './fighter/skeleton.js';
import { stancePose, STANCE } from './fighter/anim.js';

const cache = new Map();
export function portrait(char, cos = {}, o = {}) {
  const size = o.size || 36, scale = o.scale || 2;
  const key = [char, JSON.stringify(cos), size, scale, o.demon ? 1 : 0, o.face || ''].join('|');
  if (cache.has(key)) return cache.get(key);
  const id = o.demon ? 'demon' : char;
  const spr = new CharSprite(id, cos, { scale });
  const st = STANCE[id] || STANCE.jim;
  let pose = stancePose(st, 0.3, 0);
  pose = over(pose, { face: o.face || (id === 'demon' ? 'fangs' : id === 'mimi' ? 'cute' : 'grin'), hF: [0.3 * st.s, 0.7 * st.s], hB: [0.1 * st.s, 0.7 * st.s], head: -0.1, look: [1, 0] });
  // warm up chains so headbands/twin tails settle
  for (let i = 0; i < 40; i++) spr.render(pose, { face: 1, dt: 1 / 60 });
  const src = spr.render(pose, { face: 1, dt: 1 / 60 });
  const h = spr.headLocal();
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  const cx = spr.ox + h[0], cy = spr.oy - h[1];
  const ox = o.offsetX ?? 0, oy = o.offsetY ?? (size * 0.08);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, Math.round(cx - size / 2 + ox), Math.round(cy - size / 2 + oy), size, size, 0, 0, size, size);
  cache.set(key, c);
  return c;
}
// full-body render (for menus/cards): returns { canvas, ox, oy }
export function fullBody(char, cos = {}, o = {}) {
  const scale = o.scale || 1;
  const spr = new CharSprite(o.demon ? 'demon' : char, cos, { scale });
  const st = STANCE[o.demon ? 'demon' : char] || STANCE.jim;
  const pose = over(stancePose(st, 0.3, 0), o.pose || {});
  for (let i = 0; i < 30; i++) spr.render(pose, { face: 1 });
  return { canvas: spr.render(pose, { face: 1 }), ox: spr.ox, oy: spr.oy, spr };
}
