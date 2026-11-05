// Standalone dev view for the 2D pixel stages.
//   devstage.html?stage=rustpit&x=0&y=5&zoom=1.2&t=3&dark=0&vent=1&events=1&ref=1
//   devstage.html?bar=1&cam=overview|jim|brutus|bobby|mimi|select|versus|doors|shop&door=0.5&secret=1
// Arrow keys pan, +/- zoom, D toggles darkness, E fires a burst of test events.
import { Display } from '../px/display.js';
import { STAGES } from '../sim/stages.js';
import { makeStage } from '../px/stages/index.js';
import { BarScene } from '../px/stages/bar.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? +q.get(k) : d);
const disp = new Display(document.getElementById('c'));
const isBar = q.get('bar') === '1';
const stageId = q.get('stage') || 'rustpit';
let cam = { x: num('x', 0), y: num('y', 5), zoom: num('zoom', 1.2) };
let t = num('t', 0);
let dark = num('dark', 0);

// fake sim state like Sim.resetRound
function fakeState(st) {
  const defs = {
    barrel: { w: 0.7, h: 0.95, hp: 0 }, crate: { w: 1, h: 1, hp: 3 }, mug: { w: 0.32, h: 0.38 }, bottle: { w: 0.22, h: 0.5 }, stool: { w: 0.6, h: 0.7 },
    chandelier: { w: 1.6, h: 0.8, hp: 3 }, pinata: { w: 0.8, h: 1, hp: 5 }, jukebox: { w: 1.3, h: 1.9, hp: 0 }, vent: { w: 1.2, h: 6 }, snail: { w: 0.35, h: 0.3 },
  };
  let nextId = 1;
  const s = { frame: 0, jukebox: num('juke', 0), plats: st.plats.map((p, i) => ({ ...p, id: i, broken: false, hp: p.hp || 0, ox: 0 })), props: [] };
  const add = (type, x, y, o = {}) => { const d = defs[type] || { w: 0.5, h: 0.5 }; const p = { id: nextId++, type, x, y, vx: o.vx || 0, vy: o.vy || 0, w: o.w ?? d.w, h: o.h ?? d.h, hp: o.hp ?? d.hp ?? 0, state: 'rest', t: 0, owner: -1, hitCd: 0, by: -1, active: 0, bounces: 0, ang: 0 }; s.props.push(p); return p; };
  for (const p of st.props) add(p.type, p.x, p.y, p);
  s.add = add;
  if (q.has('crateHp')) for (const p of s.props) if (p.type === 'crate') p.hp = +q.get('crateHp');
  if (q.has('broken')) { for (const p of s.props) if (p.type === 'crate' || p.type === 'pinata') p.state = 'broken'; for (const p of s.plats) if (p.kind === 'table') p.broken = true; }
  if (q.has('pinataHp')) for (const p of s.props) if (p.type === 'pinata') p.hp = +q.get('pinataHp');
  if (q.get('snails') === '1') { add('snail', -1, 0); add('snail', 1.2, 0); add('snail', 3.0, 0.95); }
  if (q.get('roll') === '1') for (const p of s.props) if (p.type === 'barrel') { p.vx = 0.06; }
  if (q.get('fly') === '1') { const m = add('mug', -1.5, 2.2); m.state = 'fly'; m.vx = 0.1; const b = add('bottle', 0, 2.6); b.state = 'fly'; b.vx = -0.1; const st2 = add('stool', 1.5, 2.0); st2.state = 'fly'; st2.vx = 0.1; }
  if (q.get('chand') === 'fall') for (const p of s.props) if (p.type === 'chandelier') { p.state = 'fall'; p.y = 2.5; }
  if (q.get('chand') === 'broken') for (const p of s.props) if (p.type === 'chandelier') { p.state = 'broken'; p.y = 0.3; }
  return s;
}
function tickPlats(s, st) {
  for (const p of s.plats) {
    if (!p.move) continue;
    const per = p.move.period, tt = s.frame % per, half = per / 2;
    const k = tt < half ? tt / half : 2 - tt / half, sm = k * k * (3 - 2 * k);
    const cx = p.move.a + (p.move.b - p.move.a) * sm, w = (st.plats[p.id].x1 - st.plats[p.id].x0) / 2;
    p.x0 = cx - w; p.x1 = cx + w;
  }
}

let stage, s = null, st = null;
const t0 = performance.now();
if (isBar) { stage = new BarScene(); }
else { st = STAGES[stageId]; stage = makeStage(stageId, st); s = fakeState(st); s.frame = Math.round(num('frame', t * 60)); }
const tBuild = performance.now() - t0;
console.warn(`[perf] construct ${isBar ? 'bar' : stageId}: ${tBuild.toFixed(1)} ms`);
if (isBar) {
  const c = stage.cams[q.get('cam') || 'overview'] || stage.cams.overview;
  cam = { x: num('x', c.x), y: num('y', c.y), zoom: num('zoom', c.zoom) };
  if (q.has('door')) { stage.setDoor(0, num('door', 0)); stage.setDoor(1, num('door', 0)); }
  if (q.has('secret')) stage.setSecretDoor(num('secret', 1));
  if (q.has('votes')) { stage.doorVotes?.(0, 2); stage.doorVotes?.(1, 1); }
}
stage.setDark?.(dark);

