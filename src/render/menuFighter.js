// Fighters hanging around the locker room doing their own funny idle activities.
import * as THREE from 'three';
import { Rig, DEFAULT_POSE } from './rig.js';
import { buildSpec } from './rigs/characters.js';
import { Puru } from './rigs/puru.js';
import { STYLE, stance, over, lerpPose, victoryPose } from './anim.js';
import { VoxelGrid, meshVoxels } from './voxel.js';
import { voxelMaterial } from './materials.js';
import { ease } from '../core/math.js';

const ACTS = {
  jim: ['poses', 'bag', 'read', 'bag', 'wrap', 'poses'],
  brutus: ['eat', 'sleep', 'belly', 'eat'],
  bobby: ['balance', 'chase', 'stuck', 'spin'],
  mimi: ['puru', 'selfie', 'ribbons', 'dance'],
};

function smallMesh(build, vs = 1 / 28) { const g = build(); const m = new THREE.Mesh(meshVoxels(g, { size: vs, pivot: [g.sx / 2, 0, g.sz / 2] }), voxelMaterial({ voxelSize: vs, shared: true })); m.castShadow = true; return m; }

export class MenuFighter {
  constructor(scene, char, cos = {}, particles = null) {
    this.scene = scene; this.char = char; this.cos = cos; this.particles = particles;
    this.rig = new Rig(buildSpec(char, cos), { rim: 0.25 });
    this.rig.addTo(scene);
    this.t = Math.random() * 5; this.actT = 0; this.actIdx = 0;
    this.act = ACTS[char][0];
    this.slot = { x: 0, z: 0, face: 1 };
    this.react = null; this.reactT = 0;
    this.lastPose = null; this.blendT = 1; this.blendFrom = null;
    this.look = new THREE.Vector3(0, 2, 6);
    if (char === 'mimi') { this.puru = new Puru(this.rig.spec.puru || 'default'); this.puru.addTo(scene); this.puruPos = new THREE.Vector3(); this.puruInit = false; }
    // props: Jim's manga, Brutus' snail, Mimi's phone
    if (char === 'jim') { this.book = smallMesh(() => { const g = new VoxelGrid(8, 10, 2); g.box(0, 0, 0, 8, 10, 2, (x, y) => (x === 4 ? 0xffffff : y > 6 ? 0xd8322a : 0xf5e6c4)); return g; }); this.rig.nodes.handF.add(this.book); this.book.position.set(0.05, -0.18, 0.05); this.book.visible = false; }
    if (char === 'brutus') { this.snail = smallMesh(() => { const g = new VoxelGrid(8, 7, 6); g.ellipsoid(4, 4, 3, 3, 3, 2.5, (x, y) => ((x + y) % 3 === 0 ? 0xb88a1e : 0xf0c33c)); g.box(0, 0, 1.5, 8, 2, 4.5, 0xe0c99a); return g; }); this.rig.nodes.handB.add(this.snail); this.snail.position.set(0.05, -0.3, 0); this.snail.visible = false; }
    if (char === 'mimi') { this.phone = smallMesh(() => { const g = new VoxelGrid(5, 8, 2); g.box(0, 0, 0, 5, 8, 2, (x, y, z) => (z === 1 && y > 1 && y < 7 && x > 0 && x < 4 ? { c: 0x9cf0ff, e: 160 } : 0xff6fb0)); return g; }); this.rig.nodes.handF.add(this.phone); this.phone.position.set(0.05, -0.15, 0.05); this.phone.visible = false; }
    this.visible = true;
  }

  setVisible(v) { this.visible = v; this.rig.setVisible(v); if (this.puru) this.puru.setVisible(v); }
  setSlot(s) { this.slot = s; this.rig.root.position.set(s.x, 0, s.z); this.rig.setFacing(s.face); this.rig.resetChains(); if (this.puru) this.puruInit = false; }
  setActivity(a) { if (a !== this.act) { this.act = a; this.actT = 0; } }
  doReact(kind) { this.react = kind; this.reactT = 0; }
  dispose() { this.rig.removeFrom(this.scene); this.rig.dispose(); if (this.puru) this.puru.removeFrom(this.scene); }

  sitBase(base, extraDrop = 0) {
    const D = this.rig.D;
    const legLen = D.thighL + D.shinL;
    const benchTop = this.slot.crate ? 0.6 : 0.44;
    const hipDrop = 0.6 + extraDrop;
    const hipH = D.footH + legLen * (1 - hipDrop);
    const rootY = Math.max(0, benchTop + 0.07 - hipH);
    return over(base, { hipDrop, rootY, hipRot: -0.05, sp1: 0.12, sp2: 0.18, fF: [0.5, -rootY / legLen], fB: [0.38, -rootY / legLen], footRotF: -0.2, footRotB: -0.2 });
  }

