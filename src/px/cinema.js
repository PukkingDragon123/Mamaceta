// Ultimate cutscenes. When an ultimate connects, the sim enters 'ucine' for ~5.5s while the
// players play a timing QTE. This director renders a multi-shot pixel-art cinematic instead of
// the arena: a cut-in close-up, side and low angles, manga panels, a mirrored reverse angle, a
// wind-up and a character-specific finale (wave / sky-flop / cone storm / jelly tornado / lights out).
import { CharSprite } from './fighter/sprite.js';
import { computePose } from './fighter/anim.js';
import { PPU } from './display.js';
import { pxCircle, pxDisc, pxLine, drawPoly, bitmap } from './fx.js';
import { CHARS, ULT_NAMES } from '../sim/data.js';

const THEME = {
  jim: { bg: ['#020a12', '#06263a', '#0f4a66', '#2a8f97', '#9ff3ff'], accent: '#9ff3ff', name: ULT_NAMES.jim },
  brutus: { bg: ['#1a0602', '#5a1a08', '#c4561a', '#ff9a3a', '#ffe08a'], accent: '#ffd040', name: ULT_NAMES.brutus },
  bobby: { bg: ['#120c04', '#2e2008', '#ff7a1a', '#f8f8f0', '#ffd040'], accent: '#ff7a1a', name: ULT_NAMES.bobby },
  mimi: { bg: ['#1e0618', '#4a1036', '#b8357a', '#ff6fb0', '#ffd0e2'], accent: '#ffb6d9', name: ULT_NAMES.mimi },
  demon: { bg: ['#000000', '#0c0004', '#3a0610', '#a0102a', '#ff3a3a'], accent: '#ff2a3a', name: ULT_NAMES.demon },
};

export class UltCinema {
  constructor() { this.active = false; this.t = 0; this.fxp = []; this.flash = 0; this.impact = 0; this.shake = 0; }
  start(e, sim, cfgPlayers) {
    const s = sim.s;
    this.a = e.a; this.d = e.d; this.char = e.char;
    const A = s.fighters[e.a], D = s.fighters[e.d];
    const cosA = cfgPlayers[e.a]?.cos || {}, cosD = cfgPlayers[e.d]?.cos || {};
    const idA = A.char === 'bobby' && A.cs.demon ? 'demon' : A.char;
    const idD = D.char === 'bobby' && D.cs.demon ? 'demon' : D.char;
    this.sa = new CharSprite(idA, cosA, { scale: 2 });
    this.sd = new CharSprite(idD, cosD, { scale: 2 });
    this.cut = new CharSprite(idA, cosA, { scale: 3 });
    this.fa = { ...A, st: 'ucAtk', sf: 0 }; this.fd = { ...D, st: 'ucVictim', sf: 0 };
    this.theme = THEME[e.char] || THEME.jim;
    this.active = true; this.t = 0; this.fxp = []; this.flash = 0.6; this.impact = 0; this.shake = 0;
    this.lastHit = -99; this.perfect = false;
    this.warm = true;
  }
  stop() { this.active = false; this.sa = this.sd = this.cut = null; }
  onEvent(e) {
    if (!this.active) return;
    if (e.t === 'ucHit') {
      this.lastHit = this.ct;
      this.shake = e.good ? 1 : 0.5;
      if (e.good) { this.impact = 3; this.flash = 0.25; }
      this.burst(e.good ? 26 : 12, e.good);
    }
    if (e.t === 'ucFinal') { this.impact = 5; this.flash = 1; this.shake = 1.6; this.burst(60, true, true); this.perfect = e.perfect; }
  }
  burst(n, good, big = false) {
    const cols = good ? ['#ffffff', this.theme.accent, '#fff08a'] : ['#cfd8df', '#8a96a6'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (big ? 8 : 4) + Math.random() * (big ? 14 : 8);
      this.fxp.push({ x: 0.9, y: 2.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.3 + Math.random() * 0.4, c: cols[i % cols.length], s: big ? 3 : 2 });
    }
  }

  // shot plan from the cinematic frame
  shot(ct) {
    if (ct < 58) return 'cutin';
    if (ct < 100) return 'side';
    if (ct < 150) return 'low';
    if (ct < 200) return 'panels';
    if (ct < 250) return 'reverse';
    if (ct < 286) return 'windup';
    return 'final';
  }

