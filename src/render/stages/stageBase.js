// Shared stage view logic: syncing simulation props to voxel meshes + common reactions.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, shadeColor, vhash } from '../voxel.js';
import { mat, mesh, barrelGrid, crateGrid, VS_SM, VS_XS, RUST, WOOD } from './kit.js';
import { setupLighting, makeBackdrop, GodRays, MarineSnow, FishSchool } from '../env.js';

function snailGrid() {
  const g = new VoxelGrid(8, 7, 6);
  g.ellipsoid(4, 4, 3, 3, 3, 2.5, (x, y) => ((x + y) % 3 === 0 ? { c: 0xb88a1e, e: 60 } : { c: 0xf0c33c, e: 90 }));
  g.box(0, 0, 1.5, 8, 2, 4.5, 0xe0c99a);
  g.set(7, 3, 2, 0x3a2a1a); g.set(7, 3, 3, 0x3a2a1a);
  return g;
}
function mugGrid() {
  const g = new VoxelGrid(7, 9, 7);
  g.cylinder('y', 3, 3.5, 0, 8, 2.6, (x, y) => (y > 6 ? 0xfff7e0 : y === 0 ? 0x8a6a2a : { c: 0xf0b030, e: 30 }));
  g.box(5, 2, 3, 7, 6, 4, 0xd8c8a0);
  return g;
}
function bottleGrid() {
  const g = new VoxelGrid(5, 12, 5);
  g.cylinder('y', 2.5, 2.5, 0, 7, 2.2, { c: 0x3a8a3a, e: 25 });
  g.cylinder('y', 2.5, 2.5, 7, 11, 1, 0x3a8a3a);
  g.box(1, 3, 1, 4, 5, 4.1, 0xf0e6cc, { mode: 'paint' });
  g.box(2, 11, 2, 3, 12, 3, 0xb5561f);
  return g;
}
function stoolGrid() {
  const g = new VoxelGrid(10, 11, 10);
  g.cylinder('y', 5, 5, 9, 11, 4.6, (x, y, z) => (vhash(x, y, z, 2) < 0.2 ? WOOD[2] : WOOD[3]));
  for (const [x, z] of [[2, 2], [7, 2], [2, 7], [7, 7]]) g.box(x, 0, z, x + 1, 9, z + 1, WOOD[1]);
  g.box(2, 3, 2, 8, 4, 3, WOOD[1]); g.box(2, 3, 7, 8, 4, 8, WOOD[1]);
  return g;
}

export class StageBase {
  constructor(scene, renderer, particles, fx) {
    this.scene = scene; this.renderer = renderer; this.p = particles; this.fx = fx;
    this.propViews = new Map();
    this.t = 0;
    this.dark = 0;
    this.lampLights = [];
    this.shared = {};
  }
  baseEnv(o = {}) {
    this.lights = setupLighting(this.scene, this.renderer, o.light || {});
    this.backdrop = makeBackdrop(this.scene, o.backdrop || {});
    this.rays = new GodRays(this.scene, o.rays || {});
    this.snow = new MarineSnow(this.scene, o.snow || {});
    if (o.fish !== false) this.fish = new FishSchool(this.scene, o.fish || {});
  }
  geo(name, fn, vs, pivot) {
    if (!this.shared[name]) this.shared[name] = { geo: meshVoxels(fn(), { size: vs, pivot }), mat: mat(vs) };
    return this.shared[name];
  }
  makeProp(p) {
    let obj;
    const M = (name, fn, vs, pivot) => { const s = this.geo(name, fn, vs, pivot); const m = new THREE.Mesh(s.geo, s.mat); m.castShadow = true; m.receiveShadow = true; return m; };
    switch (p.type) {
      case 'barrel': {
        const colors = [0x9c1f1f, 0x2a5aa8, 0x3a7a3a, 0xd8a020];
        const c = colors[p.id % colors.length];
        obj = new THREE.Group();
        const m = M('barrel' + c, () => barrelGrid(c, { label: true }), VS_SM, [6, 7.5, 6]);
        m.position.y = 7.5 * VS_SM; obj.add(m); obj.userData.inner = m; obj.userData.roll = 0;
        break;
      }
      case 'crate': obj = M('crate', () => crateGrid(3, { stencil: true }), VS_SM, [8, 0, 8]); break;
      case 'snail': obj = M('snail', snailGrid, VS_XS, [4, 2, 3]); obj.scale.setScalar(1.4); break;
      case 'mug': obj = M('mug', mugGrid, VS_XS, [3, 0, 3.5]); break;
      case 'bottle': obj = M('bottle', bottleGrid, VS_XS, [2.5, 0, 2.5]); break;
      case 'stool': obj = M('stool', stoolGrid, VS_SM, [5, 0, 5]); break;
      default: obj = this.makeCustomProp(p); break;
    }
    if (!obj) return null;
    obj.userData.type = p.type;
    this.scene.add(obj);
    return obj;
  }
  makeCustomProp() { return null; }

