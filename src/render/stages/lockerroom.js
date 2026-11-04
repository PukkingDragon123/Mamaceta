// The menu world: an old algae-covered wooden locker room inside an abandoned underwater oil rig,
// with two rusty bulkhead doors (map vote) and Madam Molt's secret locker leading to her hidden shop.
import * as THREE from 'three';
import { VoxelGrid, shadeColor, vhash } from '../voxel.js';
import { mat, mesh, woodPaint, rustPaint, pipeGrid, chainGrid, cageLamp, papelPicado, swayPapel, barnacles, crateGrid, RUST, STEEL, WOOD, VS_BIG, VS_MED, VS_SM, VS_XS } from './kit.js';
import { setupLighting, makeBackdrop, GodRays, MarineSnow, FishSchool, algaeField, algaeMesh, BubbleVents } from '../env.js';
import { valueNoise2, seeded } from '../../core/math.js';
import { buildMadamMolt } from './npcs.js';
import { Particles } from '../particles.js';

const LOCKER_W = 0.9;

function lockerGrid(o = {}) {
  const w = Math.round(LOCKER_W / VS_SM), h = Math.round(2.5 / VS_SM), d = 11;
  const g = new VoxelGrid(w, h, d);
  const base = o.color ?? 0x5a6a5a;
  g.box(0, 0, 0, w, h, d, (x, y, z) => {
    if (z < d - 1) return shadeColor(base, -0.35);
    const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
    if (edge) return shadeColor(base, -0.25);
    // vents
    if (y > h - 9 && y < h - 3 && x > 2 && x < w - 3 && y % 2 === 0) return 0x1a1a1a;
    const n = valueNoise2(x * 0.2, y * 0.08, o.seed || 1);
    if (n > 0.72) return RUST[2 + (y % 2)];
    if (y < 8 + n * 10 && vhash(x, y, z, o.seed || 3) < 0.6) return [0x2f5d24, 0x4a8a2f, 0x3a6a2a][(x + y) % 3];
    return vhash(x, y, z, 1) < 0.1 ? shadeColor(base, 0.08) : base;
  });
  // handle
  g.box(w - 4, h / 2 - 2, d, w - 3, h / 2 + 2, d + 1, 0x9aa6b2);
  if (o.dent) g.ellipsoid(w / 2, h * 0.55, d, 4, 5, 1.5, null, { mode: 'carve' });
  return g;
}

