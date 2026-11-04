// Puru: Mimi's pink jellyfish friend (translucent glowing bell + soft tentacles + cute face).
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, shadeColor, vhash } from '../voxel.js';
import { voxelMaterial } from '../materials.js';
import { SoftChain } from '../rig.js';
import { VS } from './parts.js';

const STYLES = {
  default: { bell: 0xff7ac0, rim: 0xffd0e8, tent: 0xff9ad0, eye: 0x2a0a20, blush: 0xff3a8a, glow: 60 },
  idol: { bell: 0x7ae8e0, rim: 0xffffff, tent: 0xff9ad0, eye: 0x0a2a2a, blush: 0xff6fb0, glow: 60, bow: 0xffcf3a },
  sakura: { bell: 0xffc8e0, rim: 0xffffff, tent: 0xffb6d9, eye: 0x4a1a2a, blush: 0xff6fb0, glow: 50, flower: 0xff6fb0 },
  goth: { bell: 0x5a2a7a, rim: 0x2a0a3a, tent: 0x3a1a4a, eye: 0xff1a3a, blush: 0x8a1a3a, glow: 90, eyeGlow: true },
  magical: { bell: 0xc8b0ff, rim: 0xfff8ff, tent: 0xe0d0ff, eye: 0x2a1a6a, blush: 0xff8ac0, glow: 120, stars: true },
};

export class Puru {
  constructor(style = 'default') {
    const st = STYLES[style] || STYLES.default;
    this.style = st;
    this.root = new THREE.Group();
    this.world = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const g = new VoxelGrid(14, 10, 14);
    const c = 7;
    g.ellipsoid(c, 2, c, 6.5, 7, 6.5, (x, y, z) => {
      if (y < 2) return null;
      const fx = x + 0.5 - c, fz = z + 0.5 - c;
      if (y <= 2.5 && Math.sin(Math.atan2(fz, fx) * 8) > 0.2) return { c: st.rim, e: st.glow };
      if (st.stars && vhash(x, y, z, 4) < 0.06) return { c: 0xffffff, e: 255 };
      if (st.flower && vhash(x, y, z, 8) < 0.05) return { c: st.flower, e: 80 };
      const t = (y - 2) / 7;
      return { c: shadeColor(st.bell, t * 0.25), e: Math.round(st.glow * (0.6 + t * 0.4)) };
    });
    g.ellipsoid(c, 2, c, 5.2, 5.6, 5.2, null, { mode: 'carve' });
    // face on +x side
    const ex = 13;
    for (const z of [5, 8]) { g.set(ex, 5, z, st.eye, st.eyeGlow ? 255 : 0); g.set(ex, 6, z, st.eye, st.eyeGlow ? 255 : 0); g.set(ex - 1, 5, z, st.eye); g.set(ex, 6, z, st.eye); }
    g.set(ex, 6, 5, 0xffffff, 255);
    g.set(ex - 1, 3, 6, 0x2a0a20); g.set(ex - 1, 3, 7, 0x2a0a20);
    g.set(ex - 1, 4, 4, st.blush, 80); g.set(ex - 1, 4, 9, st.blush, 80);
    if (st.bow) { g.box(5, 8, 4, 9, 10, 10, st.bow); g.box(6, 8, 6, 8, 10, 8, 0xffffff); }
    const geo = meshVoxels(g, { size: VS, pivot: [7, 4, 7] });
    this.mat = voxelMaterial({ voxelSize: VS, jitter: 0.04, edge: 0.03, transparent: true, opacity: 0.82, emissiveBoost: 1.6, rim: 0.9, rimColor: st.rim, roughness: 0.3 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.body.add(this.mesh);
    // inner glow core
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.bell).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = 0.05;
    this.body.add(core);
    // tentacles as soft chains anchored to the bell
    this.chains = [];
    const tentMat = voxelMaterial({ voxelSize: VS, jitter: 0.03, edge: 0, transparent: true, opacity: 0.8, emissiveBoost: 1.4 });
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 2 ? 0.17 : 0.12;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const len = i % 2 ? 6 : 5;
      const rest = [];
      for (let k = 0; k <= len; k++) rest.push([x * (1 + k * 0.05), -0.08 - k * 0.075, z * (1 + k * 0.05)]);
      const segs = [], lens = [];
      for (let k = 0; k < len; k++) {
        const sg = new VoxelGrid(i % 2 ? 1 : 2, 2, i % 2 ? 1 : 2);
        sg.box(0, 0, 0, sg.sx, 2, sg.sz, { c: k % 2 ? st.tent : shadeColor(st.tent, 0.2), e: st.glow });
        const m = new THREE.Mesh(meshVoxels(sg, { size: VS, pivot: [sg.sx / 2, 0, sg.sz / 2] }), tentMat);
        m.scale.y = 0.075 / (2 * VS);
        const grp = new THREE.Group(); grp.add(m);
        segs.push(grp); lens.push(0.075);
      }
      this.chains.push(new SoftChain({ anchor: this.body, rest, segments: segs, lens, parent: this.world, stiff: 0.08, damp: 0.88, grav: -0.8 }));
    }
    this.t = Math.random() * 10;
    this.flash = 0;
    this.squash = 0;
  }
  addTo(p) { p.add(this.root); p.add(this.world); }
  removeFrom(p) { p.remove(this.root); p.remove(this.world); }
  setVisible(v) { this.root.visible = v; this.world.visible = v; }
  // pulse animation + chains
  update(dt, o = {}) {
    this.t += dt;
    const pulse = Math.sin(this.t * (o.fast ? 14 : 5));
    const s = o.scale ?? 1;
    const sq = this.squash;
    this.squash *= Math.exp(-dt * 8);
    this.body.scale.set(s * (1 + pulse * 0.06 + sq * 0.4), s * (1 - pulse * 0.08 - sq * 0.5), s * (1 + pulse * 0.06 + sq * 0.4));
    if (o.spin !== undefined) this.body.rotation.y = o.spin;
    this.mat.userData.u.uFlash.value = this.flash;
    this.root.updateWorldMatrix(true, true);
    for (const c of this.chains) c.update(dt);
  }
  resetChains() { for (const c of this.chains) c.reset(); }
}
