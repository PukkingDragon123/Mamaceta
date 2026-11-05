// THE RUST PIT: a fight pit at the bottom of an abandoned, flooded oil rig. Riveted bulkhead walls
// torn open at the top (the sea and the rig's legs beyond), giant leaking pipes, a broken pump engine,
// swinging cage lamps, chain-link fence, catwalks, a gantry crane and bubble vents. A lonely little
// old mantis-shrimp referee watches from the back with a couple of sad spectators.
import {
  Pix, Layer, PerspFloor, Snow, FishLayer, StageBase, shaftLayer, coneSprite, rotPix,
  C, R, RO, PAL, AX, AY, PPU, PIV_Y, TAU, hh, rng, BY, noiseField, mixU, darkU, lightU, fogRamp,
  rustPlates, vnoise, rivet, bolt, barnacle, chainV, sagLine, pipeH, pipeV, flangeOnH, flangeOnV, hazard, grating, chainLink,
  kelp, text, textW, luchaPoster, loteria, pbx, pby, drawAt, clamp,
} from './common.js';
import { Referee, Spectator } from './npcs.js';

const FOG = C('#0d3440');
const WALL_P = 0.88;           // wall parallax (also the floor's back row)
const WALL_BASE = 0.91;        // world y where the wall meets the floor (back edge)

// muted background ramps
const WP = RO(['#132126', '#1b2d31', '#25393c', '#304746', '#3f5852']);
const WP2 = RO(['#1a1412', '#241a17', '#32231d', '#423024', '#523e2c']);
const WR = RO(['#170f0d', '#261711', '#3b2115', '#55301a', '#6e4222']);
const WRV = RO(['#0c1517', '#18262a', '#2c3e40', '#43585a', '#5e7672']);
const WST = RO(['#0e1719', '#18262a', '#24363a', '#33494c', '#4a6262']);
const WYEL = RO(['#3a3010', '#54441a', '#7a6424', '#94782c', '#b09436']);
const SEAM = C('#0a1214');
const GRIME = [C('#0c1813'), C('#132218')];
const LAMP = C('#c8b46a');

export class RustPitStage extends StageBase {
  constructor(def) {
    super(def);
    const L = def?.left ?? -13, Rr = def?.right ?? 13;
    this.bounds = { left: L - 3, right: Rr + 3, bottom: -1.6, top: 13.4 };
    const t0 = performance.now();
    this.x0 = this.bounds.left - 1.5; this.x1 = this.bounds.right + 1.5;
    const T = [];
    const tm = (n, f) => { const a = performance.now(); f(); T.push(n + ' ' + (performance.now() - a).toFixed(0)); };
    tm('water', () => this.buildWater());
    tm('far', () => this.buildFar());
    tm('wall', () => this.buildWall());
    tm('floor', () => this.buildFloor());
    tm('fence', () => this.buildFence());
    tm('lamps', () => this.buildLamps());
    tm('front', () => this.buildFront());
    if (typeof location !== 'undefined' && location.search.includes('prof')) console.warn('[perf] ' + T.join(' | '));
    this.snow = new Snow({ seed: 3 });
    this.snowFront = new Snow({ seed: 9, tile: 512, bands: [{ p: 1.35, n: 7, col: '#8fc8c0', sz: 2, sp: 18, big: 0 }] });
    this.fish = new FishLayer({ count: 9, x0: -22, x1: 22, y0: 9.4, y1: 13.5, p: [0.12, 0.34], col: (p) => (p < 0.22 ? '#0f3e4a' : '#0c3442'), belly: (p) => (p < 0.22 ? '#155262' : '#124a58'), seed: 5 });
    this.ref = new Referee({ fogAmt: 0.34 });
    this.ref.x = -9.6; this.ref.home = -9.6; this.ref.range = 1.0; this.ref.y = 0.5;
    this.specs = [new Spectator('grouper', -5.6, 2.3, 1), new Spectator('tang', 4.8, 2.9, -1), new Spectator('crab', -4.7, 0.62, 1)];
    // pipe leaks: bubble streams + oil blobs
    for (const [x, y] of [[-4.2 * 0.88, 6.6], [10.6 * 0.88, 7.4], [6.3 * 0.88, 4.4]]) this.bub.emitter(x, y, 3.2, { p: WALL_P, spread: 0.05, top: 14, amp: 1 });
    this.oil = [];
    this.gear = 0; this.gearT = 0; this.needle = 0;
    this.sparkT = 2;
    this.lampSw = [0, 0, 0]; this.lampV = [0.2, -0.15, 0.1];
    this.chainsF = [{ x: -13.2, l: 1.8, a: 0, v: 0 }, { x: -8.8, l: 1.1, a: 0, v: 0 }, { x: 9.7, l: 2.2, a: 0, v: 0 }, { x: 14, l: 1.4, a: 0, v: 0 }];
    this.buildMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------ far water + rig silhouettes
  buildWater() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(14.6), H = AY(-2) - Y0;
    const P = new Pix(W, H);
    const stops = [[14.6, '#2a7f8c'], [13.2, '#22707e'], [12, '#1a6170'], [10.8, '#145262'], [9.6, '#104554'], [8.2, '#0d3946'], [6.5, '#0a2e3a'], [4.5, '#08242e'], [2, '#061a22'], [-2, '#05141b']];
    const cols = stops.map((s) => C(s[1]));
    for (let j = 0; j < H; j++) {
      const y = -(Y0 + j) / PPU;
      let k = 0; while (k < stops.length - 2 && y < stops[k + 1][0]) k++;
      const a = stops[k][0], b = stops[k + 1][0];
      const f = (a - y) / (a - b), th = (f - 0.6) / 0.4;
      if (th <= 0) P.d.fill(cols[k], j * W, j * W + W);
      else for (let i = 0; i < W; i++) P.d[j * W + i] = BY(i, j) < th ? cols[k + 1] : cols[k];
    }
    // faint caustic ripples near the top
    for (let j = 0; j < 70; j++) for (let i = 0; i < W; i++) {
      const v = Math.sin(i * 0.07 + Math.sin(j * 0.21 + i * 0.013) * 3) + Math.sin(i * 0.031 - j * 0.12);
      if (v > 1.55 && BY(i, j) < 0.5 - j / 140) P.d[j * W + i] = C('#3a92a0');
    }
    this.water = new Layer(P, X0, Y0, 0.06, 0.2);
    this.shafts = shaftLayer(W, AY(4.5) - Y0, X0, Y0, { n: 4, seed: 4, col: C('#3a8f9a'), frames: 2, dir: 0.8, amp: 0.85 });
  }
  buildFar() {
    // distant rig legs: cross-braced trusses
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(14.6), H = AY(4) - Y0;
    const P = new Pix(W, H);
    const col = C('#0c3846'), lit = C('#11485a'), dk = C('#0a2f3b');
    const leg = (xw, w) => {
      const x = AX(xw) - X0;
      for (const ox of [0, w]) { P.rect(x + ox - 3, 0, 7, H, col); P.vl(x + ox - 3, 0, H, lit); }
      for (let y = 0; y < H; y += 60) { P.tline(x, y, x + w, y + 60, 3, col); P.tline(x + w, y, x, y + 60, 3, dk); P.rect(x - 3, y, w + 7, 4, col); P.hl(x - 3, x + w + 3, y, lit); }
    };
    leg(-14, 90); leg(-1.5, 70); leg(11, 100);
    // deck beams at the top
    P.rect(0, 18, W, 10, col); P.hl(0, W, 18, lit); P.rect(0, 60, W, 5, dk);
    for (let x = 0; x < W; x += 34) P.tline(x, 28, x + 17, 60, 2, dk);
    // dangling chains & cables
    const r = rng(8);
    for (let k = 0; k < 7; k++) { const x = Math.floor(r() * W), L = 60 + Math.floor(r() * 140); for (let y = 28; y < 28 + L; y += 3) P.rect(x + ((y / 3) & 1), y, 1, 2, lit); }
    sagLine(P, 40, 70, 420, 90, 40, dk); sagLine(P, W - 500, 66, W - 80, 80, 55, dk);
    this.far = new Layer(P, X0, Y0, 0.22, 0.4);
    // mid structure: broken girders and pipe bundles above the torn wall
    const Q = new Pix(W, AY(5) - Y0);
    const mc = C('#0d3c49'), ml = C('#185666'), md = C('#09303b');
    const girder = (x0, y0, x1, y1, w) => {
      Q.tline(x0, y0, x1, y1, w, mc); Q.line(x0, y0 - (w >> 1), x1, y1 - (w >> 1), ml);
      const n = Math.hypot(x1 - x0, y1 - y0) / 18;
      for (let i = 0; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; Q.set(x, y, md); Q.set(x + 1, y, md); }
    };
    const cx = AX(0) - X0;
    girder(cx - 560, 160, cx + 120, 40, 12); girder(cx + 60, 30, cx + 520, 190, 9);
    girder(cx - 340, 250, cx - 80, 110, 6);
    for (let k = 0; k < 3; k++) { const y = 70 + k * 12; Q.rect(cx + 180, y, 700, 9, mc); Q.hl(cx + 180, cx + 880, y, ml); Q.hl(cx + 180, cx + 880, y + 8, md); }
    for (let x = cx + 200; x < cx + 880; x += 70) Q.rect(x, 66, 5, 42, md);
    for (let k = 0; k < 4; k++) { const x = cx - 380 + k * 230; for (let y = 0; y < 120 + k * 40; y += 3) Q.rect(x + ((y / 3) & 1), y, 2, 2, ml); }
    // a hanging car tyre and an old buoy
    Q.ring(cx - 230, 290, 7, 14, md); Q.ring(cx - 230, 290, 12, 14, ml);
    for (let y = 120; y < 276; y += 3) Q.rect(cx - 230, y, 1, 2, ml);
    this.mid = new Layer(Q, X0, Y0, 0.45, 0.65);
  }

