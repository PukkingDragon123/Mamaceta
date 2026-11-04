// Developer test screen (?screen=devtest): renders environment kit + UI widgets.
import * as THREE from 'three';
import { makeScene } from '../game.js';
import { setupLighting, makeBackdrop, GodRays, MarineSnow, FishSchool, algaeField, BubbleVents } from '../render/env.js';
import { VoxelGrid, meshVoxels, vhash, shadeColor } from '../render/voxel.js';
import { voxelMaterial } from '../render/materials.js';
import { Particles } from '../render/particles.js';
import { P } from '../ui/palette.js';

export class DevTest {
  enter() {
    const g = this.game;
    this.scene = makeScene(0x0b3f50, 0.03);
    this.camera = new THREE.PerspectiveCamera(40, g.renderer.aspect, 0.1, 200);
    this.camera.position.set(0, 3.2, 13);
    this.camera.lookAt(0, 1.4, 0);
    this.lights = setupLighting(this.scene, g.renderer, {});
    makeBackdrop(this.scene, {});
    this.rays = new GodRays(this.scene, {});
    this.snow = new MarineSnow(this.scene, {});
    this.fish = new FishSchool(this.scene, {});
    this.particles = new Particles(this.scene);
    this.vents = new BubbleVents(this.particles, [{ x: -3, y: 0.1, z: -1, rate: 5 }, { x: 4, y: 0.1, z: -2, rate: 3 }]);
    // floor
    const vs = 1 / 8;
    const fg = new VoxelGrid(200, 4, 64);
    fg.box(0, 0, 0, 200, 3, 64, (x, y, z) => {
      const h = vhash(x >> 2, 0, z >> 2);
      if (y === 2) return h < 0.15 ? 0x6b5a3a : (vhash(x, y, z) < 0.5 ? 0xc2a56a : 0xb39558);
      return 0x8a7350;
    });
    const floor = new THREE.Mesh(meshVoxels(fg, { size: vs, pivot: [100, 3, 40] }), voxelMaterial({ voxelSize: vs, jitter: 0.12 }));
    floor.receiveShadow = true; floor.castShadow = true;
    this.scene.add(floor);
    // crate
    const cg = new VoxelGrid(16, 16, 16);
    cg.box(0, 0, 0, 16, 16, 16, (x, y, z) => {
      const edge = (x < 2 || x > 13) + (y < 2 || y > 13) + (z < 2 || z > 13) >= 2;
      if (edge) return 0x5a3522;
      return (y % 4 === 0) ? 0x7a4a2c : 0x9c6436;
    });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(meshVoxels(cg, { size: 1 / 16 * 1.0, pivot: [8, 0, 8] }), voxelMaterial({ voxelSize: 1 / 16 }));
      m.position.set(-2 + i * 2.2, 0, -1 + i * 0.3); m.castShadow = m.receiveShadow = true; m.rotation.y = i * 0.3;
      this.scene.add(m);
    }
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push({ x: -10 + Math.random() * 20, y: 0, z: -5 + Math.random() * 4, h: 0.4 + Math.random() * 1.2 });
    this.scene.add(algaeField(pts, { seed: 3 }));
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.snow.update(dt); this.fish.update(dt); this.vents.update(dt); this.particles.update(dt);
    this.camera.aspect = this.game.renderer.aspect; this.camera.updateProjectionMatrix();
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
      for (let i = 0; i < 20; i++) this.particles.spawn({ x: 0, y: 1.5, z: 0, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, grav: -6, life: 0.8, size: 0.12, spr: 'shard', frame: i % 4, color: 0xffd080, rv: 10, floor: 0.02, bounce: 0.4 });
      for (let i = 0; i < 8; i++) this.particles.spawn({ glow: true, x: 0, y: 1.5, z: 0.5, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 0.35, size: 0.25, size1: 0.05, spr: 'spark', color: 0x9ff3ff, stretch: 0.25 });
    }
  }
  drawUI(ui) {
    ui.hangingSign(20, 30, 150, 110, { seed: 4 });
    ui.text('MANTIS MAYHEM', 95, 40, { font: 'big', align: 'center', color: P.gold3 });
    ['LOCAL VERSUS', 'ONLINE', 'CUSTOMIZE', 'SETTINGS'].forEach((s, i) => ui.plank(40, 68 + i * 17, 110, 15, s, { selected: i === 1, seed: i + 2 }));
    ui.text('The quick brown shrimp jumps over the lazy crab. 0123456789', 10, ui.h - 14, {});
    ui.icon('snail', ui.w - 60, 8); ui.text('1,250', ui.w - 44, 11, { font: 'labelB', color: P.gold4 });
  }
}
