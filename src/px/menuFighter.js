// A fighter living in the bar lobby: idle activities with personality (Jim drills on the punching
// bag, Brutus snacks on snails at the counter, Bobby plays the arcade / balances his cone, Mimi
// plays with Puru), reactions (wave, locked-in hype, pick), blinking and speech anchors.
import { CharSprite } from './fighter/sprite.js';
import { stancePose, STANCE, computePose } from './fighter/anim.js';
import { over, mixPose } from './fighter/skeleton.js';
import { Puru } from './puru.js';
import { PPU } from './display.js';
import { bitmap } from './fx.js';

const sin = Math.sin, abs = Math.abs;

export class MenuFighter2D {
  constructor(char, cos = {}) {
    this.char = char; this.cos = cos;
    this.sprite = new CharSprite(char, cos);
    this.puru = char === 'mimi' ? new Puru(cos.skin) : null;
    this.x = 0; this.y = 0; this.face = 1;
    this.t = Math.random() * 10;
    this.activity = 'idle';
    this.react = null; this.reactT = 0;
    this.visible = true;
    this.canvas = null;
    this.punch = 0; this.bagHit = 0;
    this.blinkT = 2; this.blink = 0;
    this.prev = null;
  }
  setCos(cos) { this.cos = cos; this.sprite.setCos(cos); if (this.puru) this.puru = new Puru(cos.skin); }
  setSpot(s) { if (!s) return; this.x = s.x; this.y = s.y || 0; this.face = s.face ?? 1; this.seat = !!s.seat; if (s.activity) this.activity = s.activity; this.reset = true; }
  setActivity(a) { this.activity = a; }
  doReact(kind) { this.react = kind; this.reactT = 0; }
  headPos() { const h = this.sprite.J ? this.sprite.J.head : [0, 60]; return { x: this.x + (this.face < 0 ? -h[0] : h[0]) / PPU, y: this.y + h[1] / PPU }; }