  computePose() {
    const ch = this.char, t = this.t, at = this.actT;
    const st = STYLE[ch];
    const base = stance(st, t, 0.6);
    const seated = this.slot.seat || this.slot.crate;
    let p;
    if (this.react) {
      const k = this.reactT;
      if (this.react === 'pick' || this.react === 'locked') {
        const vp = victoryPose({ char: ch, cs: {} }, base, k * 60, t, ch + 'Win');
        p = k < 0.25 ? lerpPose(seated ? this.sitBase(base) : base, vp, ease.outBack(k / 0.25)) : vp;
        if (this.react === 'pick' && k > 1.6) this.react = null;
        return p;
      }
      if (this.react === 'wave') {
        p = over(seated ? this.sitBase(base) : base, { hB: [0.3, 1.05 + Math.sin(t * 14) * 0.08], wrB: Math.sin(t * 14) * 0.6, headRoll: 0.15 });
        if (k > 1.2) this.react = null;
        return p;
      }
      if (this.react === 'flinch') { p = over(base, { hipRot: -0.3, head: -0.4, hF: [0.3, 1.0], hB: [0.2, 0.9], eyesOpen: 1.3 }); if (k > 0.6) this.react = null; return p; }
    }
    switch (this.act) {
      case 'poses': {
        const poses = [
          { hipDrop: 0.3, hF: [1.0, 1.05], hB: [-0.1, 0.25], wrF: -2.2, head: -0.35, fF: [0.6, 0], fB: [-0.55, 0], eyesOpen: 0.6 },
          { hipDrop: 0.35, hF: [0.2, 0.3], hB: [0.1, 0.3], sp2Yaw: -0.8, hipYaw: -0.4, fF: [0.5, 0], fB: [-0.55, 0], eyesOpen: 0.5, head: 0.1 },
          { hipDrop: 0.2, hF: [0.95, 0.6], hB: [0.9, 0.55], wrF: -1.5, wrB: -1.5, sp2: 0.25, fF: [0.55, 0], fB: [-0.45, 0] },
          { hipDrop: 0.1, hF: [0.3, 1.1], hB: [0.2, 1.1], head: -0.45, eyesOpen: 1.2, fF: [0.2, 0], fB: [-0.2, 0] },
        ];
        const dur = 1.4, i = Math.floor(at / dur) % (poses.length + 1);
        const lk = (at % dur) / dur;
        if (i === poses.length) { // trip!
          const s = Math.min(1, lk * 3);
          p = over(base, { rootRot: s * 1.2, hipDrop: 0.3 + s * 0.2, hF: [0.3, 1.1], hB: [0.0, 1.0], fF: [0.6, 0.6 * s], eyesOpen: 1.3, head: -0.4 });
          if (lk > 0.6) p = lerpPose(p, base, (lk - 0.6) / 0.4);
        } else p = lerpPose(base, over(base, poses[i]), ease.outBack(Math.min(1, lk * 4)));
        if (this.book) this.book.visible = false;
        break;
      }
      case 'bag': {
        // practising combos on the punching bag
        const c = (at % 0.62) / 0.62;
        const alt = Math.floor(at / 0.62) % 3;
        const hit = c > 0.35 && c < 0.6;
        p = over(base, { hipDrop: 0.2, sp2: 0.25, fF: [0.45, 0], fB: [-0.45, 0] });
        if (alt === 2) { p.hB = hit ? [1.05, 0.55] : [0.1, 0.4]; p.wrB = hit ? -1.6 : 0; p.sp2Yaw = hit ? 0.5 : -0.5; }
        else { p.hF = hit ? [1.0, 0.68] : [0.45, 0.62]; p.wrF = hit ? -1.4 : -0.3; p.sp2Yaw = hit ? -0.35 : 0.2; }
        if (hit && !this.bagHit) { this.bagHit = true; this.punch = alt === 2 ? 2 : 1; }
        if (!hit) this.bagHit = false;
        if (this.book) this.book.visible = false;
        break;
      }
      case 'read': {
        p = this.sitBase(base);
        p.hF = [0.55, 0.45]; p.hB = [0.5, 0.42]; p.wrF = -0.6; p.wrB = -0.6; p.head = 0.35; p.eyesOpen = 0.7;
        const excited = Math.sin(at * 0.9) > 0.92;
        if (excited) { p.hB = [0.4, 1.1]; p.wrB = -2; p.head = -0.3; p.eyesOpen = 1.3; }
        if (this.book) this.book.visible = true;
        break;
      }
      case 'wrap': {
        p = this.sitBase(base);
        p.hF = [0.55, 0.35]; p.hB = [0.55 + Math.sin(t * 9) * 0.15, 0.4 + Math.cos(t * 9) * 0.15]; p.head = 0.4; p.eyesOpen = 0.8;
        if (this.book) this.book.visible = false;
        break;
      }
      case 'eat': {
        p = this.sitBase(base);
        const c = (at % 2.4) / 2.4;
        if (c < 0.4) { p.hB = [0.5, 0.2]; p.hF = [0.45, 0.25]; p.head = 0.2; }
        else { p.hB = [0.4, 0.85 + Math.sin(t * 20) * 0.04]; p.hF = [0.4, 0.3]; p.head = -0.25; p.mouth = Math.abs(Math.sin(t * 14)); p.eyesOpen = 0.35; }
        if (this.snail) this.snail.visible = c < 0.75;
        if (c > 0.75 && c < 0.8 && this.particles && Math.random() < 0.3) this.particles.spawn({ x: this.slot.x + 0.4 * this.slot.face, y: 1.6, z: this.slot.z + 0.3, vx: (Math.random() - 0.5), vy: 1, grav: -6, life: 0.6, size: 0.06, spr: 'shard', frame: 1, color: 0xf0c33c, rv: 10, floor: 0.02, bounce: 0.4 });
        break;
      }
      case 'sleep': {
        p = this.sitBase(base, 0.05);
        p.head = 0.7; p.sp2 = 0.4; p.hF = [0.4, -0.2]; p.hB = [0.3, -0.25]; p.eyesOpen = 0;
        p.sqY = 1 + Math.sin(t * 2.2) * 0.03; p.sqX = 1 - Math.sin(t * 2.2) * 0.02;
        if (this.particles && Math.random() < 0.02) this.particles.spawn({ x: this.slot.x + 0.5 * this.slot.face, y: 1.6, z: this.slot.z + 0.3, vy: 0.4, vx: 0.15, life: 1.6, size: 0.12, size1: 0.22, spr: 'zzz', color: 0xffffff });
        if (this.particles && Math.random() < 0.03) this.particles.spawn({ x: this.slot.x + 0.55 * this.slot.face, y: 1.35, z: this.slot.z + 0.3, vy: 0.5, grav: 0.5, life: 1.4, size: 0.08, size1: 0.2, spr: 'bubble', color: 0xdff8ff, wob: [0.3, 4] });
        if (this.snail) this.snail.visible = false;
        break;
      }
      case 'belly': {
        p = this.sitBase(base);
        const pat = Math.abs(Math.sin(t * 6));
        p.hF = [0.6, 0.0 + pat * 0.15]; p.hB = [0.55, 0.05 + (1 - pat) * 0.15]; p.head = -0.15; p.eyesOpen = 0.5;
        p.sqX = 1 + pat * 0.03;
        if (this.snail) this.snail.visible = false;
        break;
      }
      case 'balance': {
        p = over(base, { hF: [0.2 + Math.sin(t * 2) * 0.3, 0.9], hB: [-0.2 - Math.sin(t * 2) * 0.3, 0.85] });
        p.headRoll = Math.sin(t * 2.3) * 0.4; p.hipRoll = Math.sin(t * 2.3 + 0.5) * 0.15; p.hipX = Math.sin(t * 1.7) * 0.08;
        p.eyeL = [0, 0.8]; p.eyeR = [0, 0.8];
        break;
      }
      case 'chase': {
        const ph = t * 10;
        p = over(base, { hF: [0.9, 0.8 + Math.sin(t * 12) * 0.2], hB: [0.7, 0.9], fF: [Math.sin(ph) * 0.3, Math.max(0, Math.cos(ph)) * 0.2], fB: [-Math.sin(ph) * 0.3, Math.max(0, -Math.cos(ph)) * 0.2], head: -0.3 });
        this.rig.root.position.x = this.slot.x + Math.sin(at * 1.2) * 0.8;
        this.rig.setFacing(Math.cos(at * 1.2) > 0 ? 1 : -1);
        p.eyeL = [0.5, 0.7]; p.eyeR = [0.3, 0.8];
        if (this.particles && Math.random() < 0.05) this.particles.spawn({ x: this.rig.root.position.x + this.rig.facing * 0.6, y: 1.6, z: this.slot.z, vy: 0.3, grav: 0.2, life: 1.5, size: 0.14, spr: 'bubble', color: 0xdff8ff, wob: [0.5, 3] });
        break;
      }
      case 'stuck': {
        p = over(base, { head: 0.8, hF: [0.3, 1.0 + Math.sin(t * 15) * 0.05], hB: [0.2, 1.0 + Math.cos(t * 15) * 0.05], wrF: 1, wrB: 1, hipX: Math.sin(t * 5) * 0.06, eyesOpen: 0.1 });
        p.headRoll = Math.sin(t * 7) * 0.3;
        break;
      }
      case 'spin': {
        p = over(base, { rootRot: -1.55, hipDrop: 0.1, hF: [0.5, 0.9], hB: [0.3, 1.0], fF: [0.3, 0.5], fB: [-0.3, 0.6], eyesOpen: 1.2 });
        p.hipYaw = t * 6; p.rootY = 0.15;
        break;
      }
      case 'puru': case 'ribbons': {
        p = seated ? this.sitBase(base) : base;
        if (this.act === 'puru') { p.hF = [0.5, 1.0]; p.hB = [0.4, 0.95]; p.head = -0.3; p.eyesOpen = 0.9; }
        else { p.hF = [0.35, 1.2]; p.hB = [0.25, 1.15]; p.headRoll = Math.sin(t * 2) * 0.2; p.eyesOpen = 0.4; }
        if (this.phone) this.phone.visible = false;
        break;
      }
      case 'selfie': {
        p = seated ? this.sitBase(base) : base;
        p.hF = [0.75, 0.95]; p.wrF = -0.5; p.hB = [0.35, 1.0]; p.headRoll = 0.3; p.eyesOpen = (at % 3) > 2.6 ? 0.05 : 0.5;
        if ((at % 3) > 2.6 && (at % 3) < 2.65 && this.particles) this.particles.spawn({ glow: true, x: this.slot.x + this.slot.face * 0.6, y: 1.9, z: this.slot.z + 0.4, life: 0.12, size: 0.8, spr: 'sparkle', frame: 2, color: 0xffffff, boost: 5 });
        if (this.phone) this.phone.visible = true;
        break;
      }
      case 'dance': {
        const b = Math.sin(t * 7);
        p = over(base, { hipDrop: 0.15 + Math.abs(b) * 0.06, hF: [0.45, 0.8 + b * 0.25], hB: [0.4, 0.8 - b * 0.25] });
        p.hipYaw = b * 0.4; p.headRoll = b * 0.25; p.fB = [-0.25, Math.max(0, b) * 0.2];
        if (this.phone) this.phone.visible = false;
        break;
      }
      default: p = base;
    }
    return p;
  }

