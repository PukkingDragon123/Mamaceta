// SOGGY BOTTOM CANTINA: an underwater Mexican cantina. Adobe walls with talavera tiles and a wood
// wainscot, arched windows onto the kelp forest, saloon swing doors, a back bar full of bottles under a
// neon CANTINA sign, papel picado strings, tin star lanterns, a beamed ceiling, saltillo tile floor.
// Interactive: wooden bar counter (bartender behind it slides drinks), balcony, breakable tables with
// serape cloths, stools, wagon-wheel chandelier, star piñata, jukebox. Patrons cheer in the back.
import {
  Pix, Layer, PerspFloor, Snow, FishLayer, StageBase, coneSprite, rotPix, papelFlag,
  C, R, RO, PAL, AX, AY, PPU, PIV_Y, TAU, hh, ih, rng, BY, vnoise, noiseField, mixU, darkU, lightU, fogRamp,
  rivet, bolt, barnacle, chainV, sagLine, pipeH, pipeV, hazard, kelp, text, textW, luchaPoster, loteria, talavera, tiles,
  woodPlanks, pbx, pby, drawAt, clamp, EMBLEM_KEYS,
} from './common.js';
import { Bartender, Mechanic, Patron } from './npcs.js';

const WALL_P = 0.9, WALL_BASE = 0.85, CEIL_Y = 8.6;
const FOGC = C('#1a1e26');
// muted background ramps (warm interior)
const PLAS = RO(['#2a1a16', '#3a241c', '#4c3024', '#5e3e2c', '#6e4c34']);
const ADOBE = RO(['#22140e', '#321e14', '#46291a', '#583422', '#6a422a']);
const WD = RO(['#120a07', '#1e120b', '#2e1c11', '#402818', '#543620']);
const WDL = RO(['#24160e', '#342014', '#4a2e1c', '#5e3c24', '#744c2e']);
const TALA = { base: C('#8a8064'), base2: C('#746a52'), blue: C('#2a3868'), blue2: C('#465a8a'), yel: C('#9a7a34'), grn: C('#3a6a4a') };
const NEON_PINK = ['#ff5ab4', '#ff9ad0', '#a02a6a'], NEON_CYAN = ['#3af0d8', '#b0fff0', '#1a8a80'];

export class CantinaStage extends StageBase {
  constructor(def) {
    super(def);
    const L = def?.left ?? -12, Rr = def?.right ?? 12;
    this.bounds = { left: L - 3, right: Rr + 3, bottom: -1.6, top: 13 };
    this.x0 = this.bounds.left - 1.5; this.x1 = this.bounds.right + 1.5;
    const T = [];
    const tm = (n, f) => { const a = performance.now(); f(); T.push(n + ' ' + (performance.now() - a).toFixed(0)); };
    tm('sea', () => this.buildSea());
    tm('wall', () => this.buildWall());
    tm('ceil', () => this.buildCeiling());
    tm('floor', () => this.buildFloor());
    tm('deco', () => this.buildDeco());
    tm('front', () => this.buildFront());
    if (typeof location !== 'undefined' && location.search.includes('prof')) console.warn('[perf] ' + T.join(' | '));
    this.fish = new FishLayer({ count: 8, x0: -20, x1: 20, y0: 2.6, y1: 7.6, p: [0.2, 0.4], col: () => '#123e48', belly: () => '#1a5260', seed: 13, kinds: ['small', 'small', 'mid', 'mid', 'big', 'jelly', 'eel'] });
    this.snow = new Snow({ seed: 21, bands: [{ p: 0.6, n: 10, col: '#4a5a58', sz: 1, sp: 5 }, { p: 0.95, n: 12, col: '#6a7266', sz: 1, sp: 8 }] });
    this.bart = new Bartender({ x: def?.bartender?.x ?? 9.5, minX: 7.6, maxX: 11.4 });
    this.mech = new Mechanic(-4.3, 0.42, { face: 1 });
    this.pats = [
      new Patron('puffer', -7.9, 1.15, 1), new Patron('crab', -6.6, 0.68, -1), new Patron('guitar', -2.9, 0.62, 1),
      new Patron('lobster', 3.9, 0.6, 1), new Patron('seahorse', 5.0, 0.86, -1),
    ];
    this.doorA = 0; this.doorV = 0;
    this.neonT = 0; this.neonOn = 1;
    this.juke = 0; this.noteT = 0;
    this.shelfShake = 0;
    for (const [x, y] of [[-5.6 * 0.9, 1.1], [2.8 * 0.9, 1.1]]) this.bub.emitter(x, y, 0.5, { p: 0.9, spread: 0.6, top: 8.4 });
  }

