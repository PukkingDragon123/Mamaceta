// TRAINING TANK: a clean little dojo/gym inside a big glass tank. White-and-aqua tiled walls, a tall
// riveted glass panel looking out onto a coral reef, a TRAINING banner, hanging sandbags, a weapon rack,
// a whiteboard with combo notes, tatami mats in perspective, tidy blue catwalks.
import {
  Pix, Layer, PerspFloor, Snow, FishLayer, StageBase, coneSprite,
  C, R, RO, PAL, AX, AY, PPU, TAU, hh, ih, rng, BY, vnoise, noiseField, mixU, darkU, lightU,
  rivet, bolt, chainV, pipeH, pipeV, flangeOnH, hazard, grating, kelp, text, textW, tiles, woodPlanks, barnacle,
  pbx, pby, drawAt, clamp,
} from './common.js';

const WALL_P = 0.9, WALL_BASE = 0.85;
const FOGC = C('#0e2a34');
const TILE = RO(['#4a6a6e', '#5e8084', '#729498', '#86a8aa', '#9cbcbc']);
const TILE2 = RO(['#2a5a64', '#336a74', '#3e7a84', '#4a8a92', '#5a9aa0']);
const STEEL = RO(['#141c22', '#22303a', '#344652', '#4a5e6a', '#647a84']);
const WD = RO(['#1e120a', '#2e1c10', '#442a18', '#5a3a22', '#704a2c']);

