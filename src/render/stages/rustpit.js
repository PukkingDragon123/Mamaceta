// THE RUST PIT: sunken arena inside an abandoned underwater oil rig. Lonely referee included.
import * as THREE from 'three';
import { VoxelGrid, shadeColor, vhash } from '../voxel.js';
import { StageBase } from './stageBase.js';
import { mat, mesh, rustPaint, woodPaint, pipeGrid, chainGrid, catwalkGrid, hazardGrid, cageLamp, barnacles, rockGrid, RUST, STEEL, WOOD, ALGAE, VS_BIG, VS_MED, VS_SM, VS_XS } from './kit.js';
import { algaeField, algaeMesh, BubbleVents } from '../env.js';
import { valueNoise2, valueNoise3, seeded } from '../../core/math.js';
import { buildReferee } from './npcs.js';

export class RustPitView extends StageBase {
  constructor(scene, renderer, particles, fx, sim) {
    super(scene, renderer, particles, fx);
    this.sim = sim;
    this.scene.background = new THREE.Color(0x0a2c38);
    this.scene.fog = new THREE.FogExp2(0x0b3442, 0.028);
    this.baseEnv({
      light: { sunPos: [3, 34, 9], target: [0, 0, -2], angle: 0.42, sunIntensity: 4.6, hemiSky: 0x5aa8c0, hemiGround: 0x1a2a2a, hemiIntensity: 0.5 },
      backdrop: { top: 0x2a7f96, mid: 0x0c3c4c, bottom: 0x041820 },
      rays: { count: 8, x0: -15, x1: 15, z0: -9, z1: -2, y: 5, h: 16, opacity: 0.11 },
      snow: { box: [-18, 18, -1, 13, -10, 5] },
      fish: { count: 12, area: [-24, 24, 9, 14, -16, -11] },
    });
    this.build();
  }