  // ------------------------------------------------------------------ outside: sea + kelp forest
  buildSea() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(9), H = AY(0) - Y0;
    const P = new Pix(W, H);
    const stops = [[9, '#2a7a84'], [7.6, '#216a76'], [6.2, '#1a5866'], [4.8, '#154a58'], [3.4, '#113e4a'], [2, '#0d323e'], [0, '#0a2832']].map(([y, c]) => [y, C(c)]);
    for (let j = 0; j < H; j++) {
      const y = -(Y0 + j) / PPU;
      let k = 0; while (k < stops.length - 2 && y < stops[k + 1][0]) k++;
      const f = (stops[k][0] - y) / (stops[k][0] - stops[k + 1][0]), th = (f - 0.55) / 0.45;
      if (th <= 0) P.d.fill(stops[k][1], j * W, j * W + W); else for (let i = 0; i < W; i++) P.d[j * W + i] = BY(i, j) < th ? stops[k + 1][1] : stops[k][1];
    }
    // light rays
    for (let k = 0; k < 9; k++) { const x0 = Math.floor(hh(k, 1, 3) * W), w = 20 + hh(k, 2, 3) * 50; for (let j = 0; j < H; j++) { const cx = x0 + j * 0.35; for (let i = Math.floor(cx - w / 2); i < cx + w / 2; i++) if (i >= 0 && i < W && BY(i, j) < 0.18 * (1 - j / H)) P.d[j * W + i] = C('#3a8f98'); } }
    // far kelp forest + rocks (two depths)
    const r = rng(5);
    for (let i = 0; i < 34; i++) kelp(P, Math.floor(r() * W), H - 1, 60 + Math.floor(r() * 200), RO(['#0f3a40', '#0f3a40', '#12444a', '#155050', '#155050']), { seed: i, w: 3 });
    for (let x = 0; x < W; x += 2) { const h = 12 + Math.round(vnoise(x * 0.02, 0, 4) * 30); P.rect(x, H - h, 2, h, C('#0c2e36')); }
    for (let i = 0; i < 30; i++) kelp(P, Math.floor(r() * W), H - 1, 40 + Math.floor(r() * 150), RO(['#0c3236', '#0e383a', '#124444', '#185450', '#1e5e56']), { seed: i + 50, w: 4 });
    for (let x = 0; x < W; x += 2) { const h = 4 + Math.round(vnoise(x * 0.035, 3, 7) * 18); P.rect(x, H - h, 2, h, C('#0a262c')); }
    this.sea = new Layer(P, X0, Y0, 0.3, 0.5);
  }

  // ------------------------------------------------------------------ back wall
  buildWall() {
    const X0 = AX(this.x0), W = AX(this.x1) - X0, Y0 = AY(CEIL_Y), Yb = AY(WALL_BASE), H = Yb - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0, ly = (yw) => AY(yw) - Y0;
    this.wlx = lx; this.wly = ly; this.wX0 = X0; this.wY0 = Y0;
    // adobe plaster with cracks and fallen patches exposing bricks
    const nf = noiseField(W, H, 1 / 30, 7, 3, 4), nf2 = noiseField(W, H, 1 / 8, 8, 2, 3);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const idx = j * W + i, n = nf[idx], m = nf2[idx];
      let c;
      if (n > 0.71) {
        // bricks
        const row = Math.floor(j / 9), off = (row & 1) * 11, bx = (i + off) % 22, by = j % 9;
        c = by === 0 || bx === 0 ? ADOBE[0] : ADOBE[ih(Math.floor((i + off) / 22), row, 3) < 0.4 ? 2 : 3];
        if (by === 1 && bx > 0) c = ADOBE[4];
        if (n < 0.735) c = PLAS[0];
      } else {
        let t = 3;
        if (m > 0.7 && ih(i >> 1, j >> 1, 3) < 0.6) t = 4; else if (m < 0.3) t = 2;
        if (n > 0.67) t = 2;
        c = PLAS[t];
        if (ih(i, j, 2) < 0.04) c = PLAS[Math.max(0, t - 1)];
      }
      P.d[idx] = c;
    }
    // water stains running down from the ceiling
    for (let k = 0; k < 40; k++) { const x = Math.floor(hh(k, 3, 7) * W), L = 20 + Math.floor(hh(k, 4, 7) * 120), w = 1 + Math.floor(hh(k, 5, 7) * 4); P.map(x, 0, w, L, (c, xx, yy) => (BY(xx, yy) < 0.6 * (1 - yy / L) ? mixU(c, C('#1a1a16'), 0.35) : undefined)); }
    // cracks
    const cr = rng(19);
    for (let k = 0; k < 24; k++) { let x = cr() * W, y = cr() * H * 0.8, a = cr() * 6; const L = 10 + cr() * 40; for (let i = 0; i < L; i++) { P.set(x, y, PLAS[0]); P.set(x + 1, y, PLAS[4]); a += (cr() - 0.5) * 0.8; x += Math.cos(a); y += Math.abs(Math.sin(a)) + 0.3; } }
    // wainscot (vertical boards) + chair rail + talavera band
    const wy = ly(1.75);
    woodPlanks(P, 0, wy, W, H - wy, { dir: 'v', r: WDL, pw: 11, seed: 4, gap: WD[0], lenMin: 400, lenMax: 400, nails: false });
    P.rect(0, wy - 4, W, 4, WD[3]); P.hl(0, W - 1, wy - 4, WD[4]); P.hl(0, W - 1, wy - 1, WD[0]);
    const ty = ly(2.25);
    tiles(P, 0, ty, W, wy - 4 - ty, 11, C('#2a2620'), (Q, x, y, s, i, j) => talavera(Q, x, y, s, i, j, TALA));
    P.rect(0, ty - 3, W, 3, WD[3]); P.hl(0, W - 1, ty - 3, WD[4]);
    // baseboard grime + algae
    for (let i = 0; i < W; i++) { const h = Math.floor(hh(i, 1, 9) * 6 * hh(i >> 3, 2, 9)); for (let j = 0; j < h; j++) P.seti(i, H - 1 - j, PAL.algae[j > 2 ? 2 : 1]); }
    // arched windows + doorway (holes)
    this.windows = [];
    for (const xw of [-5.6, 2.8]) this.archWindow(P, lx(xw), ly(6.6), 80, 116);
    this.doorway(P, lx(-1.15), ly(4.7));
    // back bar: shelves, bottles, mirror, register
    this.backBar(P, lx, ly, W, H);
    // balcony back: a doorway with a curtain on the upper floor
    this.upstairs(P, lx, ly);
    // decorations on the plaster
    this.wallDeco(P, lx, ly);
    // vignette into the ceiling corner and AO at the floor line
    P.map(0, 0, W, H, (c, x, y) => {
      const k = clamp((14 - y) / 14, 0, 1) * 0.9 + clamp((y - (H - 20)) / 20, 0, 1) * 0.7;
      return k > 0 && BY(x, y) < k ? mixU(c, C('#0a0808'), 0.4) : undefined;
    });
    P.mixAll(FOGC, 0.1);
    this.wall = new Layer(P, X0, Y0, WALL_P, 1);
  }
  archWindow(P, cx, top, w, h) {
    const x0 = cx - w / 2;
    const inArch = (x, y, ww, hh2, t0) => { const r = ww / 2; if (y >= t0 + r) return x >= cx - r && x < cx + r && y < t0 + hh2; const dy = t0 + r - y, dx = x + 0.5 - cx; return dx * dx + dy * dy < r * r; };
    // deep adobe reveal + wooden frame
    for (let y = top - 8; y < top + h + 8; y++) for (let x = x0 - 8; x < x0 + w + 8; x++) {
      if (inArch(x, y, w + 16, h + 16, top - 8)) {
        const fr = !inArch(x, y, w + 4, h + 4, top - 2);
        P.seti(x, y, fr ? (inArch(x, y, w + 10, h + 10, top - 5) ? WDL[3] : PLAS[1]) : (inArch(x, y, w, h, top) ? 0 : WDL[1]));
      }
    }
    // sill
    P.rect(x0 - 10, top + h, w + 20, 6, WDL[3]); P.hl(x0 - 10, x0 + w + 9, top + h, WDL[4]); P.hl(x0 - 10, x0 + w + 9, top + h + 5, WD[0]);
    // wrought-iron grille with curls
    const iron = C('#141012');
    for (let x = x0 + 10; x < x0 + w; x += 15) for (let y = top; y < top + h; y++) if (inArch(x, y, w, h, top)) P.seti(x, y, iron);
    for (const y of [top + h * 0.45, top + h * 0.8]) P.hl(x0, x0 + w - 1, Math.round(y), iron);
    for (let x = x0 + 10; x < x0 + w - 10; x += 15) { const y = Math.round(top + h * 0.45); P.ring(x + 7.5, y - 5, 2.5, 3.5, iron); P.ring(x + 7.5, y + 5, 2.5, 3.5, iron); }
    // potted cactus on the sill
    const px = cx + w / 2 - 22, py = top + h;
    P.rect(px - 6, py - 9, 13, 9, C('#7a3a22')); P.hl(px - 7, px + 7, py - 10, C('#9a4a2a')); P.hl(px - 6, px + 6, py - 4, C('#2a4a8a'));
    P.ell(px, py - 18, 4, 9, (x, y, nx) => (nx < -0.3 ? C('#3a6a34') : C('#2a5226'))); P.ell(px - 6, py - 20, 2.5, 4, C('#2a5226')); P.ell(px + 6, py - 22, 2.5, 5, C('#2a5226'));
    P.set(px, py - 27, C('#c84a6a')); P.set(px + 1, py - 27, C('#e86a8a'));
    for (let k = 0; k < 8; k++) P.set(px - 3 + (k % 4) * 2, py - 24 + Math.floor(k / 4) * 8, C('#9ab08a'));
    this.windows.push({ cx, top, w, h });
  }
  doorway(P, cx, top) {
    const w = 104, h = AY(WALL_BASE) - AY(4.7) + 2, x0 = cx - w / 2;
    const r = w / 2;
    for (let y = top - 14; y < top + h; y++) for (let x = x0 - 14; x < x0 + w + 14; x++) {
      const dx = x + 0.5 - cx, dyA = top + r - y;
      const inside = (rr) => (y >= top + r ? Math.abs(dx) < rr : dx * dx + dyA * dyA < rr * rr);
      if (!inside(r + 14)) continue;
      if (inside(r)) P.seti(x, y, 0);
      else if (inside(r + 6)) P.seti(x, y, WDL[inside(r + 2) ? 2 : 3]);
      else P.seti(x, y, (Math.floor(Math.atan2(dyA, dx) * 6) & 1) && y < top + r ? ADOBE[3] : PLAS[2]);
    }
    // keystone + painted sign over the door
    P.rect(cx - 6, top - 16, 12, 10, ADOBE[4]); P.hl(cx - 6, cx + 5, top - 16, PLAS[4]);
    this.doorCx = cx; this.doorTop = top; this.doorW = w; this.doorH = h;
    // door leaves (animated) - louvered half doors
    this.doorLeaf = [];
    for (let k = 0; k < 4; k++) {
      const lw = 50 - k * 12, Q = new Pix(Math.max(6, lw), 44);
      if (lw <= 4) { this.doorLeaf.push(null); continue; }
      Q.rect(0, 0, lw, 44, WDL[2]);
      for (let y = 6; y < 38; y += 4) { Q.hl(2, lw - 3, y, WDL[4]); Q.hl(2, lw - 3, y + 1, WDL[1]); }
      Q.rect(0, 0, lw, 4, WDL[3]); Q.rect(0, 40, lw, 4, WDL[3]); Q.vl(0, 0, 43, WDL[4]); Q.vl(lw - 1, 0, 43, WD[0]);
      for (let x = 0; x < lw; x++) Q.seti(x, Math.round(2 - Math.sin((x / lw) * Math.PI) * 2), WDL[3]);
      Q.outline(C('#0a0605'));
      this.doorLeaf.push(Q.canvas());
    }
  }
  backBar(P, lx, ly, W, H) {
    const x0 = lx(5.6), x1 = W;
    // dark wood back panel
    woodPlanks(P, x0, ly(5.9), x1 - x0, ly(1.75) - ly(5.9), { dir: 'v', r: WD, pw: 14, seed: 12, gap: C('#0a0605'), lenMin: 400, lenMax: 400, nails: false });
    P.rect(x0 - 6, ly(5.9) - 8, x1 - x0 + 6, 8, WDL[3]); P.hl(x0 - 6, x1, ly(5.9) - 8, WDL[4]); P.hl(x0 - 6, x1, ly(5.9) - 1, WD[0]);
    for (let x = x0 - 6; x < x1; x += 7) P.rect(x, ly(5.9) - 4, 4, 3, WDL[2]);
    P.vl(x0 - 1, ly(5.9), ly(1.75), WD[0]); P.rect(x0 - 6, ly(5.9), 6, ly(1.75) - ly(5.9), WDL[2]); P.vl(x0 - 6, ly(5.9), ly(1.75), WDL[4]);
    // mirror
    const mx0 = lx(7.6), mx1 = lx(10.8), my0 = ly(3.9), my1 = ly(2.1);
    P.rect(mx0 - 5, my0 - 5, mx1 - mx0 + 10, my1 - my0 + 10, C('#6a5020')); P.rect(mx0 - 3, my0 - 3, mx1 - mx0 + 6, my1 - my0 + 6, C('#8a6a2a'));
    P.rect(mx0, my0, mx1 - mx0, my1 - my0, (x, y) => ((x - y) % 23 < 2 || (x - y) % 31 === 5 ? C('#3a4a52') : y < my0 + 10 ? C('#26343a') : C('#1e2a30')));
    text(P, 'DESDE 1962', (mx0 + mx1) / 2, my1 - 10, C('#5a6a6a'), { font: 3, align: 'center' });
    // shelves of bottles
    const bottleCols = ['#2a6a3a', '#6a3a1a', '#3a5a8a', '#8a2a2a', '#a88a3a', '#4a2a5a', '#2a5a5a', '#7a6a4a'];
    const shelf = (y, xa, xb, seed) => {
      P.rect(xa, y, xb - xa, 4, WDL[3]); P.hl(xa, xb - 1, y, WDL[4]); P.hl(xa, xb - 1, y + 3, WD[0]);
      for (let x = xa + 4; x < xb - 6;) {
        const k = Math.floor(ih(x, seed, 2) * 100), col = R(bottleCols[k % bottleCols.length], { spread: 0.1 });
        const tall = 14 + (k % 4) * 3, bw = 5 + (k % 3);
        if (k % 9 === 0) { // jar / mug
          P.rect(x, y - 9, 8, 9, C('#a89870')); P.hl(x, x + 7, y - 9, C('#c8b890')); P.rect(x + 2, y - 6, 4, 3, C('#6a3a2a')); x += 11; continue;
        }
        P.rect(x, y - tall + 6, bw, tall - 6, col[2]); P.rect(x + Math.floor(bw / 2) - 1, y - tall, 2, 7, col[2]); P.set(x + Math.floor(bw / 2) - 1, y - tall, col[4]);
        P.vl(x, y - tall + 6, y - 1, col[3]); P.vl(x + bw - 1, y - tall + 6, y - 1, col[0]);
        if (k % 2) P.rect(x, y - 9, bw, 4, C('#c8b890'));
        P.set(x + 1, y - tall + 8, C('#e8f0e8'));
        x += bw + 2 + (k % 3);
      }
    };
    shelf(ly(5.05), x0 + 4, mx0 - 10, 1); shelf(ly(5.05), mx1 + 10, x1, 2);
    shelf(ly(4.3), x0 + 4, x1, 3);
    shelf(ly(3.0), x0 + 4, mx0 - 10, 4); shelf(ly(3.0), mx1 + 10, x1, 5);
    // cash register on the back counter
    const rx = lx(12.6), ry = ly(2.0);
    P.rect(rx - 14, ry - 22, 28, 22, C('#6a5a30')); P.rect(rx - 12, ry - 20, 24, 8, C('#2a2a24')); P.rect(rx - 10, ry - 32, 20, 10, C('#7a6a3a'));
    for (let k = 0; k < 4; k++) P.rect(rx - 9 + k * 5, ry - 10, 3, 3, C('#d8c8a0'));
    text(P, '$', rx, ry - 31, C('#e8d070'), { font: 5, align: 'center' });
    // mounted marlin trophy above the bar
    const fx = lx(8.4), fy = ly(7.6);
    P.rect(fx - 4, fy - 8, 28, 16, WDL[3]);
    P.ell(fx + 10, fy, 26, 7, (x, y, nx, ny) => (ny < -0.3 ? C('#4a7a9a') : ny > 0.5 ? C('#8aa8b0') : C('#3a6a8a')));
    P.line(fx + 34, fy - 1, fx + 52, fy - 3, C('#3a5a6a')); P.poly([fx - 14, fy, fx - 26, fy - 12, fx - 24, fy, fx - 26, fy + 12], C('#3a6a8a'));
    P.poly([fx + 4, fy - 6, fx + 12, fy - 16, fx + 20, fy - 6], C('#2a5a7a')); P.set(fx + 26, fy - 2, C('#0a0a0a'));
    // string lights along the top of the back bar
    this.bulbs = [];
    for (let x = x0; x < x1; x += 12) this.bulbs.push([x, ly(6.0) + Math.round(Math.sin((x - x0) / 60 * Math.PI) * 6) + 2]);
    sagLine(P, x0, ly(6.0) + 2, x1, ly(6.0) + 2, 0, C('#0a0806'));
  }
  upstairs(P, lx, ly) {
    // doorway + curtain on the balcony level (left)
    const cx = lx(-11.4), top = ly(5.9), w = 54, bot = ly(3.1);
    P.rect(cx - w / 2 - 6, top - 6, w + 12, bot - top + 6, WDL[3]); P.hl(cx - w / 2 - 6, cx + w / 2 + 5, top - 6, WDL[4]);
    P.rect(cx - w / 2, top, w, bot - top, C('#0c0a0a'));
    // striped curtain
    const cols = [C('#7a2a2a'), C('#8a6a2a'), C('#2a5a4a'), C('#5a2a5a')];
    for (let x = 0; x < w; x++) for (let y = 0; y < bot - top; y++) { if (Math.abs(x - w / 2) < 6 + y * 0.12 && y > 10) continue; const c = cols[Math.floor(x / 6) % 4]; P.seti(cx - w / 2 + x, top + y, x % 6 === 0 ? darkU(c, 0.3) : c); }
    // little painted sign
    P.rect(cx - 20, top - 20, 40, 10, C('#5a4a2a')); text(P, 'CUARTOS', cx, top - 18, C('#c8b890'), { font: 3, align: 'center' });
  }
  wallDeco(P, lx, ly) {
    // lotería frames between the windows
    const kinds = ['gallo', 'sirena', 'estrella', 'corazon', 'nopal', 'luna', 'sol', 'calavera', 'camaron'];
    let k = 0;
    for (const [xw, yw] of [[-8.1, 6.2], [-7.5, 6.2], [0.8, 6.9], [4.6, 6.6], [5.2, 6.0]]) { const x = lx(xw), y = ly(yw); P.rect(x - 2, y - 2, 19, 30, WD[2]); loteria(P, x, y, 15, 26, kinds[k % kinds.length], [1, 13, 35, 27, 9, 18, 44, 14, 7][k]); P.map(x - 2, y - 2, 19, 30, (c) => mixU(c, FOGC, 0.3)); k++; }
    // guitar on the wall
    const gx = lx(-3.1), gy = ly(6.4);
    P.ell(gx, gy + 22, 10, 9, C('#7a4a22')); P.ell(gx, gy + 10, 7, 7, C('#7a4a22')); P.disc(gx, gy + 14, 3, C('#1a100a'));
    P.rect(gx - 2, gy - 18, 4, 24, C('#3a2210')); P.rect(gx - 3, gy - 24, 6, 7, C('#2a1a0c')); P.vl(gx, gy - 18, gy + 28, C('#a89870'));
    P.ell(gx, gy + 22, 10, 9, (x, y, nx, ny, q) => (q > 0.75 ? C('#5a3416') : undefined));
    // sombrero on a nail
    const sx = lx(4.4), sy = ly(5.1);
    P.ell(sx, sy, 22, 4, C('#8a6a34')); P.ell(sx, sy - 6, 8, 7, C('#8a6a34')); P.hl(sx - 8, sx + 8, sy - 2, C('#7a2a2a')); P.ell(sx, sy + 1, 22, 2, C('#6a4e24'));
    for (let i = -20; i < 21; i += 4) P.set(sx + i, sy + 2, C('#7a2a2a'));
    // ristra of chili peppers + maracas
    const rx = lx(-0.1), ry = ly(7.4);
    P.vl(rx, ry, ry + 40, C('#5a4a2a'));
    for (let j = 0; j < 9; j++) for (const s of [-1, 1]) P.ell(rx + s * 3, ry + 5 + j * 4, 2.2, 3, C(j % 3 ? '#8a2a1e' : '#a8361e'));
    for (const [mx, my, c] of [[lx(6.2), ly(7.2), '#8a6a2a'], [lx(6.5), ly(7.0), '#2a6a5a']]) { P.ell(mx, my, 5, 6, C(c)); P.rect(mx - 1, my + 5, 3, 10, C('#4a3018')); P.set(mx - 2, my - 3, C('#c8b890')); }
    // wanted poster
    const wx = lx(-9.6), wy = ly(7.6);
    P.rect(wx, wy, 26, 32, C('#8a7a58')); text(P, 'SE', wx + 13, wy + 2, C('#2a2018'), { font: 3, align: 'center' }); text(P, 'BUSCA', wx + 13, wy + 8, C('#2a2018'), { font: 3, align: 'center' });
    P.rect(wx + 6, wy + 15, 14, 11, C('#5a4a38')); P.disc(wx + 13, wy + 20, 4, C('#3a6a3a')); P.rect(wx + 9, wy + 18, 8, 2, C('#1a1a1a'));
    text(P, '$500', wx + 13, wy + 27, C('#5a1a10'), { font: 3, align: 'center' });
    // mermaid calendar
    const cx = lx(13.4), cy = ly(7.6);
    P.rect(cx, cy, 24, 34, C('#a89a78')); P.rect(cx + 2, cy + 2, 20, 18, C('#2a6a7a')); P.disc(cx + 12, cy + 8, 3, C('#d8a080')); P.rect(cx + 9, cy + 11, 6, 8, C('#3a9a7a')); P.rect(cx + 7, cy + 5, 10, 2, C('#c84a2a'));
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) P.set(cx + 3 + i * 3, cy + 24 + j * 3, C('#5a4a38'));
    // clock
    const kx = lx(-1.2), ky = ly(6.85);
    P.disc(kx, ky, 9, WD[3]); P.disc(kx, ky, 7, C('#c8b890')); P.line(kx, ky, kx, ky - 5, C('#1a1410')); P.line(kx, ky, kx + 4, ky + 1, C('#1a1410'));
    // a hanging fishing net in the corner with floats
    for (let j = 0; j < 30; j++) for (let i = 0; i < 40 - j; i++) if ((i + j) % 5 === 0 || (i - j + 100) % 5 === 0) P.seti(lx(-15.2) + i + j, 4 + j, C('#4a4030'));
    for (const [fx, fy] of [[lx(-14.6), 18], [lx(-13.9), 26]]) { P.disc(fx, fy, 3, C('#9a4a2a')); P.set(fx - 1, fy - 1, C('#c8704a')); }
  }

  // ------------------------------------------------------------------ ceiling (perspective beams)
  buildCeiling() {
    const K = 1300;
    const F = PerspFloor.band(this.x0 - 4, this.x1 + 4, 13.6, CEIL_Y, 1.16, WALL_P, K, (u, v, du, dv, X, Y, p) => {
      const pl = Math.floor(u / 26), pn = Math.floor((u + du) / 26);
      const vb = ((v % 150) + 150) % 150;
      let c;
      if (vb < 34) { // viga (beam) underside
        const t = vb < 3 ? 4 : vb > 30 ? 0 : vb < 10 ? 3 : 2;
        c = WDL[t];
        if (ih(Math.floor(u / 3), Math.floor(v / 6), 4) < 0.08) c = WDL[Math.max(0, t - 1)];
      } else {
        c = WD[(ih(pl, 0, 2) < 0.4 ? 1 : 2)];
        if (pl !== pn) c = C('#080504');
        if (ih(Math.floor(u / 2), Math.floor(v / 5), 3) < 0.05) c = WD[0];
      }
      if (p < 1) c = mixU(c, C('#0a0806'), (1 - p) * 3);
      return c;
    });
    this.ceil = F.finish();
  }

  // ------------------------------------------------------------------ floor (saltillo tiles)
  buildFloor() {
    const K = 1222, TS = 44, TD = 34;
    const terr = RO(['#3a1e14', '#52281a', '#6a3622', '#7e442a', '#905434']);
    const F = new PerspFloor(this.x0 - 3, this.x1 + 3, WALL_BASE, -1.72, WALL_P, 1.22, K, (u, v, du, dv, X, Y, p) => {
      const row = Math.floor(v / TD), off = (row & 1) * (TS / 2);
      const cu = Math.floor((u + off) / TS), cn = Math.floor((u + off + du) / TS), rn = Math.floor((v + dv) / TD);
      const ts = ih(cu, row, 5);
      const n = vnoise(u * 0.05, v * 0.06, 9);
      let t = ts < 0.25 ? 1 : ts > 0.8 ? 3 : 2;
      if (n > 0.66) t = Math.min(4, t + 1); else if (n < 0.3) t = Math.max(0, t - 1);
      let c = terr[t];
      const pv = ((v % TD) + TD) % TD;
      if (pv < dv * 1.2 + 1) c = terr[Math.min(4, t + 1)];
      if (ts > 0.94 && ih(Math.floor(u), Math.floor(v / 2), 3) < 0.12) c = terr[0]; // cracked tile
      if (cu !== cn || rn !== row) c = C('#2a2018');
      // sand drift near the back + under the bar
      const sand = vnoise(u * 0.012, v * 0.02, 3);
      if ((p < 0.95 && sand > 0.55 - (0.95 - p) * 4) || (u > 300 && sand > 0.72)) c = BY(X, Y) < 0.6 ? C('#5a5038') : C('#4a4230');
      if (p < 0.99) c = mixU(c, C('#120c0a'), (1 - p) * 2.6);
      if (p > 1.14 && BY(X, Y) < (p - 1.14) * 9) c = mixU(c, C('#0a0606'), 0.5);
      return c;
    });
    for (let j = 0; j < 6; j++) F.P.map(0, j, F.W, 1, (c, x, y) => (BY(x, y) < 0.8 - j * 0.13 ? mixU(c, C('#060404'), 0.6) : undefined));
    this.floor = F.finish();
  }

  // ------------------------------------------------------------------ decorations: papel picado, lanterns, neon, back tables
  buildDeco() {
    // papel picado flags
    const cols = ['#e83a6a', '#f0a030', '#3ac0e0', '#7ad04a', '#c070e0', '#f0e040', '#ff7040'];
    this.flags = cols.map((c, i) => [0, 1, 2, 3].map((v) => papelFlag(11, 13, mixU(C(c), FOGC, 0.3), v + i).canvas()));
    this.flagsF = cols.map((c, i) => [0, 1, 2, 3].map((v) => papelFlag(13, 15, mixU(C(c), C('#2a1a1a'), 0.15), v + i).canvas()));
    this.strings = [
      { p: 0.93, y0: 8.05, x0: -16, x1: 16, sag: 0.8 }, { p: 0.96, y0: 7.35, x0: -16, x1: 16, sag: 1.0 }, { p: 1.04, y0: 8.6, x0: -17, x1: 17, sag: 0.5, front: true },
    ].map((s, k) => {
      const pts = [], L = s.x1 - s.x0, cord = [];
      const yAt = (x) => { const t = (x - s.x0) / L; return s.y0 - Math.abs(Math.sin(t * Math.PI * 4)) * s.sag * 0.7; };
      for (let x = s.x0; x <= s.x1; x += 0.5) pts.push({ x, y: yAt(x), c: Math.floor(ih(Math.round(x * 10), k, 4) * cols.length), v: Math.floor(ih(Math.round(x * 10), k, 5) * 4), ph: x * 0.8 + k });
      // bake the cord
      const X0 = AX(s.x0), Y0 = AY(s.y0 + 0.1), Q = new Pix(AX(s.x1) - X0 + 2, AY(s.y0 - s.sag) - Y0 + 4);
      let px = null, py = null;
      for (let x = s.x0; x <= s.x1; x += 0.05) { const X = AX(x) - X0, Y = AY(yAt(x)) - Y0; if (px !== null) Q.line(px, py, X, Y, C('#2a2018')); px = X; py = Y; }
      return { ...s, pts, cord: new Layer(Q, X0, Y0, s.p, 1) };
    });
    // tin star lanterns (hojalata) with light
    const S = new Pix(22, 30), tin = RO(['#2a2418', '#4a4028', '#7a6a40', '#a89458', '#d8c078']);
    const star = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 4.5 : 10; star.push(11 + Math.cos(a) * rr, 16 + Math.sin(a) * rr); }
    S.poly(star, (x, y) => ((x + y) % 3 === 0 ? C('#f0d070') : (x < 11 ? tin[3] : tin[2])));
    S.disc(11, 16, 3, C('#fff0b0')); S.rect(10, 0, 2, 6, tin[1]); S.set(11, 6, tin[4]);
    S.outline(C('#0a0806'));
    this.lanternCv = S.canvas();
    const Soff = S.clone(); Soff.map(0, 0, 22, 30, (c) => (c === C('#f0d070') || c === C('#fff0b0') ? C('#4a4028') : undefined)); this.lanternOff = Soff.canvas();
    const len = AY(WALL_BASE) - AY(6.3);
    this.lanterns = [{ x: -7.4, y: 6.6 }, { x: 5.0, y: 6.4 }].map((L) => ({ ...L, cone: (() => { const c = coneSprite(len, 14, 120, 0, C('#b89458'), [0.07, 0.14], { floorY: len - 6, fade: 0.7 }); return { cv: c.canvas(), ax: c.ax }; })() }));
    // neon signs
    this.neon = this.neonSign();
    // back tables (patrons sit behind them) - drawn at the patrons' depth
    const T = new Pix(AX(this.x1) - AX(this.x0), 60), tX0 = AX(this.x0);
    const table = (xw, w, cloth) => {
      const x = AX(xw) - tX0, y = 22;
      T.rect(x - w / 2, y, w, 5, WDL[3]); T.hl(x - w / 2, x + w / 2 - 1, y, WDL[4]); T.hl(x - w / 2, x + w / 2 - 1, y + 4, WD[0]);
      if (cloth) for (let i = 0; i < w - 4; i++) for (let j = 0; j < 9 - (i % 3 === 0 ? 2 : 0); j++) T.seti(x - w / 2 + 2 + i, y + 5 + j, C(['#7a2a2a', '#8a6a2a', '#2a5a4a', '#4a2a5a'][Math.floor(j / 2.5) % 4]));
      T.rect(x - 2, y + 5, 4, 32, WD[3]); T.rect(x - 10, y + 34, 20, 3, WD[2]);
      // mugs and a candle in a bottle
      T.rect(x - 8, y - 7, 5, 7, C('#a88a40')); T.hl(x - 8, x - 4, y - 8, C('#e8e0c8'));
      T.rect(x + 4, y - 11, 4, 11, C('#2a5a3a')); T.rect(x + 5, y - 15, 2, 4, C('#e8dcc0'));
    };
    table(-7.2, 46, true); table(-3.4, 40, false); table(4.5, 46, true);
    T.outline(C('#0a0605'));
    T.mixAll(FOGC, 0.22);
    this.backTables = new Layer(T, tX0, AY(1.55), 0.93, 1);
  }
  neonSign() {
    const W = 150, H = 54;
    const mk = (on) => {
      const P = new Pix(W, H);
      // backing board
      P.rect(4, 6, W - 8, 32, C('#141016')); P.hl(4, W - 5, 6, C('#2a2430')); P.hl(4, W - 5, 37, C('#08060a'));
      bolt(P, 8, 10, PAL.steel); bolt(P, W - 9, 10, PAL.steel); bolt(P, 8, 33, PAL.steel); bolt(P, W - 9, 33, PAL.steel);
      P.vl(30, 0, 6, C('#1a1a1a')); P.vl(W - 30, 0, 6, C('#1a1a1a'));
      const [c, hl, rim] = (on ? NEON_PINK : ['#4a2a3a', '#5a3a4a', '#2a1a22']).map(C);
      text(P, 'CANTINA', W / 2, 13, c, { sc: 2, align: 'center', sp: 1, outline: rim });
      text(P, 'CANTINA', W / 2, 13, (x, y, gx, gy) => (gy === 0 ? hl : c), { sc: 2, align: 'center', sp: 1 });
      // neon cactus + arrow
      const [k1, k2, kr] = (on ? NEON_CYAN : ['#1a4a44', '#2a5a54', '#0e2a28']).map(C);
      const cx = 18;
      P.vl(cx, 40, 52, k1); P.vl(cx - 4, 44, 48, k1); P.hl(cx - 4, cx, 48, k1); P.vl(cx + 4, 42, 47, k1); P.hl(cx, cx + 4, 47, k1); P.hl(cx - 3, cx + 3, 52, k1);
      P.set(cx, 40, k2);
      text(P, 'SOGGY BOTTOM', W / 2 + 8, 43, k1, { font: 3, align: 'center', outline: kr });
      return P.canvas();
    };
    return { on: mk(true), off: mk(false), x: 9.2, y: 6.95 };
  }

  // ------------------------------------------------------------------ foreground
  buildFront() {
    const ink = C('#070406'), ink2 = C('#0e0a0a');
    const X0 = AX(this.x0 - 4), W = AX(this.x1 + 4) - X0, Y0 = AY(-0.35), H = AY(-2.2) - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0;
    // chair backs in the foreground (curved top rail + spindles)
    for (const xw of [-12.6, -4.8, 7.8]) {
      const x = lx(xw);
      P.rect(x, 4, 5, H, ink); P.rect(x + 41, 4, 5, H, ink);
      for (let i = 0; i < 46; i++) { const y = Math.round(2 - Math.sin((i / 45) * Math.PI) * 4); P.rect(x + i, y, 1, 7, ink); }
      for (let k = 1; k < 5; k++) { P.rect(x + k * 9, 9, 3, 18, ink); P.rect(x + k * 9 - 1, 14, 5, 3, ink2); }
      P.rect(x - 2, 27, 50, 5, ink);
    }
    // big potted agave
    const ax = lx(13.8);
    P.rect(ax - 26, 30, 52, H, ink); P.rect(ax - 30, 26, 60, 6, ink2);
    for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.32, L = 30 + (4 - Math.abs(k - 4)) * 8; P.tline(ax, 30, ax + Math.cos(a) * L, 30 + Math.sin(a) * L, 3, ink); }
    for (let k = 0; k < 5; k++) { const x = lx(-9) + k * 40; P.disc(x, H, 8 + (k % 3) * 3, ink); }
    this.front = new Layer(P, X0, Y0, 1.25, 1);
  }

  // ------------------------------------------------------------------ platforms
  counterSprite(x0, x1) {
    return this.spr('counter' + x0 + x1, () => {
      const w = Math.round((x1 - x0) * PPU) + 2, top = AY(0) - AY(1.2), H = top + 1, P = new Pix(w, H);
      const wd = PAL.wood, wl = PAL.woodL, br = PAL.brass;
      // front: talavera panels framed in wood
      woodPlanks(P, 0, 8, w, H - 8, { dir: 'v', r: wd, pw: 10, seed: 3, lenMin: 300, lenMax: 300, nails: false });
      for (let x = 10; x < w - 20; x += 66) {
        P.rect(x, 14, 56, H - 28, wd[0]);
        tiles(P, x + 2, 16, 52, H - 32, 13, C('#3a3028'), (Q, xx, yy, s, i, j) => talavera(Q, xx, yy, s, i, j, { base: C('#d8ccac'), base2: C('#bcae8c'), blue: C('#2a4aa0'), blue2: C('#5a7ad0'), yel: C('#d8a030'), grn: C('#3a8a5a') }));
        P.rect(x + 2, H - 18, 52, 2, wd[3]);
      }
      // pilasters
      for (let x = 2; x < w; x += 66) { P.rect(x, 8, 7, H - 8, wl[2]); P.vl(x, 8, H - 1, wl[4]); P.vl(x + 6, 8, H - 1, wd[1]); P.rect(x - 1, 10, 9, 3, wl[3]); }
      // counter top slab
      P.rect(0, 0, w, 9, wl[3]); P.hl(0, w - 1, 0, wl[4]); P.hl(0, w - 1, 1, PAL.woodP[3]); P.hl(0, w - 1, 7, wl[1]); P.hl(0, w - 1, 8, wd[0]);
      for (let x = 0; x < w; x += 3) if (ih(x, 1, 3) < 0.3) P.seti(x, 4, wl[2]);
      // brass foot rail
      const fy = H - 12;
      pipeH(P, 0, fy, w, 4, br, { ol: C('#2a1a08') });
      for (let x = 20; x < w; x += 80) { P.rect(x, fy - 6, 3, 6, br[2]); P.rect(x, fy + 4, 3, 8, br[1]); P.set(x, fy - 6, br[4]); }
      // kick plate
      P.rect(0, H - 4, w, 4, wd[0]);
      P.outline(PAL.ink);
      return { cv: P.canvas(), top };
    });
  }
  balconySprite(x0, x1) {
    return this.spr('balc' + x0 + x1, () => {
      const w = Math.round((x1 - x0) * PPU) + 2, railH = 40, slab = 12, H = railH + slab + 22, P = new Pix(w + 10, H);
      const wd = PAL.wood, wl = PAL.woodL;
      // balusters (turned spindles)
      for (let x = 4; x < w - 2; x += 10) for (let y = 6; y < railH; y++) {
        const t = (y - 6) / (railH - 6), bw = 2 + Math.round(Math.abs(Math.sin(t * Math.PI * 2)) * 2);
        for (let i = -bw; i <= bw; i++) P.seti(x + i, y, i === -bw ? wl[3] : i === bw ? wd[1] : wl[2]);
      }
      P.rect(0, 0, w, 6, wl[3]); P.hl(0, w - 1, 0, wl[4]); P.hl(0, w - 1, 5, wd[1]);
      P.rect(0, railH - 3, w, 3, wl[2]);
      // serape draped over the railing
      const sx = Math.round(w * 0.35), sw = 46, sc = ['#b8302a', '#e8a030', '#2a8a6a', '#e8e0c8', '#6a2a8a', '#e85a2a'];
      for (let i = 0; i < sw; i++) for (let j = 0; j < 30 + (i % 4 === 0 ? 3 : 0); j++) P.seti(sx + i, 2 + j, j > 28 ? C('#e8e0c8') : mixU(C(sc[Math.floor(j / 4) % sc.length]), C('#000000'), i < 3 || i > sw - 4 ? 0.3 : 0));
      // floor slab with beam ends
      P.rect(0, railH, w + 8, slab, wl[2]); P.hl(0, w + 7, railH, wl[4]); P.hl(0, w + 7, railH + slab - 1, wd[0]);
      for (let x = 6; x < w; x += 22) { P.rect(x, railH + slab, 8, 8, wd[2]); P.hl(x, x + 7, railH + slab, wd[3]); P.rect(x + 1, railH + slab + 8, 6, 4, wd[1]); }
      // hanging plant pot
      const px = Math.round(w * 0.78);
      P.rect(px - 6, railH + slab, 12, 9, C('#9a4a2a')); P.hl(px - 7, px + 6, railH + slab, C('#b85a32'));
      for (let k = 0; k < 6; k++) for (let j = 0; j < 6 + k * 2; j++) P.seti(px - 6 + k * 2 + Math.round(Math.sin(j * 0.5 + k)), railH + slab + 8 + j, C(j % 3 ? '#2a6a2a' : '#3a8a3a'));
      P.outline(PAL.ink);
      return { cv: P.canvas(), top: railH };
    });
  }
  tableSprite(w, broken) {
    return this.spr('table' + w + broken, () => {
      const top = AY(0) - AY(0.95), P = new Pix(w + 8, top + 4);
      const wd = PAL.wood, wl = PAL.woodL, sc = ['#b8302a', '#e8a030', '#2a8a6a', '#e8e0c8', '#c8407a', '#3a5ab0'];
      if (!broken) {
        // pedestal + feet
        P.rect(w / 2 + 1, 10, 6, top - 12, wd[2]); P.vl(w / 2 + 1, 10, top - 2, wl[3]);
        P.rect(w / 2 - 14, top - 3, 36, 4, wd[2]); P.hl(w / 2 - 14, w / 2 + 21, top - 3, wl[3]);
        // top slab
        P.rect(2, 0, w + 4, 6, wl[3]); P.hl(2, w + 5, 0, PAL.woodP[3]); P.hl(2, w + 5, 5, wd[1]);
        // serape cloth hanging over the front
        for (let i = 0; i < w - 6; i++) { const L = 16 + (i % 5 === 0 ? 2 : 0) + Math.round(Math.sin(i * 0.3) * 1.5); for (let j = 0; j < L; j++) P.seti(6 + i, 4 + j, j >= L - 2 ? C('#e8e0c8') : mixU(C(sc[Math.floor((j + Math.floor(i / 6) * 0) / 3) % sc.length]), C('#100808'), (i % 12 < 1 ? 0.25 : 0) + (j < 2 ? 0.2 : 0))); }
      } else {
        // two halves on the floor
        const half = (x0, ang, flip) => { for (let i = 0; i < w / 2; i++) { const yy = top - 6 + Math.round((flip ? w / 2 - i : i) * ang); for (let j = 0; j < 5; j++) P.seti(x0 + i, yy + j, j === 0 ? wl[4] : j === 4 ? wd[1] : wl[2]); } };
        half(0, 0.12, false); half(w / 2 + 6, 0.12, true);
        for (let i = 0; i < 24; i++) for (let j = 0; j < 4; j++) P.seti(w / 2 - 10 + i, top - 1 - j + Math.round(Math.sin(i * 0.5)), C(sc[(i >> 2) % sc.length]));
        P.rect(w / 2, top - 20, 5, 16, wd[2]);
      }
      P.outline(PAL.ink);
      return { cv: P.canvas(), top };
    });
  }
  drawPlat(d, pl, t) {
    const g = d.g;
    if (pl.kind === 'counter') { const sp = this.counterSprite(pl.x0, this.bounds.right + 1); g.drawImage(sp.cv, d.bx(pl.x0) - 1, d.by(pl.y)); return; }
    if (pl.kind === 'balcony') {
      const x0 = this.bounds.left - 1, sp = this.balconySprite(x0, pl.x1);
      g.drawImage(sp.cv, d.bx(x0) - 1, d.by(pl.y) - sp.top);
      // support post down to the floor
      const px = d.bx(pl.x1 - 0.25);
      g.fillStyle = '#5a3522'; g.fillRect(px - 4, d.by(pl.y) + 12, 9, d.by(0) - d.by(pl.y) - 12);
      g.fillStyle = '#7a4a2c'; g.fillRect(px - 4, d.by(pl.y) + 12, 2, d.by(0) - d.by(pl.y) - 12);
      g.fillStyle = '#2a170e'; g.fillRect(px + 4, d.by(pl.y) + 12, 1, d.by(0) - d.by(pl.y) - 12);
      g.fillStyle = '#9c6436'; g.fillRect(px - 6, d.by(pl.y) + 12, 13, 3); g.fillRect(px - 6, d.by(0) - 4, 13, 4);
      return;
    }
    if (pl.kind === 'table') { const w = Math.round((pl.x1 - pl.x0) * PPU); const sp = this.tableSprite(w, !!pl.broken); g.drawImage(sp.cv, d.bx(pl.x0) - 4, d.by(0) - sp.top - 1 - (pl.broken ? -1 : 0)); }
  }

  // ------------------------------------------------------------------ cantina props
  drawCustomProp(d, p, t, v) {
    if (p.type === 'jukebox') { const sp = this.spr('juke' + (this.juke & 1) + (Math.floor(t * 4) & 3), () => jukeboxSprite(this.juke & 1, Math.floor(t * 4) & 3)); this.put(d, sp, p.x, p.y, false, 0, (Math.floor(t * 4) & 1) ? -1 : 0); return; }
    if (p.type === 'chandelier') {
      const base = this.spr('chand', () => chandelierSprite());
      const g = d.g;
      if (p.state === 'broken') { const sp = this.spr('chandBroken', () => chandelierWreck()); this.put(d, sp, p.x, 0); return; }
      const ang = p.state === 'rest' ? v.sw : v.sw * 0.5 + (p.state === 'fall' ? (5.3 - p.y) * 0.08 : 0);
      const ax = p.x, ay = p.y + 0.42;
      if (p.state === 'rest') {
        // chain from the ceiling beam
        const top = 9.4, L = (top - ay) * PPU;
        for (let k = 0; k < L; k += 3) { const x = d.bx(ax) + Math.round(Math.sin(ang) * (L - k) * -1 * 0) - Math.round(Math.sin(ang) * k * 0) ; }
        const x0 = d.bx(ax), y0 = d.by(top);
        const bx = Math.round(x0 - Math.sin(ang) * 0), by0 = d.by(ay);
        for (let y = y0; y < by0; y += 3) { const f = (y - y0) / Math.max(1, by0 - y0); g.fillStyle = ((y / 3) & 1) ? '#3a3a3a' : '#6a6a6a'; g.fillRect(Math.round(x0 + (bx - x0) * f), y, ((y / 3) & 1) ? 1 : 2, 3); }
      }
      const k = Math.round(ang / 0.05);
      const sp = this.spr('chand:a' + k, () => { const r = rotPix(base.P, k * 0.05, base.P.w / 2, 2); return { cv: r.canvas(), ox: r.cx, oy: r.cy }; });
      const flick = Math.floor(t * 7) & 1;
      g.drawImage(sp.cv, d.bx(ax) - Math.round(sp.ox), d.by(ay) - Math.round(sp.oy));
      // candle flames (flat, 2-frame flicker)
      if (p.state === 'rest' && this.flick) {
        for (let i = 0; i < 6; i++) {
          const lx = -30 + i * 12, ly = 7;
          const ca = Math.cos(k * 0.05), sa = Math.sin(k * 0.05);
          const fx = d.bx(ax) + Math.round(lx * ca - ly * sa), fy = d.by(ay) + Math.round(lx * sa + ly * ca) - 5;
          g.fillStyle = '#ffb030'; g.fillRect(fx, fy - (flick ^ (i & 1)), 2, 3); g.fillStyle = '#fff4c0'; g.fillRect(fx, fy + 1, 1, 2);
        }
      }
      return;
    }
    if (p.type === 'pinata') {
      if (p.state === 'broken') {
        // just the dangling rope end
        const g = d.g; g.fillStyle = '#8a7048'; g.fillRect(d.bx(p.x), d.by(9.2), 1, d.by(p.y + 0.6) - d.by(9.2)); return;
      }
      const hp = clamp(p.hp, 1, 5);
      const base = this.spr('pinata' + hp, () => pinataSprite(hp));
      const ang = v.sw * 0.6, g = d.g;
      const ax = p.x, ay = p.y + 0.62;
      // rope
      const x0 = d.bx(ax), y0 = d.by(9.2), y1 = d.by(ay);
      g.fillStyle = '#8a7048'; for (let y = y0; y < y1; y++) g.fillRect(x0 + ((y >> 2) & 1 ? 0 : 0), y, 1, 1);
      g.fillStyle = '#6a5030'; for (let y = y0; y < y1; y += 3) g.fillRect(x0 + 1, y, 1, 1);
      const k = Math.round(ang / 0.06);
      const sp = this.spr('pin' + hp + ':a' + k, () => { const r = rotPix(base.P, k * 0.06, base.P.w / 2, 0); return { cv: r.canvas(), ox: r.cx, oy: r.cy }; });
      g.drawImage(sp.cv, d.bx(ax) - Math.round(sp.ox), d.by(ay) - Math.round(sp.oy));
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, s) {
    super.update(dt, s);
    this.fish.update(dt);
    this.bart.update(dt);
    this.mech.update(dt, this.fx);
    for (const pt of this.pats) pt.update(dt);
    this.doorV += (-this.doorA * 14 - this.doorV * 2.2) * dt; this.doorA += this.doorV * dt;
    if (Math.random() < dt * 0.06) this.doorV += (Math.random() < 0.5 ? -1 : 1) * 2.5;
    this.neonT -= dt;
    if (this.neonT <= 0) { this.neonOn = Math.random() < (this.dark > 0.1 ? 0.4 : 0.93) ? 1 : 0; this.neonT = this.neonOn ? 0.6 + Math.random() * (this.dark > 0.1 ? 0.2 : 4) : 0.05 + Math.random() * 0.12; }
    if (s) { if (s.jukebox !== undefined && s.jukebox !== this.juke) this.juke = s.jukebox; }
    this.noteT -= dt;
    if (this.noteT <= 0 && s?.props) { this.noteT = 0.8 + Math.random() * 0.6; const jb = s.props.find((p) => p.type === 'jukebox'); if (jb) this.fx.spawn('note', jb.x + (Math.random() - 0.5) * 0.4, jb.y + 1.9, { g: 0.9, vx: (Math.random() - 0.5) * 0.4, life: 1.8, drag: 1.5, v: Math.floor(Math.random() * 6) }); }
    if (this.shelfShake > 0) this.shelfShake -= dt;
  }
  drawBack(d, t) {
    const g = d.g;
    this.sea.draw(d);
    this.fish.draw(d, t);
    this.wall.draw(d);
    // string lights over the back bar (blink in steps)
    const ox = Math.round(this.wX0 + d.camAX * (1 - WALL_P)) - d.ax, oy = this.wY0 - d.ay;
    this.bulbs.forEach(([x, y], i) => { const on = this.flick && ((i + Math.floor(t * 2)) % 3 !== 0); g.fillStyle = on ? ['#ffd070', '#ff7a5a', '#7ae0ff'][i % 3] : '#3a2a20'; g.fillRect(ox + x, oy + y, 2, 2); });
    // saloon doors (swinging)
    this.drawDoors(d, ox, oy);
    // neon sign
    const N = this.neon;
    drawAt(d, this.neonOn && this.flick ? N.on : N.off, AX(N.x) - 75, AY(N.y), WALL_P, 1);
    this.ceil.draw(d);
    // lantern cones + floor
    this.floor.draw(d);
    for (const L of this.lanterns) if (this.flick) drawAt(d, L.cone.cv, AX(L.x) - L.cone.ax, AY(L.y) + 10, 0.95, 1);
    // patrons and the back tables
    for (const pt of this.pats) pt.draw(d, t, 0.93);
    this.mech.draw(d, t, 0.93);
    this.backTables.draw(d);
    // bartender behind the counter
    this.bart.draw(d, t, 0.975);
    // papel picado + lanterns hanging from the ceiling
    for (const L of this.lanterns) {
      const x = pbx(d, L.x, 0.95), y0 = pby(d, 9.6, 1), y1 = pby(d, L.y, 1);
      g.fillStyle = '#1a1410'; g.fillRect(x, y0, 1, y1 - y0);
      g.drawImage(this.flick ? this.lanternCv : this.lanternOff, x - 11 + Math.round(Math.sin(t * 0.8 + L.x) * 1), y1);
    }
    for (const S of this.strings) if (!S.front) this.drawString(d, S, t);
    if (this.dark > 0.02) d.dither('#020203', this.dark * 0.8);
  }
  drawDoors(d, ox, oy) {
    const g = d.g, a = clamp(this.doorA, -1, 1), k = Math.min(3, Math.round(Math.abs(a) * 3));
    const y = oy + this.doorTop + Math.round(this.doorW / 2) + 20;
    const L = this.doorLeaf[k], Rt = this.doorLeaf[k];
    const cx = ox + this.doorCx;
    if (L) { g.drawImage(L, cx - 51, y); }
    if (Rt) { g.save(); g.translate(cx + 51, y); g.scale(-1, 1); g.drawImage(Rt, 0, 0); g.restore(); }
  }
  drawString(d, S, t) {
    const g = d.g;
    const wind = Math.sin(t * 0.9 + S.p * 9) * 1.2;
    S.cord.draw(d);
    const fl = S.front ? this.flagsF : this.flags;
    for (const q of S.pts) {
      const x = pbx(d, q.x, S.p), y = pby(d, q.y, 1);
      if (x < -14 || x > d.vw + 14 || y > d.vh || y < -20) continue;
      const sw = Math.round(Math.sin(t * 2.1 + q.ph) * wind);
      g.drawImage(fl[q.c][q.v], x - 5 + sw, y);
    }
  }
  drawProps(d, s, alpha, t) {
    super.drawProps(d, s, alpha, t);
  }
  drawFront(d, t) {
    for (const S of this.strings) if (S.front) this.drawString(d, S, t);
    this.front.draw(d);
  }
  onStageEvent(e) {
    if (e.t === 'bartenderSlide' || e.t === 'hit' || e.t === 'ko') this.bart.react(e);
    if (e.t === 'hit' || e.t === 'ko' || e.t === 'roundWin' || e.t === 'round' || e.t === 'fight') for (const pt of this.pats) pt.react(e);
    if (e.t === 'ko' || (e.t === 'hit' && e.heavy && Math.random() < 0.3)) this.doorV += (Math.random() < 0.5 ? -1 : 1) * 5;
    if (e.t === 'jukebox') this.juke = e.track ?? (this.juke + 1);
    if (e.t === 'slam' || e.t === 'flopLand' || e.t === 'shellBreak' || e.t === 'finisherHit') for (let i = 0; i < 2; i++) this.fx.spawn('glass', 8 + Math.random() * 4, 4.6, { vx: (Math.random() - 0.5) * 2, vy: 0, life: 1.4, p: 0.9 });
  }
}

