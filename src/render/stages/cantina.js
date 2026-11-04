// SOGGY BOTTOM CANTINA: dirty underwater bar with tables, stools, bottles, a jukebox,
// a wagon-wheel chandelier of anglerfish lures, a fish pinata and Don Pulpo the bartender.
import * as THREE from 'three';
import { VoxelGrid, shadeColor, vhash, meshVoxels } from '../voxel.js';
import { StageBase } from './stageBase.js';
import { mat, mesh, woodPaint, rustPaint, chainGrid, papelPicado, swayPapel, barnacles, rockGrid, WOOD, VS_BIG, VS_MED, VS_SM, VS_XS } from './kit.js';
import { algaeField, algaeMesh } from '../env.js';
import { valueNoise2, seeded } from '../../core/math.js';
import { buildBartender } from './npcs.js';

const BOTTLE_COLS = [0x3a8a3a, 0x8a3a2a, 0x2a5a9a, 0xb08a2a, 0x6a2a8a, 0x2a8a8a];

export class CantinaView extends StageBase {
  constructor(scene, renderer, particles, fx, sim) {
    super(scene, renderer, particles, fx);
    this.sim = sim;
    this.scene.background = new THREE.Color(0x1a1410);
    this.scene.fog = new THREE.FogExp2(0x221a14, 0.026);
    this.baseEnv({
      light: { sunPos: [-4, 30, 8], target: [0, 0, -2], angle: 0.4, sunColor: 0xffe2b8, sunIntensity: 2.2, hemiSky: 0xc89a6a, hemiGround: 0x2a1a10, hemiIntensity: 0.55 },
      backdrop: { top: 0x3a2a1a, mid: 0x1a120c, bottom: 0x0a0604 },
      rays: { count: 5, x0: -12, x1: 12, z0: -6.5, z1: -2, y: 4, h: 12, opacity: 0.07, color: 0xffd8a0 },
      snow: { box: [-16, 16, -1, 10, -8, 5], color: 0xffe8c0, count: 500 },
      fish: false,
    });
    this.lights.fill.color.set(0x7a5a8a);
    this.build();
  }