  pose() {
    const st = STANCE[this.char] || STANCE.jim;
    const t = this.t;
    const B = stancePose(st, t, 1);
    // seated spots (stools, booth benches): the spot y is the seat, legs hang down to the floor
    const sit = (p) => (this.seat && this.react !== 'victory' ? Object.assign(p, { hip: [-0.04, 0.12], fF: [0.38, -0.36], fB: [0.26, -0.38], knF: 1, knB: 1, lean: Math.min(p.lean ?? 0.1, 0.2) }) : p);
    const S = (p) => scale(sit(p), st.s);
    // reactions override activities for a moment
    if (this.react) {
      const k = this.reactT;
      if (this.react === 'wave') return S(over(B, { hF: [0.35, 1.55 + sin(t * 14) * 0.08], face: 'happy', fistF: 'open', head: -0.1 }));
      if (this.react === 'locked') return S(over(B, { hF: [0.5, 1.75], hB: [0.0, 0.8], face: 'shout', head: -0.3, sq: [1 - 0.05 * Math.max(0, 1 - k * 4), 1 + 0.06 * Math.max(0, 1 - k * 4)] }));
      if (this.react === 'pick') return S(over(B, { hF: [0.9, 1.05], hB: [0.2, 0.95], lean: B.lean + 0.25, face: 'grin', fF: [0.36, 0] }));
      if (this.react === 'talk') return S(over(B, { hF: [0.45, 1.0 + abs(sin(t * 9)) * 0.1], face: Math.floor(t * 8) % 2 ? 'grin' : 'shout', fistF: 'open' }));
      if (this.react === 'sad') return S(over(B, { lean: 0.6, head: 0.6, hF: [0.3, 0.6], hB: [0.2, 0.55], face: 'hurt' }));
      if (this.react === 'victory') return computePose({ char: this.char, st: 'victory', sf: k * 60, cs: {} }, { t, victory: this.cos.victory });
    }
    switch (this.activity) {
      case 'bag': {
        // combo drills on the punching bag: jab, jab, hook
        const cyc = t % 1.8, ph = Math.floor(cyc / 0.3);
        const sub = (cyc % 0.3) / 0.3;
        if (ph < 3) {
          const hit = sub > 0.25 && sub < 0.6;
          const lim = ph === 1 ? 'hB' : 'hF';
          const p = over(B, { [lim]: hit ? [0.95, 1.05] : [0.35, 1.0], lean: B.lean + (hit ? 0.2 : 0), face: hit ? 'shout' : 'focus', fF: [0.32, 0] });
          if (hit && sub < 0.32) { p.smear = { limb: lim, from: [0.3, 1.0], to: p[lim], arc: ph === 2 ? 0.4 : 0, k: 0 }; if (!this._hitPh || this._hitPh !== ph) { this.punch = ph === 2 ? 2 : 1; this._hitPh = ph; } }
          return S(p);
        }
        this._hitPh = -1;
        return S(over(B, { face: 'focus', hip: [0, B.hip[1] + sin(t * 10) * 0.02] }));
      }
      case 'eat': {
        const cyc = t % 3.2;
        const toMouth = cyc > 1.0 && cyc < 1.6;
        const chew = cyc > 1.6 && cyc < 2.8 ? abs(sin(t * 12)) : 0;
        const p = over(B, toMouth ? { hF: [0.45, 1.4], head: -0.2, face: 'eat' } : { hF: [0.55, 0.85], hB: [0.4, 0.82], face: chew > 0 ? 'eat' : 'grin', belly: chew * 0.04 });
        return S(p);
      }
      case 'arcade': {
        const mash = sin(t * 20);
        return S(over(B, { hF: [0.5, 0.92 + mash * 0.03], hB: [0.38, 0.9 - mash * 0.03], lean: B.lean + 0.1, face: Math.floor(t / 2) % 3 === 0 ? 'shout' : 'focus', cone: sin(t * 3) * 0.15, head: 0.1 }));
      }
      case 'balance': {
        const w = sin(t * 2.4);
        const p = over(B, { hF: [0.2, 1.6 + w * 0.05], hB: [-0.1, 1.55 - w * 0.05], face: 'grin', cone: w * 0.4, head: -0.2 + w * 0.1 });
        p.fB = [-0.2, abs(w) * 0.1];
        return S(p);
      }
      case 'puru': {
        const toss = (t % 2.4) / 2.4;
        this.puruY = 1.5 + sin(toss * Math.PI) * 0.8;
        return S(over(B, { hF: [0.35, 1.2 + sin(toss * Math.PI) * 0.2], hB: [0.25, 1.15], face: 'happy', fistF: 'open', fistB: 'open', head: -0.2 - sin(toss * Math.PI) * 0.2 }));
      }
      case 'read': return S(over(B, { hF: [0.4, 1.0], hB: [0.3, 0.98], head: 0.3, face: 'focus', fistF: 'open', fistB: 'open' }));
      case 'guard': return S(over(B, { face: 'angry', hF: [0.45, 1.05], hB: [0.3, 1.02], lean: B.lean + 0.05 }));
      default: return S(B);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.react) { this.reactT += dt; if (this.reactT > (this.react === 'victory' ? 99 : 1.4)) this.react = null; }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = 2 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt);
    let p = this.pose();
    if (this.prev && this.prevKey !== (this.react || this.activity)) { this.blendT = 0; this.from = this.prev; }
    this.prevKey = this.react || this.activity;
    if (this.from && this.blendT < 0.15) { this.blendT += dt; p = mixPose(this.from, p, Math.min(1, this.blendT / 0.15)); }
    this.prev = p;
    this.canvas = this.sprite.render(p, { face: this.face, dt, reset: this.reset });
    this.reset = false;
    if (this.punch) { this.bagHit = this.punch; this.punch = 0; }
  }
  draw(d) {
    if (!this.visible || !this.canvas) return;
    const g = d.g, c = this.canvas, spr = this.sprite;
    // shadow
    const cx = d.bx(this.x), cy = d.by(this.y);
    g.fillStyle = 'rgba(6,10,14,0.4)';
    g.fillRect(cx - 14, cy, 28, 1); g.fillRect(cx - 10, cy + 1, 20, 1);
    const flip = this.face < 0;
    const dx = cx - (flip ? c.width - spr.ox : spr.ox), dy = cy - spr.oy;
    if (!flip) g.drawImage(c, dx, dy);
    else { g.save(); g.translate(dx + c.width, dy); g.scale(-1, 1); g.drawImage(c, 0, 0); g.restore(); }
    if (this.puru) {
      const pc = this.puru.render(1 / 60, { face: this.face, mood: 'happy' });
      const px = this.x + this.face * (this.activity === 'puru' ? 0.35 : -0.5), py = this.y + (this.activity === 'puru' ? this.puruY || 1.5 : 1.4 + sin(this.t * 3) * 0.05);
      const bx = d.bx(px) - 17, by = d.by(py) - 14;
      if (!flip) g.drawImage(pc, bx, by); else { g.save(); g.translate(bx + pc.width, by); g.scale(-1, 1); g.drawImage(pc, 0, 0); g.restore(); }
    }
    if (this.activity === 'read' && !this.react) {
      const h = this.headPos();
      g.fillStyle = '#d82a2a'; g.fillRect(d.bx(this.x + this.face * 0.38) - 4, d.by(this.y + 0.95) - 6, 9, 7);
      g.fillStyle = '#f5e6c4'; g.fillRect(d.bx(this.x + this.face * 0.38) - 3, d.by(this.y + 0.95) - 5, 7, 5);
    }
  }
}

function scale(p, s) {
  if (s === 1) return p;
  const q = Object.assign({}, p);
  for (const k of ['hip', 'hF', 'hB', 'fF', 'fB']) if (q[k]) q[k] = [q[k][0] * s, q[k][1] * s];
  if (q.smear) q.smear = { ...q.smear, from: [q.smear.from[0] * s, q.smear.from[1] * s], to: [q.smear.to[0] * s, q.smear.to[1] * s] };
  return q;
}