// ======================================================================= cantina prop sprites
export function chandelierSprite() {
  const W = 74, H = 40, P = new Pix(W, H);
  const wd = PAL.wood, wl = PAL.woodL, iron = RO(['#0e0c0c', '#1e1a1a', '#2e2a28', '#4a4440', '#6a625a']);
  // iron straps from the hook ring to the wheel
  for (const x of [8, 24, 50, 66]) P.line(37, 3, x, 16, iron[2]);
  P.ring(37.5, 3, 1.5, 3, iron[3]);
  // wagon wheel seen from slightly below: rim band + spokes
  P.ell(37, 19, 35, 7, (x, y, nx, ny, q) => (q > 0.55 ? (ny < 0 ? wl[3] : wl[2]) : ny > 0.2 ? undefined : undefined));
  P.ell(37, 19, 35, 7, (x, y, nx, ny, q) => (q > 0.55 ? (ny > 0.45 ? wd[1] : ny < -0.5 ? wl[4] : wl[2]) : undefined));
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 8; P.line(37 - Math.cos(a) * 33, 19 - Math.sin(a) * 6, 37 + Math.cos(a) * 33, 19 + Math.sin(a) * 6, wd[2]); }
  P.ell(37, 19, 5, 3, wl[3]); P.set(36, 18, wl[4]);
  // candles on the rim (flames drawn live)
  for (let i = 0; i < 6; i++) { const x = 7 + i * 12; P.rect(x, 8, 3, 7, C('#e8dcc0')); P.vl(x, 8, 14, C('#fff8e8')); P.set(x + 1, 7, C('#2a2018')); P.rect(x - 1, 14, 5, 2, iron[3]); }
  // dangling crystals / glass drops
  for (let i = 0; i < 9; i++) { const x = 6 + i * 8, y = 25 + (i % 2) * 2; P.vl(x, y, y + 4, iron[2]); P.set(x, y + 5, C('#9fe0e0')); P.set(x, y + 6, C('#e0ffff')); }
  P.outline(PAL.ink);
  return { cv: P.canvas(), ox: W / 2, oy: 2, P };
}
function chandelierWreck() {
  const W = 84, H = 18, P = new Pix(W, H), wd = PAL.wood, wl = PAL.woodL;
  P.ell(40, 12, 34, 5, (x, y, nx, ny, q) => (q > 0.5 ? (ny < 0 ? wl[3] : wd[1]) : undefined));
  P.rect(20, 3, 3, 8, C('#e8dcc0')); P.rect(60, 9, 8, 3, C('#e8dcc0')); P.rect(8, 12, 9, 3, C('#e8dcc0'));
  for (let k = 0; k < 6; k++) P.line(40, 12, 40 + Math.cos(k) * 30, 12 + Math.sin(k) * 4, wd[2]);
  P.poly([44, 8, 56, 2, 58, 6], wl[2]);
  P.outline(PAL.ink);
  return { cv: P.canvas(), ox: W / 2, oy: H, P };
}
export function pinataSprite(hp = 5) {
  const W = 52, H = 56, P = new Pix(W, H);
  const cols = ['#e83a6a', '#f0a030', '#3ac0e0', '#7ad04a', '#c070e0', '#f0e040', '#ff7040'];
  const cx = 26, cy = 30, R0 = 11;
  // seven cones: up, upper diagonals, sides, lower diagonals
  const cones = [[-Math.PI / 2, 1], [-Math.PI / 2 - 0.9, 0.9], [-Math.PI / 2 + 0.9, 0.9], [Math.PI, 0.85], [0, 0.85], [Math.PI * 0.72, 0.8], [Math.PI * 0.28, 0.8]];
  const missing = hp <= 3 ? [4] : []; if (hp <= 1) missing.push(5);
  cones.forEach(([a, k], i) => {
    if (missing.includes(i)) return;
    const L = 20 * k, tip = [cx + Math.cos(a) * (R0 + L), cy + Math.sin(a) * (R0 + L)];
    const b1 = [cx + Math.cos(a - 0.45) * R0, cy + Math.sin(a - 0.45) * R0], b2 = [cx + Math.cos(a + 0.45) * R0, cy + Math.sin(a + 0.45) * R0];
    P.poly([b1[0], b1[1], tip[0], tip[1], b2[0], b2[1]], (x, y) => { const d = Math.hypot(x - cx, y - cy); const c = C(cols[(Math.floor(d / 3) + i) % cols.length]); return (Math.floor(d) % 3 === 0) ? darkU(c, 0.25) : c; });
    // tassels at the tip
    const tc = C(cols[(i + 3) % cols.length]);
    for (let s = -1; s <= 1; s++) for (let j = 0; j < 5; j++) P.set(tip[0] + s + Math.round(Math.cos(a) * j * 0.3), tip[1] + j, j > 3 ? lightU(tc, 0.3) : tc);
  });
  // central ball with crepe fringe rows
  P.disc(cx, cy, R0, (x, y) => { const c = C(cols[Math.floor((y - cy + R0) / 3) % cols.length]); return (y % 3 === 0) ? darkU(c, 0.2) : ((x + y) % 7 === 0 ? lightU(c, 0.25) : c); });
  // damage: torn fringe + cracked hole with candy inside
  if (hp <= 4) for (let k = 0; k < 10; k++) P.set(cx - 8 + Math.floor(hh(k, 1, 4) * 16), cy - 6 + Math.floor(hh(k, 2, 4) * 14), C('#c8b890'));
  if (hp <= 2) { P.ell(cx + 3, cy + 2, 5, 4, C('#1a0e10')); for (let k = 0; k < 6; k++) P.set(cx + 1 + (k % 3) * 2, cy + 1 + Math.floor(k / 3) * 2, C(cols[k])); P.line(cx - 2, cy - 1, cx + 8, cy + 6, C('#c8b890')); }
  // hanging loop
  P.ring(cx + 0.5, 2.5, 1, 2.5, C('#8a7048'));
  P.outline(PAL.ink);
  return { cv: P.canvas(), ox: cx, oy: 0, P };
}
export function jukeboxSprite(track = 0, f = 0) {
  const W = 60, H = 86, P = new Pix(W, H);
  const wd = RO(['#2a140a', '#401e10', '#5a2c18', '#7a3e22', '#9a5430']), ch = PAL.steelL;
  const tubeCols = track ? ['#3af0d8', '#c070ff', '#ff5ab4', '#4f8fff'] : ['#ff7040', '#f0c030', '#ff3a5a', '#f0e060'];
  const arch = (x, y, r, c) => P.ell(x, y, r, r, c);
  // wooden cabinet body with an arched top
  P.rect(4, 30, W - 8, H - 30, wd[2]); arch(30, 30, 26, wd[2]);
  for (let y = 30; y < H; y++) { P.seti(4, y, wd[4]); P.seti(5, y, wd[3]); P.seti(W - 5, y, wd[0]); P.seti(W - 6, y, wd[1]); }
  // bubble tubes (colour bands cycle with f)
  const tube = (x0, y0, h) => { for (let j = 0; j < h; j++) { const c = C(tubeCols[(Math.floor((j + f * 3) / 4)) % tubeCols.length]); P.rect(x0, y0 + j, 4, 1, c); P.seti(x0, y0 + j, lightU(c, 0.4)); P.seti(x0 + 3, y0 + j, darkU(c, 0.3)); } for (let j = (f * 5) % 9; j < h; j += 9) P.seti(x0 + 1, y0 + j, C('#ffffff')); };
  tube(8, 30, 48); tube(W - 12, 30, 48);
  // arched tube over the top
  for (let k = 0; k <= 40; k++) { const a = Math.PI + (k / 40) * Math.PI, x = 30 + Math.cos(a) * 22, y = 30 + Math.sin(a) * 22; const c = C(tubeCols[(Math.floor(k / 5) + f) % tubeCols.length]); P.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, c); }
  // chrome grille window with a record
  arch(30, 32, 16, ch[1]); P.rect(14, 32, 32, 14, ch[1]);
  arch(30, 32, 14, C('#1a1a24')); P.rect(16, 32, 28, 12, C('#1a1a24'));
  P.ell(30, 36, 9, 3, C('#0a0a0e')); P.ell(30, 36, 3, 1.2, C(track ? '#3af0d8' : '#f0c030'));
  P.set(26 + f * 2, 35, C('#5a5a6a'));
  for (let x = 18; x < 43; x += 3) P.vl(x, 20, 30, ch[2]);
  // selection strip + buttons
  P.rect(12, 48, 36, 7, C('#e8dcb8')); for (let k = 0; k < 6; k++) P.hl(14 + k * 6, 17 + k * 6, 51, C('#8a6a4a'));
  for (let k = 0; k < 8; k++) P.rect(13 + k * 4, 57, 3, 2, k === (f * 2) % 8 ? C('#ff5a5a') : ch[3]);
  // speaker grille
  P.rect(12, 62, 36, 18, C('#5a3018')); for (let y = 63; y < 80; y += 2) P.hl(13, 46, y, C('#3a1e10'));
  for (let x = 14; x < 47; x += 5) P.vl(x, 62, 79, ch[2]);
  P.hl(12, 47, 61, ch[4]); P.hl(12, 47, 80, ch[1]);
  // chrome trim + base
  P.rect(2, H - 4, W - 4, 4, ch[2]); P.hl(2, W - 3, H - 4, ch[4]);
  P.outline(PAL.ink);
  return { cv: P.canvas(), ox: W >> 1, oy: H, P };
}