  update(dt, ctx = {}) {
    this.t += dt; this.actT += dt;
    if (this.react) this.reactT += dt;
    // cycle activities
    if (!ctx.fixedActivity && this.actT > 9 + (this.char === 'jim' ? 0 : 2)) { this.actIdx = (this.actIdx + 1) % ACTS[this.char].length; this.setActivity(ACTS[this.char][this.actIdx]); }
    if (this.act !== 'chase' && !this.react) { this.rig.root.position.x = this.slot.x; this.rig.setFacing(this.slot.face); }
    let pose = this.computePose();
    const key = (this.react || '') + this.act;
    if (key !== this.lastKey) { this.blendFrom = this.lastPose; this.blendT = 0; this.lastKey = key; }
    if (this.blendFrom && this.blendT < 1) { this.blendT = Math.min(1, this.blendT + dt / 0.25); pose = lerpPose(this.blendFrom, pose, ease.inOutSine(this.blendT)); }
    this.lastPose = pose;
    this.rig.applyPose({ ...DEFAULT_POSE, ...pose });
    this.rig.update(dt, { look: ctx.look || this.look, wander: 0.35 });
    if (this.puru) {
      const r = this.rig.root.position;
      let target;
      if (this.act === 'puru' && !this.react) {
        const c = (this.actT % 1.6) / 1.6;
        const h = Math.sin(c * Math.PI) * 0.9;
        target = new THREE.Vector3(r.x + this.rig.facing * 0.35, (this.slot.crate ? 0.6 : 0) + 1.55 + h, r.z + 0.15);
        if (c < 0.05) this.puru.squash = 0.5;
      } else target = new THREE.Vector3(r.x - this.rig.facing * 0.55 + Math.sin(this.t * 1.3) * 0.1, 1.85 + Math.sin(this.t * 2) * 0.1 + (this.slot.crate ? 0.5 : 0), r.z + 0.3);
      if (!this.puruInit) { this.puruPos.copy(target); this.puruInit = true; }
      this.puruPos.lerp(target, Math.min(1, dt * 8));
      this.puru.root.position.copy(this.puruPos);
      this.puru.root.rotation.y = this.rig.facing > 0 ? 0 : Math.PI;
      this.puru.update(dt, {});
    }
  }
}