  syncProps(s, dt) {
    const seen = new Set();
    for (const p of s.props) {
      seen.add(p.id);
      let v = this.propViews.get(p.id);
      if (!v) { const obj = this.makeProp(p); if (!obj) continue; v = { obj, p0: { x: p.x, y: p.y } }; this.propViews.set(p.id, v); }
      this.updateProp(v, p, dt, s);
    }
    for (const [id, v] of this.propViews) {
      if (!seen.has(id)) { this.scene.remove(v.obj); this.propViews.delete(id); }
    }
  }
  updateProp(v, p, dt) {
    const o = v.obj;
    switch (p.type) {
      case 'barrel': {
        const moving = Math.abs(p.vx) > 0.01;
        o.position.set(p.x, p.y, 0.15);
        o.userData.tip = (o.userData.tip || 0) + ((moving || o.userData.tipped ? 1 : 0) - (o.userData.tip || 0)) * Math.min(1, dt * 10);
        if (moving) o.userData.tipped = true;
        const tip = o.userData.tip;
        o.userData.roll -= p.vx * 60 * dt / 0.35;
        o.rotation.set(tip * Math.PI / 2, 0, 0);
        o.userData.inner.rotation.y = 0;
        o.rotation.z = 0;
        if (tip > 0.5) { o.rotation.set(Math.PI / 2, 0, 0); o.rotation.y = 0; o.userData.inner.rotation.y = o.userData.roll; o.position.y = p.y + 0.38 - 7.5 * VS_SM * 0; }
        break;
      }
      case 'crate':
        o.visible = p.state !== 'broken';
        o.position.set(p.x, p.y, 0.1);
        if (p.hitCd > 8) o.position.x += (Math.random() - 0.5) * 0.06;
        break;
      case 'snail':
        o.position.set(p.x, p.y + 0.05 + (p.state === 'rest' ? Math.abs(Math.sin(this.t * 4 + p.id)) * 0.08 : 0), 0.4);
        o.rotation.y += dt * 2;
        if (Math.random() < dt * 4) this.p.spawn({ glow: true, x: p.x + (Math.random() - 0.5) * 0.3, y: p.y + 0.2 + Math.random() * 0.3, z: 0.5, vy: 0.4, life: 0.5, size: 0.1, size1: 0.02, spr: 'sparkle', anim: 'life', color: 0xfff08a });
        break;
      case 'mug': case 'bottle': case 'stool':
        o.position.set(p.x, p.y, p.state === 'held' ? 0.35 : 0);
        if (p.state === 'thrown' || p.state === 'fly') o.rotation.z += dt * 14 * Math.sign(p.vx || 1) * -1;
        else if (p.state === 'held') o.rotation.z = -0.3;
        else o.rotation.z *= 0.8;
        break;
      default: this.updateCustomProp(v, p, dt); break;
    }
  }
  updateCustomProp() {}

  // events common to all stages
  onEvent(e) {
    const fx = this.fx;
    switch (e.t) {
      case 'propBreak':
        if (e.type === 'crate') {
          fx.shards(e.x, e.y, 26, [WOOD[1], WOOD[2], WOOD[3], 0xb97f46], { spr: 'splinter', s0: 0.1, s1: 0.22, sp1: 8 });
          fx.dust(e.x, e.y - 0.4, 10, 0x8a7350, 1.4);
          fx.shake(0.35);
        }
        break;
      case 'propHit':
        if (e.type === 'crate') fx.shards(e.x, e.y, 6, [WOOD[2], WOOD[3]], { spr: 'splinter', sp1: 4 });
        if (e.type === 'barrel' || e.type === 'barrelWall') { fx.sparks(e.x, e.y, 6, { colors: [0xffd080, 0xffffff], sp1: 6 }); }
        break;
      case 'itemBreak':
        if (e.type === 'stool') fx.shards(e.x, e.y + 0.3, 16, [WOOD[1], WOOD[2], WOOD[3]], { spr: 'splinter' });
        else { fx.shards(e.x, e.y + 0.2, 18, e.type === 'bottle' ? [0x6ad06a, 0x3a8a3a, 0xcfffd0] : [0xfff7e0, 0xf0b030, 0xffffff], { spr: 'glass', s0: 0.05, s1: 0.12, sp1: 6 }); fx.bubbleBurst(e.x, e.y + 0.3, 12, 1.2); }
        break;
      case 'snailPickup':
        fx.burst(e.x, e.y + 0.3, { n: 10, spr: 'sparkle', colors: [0xfff08a, 0xffffff, 0xf0c33c], glow: true, sp0: 1, sp1: 3, anim: 'life', life1: 0.6 });
        fx.text('+SNAIL', e.x, e.y + 0.8, { color: '#f0c33c', size: 'small', dur: 0.8 });
        break;
      default: break;
    }
  }

  setDark(d) {
    this.dark = d;
    this.lights?.setDark(d);
    if (this.backdrop) this.backdrop.material.uniforms.uDark.value = d;
    if (this.rays) this.rays.setIntensity(1 - d * 0.95);
    for (const l of this.lampLights) l.intensity = (l.userData.base ?? 15) * (1 - d * 0.9) * (l.userData.flicker ?? 1);
    if (this.snow) this.snow.mat.opacity = 0.55 * (1 - d * 0.6);
  }

  update(dt, sim) {
    this.t += dt;
    this.snow?.update(dt);
    this.fish?.update(dt);
  }

  dispose() {
    for (const [, v] of this.propViews) this.scene.remove(v.obj);
    this.propViews.clear();
  }
}