  // ------------------------------------------------------------------ the bulkhead wall
  wallTop(x) {
    const ax = Math.abs(x);
    if (ax > 5.4) return 13.6;
    const k = Math.min(1, ((5.4 - ax) / 5.4) * 1.9);
    const step = Math.round(x * 4);
    return 13.6 - k * 4.3 + Math.sin(x * 2.3) * 0.18 - hh(step, 0, 5) * 0.42 * k + (hh(step >> 1, 1, 5) < 0.2 ? 0.5 * k : 0);
  }
  buildWall() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(13.6), Yb = AY(WALL_BASE), H = Yb - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0, ly = (yw) => AY(yw) - Y0;
    // plates
    const sk = ly(2.35);
    rustPlates(P, 0, 0, W, sk, { pw: 88, ph: 66, paint: WP, paint2: RO(['#121e22', '#19292c', '#213437', '#2b4141', '#38514c']), rust: WR, rivet: WRV, seam: SEAM, rustAmt: 0.45, seed: 21, primer: C('#4a2a1e') });
    // lower skirt: red oxide plates + hazard stripe
    rustPlates(P, 0, sk, W, H - sk, { pw: 64, ph: 34, paint: WP2, rust: WR, rivet: WRV, seam: SEAM, rustAmt: 0.55, seed: 33, grime: GRIME, grimeH: 30, stagger: true });
    hazard(P, 0, sk - 13, W, 12, { yel: WYEL, blk: C('#141414'), per: 18, wear: 0.55, seed: 4, rust: WR });
    P.hl(0, W, sk - 14, SEAM); P.hl(0, W, sk - 1, SEAM); P.hl(0, W, sk, WP2[4]);
    // painted "PIT 9" stencil + small text
    this.stencil(P, lx(0), ly(5.4));
    // I-beam ribs
    for (const xw of [-14.6, -9.0, -3.5, 3.5, 9.0, 14.6]) this.rib(P, lx(xw), 0, H);
    // posters & signs (faded into the wall)
    const fade = (x, y, w, h, k = 0.42) => P.map(x - 1, y - 2, w + 2, h + 4, (c) => mixU(c, C('#20343a'), k));
    const poster = (xw, yw, w, h, o) => { luchaPoster(P, lx(xw), ly(yw), w, h, o); fade(lx(xw), ly(yw), w, h); };
    poster(-12.9, 5.9, 30, 44, { bg: C('#5a2622'), bg2: C('#44201c'), mask: C('#8a7432'), mask2: C('#2a3a6a'), title: 'LUCHA', sub: 'HOY' });
    poster(-12.0, 5.3, 26, 38, { bg: C('#24405a'), mask: C('#7a3a3a'), mask2: C('#7a6a2a'), title: 'PIT 9', sub: '' });
    poster(4.4, 5.3, 30, 44, { bg: C('#3a4a26'), mask: C('#7a2a5a'), mask2: C('#8a7a3a'), title: 'BRUTUS', sub: 'VS' });
    poster(5.25, 4.7, 26, 38, { bg: C('#4a2a4a'), mask: C('#2a6a5a'), mask2: C('#8a3a2a'), title: 'JIM', sub: '' });
    const cards = ['calavera', 'camaron', 'luna', 'nopal', 'sirena', 'corazon'];
    for (let k = 0; k < 4; k++) { const x = lx(10.9) + (k % 2) * 17, y = ly(5.6) + (k > 1 ? 30 : 0) + (k % 2) * 2; loteria(P, x, y, 15, 26, cards[k], [14, 7, 2, 31][k]); fade(x, y, 15, 26, 0.38); }
    // graffiti: a marigold + "VIVA EL POZO", tally marks of past fights, a little candle shrine
    this.graffiti(P, lx(-1.0), ly(2.72));
    for (let k = 0; k < 6; k++) { const x0 = lx(8.0) + k * 9, y0 = ly(3.9); for (let i = 0; i < 4; i++) P.vl(x0 + i * 2, y0 + (i % 2), y0 + 9, C('#4a5a56')); P.line(x0 - 1, y0 + 7, x0 + 8, y0 + 2, C('#4a5a56')); }
    this.shrine(P, lx(13.4), ly(3.4));
    // ladder bolted to the wall
    for (const xx of [lx(-14.05), lx(-14.05) + 14]) { P.rect(xx, ly(12.6), 3, ly(2.6) - ly(12.6), WST[2]); P.vl(xx, ly(12.6), ly(2.6), WST[3]); }
    for (let y = ly(12.4); y < ly(2.7); y += 11) { P.rect(lx(-14.05) + 3, y, 11, 2, WST[3]); P.hl(lx(-14.05) + 3, lx(-14.05) + 13, y + 2, SEAM); }
    this.dangerSign(P, lx(-1.6), ly(7.9));
    this.dangerSign(P, lx(12.2), ly(3.2), 'NO NADAR');
    // pipes
    this.pipes(P, lx, ly, W);
    // pump engine (static parts)
    this.engine(P, lx, ly);
    // portholes (holes show the far water through)
    this.portholes = [];
    for (const [xw, yw] of [[-11.8, 10.4], [-6.6, 9.9], [6.6, 9.9], [11.8, 10.4]]) this.porthole(P, lx(xw), ly(yw), 25);
    // cables drooping between the ribs
    sagLine(P, lx(-14.6) + 13, ly(8.9), lx(-9) - 13, ly(8.6), 22, C('#0a1012'));
    sagLine(P, lx(-14.6) + 13, ly(8.7), lx(-9) - 13, ly(8.4), 30, C('#2a2018'));
    sagLine(P, lx(9) + 13, ly(9.2), lx(14.6) - 13, ly(9.0), 26, C('#0a1012'));
    sagLine(P, lx(3.5) + 13, ly(8.1), lx(9) - 13, ly(8.4), 18, C('#1a2a20'));
    // algae, kelp tufts and barnacles at the base and on the ribs
    const r = rng(17);
    for (let i = 0; i < 70; i++) { const x = Math.floor(r() * W), h = 10 + Math.floor(r() * 34); kelp(P, x, H - 1, h, RO(['#0c1a12', '#11261a', '#1a3a22', '#245030', '#2e6238']), { seed: i, w: 2 + (i % 2) }); }
    for (let i = 0; i < 90; i++) { const x = Math.floor(r() * W), y = H - 2 - Math.floor(r() * r() * 70); barnacle(P, x, y, 2 + Math.floor(r() * 3), [C('#1e2a2a'), C('#3e4c48'), C('#5c6a62'), C('#0a1010')]); }
    // seaweed strands hanging from the big pipe
    for (let i = 0; i < 26; i++) { const x = Math.floor(r() * W), L = 6 + Math.floor(r() * 26), y0 = ly(6.6) + 15; for (let j = 0; j < L; j++) P.set(x + Math.round(Math.sin(j * 0.3 + i) * 1.2), y0 + j, j > L - 3 ? C('#28502e') : C('#1c3a22')); }
    // torn top edge
    this.tear(P, X0, Y0, W, H);
    // lamp light baked on the wall (warm dithered pools under the lamps)
    for (const xw of [-7.2, 7.2]) this.wallLight(P, lx(xw), ly(8.7), H);
    // ambient occlusion at the floor line + a touch of fog
    P.map(0, H - 26, W, 26, (c, x, y) => (BY(x, y) < (y - (H - 26)) / 30 ? mixU(c, C('#050b0d'), 0.45) : undefined));
    P.mixAll(FOG, 0.12);
    const vg = C('#061418');
    P.map(0, 0, W, H, (c, x, y) => {
      const yw = -(Y0 + y) / PPU, xw = Math.abs((X0 + x) / PPU);
      const k = clamp((yw - 8.2) / 4.5, 0, 1) * 0.75 + clamp((xw - 9.5) / 6, 0, 1) * 0.6;
      if (k <= 0) return undefined;
      return BY(x, y) < k ? mixU(c, vg, 0.38) : (BY(x, y) < k * 1.6 ? mixU(c, vg, 0.18) : undefined);
    });
    this.wallP = P;
    this.wall = new Layer(P, X0, Y0, WALL_P, 1);
    this.wallX0 = X0; this.wallY0 = Y0;
  }
  stencil(P, cx, y) {
    const sc = 7, str = 'PIT 9', w = textW(str, 5, sc, 1);
    const nf = noiseField(w + 4, 7 * sc + 4, 1 / 9, 41, 2, 2);
    const paint = C('#8a8670'), paint2 = C('#6e6c5c');
    text(P, str, cx, y, (x, yy) => {
      const n = nf[(clamp(yy - y, 0, 7 * sc + 3)) * (w + 4) + clamp(x - (cx - w / 2), 0, w + 3)];
      if (n > 0.64) return undefined;
      return n > 0.56 ? WR[2] : hh(x, yy, 3) < 0.1 ? paint2 : paint;
    }, { sc, align: 'center' });
    // paint drips
    for (let k = 0; k < 14; k++) { const x = Math.round(cx - w / 2 + hh(k, 2, 9) * w), L = 3 + Math.floor(hh(k, 3, 9) * 14); if (P.get(x, y + 7 * sc - 1) === paint) for (let j = 0; j < L; j++) P.set(x, y + 7 * sc + j, paint2); }
    text(P, 'POZO DE COMBATE', cx, y + 7 * sc + 8, C('#4a5048'), { font: 3, align: 'center', sp: 2 });
  }
  rib(P, x, y0, H) {
    const w = 26;
    for (let y = y0; y < H; y++) for (let i = 0; i < w; i++) {
      const fl = i < 5 || i >= w - 5;
      let t = fl ? (i === 0 ? 1 : i === 1 ? 4 : i < 4 ? 3 : 2) : (i === 5 || i === w - 6 ? 0 : i < 8 ? 1 : 1);
      if (i >= w - 5) t = i === w - 1 ? 0 : i === w - 5 ? 3 : 2;
      let c = WST[t];
      const n = hh(x + i, y >> 2, 7);
      if (hh(i >> 1, y >> 3, x) < 0.18 + (y / H) * 0.15) c = WR[t >= 2 ? 2 : 1];
      if (n < 0.02) c = WR[3];
      P.seti(x + i, y, c);
    }
    for (let y = y0 + 6; y < H; y += 9) { rivet(P, x + 2, y, WRV); rivet(P, x + w - 4, y, WRV); }
    // horizontal stiffener plates
    for (let y = y0 + 40; y < H - 10; y += 132) { P.rect(x + 5, y, w - 10, 4, WST[2]); P.hl(x + 5, x + w - 6, y, WST[4]); P.hl(x + 5, x + w - 6, y + 3, WST[0]); }
    // shadow cast on the wall to the right
    for (let y = y0; y < H; y++) for (let i = 0; i < 4; i++) { const xx = x + w + i; if (BY(xx, y) < 0.75 - i * 0.2) { const c = P.get(xx, y); if (c) P.seti(xx, y, mixU(c, C('#03080a'), 0.45)); } }
    // barnacle clusters
    for (let k = 0; k < 5; k++) barnacle(P, x + 4 + Math.floor(hh(k, 1, x) * 18), H - 30 - Math.floor(hh(k, 2, x) * 120), 2 + (k % 2), [C('#1e2a2a'), C('#3e4c48'), C('#5c6a62'), C('#0a1010')]);
  }
  graffiti(P, x, y) {
    const pet = [C('#7a5426'), C('#8a6230'), C('#5e3e1e')], ctr = C('#5a3a1a'), stem = C('#2e4a2a');
    const fx = x + 8, fy = y - 18;
    P.vl(fx, fy + 6, y, stem); P.line(fx, y - 6, fx - 6, y - 10, stem); P.line(fx - 6, y - 10, fx - 9, y - 9, stem);
    for (let k = 0; k < 14; k++) { const a = k * TAU / 14, rr = 5 + (k % 2) * 2; P.disc(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr * 0.9, 2.2, pet[k % 3]); }
    P.disc(fx, fy, 3, ctr);
    text(P, '¡VIVA EL', x + 20, y - 24, (xx, yy) => (hh(xx, yy, 2) < 0.2 ? undefined : C('#5a6a62')), { font: 3 });
    text(P, 'POZO!', x + 20, y - 16, (xx, yy) => (hh(xx, yy, 3) < 0.2 ? undefined : C('#6a4a3a')), { font: 5 });
  }
  shrine(P, x, y) {
    const wd = RO(['#140c08', '#22140c', '#341e12', '#4a2c1a', '#5e3a22']);
    P.rect(x - 2, y, 40, 4, wd[2]); P.hl(x - 2, x + 37, y, wd[4]); P.hl(x - 2, x + 37, y + 3, wd[0]);
    P.rect(x + 1, y + 4, 3, 6, wd[1]); P.rect(x + 32, y + 4, 3, 6, wd[1]);
    // framed picture + tiny marigold garland
    P.rect(x + 11, y - 22, 14, 18, wd[3]); P.rect(x + 13, y - 20, 10, 14, C('#3a4a5a')); P.disc(x + 18, y - 15, 3, C('#8a7a5a')); P.rect(x + 15, y - 11, 6, 5, C('#5a3a4a'));
    for (let i = 0; i < 9; i++) P.set(x + 10 + i * 2, y - 23 + Math.round(Math.sin(i * 0.7) * 1.5), i % 2 ? C('#9a6a20') : C('#a8502a'));
    // candles (flames are animated separately)
    this.candles = [];
    for (const [cx, h] of [[x + 3, 7], [x + 7, 10], [x + 28, 9], [x + 33, 6]]) { P.rect(cx, y - h, 3, h, C('#a89a78')); P.vl(cx, y - h, y - 1, C('#c8b890')); P.set(cx + 1, y - h - 1, C('#1a1410')); this.candles.push([cx + 1, y - h - 2]); }
  }
  dangerSign(P, x, y, str = '¡PELIGRO!') {
    const w = textW(str, 3, 1, 1) + 10, h = 19;
    P.rect(x - 1, y - 1, w + 2, h + 2, SEAM);
    P.rect(x, y, w, h, C('#8a7a3a'));
    P.rect(x, y, w, 7, C('#6a2a22'));
    text(P, 'DANGER', x + w / 2, y + 1, C('#c8b890'), { font: 3, align: 'center' });
    text(P, str, x + w / 2, y + 10, C('#1a1612'), { font: 3, align: 'center' });
    P.map(x, y, w, h, (c, xx, yy) => (hh(xx, yy, 5) < 0.12 ? WR[2] : hh(xx >> 2, yy >> 2, 6) < 0.15 ? mixU(c, WR[1], 0.5) : undefined));
    bolt(P, x + 2, y + 2, WRV); bolt(P, x + w - 3, y + 2, WRV);
  }
  pipes(P, lx, ly, W) {
    const pr = RO(['#141c1e', '#1f2b2c', '#2c3c3a', '#3e5048', '#56685a']);
    const pr2 = RO(['#1c1410', '#2c1e16', '#40291a', '#563822', '#6e4a2c']);
    const rustTex = (rmp, seed) => (x, y, t) => {
      const n = hh(x >> 2, y >> 2, seed);
      if (n < 0.14) return WR[Math.max(1, t - 1)];
      if (hh(x, y, seed) < 0.04) return rmp[Math.max(0, t - 1)];
      return rmp[t];
    };
    // big main pipe
    const yA = ly(6.95);
    pipeH(P, 0, yA, W, 30, pr, { tex: rustTex(pr, 3), ol: SEAM });
    for (let x = 30; x < W; x += 150) { flangeOnH(P, x, yA, 30, pr, 6); for (let j = 0; j < 4; j++) bolt(P, x + 3, yA - 3 + j * 12, WRV); }
    // brackets bolting the pipe to the wall
    for (let x = 100; x < W; x += 300) { P.rect(x, yA + 30, 12, 9, WST[1]); P.hl(x, x + 11, yA + 30, WST[3]); bolt(P, x + 3, yA + 34, WRV); bolt(P, x + 8, yA + 34, WRV); }
    // second smaller pipe
    const yB = ly(7.75);
    pipeH(P, 0, yB, W, 16, pr2, { tex: rustTex(pr2, 5), ol: SEAM });
    for (let x = 80; x < W; x += 190) flangeOnH(P, x, yB, 16, pr2, 4);
    // thin conduit
    pipeH(P, 0, ly(8.15), W, 5, WST, { ol: SEAM });
    // vertical drops into the floor
    for (const xw of [-8.4, 6.35, 13.1]) {
      const x = lx(xw), w = xw === 13.1 ? 14 : 20;
      pipeV(P, x - w / 2, yA + 28, w, P.h - yA - 28, pr, { tex: rustTex(pr, 9), ol: SEAM });
      for (let y = yA + 60; y < P.h - 20; y += 110) flangeOnV(P, x - w / 2, y, w, pr, 5);
      // elbow
      P.disc(x, yA + 26, w / 2 + 3, pr[2]); P.hl(x - w / 2 - 2, x + w / 2 + 2, yA + 22, pr[4]);
    }
    // valve wheel
    const vx = lx(2.1), vy = yA - 22;
    P.rect(vx - 2, vy, 5, 22, pr[1]); P.vl(vx - 2, vy, vy + 22, pr[3]);
    const red = RO(['#2a0e0c', '#3e1612', '#5a221a', '#743022', '#8a4430']);
    P.ring(vx + 0.5, vy + 0.5, 9, 12, (x, y, nx, ny) => (nx + ny < -0.4 ? red[4] : nx + ny > 0.6 ? red[1] : red[2]));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + 0.3; P.line(vx - Math.cos(a) * 9, vy - Math.sin(a) * 9, vx + Math.cos(a) * 9, vy + Math.sin(a) * 9, red[2]); }
    P.disc(vx + 0.5, vy + 0.5, 3, red[3]); P.set(vx - 1, vy - 1, red[4]);
    // gauge on the second pipe
    const gx = lx(-10.6), gy = yB - 10;
    P.disc(gx, gy, 8, WST[1]); P.disc(gx, gy, 6.5, C('#8a8a76')); P.line(gx, gy, gx + 4, gy - 3, C('#3a0a0a')); P.set(gx - 3, gy - 2, C('#b0b098'));
  }
  engine(P, lx, ly) {
    const st = RO(['#10181a', '#1c2a2c', '#2a3c3c', '#3c5250', '#526a62']);
    const gr = RO(['#141a12', '#1e2a1a', '#2c3c24', '#3c502e', '#4e663a']);
    const x0 = lx(-7.0), x1 = lx(-2.6), yb = P.h;
    // plinth
    P.rect(x0 - 6, yb - 20, x1 - x0 + 16, 20, st[1]); P.hl(x0 - 6, x1 + 10, yb - 20, st[3]); P.hl(x0 - 6, x1 + 10, yb - 19, st[2]);
    for (let x = x0; x < x1; x += 22) bolt(P, x, yb - 14, WRV);
    // motor housing (horizontal drum painted green)
    const my = ly(3.25), mh = 64;
    pipeH(P, x0, my, x1 - x0 - 30, mh, gr, { tex: (x, y, t) => (((x - x0) % 6 === 0 && y > my + 4 && y < my + mh - 4) ? gr[Math.max(0, t - 2)] : hh(x >> 2, y >> 2, 4) < 0.16 ? WR[Math.max(1, t - 1)] : gr[t]), ol: SEAM });
    // end caps
    for (const ex of [x0 - 8, x1 - 36]) { pipeV(P, ex, my - 6, 9, mh + 12, st, { ol: SEAM }); for (let j = 0; j < 5; j++) bolt(P, ex + 4, my - 2 + j * 16, WRV); }
    // feet
    P.rect(x0 + 6, my + mh, 12, yb - 20 - my - mh, st[1]); P.rect(x1 - 60, my + mh, 12, yb - 20 - my - mh, st[1]);
    // warning plate
    P.rect(x0 + 40, my + 16, 50, 20, C('#6a6040')); P.rect(x0 + 41, my + 17, 48, 6, C('#5a1e1a'));
    text(P, 'NO TOCAR', x0 + 65, my + 26, C('#1a1612'), { font: 3, align: 'center' });
    text(P, 'BOMBA', x0 + 65, my + 17, C('#a89878'), { font: 3, align: 'center' });
    // exhaust stack up into the wall
    pipeV(P, x0 + 20, ly(6.6), 12, my - ly(6.6), st, { ol: SEAM });
    flangeOnV(P, x0 + 20, my - 12, 12, st, 4);
    // pulley on the motor shaft + belt to the gear (gear drawn animated)
    this.gearPos = { x: -2.95, y: 3.0 };
    const gx = lx(this.gearPos.x), gy = ly(this.gearPos.y);
    const px = x1 - 30, py = my + mh / 2;
    P.disc(px, py, 9, st[2]); P.disc(px, py, 3, st[0]);
    P.line(px, py - 9, gx, gy - 42, C('#0a0c0c')); P.line(px, py + 9, gx, gy + 42, C('#0a0c0c'));
    P.line(px, py - 8, gx, gy - 41, C('#1a1c1a'));
    // support pillar for the gear axle
    P.rect(gx - 5, gy, 10, yb - gy - 20, st[1]); P.vl(gx - 5, gy, yb - 21, st[3]);
    this.gaugePos = { x: -6.2, y: 4.0 };
    const ggx = lx(this.gaugePos.x), ggy = ly(this.gaugePos.y);
    P.rect(ggx - 1, ggy, 3, my - ggy, st[1]);
    P.disc(ggx + 0.5, ggy + 0.5, 9, st[1]); P.disc(ggx + 0.5, ggy + 0.5, 7, C('#8e8c78'));
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.8 + k * 0.233); P.set(ggx + Math.cos(a) * 5.5, ggy + Math.sin(a) * 5.5, C('#2a2620')); }
    P.set(ggx + 4, ggy - 3, C('#8a1a1a')); P.set(ggx + 5, ggy - 2, C('#8a1a1a'));
    // oil puddle drips
    for (let k = 0; k < 6; k++) { const x = x0 + 10 + Math.floor(hh(k, 1, 3) * (x1 - x0 - 60)); for (let j = 0; j < 4 + k; j++) P.set(x, my + mh + j, C('#0a0806')); }
    // gear sprites (animated, 7 frames = one tooth step)
    this.gearFrames = [];
    const teeth = 14;
    for (let f = 0; f < 7; f++) {
      const G = new Pix(100, 100), a0 = (f / 7) * (TAU / teeth);
      const gc = RO(['#16100c', '#28180e', '#3e2614', '#56361c', '#6e4a26']);
      G.ell(50, 50, 46, 46, (x, y, nx, ny, q) => {
        const a = Math.atan2(ny, nx) - a0, rr = Math.sqrt(q) * 46;
        const tooth = ((a / TAU) * teeth % 1 + 1) % 1 < 0.5;
        if (rr > 40 && !tooth) return undefined;
        if (rr < 6) return gc[0];
        if (rr < 9) return gc[3];
        const spoke = Math.abs(((((a + a0) / TAU) * 5 + 0.0) % 1 + 1) % 1 - 0.5) > 0.4 || Math.abs(((((Math.atan2(ny, nx) - a0) / TAU) * 5) % 1 + 1) % 1 - 0.5) > 0.42;
        if (rr > 16 && rr < 31 && !spoke) return undefined;
        const lit = -nx - ny;
        let t = rr > 31 ? (lit > 0.6 ? 4 : lit > 0 ? 3 : lit > -0.6 ? 2 : 1) : (lit > 0.3 ? 3 : 2);
        if (rr > 30 && rr < 32) t = 1;
        if (hh(Math.round(x / 3), Math.round(y / 3), 6) < 0.18) t = Math.max(0, t - 1);
        return gc[t];
      });
      G.outline(SEAM);
      G.mixAll(FOG, 0.26);
      this.gearFrames.push(G.canvas());
    }
  }
  porthole(P, cx, cy, r) {
    const rim = RO(['#0e1618', '#1c2a2c', '#2c3e3e', '#40564e', '#5a7064']);
    P.disc(cx, cy, r + 2, SEAM);
    P.ring(cx, cy, r - 7, r, (x, y, nx, ny) => { const l = -nx - ny; return l > 0.9 ? rim[4] : l > 0.2 ? rim[3] : l > -0.5 ? rim[2] : rim[1]; });
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.2; bolt(P, cx + Math.cos(a) * (r - 3.5), cy + Math.sin(a) * (r - 3.5), rim); }
    // hole (transparent) with a cross bar
    P.disc(cx, cy, r - 7, 0);
    P.rect(cx - (r - 7), cy - 1, (r - 7) * 2, 3, rim[1]); P.hl(cx - (r - 7), cx + r - 7, cy - 1, rim[3]);
    // glass glints (flat)
    P.line(cx - 10, cy - 4, cx - 5, cy - 9, C('#5aa8b0')); P.line(cx - 8, cy - 2, cx - 6, cy - 4, C('#5aa8b0'));
    this.portholes.push({ cx, cy, r });
  }
  tear(P, X0, Y0, W, H) {
    const edge = new Int16Array(W);
    for (let i = 0; i < W; i++) edge[i] = Math.round(AY(this.wallTop((X0 + i) / PPU)) - Y0);
    // smooth single-pixel noise, keep jagged steps
    for (let i = 0; i < W; i++) {
      const e = edge[i];
      if (e <= 0) continue;
      for (let y = 0; y < Math.min(H, e); y++) P.d[y * W + i] = 0;
      // torn plate thickness: lit lip + dark underside
      P.seti(i, e, WP[4]); P.seti(i, e + 1, WP[3]);
      if (hh(i, 1, 7) < 0.5) P.seti(i, e + 2, WR[2]);
      P.seti(i, e + 3, WR[1]);
    }
    // bent spikes and curled plate shards along the tear
    const r = rng(23);
    for (let k = 0; k < 26; k++) {
      const i = Math.floor(r() * W), e = edge[i];
      if (e <= 4) continue;
      const L = 6 + Math.floor(r() * 18), dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < L; j++) { const x = i + Math.round(dir * j * 0.35 + Math.sin(j * 0.3) * 2), y = e - j; P.seti(x, y, j === L - 1 ? WR[3] : WP[2]); P.seti(x + 1, y, WR[1]); P.seti(x - 1, y, WP[3]); }
    }
    // a few rips through the plates below the edge
    for (let k = 0; k < 7; k++) {
      const i = Math.floor(r() * W), e = edge[i];
      if (e <= 10) continue;
      const cy = e + 16 + Math.floor(r() * 30), rw = 4 + Math.floor(r() * 9), rh = 3 + Math.floor(r() * 5);
      P.ell(i, cy, rw, rh, (x, y, nx, ny, q) => (q > 0.65 ? (ny < 0 ? WR[1] : WP[4]) : 0));
    }
    this.edge = edge;
  }
  wallLight(P, cx, ly0, H) {
    const lit = (c, k) => mixU(c, LAMP, k);
    for (let y = ly0; y < H; y++) {
      const t = (y - ly0) / (H - ly0);
      const hw = 16 + t * 120;
      for (let x = Math.floor(cx - hw - 8); x < cx + hw + 8; x++) {
        if (x < 0 || x >= P.w) continue;
        const e = Math.abs(x - cx) / hw;
        const i = y * P.w + x, c = P.d[i];
        if (!c) continue;
        const a = e < 0.55 ? 0.95 : e < 1 ? 0.5 : 0.12;
        if (BY(x, y) < a * (1 - t * 0.35)) P.d[i] = lit(c, e < 0.55 ? 0.16 : 0.1);
      }
    }
  }

  // ------------------------------------------------------------------ floor (perspective steel deck)
  buildFloor() {
    const K = 1222, PW = 88, PD = 30;
    const st = RO(['#141c1e', '#1e2a2c', '#2b3a3a', '#3a4c48', '#4c605a']);
    const nfW = AX(this.x1 + 3) - AX(this.x0 - 3);
    const X0 = AX(this.x0 - 3);
    const ring = (u, v) => { const nx = u / 290, ny = (v - 1214) / 142; return Math.abs(Math.hypot(nx, ny) - 1); };
    const F = new PerspFloor(this.x0 - 3, this.x1 + 3, WALL_BASE, -1.72, WALL_P, 1.22, K, (u, v, du, dv, X, Y, p, j) => {
      const col = Math.floor(u / PW), row = Math.floor(v / PD);
      const off = (row & 1) * (PW / 2);
      const cu = Math.floor((u + off) / PW), cn = Math.floor((u + off + du) / PW);
      const rn = Math.floor((v + dv) / PD);
      const pu = ((u + off) % PW + PW) % PW, pv = ((v % PD) + PD) % PD;
      const ps = hh(cu, row, 3);
      const n = vnoise(u * 0.022, v * 0.03, 61) * 0.65 + vnoise(u * 0.08, v * 0.11, 62) * 0.35;
      let t = ps < 0.3 ? 1 : 2;
      if (pv < dv * 1.5 + 1) t = 3;
      let c = st[t];
      // diamond tread on some plates
      if (ps > 0.62 && (Math.floor(u / 4) + Math.floor(v / 4)) % 3 === 0) c = st[t + 1 > 4 ? 4 : t + 1];
      // rust creeping from the seams, faint oil sheen, scuffs in the middle
      const e = Math.min(pu, PW - pu) / 10 + Math.min(pv, PD - pv) / 5;
      if (n > 0.72 || (e < 0.45 && n > 0.56)) c = n > 0.8 ? WR[2] : WR[1];
      else if (n > 0.64 || (e < 0.6 && n > 0.5)) c = st[Math.max(0, t - 1)];
      if (n < 0.26) c = (hh(Math.floor(u / 3), Math.floor(v / 2), 1) < 0.25) ? C('#2c3a44') : st[Math.max(0, t - 1)];
      if (Math.abs(u) < 300 && hh(Math.floor(u / 2), Math.floor(v), 4) < 0.035) c = st[4];
      // painted fight ring (worn)
      const rd = ring(u, v);
      if (rd < 0.022 * (1 + (1 - p) * 0.4) && hh(Math.floor(u / 6), Math.floor(v / 6), 7) > 0.22) c = n > 0.6 ? C('#6a5a34') : C('#8a7c4a');
      // seams + rivets at plate corners
      if (cu !== cn || rn !== row) c = SEAM;
      else if ((pu < 4 || pu > PW - 5) && pv > 2 && pv < 5) c = (hh(cu, row, 9) < 0.7) ? st[4] : c;
      // drains
      if (Math.abs(u) > 470 && Math.abs(u) < 540 && v > 1100 && v < 1190) c = (Math.floor(u / 5) % 2 === 0 && Math.floor(v / 9) % 2 === 0) ? C('#060908') : st[1];
      // depth shading: back rows foggier, very front darker
      if (p < 0.99) c = mixU(c, C('#081a1e'), (1 - p) * 2.2);
      if (p > 1.14 && BY(X, Y) < (p - 1.14) * 9) c = mixU(c, C('#03080a'), 0.5);
      return c;
    });
    // contact shadow where the wall meets the floor
    for (let j = 0; j < 6; j++) F.P.map(0, j, F.W, 1, (c, x, y) => (BY(x, y) < 0.8 - j * 0.13 ? mixU(c, C('#030608'), 0.6) : undefined));
    this.floor = F.finish();
  }

  // ------------------------------------------------------------------ fence on the back of the floor
  buildFence() {
    const p = this.floor.pAt(0.45);
    this.fenceP = p;
    const X0 = AX(this.x0 - 1), W = AX(this.x1 + 1) - X0, top = AY(2.45), bot = AY(0.45), H = bot - top + 2;
    const P = new Pix(W, H);
    chainLink(P, 0, 6, W, H - 8, { wire: C('#2c3c40'), wire2: C('#1e2a2e'), s: 6, tears: true, seed: 5 });
    // posts + rails
    const post = RO(['#121a1c', '#1c282a', '#2a3a3a', '#3c4e4a', '#4e625a']);
    for (let x = 30; x < W; x += 150) { pipeV(P, x, 0, 6, H, post, { ol: SEAM }); P.rect(x - 1, 0, 8, 2, post[3]); }
    pipeH(P, 0, 4, W, 4, post, { ol: SEAM }); pipeH(P, 0, H - 6, W, 3, post, { ol: SEAM });
    // barbed wire coil on top
    for (let x = 0; x < W; x++) { const y = 1 + Math.round(Math.sin(x * 0.5) * 2); if (x % 3) P.seti(x, y, C('#3a4644')); if (x % 9 === 0) { P.seti(x, y - 1, C('#4a5654')); P.seti(x, y + 1, C('#4a5654')); } }
    // a sagging torn section and a sign
    P.rect(AX(1.0) - X0, 10, 60, 30, 0);
    for (let k = 0; k < 9; k++) P.line(AX(1.0) - X0 + k * 7, 10, AX(1.0) - X0 + k * 7 + 3, 16 + (k % 3) * 4, C('#2c3c40'));
    const sx = AX(-9.3) - X0;
    P.rect(sx, 16, 40, 18, C('#5a5232')); P.rect(sx, 16, 40, 1, C('#6a6040')); text(P, 'NO PASAR', sx + 20, 22, C('#1a1612'), { font: 3, align: 'center' });
    // algae on the bottom rail
    for (let x = 0; x < W; x++) if (hh(x, 2, 4) < 0.4) for (let j = 0; j < 1 + Math.floor(hh(x, 3, 4) * 5); j++) P.seti(x, H - 4 - j, j > 2 ? C('#1e3a22') : C('#16301c'));
    P.mixAll(FOG, 0.18);
    this.fence = new Layer(P, X0, top, p, 1);
  }

  // ------------------------------------------------------------------ lamps
  buildLamps() {
    // cage lamp sprite
    const L = new Pix(18, 20);
    const st = PAL.steel, yel = C('#f0e0a0'), yel2 = C('#c8b070');
    L.rect(5, 0, 8, 4, st[2]); L.hl(5, 12, 0, st[3]);
    L.ell(9, 11, 7, 7, (x, y, nx, ny, q) => (q > 0.65 ? undefined : ny < -0.2 ? yel : yel2));
    for (let x = 2; x <= 16; x += 4) L.vl(x, 4, 17, st[1]);
    L.hl(2, 16, 4, st[3]); L.hl(2, 16, 10, st[2]); L.hl(3, 15, 17, st[1]);
    L.set(7, 8, C('#ffffff')); L.set(8, 8, C('#fff8e0'));
    L.outline(C('#0a1012'));
    this.lampCv = L.canvas();
    const Loff = L.clone(); Loff.map(0, 0, 18, 20, (c) => (c === yel || c === yel2 || c === C('#ffffff') || c === C('#fff8e0') ? C('#3a3a30') : undefined));
    this.lampOff = Loff.canvas();
    // cone frames for small swing angles
    this.cones = [];
    const len = AY(WALL_BASE) - AY(8.5) + 8;
    for (let k = -2; k <= 2; k++) { const c = coneSprite(len + 30, 12, 230, k * 0.04, C('#a8a070'), [0.12, 0.25], { floorY: len, fade: 0.8 }); this.cones.push({ cv: c.canvas(), ax: c.ax }); }
    this.lamps = [{ x: -7.2, y: 8.7, top: 13.6 }, { x: 7.2, y: 8.7, top: 13.6 }];
    // big cool shaft of daylight falling through the torn roof onto the ring (2 shimmer frames)
    const top = AY(10.8), fl = AY(0.25) - top, rays = [[-60, 34, 110, 0.25, 0.8]];
    this.godray = [0, 1].map((f) => {
      const P = new Pix(900, fl + 12);
      for (const [x, w0, w1, a, k] of rays) {
        const c = coneSprite(fl + 6, w0, w1, a, C('#4e9ea4'), [(0.035 + f * 0.01) * k, (0.075 - f * 0.01) * k], { floorY: fl, fade: 0.7 });
        P.blit(c, 300 + x - c.ax, 0);
      }
      return { cv: P.canvas(), ax: 300 };
    });
  }

  // ------------------------------------------------------------------ foreground silhouettes
  buildFront() {
    const ink = C('#040b0e'), ink2 = C('#08161b');
    const X0 = AX(this.x0 - 4), W = AX(this.x1 + 4) - X0, Y0 = AY(-0.55), H = AY(-2.2) - Y0;
    const P = new Pix(W, H);
    // big pipe elbow + valve silhouette at the bottom left, kelp at the bottom right, rubble
    const lx = (xw) => AX(xw) - X0;
    P.rect(0, 30, lx(-12), 40, ink); P.disc(lx(-12), 60, 30, ink); P.rect(lx(-12) - 30, 60, 60, H, ink);
    P.hl(0, lx(-12), 30, ink2); P.rect(lx(-17), 24, 10, 50, ink2);
    for (let x = lx(-11); x < lx(-4); x += 6) { const h = 8 + Math.floor(hh(x, 1, 3) * 18); P.rect(x, H - h, 7, h, ink); }
    for (let i = 0; i < 14; i++) kelp(P, lx(9.5) + i * 9 + Math.floor(hh(i, 2, 3) * 6), H - 1, 30 + Math.floor(hh(i, 3, 3) * 34), [ink, ink, ink, ink, ink], { seed: i, w: 3 });
    for (let x = lx(2); x < lx(7); x += 5) { const h = 4 + Math.floor(hh(x, 4, 3) * 10); P.rect(x, H - h, 5, h, ink); }
    P.rect(lx(15), 10, 30, H, ink); P.rect(lx(14.6), 6, 48, 6, ink2);
    this.front = new Layer(P, X0, Y0, 1.25, 1);
  }

  // ------------------------------------------------------------------ platforms (catwalks + crane)
  catwalkSprite(w) {
    const key = 'cw' + w;
    return this.spr(key, () => {
      const top = 46, deckH = 16, legH = AX(2.6) - deckH;
      const H = top + deckH + legH, W = w + 2, P = new Pix(W, H);
      const yel = RO(['#3a2a0c', '#5a4414', '#8a6a1e', '#b8902a', '#d8b040']);
      const st = PAL.steel, ru = PAL.rust;
      const chip = (c, x, y) => (hh(x >> 1, y >> 1, 4) < 0.18 ? ru[hh(x, y, 2) < 0.5 ? 1 : 2] : c);
      // support legs (I-beams) with X bracing
      const legX = [14, w - 22];
      for (const lx of legX) {
        for (let y = top + deckH; y < H; y++) for (let i = 0; i < 9; i++) P.seti(lx + i, y, chip(st[i === 0 ? 1 : i === 1 ? 3 : i > 6 ? 1 : 2], lx + i, y));
        for (let y = top + deckH + 6; y < H - 4; y += 10) rivet(P, lx + 3, y, st);
        P.rect(lx - 4, H - 4, 17, 4, st[1]); P.hl(lx - 4, lx + 12, H - 4, st[3]);
        for (let j = 0; j < 12; j++) for (let i = 0; i < 17; i++) if (hh(lx + i, j, 5) < 0.3 - j * 0.02) P.seti(lx - 4 + i, H - 5 - j, PAL.algae[2 + (j < 3 ? 1 : 0)]);
      }
      const bx0 = legX[0] + 9, bx1 = legX[1];
      for (let k = 0; k < 2; k++) {
        const y0 = top + deckH + 6 + k * (legH / 2), y1 = y0 + legH / 2 - 10;
        P.tline(bx0, y0, bx1, y1, 3, st[1]); P.tline(bx0, y1, bx1, y0, 3, st[2]);
        P.line(bx0, y0 - 1, bx1, y1 - 1, st[3]);
      }
      // under-deck truss
      for (let x = 2; x < w - 8; x += 16) { P.line(x, top + deckH, x + 8, top + deckH + 10, st[2]); P.line(x + 8, top + deckH + 10, x + 16, top + deckH, st[2]); }
      P.hl(2, w - 2, top + deckH + 10, st[1]);
      // deck: top lip, grating face, C-channel
      P.rect(0, top, W, 3, st[3]); P.hl(0, W - 1, top, st[4]);
      grating(P, 0, top + 3, W, 7, st[2], C('#0a0e10'), { sx: 3, sy: 3, hw: 2, hh: 1, stagger: true });
      for (let x = 0; x < W; x++) { P.seti(x, top + 10, chip(st[1], x, top + 10)); P.seti(x, top + 11, chip(st[2], x, 11)); P.seti(x, top + 12, chip(st[2], x, 12)); P.seti(x, top + 13, st[1]); P.seti(x, top + 14, st[0]); }
      for (let x = 6; x < W; x += 12) rivet(P, x, top + 11, st);
      // railing (behind the walker)
      for (let x = 3; x < W - 2; x += 36) { for (let y = 2; y < top; y++) { P.seti(x, y, chip(yel[3], x, y)); P.seti(x + 1, y, chip(yel[2], x, y)); P.seti(x + 2, y, yel[1]); } }
      P.seti(W - 4, 2, yel[3]);
      for (let y = 2; y < top; y++) { P.seti(W - 4, y, chip(yel[3], W - 4, y)); P.seti(W - 3, y, yel[1]); }
      for (const [ry, th] of [[1, 4], [22, 3]]) for (let x = 0; x < W; x++) for (let j = 0; j < th; j++) P.seti(x, ry + j, chip(yel[j === 0 ? 4 : j === th - 1 ? 1 : 3], x, ry + j));
      P.rect(0, top - 4, W, 3, st[2]); P.hl(0, W - 1, top - 4, st[3]);
      // hanging sign and a dangling chain
      const sx = Math.round(w * 0.45);
      P.rect(sx, 26, 30, 14, C('#c8a038')); P.rect(sx, 26, 30, 1, C('#e8c058')); P.rect(sx, 39, 30, 1, C('#7a5a1a'));
      text(P, 'CUIDADO', sx + 15, 30, C('#1a1408'), { font: 3, align: 'center' });
      chainV(P, Math.round(w * 0.75), top + deckH, top + deckH + 26, st);
      P.outline(C('#070b0d'));
      return { cv: P.canvas(), top };
    });
  }
  craneSprites() {
    return this.spr('crane', () => {
      const st = PAL.steel, yel = RO(['#3a2a0c', '#5a4414', '#8a6a1e', '#b8902a', '#d8b040']);
      // platform with slings and hook block (anchor: platform top-left)
      const pw = AX(2.5), slingH = 70, H = slingH + 30, P = new Pix(pw + 2, H);
      const y0 = slingH;
      P.rect(0, y0, pw + 2, 4, st[3]); P.hl(0, pw + 1, y0, st[4]);
      for (let x = 0; x < pw + 2; x++) for (let j = 4; j < 12; j++) P.seti(x, y0 + j, j === 11 ? st[0] : j < 6 ? st[2] : (hh(x >> 1, j, 3) < 0.2 ? PAL.rust[2] : st[1]));
      hazard(P, 0, y0 + 4, 14, 7, { per: 6, seed: 2 }); hazard(P, pw - 12, y0 + 4, 14, 7, { per: 6, seed: 3 });
      for (let x = 18; x < pw - 14; x += 10) rivet(P, x, y0 + 7, st);
      // lifting lugs + slings
      const hx = (pw + 2) / 2;
      for (const lx of [10, pw - 8]) { P.rect(lx - 2, y0 - 4, 5, 4, st[2]); P.line(lx, y0 - 4, hx, 20, C('#1a1e20')); P.line(lx + 1, y0 - 4, hx + 1, 20, C('#3a4044')); }
      // hook block
      P.rect(hx - 7, 2, 15, 16, yel[2]); P.rect(hx - 7, 2, 15, 2, yel[4]); P.vl(hx - 7, 2, 17, yel[3]); P.vl(hx + 7, 2, 17, yel[1]);
      P.disc(hx + 0.5, 9, 4, st[1]); P.disc(hx + 0.5, 9, 1.5, st[3]);
      P.ring(hx + 0.5, 23, 3, 5, st[3]); P.rect(hx - 5, 18, 3, 5, 0);
      P.outline(C('#070b0d'));
      // trolley
      const T = new Pix(56, 28);
      T.rect(4, 8, 48, 16, yel[2]); T.rect(4, 8, 48, 2, yel[4]); T.hl(4, 51, 23, yel[0]);
      for (let x = 8; x < 50; x += 8) T.vl(x, 11, 21, yel[1]);
      for (const wx of [10, 44]) { T.disc(wx, 5, 5, st[2]); T.disc(wx, 5, 2, st[0]); T.set(wx - 2, 2, st[4]); }
      T.rect(22, 24, 12, 4, st[2]);
      text(T, '5T', 28, 13, C('#1a1408'), { font: 3, align: 'center' });
      T.outline(C('#070b0d'));
      const Tb = [T.clone(), T.clone()];
      Tb[0].rect(46, 11, 3, 3, C('#ff4030')); Tb[1].rect(46, 11, 3, 3, C('#5a1a14'));
      // rail I-beam spanning the pit
      const RW = AX(16), Rl = new Pix(RW, 20);
      for (let x = 0; x < RW; x++) {
        Rl.seti(x, 0, st[4]); Rl.seti(x, 1, st[3]); Rl.seti(x, 2, st[2]); Rl.seti(x, 3, st[1]);
        for (let j = 4; j < 13; j++) Rl.seti(x, j, hh(x >> 2, j >> 2, 8) < 0.2 ? PAL.rust[1] : st[1]);
        Rl.seti(x, 13, st[3]); Rl.seti(x, 14, st[2]); Rl.seti(x, 15, st[0]);
      }
      for (let x = 6; x < RW; x += 14) rivet(Rl, x, 7, st);
      for (let x = 30; x < RW; x += 200) { Rl.rect(x, 4, 4, 9, st[2]); }
      Rl.outline(C('#070b0d'));
      return { plat: P.canvas(), platH: y0, trolley: Tb.map((b) => b.canvas()), rail: Rl.canvas() };
    });
  }
  drawPlat(d, pl, t) {
    const g = d.g;
    if (pl.kind === 'catwalk') {
      const w = Math.round((pl.x1 - pl.x0) * PPU);
      const sp = this.catwalkSprite(w);
      g.drawImage(sp.cv, d.bx(pl.x0) - 1, d.by(pl.y) - sp.top);
      // ladder on the outer end
      const lx = pl.x0 < 0 ? d.bx(pl.x0) - 12 : d.bx(pl.x1) + 2;
      g.fillStyle = '#3a4048'; g.fillRect(lx, d.by(pl.y) - 30, 2, d.by(0) - d.by(pl.y) + 30); g.fillRect(lx + 9, d.by(pl.y) - 30, 2, d.by(0) - d.by(pl.y) + 30);
      g.fillStyle = '#5a6470'; for (let y = d.by(pl.y) - 24; y < d.by(0); y += 9) g.fillRect(lx + 2, y, 7, 2);
      return;
    }
    if (pl.kind === 'crane') {
      const C0 = this.craneSprites();
      const cx = (pl.x0 + pl.x1) / 2;
      // rail + trolley + cable
      g.drawImage(C0.rail, d.bx(-8) , d.by(10.6));
      const tx = d.bx(cx);
      g.drawImage(C0.trolley[Math.floor(t * 2) & 1], tx - 28, d.by(10.6) - 4);
      const top = d.by(10.6) + 24, bot = d.by(pl.y) - C0.platH + 2;
      g.fillStyle = '#121618'; g.fillRect(tx - 1, top, 3, bot - top);
      g.fillStyle = '#3a4246'; g.fillRect(tx - 1, top, 1, bot - top);
      g.drawImage(C0.plat, d.bx(pl.x0) - 1, d.by(pl.y) - C0.platH);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, s) {
    super.update(dt, s);
    this.fish.update(dt);
    this.ref.update(dt, s);
    for (const sp of this.specs) sp.update(dt);
    // broken pump: lurches one tooth, stalls, sparks
    this.gearT -= dt;
    if (this.gearT <= 0) { this.gear = (this.gear + 1) % 7; this.gearT = this.gear === 0 ? 1.4 + Math.random() * 2 : 0.07; }
    this.needle += ((Math.random() - 0.5) * 0.6 - this.needle * 0.5) * dt * 8;
    this.sparkT -= dt;
    if (this.sparkT <= 0) { this.sparkT = 2.5 + Math.random() * 4; const gp = this.gearPos; this.fx.burst('spark', gp.x * WALL_P + 0.6, gp.y + 0.5, 9, 3.5, { g: -5, life: 0.5, drag: 2, p: WALL_P }); }
    // oil blobs rising from the leak
    if (Math.random() < dt * 0.8) this.oil.push({ x: 6.35 + (Math.random() - 0.5) * 0.2, y: 4.6, v: 0.25 + Math.random() * 0.2, ph: Math.random() * 6 });
    for (let i = this.oil.length - 1; i >= 0; i--) { const o = this.oil[i]; o.y += o.v * dt; if (o.y > 13) this.oil.splice(i, 1); }
    for (let i = 0; i < 2; i++) { this.lampV[i] += (-this.lampSw[i] * 1.8 - this.lampV[i] * 0.15) * dt; this.lampSw[i] += this.lampV[i] * dt; }
    for (const c of this.chainsF) { c.v += (-c.a * 5 - c.v * 0.8) * dt + Math.sin(this.t * 0.7 + c.x) * 0.002; c.a += c.v * dt; }
  }
  drawBack(d, t) {
    const g = d.g;
    this.water.draw(d);
    const sf = this.shafts.frames[Math.floor(t * 0.7) % this.shafts.frames.length];
    drawAt(d, sf, this.shafts.X, this.shafts.Y - AY(PIV_Y) * (1 - 0.3) + AY(PIV_Y) * (1 - 0.3), 0.12, 0.3);
    this.fish.draw(d, t);
    this.far.draw(d);
    this.snow.draw(d, t * (this.dark > 0.5 ? 0.3 : 1));
    this.mid.draw(d);
    // bubble streams behind the wall (from the pipes up through the tear)
    this.wall.draw(d);
    // animated wall details: gear, gauge needle, oil blobs
    const gp = this.gearPos;
    drawAt(d, this.gearFrames[this.gear], AX(gp.x) - 50, AY(gp.y) - 50, WALL_P, 1);
    const gx = pbx(d, this.gaugePos.x, WALL_P), gy = pby(d, this.gaugePos.y, 1);
    g.fillStyle = '#5a0e0e';
    const na = -0.6 + this.needle;
    for (let k = 1; k <= 5; k++) g.fillRect(gx + Math.round(Math.cos(na) * k), gy + 1 - Math.round(Math.sin(na) * k * 0.9), 1, 1);
    g.fillStyle = '#100c08';
    for (const o of this.oil) g.fillRect(pbx(d, o.x + Math.sin(this.t * 1.5 + o.ph) * 0.05, WALL_P), pby(d, o.y, 1), 2, 2);
    // shrine candle flames (flat 2-frame flicker)
    if (this.candles) {
      const ox = Math.round(this.wallX0 + d.camAX * (1 - WALL_P)) - d.ax, oy = this.wallY0 - d.ay;
      this.candles.forEach(([cx, cy], i) => {
        if (this.dark > 0.4 && (Math.floor(t * 7) + i) % 3 === 0) return;
        const f = (Math.floor(t * 6 + i * 1.7) & 1);
        g.fillStyle = '#e8b040'; g.fillRect(ox + cx, oy + cy - 1, 1, 2 + f);
        g.fillStyle = '#fff0b0'; g.fillRect(ox + cx, oy + cy + 1, 1, 1);
        if (f) { g.fillStyle = '#c8602a'; g.fillRect(ox + cx + (i & 1 ? 1 : -1), oy + cy, 1, 1); }
      });
    }
    this.bub.draw(d, t, WALL_P - 0.01, WALL_P + 0.01);
    // lamps (swinging) + dithered cones
    this.lamps.forEach((L, i) => {
      const sw = this.lampSw[i] * (1 + this.dark), on = this.flick && !(this.dark > 0.3 && ((i + Math.floor(t * 9)) % 3 === 0));
      const k = clamp(Math.round(sw / 0.04), -2, 2) + 2;
      const lx = L.x + Math.sin(sw) * 0.8, ly = L.y;
      if (on) { const cn = this.cones[k]; drawAt(d, cn.cv, AX(lx) - cn.ax, AY(ly) - 4, WALL_P, 1); }
      // chain
      const x0 = pbx(d, L.x, WALL_P), y0 = pby(d, L.top, 1), x1 = pbx(d, lx, WALL_P), y1 = pby(d, ly, 1) - 10;
      g.fillStyle = '#1a2224';
      for (let y = y0; y < y1; y += 2) g.fillRect(Math.round(x0 + (x1 - x0) * ((y - y0) / (y1 - y0))), y, 1, 1 + ((y >> 1) & 1));
      g.drawImage(on ? this.lampCv : this.lampOff, x1 - 9, y1 - 2);
    });
    // floor + back-of-floor actors
    this.floor.draw(d);
    if (this.dark < 0.5) { const gr = this.godray[Math.floor(t * 1.3) & 1]; drawAt(d, gr.cv, AX(-2.6) - gr.ax, AY(10.8), 0.94, 1); }
    for (const sp of this.specs) if (sp.behind) sp.draw(d, t, this.fenceP - 0.02);
    this.ref.draw(d, t, this.fenceP - 0.01);
    this.fence.draw(d);
    for (const sp of this.specs) if (!sp.behind) sp.draw(d, t, this.fenceP + 0.01);
    if (this.dark > 0.02) d.dither('#02060a', this.dark * 0.8);
  }
  drawFront(d, t) {
    const g = d.g;
    this.front.draw(d);
    // hanging chains from the top edge (foreground, parallax 1.3)
    g.fillStyle = '#05101a';
    for (const c of this.chainsF) {
      const x0 = pbx(d, c.x, 1.3), y0 = pby(d, 13.8, 1), L = c.l * PPU;
      for (let k = 0; k < L; k += 4) { const x = Math.round(x0 + Math.sin(c.a) * k), y = y0 + k; if (y > d.vh) break; g.fillRect(x - ((k / 4) & 1), y, (k / 4) & 1 ? 3 : 1, 4); }
    }
    this.snowFront.draw(d, t, 'front');
  }
  onStageEvent(e) {
    if (e.t === 'hit' || e.t === 'ko' || e.t === 'roundWin' || e.t === 'round' || e.t === 'fight') { this.ref.react(e); for (const sp of this.specs) sp.react(e); }
    if (e.t === 'hit' && e.heavy) { for (let i = 0; i < 2; i++) this.lampV[i] += (Math.random() - 0.5) * 0.5; for (const c of this.chainsF) c.v += (Math.random() - 0.5) * 0.6; }
    if (e.t === 'slam' || e.t === 'flopLand' || e.t === 'ultFinal') { for (let i = 0; i < 2; i++) this.lampV[i] += (Math.random() - 0.5) * 1.2; for (const c of this.chainsF) c.v += (Math.random() - 0.5) * 1.5; }
  }
}