  render(d, dt, uc, time) {
    if (!this.active || !uc) return false;
    this.t += dt;
    const ct = uc.t;
    this.ct = ct;
    // poses (cinematic time drives the choreography)
    const pa = computePose({ ...this.fa, sf: ct, cs: this.fa.cs }, { t: time, cineT: ct });
    const pd = computePose({ ...this.fd, sf: ct, cs: this.fd.cs }, { t: time, cineT: ct });
    const warmN = this.warm ? 30 : 1; this.warm = false;
    let ca, cd;
    for (let i = 0; i < warmN; i++) { ca = this.sa.render(pa, { face: 1, dt: dt || 1 / 60 }); cd = this.sd.render(pd, { face: -1, dt: dt || 1 / 60, mode: pd.hitFlash ? 'flash' : null }); }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.impact > 0) this.impact -= 1;
    for (let i = this.fxp.length - 1; i >= 0; i--) { const p = this.fxp[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; if (p.t > p.life) this.fxp.splice(i, 1); }
    const sh = this.shake * 0.12;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    const shot = this.shot(ct);
    const T = this.theme;
    // fighters in cinema space: attacker at -1.0, victim at +1.0 (sprites are 2x size)
    const ax = -0.9, dx = 0.95;
    const camFor = {
      side: { x: 0, y: 2.0, zoom: 1.45 },
      low: { x: 0.5, y: 1.4, zoom: 1.9 },
      reverse: { x: 0, y: 2.1, zoom: 1.6 },
      windup: { x: -0.6, y: 2.4, zoom: 2.2 },
      final: { x: 0.2, y: 2.4, zoom: 1.15 },
      panels: { x: 0, y: 2, zoom: 1.5 },
      cutin: { x: 0, y: 2, zoom: 2.3 },
    }[shot];
    const k = shot === 'side' ? (ct - 58) / 42 : shot === 'low' ? (ct - 100) / 50 : shot === 'reverse' ? (ct - 200) / 50 : shot === 'windup' ? (ct - 250) / 36 : 0;
    const cam = { x: camFor.x + jx + (shot === 'side' ? k * 0.3 : 0), y: camFor.y + jy, zoom: camFor.zoom * (1 + (shot === 'windup' ? k * 0.25 : shot === 'low' ? k * 0.08 : 0)) };
    const g = d.begin(cam, T.bg[0]);
    // impact frame: black void + white silhouettes
    if (this.impact > 0 && shot !== 'cutin') {
      g.fillStyle = this.impact % 2 ? '#ffffff' : '#000000'; g.fillRect(0, 0, d.vw, d.vh);
      this.drawSil(d, ca, this.sa, ax, 0, false, this.impact % 2 ? '#000000' : '#ffffff');
      this.drawSil(d, cd, this.sd, dx, 0, true, this.impact % 2 ? '#000000' : '#ffffff');
      this.rays(d, d.bx(0.6), d.by(2.2), this.impact % 2 ? '#000000' : '#ffffff', 22, time);
      return true;
    }
    switch (shot) {
      case 'cutin': this.drawCutin(d, ct, time, pa); break;
      case 'panels': this.drawPanels(d, ca, cd, ax, dx, ct, time); break;
      default: {
        this.bgFor(d, shot, ct, time);
        const mirror = shot === 'reverse';
        if (mirror) { g.save(); g.translate(d.vw, 0); g.scale(-1, 1); }
        // ground line for grounding
        g.fillStyle = T.bg[1]; g.fillRect(0, d.by(0), d.vw, d.vh);
        g.fillStyle = T.bg[2]; g.fillRect(0, d.by(0), d.vw, 2);
        if (shot === 'final') this.drawFinal(d, ct, time, ca, cd, ax, dx);
        else {
          d.g.drawImage(ca, d.bx(ax) - this.sa.ox, d.by(0) - this.sa.oy);
          if (!(ct >= 288)) this.blitFlip(d, cd, this.sd, dx, 0);
        }
        this.drawParticles(d);
        if (mirror) g.restore();
      }
    }
    if (this.flash > 0.02) { g.globalAlpha = Math.min(1, this.flash); g.fillStyle = '#ffffff'; g.fillRect(0, 0, d.vw, d.vh); g.globalAlpha = 1; }
    // cinematic letterbox
    const lb = Math.round(d.vh * 0.1);
    g.fillStyle = '#000000'; g.fillRect(0, 0, d.vw, lb); g.fillRect(0, d.vh - lb, d.vw, lb);
    return true;
  }