export class LockerRoom {
  constructor(renderer) {
    this.renderer = renderer;
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x0a1c22);
    S.fog = new THREE.FogExp2(0x0c2228, 0.032);
    this.lights = setupLighting(S, renderer, { sunPos: [-12, 18, 6], target: [-2, 0, -4], angle: 0.55, sunColor: 0x9fe8ff, sunIntensity: 2.4, hemiSky: 0x6a9a98, hemiGround: 0x1a1a14, hemiIntensity: 0.45 });
    this.lights.fill.color.set(0x3a6a7a); this.lights.fill.intensity = 0.4;
    makeBackdrop(S, { top: 0x1a4a5a, mid: 0x0c2a30, bottom: 0x041014 });
    this.particles = new Particles(S, { pixelCap: 1500, glowCap: 800 });
    this.snow = new MarineSnow(S, { box: [-12, 12, 0, 6.5, -6, 5], count: 500, opacity: 0.4 });
    this.t = 0;
    this.build();
    this.camera = new THREE.PerspectiveCamera(40, renderer.aspect, 0.05, 200);
    this.camPos = new THREE.Vector3(-2, 2.5, 6); this.camLook = new THREE.Vector3(-2, 1.2, -3);
    this.camTarget = { pos: this.camPos.clone(), look: this.camLook.clone(), fov: 40, speed: 2.2 };
    this.camFov = 40;
    this.shake = 0;
  }

  build() {
    const S = this.scene;
    const r = seeded(5);
    // floor: old tile + wooden boards with puddles and algae
    const fg = new VoxelGrid(200, 3, 96);
    fg.box(0, 0, 0, 200, 3, 96, (x, y, z) => {
      if (y < 2) return 0x1a1410;
      const tx = Math.floor(x / 6), tz = Math.floor(z / 6);
      if (x % 6 === 0 || z % 6 === 0) return 0x2a2a26;
      const n = valueNoise2(x * 0.06, z * 0.06, 2);
      if (n > 0.7) return [0x2f5d24, 0x3a6a2a][(x + z) % 2];
      if (n < 0.18) return 0x1e2a2a; // puddle
      return ((tx + tz) % 2) ? 0x6a6a5e : 0x5a5a50;
    });
    S.add(mesh(fg, VS_BIG, [100, 3, 52], [0, 0, 0], { cast: false }));
    // back wall (rusty steel)
    const wg = new VoxelGrid(200, 56, 3);
    const rp = rustPaint(3, { rust: 0.45, algae: true, algaeH: 4 });
    wg.box(0, 0, 0, 200, 56, 3, (x, y, z) => (x % 32 === 0 || y % 20 === 0 ? 0x22272d : rp(x, y, z)));
    S.add(mesh(wg, VS_BIG, [100, 0, 1.5], [0, 0, -6.6], { cast: false }));
    // left wall with porthole
    const lw = new VoxelGrid(3, 56, 96);
    lw.box(0, 0, 0, 3, 56, 96, (x, y, z) => (z % 32 === 0 ? 0x22272d : rp(x, y, z)));
    lw.cylinder('x', 52, 28, 0, 3, 9, null, { mode: 'carve' });
    S.add(mesh(lw, VS_BIG, [1.5, 0, 52], [-11.2, 0, 0], { cast: false }));
    const port = new VoxelGrid(3, 22, 22);
    port.cylinder('x', 11, 11, 0, 3, 10.5, (x, y, z) => (((y - 11) ** 2 + (z - 11) ** 2) > 72 ? 0xb88a1e : null));
    port.cylinder('x', 11, 11, 1, 2, 8.6, { c: 0x2a8fa8, e: 60 });
    S.add(mesh(port, VS_SM * 2, [1.5, 11, 11], [-11.1, 3.5, -0.1], { cast: false }));
    this.portLight = new THREE.PointLight(0x5fd0ff, 6, 9, 1.5); this.portLight.position.set(-10.2, 3.5, -0.1); S.add(this.portLight);
    // fish visible outside the porthole
    this.outsideFish = new FishSchool(S, { count: 6, area: [-16, -12, 2.5, 4.5, -2, 2], speed: [0.5, 1] });
    for (const f of this.outsideFish.fish) { f.dir = Math.random() < 0.5 ? 1 : -1; }
    // ceiling pipes
    S.add(mesh(pipeGrid(190, 2.5, 0x6b7682, { flangeEvery: 24 }), VS_BIG, [95, 3.5, 3.5], [0, 6.0, -5.2]));
    S.add(mesh(pipeGrid(190, 1.8, 0x8a3d1a, { flangeEvery: 30 }), VS_BIG, [95, 2.5, 2.5], [0, 6.4, -3.4]));
    this.drips = new BubbleVents(this.particles, [{ x: -5.3, y: 5.6, z: -5.2, rate: 0.8, w: 0.05 }, { x: 2.4, y: 5.6, z: -5.2, rate: 1.2, w: 0.05 }, { x: -9, y: 0.1, z: -5.5, rate: 2 }]);
    // lockers
    this.lockers = [];
    const lockerColors = [0x5a6a5a, 0x4a5a6a, 0x5a6a5a, 0x6a5a4a, 0x4a5a6a];
    for (let i = 0; i < 14; i++) {
      const x = -9.6 + i * (LOCKER_W + 0.04);
      if (x > 2.6) break;
      const special = { 3: 'jim', 6: 'brutus', 9: 'bobby', 12: 'mimi' }[i];
      const color = special === 'mimi' ? 0xd86a9a : lockerColors[i % lockerColors.length];
      const lg = lockerGrid({ color, seed: i + 2, dent: special === 'brutus' });
      const m = mesh(lg, VS_SM, [lg.sx / 2, 0, 0], [x, 0, -6.45]);
      S.add(m);
      this.lockers.push({ m, x, special });
    }
    // Jim's poster: THE WANDERING FIST (his arcade idol)
    {
      const pg = new VoxelGrid(12, 16, 1);
      pg.box(0, 0, 0, 12, 16, 1, (x, y) => {
        if (x === 0 || x === 11 || y === 0 || y === 15) return 0xf0c33c;
        if (y > 12) return 0xd8322a;
        if (y > 4 && y < 12 && x > 3 && x < 8) return y > 9 ? 0xf0c8a0 : (y === 9 ? 0xd8322a : 0xf5f5f5);
        if (y < 4 && y > 1) return x % 2 ? 0x1a1a2a : 0xf0c33c;
        return 0x2a3a6a;
      });
      S.add(mesh(pg, VS_SM, [6, 0, 0.5], [this.lockers[3].x, 1.1, -5.72], { cast: false }));
    }
    // Mimi's stickers
    for (let k = 0; k < 6; k++) { const sg = new VoxelGrid(3, 3, 1); sg.box(0, 0, 0, 3, 3, 1, [0xffffff, 0xffcf3a, 0x4fd0ff, 0xff4fa0][k % 4]); S.add(mesh(sg, VS_SM, [1.5, 0, 0.5], [this.lockers[12].x - 0.25 + (k % 3) * 0.22, 0.9 + Math.floor(k / 3) * 0.3, -5.72], { cast: false })); }
    // Bobby's cone on his locker
    { const cg = new VoxelGrid(10, 12, 10); cg.cylinder('y', 5, 5, 1, 12, 3.8, (x, y) => (y === 5 || y === 8 ? 0xffffff : 0xff7a1a), {}, 0.6); cg.box(0, 0, 0, 10, 1, 10, 0x2a2f36); S.add(mesh(cg, VS_SM, [5, 0, 5], [this.lockers[9].x, 2.5, -6.0])); }
    // Madam Molt's secret locker (double width, gold trim, padlock)
    this.moltX = 3.75;
    {
      const w = Math.round(1.9 / VS_SM), h = Math.round(2.9 / VS_SM);
      const frame = new VoxelGrid(w + 4, h + 4, 12);
      frame.box(0, 0, 0, w + 4, h + 4, 12, (x, y, z) => (x < 2 || x >= w + 2 || y >= h + 2 ? (z > 10 ? 0xd8a83a : 0x6b4a12) : null));
      S.add(mesh(frame, VS_SM, [(w + 4) / 2, 0, 0], [this.moltX, 0, -6.6]));
      const dg = new VoxelGrid(w, h, 2);
      dg.box(0, 0, 0, w, h, 2, (x, y, z) => {
        if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) return 0xb88a1e;
        if (y > h - 10 && y < h - 3 && x > 4 && x < w - 5 && y % 2 === 0) return 0x1a1a1a;
        if (x > w / 2 - 5 && x < w / 2 + 5 && y > h * 0.62 && y < h * 0.74) return (y % 2 ? 0xf5e6c4 : 0xd8322a); // NO ENTRY sign
        return vhash(x, y, z, 9) < 0.1 ? 0x5a3a6a : 0x4a2a5a;
      });
      dg.box(w - 6, h / 2 - 3, 1, w - 3, h / 2 + 1, 3, { c: 0xf0c33c, e: 80 }); // gold padlock
      this.moltDoor = new THREE.Group();
      this.moltDoor.position.set(this.moltX - 0.95, 0.12, -5.55);
      const dm = mesh(dg, VS_SM, [0, 0, 1], [0, 0, 0]);
      this.moltDoor.add(dm);
      S.add(this.moltDoor);
      this.moltOpen = 0; this.moltOpenTarget = 0;
    }
    // benches
    const bench = (x0, x1, z) => {
      const len = Math.round((x1 - x0) / VS_SM);
      const bg = new VoxelGrid(len, 7, 10);
      bg.box(0, 5, 0, len, 7, 10, (x, y, z) => (y === 6 ? (z % 5 === 0 ? WOOD[1] : WOOD[3 - ((Math.floor(x / 9)) % 2)]) : WOOD[1]));
      for (let x = 2; x < len; x += Math.max(10, Math.floor(len / 4))) bg.box(x, 0, 1, x + 2, 5, 9, 0x3a3f46);
      for (let i = 0; i < 4; i++) bg.set(Math.floor(len * (0.2 + i * 0.2)), 7, 3 + i, 0xd8c8a0);
      S.add(mesh(bg, VS_SM, [0, 0, 5], [x0, 0, z]));
    };
    bench(-8.4, 2.2, -4.6);
    bench(-5.0, 0.0, -1.3);
    // Jim's punching bag
    {
      const bg = new VoxelGrid(10, 20, 10);
      bg.cylinder('y', 5, 5, 0, 20, 4.5, (x, y, z) => (y > 16 || y < 2 ? 0x3a2a1a : (vhash(x, y, z, 2) < 0.1 ? 0x7a1a1a : 0x9c1f1f)));
      this.bag = new THREE.Group(); this.bag.position.set(-6.0, 3.0, -2.4);
      const bm = mesh(bg, VS_SM, [5, 20, 5], [0, 0, 0]); this.bag.add(bm);
      this.bag.add(mesh(chainGrid(36), VS_SM, [1.5, 0, 1.5], [0, 2.3, 0]));
      this.bagV = 0; this.bagA = 0;
      S.add(this.bag);
    }
    // crates (Mimi's seat) and cone pile (Bobby)
    S.add(mesh(crateGrid(4), VS_SM, [8, 0, 8], [1.8, 0, -3.1], { scale: 0.6 }));
    for (let i = 0; i < 4; i++) { const cg = new VoxelGrid(10, 12, 10); cg.cylinder('y', 5, 5, 1, 12, 3.8, (x, y) => (y === 5 || y === 8 ? 0xffffff : 0xff7a1a), {}, 0.6); cg.box(0, 0, 0, 10, 1, 10, 0x2a2f36); S.add(mesh(cg, VS_SM, [5, 0, 5], [-0.3 + (i % 2) * 0.35, i > 1 ? 0.75 : 0, -3.4 + (i % 3) * 0.2], { rot: [i === 3 ? 1.4 : 0, i * 0.5, 0] })); }
    // snail shells scattered near Brutus' spot
    for (let i = 0; i < 9; i++) { const sg = new VoxelGrid(5, 4, 5); sg.ellipsoid(2.5, 1.5, 2.5, 2.4, 1.8, 2.2, (x, y) => ((x + y) % 2 ? 0xb88a1e : 0xe0c070)); S.add(mesh(sg, VS_XS, [2.5, 0, 2.5], [-4.8 + r() * 1.6, 0.02, -3.8 + r() * 1.0])); }
    // chalkboard with tally marks
    {
      const cb = new VoxelGrid(40, 24, 1);
      cb.box(0, 0, 0, 40, 24, 1, (x, y) => (x < 2 || x > 37 || y < 2 || y > 21 ? WOOD[2] : ((x % 4 === 0 && y > 12 && y < 19 && x < 28) || (y === 15 && x > 3 && x < 27) ? 0xf5f5f5 : 0x1e2e26)));
      S.add(mesh(cb, VS_SM, [20, 0, 0.5], [-9.9, 2.2, -6.0], { cast: false, rot: [0, 0.25, 0] }));
    }
    // fight night flyer
    {
      const fl = new VoxelGrid(10, 14, 1);
      fl.box(0, 0, 0, 10, 14, 1, (x, y) => (y > 10 ? 0x6a2ab0 : y < 3 ? 0xf0c33c : ((x - 5) ** 2 + (y - 6.5) ** 2 < 8 ? 0xf07a5a : 0xf5e6c4)));
      S.add(mesh(fl, VS_SM, [5, 0, 0.5], [this.moltX + 1.4, 1.5, -6.05], { cast: false }));
    }
    // swinging caged lamp + extra lights
    this.lamp = cageLamp(0xffb060, { intensity: 22, dist: 12 });
    this.lamp.position.set(-3, 5.4, -2);
    this.lamp.add(mesh(chainGrid(14), VS_SM, [1.5, 0, 1.5], [0, 0, 0]));
    S.add(this.lamp);
    this.lamp2 = cageLamp(0xff9a50, { intensity: 12, dist: 9 });
    this.lamp2.position.set(7.6, 5.2, -2.5);
    S.add(this.lamp2);
    // papel picado
    this.papel = [papelPicado(-10, -1, 5.3, -3.5, { sag: 0.5 }), papelPicado(-1, 6, 5.4, -3.8, { sag: 0.4 })];
    for (const p of this.papel) S.add(p);
    // algae + barnacles
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push({ x: -11 + r() * 22, y: 0, z: -6.1 + r() * 0.5, h: 0.2 + r() * 0.9 });
    for (let i = 0; i < 10; i++) pts.push({ x: -10.8 + r() * 0.4, y: 0, z: -5 + r() * 9, h: 0.3 + r() * 1.4 });
    S.add(algaeField(pts, { seed: 31 }));
    for (let i = 0; i < 6; i++) { const a = algaeMesh(0.4 + r() * 0.8, { seed: 50 + i }); a.rotation.z = Math.PI; a.position.set(-9 + r() * 12, 5.8, -5.1 + r() * 0.2); S.add(a); }
    for (let i = 0; i < 10; i++) S.add(mesh(barnacles(4 + (i % 3), i), VS_XS, [6, 0, 6], [-10.5 + r() * 14, 0, -6.0 + r() * 0.4], { cast: false }));
    // ---------------- the two bulkhead doors (map vote)
    this.doors = [];
    for (const [i, x] of [[0, 6.6], [1, 9.6]]) {
      const w = Math.round(2.5 / VS_SM), h = Math.round(3.8 / VS_SM);
      const fr = new VoxelGrid(w + 8, h + 8, 10);
      fr.box(0, 0, 0, w + 8, h + 8, 10, (X, Y, Z) => (X < 4 || X >= w + 4 || Y >= h + 4 ? rustPaint(8 + i, { rust: 0.6 })(X, Y, Z) : null));
      for (let k = 0; k < 8; k++) fr.set(k % 2 ? 1 : w + 6, 6 + k * 7, 10, 0x9aa6b2);
      S.add(mesh(fr, VS_SM, [(w + 8) / 2, 0, 0], [x, 0, -6.55]));
      const dg = new VoxelGrid(w, h, 4);
      const dp = rustPaint(20 + i, { rust: 0.55 });
      dg.box(0, 0, 0, w, h, 4, (X, Y, Z) => {
        if (X < 2 || X >= w - 2 || Y < 2 || Y >= h - 2) return 0x2a2f36;
        if (Math.abs(Y - h / 2) < 1 || Math.abs(X - w / 2) < 1) return 0x3a424c;
        return dp(X, Y, Z);
      });
      // wheel valve
      dg.cylinder('z', w / 2, h * 0.45, 4, 6, 5, 0xb5561f); dg.cylinder('z', w / 2, h * 0.45, 4, 6, 3.4, null, { mode: 'carve' }); dg.box(w / 2 - 0.5, h * 0.45 - 5, 4, w / 2 + 0.5, h * 0.45 + 5, 6, 0xb5561f); dg.box(w / 2 - 5, h * 0.45 - 0.5, 4, w / 2 + 5, h * 0.45 + 0.5, 6, 0xb5561f);
      const door = new THREE.Group();
      door.position.set(x - 1.25, 0.25, -6.1);
      const dm = mesh(dg, VS_SM, [0, 0, 2], [0, 0, 0]);
      door.add(dm);
      S.add(door);
      // painted name sign above door (built as pixel texture later by UI; here a wooden board)
      const sg = new VoxelGrid(44, 10, 2); sg.box(0, 0, 0, 44, 10, 2, (X, Y) => (Y === 0 || Y === 9 || X === 0 || X === 43 ? WOOD[1] : WOOD[3]));
      S.add(mesh(sg, VS_SM, [22, 0, 1], [x, 4.35, -6.0]));
      // light spill behind door
      const glow = new THREE.PointLight(i === 0 ? 0xff9a50 : 0xffc070, 0, 6, 2); glow.position.set(x, 1.8, -5.4); S.add(glow);
      this.doors.push({ x, door, glow, open: 0, target: 0, highlight: 0 });
      const front = new THREE.PointLight(i === 0 ? 0x9fd8ff : 0xffd0a0, 5, 6, 1.6); front.position.set(x, 3.4, -4.2); S.add(front);
    }
    // ---------------- Madam Molt's hidden shop (behind the back wall)
    this.buildShop();
    this.molt = buildMadamMolt();
    this.molt.group.position.set(this.moltX + 3, 0, -2);
    this.molt.group.visible = false;
    S.add(this.molt.group);
  }

  buildShop() {
    const S = this.scene, x0 = this.moltX;
    const r = seeded(8);
    // room shell
    const room = new VoxelGrid(64, 40, 80);
    room.box(0, 0, 0, 64, 2, 80, (x, y, z) => ((Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? 0x4a1a2a : 0x2a0a1a)); // checker carpet
    room.box(0, 0, 0, 2, 40, 80, (x, y, z) => (y % 6 === 0 ? 0x2a0a1a : 0x5a1a3a)); // left wall (velvet)
    room.box(62, 0, 0, 64, 40, 80, (x, y, z) => (y % 6 === 0 ? 0x2a0a1a : 0x5a1a3a));
    room.box(0, 0, 0, 64, 40, 2, (x, y, z) => (x % 8 === 0 ? 0x2a0a1a : 0x6a2a4a)); // back wall
    room.box(0, 38, 0, 64, 40, 80, 0x1a0a12);
    S.add(mesh(room, VS_SM * 1.6, [32, 0, 80], [x0, 0, -6.7], { cast: false }));
    // shelves with treasures
    for (let row = 0; row < 3; row++) {
      const sh = new VoxelGrid(80, 2, 8); sh.box(0, 0, 0, 80, 2, 8, 0xb88a1e);
      S.add(mesh(sh, VS_SM, [40, 2, 4], [x0, 1.4 + row * 0.85, -14.2]));
      for (let k = 0; k < 9; k++) {
        const kind = (k + row * 2) % 5;
        const g = new VoxelGrid(6, 7, 6);
        if (kind === 0) g.ellipsoid(3, 3, 3, 2.6, 2.6, 2.6, (x, y) => ((x + y) % 2 ? { c: 0xf0c33c, e: 60 } : 0xb88a1e)); // gold shell
        else if (kind === 1) { g.cylinder('y', 3, 3, 0, 5, 2.2, { c: [0x4fd0ff, 0xff4fa0, 0x6aff8a][k % 3], e: 90 }); g.box(2, 5, 2, 4, 7, 4, 0x6b4a12); } // potion
        else if (kind === 2) g.sphere(3, 3, 3, 2.4, { c: 0xfff8f0, e: 60 }); // pearl
        else if (kind === 3) g.box(0, 0, 1, 6, 4, 5, (x, y) => (y === 3 ? 0xf0c33c : 0x6a2a1a)); // chest
        else g.ellipsoid(3, 3, 3, 2.8, 2.2, 2.5, (x, y, z) => (vhash(x, y, z, 2) < 0.5 ? 0xffffff : 0xd8c8a0)); // skull-ish
        S.add(mesh(g, VS_XS * 1.4, [3, 0, 3], [x0 - 2.1 + k * 0.52 + r() * 0.1, 1.48 + row * 0.85, -14.1]));
      }
    }
    // counter with cash register
    const cg = new VoxelGrid(56, 18, 14);
    cg.box(0, 0, 0, 56, 16, 12, (x, y, z) => (y > 13 ? 0xd8a83a : ((x + y) % 8 === 0 ? 0x6a2a4a : 0x4a1a2a)));
    cg.box(0, 16, 0, 56, 18, 14, 0xb88a1e);
    S.add(mesh(cg, VS_SM, [28, 0, 7], [x0 - 0.4, 0, -12.2]));
    const reg = new VoxelGrid(12, 12, 9);
    reg.box(0, 0, 0, 12, 8, 9, 0xb88a1e); reg.box(1, 8, 2, 11, 12, 7, 0xd8a83a); reg.box(2, 9, 6, 10, 11, 7.5, { c: 0x6aff8a, e: 200 });
    for (let i = 0; i < 4; i++) reg.box(2 + i * 2.2, 8, 0, 3 + i * 2.2, 9, 2, 0xf5e6c4);
    this.register = mesh(reg, VS_SM, [6, 0, 4.5], [x0 - 1.6, 1.12, -12.2]);
    S.add(this.register);
    // snail shell hoard piles
    for (const [px, pz, n] of [[x0 - 2.6, -13.4, 30], [x0 + 2.6, -13.6, 26]]) {
      const pg = new VoxelGrid(26, 14, 22);
      for (let i = 0; i < n; i++) { const cx = 4 + r() * 18, cz = 4 + r() * 14; const cy = Math.max(1, 10 - Math.hypot(cx - 13, cz - 11) * 0.9 + r() * 2); pg.ellipsoid(cx, cy, cz, 2, 1.6, 2, (x, y) => ((x + y) % 2 ? { c: 0xf0c33c, e: 50 } : 0xb88a1e)); }
      S.add(mesh(pg, VS_SM, [13, 0, 11], [px, 0, pz]));
    }
    // neon sign MOLT'S
    const L = { M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'], O: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'], L: ['X....', 'X....', 'X....', 'X....', 'XXXXX'], T: ['XXXXX', '..X..', '..X..', '..X..', '..X..'], S: ['.XXXX', 'X....', '.XXX.', '....X', 'XXXX.'], "'": ['..X..', '..X..', '.....', '.....', '.....'] };
    const word = "MOLT'S";
    const ng = new VoxelGrid(word.length * 12 + 2, 22, 2);
    [...word].forEach((ch, i) => (L[ch] || L.O).forEach((row, j) => { for (let k = 0; k < 5; k++) if (row[k] === 'X') ng.box(1 + i * 12 + k * 2, 20 - j * 4 - 3, 0, 1 + i * 12 + k * 2 + 2, 20 - j * 4, 2, { c: 0xff4fa0, e: 255 }); }));
    S.add(mesh(ng, VS_SM, [ng.sx / 2, 0, 1], [x0, 4.3, -14.3], { cast: false }));
    const shopLight = new THREE.PointLight(0xff6ab0, 14, 10, 1.6); shopLight.position.set(x0, 4.0, -12.5); S.add(shopLight);
    const shopLight2 = new THREE.PointLight(0xffc070, 16, 10, 1.6); shopLight2.position.set(x0 + 0.5, 2.8, -10); S.add(shopLight2);
    this.shopLights = [shopLight, shopLight2];
    // display pedestal for previews
    const ped = new VoxelGrid(20, 8, 20);
    ped.cylinder('y', 10, 10, 0, 8, 9.5, (x, y) => (y === 7 ? 0xf0c33c : y === 0 ? 0x6b4a12 : 0x4a1a2a));
    this.pedestal = mesh(ped, VS_SM, [10, 0, 10], [x0 + 1.55, 0, -11.5]);
    S.add(this.pedestal);
    this.pedestalTop = new THREE.Vector3(x0 + 1.55, 0.5, -11.5);
    const spot = new THREE.SpotLight(0xfff0d0, 30, 8, 0.45, 0.5, 1.2); spot.position.set(x0 + 1.55, 4.5, -9.6); spot.target.position.copy(this.pedestalTop); S.add(spot, spot.target);
  }

  setCam(pos, look, fov = 40, speed = 2.2) { this.camTarget = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov, speed }; }
  snapCam() { this.camPos.copy(this.camTarget.pos); this.camLook.copy(this.camTarget.look); this.camFov = this.camTarget.fov; }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.snow.update(dt);
    this.outsideFish.update(dt);
    this.drips.update(dt);
    this.particles.update(dt);
    for (const p of this.papel) swayPapel(p, t);
    this.lamp.rotation.z = Math.sin(t * 0.8) * 0.12; this.lamp.rotation.x = Math.sin(t * 0.6) * 0.05;
    const fl = Math.sin(t * 23) > 0.96 ? 0.4 : 1;
    this.lamp.userData.light.intensity = 22 * fl;
    this.lamp2.rotation.z = Math.sin(t * 0.7 + 1) * 0.08;
    this.portLight.intensity = 5 + Math.sin(t * 1.3) * 1.5;
    // bag swing
    this.bagV += (-this.bagA * 5 - this.bagV * 0.9) * dt; this.bagA += this.bagV * dt;
    this.bag.rotation.z = this.bagA;
    // secret locker door
    this.moltOpen += (this.moltOpenTarget - this.moltOpen) * Math.min(1, dt * 3.5);
    this.moltDoor.rotation.y = -this.moltOpen * 1.9;
    for (const d of this.doors) {
      d.open += (d.target - d.open) * Math.min(1, dt * (d.target > d.open ? 1.3 : 4));
      d.door.rotation.y = -d.open * 1.7;
      d.glow.intensity = d.open * 24 + d.highlight * 3;
    }
    if (this.molt.group.visible) this.molt.update(dt);
    // camera
    const k = 1 - Math.exp(-this.camTarget.speed * dt);
    this.camPos.lerp(this.camTarget.pos, k); this.camLook.lerp(this.camTarget.look, k);
    this.camFov += (this.camTarget.fov - this.camFov) * k;
    this.shake = Math.max(0, this.shake - dt * 2);
    const c = this.camera;
    c.aspect = this.renderer.aspect;
    c.position.copy(this.camPos);
    c.position.x += Math.sin(t * 0.37) * 0.04 + (Math.random() - 0.5) * this.shake * 0.2;
    c.position.y += Math.sin(t * 0.29) * 0.03 + (Math.random() - 0.5) * this.shake * 0.2;
    c.lookAt(this.camLook);
    c.fov = this.camFov; c.updateProjectionMatrix();
  }

  punchBag(v = 1.2) { this.bagV += v; }
}

export const LOCKER_SLOTS = {
  bench: { x: -2.4, z: -4.35, face: -1, seat: true },
  select: {
    jim: { x: -6.85, z: -2.4, face: 1 },
    brutus: { x: -4.4, z: -4.35, face: 1, seat: true },
    bobby: { x: -1.1, z: -2.2, face: -1 },
    mimi: { x: 1.8, z: -3.0, face: -1, crate: true },
  },
};