  build() {
    const S = this.scene;
    const r = seeded(42);
    // ---------------- floor: riveted rusty deck plates
    const FW = 320, FD = 88; // 40 x 11 units at 1/8
    const fg = new VoxelGrid(FW, 4, FD);
    const rp = rustPaint(1, { rust: 0.35 });
    fg.box(0, 0, 0, FW, 4, FD, (x, y, z) => {
      if (y < 3) return STEEL[0];
      const px = x % 12, pz = z % 12;
      if (px === 0 || pz === 0) return 0x1a1d22; // plate seams
      if ((px === 2 || px === 10) && (pz === 2 || pz === 10)) return 0x8a96a2; // rivets
      const oil = valueNoise2(x * 0.05, z * 0.08, 9);
      if (oil > 0.76) return 0x14171b;
      // diamond tread pattern
      if (((x + z) % 4 === 0 || (x - z + 400) % 4 === 0) && valueNoise2(x * 0.06, z * 0.06, 4) > 0.45) return 0x3a424a;
      return rp(x, y, z);
    });
    // drain grate in the middle
    fg.box(148, 3, 50, 172, 4, 62, (x, y, z) => ((x % 2 === 0) ? 0x0c0e10 : STEEL[2]));
    const floor = mesh(fg, VS_BIG, [FW / 2, 4, 60], [0, 0, 0], { cast: false });
    S.add(floor);
    // hazard stripe border along the front edge
    S.add(mesh(hazardGrid(320, 2, 2), VS_BIG, [160, 2, 1], [0, 0.0, 3.4], { cast: false }));

    // ---------------- back wall: huge rusted bulkhead with ribs, pipes, portholes, signage
    const BW = 352, BH = 88, BD = 8;
    const bg = new VoxelGrid(BW, BH, BD);
    const wp = rustPaint(5, { rust: 0.42, algae: true, algaeH: 6 });
    bg.box(0, 0, 0, BW, BH, 3, (x, y, z) => {
      const panel = (x % 40 === 0) || (y % 22 === 0);
      if (panel) return 0x252a30;
      if ((x % 40 === 3 || x % 40 === 37) && (y % 22 === 3 || y % 22 === 19)) return 0x8a96a2;
      // hazard band near floor
      if (y >= 5 && y < 9) return (Math.floor((x + y) / 5) % 2) ? 0xd8a020 : 0x1a1a1a;
      // painted pit number
      return wp(x, y, z);
    });
    // vertical I-beam ribs
    for (let x = 0; x < BW; x += 40) {
      bg.box(x - 3, 0, 3, x + 3, BH, 6, (X, Y, Z) => (Z === 5 || X === x - 3 || X === x + 2 ? wp(X, Y, Z) : 0x2a2f36));
    }
    // portholes up high showing the sea (emissive glass)
    for (let i = 0; i < 6; i++) {
      const cx = 36 + i * 56, cy = 64;
      bg.cylinder('z', cx, cy, 0, 5, 7, (X, Y, Z) => (Z >= 3 ? 0x6b7682 : null));
      bg.cylinder('z', cx, cy, 0, 4, 5.4, (X, Y, Z) => ({ c: 0x3fb8d0, e: 140 }));
      bg.cylinder('z', cx, cy, 3, 5, 5.4, null, { mode: 'carve' });
    }
    // giant painted "PIT 9" stencil
    const stencil = ['XXX.X.XXX....XXX', 'X.X.X..X.....X.X', 'XXX.X..X.....XXX', 'X...X..X.......X', 'X...X..X.....XXX'];
    stencil.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') bg.box(140 + i * 4, 44 - j * 4, 2, 144 + i * 4, 48 - j * 4, 3.2, (X, Y, Z) => (vhash(X, Y, Z, 3) < 0.25 ? RUST[3] : 0xe8dcc0)); });
    S.add(mesh(bg, VS_BIG, [BW / 2, 0, 0], [0, 0, -7.2], { cast: false }));

    // horizontal pipes along the wall
    const p1 = mesh(pipeGrid(330, 3.2, 0x6b7682, { flangeEvery: 20 }), VS_BIG, [165, 4.6, 4.6], [0, 2.1, -6.3]);
    const p2 = mesh(pipeGrid(330, 2.2, 0x8a3d1a, { flangeEvery: 26 }), VS_BIG, [165, 3.6, 3.6], [0, 5.6, -6.4]);
    S.add(p1, p2);
    // vertical leak pipes at the side vents (sim vents at +-11.6..11.8)
    for (const x of [-11.6, 11.8]) {
      const vg = new VoxelGrid(10, 72, 10);
      vg.cylinder('y', 5, 5, 0, 72, 3.2, rustPaint(8, { rust: 0.7 }));
      vg.cylinder('y', 5, 5, 4, 7, 4.2, 0x2a2f36);
      vg.box(2, 6, 1, 8, 9, 9, 0x3a3f46);
      vg.cylinder('z', 5, 12, 8, 10, 3.5, 0xb5561f); // valve wheel
      vg.cylinder('z', 5, 12, 8, 10, 2.2, null, { mode: 'carve' });
      S.add(mesh(vg, VS_BIG, [5, 0, 5], [x, 0, -0.8]));
    }
    // ---------------- side pillars (massive rig columns)
    for (const x of [-14.6, 14.6]) {
      const cg = new VoxelGrid(22, 120, 22);
      cg.cylinder('y', 11, 11, 0, 120, 10, rustPaint(11, { rust: 0.5, algae: true, algaeH: 10 }));
      for (let y = 14; y < 120; y += 26) cg.cylinder('y', 11, 11, y, y + 2, 10.8, 0x2a2f36);
      S.add(mesh(cg, VS_BIG, [11, 0, 11], [x, 0, -1.5]));
    }
    // ---------------- catwalks (sim plats y=2.6)
    for (const [x0, x1] of [[-10.6, -6.4], [6.4, 10.6]]) {
      const len = Math.round((x1 - x0) / VS_SM);
      const cw = mesh(catwalkGrid(len, 44, { seed: 3 }), VS_SM, [len / 2, 2, 22], [(x0 + x1) / 2, 2.6, -1.0]);
      S.add(cw);
      // supports: brackets to the back wall + chains
      for (const xx of [x0 + 0.3, x1 - 0.3]) {
        S.add(mesh(chainGrid(72), VS_SM, [1.5, 72, 1.5], [xx, 7.1, -0.2], { cast: true }));
        const br = new VoxelGrid(4, 4, 40); br.box(0, 0, 0, 4, 4, 40, rustPaint(2));
        S.add(mesh(br, VS_SM, [2, 4, 40], [xx, 2.45, -6.3]));
      }
      // algae dangling from catwalks
      for (let i = 0; i < 6; i++) { const a = algaeMesh(0.5 + r() * 0.9, { seed: 70 + i, color: 0x2f5d24, color2: 0x77b83f }); a.rotation.z = Math.PI; a.position.set(x0 + 0.3 + r() * (x1 - x0 - 0.6), 2.5, -0.3 + r() * 0.6); a.material = a.material; S.add(a); }
    }
    // ---------------- crane rail + trolley (moving platform visuals)
    const rail = new VoxelGrid(200, 4, 6); rail.box(0, 0, 0, 200, 4, 6, (x, y) => (y === 0 || y === 3 ? 0x464e58 : (x % 8 === 0 ? 0x2a2f36 : 0x3a424c)));
    S.add(mesh(rail, VS_SM, [100, 2, 3], [0, 8.2, -0.6]));
    this.crane = new THREE.Group();
    const trolley = new VoxelGrid(16, 10, 10); trolley.box(0, 0, 0, 16, 10, 10, (x, y) => (y > 7 ? 0xd8a020 : (Math.floor((x + y) / 3) % 2 ? 0xd8a020 : 0x1a1a1a)));
    this.crane.add(mesh(trolley, VS_SM, [8, 0, 5], [0, 7.6, -0.6]));
    const pallet = new VoxelGrid(42, 4, 20);
    pallet.box(0, 0, 0, 42, 4, 20, (x, y, z) => (y === 3 ? (x % 6 === 5 ? null : WOOD[2 + (Math.floor(x / 6) % 2)]) : (z < 3 || z > 16 || (z > 8 && z < 11) ? WOOD[1] : null)));
    this.crane.add(mesh(pallet, VS_SM, [21, 4, 10], [0, 4.1, -0.3]));
    for (const dx of [-1.1, 1.1]) this.crane.add(mesh(chainGrid(56), VS_SM, [1.5, 56, 1.5], [dx * 0.85, 7.6, -0.3]));
    // hook
    const hook = new VoxelGrid(5, 8, 3); hook.box(2, 3, 1, 3, 8, 2, 0x3a3f46); hook.box(0, 0, 1, 5, 2, 2, 0x3a3f46); hook.box(0, 1, 1, 1, 4, 2, 0x3a3f46);
    this.crane.add(mesh(hook, VS_SM, [2.5, 8, 1.5], [0, 7.6, 0.2]));
    S.add(this.crane);
    // ---------------- lamps
    for (const [x, y, c] of [[-6.8, 6.6, 0xffb060], [0.2, 7.4, 0xffc070], [7.2, 6.4, 0xff9a50]]) {
      const lamp = cageLamp(c, { intensity: 14, dist: 10 });
      lamp.position.set(x, y, -1.5);
      const ch = mesh(chainGrid(30), VS_SM, [1.5, 0, 1.5], [0, 0, 0]); lamp.add(ch); ch.position.y = 0;
      S.add(lamp);
      this.lampLights.push(lamp.userData.light);
      lamp.userData.light.userData.base = 14;
      (this.lamps ||= []).push(lamp);
    }
    // ---------------- dressing: rocks, barnacles, algae, debris
    const algaePts = [];
    for (let i = 0; i < 70; i++) {
      const x = -16 + r() * 32, z = -6.6 + r() * 1.6;
      algaePts.push({ x, y: 0, z, h: 0.3 + r() * 1.4, color: r() < 0.3 ? 0x1d4a3a : 0x2f5d24, color2: r() < 0.5 ? 0x77b83f : 0x4fa86a });
    }
    for (let i = 0; i < 14; i++) algaePts.push({ x: -14 + r() * 28, y: 0, z: 2 + r() * 1.2, h: 0.15 + r() * 0.35 });
    S.add(algaeField(algaePts, { seed: 7 }));
    for (let i = 0; i < 12; i++) {
      const b = mesh(barnacles(5 + (i % 4), i), VS_XS, [6, 0, 6], [-15 + r() * 30, 0, -6.2 + r() * 0.6], { cast: false });
      S.add(b);
    }
    for (const [x, z, w] of [[-13, 2.6, 22], [12.5, 2.4, 18], [-4, -6, 14], [5.5, -6.2, 16]]) S.add(mesh(rockGrid(w, 10, 14, x | 0), VS_MED, [w / 2, 0, 7], [x, 0, z]));
    // tire + chain pile in the foreground
    const tire = new VoxelGrid(16, 6, 16); tire.cylinder('y', 8, 8, 0, 5, 7.5, 0x1a1a1c); tire.cylinder('y', 8, 8, 0, 6, 3.6, null, { mode: 'carve' });
    S.add(mesh(tire, VS_SM, [8, 0, 8], [-9.5, 0, 2.6], { rot: [0, 0, 0.15] }));
    const coil = new VoxelGrid(14, 4, 14); coil.cylinder('y', 7, 7, 0, 3, 6.5, (x, y, z) => ((x + z + y) % 3 ? 0xbfa274 : 0x8a7350)); coil.cylinder('y', 7, 7, 0, 4, 3, null, { mode: 'carve' });
    S.add(mesh(coil, VS_SM, [7, 0, 7], [10.4, 0, 2.7]));
    // hanging chains from the ceiling (swaying)
    this.chains = [];
    for (let i = 0; i < 7; i++) {
      const len = 30 + Math.floor(r() * 40);
      const c = mesh(chainGrid(len), VS_SM, [1.5, len, 1.5], [-12 + i * 4 + r() * 1.5, 9.5, -3.5 + r() * 2]);
      S.add(c); this.chains.push({ m: c, ph: r() * 6, amp: 0.02 + r() * 0.04, v: 0, a: 0 });
    }
    // referee
    this.ref = buildReferee();
    this.ref.group.position.set(-2.6, 0, -4.4);
    S.add(this.ref.group);
    // bubble vents (visual only, plus active sim vents)
    this.vents = new BubbleVents(this.p, [{ x: -3.2, y: 0.1, z: -5.6, rate: 2 }, { x: 4.4, y: 0.1, z: -5.8, rate: 1.4 }, { x: 13.4, y: 0.4, z: -1, rate: 1 }]);
  }

