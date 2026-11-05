// THE BAR LOBBY (main menu world): a cozy underwater dive bar built into the abandoned oil rig.
// One long continuous room the menu camera pans across, left -> right:
//   gym corner (punching bag, bench)  |  bar counter + stools + bartender  |  pool table + arcade
//   booth + jukebox under a big aquarium window  |  little mariachi stage  |  two rusty vote doors
//   + a junk shelf hiding the secret door  ||  Madam Molt's hidden treasure shop behind the partition.
// API: bounds, spots, cams, update(dt), drawBack(d,t), drawMid(d,t), drawFront(d,t),
//      setDoor(i, open), setSecretDoor(open), doorVotes(i, n)
import {
  Pix, Layer, PerspFloor, Snow, FishLayer, Bubbles, Debris, coneSprite, rotPix, papelFlag,
  C, R, RO, PAL, AX, AY, PPU, PIV_Y, TAU, hh, ih, rng, BY, vnoise, noiseField, mixU, darkU, lightU,
  rustPlates, rivet, bolt, barnacle, chainV, sagLine, pipeH, pipeV, flangeOnH, flangeOnV, hazard, grating, kelp,
  text, textW, luchaPoster, loteria, talavera, tiles, woodPlanks, pbx, pby, drawAt, clamp,
} from './common.js';
import { jukeboxSprite } from './cantina.js';
import { Bartender, MadamMolt, NPC } from './npcs.js';

const WALL_P = 0.95, WALL_BASE = 0.85, CEIL = 7.4;
// zone cameras: wall decor of each zone is baked so it lines up with the furniture when the camera
// frames that zone (the wall scrolls at WALL_P, so decor would otherwise drift by camX*(1-WALL_P)).
const ZONES = [[-15, -19], [-3.8, -9], [6.6, 1.0], [15.1, 11], [20.6, 17.9], [31, 25.2], [99, 37.4]];
const zoneCam = (x) => { for (const [x1, c] of ZONES) if (x < x1) return c; return 37.4; };
const wxz = (x) => x - zoneCam(x) * (1 - WALL_P);
const FOGC = C('#161a22');
const WD = RO(['#140c08', '#22140c', '#341e12', '#4a2c1a', '#5e3a22']);
const WDL = RO(['#24160e', '#362014', '#4c2e1c', '#623c24', '#7a4c2e']);
const STW = RO(['#141a1c', '#1e282a', '#2a3838', '#3a4a48', '#4c5e58']);
const RUSTW = RO(['#1a100c', '#2a1810', '#3e2216', '#56301c', '#6e4024']);
const VEL = RO(['#2a0a10', '#420e18', '#5e1620', '#7a2028', '#922e30']);
const DAM = RO(['#160e22', '#22142e', '#2e1a3e', '#3e244e', '#523262']);

export class BarScene {
  constructor() {
    this.bounds = { left: -26, right: 44.5, bottom: -1.6, top: 11 };
    this.x0 = -28; this.x1 = 46.5;
    this.t = 0; this.dark = 0;
    this.spots = {
      jim: { x: -18.4, y: 0, face: -1 },
      brutus: { x: -9.4, y: 0.74, face: 1, seat: true },
      bobby: { x: 3.0, y: 0, face: 1 },
      mimi: { x: 10.5, y: 0.52, face: 1, seat: true },
      select: { jim: { x: -2.1, y: 0, face: 1 }, brutus: { x: -0.7, y: 0, face: 1 }, bobby: { x: 0.7, y: 0, face: -1 }, mimi: { x: 2.1, y: 0, face: -1 } },
      versus: [{ x: -1.7, y: 0, face: 1 }, { x: 1.7, y: 0, face: -1 }],
      molt: { x: 37.8, y: 0.3, face: -1 },
      pedestal: { x: 34.0, y: 0.3, face: 1 },
      doors: [{ x: 22.7, y: 1.8 }, { x: 26.7, y: 1.8 }],
      secret: { x: 29.6, y: 1.5 },
      shopCam: { x: 37.4, y: 2.25, zoom: 1.9 },
    };
    this.cams = {
      overview: { x: -4.5, y: 3.9, zoom: 1.25 },
      jim: { x: -19.0, y: 1.55, zoom: 2.5 },
      brutus: { x: -9.0, y: 1.65, zoom: 2.5 },
      bobby: { x: 3.4, y: 1.55, zoom: 2.5 },
      mimi: { x: 11.0, y: 1.6, zoom: 2.5 },
      select: { x: 0, y: 2.1, zoom: 2.1 },
      versus: { x: 0, y: 1.9, zoom: 2.4 },
      doors: { x: 25.2, y: 2.75, zoom: 1.7 },
      shop: { x: 37.4, y: 2.25, zoom: 1.9 },
      pedestal: { x: 34.0, y: 1.3, zoom: 2.8 },
      stage: { x: 17.9, y: 2.0, zoom: 2.2 },
    };
    const T = [];
    const tm = (n, f) => { const a = performance.now(); f(); T.push(n + ' ' + (performance.now() - a).toFixed(0)); };
    tm('sea', () => this.buildSea());
    tm('wall', () => this.buildWall());
    tm('shop', () => this.buildShopWall());
    tm('ceil', () => this.buildCeiling());
    tm('floor', () => this.buildFloor());
    tm('mid', () => this.buildMid());
    tm('doors', () => this.buildDoors());
    tm('front', () => this.buildFront());
    if (typeof location !== 'undefined' && location.search.includes('prof')) console.warn('[perf] ' + T.join(' | '));
    this.fish = new FishLayer({ count: 9, x0: -2, x1: 14, y0: 2.2, y1: 4.8, p: [0.45, 0.55], col: () => '#1a5a64', belly: () => '#2a7480', seed: 31, kinds: ['small', 'small', 'mid', 'jelly', 'small'] });
    this.snow = new Snow({ seed: 41, bands: [{ p: 0.95, n: 9, col: '#4a5250', sz: 1, sp: 4 }, { p: 1.2, n: 5, col: '#6a6a60', sz: 1, sp: 7, big: 0.3 }] });
    this.bub = new Bubbles();
    this.fx = new Debris();
    this.bub.emitter(10.2 - 11 * 0.5, 2.0, 2.5, { p: 0.5, spread: 0.1, top: 4.9, amp: 1 });
    this.bub.emitter(12.4 - 11 * 0.5, 2.0, 1.5, { p: 0.5, spread: 0.1, top: 4.9, amp: 1 });
    this.bart = new Bartender({ x: -9.8, minX: -12.6, maxX: -6.0, fogAmt: 0.05 });
    this.molt = new MadamMolt(this.spots.molt.x, this.spots.molt.y, { face: -1 });
    this.doorOpen = [0, 0]; this.doorTarget = [0, 0]; this.votes = [0, 0];
    this.secret = 0; this.secretTarget = 0;
    this.bag = { a: 0, v: 0 };
    this.neonT = 0; this.neonOn = 1;
    this.showMolt = true; this.showBartender = true;
  }

  // ------------------------------------------------------------------ outside sea (behind the aquarium window + portholes)
  buildSea() {
    const X0 = AX(-12), W = AX(26) - X0, Y0 = AY(6.2), H = AY(0.6) - Y0;
    const P = new Pix(W, H);
    for (let j = 0; j < H; j++) { const t = j / H; const c = t < 0.3 ? C('#1e6a74') : t < 0.6 ? C('#185a66') : C('#134a56'); const c2 = t < 0.3 ? C('#185a66') : t < 0.6 ? C('#134a56') : C('#0f3e4a'); const f = (t * 10) % 3.33 / 3.33; for (let i = 0; i < W; i++) P.d[j * W + i] = BY(i, j) < f * 0.8 - 0.3 ? c2 : c; }
    const r = rng(3);
    for (let i = 0; i < 40; i++) kelp(P, Math.floor(r() * W), H - 1, 30 + Math.floor(r() * 80), RO(['#0f3e40', '#0f3e40', '#14504e', '#1a5e58', '#1a5e58']), { seed: i, w: 3 });
    // a sunken boat silhouette
    const bx = AX(5.6) - X0;
    P.poly([bx - 60, H - 20, bx + 60, H - 26, bx + 46, H - 2, bx - 50, H - 2], C('#0e3a44')); P.rect(bx - 2, H - 80, 4, 56, C('#0e3a44')); P.line(bx, H - 80, bx + 40, H - 30, C('#0e3a44'));
    for (let x = 0; x < W; x += 2) { const h = 6 + Math.round(vnoise(x * 0.03, 0, 9) * 14); P.rect(x, H - h, 2, h, C('#0c3038')); }
    for (let k = 0; k < 6; k++) { const x = Math.floor(hh(k, 1, 9) * W); for (let j = 0; j < H; j++) for (let i = -10; i < 10; i++) if (BY(x + i + j, j) < 0.12 * (1 - j / H)) P.seti(x + i + Math.round(j * 0.3), j, C('#3a8a90')); }
    this.sea = new Layer(P, X0, Y0, 0.5, 1);
  }

