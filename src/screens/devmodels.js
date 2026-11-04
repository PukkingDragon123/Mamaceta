// Dev model viewer (?screen=models&skin=default): all four fighters in their stance.
import * as THREE from 'three';
import { makeScene } from '../game.js';
import { setupLighting, makeBackdrop } from '../render/env.js';
import { Rig, DEFAULT_POSE } from '../render/rig.js';
import { buildSpec, CHAR_IDS } from '../render/rigs/characters.js';
import { Puru } from '../render/rigs/puru.js';
import { VoxelGrid, meshVoxels } from '../render/voxel.js';
import { voxelMaterial } from '../render/materials.js';

export class DevModels {
  constructor(params) { this.params = params; }
  enter() {
    const g = this.game;
    this.scene = makeScene(0x0b3f50, 0.02);
    this.camera = new THREE.PerspectiveCamera(32, g.renderer.aspect, 0.1, 200);
    const zoom = +(this.params.get('zoom') || 1);
    this.camera.position.set(0, 1.6, 10 / zoom);
    this.camera.lookAt(0, 1.1, 0);
    setupLighting(this.scene, g.renderer, { sunPos: [4, 20, 12], target: [0, 0, 0] });
    makeBackdrop(this.scene, {});
    const fg = new VoxelGrid(120, 2, 40);
    fg.box(0, 0, 0, 120, 2, 40, (x, y, z) => ((x + z) % 2 ? 0x5a6a70 : 0x4a5a60));
    const floor = new THREE.Mesh(meshVoxels(fg, { size: 1 / 8, pivot: [60, 2, 20] }), voxelMaterial({ voxelSize: 1 / 8 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    const skin = this.params.get('skin') || 'default';
    const gloves = this.params.get('gloves') || 'default';
    const only = this.params.get('char');
    const ids = only ? [only] : CHAR_IDS;
    const perChar = (this.params.get('skins') || '').split(',');
    this.rigs = ids.map((id, i) => {
      const demon = this.params.get('demon') && id === 'bobby';
      const r = new Rig(buildSpec(id, { skin: perChar[i] || skin, gloves }, { demon }));
      r.addTo(this.scene);
      r.root.position.x = (i - (ids.length - 1) / 2) * 2.4;
      r.setFacing(i < ids.length / 2 ? 1 : -1);
      if (ids.length === 1) r.setFacing(1);
      return r;
    });
    if (ids.includes('mimi')) {
      this.puru = new Puru(this.params.get('puru') || (perChar[3] && perChar[3] !== 'default' ? perChar[3] : 'default'));
      this.puru.addTo(this.scene);
    }
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.camera.aspect = this.game.renderer.aspect; this.camera.updateProjectionMatrix();
    const look = new THREE.Vector3(0, 1.5, 3);
    for (const r of this.rigs) {
      const b = Math.sin(this.t * 6) * 0.02;
      r.applyPose({ ...DEFAULT_POSE, hipDrop: 0.12 + b, hF: [0.55, 0.55 + b], hB: [0.45, 0.4 + b] });
      r.update(dt, { look });
    }
    if (this.puru) {
      const m = this.rigs.find((r) => r.spec.charId === 'mimi');
      this.puru.root.position.set(m.root.position.x - 0.7 * m.facing, 1.5 + Math.sin(this.t * 2) * 0.1, 0.3);
      this.puru.update(dt);
    }
  }
}