// warm-up: simulate t seconds of ambient animation
const warm = Math.round(num('warm', Math.min(240, t * 60)));
for (let i = 0; i < warm; i++) { if (s) { s.frame++; tickPlats(s, st); if (q.get('vent') === '1') for (const p of s.props) if (p.type === 'vent') p.active = 200; } stage.update(1 / 60, s); }

const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === 'd') { dark = dark > 0 ? 0 : 1; stage.setDark?.(dark); }
  if (e.key === 'e') fireTestEvents();
});
addEventListener('keyup', (e) => keys.delete(e.key));

function fireTestEvents() {
  if (!s) return;
  const ev = (o) => stage.onEvent?.(o);
  for (const p of s.props) {
    if (p.type === 'crate') ev({ t: 'propBreak', id: p.id, type: 'crate', x: p.x, y: p.y + 0.5 });
    if (p.type === 'pinata') ev({ t: 'propBreak', id: p.id, type: 'pinata', x: p.x, y: p.y });
    if (p.type === 'jukebox') ev({ t: 'jukebox', x: p.x, y: p.y + 1 });
    if (p.type === 'vent') { p.active = 240; ev({ t: 'ventBurst', id: p.id, x: p.x }); }
  }
  ev({ t: 'itemBreak', type: 'bottle', x: -1, y: 1 });
  ev({ t: 'itemBreak', type: 'mug', x: 1, y: 1 });
  ev({ t: 'hit', heavy: true, x: 0, y: 1, a: 0, d: 1 });
  ev({ t: 'bartenderSlide', id: 999 });
  ev({ t: 'ko', a: 0, d: 1, x: 3, y: 1 });
}
if (q.get('events') === '1') { fireTestEvents(); for (let i = 0; i < Math.round(num('evwarm', 30)); i++) stage.update(1 / 60, s); }

let frames = 0, cost = 0;
function frame() {
  const dt = 1 / 60;
  if (!q.has('freeze')) t += dt;
  if (keys.has('ArrowLeft')) cam.x -= 0.15 / cam.zoom; if (keys.has('ArrowRight')) cam.x += 0.15 / cam.zoom;
  if (keys.has('ArrowUp')) cam.y += 0.15 / cam.zoom; if (keys.has('ArrowDown')) cam.y -= 0.15 / cam.zoom;
  if (keys.has('+') || keys.has('=')) cam.zoom *= 1.02; if (keys.has('-')) cam.zoom /= 1.02;
  const c0 = performance.now();
  if (s && !q.has('freeze')) { s.frame++; tickPlats(s, st); if (q.get('vent') === '1') for (const p of s.props) if (p.type === 'vent') p.active = 200; }
  if (!q.has('freeze')) stage.update(dt, s);
  const g = disp.begin(cam, '#04121a');
  if (isBar) {
    stage.drawBack(disp, t);
    stage.drawMid(disp, t);
    if (q.get('ref') !== '0') {
      const sp = stage.spots;
      const ph = (x, y, col, h = 1.6) => { g.fillStyle = col; g.fillRect(disp.bx(x - 0.32), disp.by(y + h), Math.round(0.64 * 44), Math.round(h * 44)); };
      const camName = q.get('cam') || 'overview';
      if (camName === 'select') for (const k of ['jim', 'brutus', 'bobby', 'mimi']) ph(sp.select[k].x, sp.select[k].y, '#8a8a8a');
      else if (camName === 'versus') sp.versus.forEach((v) => ph(v.x, v.y, '#8a8a8a'));
      else { for (const k of ['jim', 'brutus', 'bobby', 'mimi']) ph(sp[k].x, sp[k].y, '#8a8a8a', sp[k].seat ? 1.2 : 1.6); ph(sp.molt.x, sp.molt.y, '#6a5a8a', 1.4); }
    }
    stage.drawFront(disp, t);
  } else {
    stage.drawBack(disp, t);
    stage.drawProps(disp, s, 1, t);
    if (q.get('ref') !== '0') {
      for (const x of [-3, 3]) { g.fillStyle = x < 0 ? '#8a8a8a' : '#7a7a7a'; g.fillRect(disp.bx(x - 0.35), disp.by(1.6), Math.round(0.7 * 44), Math.round(1.6 * 44)); g.fillStyle = '#5a5a5a'; g.fillRect(disp.bx(x - 0.35), disp.by(1.6), Math.round(0.7 * 44), 2); }
    }
    stage.drawFront(disp, t);
  }
  disp.present();
  cost += performance.now() - c0; frames++;
  if (frames === 60) console.warn(`[perf] avg frame ${(cost / frames).toFixed(2)} ms (buffer ${disp.vw}x${disp.vh})`);
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
