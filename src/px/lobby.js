// The lobby world shared by every menu screen: the underwater dive bar, the four fighters hanging
// out in it, Madam Molt's hidden shop, a cinematic camera (eased moves between named shots +
// slow push-ins) and a pixel FX layer.
import { BarScene } from './stages/bar.js';
import { MenuFighter2D } from './menuFighter.js';
import { Camera2D } from './camera.js';
import { FX } from './fx.js';
import { ease } from '../core/math.js';

const CHARS = ['jim', 'brutus', 'bobby', 'mimi'];
const ACT = { jim: 'bag', brutus: 'eat', bobby: 'arcade', mimi: 'puru' };
const DEFAULT_SPOTS = {
  jim: { x: -14, y: 0, face: 1 }, brutus: { x: -5, y: 0, face: -1 }, bobby: { x: 4, y: 0, face: 1 }, mimi: { x: 12, y: 0, face: -1 },
  select: { jim: { x: -3.3, y: 0, face: 1 }, brutus: { x: -1.1, y: 0, face: 1 }, bobby: { x: 1.1, y: 0, face: -1 }, mimi: { x: 3.3, y: 0, face: -1 } },
  versus: [{ x: -1.3, y: 0, face: 1 }, { x: 1.3, y: 0, face: -1 }],
};

export class Lobby {
  constructor() {
    this.bar = new BarScene();
    const S = this.bar.spots || {};
    this.spots = { ...DEFAULT_SPOTS, ...S, select: { ...DEFAULT_SPOTS.select, ...(S.select || {}) }, versus: S.versus || DEFAULT_SPOTS.versus };
    this.cams = this.bar.cams || {};
    this.cam = new Camera2D(this.bar.bounds || { left: -20, right: 20, bottom: -1.6, top: 12 });
    this.cam.minZoom = 0.6; this.cam.maxZoom = 6;
    this.fx = new FX();
    this.F = {};
    this.t = 0;
    this.extra = [];
    const o = this.cams.overview || { x: 0, y: 4, zoom: 1 };
    this.cam.snap(o.x, o.y, o.zoom);
    this.here = { ...o };
  }
  camOf(name) {
    if (typeof name === 'object') return name;
    const c = this.cams[name];
    if (c) return c;
    const sp = this.spots[name];
    if (sp && sp.x !== undefined) return { x: sp.x, y: (sp.y || 0) + 1.6, zoom: 2.6 };
    return this.cams.overview || { x: 0, y: 4, zoom: 1 };
  }
  // eased cinematic move to a shot; drift = slow push-in after arriving
  setCam(name, dur = 1.4, o = {}) {
    const to = this.camOf(name);
    const from = { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom };
    this.cam.setShot({ target: { x: 0, y: 0 }, dx: from.x, dx2: to.x + (o.dx || 0), dy: from.y, dy2: to.y + (o.dy || 0), zoom: from.zoom, zoom2: (to.zoom || 1) * (o.zk || 1), dur, ease: o.ease || ease.inOutCubic, speed: 40 });
    this.drift = o.drift ?? 0.04;
    this.arrive = dur;
    this.here = to;
  }
  snapCam(name) {
    const c = name ? this.camOf(name) : this.here;
    this.cam.setShot(null); this.cam.snap(c.x, c.y, c.zoom || 1);
    this.cam.setShot({ target: { x: 0, y: 0 }, dx: c.x, dy: c.y, zoom: c.zoom || 1, speed: 40 });
  }
  // fighters with the given cosmetics map { char: cos }
  fighters(cosMap) {
    for (const c of CHARS) {
      const cos = cosMap[c] || {};
      const key = JSON.stringify(cos);
      if (!this.F[c] || this.F[c].cosKey !== key) {
        const old = this.F[c];
        const f = new MenuFighter2D(c, cos);
        f.cosKey = key;
        f.setActivity(ACT[c]);
        if (old) { f.x = old.x; f.y = old.y; f.face = old.face; f.activity = old.activity; f.visible = old.visible; } else f.setSpot(this.spots[c]);
        this.F[c] = f;
      }
    }
    return this.F;
  }
  homeAll() {
    for (const c of CHARS) { const f = this.F[c]; if (!f) continue; f.setSpot(this.spots[c]); f.setActivity(ACT[c]); f.visible = true; f.react = null; }
  }
  selectAll() {
    for (const c of CHARS) { const f = this.F[c]; if (!f) continue; f.setSpot(this.spots.select[c]); f.setActivity('guard'); f.visible = true; }
  }
  update(dt) {
    this.t += dt;
    this.bar.update?.(dt);
    for (const c of CHARS) {
      const f = this.F[c];
      if (!f || !f.visible) continue;
      f.update(dt);
      if (f.bagHit) { this.bar.punchBag?.(f.bagHit); this.onPunch?.(f, f.bagHit); f.bagHit = 0; }
    }
    for (const e of this.extra) e.update?.(dt);
    this.fx.update(dt);
    // slow push-in drift once a move has arrived
    const s = this.cam.shot;
    if (s && s.dur && s.t > s.dur && this.drift) { s.zoom2 = (s.zoom2 || s.zoom) * (1 + this.drift * dt * 0.25); s.zoom = s.zoom2; }
    this.camOut = this.cam.update(dt);
  }
  render(d, o = {}) {
    const g = d.begin(this.camOut || this.cam.out, '#071820');
    const t = this.t;
    this.bar.drawBack?.(d, t);
    this.bar.drawMid?.(d, t);
    const list = CHARS.map((c) => this.F[c]).filter((f) => f && f.visible).sort((a, b) => (b.y || 0) - (a.y || 0));
    for (const f of list) f.draw(d);
    for (const e of this.extra) e.draw?.(d);
    this.fx.draw(d);
    this.bar.drawFront?.(d, t);
    if (o.dim) d.overlay('#04121a', o.dim);
    this.fx.drawScreen(d);
    d.present();
  }
}

let shared = null;
export function getLobby() { if (!shared) shared = new Lobby(); return shared; }
export const LOBBY_CHARS = CHARS;