  // ------------------------------------------------------------------ back wall of the bar
  buildWall() {
    const X0 = AX(this.x0 - 1), W = AX(31.6) - X0, Y0 = AY(CEIL), Yb = AY(WALL_BASE), H = Yb - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(wxz(xw)) - X0, ly = (yw) => AY(yw) - Y0;
    this.wX0 = X0; this.wY0 = Y0; this.wlx = lx; this.wly = ly;
    // base: riveted steel bulkhead everywhere (the rig), then each zone dresses it up
    rustPlates(P, 0, 0, W, H, { pw: 96, ph: 72, paint: STW, rust: RUSTW, rivet: STW, seam: C('#0a0e0e'), rustAmt: 0.3, seed: 51, drips: false });
    const wy = ly(1.9);
    // ---- gym corner (x < -15): green paint, rubber skirt, mirror, gear
    const gx0 = 0, gx1 = lx(-15);
    P.map(gx0, 0, gx1 - gx0, H, (c) => mixU(c, C('#1e3a2a'), 0.35));
    P.rect(gx0, wy, gx1 - gx0, H - wy, C('#16161a')); for (let x = gx0; x < gx1; x += 4) P.vl(x, wy, H - 1, C('#1e1e24')); P.hl(gx0, gx1, wy, C('#2e2e36'));
    this.mirror(P, lx(-23.3), ly(4.3), 100, 100);
    luchaPoster(P, lx(-18.3), ly(4.3), 34, 48, { bg: C('#3a2a5a'), mask: C('#c8a040'), mask2: C('#2a6a4a'), title: 'KUNG FU', sub: 'CAMARON' });
    luchaPoster(P, lx(-17.3), ly(3.9), 28, 40, { bg: C('#5a2a22'), mask: C('#e8e0d0'), mask2: C('#c82a2a'), title: 'JIM', sub: '#1' });
    P.map(lx(-18.4), ly(4.4), 80, 64, (c) => mixU(c, FOGC, 0.22));
    // dumbbell wall rack, trophy shelf, speed bag, jump rope, whiteboard
    const rx = lx(-20.6), ry = ly(2.45);
    P.rect(rx, ry, 64, 4, STW[3]); P.hl(rx, rx + 63, ry, STW[4]);
    for (let k = 0; k < 5; k++) { const x = rx + 5 + k * 12, sz = 3 + (k % 3); P.rect(x - 1, ry - 4 - sz, 3, sz * 2 + 1, C('#2a2a30')); P.rect(x + 6, ry - 4 - sz, 3, sz * 2 + 1, C('#2a2a30')); P.hl(x, x + 7, ry - 4, C('#6a6a70')); }
    const tsx = lx(-20.5), tsy = ly(3.85);
    P.rect(tsx, tsy, 56, 3, WD[3]); P.hl(tsx, tsx + 55, tsy, WDL[4]);
    for (let k = 0; k < 3; k++) { const x = tsx + 8 + k * 18, h = 12 + (k === 1 ? 4 : 0), gd = PAL.gold; P.rect(x - 3, tsy - 3, 7, 3, WD[2]); P.rect(x, tsy - h, 2, h - 3, gd[2]); P.ell(x + 1, tsy - h, 4, 3, (xx, yy, nx) => (nx < -0.3 ? gd[4] : gd[3])); P.set(x - 3, tsy - h - 1, gd[2]); P.set(x + 5, tsy - h - 1, gd[2]); }
    const sbx = lx(-15.9), sby = ly(3.4);
    P.rect(sbx - 16, sby, 32, 4, WD[3]); P.rect(sbx - 2, sby - 14, 4, 14, WD[2]); P.ell(sbx, sby + 10, 5, 6, C('#8a2a22')); P.set(sbx - 2, sby + 8, C('#b84a3a')); P.vl(sbx, sby + 4, sby + 5, C('#2a2a2a'));
    sagLine(P, lx(-15.5) - 8, ly(2.6), lx(-15.5) + 4, ly(2.6), 30, C('#a83a2a'));
    P.rect(lx(-21.6), ly(6.6), 60, 34, C('#c8ccc4')); P.rect(lx(-21.6) - 2, ly(6.6) - 2, 64, 2, STW[3]);
    text(P, 'DIA 1000', lx(-21.6) + 30, ly(6.6) + 4, C('#2a4a8a'), { font: 3, align: 'center' }); text(P, 'JAB X500', lx(-21.6) + 30, ly(6.6) + 12, C('#2a2a2a'), { font: 3, align: 'center' }); text(P, '¡NO RENDIRSE!', lx(-21.6) + 30, ly(6.6) + 22, C('#a82a2a'), { font: 3, align: 'center' });
    text(P, 'GYM', lx(-19.5), ly(5.9), (x, y) => (ih(x, y, 3) < 0.15 ? undefined : C('#5a7a5a')), { sc: 3, align: 'center' });
    // ---- bar zone (x -15 .. -3.8): wood paneling, back bar, neon, TV, menu board
    const bx0 = lx(-15), bx1 = lx(-3.8);
    woodPlanks(P, bx0, 0, bx1 - bx0, H, { dir: 'v', r: WDL, pw: 12, seed: 61, gap: WD[0], lenMin: 400, lenMax: 400, nails: false });
    P.rect(bx0, wy - 4, bx1 - bx0, 4, WD[4]); P.hl(bx0, bx1, wy - 4, WDL[4]); P.hl(bx0, bx1, wy - 1, WD[0]);
    this.backBar(P, lx(-13.8), lx(-4.8), ly);
    this.chalkMenu(P, lx(-4.75) - 30, ly(5.3));
    // ---- pool / arcade zone (x -3.8 .. 6.6): brick-red painted steel, dartboard, cue rack, BILLAR sign
    const px0 = lx(-3.8), px1 = lx(6.6);
    const BRK = RO(['#1e0e0c', '#2e1612', '#3e2018', '#4c2a1e', '#5a3424']);
    for (let y = 0; y < wy; y++) for (let x = px0; x < px1; x++) {
      const row = (y / 8) | 0, off = (row & 1) * 10, u = x - px0 + off, bx = u % 20, by = y % 8, bid = ih((u / 20) | 0, row, 7);
      let c = by === 7 || bx === 19 ? BRK[0] : BRK[bid < 0.3 ? 1 : bid > 0.85 ? 3 : 2];
      if (by === 0 && bx !== 19) c = BRK[Math.min(4, (bid > 0.85 ? 3 : 2) + 1)];
      if (ih(x, y, 2) < 0.03) c = BRK[1];
      P.seti(x, y, c);
    }
    P.rect(px0, wy, px1 - px0, H - wy, WD[2]); for (let x = px0; x < px1; x += 16) P.vl(x, wy, H - 1, WD[0]); P.hl(px0, px1, wy, WDL[4]); P.rect(px0, wy - 4, px1 - px0, 4, WD[3]); P.hl(px0, px1, wy - 4, WDL[4]);
    this.neonPool = this.neonSign('BILLAR', NEON.cyan, NEON.pink, 'ball');
    this.neonPoolPos = { x: -0.6, y: 6.4 };
    this.dartboard(P, lx(1.6), ly(3.4));
    this.cueRack(P, lx(-3.0), ly(4.0));
    luchaPoster(P, lx(4.0) - 17, ly(5.9), 34, 46, { bg: C('#1a3a5a'), mask: C('#3a9a5a'), mask2: C('#c83a6a'), title: 'MANTIS', sub: 'MAYHEM' });
    P.map(lx(4.0) - 18, ly(5.9) - 2, 36, 50, (c) => mixU(c, FOGC, 0.25));
    // photo frames
    for (let k = 0; k < 3; k++) { const x = lx(-1.6) + k * 26, y = ly(5.6) + (k % 2) * 6; P.rect(x, y, 20, 16, C('#6a5020')); P.rect(x + 2, y + 2, 16, 12, [C('#2a4a5a'), C('#5a3a2a'), C('#3a5a3a')][k]); P.disc(x + 10, y + 8, 3, C('#c89a6a')); }
    // ---- booth zone (x 6.6 .. 15): teal paint, talavera band, the aquarium window, portholes
    const ox0 = lx(6.6), ox1 = lx(15.1);
    P.map(ox0, 0, ox1 - ox0, H, (c) => mixU(c, C('#143a40'), 0.45));
    const ty = ly(1.95);
    tiles(P, ox0, ty, ox1 - ox0, H - ty, 11, C('#1a1a18'), (Q, x, y, s, i, j) => talavera(Q, x, y, s, i, j, { base: C('#7a7460'), base2: C('#686250'), blue: C('#243a66'), blue2: C('#3e5486'), yel: C('#8a6a30'), grn: C('#2e5e44') }));
    P.rect(ox0, ty - 3, ox1 - ox0, 3, WD[3]); P.hl(ox0, ox1, ty - 3, WDL[4]);
    this.aquarium(P, lx(9.1), ly(5.1), lx(13.2) - lx(9.1), ly(1.95) - ly(5.1) - 4);
    for (const [xw, yw] of [[7.6, 5.6], [14.3, 5.6]]) { const cx = lx(xw), cy = ly(yw); P.disc(cx, cy, 17, STW[3]); P.ring(cx, cy, 12, 17, (x, y, nx, ny) => (nx + ny < -0.3 ? STW[4] : nx + ny > 0.6 ? STW[1] : STW[2])); P.disc(cx, cy, 12, 0); for (let k = 0; k < 8; k++) bolt(P, cx + Math.cos(k * TAU / 8) * 14.5, cy + Math.sin(k * TAU / 8) * 14.5, STW); }
    for (let k = 0; k < 3; k++) { const x = lx(13.6) + k * 17, y = ly(4.6); loteria(P, x, y, 15, 26, ['sirena', 'corazon', 'luna'][k], [13, 27, 18][k]); P.map(x, y, 15, 26, (c) => mixU(c, FOGC, 0.3)); }
    // ---- stage zone (x 15.1 .. 20.6): velvet curtains + sun mural
    const sx0 = lx(15.1), sx1 = lx(20.6);
    this.curtains(P, sx0, sx1, ly(6.9), H);
    // ---- door zone is covered by the bulkhead section (drawn at the fighter plane)
    // vignette towards the ceiling + AO at the floor
    P.map(0, 0, W, H, (c, x, y) => { const k = clamp((16 - y) / 16, 0, 1) * 0.8 + clamp((y - (H - 18)) / 18, 0, 1) * 0.7; return k > 0 && BY(x, y) < k ? mixU(c, C('#060606'), 0.4) : undefined; });
    P.mixAll(FOGC, 0.08);
    this.wall = new Layer(P, X0, Y0, WALL_P, 1);
  }
  mirror(P, x, y, w, h) {
    P.rect(x - 4, y - 4, w + 8, h + 8, C('#3a3020')); P.rect(x - 2, y - 2, w + 4, h + 4, C('#5a4a2a'));
    P.rect(x, y, w, h, (xx, yy) => (((xx - yy) % 29 < 3 && (xx - yy) % 29 >= 0) || (xx - yy) % 41 === 7 ? C('#3a4e54') : yy < y + 8 ? C('#22323a') : C('#1a2830')));
    for (let k = 0; k < 6; k++) P.set(x + 10 + k * 17, y + h - 3, C('#2a3a40'));
    text(P, 'TU PUEDES', x + w / 2, y + h - 12, C('#2e4048'), { font: 3, align: 'center' });
  }
  backBar(P, x0, x1, ly) {
    const top = ly(5.7);
    woodPlanks(P, x0, top, x1 - x0, ly(1.9) - top, { dir: 'v', r: WD, pw: 14, seed: 66, gap: C('#0a0605'), lenMin: 400, lenMax: 400, nails: false });
    P.rect(x0 - 6, top - 8, x1 - x0 + 12, 8, WDL[3]); P.hl(x0 - 6, x1 + 5, top - 8, WDL[4]); P.hl(x0 - 6, x1 + 5, top - 1, WD[0]);
    // mirror in the middle
    const mx0 = x0 + Math.round((x1 - x0) * 0.36), mx1 = x0 + Math.round((x1 - x0) * 0.64), my0 = ly(4.0), my1 = ly(2.2);
    P.rect(mx0 - 4, my0 - 4, mx1 - mx0 + 8, my1 - my0 + 8, C('#7a6024')); P.rect(mx0, my0, mx1 - mx0, my1 - my0, (x, y) => ((x - y) % 23 < 2 && (x - y) % 23 >= 0 ? C('#3a4a52') : C('#1e2a30')));
    const cols = ['#2a6a3a', '#6a3a1a', '#3a5a8a', '#8a2a2a', '#a88a3a', '#4a2a5a', '#2a5a5a', '#7a6a4a'];
    const shelf = (y, xa, xb, seed) => {
      P.rect(xa, y, xb - xa, 4, WDL[3]); P.hl(xa, xb - 1, y, WDL[4]); P.hl(xa, xb - 1, y + 3, WD[0]);
      for (let x = xa + 3; x < xb - 6;) {
        const k = Math.floor(ih(x, seed, 2) * 100), col = R(cols[k % cols.length], { spread: 0.1 }), tall = 13 + (k % 4) * 3, bw = 5 + (k % 3);
        if (k % 11 === 0) { P.rect(x, y - 10, 9, 10, C('#a8a088')); P.rect(x + 1, y - 13, 7, 3, C('#5a3a2a')); P.set(x + 3, y - 7, C('#e8c070')); x += 12; continue; } // jar of snails
        P.rect(x, y - tall + 6, bw, tall - 6, col[2]); P.rect(x + (bw >> 1) - 1, y - tall, 2, 7, col[2]); P.set(x + (bw >> 1) - 1, y - tall, col[4]);
        P.vl(x, y - tall + 6, y - 1, col[3]); P.vl(x + bw - 1, y - tall + 6, y - 1, col[0]);
        if (k % 2) P.rect(x, y - 9, bw, 4, C('#c8b890'));
        x += bw + 2 + (k % 3);
      }
    };
    shelf(ly(5.0), x0 + 4, x1 - 4, 1); shelf(ly(4.3), x0 + 4, mx0 - 8, 2); shelf(ly(4.3), mx1 + 8, x1 - 4, 3); shelf(ly(3.1), x0 + 4, mx0 - 8, 4); shelf(ly(3.1), mx1 + 8, x1 - 4, 5);
    // mounted swordfish over the bar
    const fx = x0 + 40, fy = ly(6.5);
    P.rect(fx - 6, fy - 7, 26, 14, WDL[3]); P.ell(fx + 10, fy, 24, 6, (x, y, nx, ny) => (ny < -0.3 ? C('#4a6a8a') : ny > 0.5 ? C('#8aa0a8') : C('#3a5a7a')));
    P.line(fx + 32, fy - 1, fx + 56, fy - 2, C('#3a5a6a')); P.poly([fx - 12, fy, fx - 24, fy - 11, fx - 22, fy, fx - 24, fy + 11], C('#3a5a7a')); P.poly([fx + 2, fy - 5, fx + 10, fy - 15, fx + 18, fy - 5], C('#2a4a6a')); P.set(fx + 24, fy - 2, C('#0a0a0a'));
    this.neonBar = this.neonSign('EL FONDO', NEON.pink, NEON.cyan, 'cocktail');
    this.neonBarPos = { x: -9.3, y: 6.95 };
    this.tvPos = { x: -5.2, y: 6.4 };
  }
  chalkMenu(P, x, y) {
    P.rect(x - 3, y - 3, 58, 52, WD[3]); P.rect(x, y, 52, 46, C('#1e2a24'));
    text(P, 'MENU', x + 26, y + 3, C('#d8d8c8'), { font: 3, align: 'center' });
    const items = [['CERVEZA', '2'], ['CARACOL', '5'], ['TACO', '3'], ['SODA', '1']];
    items.forEach(([n, p], k) => { text(P, n, x + 3, y + 12 + k * 8, C('#b8c8b8'), { font: 3 }); text(P, p + '$', x + 49, y + 12 + k * 8, C('#e8c070'), { font: 3, align: 'right' }); });
  }
  dartboard(P, cx, cy) {
    P.disc(cx, cy, 15, C('#2a1a10'));
    P.ell(cx, cy, 13, 13, (x, y, nx, ny, q) => { const a = Math.atan2(ny, nx), seg = Math.floor(((a + Math.PI) / TAU) * 20) & 1, r = Math.sqrt(q); if (r < 0.12) return C('#a82a2a'); if (r < 0.22) return C('#2a7a3a'); if (Math.abs(r - 0.6) < 0.07 || r > 0.9) return seg ? C('#a82a2a') : C('#2a7a3a'); return seg ? C('#1a1614') : C('#c8b898'); });
    P.line(cx + 3, cy - 2, cx + 8, cy - 6, C('#c8c8c8')); P.set(cx + 8, cy - 6, C('#e8402a')); P.line(cx - 5, cy + 4, cx - 9, cy + 1, C('#c8c8c8')); P.set(cx - 9, cy + 1, C('#3a8ae8'));
    P.rect(cx - 22, cy + 22, 44, 22, C('#1e2a24')); P.rect(cx - 24, cy + 20, 48, 2, WD[3]);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4 + k; i++) P.vl(cx - 18 + i * 3 + k * 0, cy + 25 + k * 6, cy + 29 + k * 6, C('#c8d0c8'));
  }
  cueRack(P, x, y) {
    P.rect(x - 2, y, 40, 4, WD[3]); P.rect(x - 2, y + 60, 40, 4, WD[3]);
    for (let k = 0; k < 4; k++) { const cx = x + 4 + k * 9; P.rect(cx, y - 8, 2, 76, k % 2 ? C('#c8a060') : C('#a87a40')); P.rect(cx, y + 56, 2, 12, C('#2a1a10')); P.set(cx, y - 8, C('#3a6ab0')); }
  }
  aquarium(P, x, y, w, h) {
    const st = STW;
    P.rect(x - 8, y - 8, w + 16, h + 16, st[2]); P.rect(x - 6, y - 6, w + 12, h + 12, st[3]); P.hl(x - 8, x + w + 7, y - 8, st[4]); P.hl(x - 8, x + w + 7, y + h + 7, st[0]);
    for (let i = 0; i < w + 12; i += 9) { rivet(P, x - 6 + i, y - 5, st); rivet(P, x - 6 + i, y + h + 3, st); }
    for (let j = 0; j < h; j += 9) { rivet(P, x - 5, y + j, st); rivet(P, x + w + 3, y + j, st); }
    P.rect(x, y, w, h, 0);
    // corner rounding
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) { P.seti(cx, cy, st[3]); }
    P.rect(x + Math.round(w / 2) - 2, y, 4, h, st[2]); P.vl(x + Math.round(w / 2) - 2, y, y + h, st[4]);
    this.aqua = { x, y, w, h };
  }
  curtains(P, x0, x1, top, H) {
    const w = x1 - x0;
    // sun mural + sign
    const cx = x0 + w / 2, sy = top - 30;
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; P.line(cx + Math.cos(a) * 12, sy + Math.sin(a) * 12, cx + Math.cos(a) * 22, sy + Math.sin(a) * 22, C('#8a6a2a')); }
    P.disc(cx, sy, 11, C('#a8802a')); P.set(cx - 4, sy - 2, C('#2a1a10')); P.set(cx + 4, sy - 2, C('#2a1a10')); P.hl(cx - 4, cx + 4, sy + 4, C('#5a2a10'));
    P.rect(x0 + 6, top - 8, w - 12, 9, C('#3a1a14')); text(P, 'LOS CAMARONES', cx, top - 6, C('#d8b060'), { font: 3, align: 'center' });
    // velvet folds
    for (let x = 0; x < w; x++) for (let y = top + 2; y < H - 6; y++) {
      const f = (x % 14) / 14, t = f < 0.15 ? 1 : f < 0.4 ? 3 : f < 0.7 ? 2 : 1;
      const open = Math.abs(x - w / 2) < (y - top) * 0.16 - 4;
      if (open) { P.seti(x0 + x, y, C('#0c0808')); continue; }
      P.seti(x0 + x, y, VEL[t + (ih(x, y >> 3, 2) < 0.1 ? 1 : 0)]);
    }
    for (let x = 0; x < w; x++) { P.seti(x0 + x, top + 1, C('#c8a040')); P.seti(x0 + x, top + 2 + (x % 2), C('#a8802a')); }
    for (const tx of [x0 + 18, x1 - 18]) { P.rect(tx - 3, top + 60, 7, 4, C('#c8a040')); }
  }

  // ------------------------------------------------------------------ the hidden shop's back wall
  buildShopWall() {
    const X0 = AX(wxz(30.4)), W = AX(wxz(46.5)) - X0, Y0 = AY(CEIL), H = AY(WALL_BASE) - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(wxz(xw)) - X0, ly = (yw) => AY(yw) - Y0;
    this.sX0 = X0; this.sY0 = Y0;
    // damask wallpaper
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i % 22, v = j % 26, dx = u - 11, dy = v - 13;
      const motif = Math.abs(Math.abs(dx) * 1.2 + Math.abs(dy) * 0.7 - 7) < 1 || (Math.abs(dx) < 2 && Math.abs(dy) < 2);
      P.d[j * W + i] = motif ? DAM[3] : (ih(i >> 1, j >> 1, 3) < 0.05 ? DAM[1] : DAM[2]);
    }
    const wy = ly(1.7);
    woodPlanks(P, 0, wy, W, H - wy, { dir: 'v', r: WD, pw: 10, seed: 71, gap: C('#0a0605'), lenMin: 400, lenMax: 400, nails: false });
    P.rect(0, wy - 4, W, 4, C('#8a6a2a')); P.hl(0, W - 1, wy - 4, C('#c8a040'));
    // glove pegboard with pairs of colourful gloves
    const gx = lx(32.0), gy = ly(5.6);
    P.rect(gx, gy, 92, 70, C('#5a4028')); for (let j = 4; j < 70; j += 8) for (let i = 4; i < 92; i += 8) P.set(gx + i, gy + j, C('#3a2a18'));
    const glove = ['#d83a3a', '#3a6ad8', '#f0c33c', '#3ad86a', '#c83ad8', '#ff8a2a', '#e8e8e8', '#2a2a2a'];
    for (let k = 0; k < 8; k++) { const x = gx + 10 + (k % 4) * 22, y = gy + 10 + Math.floor(k / 4) * 32, c = R(glove[k], { spread: 0.12 }); P.vl(x + 4, y - 6, y, C('#c8c0a0')); for (const o of [0, 7]) { P.ell(x + o, y + 8, 5, 6, (xx, yy, nx, ny) => (nx + ny < -0.4 ? c[4] : nx + ny > 0.6 ? c[1] : c[2])); P.rect(x + o - 3, y + 13, 6, 4, c[1]); P.hl(x + o - 3, x + o + 2, y + 14, C('#e8e0d0')); } }
    // shelves of jars, crowns, masks and trinkets
    for (const [yw, seed] of [[5.9, 1], [4.6, 2], [3.3, 3]]) {
      const y = ly(yw), xa = lx(35.6), xb = lx(42.4);
      P.rect(xa, y, xb - xa, 4, C('#7a5a2a')); P.hl(xa, xb - 1, y, C('#c8a040')); P.hl(xa, xb, y + 3, WD[0]);
      for (let x = xa + 4; x < xb - 12;) {
        const k = Math.floor(ih(x, seed, 7) * 6);
        if (k === 0) { P.rect(x, y - 12, 10, 12, C('#4a8a8a')); P.rect(x + 1, y - 14, 8, 2, C('#c8a040')); P.disc(x + 5, y - 6, 2, C('#f0c33c')); x += 14; }
        else if (k === 1) { P.poly([x, y, x + 2, y - 10, x + 5, y - 5, x + 8, y - 12, x + 11, y - 5, x + 14, y - 10, x + 16, y], C('#f0c33c')); P.set(x + 8, y - 6, C('#d83a6a')); P.hl(x, x + 16, y - 1, C('#a8802a')); x += 20; }
        else if (k === 2) { P.ell(x + 7, y - 8, 7, 8, C('#c83a3a')); P.ell(x + 4, y - 9, 2, 1.4, C('#f0e8d0')); P.ell(x + 10, y - 9, 2, 1.4, C('#f0e8d0')); P.poly([x + 7, y - 16, x + 4, y - 10, x + 10, y - 10], C('#f0c33c')); x += 17; }
        else if (k === 3) { P.disc(x + 6, y - 7, 6, C('#a8d8e8')); P.disc(x + 6, y - 7, 4, C('#6a4ab0')); P.set(x + 4, y - 9, C('#ffffff')); P.rect(x + 2, y - 2, 9, 2, C('#c8a040')); x += 15; }
        else if (k === 4) { for (let i = 0; i < 3; i++) P.rect(x + i * 5, y - 6 - i * 2, 4, 6 + i * 2, C(['#8a3a8a', '#3a8a5a', '#c87a2a'][i])); x += 18; }
        else { P.poly([x, y, x + 5, y - 14, x + 10, y], C('#ff7a2a')); P.hl(x + 1, x + 9, y - 4, C('#f0f0f0')); P.hl(x + 3, x + 7, y - 9, C('#f0f0f0')); x += 14; }
      }
    }
    // ornate gold mirror + sign
    // tall try-on mirror behind the pedestal
    const mx = lx(34.0), my = ly(2.9);
    P.ell(mx, my, 20, 34, C('#c8a040')); P.ell(mx, my, 17, 31, C('#22223a')); P.line(mx - 10, my - 14, mx + 4, my - 26, C('#4a4a6a')); P.line(mx - 8, my - 6, mx + 2, my - 14, C('#3a3a5a'));
    for (let k = 0; k < 14; k++) { const a = k * TAU / 14; P.disc(mx + Math.cos(a) * 20, my + Math.sin(a) * 34, 2, C('#f0c33c')); }
    P.poly([mx - 8, my - 36, mx, my - 46, mx + 8, my - 36], C('#f0c33c')); P.set(mx, my - 40, C('#ff5aa0'));
    P.rect(lx(37.8) - 46, ly(6.9), 92, 14, C('#2a1a3a')); P.rect(lx(37.8) - 44, ly(6.9) + 2, 88, 10, C('#3a2450'));
    text(P, "MADAM MOLT'S", lx(37.8), ly(6.9) + 4, C('#f0c33c'), { font: 3, align: 'center' });
    // beaded curtain at the back door
    const bx = lx(44.2);
    P.rect(bx - 2, ly(4.0) - 4, 36, 4, C('#c8a040'));
    for (let s = 0; s < 8; s++) for (let j = 0; j < 30; j++) if (j % 2 === 0) P.seti(bx + s * 4, ly(4.0) + j * 2, C(['#ff5aa0', '#f0c33c', '#3ad8c0', '#c070ff'][(s + j) % 4]));
    P.map(0, 0, W, H, (c, x, y) => (BY(x, y) < clamp((14 - y) / 14, 0, 1) * 0.8 ? mixU(c, C('#060408'), 0.4) : undefined));
    this.shopWall = new Layer(P, X0, Y0, WALL_P, 1);
  }

  // ------------------------------------------------------------------ ceiling (perspective beams + pipes)
  buildCeiling() {
    const K = 1300;
    const F = PerspFloor.band(this.x0 - 3, this.x1 + 3, 11.6, CEIL, 1.15, WALL_P, K, (u, v, du, dv, X, Y, p) => {
      const vb = ((v % 160) + 160) % 160, pl = Math.floor(u / 30), pn = Math.floor((u + du) / 30);
      let c;
      if (vb < 30) { const t = vb < 3 ? 4 : vb > 26 ? 0 : 2; c = STW[t]; if (vb > 5 && vb < 24 && Math.floor(u / 26) % 2 === 0 && Math.abs(((u % 26) + 26) % 26 - 13) < 2) c = STW[3]; }
      else if (vb < 44) { const t = vb < 36 ? 3 : vb < 40 ? 2 : 1; c = C(['#2a2018', '#3a2a1e', '#4a3826', '#5a4630', '#6a5238'][t]); }
      else { c = WD[ih(pl, 0, 4) < 0.4 ? 1 : 2]; if (pl !== pn) c = C('#060403'); }
      if (p < 1) c = mixU(c, C('#060504'), (1 - p) * 3);
      return c;
    });
    this.ceil = F.finish();
  }

  // ------------------------------------------------------------------ floor (old boards + rugs + mats)
  buildFloor() {
    const K = 1222;
    const wd = RO(['#22140c', '#321e12', '#462a1a', '#5a3822', '#6e462a']);
    const SEAMC = C('#0e0806'), M1 = C('#1a1a1e'), M2 = C('#202026'), M3 = C('#0e0e12'), FOGF = C('#0a0605'), DK = C('#050303');
    const rugs = [
      { cx: -0.6 * PPU, cv: 1222, rw: 120, rv: 120, pal: [C('#3a1a12'), C('#c8a040'), C('#2a3a6a'), C('#d8c8a0'), C('#7a2218')] },
      { cx: 11.0 * PPU, cv: 1200, rw: 110, rv: 100, pal: [C('#1a2a3a'), C('#a88a3a'), C('#5a2a2a'), C('#b8a888'), C('#2a4a56')], calm: true },
      { cx: 37.2 * PPU, cv: 1222, rw: 240, rv: 140, pal: [C('#2a1030'), C('#c8a040'), C('#5a2048'), C('#a8885a'), C('#3e1a4a')], calm: true },
    ];
    const rugAt = (u, v) => {
      for (const r of rugs) {
        const dx = Math.abs(u - r.cx), dz = Math.abs(v - r.cv);
        if (dx > r.rw || dz > r.rv) continue;
        const e = Math.min(r.rw - dx, r.rv - dz), pal = r.pal;
        if (e < 1.5 && (Math.floor(u / 3) & 1)) return pal[3];
        if (e < 3) return pal[0];
        if (e < 6) return pal[1];
        if (r.calm) { if (e < 9) return pal[0]; const md = Math.abs(dx / r.rw) + Math.abs(dz / r.rv); return Math.abs(md - 0.5) < 0.04 || Math.abs(md - 0.25) < 0.03 ? pal[1] : (Math.floor(dx / 10) + Math.floor(dz / 8)) % 4 === 0 ? pal[2] : pal[4]; }
        return (Math.floor(dx / 8) + Math.floor(dz / 6)) % 3 === 0 ? pal[2] : (Math.abs(dx / r.rw - dz / r.rv) < 0.08 ? pal[3] : pal[4]);
      }
      return 0;
    };
    const F = new PerspFloor(this.x0 - 3, this.x1 + 3, WALL_BASE, -1.72, WALL_P, 1.22, K, (u, v, du, dv, X, Y, p) => {
      const row = Math.floor(v / 22), pvv = ((v % 22) + 22) % 22, rn = Math.floor((v + dv) / 22);
      const L = 150 + Math.floor(ih(row, 1, 5) * 120), off = Math.floor(ih(row, 2, 5) * L);
      const seg = Math.floor((u + off) / L), sn = Math.floor((u + off + du) / L);
      const ps = ih(row, seg, 3);
      let t = ps < 0.25 ? 1 : ps > 0.8 ? 3 : 2;
      if (ih(Math.floor(u / 14), Math.floor(v / 9), 6) < 0.18) t = Math.max(0, t - 1);
      if (pvv < dv + 1) t = Math.min(4, t + 1);
      let c = wd[t];
      if (rn !== row || seg !== sn) c = SEAMC;
      if (ih(Math.floor(u / 2), Math.floor(v / 3), 9) < 0.012) c = wd[0];
      if (u < -15.2 * PPU) { const mu = Math.floor(u / 60), mv = Math.floor(v / 40); c = ((mu + mv) & 1) ? M1 : M2; if (Math.floor((u + du) / 60) !== mu || Math.floor((v + dv) / 40) !== mv) c = M3; }
      const rc = rugAt(u, v); if (rc) c = rc;
      if (p < 0.99) c = mixU(c, FOGF, (1 - p) * 2.4);
      if (p > 1.14 && BY(X, Y) < (p - 1.14) * 9) c = mixU(c, DK, 0.5);
      return c;
    });
    for (let j = 0; j < 6; j++) F.P.map(0, j, F.W, 1, (c, x, y) => (BY(x, y) < 0.8 - j * 0.13 ? mixU(c, C('#040303'), 0.6) : undefined));
    this.floor = F.finish();
  }

  // ------------------------------------------------------------------ furniture at the character plane
  buildMid() {
    const ink = PAL.ink;
    this.mids = [];
    const add = (P, x, y, ox = P.w >> 1, oy = P.h, p = 1) => { P.outline(ink); this.mids.push({ cv: P.canvas(), x, y, ox, oy, p }); };
    // bench press
    { const P = new Pix(96, 60), st = PAL.steelL, lea = RO(['#1a1a2a', '#26263a', '#33334e', '#444466', '#5a5a80']);
      P.rect(10, 36, 70, 7, lea[2]); P.hl(10, 79, 36, lea[4]); P.hl(10, 79, 42, lea[0]);
      for (const x of [16, 70]) { P.rect(x, 43, 4, 17, st[1]); P.rect(x - 6, 57, 16, 3, st[2]); }
      for (const x of [74, 84]) P.rect(x, 4, 3, 56, st[2]);
      P.rect(40, 9, 56, 3, st[3]); P.hl(40, 95, 9, st[4]);
      for (const x of [44, 90]) { P.rect(x - 3, 0, 6, 22, C('#2a2a30')); P.vl(x - 3, 0, 21, C('#4a4a52')); }
      add(P, -22.4, 0); }
    // dumbbell floor rack
    { const P = new Pix(70, 36), st = PAL.steelL;
      P.rect(2, 14, 66, 4, st[2]); P.rect(6, 18, 3, 18, st[1]); P.rect(60, 18, 3, 18, st[1]); P.rect(2, 26, 66, 3, st[2]);
      for (let k = 0; k < 4; k++) { const x = 6 + k * 16, s = 3 + k; P.rect(x, 14 - s * 2, 4, s * 2, C('#24242a')); P.rect(x + 9, 14 - s * 2, 4, s * 2, C('#24242a')); P.hl(x + 2, x + 10, 13 - s, st[3]); }
      add(P, -16.2, 0); }
    // bar counter
    { const x0 = -13.7, x1 = -4.5, w = Math.round((x1 - x0) * PPU), top = AY(0) - AY(1.15), P = new Pix(w + 2, top + 12);
      const wd = PAL.wood, wl = PAL.woodL, br = PAL.brass;
      woodPlanks(P, 1, 20, w, top - 20, { dir: 'v', r: wd, pw: 10, seed: 13, lenMin: 300, lenMax: 300, nails: false });
      for (let x = 8; x < w - 30; x += 58) { P.rect(x, 24, 48, top - 38, wd[1]); P.rect(x + 2, 26, 44, top - 42, wd[2]); P.hl(x + 2, x + 45, 26, wl[3]); P.vl(x + 2, 26, top - 17, wl[3]); P.disc(x + 24, 26 + (top - 42) / 2, 6, wd[3]); P.disc(x + 24, 26 + (top - 42) / 2, 4, wd[1]); }
      P.rect(0, 12, w + 2, 9, wl[3]); P.hl(0, w + 1, 12, PAL.woodP[3]); P.hl(0, w + 1, 13, wl[4]); P.hl(0, w + 1, 20, wd[0]);
      pipeH(P, 0, top - 2, w + 2, 4, br, { ol: C('#2a1a08') });
      for (let x = 30; x < w; x += 90) { P.rect(x, top - 8, 3, 6, br[2]); P.rect(x, top + 2, 3, 10, br[1]); }
      // beer taps + a bowl of snails + napkins
      for (let k = 0; k < 3; k++) { const x = Math.round(w * 0.55) + k * 10; P.rect(x, 2, 3, 10, br[3]); P.rect(x - 1, 0, 5, 3, [C('#c83a2a'), C('#2a6ab0'), C('#3a8a3a')][k]); P.set(x + 1, 11, br[4]); }
      const sx = Math.round((-9.6 - x0) * PPU);
      P.ell(sx, 9, 9, 4, C('#d8d0b8')); P.ell(sx, 8, 7, 2, C('#a89878')); for (let k = 0; k < 5; k++) P.disc(sx - 5 + k * 2.5, 6 - (k % 2), 2, C('#d8a030'));
      P.rect(Math.round(w * 0.2), 4, 8, 8, C('#b8c0c0')); P.rect(Math.round(w * 0.2) + 1, 1, 6, 4, C('#f0f0f0'));
      this.counter = { x0, w, top };
      add(P, x0 - 1 / PPU, 0, 0, top + 12); }
    // stools
    const stool = () => { const P = new Pix(28, 34), s = R('#9c2a2a', { spread: 0.11 }), m = PAL.steelL; for (let y = 8; y < 33; y++) { P.rect(12, y, 3, 1, m[2]); P.set(12, y, m[4]); } P.rect(4, 31, 20, 3, m[2]); P.hl(4, 23, 31, m[4]); P.rect(6, 22, 16, 2, m[3]); P.ell(14, 4, 13, 4, (x, y, nx, ny, q) => (ny < -0.2 ? (q < 0.4 ? s[4] : s[3]) : s[2])); P.rect(1, 4, 26, 3, s[2]); P.hl(1, 26, 6, s[1]); P.rect(2, 7, 24, 2, m[3]); return P; };
    for (const x of [-12.4, -10.9, -9.4, -7.9, -6.4]) add(stool(), x, 0);
    // pool table
    { const w = AX(3.0), P = new Pix(w + 4, 44), wd = PAL.wood, wl = PAL.woodL, felt = RO(['#0e2a1a', '#164a2a', '#1e6a3a', '#2a8a4a', '#3aa85a']);
      P.rect(0, 4, w + 4, 6, wl[3]); P.hl(0, w + 3, 4, wl[4]); P.rect(4, 1, w - 4, 3, felt[2]); P.hl(4, w - 1, 1, felt[3]);
      for (const [bx, c] of [[30, '#f0f0e8'], [62, '#e8c030'], [70, '#c83a2a'], [78, '#2a4ab0'], [90, '#1a1a1a'], [100, '#e86a2a']]) { P.rect(bx, -0 + 0, 4, 2, C(c)); P.set(bx, 0, lightU(C(c), 0.5)); }
      P.rect(2, 10, w, 12, wd[2]); P.hl(2, w + 1, 10, wd[3]); for (let x = 10; x < w - 10; x += 40) { P.rect(x, 12, 24, 8, wd[1]); P.hl(x, x + 23, 12, wd[3]); }
      for (const x of [0, w / 2 - 2, w - 4]) P.rect(x + 2, 4, 6, 4, C('#0a0806'));
      for (const x of [8, w - 14]) { P.rect(x, 22, 9, 18, wd[2]); P.vl(x, 22, 39, wl[3]); P.rect(x - 2, 39, 13, 5, wd[1]); }
      add(P, -0.6, 0.0); this.poolTop = 0.9; }
    // arcade cabinet: "MANTIS MAYHEM"
    { const P = new Pix(44, 88), cab = RO(['#0e1428', '#16204a', '#1e2e6a', '#2a428a', '#3a5aa8']);
      P.poly([2, 88, 40, 88, 40, 50, 36, 44, 40, 10, 38, 0, 4, 0, 2, 10, 6, 44, 2, 50], cab[2]);
      P.vl(2, 50, 87, cab[4]); P.vl(40, 50, 87, cab[0]);
      P.rect(4, 2, 34, 9, C('#1a1a1a')); text(P, 'MANTIS', 21, 3, C('#ff5ab4'), { font: 3, align: 'center' });
      P.rect(7, 13, 28, 24, C('#050808')); P.rect(9, 15, 24, 20, C('#0a1a1a'));
      P.rect(4, 44, 34, 8, cab[3]); P.hl(4, 37, 44, cab[4]); P.rect(10, 41, 2, 4, C('#2a2a2a')); P.disc(11, 40, 2, C('#c83a2a')); for (let k = 0; k < 3; k++) P.disc(20 + k * 6, 47, 1.6, C(['#f0c030', '#3ad8c0', '#ff5ab4'][k]));
      for (let y = 56; y < 84; y += 4) P.hl(8, 34, y, cab[1]); P.rect(16, 66, 10, 8, C('#2a2a2a')); P.rect(18, 68, 6, 3, C('#f0c030'));
      for (let k = 0; k < 6; k++) P.line(4, 20 + k * 10, 6, 16 + k * 10, C('#ff5ab4'));
      add(P, 4.2, 0); this.arcade = { x: 4.2, scr: [9, 15, 24, 20], h: 88 }; }
    // booth: back cushion + seat (Mimi sits here), table drawn in front
    { const w = AX(3.8), P = new Pix(w, 66), v = RO(['#3a0e14', '#5a1620', '#7a2230', '#9a3040', '#b84a58']), wd = PAL.wood;
      P.rect(0, 0, w, 6, wd[3]); P.hl(0, w - 1, 0, wd[4]);
      for (let x = 0; x < w; x++) for (let y = 6; y < 40; y++) { const f = (x % 22) / 22; P.seti(x, y, v[f < 0.12 ? 1 : f < 0.5 ? 3 : 2]); }
      for (let x = 11; x < w; x += 22) for (let y = 12; y < 38; y += 9) P.set(x, y, v[0]);
      P.rect(0, 40, w, 6, v[3]); P.hl(0, w - 1, 40, v[4]); P.rect(0, 46, w, 20, wd[1]); P.hl(0, w - 1, 46, wd[3]);
      for (const x of [0, w - 6]) P.rect(x, 0, 6, 66, wd[2]);
      add(P, 10.9, 0); }
    // jukebox (same model as the cantina)
    this.jukeX = 7.4;
    // mariachi stage platform + instruments
    { const x0 = 15.5, x1 = 20.4, w = AX(x1 - x0), P = new Pix(w + 2, 120), wd = PAL.wood, wl = PAL.woodL;
      const top = 120 - AX(0.42);
      P.rect(0, top, w + 2, 120 - top, wd[2]); P.hl(0, w + 1, top, wl[4]); P.hl(0, w + 1, top + 1, wl[3]);
      for (let x = 0; x < w; x += 20) P.vl(x, top + 3, 119, wd[0]);
      for (let x = 4; x < w; x += 9) P.set(x, top + 8, C('#c8a040'));
      // guitarrón leaning on a stool
      const gx = 22, gy = top;
      P.rect(gx - 8, gy - 26, 16, 3, wd[3]); P.rect(gx - 7, gy - 23, 2, 23, wd[2]); P.rect(gx + 5, gy - 23, 2, 23, wd[2]);
      P.ell(gx + 6, gy - 38, 14, 15, C('#9a5a2a')); P.ell(gx + 6, gy - 38, 4, 4, C('#1a0e08')); P.rect(gx + 4, gy - 80, 4, 30, C('#3a2210')); P.rect(gx + 3, gy - 88, 6, 9, C('#2a1a0c'));
      P.ell(gx + 6, gy - 38, 14, 15, (x, y, nx, ny, q) => (q > 0.8 ? C('#5a3016') : undefined));
      // trumpet on a stand
      const tx = 64; P.vl(tx, top - 30, top - 1, C('#3a3a3a')); P.line(tx, top - 1, tx - 6, top - 1, C('#3a3a3a')); P.line(tx, top - 1, tx + 6, top - 1, C('#3a3a3a'));
      P.rect(tx - 10, top - 36, 18, 3, C('#d8b040')); P.poly([tx + 8, top - 38, tx + 14, top - 42, tx + 14, top - 28, tx + 8, top - 32], C('#f0c860')); P.rect(tx - 4, top - 40, 2, 4, C('#d8b040'));
      // mic stand with a sombrero
      const mx = 110; P.vl(mx, top - 62, top - 1, C('#4a4a4a')); P.hl(mx - 8, mx + 8, top - 1, C('#4a4a4a')); P.disc(mx, top - 64, 3, C('#2a2a2a'));
      P.ell(mx + 2, top - 50, 20, 3, C('#c8a050')); P.ell(mx + 2, top - 56, 7, 6, C('#c8a050')); P.hl(mx - 5, mx + 9, top - 52, C('#a82a2a'));
      // violin case + speaker
      P.rect(150, top - 10, 30, 10, C('#2a1a2a')); P.hl(150, 179, top - 10, C('#4a3a4a')); P.rect(162, top - 8, 6, 2, C('#c8a040'));
      P.rect(w - 30, top - 34, 26, 34, C('#16161a')); P.disc(w - 17, top - 13, 8, C('#2a2a30')); P.disc(w - 17, top - 13, 3, C('#0a0a0a')); P.disc(w - 17, top - 28, 3, C('#2a2a30'));
      add(P, x0, 0, 0, 120); }
    // partition slab between the bar and the shop (cross-section of the bulkhead)
    { const P = new Pix(AX(1.0), AY(0) - AY(CEIL) + 8);
      rustPlates(P, 0, 0, P.w, P.h, { pw: 44, ph: 60, paint: STW, rust: RUSTW, rivet: STW, seam: C('#0a0e0e'), rustAmt: 0.5, seed: 77, stagger: false });
      P.vl(0, 0, P.h - 1, STW[4]); P.vl(P.w - 1, 0, P.h - 1, STW[0]);
      add(P, 31.0, 0, P.w >> 1, P.h - 8); }
    // shop: glass display counter, hat stand, treasure chest, cape rack
    { const w = AX(4.2), P = new Pix(w, 50), gold = PAL.gold, wd = PAL.wood;
      P.rect(0, 0, w, 4, gold[3]); P.hl(0, w - 1, 0, gold[4]);
      P.rect(0, 4, w, 22, C('#1a2a3a')); for (let x = 6; x < w; x += 30) P.line(x, 24, x + 10, 6, C('#3a5a6a'));
      for (let k = 0; k < 9; k++) { const x = 8 + k * 19, c = ['#f0c33c', '#ff5aa0', '#3ad8c0', '#c070ff', '#e8e8e8', '#ff8a2a', '#3a8ae8', '#d83a3a', '#6ad84a'][k]; P.disc(x, 19, 3, C(c)); P.set(x - 1, 18, C('#ffffff')); P.rect(x - 4, 22, 9, 2, gold[2]); }
      P.rect(0, 26, w, 24, wd[2]); for (let x = 4; x < w; x += 24) { P.rect(x, 29, 18, 18, wd[1]); P.hl(x, x + 17, 29, gold[2]); }
      P.hl(0, w - 1, 26, gold[3]);
      add(P, 37.8, 0); }
    { const P = new Pix(40, 96), wd = PAL.wood;
      P.vl(20, 10, 92, wd[3]); P.vl(21, 10, 92, wd[1]); P.hl(8, 32, 93, wd[2]); P.hl(10, 30, 95, wd[1]);
      P.poly([10, 22, 20, 0, 30, 22], C('#ff7a2a')); P.hl(12, 28, 16, C('#f0f0f0')); P.hl(15, 25, 8, C('#f0f0f0'));
      P.ell(9, 40, 9, 2, C('#c8a050')); P.ell(9, 36, 4, 4, C('#c8a050')); P.ell(31, 54, 6, 5, C('#2a2a2a')); P.rect(25, 56, 12, 2, C('#2a2a2a'));
      P.poly([4, 70, 10, 62, 14, 70], C('#f0c33c')); P.set(9, 66, C('#d83a6a'));
      add(P, 32.2, 0); }
    { const P = new Pix(52, 40), wd = PAL.wood, gold = PAL.gold;
      P.rect(2, 16, 48, 24, wd[2]); P.rect(2, 16, 48, 3, gold[2]); P.rect(2, 36, 48, 3, gold[2]); for (const x of [2, 24, 47]) P.rect(x, 16, 3, 24, gold[2]);
      P.poly([2, 16, 6, 2, 46, 2, 50, 16], wd[3]); P.rect(23, 18, 6, 6, gold[3]); P.set(25, 20, C('#1a1a1a'));
      for (let k = 0; k < 26; k++) P.disc(6 + (k * 7) % 40, 12 + Math.floor(k / 6) * 1 - (k % 3), 2, gold[(k % 2) + 3]);
      add(P, 41.3, 0); }
    { const P = new Pix(60, 100), st = PAL.steelL;
      P.vl(4, 6, 99, st[2]); P.vl(55, 6, 99, st[2]); P.hl(4, 55, 6, st[3]); P.hl(0, 10, 99, st[1]); P.hl(50, 59, 99, st[1]);
      const capes = ['#8a2ad0', '#d83a3a', '#2a8ad8', '#f0c33c'];
      for (let k = 0; k < 4; k++) { const x = 9 + k * 12, c = R(capes[k], { spread: 0.1 }); P.vl(x + 4, 6, 10, st[4]); for (let y = 10; y < 70 + k * 3; y++) for (let i = 0; i < 9 + Math.floor((y - 10) / 12); i++) P.seti(x + i - Math.floor((y - 10) / 24), y, i === 0 ? c[3] : (i + y) % 9 === 0 ? c[1] : c[2]); }
      add(P, 43.2, 0); }
    // try-on pedestal (a preview fighter stands on it)
    { const w = AX(1.6), h = AY(0) - AY(0.3), P = new Pix(w, h + 2), gold = PAL.gold, v = RO(['#2a0a20', '#420e30', '#5e1a46', '#7a2a5e', '#923a74']);
      P.rect(0, 0, w, 4, v[3]); P.hl(0, w - 1, 0, v[4]); P.rect(0, 4, w, 2, gold[3]); P.rect(2, 6, w - 4, h - 6, PAL.wood[2]); for (let x = 6; x < w - 4; x += 10) P.vl(x, 7, h - 1, PAL.wood[1]); P.rect(0, h - 2, w, 4, gold[2]); P.hl(0, w - 1, h - 2, gold[4]);
      for (let x = 4; x < w - 4; x += 8) P.set(x, 5, gold[4]);
      add(P, 34.0, 0); }
  }

  // ------------------------------------------------------------------ the door bulkhead (fighter plane)
  buildDoors() {
    const x0 = 20.5, x1 = 30.6, X0 = AX(x0), W = AX(x1) - X0, Y0 = AY(CEIL + 0.2), H = AY(0) - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0, ly = (yw) => AY(yw) - Y0;
    rustPlates(P, 0, 0, W, H, { pw: 88, ph: 64, paint: RO(['#16201e', '#1e2c28', '#283a34', '#344a42', '#425c50']), rust: RUSTW, rivet: STW, seam: C('#090c0c'), rustAmt: 0.55, seed: 81 });
    hazard(P, 0, ly(0.55), W, 10, { per: 16, wear: 0.5, seed: 8, yel: RO(['#4a3a10', '#6a5418', '#9a7a22', '#c09a2c', '#d8b040']) });
    P.vl(0, 0, H - 1, STW[4]); P.vl(1, 0, H - 1, STW[3]);
    this.doorSpr = [];
    this.doorBack = [];
    const themes = [{ name: 'EL POZO', sub: 'THE RUST PIT', icon: 'gear', light: C('#2a6a70'), far: C('#0e2a30') }, { name: 'CANTINA', sub: 'SOGGY BOTTOM', icon: 'cactus', light: C('#8a5a2a'), far: C('#2a160e') }];
    const dw = AX(2.3), dh = AY(0) - AY(3.6);
    this.spots.doors.forEach((dd, i) => {
      const cx = lx(dd.x), top = ly(3.6);
      // heavy frame
      P.rect(cx - dw / 2 - 10, top - 10, dw + 20, dh + 10, STW[2]);
      P.rect(cx - dw / 2 - 10, top - 10, dw + 20, 3, STW[4]); P.vl(cx - dw / 2 - 10, top - 10, top + dh, STW[3]); P.vl(cx + dw / 2 + 9, top - 10, top + dh, STW[0]);
      for (let y = top - 6; y < top + dh; y += 9) { rivet(P, cx - dw / 2 - 6, y, STW); rivet(P, cx + dw / 2 + 5, y, STW); }
      for (let x = cx - dw / 2 - 6; x < cx + dw / 2 + 6; x += 9) rivet(P, x, top - 6, STW);
      // opening (transparent: corridor drawn behind)
      P.rect(cx - dw / 2, top, dw, dh, 0);
      // sign above the door
      const sy = ly(4.75);
      P.rect(cx - 46, sy, 92, 26, C('#0a0c0c')); P.rect(cx - 44, sy + 2, 88, 22, i === 0 ? C('#1e3a3e') : C('#4a2a1a'));
      text(P, themes[i].name, cx, sy + 4, C('#e8d8b0'), { font: 5, align: 'center', shadow: C('#0a0808') });
      text(P, themes[i].sub, cx, sy + 15, C('#a8b8a8'), { font: 3, align: 'center' });
      bolt(P, cx - 41, sy + 5, STW); bolt(P, cx + 40, sy + 5, STW);
      // corridor behind (seen when open): perspective tunnel to the arena
      const B = new Pix(dw, dh), th = themes[i];
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        const nx = (x - dw / 2) / (dw / 2), ny = (y - dh * 0.55) / (dh * 0.55), r = Math.max(Math.abs(nx), Math.abs(ny));
        const ring = Math.floor(r * 6);
        let c = mixU(th.far, C('#000000'), r * 0.5);
        if (ring % 2 === 0 && r > 0.2) c = mixU(c, th.light, 0.18);
        if (r < 0.22) c = BY(x, y) < 0.6 ? th.light : mixU(th.light, th.far, 0.4);
        B.d[y * dw + x] = c;
      }
      if (th.icon === 'gear') { for (let k = 0; k < 8; k++) B.disc(dw / 2 + Math.cos(k * TAU / 8) * 9, dh * 0.55 + Math.sin(k * TAU / 8) * 9, 3, C('#6a4a2a')); B.disc(dw / 2, dh * 0.55, 8, C('#6a4a2a')); B.disc(dw / 2, dh * 0.55, 3, th.far); }
      else { const ccx = dw / 2, ccy = dh * 0.62; B.rect(ccx - 2, ccy - 14, 5, 18, C('#3a7a3a')); B.rect(ccx - 9, ccy - 8, 3, 8, C('#3a7a3a')); B.rect(ccx - 9, ccy - 1, 8, 3, C('#3a7a3a')); B.rect(ccx + 6, ccy - 10, 3, 7, C('#3a7a3a')); B.rect(ccx + 2, ccy - 4, 7, 3, C('#3a7a3a')); }
      this.doorBack.push(B.canvas());
      // the door leaf (heavy riveted plate with a wheel)
      const D = new Pix(dw, dh);
      rustPlates(D, 0, 0, dw, dh, { pw: dw, ph: 40, paint: RO(['#2a1c14', '#3a281c', '#4c3424', '#5e4230', '#72523c']), rust: RUSTW, rivet: RO(['#2a1c14', '#3a281c', '#5e4230', '#7a5a40', '#9a7a58']), seam: C('#100a08'), rustAmt: 0.6, seed: 90 + i, stagger: false });
      D.rect(0, 0, dw, 3, C('#7a5a40')); D.vl(0, 0, dh - 1, C('#6a4a34')); D.vl(dw - 1, 0, dh - 1, C('#140e0a'));
      const wx = dw * 0.7, wy = dh * 0.5;
      D.ring(wx, wy, 7, 10, C('#8a8a7a')); for (let k = 0; k < 4; k++) D.line(wx, wy, wx + Math.cos(k * Math.PI / 4 + 0.4) * 9, wy + Math.sin(k * Math.PI / 4 + 0.4) * 9, C('#6a6a5a')); D.disc(wx, wy, 2.5, C('#4a4a3a'));
      D.rect(4, 14, 6, 14, C('#4a4a40')); D.rect(4, dh - 28, 6, 14, C('#4a4a40'));
      text(D, String(i + 1), dw * 0.35, dh * 0.3, C('#c8b890'), { sc: 3, align: 'center' });
      D.outline(C('#0a0806'));
      this.doorSpr.push(D.canvas());
    });
    this.doorDims = { w: dw, h: dh };
    // the secret shelf (slides aside)
    const S = new Pix(AX(1.5), AY(0) - AY(3.1));
    const sw = S.w, sh = S.h, wd = PAL.wood;
    S.rect(0, 0, sw, sh, wd[1]); S.vl(0, 0, sh - 1, wd[3]); S.vl(sw - 1, 0, sh - 1, wd[0]); S.vl(3, 0, sh - 1, wd[2]); S.vl(sw - 4, 0, sh - 1, wd[2]);
    for (let k = 0; k < 5; k++) {
      const y = 6 + k * Math.floor((sh - 10) / 5) + 24;
      S.rect(2, y, sw - 4, 4, wd[3]); S.hl(2, sw - 3, y, wd[4]);
      for (let x = 6; x < sw - 8;) { const q = Math.floor(ih(x, k, 9) * 5); const c = [C('#5a3a2a'), C('#2a4a3a'), C('#4a3a5a'), C('#7a6a3a'), C('#3a3a4a')][q]; const hgt = 10 + q * 2; if (q === 4) { S.rect(x, y - 8, 12, 8, C('#8a7a5a')); x += 14; continue; } S.rect(x, y - hgt, 4 + (q % 2), hgt, c); S.set(x, y - hgt, lightU(c, 0.3)); x += 6 + (q % 2); }
    }
    // poster pinned across the shelf (the clue)
    S.rect(sw / 2 - 14, 16, 28, 34, C('#c8b890')); S.disc(sw / 2, 30, 8, C('#6a2ab0')); S.disc(sw / 2, 30, 3, C('#2fe0a0')); text(S, '???', sw / 2, 40, C('#3a2a20'), { font: 3, align: 'center' });
    S.outline(C('#0a0806'));
    this.secretCv = S.canvas();
    // the passage behind the shelf
    const Q = new Pix(S.w, S.h);
    for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) { const nx = Math.abs(x - Q.w / 2) / (Q.w / 2); Q.d[y * Q.w + x] = nx > 0.8 ? C('#0a0610') : (BY(x, y) < 0.3 + (1 - nx) * 0.3 ? C('#3a1e4a') : C('#1a0e24')); }
    for (let s = 0; s < 6; s++) for (let j = 0; j < Q.h / 2; j += 2) Q.seti(8 + s * 9, 4 + j, C(['#ff5aa0', '#f0c33c', '#3ad8c0'][(s + j) % 3]));
    P.rect(lx(29.6) - S.w / 2, ly(3.1), S.w, S.h, 0);
    this.passageCv = Q.canvas();
    // lamps over the doors
    const L = new Pix(22, 13);
    L.rect(0, 0, 22, 3, STW[3]); L.hl(0, 21, 0, STW[4]); L.rect(3, 3, 16, 2, STW[2]);
    L.ell(11, 5, 7, 7, (x, y, nx, ny, q) => (ny < 0 ? undefined : q > 0.55 ? C('#c8b060') : ny < 0.45 ? C('#fff0b0') : C('#e8d080')));
    L.vl(7, 5, 11, STW[1]); L.vl(11, 5, 12, STW[1]); L.vl(15, 5, 11, STW[1]); L.hl(5, 17, 8, STW[1]);
    L.outline(C('#0a0a0a'));
    for (const dd of this.spots.doors) P.blit(L, lx(dd.x) - 11, ly(5.05));
    P.outline(C('#060808'));
    this.bulk = { cv: P.canvas(), X: X0, Y: Y0 };
    const len = AY(0) - AY(5.0);
    const cone = coneSprite(len, 16, 120, 0, C('#b8a870'), [0.08, 0.16], { floorY: len - 2, fade: 0.8 });
    this.doorCone = { cv: cone.canvas(), ax: cone.ax };
    const pl = AY(0.3) - AY(CEIL + 0.1), pc = coneSprite(pl, 10, 70, 0, C('#e8c860'), [0.06, 0.13], { floorY: pl - 1, fade: 0.9 });
    this.pedCone = { cv: pc.canvas(), ax: pc.ax };
  }

  // ------------------------------------------------------------------ foreground
  buildFront() {
    // booth table (in front of Mimi)
    const T = new Pix(64, 44), wd = PAL.wood, wl = PAL.woodL;
    T.rect(0, 0, 64, 5, wl[3]); T.hl(0, 63, 0, PAL.woodP[3]); T.hl(0, 63, 4, wd[0]);
    T.rect(29, 5, 6, 36, wd[2]); T.vl(29, 5, 40, wl[3]); T.rect(18, 40, 28, 4, wd[2]);
    // milkshake with two straws + a candle in a glass
    T.rect(10, -0, 1, 1, 0);
    const M2 = new Pix(64, 30);
    M2.blit(T, 0, 0);
    T.outline(PAL.ink);
    this.boothTable = T.canvas();
    const S = new Pix(14, 22);
    S.poly([2, 6, 12, 6, 10, 21, 4, 21], C('#ffb6d9')); S.ell(7, 6, 5, 3, C('#fff0f6')); S.set(7, 2, C('#e8302a')); S.disc(7, 3, 1.5, C('#e8302a'));
    S.line(9, 5, 12, 0, C('#3ad8c0')); S.line(5, 5, 4, 0, C('#f0c33c')); S.vl(4, 7, 20, C('#ffe0ee')); S.outline(PAL.ink);
    this.shake = S.canvas();
    // dark foreground silhouettes along the bottom
    const ink = C('#060405'), ink2 = C('#0c0809');
    const X0 = AX(this.x0 - 4), W = AX(this.x1 + 4) - X0, Y0 = AY(-0.45), H = AY(-2.2) - Y0;
    const P = new Pix(W, H);
    const lx = (xw) => AX(xw) - X0;
    for (const xw of [-23, -11, 6, 18.5, 34]) { const x = lx(xw); P.rect(x, 6, 5, H, ink); P.rect(x + 38, 6, 5, H, ink); for (let i = 0; i < 43; i++) P.rect(x + i, Math.round(4 - Math.sin((i / 42) * Math.PI) * 4), 1, 7, ink); for (let k = 1; k < 4; k++) P.rect(x + k * 10, 10, 3, 16, ink); P.rect(x - 2, 26, 47, 4, ink2); }
    this.front = new Layer(P, X0, Y0, 1.25, 1);
  }

  neonSign(word, cols, cols2, icon) {
    const w = textW(word, 5, 2, 1) + 40, H = 36;
    const mk = (on) => {
      const P = new Pix(w, H);
      P.rect(2, 4, w - 4, 26, C('#120e14')); P.hl(2, w - 3, 4, C('#2a2430')); bolt(P, 6, 8, PAL.steel); bolt(P, w - 7, 8, PAL.steel);
      const [c, hl, rim] = (on ? cols : ['#4a2a3a', '#5a3a4a', '#2a1a22']).map(C);
      text(P, word, w / 2 + 8, 10, c, { sc: 2, align: 'center', outline: rim });
      text(P, word, w / 2 + 8, 10, (x, y, gx, gy) => (gy === 0 ? hl : c), { sc: 2, align: 'center' });
      const [k1, , kr] = (on ? cols2 : ['#1a4a44', '#2a5a54', '#0e2a28']).map(C);
      if (icon === 'cocktail') { const x = 14, y = 10; P.line(x - 6, y, x + 6, y, k1); P.line(x - 6, y, x, y + 8, k1); P.line(x + 6, y, x, y + 8, k1); P.vl(x, y + 8, y + 14, k1); P.hl(x - 4, x + 4, y + 14, k1); P.line(x + 2, y - 4, x + 4, y + 2, kr); P.set(x + 3, y + 2, C(on ? '#ff5ab4' : '#3a2a30')); }
      if (icon === 'ball') { const x = 14, y = 17; P.ring(x + 0.5, y + 0.5, 6, 7.5, k1); P.disc(x + 0.5, y + 0.5, 2.2, kr); P.set(x, y, k1); }
      return P.canvas();
    };
    return { on: mk(true), off: mk(false), w };
  }

  // ------------------------------------------------------------------ API
  setDoor(i, open, instant = false) { if (i === 0 || i === 1) { this.doorTarget[i] = clamp(open, 0, 1); if (instant) this.doorOpen[i] = this.doorTarget[i]; } }
  setSecretDoor(open, instant = false) { this.secretTarget = clamp(open, 0, 1); if (instant) this.secret = this.secretTarget; }
  doorVotes(i, n) { if (i === 0 || i === 1) this.votes[i] = Math.max(0, n | 0); }
  setDark(a) { this.dark = clamp(a || 0, 0, 1); }

  update(dt) {
    this.t += dt;
    this.fish.update(dt); this.bub.update(dt); this.fx.update(dt);
    this.bart.update(dt); this.molt.update(dt);
    for (let i = 0; i < 2; i++) this.doorOpen[i] += (this.doorTarget[i] - this.doorOpen[i]) * Math.min(1, dt * 4);
    this.secret += (this.secretTarget - this.secret) * Math.min(1, dt * 3);
    this.bag.v += (-this.bag.a * 3 - this.bag.v * 0.7) * dt + Math.sin(this.t * 0.7) * 0.004;
    this.bag.a += this.bag.v * dt;
    this.neonT -= dt;
    if (this.neonT <= 0) { this.neonOn = Math.random() < 0.94 ? 1 : 0; this.neonT = this.neonOn ? 1 + Math.random() * 5 : 0.06 + Math.random() * 0.1; }
    if (Math.random() < dt * 1.2) this.fx.spawn('note', this.jukeX + (Math.random() - 0.5) * 0.4, 2.0, { g: 0.9, vx: (Math.random() - 0.5) * 0.4, life: 1.8, drag: 1.5, v: Math.floor(Math.random() * 6) });
  }
  // punch the bag (call when Jim hits it); power ~0.3 (jab) .. 1.5 (big hit); dir -1 = pushed left
  punchBag(power = 1, dir = -1) { this.bag.v += dir * 1.2 * power; this.bag.hitT = 0.12; this.fx.burst('chunk', -19.8 + 0.25 * -dir, 1.9, 2 + Math.round(power * 2), 1.5, { g: -4, life: 0.5, col: '#c8b8a0' }); }
  moltTalk(b) { this.molt.setTalk(b); }
  moltMood(name) { this.molt.setMood(name); }

  drawBack(d, t) {
    const g = d.g;
    this.sea.draw(d);
    this.fish.draw(d, t);
    this.bub.draw(d, t, 0.45, 0.55);
    this.wall.draw(d);
    this.shopWall.draw(d);
    // neon + TV + string lights on the wall plane
    const N = this.neonBar;
    drawAt(d, this.neonOn ? N.on : N.off, AX(wxz(this.neonBarPos.x)) - N.w / 2, AY(this.neonBarPos.y), WALL_P, 1);
    const NP = this.neonPool;
    drawAt(d, (this.neonOn || Math.floor(t * 3) % 5) ? NP.on : NP.off, AX(wxz(this.neonPoolPos.x)) - NP.w / 2, AY(this.neonPoolPos.y), WALL_P, 1);
    this.drawTV(d, t);
    this.ceil.draw(d);
    this.floor.draw(d);
    // pendant lamps over the bar and the pool table (dithered cones)
    this.drawLamps(d, t);
    if (this.showBartender) this.bart.draw(d, t, 0.985);
    if (this.showMolt) this.molt.draw(d, t, 1);
    // spotlight on the try-on pedestal
    if (this.secret > 0.3) drawAt(d, this.pedCone.cv, AX(this.spots.pedestal.x) - this.pedCone.ax, AY(CEIL + 0.1), 1, 1);
    this.snow.draw(d, t, 'back');
  }
  drawTV(d, t) {
    const g = d.g, x = pbx(d, wxz(this.tvPos.x), WALL_P), y = pby(d, this.tvPos.y, 1);
    g.fillStyle = '#0c0c10'; g.fillRect(x - 22, y - 2, 44, 32); g.fillStyle = '#2a2a30'; g.fillRect(x - 20, y, 40, 28);
    g.fillStyle = '#16302e'; g.fillRect(x - 18, y + 2, 36, 22);
    // tiny fight on the TV (two blobs trading blows) + scanlines
    const f = Math.floor(t * 6) & 3;
    g.fillStyle = '#e8a040'; g.fillRect(x - 10 + (f === 1 ? 2 : 0), y + 10, 5, 9); g.fillRect(x - 9 + (f === 1 ? 2 : 0), y + 7, 4, 3);
    g.fillStyle = '#3a8ae8'; g.fillRect(x + 5 - (f === 3 ? 2 : 0), y + 10, 5, 9); g.fillRect(x + 6 - (f === 3 ? 2 : 0), y + 7, 4, 3);
    if (f === 1) { g.fillStyle = '#fff0a0'; g.fillRect(x + 2, y + 11, 2, 2); }
    g.fillStyle = '#2a4a3a'; g.fillRect(x - 18, y + 20, 36, 4);
    g.fillStyle = 'rgba(0,0,0,0)';
    g.fillStyle = '#0c1a18'; for (let k = 0; k < 22; k += 2) g.fillRect(x - 18, y + 2 + k, 36, 1);
    g.fillStyle = '#0c0c10'; g.fillRect(x - 2, y - 10, 4, 8);
  }
  drawLamps(d, t) {
    const g = d.g;
    if (!this.pendant) {
      const Q = new Pix(18, 10), cu = RO(['#3a160c', '#5a2614', '#8a3e1e', '#b8602c', '#d88a44']);
      Q.poly([5, 0, 13, 0, 17, 8, 1, 8], (x, y) => (x < 6 ? cu[4] : x < 9 ? cu[3] : x < 13 ? cu[2] : cu[1])); Q.hl(1, 16, 8, cu[0]); Q.hl(3, 14, 9, C('#fff0c0'));
      Q.outline(PAL.ink); this.pendant = Q.canvas();
      const len = AY(1.15) - AY(3.5), c = coneSprite(len, 14, 64, 0, C('#d8b070'), [0.06, 0.12], { floorY: len - 1, fade: 0.9 }); this.pendCone = { cv: c.canvas(), ax: c.ax };
    }
    for (const lx of [-12.0, -9.3, -6.6]) {
      const x = d.bx(lx), y0 = pby(d, CEIL + 0.6, 1), y1 = d.by(3.7);
      g.fillStyle = '#121010'; g.fillRect(x, y0, 1, y1 - y0);
      drawAt(d, this.pendCone.cv, AX(lx) - this.pendCone.ax, AY(3.5), 1, 1);
      g.drawImage(this.pendant, x - 8, y1);
    }
    // pool table lamp: green shade with a dithered pool of light on the felt
    const px = d.bx(-0.6), py0 = pby(d, CEIL + 0.6, 1), py1 = d.by(3.0);
    g.fillStyle = '#121010'; g.fillRect(px - 20, py0, 1, py1 - py0); g.fillRect(px + 20, py0, 1, py1 - py0);
    g.fillStyle = '#1e4a2a'; g.fillRect(px - 36, py1, 72, 8); g.fillStyle = '#2e6a3a'; g.fillRect(px - 36, py1, 72, 2); g.fillStyle = '#0e2a16'; g.fillRect(px - 36, py1 + 7, 72, 1);
    g.fillStyle = '#c8a040'; g.fillRect(px - 36, py1 + 8, 72, 1); g.fillStyle = '#f0e8c0'; g.fillRect(px - 30, py1 + 9, 60, 1);
    if (!this.poolCone) { const l = AY(0.9) - AY(3.0) - 10, c = coneSprite(l, 64, 110, 0, C('#c8d0a0'), [0.06, 0.12], { floorY: l - 1, fade: 1 }); this.poolCone = { cv: c.canvas(), ax: c.ax }; }
    g.drawImage(this.poolCone.cv, px - this.poolCone.ax, py1 + 10);
    // door lamps
    for (const dd of this.spots.doors) drawAt(d, this.doorCone.cv, AX(dd.x) - this.doorCone.ax, AY(5.0), 1, 1);
  }
  drawMid(d, t) {
    const g = d.g;
    // door corridors + leaves behind the bulkhead opening
    const dw = this.doorDims.w, dh = this.doorDims.h;
    this.spots.doors.forEach((dd, i) => {
      const x = d.bx(dd.x) - (dw >> 1), y = d.by(3.6);
      g.drawImage(this.doorBack[i], x, y);
      const o = this.doorOpen[i], lw = Math.max(1, Math.round(dw * Math.cos(o * Math.PI * 0.46)));
      if (o > 0.02) { g.fillStyle = '#060404'; g.fillRect(x + lw, y, 3, dh); }
      g.drawImage(this.doorSpr[i], 0, 0, dw, dh, x, y, lw, dh);
    });
    // secret passage + sliding shelf
    const sp = this.spots.secret, sw = this.secretCv.width, sh = this.secretCv.height;
    const sx = d.bx(sp.x) - (sw >> 1), sy = d.by(3.1);
    g.drawImage(this.passageCv, sx, sy);
    // the bulkhead wall with the door frames
    d.layer(this.bulk.cv, this.bulk.X, this.bulk.Y, 1, 1);
    g.drawImage(this.secretCv, sx + Math.round(this.secret * AX(1.55)), sy);
    // vote markers: little lamps on each door sign
    this.spots.doors.forEach((dd, i) => {
      const n = Math.min(4, this.votes[i]), x = d.bx(dd.x), y = d.by(4.75) + 26;
      for (let k = 0; k < 4; k++) { g.fillStyle = '#0a0a0a'; g.fillRect(x - 17 + k * 9, y + 1, 7, 5); g.fillStyle = k < n ? (Math.floor(t * 4 + k) & 1 ? '#ffd040' : '#ffb020') : '#3a3020'; g.fillRect(x - 16 + k * 9, y + 2, 5, 3); }
    });
    // furniture
    for (const m of this.mids) g.drawImage(m.cv, d.bx(m.x) - m.ox, d.by(m.y) - m.oy);
    // arcade screen animation
    this.drawArcade(d, t);
    // jukebox
    const jf = Math.floor(t * 4) & 3, jk = this.juke || (this.juke = [0, 1, 2, 3].map((f) => jukeboxSprite(0, f)));
    const J = jk[jf]; g.drawImage(J.cv, d.bx(this.jukeX) - J.ox, d.by(0) - J.oy - ((jf & 1) ? 1 : 0));
    // punching bag
    this.drawBag(d, t);
    // shop darkness while the secret door is shut
    const shade = 1 - this.secret;
    if (shade > 0.02) { const x0 = d.bx(31.5), x1 = d.bx(47); if (x1 > 0 && x0 < d.vw) d.dither('#040206', Math.min(0.94, shade * 1.2), Math.max(0, x0), 0, Math.min(d.vw, x1) - Math.max(0, x0), d.vh); }
    this.bub.draw(d, t, 0.99, 1.01);
    this.fx.draw(d, t);
  }
  drawArcade(d, t) {
    const g = d.g, A = this.arcade, x = d.bx(A.x) - 22 + A.scr[0], y = d.by(0) - A.h + A.scr[1];
    const f = Math.floor(t * 5) % 4;
    g.fillStyle = '#0e2a3a'; g.fillRect(x, y, A.scr[2], A.scr[3]);
    g.fillStyle = '#1e4a5a'; g.fillRect(x, y + 15, A.scr[2], 5);
    g.fillStyle = '#ff5ab4'; g.fillRect(x + 4 + (f === 1 ? 2 : 0), y + 8, 3, 7);
    g.fillStyle = '#3ad8c0'; g.fillRect(x + 16 - (f === 3 ? 2 : 0), y + 8, 3, 7);
    if (f === 1 || f === 3) { g.fillStyle = '#fff0a0'; g.fillRect(x + 11, y + 9, 2, 2); }
    g.fillStyle = '#f0c030'; g.fillRect(x + 2, y + 2, 7, 1); g.fillRect(x + 15, y + 2, 7 - (f >> 1), 1);
    if ((Math.floor(t * 1.5) & 7) === 0) { g.fillStyle = '#ffffff'; g.fillRect(x + 6, y + 4, 12, 1); }
  }
  drawBag(d, t) {
    const g = d.g, ax = d.bx(-19.8), ay = pby(d, CEIL + 0.5, 1), L = AY(2.7) - AY(CEIL + 0.5);
    const a = Math.round(this.bag.a * 40) / 40; if (this.bag.hitT > 0) this.bag.hitT -= 1 / 60;
    const bx = Math.round(ax + Math.sin(a) * L), by = Math.round(ay + Math.cos(a) * L);
    g.fillStyle = '#3a3a3a';
    for (let i = 0; i < L; i += 3) g.fillRect(Math.round(ax + Math.sin(a) * i), ay + Math.round(Math.cos(a) * i), (i / 3) & 1 ? 1 : 2, 2);
    if (!this.bagCv) {
      const B = new Pix(28, 70), lea = RO(['#2a0c0c', '#4a1414', '#6a1e1e', '#8a2a26', '#a8402e']);
      for (let y = 6; y < 66; y++) for (let x = 2; x < 26; x++) B.seti(x, y, lea[x < 5 ? 3 : x < 9 ? 4 : x > 21 ? 1 : 2]);
      B.rect(2, 6, 24, 4, C('#1a1a1a')); B.rect(2, 62, 24, 4, C('#1a1a1a'));
      for (let y = 20; y < 60; y += 12) B.hl(3, 25, y, lea[1]);
      B.rect(8, 30, 12, 9, C('#d8c8a0')); text(B, 'J', 14, 31, C('#a82a2a'), { font: 5, align: 'center' });
      B.line(14, 0, 4, 6, C('#5a5a5a')); B.line(14, 0, 24, 6, C('#5a5a5a'));
      B.outline(PAL.ink);
      this.bagCv = B.canvas();
    }
    g.drawImage(this.bagCv, bx - 14, by);
  }
  drawFront(d, t) {
    const g = d.g;
    g.drawImage(this.boothTable, d.bx(11.25) - 32, d.by(0.95));
    g.drawImage(this.shake, d.bx(11.5) - 7, d.by(0.95) - 21);
    this.front.draw(d);
    this.snow.draw(d, t, 'front');
  }
}
const NEON = { pink: ['#ff5ab4', '#ff9ad0', '#a02a6a'], cyan: ['#3af0d8', '#b0fff0', '#1a8a80'] };