  build() {
    const S = this.scene;
    const r = seeded(9);
    // ---------------- floor: worn wooden planks + rug
    const FW = 288, FD = 100;
    const fg = new VoxelGrid(FW, 3, FD);
    const wp = woodPaint(2, { plank: 6, axis: 'x', wet: true });
    fg.box(0, 0, 0, FW, 3, FD, (x, y, z) => {
      if (y < 2) return WOOD[0];
      // rug in the middle
      if (x > 108 && x < 180 && z > 40 && z < 66) {
        const ex = Math.min(x - 108, 180 - x), ez = Math.min(z - 40, 66 - z);
        if (ex < 2 || ez < 2) return 0xf0c33c;
        const band = Math.floor(z / 3) % 4;
        if ((x + z) % 8 === 0) return 0xf5e6c4;
        return [0x9c1f1f, 0xd8622a, 0x2a6a8a, 0x9c1f1f][band];
      }
      return wp(x, y, z);
    });
    S.add(mesh(fg, VS_BIG, [FW / 2, 3, 58], [0, 0, 0], { cast: false }));
    // front edge beam so the floor never ends in a void
    const edge = new VoxelGrid(FW, 10, 3); edge.box(0, 0, 0, FW, 10, 3, (x, y) => (y === 9 ? WOOD[3] : WOOD[1]));
    S.add(mesh(edge, VS_BIG, [FW / 2, 10, 0], [0, 0, 5.2], { cast: false }));
    // ---------------- back wall: adobe plaster + wood wainscot + shelves
    const BW = 300, BH = 80;
    const bg = new VoxelGrid(BW, BH, 4);
    bg.box(0, 0, 0, BW, BH, 2, (x, y, z) => {
      if (y < 18) return (x % 10 === 0) ? WOOD[0] : WOOD[2 + (vhash(Math.floor(x / 10), 0, 0, 3) < 0.4 ? 1 : 0)];
      if (y === 18 || y === 19) return WOOD[1];
      const n = valueNoise2(x * 0.08, y * 0.08, 5);
      if (n > 0.78) return 0x8a6a4a; // exposed brick
      if (n < 0.12) return 0x6a8a5a; // algae stain
      return vhash(x, y, 0, 2) < 0.1 ? 0xc8a878 : 0xd8b888;
    });
    // cracks
    for (let i = 0; i < 12; i++) { let x = 20 + Math.floor(r() * 260), y = 30 + Math.floor(r() * 40); for (let k = 0; k < 14; k++) { bg.set(x, y, 2, 0x6a4a30); x += r() < 0.5 ? 1 : 0; y -= 1; } }
    S.add(mesh(bg, VS_BIG, [BW / 2, 0, 0], [0, 0, -6.2], { cast: false }));
    // bottle shelves behind the bar (right side)
    this.shelfBottles = [];
    for (let row = 0; row < 3; row++) {
      const sh = new VoxelGrid(80, 2, 10); sh.box(0, 0, 0, 80, 2, 10, WOOD[3]);
      S.add(mesh(sh, VS_SM, [40, 2, 5], [9.2, 2.1 + row * 1.0, -5.5]));
      for (let k = 0; k < 12; k++) {
        const c = BOTTLE_COLS[(k + row * 3) % BOTTLE_COLS.length];
        const g = new VoxelGrid(5, 12, 5);
        g.cylinder('y', 2.5, 2.5, 0, 7, 2.2, { c, e: 70 }); g.cylinder('y', 2.5, 2.5, 7, 11, 1, { c, e: 70 }); g.box(2, 11, 2, 3, 12, 3, 0xb5561f);
        const m = mesh(g, VS_XS, [2.5, 0, 2.5], [6.9 + k * 0.42 + r() * 0.1, 2.22 + row * 1.0, -5.4 + r() * 0.3]);
        S.add(m); this.shelfBottles.push({ m, by: m.position.y, v: 0, fall: false });
      }
    }
    // mirror behind bar
    const mir = new VoxelGrid(40, 18, 1); mir.box(0, 0, 0, 40, 18, 1, (x, y) => (x < 2 || x > 37 || y < 2 || y > 15 ? 0xb88a1e : { c: 0x6a8aa0, e: 30 }));
    S.add(mesh(mir, VS_SM, [20, 0, 0.5], [9.2, 5.4, -5.9], { cast: false }));
    // ---------------- bar counter (sim plat y=1.2 from 6.6 to 12)
    const cw = Math.round(5.6 / VS_SM);
    const cg = new VoxelGrid(cw, 20, 22);
    cg.box(0, 0, 0, cw, 18, 20, (x, y, z) => (y < 2 ? WOOD[0] : (z === 19 && y > 3 && y < 16 && (x % 12 === 0) ? WOOD[1] : WOOD[2 + ((Math.floor(x / 6) + Math.floor(y / 4)) % 2)])));
    cg.box(0, 18, 0, cw, 20, 22, (x, y, z) => (y === 19 ? 0x9c6436 : WOOD[1])); // countertop overhang
    cg.box(0, 3, 21, cw, 4, 22, 0xd8a83a); // brass foot rail
    S.add(mesh(cg, VS_SM, [0, 20, 11], [6.6, 1.2, -0.35]));
    // ---------------- balcony (left, y=3.1) with railing + stairs
    const bw = Math.round(3.9 / VS_SM);
    const balc = new VoxelGrid(bw, 26, 40);
    balc.box(0, 22, 0, bw, 26, 40, (x, y, z) => (y === 25 ? WOOD[3 - (x % 6 === 0 ? 1 : 0)] : WOOD[1]));
    for (let x = 2; x < bw; x += 7) balc.box(x, 26, 38, x + 2, 26 + 0, 40, WOOD[2]);
    balc.box(bw - 3, 0, 36, bw, 22, 40, WOOD[1]); // support post
    S.add(mesh(balc, VS_SM, [bw, 26, 20], [-8.2, 3.1, -1.2]));
    const rail = new VoxelGrid(bw, 14, 2);
    rail.box(0, 12, 0, bw, 14, 2, WOOD[2]);
    for (let x = 0; x < bw; x += 5) rail.box(x, 0, 0, x + 1, 12, 2, WOOD[3]);
    S.add(mesh(rail, VS_SM, [bw, 0, 1], [-8.2, 3.1, 1.0]));
    // ---------------- tables (visual for table plats) + jukebox, chandelier, pinata handled as props
    this.tables = [];
    for (const pl of this.sim.s.plats.filter((p) => p.kind === 'table')) {
      const tg = new VoxelGrid(34, 16, 24);
      tg.cylinder('y', 17, 12, 13, 16, 15.5, (x, y, z) => (y === 15 ? WOOD[3 + ((x + z) % 7 === 0 ? 1 : 0)] : WOOD[1]));
      tg.cylinder('y', 17, 12, 0, 13, 2, WOOD[1]);
      tg.cylinder('y', 17, 12, 0, 1.5, 7, WOOD[0]);
      const m = mesh(tg, VS_SM, [17, 16, 12], [(pl.x0 + pl.x1) / 2, pl.y, -0.25]);
      S.add(m);
      const broken = new THREE.Group();
      for (let i = 0; i < 4; i++) { const bgp = new VoxelGrid(14, 3, 8); bgp.box(0, 0, 0, 14, 3, 8, WOOD[2 + (i % 2)]); const bm = mesh(bgp, VS_SM, [7, 0, 4], [(pl.x0 + pl.x1) / 2 + (i - 1.5) * 0.5, 0.02, -0.3 + (i % 2) * 0.3], { rot: [0, i * 0.8, 0.1 * i] }); broken.add(bm); }
      broken.visible = false; S.add(broken);
      this.tables.push({ id: pl.id, m, broken });
    }
    // ---------------- portholes with ocean view + wanted posters + neon sign
    for (const x of [-4.5, 1.5]) {
      const ph = new VoxelGrid(22, 22, 3);
      ph.cylinder('z', 11, 11, 0, 3, 10.5, (X, Y, Z) => (Z === 2 ? 0xb88a1e : null));
      ph.cylinder('z', 11, 11, 0, 2, 8.4, { c: 0x2a8fa8, e: 120 });
      ph.cylinder('z', 11, 11, 2, 3, 8.4, null, { mode: 'carve' });
      S.add(mesh(ph, VS_SM, [11, 11, 0], [x, 5.4, -6.0], { cast: false }));
    }
    const poster = (x, y, cols, seed) => {
      const pg = new VoxelGrid(16, 22, 1);
      pg.box(0, 0, 0, 16, 22, 1, (X, Y) => {
        if (X === 0 || X === 15 || Y === 0 || Y === 21) return 0xbfa274;
        if (Y > 16) return cols[0];
        if (Y > 5 && Y < 15 && X > 3 && X < 12) return ((X - 7.5) ** 2 + (Y - 10) ** 2 < 12) ? cols[1] : 0xf5e6c4;
        if (Y < 5 && Y > 1 && X > 2 && X < 13 && (X % 2)) return 0x3a2a20;
        return 0xf5e6c4;
      });
      S.add(mesh(pg, VS_SM, [8, 0, 0.5], [x, y, -6.05], { cast: false, rot: [0, 0, (seed - 1) * 0.05] }));
    };
    poster(-1.3, 2.6, [0xd8322a, 0x6a2ab0], 1); poster(-0.1, 2.8, [0x2a6a8a, 0xf0c33c], 2); poster(4.3, 2.7, [0xf0c33c, 0x3a8a3a], 0);
    // neon "CANTINA" sign made of glowing jelly tubes
    const letters = { C: ['XXX', 'X..', 'X..', 'X..', 'XXX'], A: ['XXX', 'X.X', 'XXX', 'X.X', 'X.X'], N: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'], I: ['XXX', '.X.', '.X.', '.X.', 'XXX'] };
    const word = 'CANTINA';
    const ng = new VoxelGrid(word.length * 8 + 4, 26, 2);
    [...word].forEach((ch, i) => letters[ch].forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === 'X') ng.box(2 + i * 8 + k * 2, 22 - j * 4 - 3, 0, 2 + i * 8 + k * 2 + 2, 22 - j * 4, 2, { c: i % 2 ? 0xff4fa0 : 0x4fe8d0, e: 255 }); }));
    this.neon = mesh(ng, VS_SM, [ng.sx / 2, 0, 1], [-4.2, 6.6, -5.9], { cast: false });
    S.add(this.neon);
    const neonLight = new THREE.PointLight(0xff6ab0, 6, 7, 2); neonLight.position.set(-4.2, 7.3, -4.8); S.add(neonLight); neonLight.userData.base = 6; this.lampLights.push(neonLight);
    // warm lamps over the bar + string lights
    for (const [x, c] of [[7.6, 0xffb060], [10.4, 0xffc070], [-6, 0xffa050], [2.6, 0xffb868]]) {
      const l = new THREE.PointLight(c, 10, 8, 1.8); l.position.set(x, 4.6, -1.5); S.add(l); l.userData.base = 10; this.lampLights.push(l);
      const lg = new VoxelGrid(6, 6, 6); lg.cylinder('y', 3, 3, 0, 4, 2.6, { c: 0xffd890, e: 255 }); lg.cylinder('y', 3, 3, 4, 6, 3, 0x3a2a1a);
      S.add(mesh(lg, VS_SM, [3, 6, 3], [x, 4.95, -1.5], { cast: false }));
      S.add(mesh(chainGrid(26), VS_SM, [1.5, 0, 1.5], [x, 4.95, -1.5]));
    }
    // papel picado across the ceiling
    this.papel = [papelPicado(-12, 0, 6.2, -2.5, { sag: 0.6 }), papelPicado(0, 12, 6.3, -2.2, { sag: 0.5 }), papelPicado(-11, 11, 7.2, -4.5, { sag: 0.9, spacing: 0.8 })];
    for (const p of this.papel) S.add(p);
    // background booths, barrels, plants
    for (const x of [-10.5, -2.5]) {
      const bt = new VoxelGrid(30, 16, 12); bt.box(0, 0, 0, 30, 8, 12, WOOD[1]); bt.box(0, 8, 0, 30, 16, 3, 0x9c1f1f); bt.box(0, 6, 3, 30, 8, 12, 0xb82a2a);
      S.add(mesh(bt, VS_SM, [15, 0, 6], [x, 0, -5.2]));
    }
    const algaePts = [];
    for (let i = 0; i < 16; i++) algaePts.push({ x: -12 + r() * 24, y: 0, z: -5.9 + r() * 0.4, h: 0.3 + r() * 0.8, color: 0x2f5d24 });
    S.add(algaeField(algaePts, { seed: 11 }));
    for (let i = 0; i < 8; i++) S.add(mesh(barnacles(4 + (i % 3), i + 20), VS_XS, [6, 0, 6], [-12 + r() * 24, 0, -5.8 + r() * 0.5], { cast: false }));
    // bartender
    this.bart = buildBartender();
    this.bart.group.position.set(9.6, 0.6, -2.6);
    S.add(this.bart.group);
  }

  makeCustomProp(p) {
    if (p.type === 'chandelier') {
      const g = new VoxelGrid(36, 10, 36);
      g.cylinder('y', 18, 18, 0, 3, 17, (x, y, z) => WOOD[2]);
      g.cylinder('y', 18, 18, 0, 3, 14.5, null, { mode: 'carve' });
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.box(18 + Math.cos(a) * 7 - 1, 0, 18 + Math.sin(a) * 7 - 1, 18 + Math.cos(a) * 7 + 1, 2, 18 + Math.sin(a) * 7 + 1, WOOD[1]); }
      g.cylinder('y', 18, 18, 0, 3, 3, WOOD[1]);
      // anglerfish lure bulbs
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.39; const x = 18 + Math.cos(a) * 15.5, z = 18 + Math.sin(a) * 15.5; g.box(x - 1, 3, z - 1, x + 1, 7, z + 1, { c: 0xfff0a0, e: 255 }); g.set(Math.floor(x), 8, Math.floor(z), 0x5a3a2a); }
      const grp = new THREE.Group();
      const m = mesh(g, VS_SM, [18, 0, 18], [0, 0, 0]);
      grp.add(m);
      const ch = mesh(chainGrid(40), VS_SM, [1.5, 0, 1.5], [0, 2.5, 0]); grp.add(ch); grp.userData.chain = ch;
      const light = new THREE.PointLight(0xffe0a0, 12, 9, 1.6); light.position.y = -0.3; grp.add(light); light.userData.base = 12; this.lampLights.push(light);
      grp.userData.light = light;
      grp.userData.swing = 0; grp.userData.v = 0;
      return grp;
    }
    if (p.type === 'pinata') {
      // colourful fish pinata
      const g = new VoxelGrid(22, 16, 12);
      g.ellipsoid(11, 8, 6, 8, 6, 5, (x, y, z) => [0xff4f6a, 0xffcf3a, 0x4fd0ff, 0x6aff8a, 0xc194ff][Math.floor(x / 3) % 5]);
      g.box(0, 3, 4, 4, 13, 8, (x, y) => (y % 2 ? 0xff8a2a : 0xffcf3a)); // tail
      g.set(17, 10, 2, 0x111111); g.set(17, 10, 9, 0x111111); g.set(17, 11, 2, 0xffffff); g.set(17, 11, 9, 0xffffff);
      for (let x = 4; x < 18; x += 2) g.box(x, 1, 5, x + 1, 2, 7, 0xffffff); // paper fringe
      const grp = new THREE.Group();
      const m = mesh(g, VS_SM, [11, 14, 6], [0, 0, 0]);
      grp.add(m); grp.userData.body = m;
      const rope = new VoxelGrid(1, 30, 1); rope.box(0, 0, 0, 1, 30, 1, 0xbfa274);
      grp.add(mesh(rope, VS_SM, [0.5, 0, 0.5], [0, -0.05, 0]));
      grp.userData.swing = 0; grp.userData.v = 0;
      return grp;
    }
    if (p.type === 'jukebox') {
      const g = new VoxelGrid(22, 32, 14);
      g.box(0, 0, 0, 22, 22, 14, WOOD[2]);
      g.cylinder('z', 11, 22, 0, 14, 11, (x, y, z) => (y > 22 ? (z > 12 ? { c: [0xff4fa0, 0x4fe8d0, 0xffcf3a][Math.floor((x + y) / 3) % 3], e: 255 } : WOOD[2]) : null));
      g.box(3, 4, 13, 19, 18, 14, (x, y) => (y > 12 ? { c: 0x6ad8ff, e: 160 } : (x % 3 === 0 ? 0xb88a1e : 0x2a1a10)));
      g.box(5, 19, 13, 17, 21, 14, { c: 0xffd040, e: 220 });
      const m = mesh(g, VS_SM, [11, 0, 7], [0, 0, 0]);
      m.position.z = -0.6;
      const grp = new THREE.Group(); grp.add(m);
      const l = new THREE.PointLight(0xff6ab0, 5, 5, 2); l.position.set(0, 1.6, 0.4); grp.add(l); l.userData.base = 5; this.lampLights.push(l);
      grp.userData.light = l;
      return grp;
    }
    return null;
  }

  updateCustomProp(v, p, dt) {
    const o = v.obj;
    if (p.type === 'chandelier') {
      o.userData.v += (-o.userData.swing * 4 - o.userData.v * 0.8) * dt;
      o.userData.swing += o.userData.v * dt;
      if (p.state === 'rest') { o.position.set(p.x, p.y + 0.1, -0.3); o.rotation.z = o.userData.swing; o.userData.chain.visible = true; }
      else { o.position.set(p.x, p.y, -0.3); o.rotation.z *= 0.9; o.userData.chain.visible = false; if (p.state === 'broken') { o.rotation.z = 0.25; o.userData.light.intensity = 2; } }
    }
    if (p.type === 'pinata') {
      o.userData.v += (-o.userData.swing * 6 - o.userData.v * 0.5) * dt;
      o.userData.swing += o.userData.v * dt;
      o.position.set(p.x, p.y + 0.5, -0.1);
      o.rotation.z = o.userData.swing;
      o.visible = p.state !== 'broken';
    }
    if (p.type === 'jukebox') {
      o.position.set(p.x, 0, 0);
      o.scale.y = 1 + Math.abs(Math.sin(this.t * 8)) * 0.015;
    }
  }

  onEvent(e) {
    super.onEvent(e);
    const fx = this.fx;
    if (e.t === 'propHit' && (e.type === 'chandelier' || e.type === 'pinata')) {
      for (const [, v] of this.propViews) if (v.obj.userData.swing !== undefined && v.obj.userData.type === e.type) v.obj.userData.v += (e.dir || 1) * 2.4;
      if (e.type === 'pinata') fx.burst(e.x, e.y, { n: 10, spr: 'confetti', colors: [0xff4f6a, 0x4fd0ff, 0xffcf3a, 0x6aff8a], frames: 2, sp1: 4, grav: -4, wob: [0.5, 6] });
    }
    if (e.t === 'propBreak' && e.type === 'pinata') {
      fx.burst(e.x, e.y, { n: 60, spr: 'confetti', colors: [0xff4f6a, 0x4fd0ff, 0xffcf3a, 0x6aff8a, 0xc194ff], frames: 2, sp1: 7, grav: -4, wob: [0.6, 7], life1: 2 });
      fx.burst(e.x, e.y, { n: 16, spr: 'papel', colors: [0xff4f6a, 0xffcf3a], frames: 2, sp1: 5, grav: -6, life1: 1.6 });
      fx.text('¡PIÑATA!', e.x, e.y + 0.6, { color: '#ffcf3a' });
      fx.shake(0.3);
    }
    if (e.t === 'chandelierFall') { fx.sparks(e.x, e.y + 0.6, 12, { colors: [0xffffff, 0xffd080] }); }
    if (e.t === 'propBreak' && e.type === 'chandelier') { fx.shards(e.x, 0.4, 30, [WOOD[1], WOOD[2], 0xfff0a0], { spr: 'splinter', sp1: 8 }); fx.dust(e.x, 0, 20, 0x8a6a4a, 1.8); fx.shake(0.6); }
    if (e.t === 'tableBreak') { fx.shards(e.x, e.y, 30, [WOOD[1], WOOD[2], WOOD[3]], { spr: 'splinter', sp1: 8 }); fx.dust(e.x, 0, 14, 0x8a6a4a, 1.4); }
    if (e.t === 'jukebox') { fx.burst(e.x, e.y + 0.6, { n: 14, spr: 'note', colors: [0xff4fa0, 0x4fe8d0, 0xffcf3a], sp1: 3, grav: 1.5, life1: 1.4 }); }
    if (e.t === 'hit' && e.heavy) { for (const b of this.shelfBottles) if (Math.random() < 0.08) b.v = 0.6 + Math.random(); this.bart.react(e); }
    if ((e.t === 'slam' || e.t === 'flopLand' || e.t === 'finisherHit' || e.t === 'shellBreak') ) for (const b of this.shelfBottles) if (!b.fall && Math.random() < 0.15) b.fall = true;
  }

  update(dt, sim) {
    super.update(dt, sim);
    const s = sim.s;
    for (const p of this.papel) swayPapel(p, this.t);
    for (const t of this.tables) { const pl = s.plats[t.id]; t.m.visible = !pl.broken; t.broken.visible = pl.broken; }
    for (const b of this.shelfBottles) {
      if (b.fall) { b.m.position.y -= dt * 4; b.m.rotation.z += dt * 6; if (b.m.position.y < 0.05) { b.m.visible = false; this.fx.shards(b.m.position.x, 0.2, 8, [0x6ad06a, 0xcfffd0], { spr: 'glass', s1: 0.1 }); b.fall = false; b.m.position.y = -10; } }
      else if (b.v > 0) { b.v -= dt * 2; b.m.rotation.z = Math.sin(this.t * 40) * 0.1 * b.v; }
    }
    this.neon.material.emissiveIntensity = 1;
    this.bart.update(dt);
    this.syncProps(s, dt);
  }
}