export class TrainingStage extends StageBase {
  constructor(def) {
    super(def);
    const L = def?.left ?? -12, Rr = def?.right ?? 12;
    this.bounds = { left: L - 3, right: Rr + 3, bottom: -1.6, top: 13 };
    this.x0 = this.bounds.left - 1.5; this.x1 = this.bounds.right + 1.5;
    this.buildOutside();
    this.buildWall();
    this.buildFloor();
    this.buildDeco();
    this.fish = new FishLayer({ count: 10, x0: -20, x1: 20, y0: 5.2, y1: 11.5, p: [0.18, 0.4], col: (p) => (p < 0.3 ? '#1a5a68' : '#1e6270'), belly: () => '#2a7480', seed: 21 });
    this.snow = new Snow({ seed: 5, bands: [{ p: 0.6, n: 12, col: '#5a9a9a', sz: 1, sp: 6 }, { p: 0.95, n: 10, col: '#8ac0bc', sz: 1, sp: 10 }] });
    this.bags = [{ x: -3.4, a: 0, v: 0 }, { x: 3.8, a: 0, v: 0 }];
    this.bub.emitter(10.6 * WALL_P, 1.3, 1.6, { p: WALL_P, spread: 0.08, top: 2.6, amp: 1 });
  }
  buildOutside() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(13.4), H = AY(4.3) - Y0;
    const P = new Pix(W, H);
    const stops = [[13.4, '#3a9aa6'], [11.5, '#2e8a98'], [9.6, '#257a8a'], [7.8, '#1e6a7a'], [6, '#195c6c'], [3, '#144e5e']].map(([y, c]) => [y, C(c)]);
    for (let j = 0; j < H; j++) {
      const y = -(Y0 + j) / PPU; let k = 0; while (k < stops.length - 2 && y < stops[k + 1][0]) k++;
      const f = (stops[k][0] - y) / (stops[k][0] - stops[k + 1][0]), th = (f - 0.55) / 0.45;
      if (th <= 0) P.d.fill(stops[k][1], j * W, j * W + W); else for (let i = 0; i < W; i++) P.d[j * W + i] = BY(i, j) < th ? stops[k + 1][1] : stops[k][1];
    }
    // caustic net near the surface
    for (let j = 0; j < 80; j++) for (let i = 0; i < W; i++) { const v = Math.sin(i * 0.09 + Math.sin(j * 0.25 + i * 0.02) * 2.5) + Math.sin(i * 0.04 - j * 0.15); if (v > 1.5 && BY(i, j) < 0.6 - j / 140) P.d[j * W + i] = C('#5ab8c0'); }
    // coral reef silhouettes (soft colours, fogged)
    const r = rng(9), reefY = H - 1;
    const corals = [C('#3a7a86'), C('#4a6e8a'), C('#5a6a7a'), C('#3e8478')];
    for (let x = 0; x < W; x += 2) { const h = 18 + Math.round(vnoise(x * 0.012, 1, 3) * 46); P.rect(x, reefY - h, 2, h, C('#1a5866')); }
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(r() * W), h = 20 + Math.floor(r() * 60), c = corals[k % 4], kind = k % 3;
      if (kind === 0) { for (let b = 0; b < 5; b++) { let bx = x, by = reefY - 20; for (let j = 0; j < h; j++) { bx += Math.round(Math.sin(j * 0.2 + b * 1.3) * 0.6) + (b - 2) * (j % 6 === 0 ? 1 : 0); P.rect(bx, by - j, 2, 1, c); } } }
      else if (kind === 1) { P.ell(x, reefY - 26, 14 + (k % 5) * 3, 10, c); for (let j = 0; j < 12; j++) P.set(x - 10 + j * 2, reefY - 30 + (j % 3), lightU(c, 0.15)); }
      else for (let j = 0; j < 5; j++) kelp(P, x + j * 5, reefY - 18, h, RO(['#1e6a6a', '#1e6a6a', '#247676', '#2a8080', '#2a8080']), { seed: k + j, w: 2 });
    }
    this.outside = new Layer(P, X0, Y0, 0.3, 0.5);
  }
  buildWall() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(13.4), Yb = AY(WALL_BASE), H = Yb - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0, ly = (yw) => AY(yw) - Y0;
    this.wX0 = X0; this.wY0 = Y0;
    // the glass panel (transparent) framed by steel; tiles below
    const gTop = ly(12.6), gBot = ly(4.6);
    const tileTop = gBot + 12;
    // steel frame band + mullions
    P.rect(0, 0, W, gTop, STEEL[1]);
    for (let y = 0; y < gTop; y += 6) P.hl(0, W - 1, y, STEEL[2]);
    P.rect(0, gBot, W, 12, STEEL[2]); P.hl(0, W - 1, gBot, STEEL[4]); P.hl(0, W - 1, gBot + 11, STEEL[0]);
    P.rect(0, gTop - 6, W, 6, STEEL[2]); P.hl(0, W - 1, gTop - 6, STEEL[3]); P.hl(0, W - 1, gTop - 1, STEEL[0]);
    for (let x = 3; x < W; x += 9) { rivet(P, x, gBot + 5, STEEL); rivet(P, x, gTop - 4, STEEL); }
    for (const xw of [-14.6, -7.3, 0, 7.3, 14.6]) {
      const x = lx(xw);
      P.rect(x - 9, gTop, 18, gBot - gTop, STEEL[2]); P.vl(x - 9, gTop, gBot, STEEL[4]); P.vl(x - 8, gTop, gBot, STEEL[3]); P.vl(x + 8, gTop, gBot, STEEL[0]);
      for (let y = gTop + 4; y < gBot; y += 9) { rivet(P, x - 5, y, STEEL); rivet(P, x + 4, y, STEEL); }
      // rubber seal
      P.vl(x - 10, gTop, gBot, C('#0a0e10')); P.vl(x + 9, gTop, gBot, C('#0a0e10'));
    }
    // glass reflections: flat diagonal streaks (drawn on a separate overlay so the glass stays see-through)
    const G = new Pix(W, H);
    for (let k = 0; k < 12; k++) {
      const x = Math.floor(hh(k, 1, 5) * W), w = 2 + Math.floor(hh(k, 2, 5) * 10), c = k % 3 ? C('#5ab0b8') : C('#7ac8cc'), y0 = gTop + Math.floor(hh(k, 3, 5) * (gBot - gTop) * 0.5), L = 30 + Math.floor(hh(k, 4, 5) * 120);
      for (let y = y0; y < Math.min(gBot, y0 + L); y++) for (let i = 0; i < w; i++) { const xx = x + i + Math.round((gBot - y) * 0.6); if (BY(xx, y) < (i === 0 || i === w - 1 ? 0.12 : 0.22) && !P.get(xx, y)) G.seti(xx, y, c); }
    }
    this.glass = new Layer(G, X0, Y0, WALL_P, 1);
    // white/aqua tiles below the glass, with an aqua band and a few cracked tiles
    tiles(P, 0, tileTop, W, H - tileTop, 13, C('#2a3e42'), (Q, x, y, s, i, j) => {
      const band = j === 2 || j === 3;
      const r = band ? TILE2 : TILE, v = ih(i, j, 4);
      Q.rect(x, y, s, s, r[v < 0.2 ? 2 : 3]); Q.hl(x, x + s - 1, y, r[4]); Q.vl(x, y, y + s - 1, r[4]); Q.hl(x, x + s - 1, y + s - 1, r[1]);
      if (v > 0.93) { Q.line(x + 2, y + 1, x + 7, y + 9, r[0]); Q.line(x + 7, y + 9, x + 11, y + 6, r[0]); }
      if (band && (i + j) % 2 === 0) { Q.rect(x + 4, y + 4, 4, 4, C('#e8e0b0')); Q.set(x + 5, y + 5, C('#fff8d8')); }
    });
    // grime + algae creeping at the base, water line
    for (let i = 0; i < W; i++) { const h = Math.floor(hh(i, 1, 9) * 5 * hh(i >> 3, 2, 9)); for (let j = 0; j < h; j++) P.seti(i, H - 1 - j, PAL.algae[j > 2 ? 3 : 2]); }
    // deco on the tiles: whiteboard, posters, weapon rack, clock, water cooler
    const wb = { x: lx(-12.4), y: ly(3.9) };
    P.rect(wb.x - 2, wb.y - 2, 92, 52, STEEL[2]); P.rect(wb.x, wb.y, 88, 48, C('#c8d0cc'));
    text(P, 'COMBOS', wb.x + 44, wb.y + 3, C('#2a4a8a'), { font: 3, align: 'center' });
    text(P, 'J J H', wb.x + 6, wb.y + 13, C('#2a2a2a'), { font: 3 }); text(P, 'D F + P', wb.x + 6, wb.y + 21, C('#a82a2a'), { font: 3 }); text(P, 'BLOCK!!', wb.x + 6, wb.y + 29, C('#2a2a2a'), { font: 3 });
    P.line(wb.x + 50, wb.y + 14, wb.x + 80, wb.y + 34, C('#2a4a8a')); P.ring(wb.x + 62, wb.y + 26, 7, 8, C('#a82a2a'));
    P.rect(wb.x + 4, wb.y + 48, 80, 3, STEEL[1]); P.rect(wb.x + 10, wb.y + 46, 6, 2, C('#2a4a8a')); P.rect(wb.x + 20, wb.y + 46, 6, 2, C('#a82a2a'));
    const poster = (x, y, bg, l1, l2) => { P.rect(x, y, 34, 46, C(bg)); P.rect(x + 2, y + 2, 30, 26, darkU(C(bg), 0.25)); text(P, l1, x + 17, y + 31, C('#f0e8d0'), { font: 3, align: 'center' }); text(P, l2, x + 17, y + 38, C('#f0e8d0'), { font: 3, align: 'center' }); P.disc(x + 17, y + 15, 8, C('#d8783a')); P.rect(x + 12, y + 12, 3, 3, C('#f0e8d0')); P.rect(x + 19, y + 12, 3, 3, C('#f0e8d0')); P.rect(x + 13, y + 19, 8, 2, C('#2a1a1a')); };
    poster(lx(-5.6), ly(3.7), '#7a2a4a', 'NO PAIN', 'NO SHRIMP'); poster(lx(5.4), ly(3.7), '#2a4a7a', 'BLOCK', 'LOW!');
    // weapon rack with bo staffs
    const rx = lx(9.4), ry = ly(3.95);
    P.rect(rx, ry, 70, 5, WD[3]); P.hl(rx, rx + 69, ry, WD[4]); P.rect(rx, ry + 40, 70, 5, WD[3]);
    for (let k = 0; k < 5; k++) { const x = rx + 8 + k * 13; P.rect(x, ry - 16, 3, 70, k % 2 ? WD[4] : C('#8a6a3a')); P.set(x, ry - 16, C('#c8a060')); }
    // clock
    const cx = lx(1.8), cy = ly(3.6);
    P.disc(cx, cy, 11, STEEL[3]); P.disc(cx, cy, 9, C('#e8e8e0')); for (let k = 0; k < 12; k++) P.set(cx + Math.cos(k * TAU / 12) * 7, cy + Math.sin(k * TAU / 12) * 7, C('#2a2a2a')); P.line(cx, cy, cx + 5, cy - 2, C('#2a2a2a')); P.line(cx, cy, cx, cy - 7, C('#a82a2a'));
    // water cooler
    const wx = lx(10.6), wy = H;
    P.rect(wx - 9, wy - 40, 18, 40, C('#c8d0d0')); P.hl(wx - 9, wx + 8, wy - 40, C('#e8f0f0')); P.vl(wx + 8, wy - 40, wy - 1, C('#8a9898'));
    P.rect(wx - 3, wy - 30, 6, 3, C('#3a7aa8')); P.rect(wx + 3, wy - 30, 3, 3, C('#a82a2a'));
    P.ell(wx, wy - 52, 9, 12, (x, y, nx) => (nx < -0.4 ? C('#8ad0e8') : C('#4aa0c8'))); P.rect(wx - 3, wy - 42, 6, 3, C('#2a6a98'));
    // vents high on the frame
    for (const xw of [-11, 11]) grating(P, lx(xw) - 20, gBot + 2, 40, 8, STEEL[1], C('#0a0e10'), { sx: 3, sy: 3, hw: 2, hh: 1 });
    // painted tank number on the frame
    text(P, 'TANQUE 03', lx(-3.65), gBot + 3, C('#c8b040'), { font: 3, align: 'center' });
    hazard(P, lx(3.6) - 30, gBot + 3, 60, 6, { per: 8, seed: 3 });
    P.mixAll(FOGC, 0.12);
    this.wall = new Layer(P, X0, Y0, WALL_P, 1);
  }
  buildFloor() {
    const K = 1222;
    const mat = RO(['#3a4424', '#4e5a2e', '#626e38', '#788444', '#8e9a52']);
    const wd = RO(['#2a1a10', '#3a2416', '#4e321e', '#624028', '#764e30']);
    const F = new PerspFloor(this.x0 - 3, this.x1 + 3, WALL_BASE, -1.72, WALL_P, 1.22, K, (u, v, du, dv, X, Y, p) => {
      // tatami mats: 2 x 1 units (u) by 70 v rows, alternating orientation, dark cloth borders; wood border outside |u| > 12
      if (Math.abs(u) > 12 * 44) {
        const pl = Math.floor(u / 18), pn = Math.floor((u + du) / 18);
        let c = wd[(ih(pl, 1, 3) < 0.4 ? 2 : 3)];
        if (pl !== pn) c = wd[0];
        if (p < 0.99) c = mixU(c, C('#081010'), (1 - p) * 2.4);
        return c;
      }
      const row = Math.floor(v / 60), rv = ((v % 60) + 60) % 60;
      const mw = row & 1 ? 88 : 132, off = row & 1 ? 44 : 0;
      const col = Math.floor((u + off) / mw), cn = Math.floor((u + off + du) / mw), pu = ((u + off) % mw + mw) % mw;
      let c;
      const weave = (Math.floor(rv / 2) + (row & 1 ? Math.floor(u / 3) : 0)) & 1;
      const ms = ih(col, row, 5);
      c = mat[(ms < 0.3 ? 1 : 2) + (weave && ms > 0.5 ? 1 : 0)];
      if (pu < 5 || pu > mw - 6) c = C('#1a2a2a');
      if (rv < 2 || rv > 57 || col !== cn) c = C('#0e1414');
      if (p < 0.99) c = mixU(c, C('#081010'), (1 - p) * 2.4);
      if (p > 1.14 && BY(X, Y) < (p - 1.14) * 9) c = mixU(c, C('#040808'), 0.5);
      return c;
    });
    for (let j = 0; j < 5; j++) F.P.map(0, j, F.W, 1, (c, x, y) => (BY(x, y) < 0.8 - j * 0.15 ? mixU(c, C('#040808'), 0.6) : undefined));
    this.floor = F.finish();
  }
  buildDeco() {
    // TRAINING banner
    const W = 230, H = 44, P = new Pix(W, H + 8);
    const red = RO(['#3a0e10', '#5a1618', '#8a2224', '#b03030', '#c84a40']);
    P.rect(0, 0, W, 4, WD[3]); P.hl(0, W - 1, 0, WD[4]);
    for (let y = 4; y < H; y++) for (let x = 4; x < W - 4; x++) P.seti(x, y, ((x + Math.floor(y / 6)) % 23 === 0) ? red[1] : red[2]);
    for (let x = 4; x < W - 4; x++) { P.seti(x, 4, red[3]); for (let j = 0; j < 6; j++) if ((x + j) % 6 < 3) P.seti(x, H + j, red[2]); }
    text(P, 'TRAINING', W / 2, 12, C('#f0e0b0'), { sc: 3, align: 'center', shadow: red[0], sdx: 1, sdy: 2 });
    P.set(2, 2, C('#c8a040')); P.set(W - 3, 2, C('#c8a040'));
    P.outline(C('#0a0606'));
    this.banner = { cv: P.canvas(), x: 0, y: 9.0 };
    // sandbag sprite
    const B = new Pix(30, 62), lea = RO(['#2a1410', '#4a2418', '#6a3622', '#8a4a2e', '#a8603a']);
    for (let y = 8; y < 58; y++) for (let x = 2; x < 28; x++) { const t = x < 6 ? 3 : x < 10 ? 4 : x > 23 ? 1 : 2; B.seti(x, y, y % 16 === 0 ? lea[1] : lea[t]); }
    B.rect(2, 8, 26, 5, C('#2a2a30')); B.rect(2, 52, 26, 5, C('#2a2a30'));
    for (let x = 3; x < 28; x += 3) B.set(x, 33, lea[0]);
    text(B, 'HIT', 15, 26, C('#e0c890'), { font: 3, align: 'center' });
    B.vl(15, 0, 8, C('#5a5a5a')); B.line(15, 0, 4, 8, C('#4a4a4a')); B.line(15, 0, 26, 8, C('#4a4a4a'));
    B.outline(C('#0a0606'));
    this.bagCv = B.canvas();
    // overhead fluorescent fixtures with dithered light
    const Lp = new Pix(60, 8);
    Lp.rect(0, 0, 60, 4, STEEL[2]); Lp.hl(0, 59, 0, STEEL[4]); Lp.rect(3, 4, 54, 3, C('#e8f4f0')); Lp.hl(3, 56, 6, C('#b8d0d0'));
    Lp.outline(C('#070b0d'));
    this.lampCv = Lp.canvas();
    const len = AY(WALL_BASE) - AY(12.2);
    this.lampCone = (() => { const c = coneSprite(len, 54, 240, 0, C('#a8d8d0'), [0.06, 0.12], { floorY: len - 4, fade: 0.8 }); return { cv: c.canvas(), ax: c.ax }; })();
  }
  catwalkSprite(w) {
    return this.spr('tcw' + w, () => {
      const top = 46, deckH = 14, legH = AX(2.6) - deckH, H = top + deckH + legH, Wd = w + 2, P = new Pix(Wd, H);
      const bl = RO(['#0e1e3a', '#16305a', '#20488a', '#3064b0', '#4a84d0']), st = PAL.steelL;
      for (const lx of [14, w - 22]) { for (let y = top + deckH; y < H; y++) for (let i = 0; i < 8; i++) P.seti(lx + i, y, bl[i === 0 ? 1 : i === 1 ? 4 : i > 5 ? 1 : 2]); P.rect(lx - 4, H - 4, 16, 4, st[1]); }
      P.tline(22, top + deckH + 8, w - 22, H - 14, 2, bl[1]); P.tline(22, H - 14, w - 22, top + deckH + 8, 2, bl[2]);
      P.rect(0, top, Wd, 3, st[3]); P.hl(0, Wd - 1, top, st[4]);
      grating(P, 0, top + 3, Wd, 6, st[2], C('#0a0e10'), { sx: 3, sy: 3, hw: 2, hh: 1, stagger: true });
      P.rect(0, top + 9, Wd, 5, bl[2]); P.hl(0, Wd - 1, top + 9, bl[3]); P.hl(0, Wd - 1, top + 13, bl[0]);
      for (let x = 3; x < Wd - 2; x += 30) { P.rect(x, 2, 3, top, bl[3]); P.vl(x + 2, 2, top, bl[1]); }
      P.rect(Wd - 4, 2, 3, top, bl[3]);
      for (const ry of [1, 22]) { P.rect(0, ry, Wd, 3, bl[3]); P.hl(0, Wd - 1, ry, bl[4]); P.hl(0, Wd - 1, ry + 2, bl[1]); }
      // a towel hung over the rail
      const tx = Math.round(w * 0.6);
      P.rect(tx, 1, 14, 18, C('#e8e0d0')); P.hl(tx, tx + 13, 15, C('#c83a3a')); P.hl(tx, tx + 13, 17, C('#c83a3a')); P.vl(tx + 13, 1, 18, C('#b8b0a0'));
      P.outline(C('#070b0d'));
      return { cv: P.canvas(), top };
    });
  }
  drawPlat(d, pl) {
    if (pl.kind !== 'catwalk') return;
    const w = Math.round((pl.x1 - pl.x0) * PPU), sp = this.catwalkSprite(w);
    d.g.drawImage(sp.cv, d.bx(pl.x0) - 1, d.by(pl.y) - sp.top);
  }
  update(dt, s) {
    super.update(dt, s);
    this.fish.update(dt);
    for (const b of this.bags) { b.v += (-b.a * 2.2 - b.v * 0.9) * dt + Math.sin(this.t * 0.6 + b.x) * 0.0015; b.a += b.v * dt; }
  }
  drawBack(d, t) {
    const g = d.g;
    this.outside.draw(d);
    this.fish.draw(d, t);
    this.snow.draw(d, t);
    this.wall.draw(d);
    this.glass.draw(d);
    this.floor.draw(d);
    for (const lx of [-7.3, 7.3]) { if (this.flick) drawAt(d, this.lampCone.cv, AX(lx) - this.lampCone.ax, AY(12.2) + 6, 0.92, 1); drawAt(d, this.lampCv, AX(lx) - 30, AY(12.2), 0.92, 1); }
    // banner + sandbags (world-ish depth)
    drawAt(d, this.banner.cv, AX(this.banner.x) - 115, AY(this.banner.y), 0.95, 1);
    for (const b of this.bags) {
      const ax = pbx(d, b.x, 0.95), ay = pby(d, 12.6, 1), L = 9.7 * PPU;
      const k = Math.round(b.a * 60) / 60;
      const bx = Math.round(ax + Math.sin(k) * L), by = Math.round(ay + Math.cos(k) * L);
      g.fillStyle = '#3a3a3a';
      for (let i = 0; i < L; i += 3) g.fillRect(Math.round(ax + Math.sin(k) * i), ay + Math.round(Math.cos(k) * i), (i / 3) & 1 ? 1 : 2, 2);
      g.drawImage(this.bagCv, bx - 15, by);
    }
    if (this.dark > 0.02) d.dither('#020406', this.dark * 0.8);
  }
  drawFront(d, t) {}
  onStageEvent(e) {
    if (e.t === 'hit') for (const b of this.bags) if (Math.abs(b.x - (e.x ?? 0)) < 2) b.v += (e.kb || 1) * (e.heavy ? 0.12 : 0.05);
  }
}
