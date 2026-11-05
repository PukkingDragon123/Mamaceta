// 2D camera director: dynamic fight framing (pan + zoom to fit both fighters), trauma shake,
// zoom punches, kicks and scripted cinematic shots (focus / pan / push-in / hard cuts).
import { clamp, valueNoise1, ease, lerp } from '../core/math.js';
import { VIEW_H } from './display.js';

export class Camera2D {
  constructor(bounds = { left: -12, right: 12, bottom: -1.2, top: 14 }) {
    this.bounds = bounds;
    this.x = 0; this.y = 4; this.zoom = 1.2;
    this.trauma = 0; this.kx = 0; this.ky = 0; this.zp = 0;
    this.shot = null; this.t = 0; this.shakeScale = 1;
    this.aspect = 16 / 9;
    this.out = { x: 0, y: 4, zoom: 1.2 };
    this.minZoom = 1.0; this.maxZoom = 2.2;
  }
  addTrauma(a) { this.trauma = clamp(this.trauma + a, 0, 1); }
  kick(dx, dy, a = 0.3) { this.kx += dx * a; this.ky += dy * a; }
  zoomPunch(a) { this.zp = Math.max(this.zp, a); }
  // shot: { target: {x,y}|fn, zoom, zoom2, dur, dx, dy, dx2, dy2, snap, speed, ease, autoEnd, clamp }
  setShot(shot) {
    this.shot = shot ? { t: 0, ...shot } : null;
    if (shot && shot.cut) this.cutTo(shot);
  }
  cutTo(shot) {
    const t = typeof shot.target === 'function' ? shot.target() : shot.target;
    this.x = t.x + (shot.dx || 0); this.y = t.y + (shot.dy || 0); this.zoom = shot.zoom ?? this.zoom;
  }
  snap(x, y, zoom) { this.x = x; this.y = y; if (zoom) this.zoom = zoom; }

  framing(a, b) {
    const B = this.bounds;
    const sep = Math.abs(a.x - b.x);
    const top = Math.max(a.y, b.y), bot = Math.min(a.y, b.y);
    const needW = sep + 6.6, needH = (top - Math.min(0, bot)) + 4.6;
    let zoom = Math.min(VIEW_H / needH, (VIEW_H * this.aspect) / needW);
    zoom = clamp(zoom, this.minZoom, this.maxZoom);
    const vh = VIEW_H / zoom, vw = vh * this.aspect;
    let x = (a.x + b.x) / 2;
    let y = Math.max(vh / 2 - 1.25, (top + bot) / 2 + 1.2);
    // keep inside the painted stage
    const xl = B.left + vw / 2, xr = B.right - vw / 2;
    x = xl > xr ? (B.left + B.right) / 2 : clamp(x, xl, xr);
    y = clamp(y, B.bottom + vh / 2, Math.max(B.bottom + vh / 2, B.top - vh / 2));
    return { x, y, zoom };
  }

  update(dt, ctx = null) {
    this.t += dt;
    let tx, ty, tz, speed;
    const s = this.shot;
    if (s) {
      s.t += dt;
      const tg = typeof s.target === 'function' ? s.target() : s.target;
      const k = s.dur ? clamp(s.t / s.dur, 0, 1) : 1;
      const e = (s.ease || ease.inOutSine)(k);
      tx = tg.x + lerp(s.dx || 0, s.dx2 ?? (s.dx || 0), e);
      ty = tg.y + lerp(s.dy || 0, s.dy2 ?? (s.dy || 0), e);
      tz = lerp(s.zoom ?? 2, s.zoom2 ?? (s.zoom ?? 2), e);
      speed = s.snap ? 80 : (s.speed ?? 7);
      if (s.clamp) { const vh = VIEW_H / tz, vw = vh * this.aspect, B = this.bounds; tx = clamp(tx, B.left + vw / 2, Math.max(B.left + vw / 2, B.right - vw / 2)); ty = Math.max(ty, B.bottom + vh / 2); }
      if (s.dur && s.t >= s.dur && s.autoEnd) this.shot = null;
    } else if (ctx) {
      const f = this.framing(ctx.a, ctx.b);
      tx = f.x; ty = f.y; tz = f.zoom; speed = 4.5;
    } else { tx = this.x; ty = this.y; tz = this.zoom; speed = 5; }
    const k = 1 - Math.exp(-speed * dt);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    this.zoom += (tz - this.zoom) * (1 - Math.exp(-speed * 0.8 * dt));
    this.zp = Math.max(0, this.zp - dt * 3);
    const decay = Math.exp(-dt * 11);
    this.kx *= decay; this.ky *= decay;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma * this.shakeScale;
    const tt = this.t * 30;
    const ox = (valueNoise1(tt, 1) - 0.5) * 0.75 * sh, oy = (valueNoise1(tt, 2) - 0.5) * 0.6 * sh;
    const z = this.zoom * (1 + this.zp * 0.1);
    this.out.x = this.x + ox + this.kx; this.out.y = this.y + oy + this.ky; this.out.zoom = z;
    return this.out;
  }
}