  blitFlip(d, c, spr, x, y) {
    const g = d.g;
    const dx = d.bx(x) - (c.width - spr.ox), dy = d.by(y) - spr.oy;
    g.save(); g.translate(dx + c.width, dy); g.scale(-1, 1); g.drawImage(c, 0, 0); g.restore();
  }
  drawSil(d, c, spr, x, y, flip, color) {
    if (!this._sil) this._sil = document.createElement('canvas');
    const s = this._sil; s.width = c.width; s.height = c.height;
    const g = s.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, s.width, s.height);
    if (flip) this.blitFlip(d, s, spr, x, y); else d.g.drawImage(s, d.bx(x) - spr.ox, d.by(y) - spr.oy);
  }
  drawParticles(d) {
    const g = d.g;
    for (const p of this.fxp) { g.fillStyle = p.c; const x = d.bx(p.x), y = d.by(p.y); g.fillRect(x, y, p.s, p.s); pxLine(g, x, y, x - p.vx * 0.8, y + p.vy * 0.8); }
  }
  // rotating radial rays (crisp pixel polygons)
  rays(d, cx, cy, color, n, time, spin = 0.4) {
    const g = d.g;
    const R = Math.max(d.vw, d.vh) * 1.2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + time * spin, a1 = a0 + (Math.PI / n) * 0.55;
      drawPoly(g, [[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]], null, color);
    }
  }
  speedLines(d, color, time, dir = 1) {
    const g = d.g;
    g.fillStyle = color;
    for (let i = 0; i < 40; i++) {
      const y = (i * 37 + Math.floor(time * 60) * 3) % d.vh;
      const len = 30 + ((i * 53) % 90);
      const x = ((i * 91 + Math.floor(time * 600)) % (d.vw + len)) - len;
      g.fillRect(dir > 0 ? x : d.vw - x - len, y, len, 1 + (i % 3 === 0 ? 1 : 0));
    }
  }
  bgFor(d, shot, ct, time) {
    const T = this.theme, g = d.g;
    g.fillStyle = T.bg[0]; g.fillRect(0, 0, d.vw, d.vh);
    if (shot === 'side' || shot === 'reverse') { this.rays(d, d.bx(0.6), d.by(2.2), T.bg[1], 18, time, 0.3); this.speedLines(d, T.bg[2], time, shot === 'reverse' ? -1 : 1); }
    else if (shot === 'low') { d.dither(T.bg[1], 0.6, 0, 0, d.vw, d.vh); this.rays(d, d.bx(0.9), d.by(5), T.bg[2], 12, -time, 0.2); }
    else if (shot === 'windup') {
      this.rays(d, d.bx(-0.9), d.by(2.4), T.bg[1], 26, time, 1.1);
      // aura flames rising behind the attacker
      for (let i = 0; i < 60; i++) {
        const ph = (time * 1.6 + i * 0.137) % 1;
        const x = d.bx(-0.9 + Math.sin(i * 7.3) * 1.2), y = d.by(ph * 5);
        g.fillStyle = T.bg[3 + (i % 2)]; g.fillRect(x, y, 3, 6 + (i % 4) * 2);
      }
    } else if (shot === 'final') this.rays(d, d.bx(1), d.by(2.2), T.bg[1], 30, time, 2);
  }

  drawCutin(d, ct, time, pose) {
    const T = this.theme, g = d.g;
    g.fillStyle = T.bg[0]; g.fillRect(0, 0, d.vw, d.vh);
    this.rays(d, d.vw * 0.7, d.vh * 0.5, T.bg[1], 24, time, 0.8);
    this.speedLines(d, T.bg[2], time, -1);
    // diagonal band
    const k = Math.min(1, ct / 10);
    const bandH = Math.round(d.vh * 0.46);
    const y0 = Math.round(d.vh * 0.27);
    const skew = Math.round(d.vh * 0.12);
    const slide = Math.round((1 - k) * d.vw);
    drawPoly(g, [[slide, y0 + skew], [d.vw + slide, y0 - skew], [d.vw + slide, y0 + bandH - skew], [slide, y0 + bandH + skew]], null, T.bg[2]);
    drawPoly(g, [[slide, y0 + skew + 5], [d.vw + slide, y0 - skew + 5], [d.vw + slide, y0 + bandH - skew - 5], [slide, y0 + bandH + skew - 5]], null, T.bg[1]);
    // the close-up: scale-3 render of the attacker's head & fists
    const cp = { ...pose, face: 'shout', hF: [0.4 * (pose.hF ? 1 : 1), 1.05], hB: [0.2, 1.0] };
    const c = this.cut.render(cp, { face: 1, dt: 1 / 60 });
    const h = this.cut.headLocal();
    const hx = this.cut.ox + h[0], hy = this.cut.oy - h[1];
    const cx = Math.round(d.vw * 0.58) + slide, cy = Math.round(d.vh * 0.5);
    g.save();
    g.beginPath(); g.rect(0, y0 - skew + 4, d.vw, bandH + skew * 2 - 8); g.clip();
    g.drawImage(c, cx - hx + Math.round(Math.sin(time * 40) * this.shake * 3), cy - hy + Math.round(bandH * 0.16));
    g.restore();
    // eye glint
    if (ct > 30 && ct < 44) { g.fillStyle = '#ffffff'; const gx = cx + 20, gy = cy - 20; for (let i = -6; i <= 6; i++) { g.fillRect(gx + i, gy, 1, 1); g.fillRect(gx, gy + i, 1, 1); } }
  }

  drawPanels(d, ca, cd, ax, dx, ct, time) {
    const T = this.theme, g = d.g;
    g.fillStyle = '#000000'; g.fillRect(0, 0, d.vw, d.vh);
    const W = d.vw, H = d.vh;
    const panels = [
      { x: 4, y: Math.round(H * 0.1) + 4, w: Math.round(W * 0.46), h: Math.round(H * 0.38), what: 'a' },
      { x: Math.round(W * 0.46) + 10, y: Math.round(H * 0.1) + 4, w: Math.round(W * 0.54) - 14, h: Math.round(H * 0.38), what: 'd' },
      { x: 4, y: Math.round(H * 0.5) + 2, w: W - 8, h: Math.round(H * 0.4) - 6, what: 'both' },
    ];
    const reveal = Math.floor((ct - 150) / 8);
    panels.forEach((p, i) => {
      if (i > reveal) return;
      g.save();
      g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
      g.fillStyle = T.bg[i === 1 ? 2 : 1]; g.fillRect(p.x, p.y, p.w, p.h);
      if (i === 2) this.speedLines(d, T.bg[2], time);
      else this.rays(d, p.x + p.w / 2, p.y + p.h / 2, T.bg[i === 1 ? 3 : 2], 14, time * (i ? -1 : 1), 0.6);
      if (p.what === 'a') {
        const h = this.sa.headLocal();
        g.drawImage(ca, p.x + p.w / 2 - (this.sa.ox + h[0]), p.y + p.h / 2 - (this.sa.oy - h[1]) + 6);
      } else if (p.what === 'd') {
        const h = this.sd.headLocal();
        g.save(); g.translate(p.x + p.w / 2 + (this.sd.ox + h[0]), p.y + p.h / 2 - (this.sd.oy - h[1]) + 6); g.scale(-1, 1); g.drawImage(cd, 0, 0); g.restore();
        // sweat drops
        const sw = bitmap('sweat', '#9cdcff');
        g.drawImage(sw, p.x + p.w / 2 + 26, p.y + p.h / 2 - 30 + Math.round((time * 30) % 10));
      } else {
        const ox = p.x + p.w / 2, oy = p.y + p.h - 6;
        g.drawImage(ca, ox - 60 - this.sa.ox, oy - this.sa.oy);
        g.save(); g.translate(ox + 60 - (cd.width - this.sd.ox) + cd.width, oy - this.sd.oy); g.scale(-1, 1); g.drawImage(cd, 0, 0); g.restore();
      }
      g.restore();
      // white panel border
      g.fillStyle = '#ffffff'; g.fillRect(p.x - 2, p.y - 2, p.w + 4, 2); g.fillRect(p.x - 2, p.y + p.h, p.w + 4, 2); g.fillRect(p.x - 2, p.y, 2, p.h); g.fillRect(p.x + p.w, p.y, 2, p.h);
    });
  }

  drawFinal(d, ct, time, ca, cd, ax, dx) {
    const T = this.theme, g = d.g;
    const k = Math.min(1, (ct - 286) / 44);
    const c = this.char;
    // attacker always visible in the finale
    const vx = dx + k * 3, vy = Math.max(0, k * 4 - k * k * 2.5);
    if (c === 'jim') {
      // giant cavitation wave
      const R = Math.round((0.3 + k * 6) * PPU);
      const cx = d.bx(0.3), cy = d.by(2.2);
      for (let j = 0; j < 4; j++) { g.fillStyle = j % 2 ? '#ffffff' : '#9ff3ff'; pxCircle(g, cx, cy, Math.max(2, R - j * 14), 3); }
      for (let i = 0; i < 40; i++) { const a = i * 0.7 + time * 3; const r = R * (0.3 + (i % 7) / 9); g.fillStyle = '#bff8ff'; pxCircle(g, cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r * 0.7), 2 + (i % 3), 1); }
    } else if (c === 'brutus') {
      // sky flop: a sun, Brutus falls like a meteor
      g.fillStyle = '#ffe08a'; pxDisc(g, d.bx(1), d.by(6), 70);
      g.fillStyle = '#ffffff'; pxDisc(g, d.bx(1), d.by(6), 52);
      const fy = Math.max(0, 7 - k * 14);
      g.save(); g.translate(d.bx(dx), d.by(fy) - 40); g.rotate(1.4); g.drawImage(ca, -this.sa.ox, -this.sa.oy); g.restore();
      if (fy <= 0) { g.fillStyle = '#8a5a3a'; for (let i = 0; i < 30; i++) pxDisc(g, d.bx(dx + Math.cos(i) * (1 + k * 4)), d.by(0.2 + Math.abs(Math.sin(i * 2.3)) * k * 2), 6 + (i % 5)); }
      return;
    } else if (c === 'bobby') {
      for (let i = 0; i < 26; i++) {
        const img = bitmap('star', i % 2 ? '#ff7a1a' : '#f8f8f0');
        const x = d.bx(-4 + ((i * 1.37 + k * 9) % 9)), y = d.by(8 - ((i * 2.3 + k * 18) % 9));
        g.drawImage(img, x, y);
        g.fillStyle = '#ff7a1a'; drawPoly(g, [[x, y + 14], [x + 6, y], [x + 12, y + 14]], '#120a08', '#ff7a1a');
        g.fillStyle = '#f8f8f0'; g.fillRect(x + 3, y + 7, 6, 2);
      }
    } else if (c === 'mimi') {
      this.rays(d, d.bx(dx), d.by(2), '#ff6fb0', 16, time * 6, 0);
      for (let i = 0; i < 30; i++) { const a = i * 0.9 + time * 6; const r = (0.6 + (i % 6) * 0.4) * PPU; const img = bitmap('heart', i % 2 ? '#ff6fb0' : '#ffffff'); g.drawImage(img, d.bx(dx) + Math.round(Math.cos(a) * r), d.by(2) + Math.round(Math.sin(a) * r * 0.6)); }
    } else if (c === 'demon') {
      g.fillStyle = '#000000'; g.fillRect(0, 0, d.vw, d.vh);
      g.fillStyle = '#ff2a3a';
      for (let i = 0; i < 5; i++) { const y0 = d.vh * (0.2 + i * 0.15); for (let w = 0; w < 4; w++) pxLine(g, 0, y0 + w - k * 80, d.vw, y0 + w + 60 - k * 80); }
      g.fillStyle = '#ff3a3a'; g.fillRect(d.bx(ax) + 20, d.by(3) - 6, 14, 3); g.fillRect(d.bx(ax) + 44, d.by(3) - 8, 14, 3);
      return;
    }
    g.drawImage(ca, d.bx(ax) - this.sa.ox, d.by(0) - this.sa.oy);
    this.blitFlip(d, cd, this.sd, vx, vy);
  }
}