  makeCustomProp(p) {
    if (p.type === 'vent') { const g = new THREE.Group(); g.userData.acc = 0; return g; }
    return null;
  }
  updateCustomProp(v, p, dt) {
    if (p.type === 'vent') {
      if (p.active > 0) {
        v.obj.userData.acc += dt * 60;
        while (v.obj.userData.acc > 1) {
          v.obj.userData.acc -= 1;
          const s = 0.06 + Math.random() * 0.14;
          this.p.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: 0.3 + Math.random() * 0.4, z: (Math.random() - 0.5) * 0.6, vy: 3 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.6, grav: 2, drag: 0.6, life: 1.6 + Math.random(), size: s, size1: s * 1.6, spr: 'bubble', color: 0xdff8ff, alpha: 1, alpha1: 0.3, wob: [0.8, 6] });
        }
      } else if (Math.random() < dt * 3) {
        this.p.spawn({ x: p.x, y: 0.9, z: -0.6, vy: 0.6, grav: 1, life: 1.5, size: 0.06, size1: 0.1, spr: 'bubbleS', color: 0xdff8ff, wob: [0.4, 5] });
      }
    }
  }

  onEvent(e) {
    super.onEvent(e);
    if (e.t === 'ventBurst') { this.fx.bubbleBurst(e.x, 1, 20, 1.6); this.fx.shake(0.2); }
    if (e.t === 'hit' || e.t === 'ko' || e.t === 'fight' || e.t === 'round' || e.t === 'roundWin') this.ref.react(e);
    if (e.t === 'hit' && e.heavy) for (const c of this.chains) c.v += (Math.random() - 0.5) * 0.8;
    if (e.t === 'slam' || e.t === 'flopLand') for (const c of this.chains) c.v += (Math.random() - 0.5) * 2.4;
  }

  update(dt, sim) {
    super.update(dt, sim);
    const s = sim.s;
    const crane = s.plats.find((p) => p.kind === 'crane');
    if (crane) this.crane.position.x = (crane.x0 + crane.x1) / 2;
    for (const c of this.chains) { c.a += c.v * dt; c.v += (-c.a * 6 - c.v * 1.2) * dt; c.m.rotation.z = Math.sin(this.t * 0.8 + c.ph) * c.amp + c.a; }
    for (const [i, lamp] of (this.lamps || []).entries()) {
      lamp.rotation.z = Math.sin(this.t * 0.9 + i * 2) * 0.06;
      const fl = (Math.sin(this.t * 37 + i * 5) > 0.97 && i === 1) ? 0.3 : 1;
      lamp.userData.light.userData.flicker = fl;
      lamp.userData.light.intensity = lamp.userData.light.userData.base * (1 - this.dark * 0.92) * fl;
    }
    this.vents.update(dt);
    this.ref.update(dt, s);
    this.syncProps(s, dt);
  }
}
