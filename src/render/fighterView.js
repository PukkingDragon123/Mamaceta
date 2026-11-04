// Visual representation of one fighter: rig(s), Puru, molt husks, held snail, aura/trail particles.
import * as THREE from 'three';
import { Rig } from './rig.js';
import { buildSpec } from './rigs/characters.js';
import { Puru } from './rigs/puru.js';
import { computePose, lerpPose } from './anim.js';
import { moveFor, CHARS } from '../sim/data.js';
import { voxelMaterial } from './materials.js';
import { VoxelGrid, meshVoxels } from './voxel.js';
import { TRAILS } from '../data/cosmetics.js';

const _v = new THREE.Vector3();

function snailMesh() {
  const g = new VoxelGrid(8, 7, 6);
  g.ellipsoid(4, 4, 3, 3, 3, 2.5, (x, y, z) => ((x + y) % 3 === 0 ? 0xb88a1e : 0xf0c33c));
  g.box(0, 0, 1.5, 8, 2, 4.5, 0xe0c99a);
  g.set(7, 2, 2, 0xe0c99a); g.set(7, 3, 2, 0x3a2a1a); g.set(7, 2, 3, 0xe0c99a); g.set(7, 3, 3, 0x3a2a1a);
  const m = new THREE.Mesh(meshVoxels(g, { size: 1 / 28, pivot: [4, 3, 3] }), voxelMaterial({ voxelSize: 1 / 28, shared: true }));
  m.castShadow = true;
  return m;
}

export class FighterView {
  constructor(scene, idx, char, cos = {}, particles = null) {
    this.scene = scene; this.idx = idx; this.char = char; this.cos = cos; this.particles = particles;
    this.rig = new Rig(buildSpec(char, cos));
    this.rig.addTo(scene);
    this.rigs = [this.rig];
    if (char === 'bobby') {
      this.demonRig = new Rig(buildSpec(char, cos, { demon: true }), { rim: 0.5, rimColor: 0xff2a4a });
      this.demonRig.addTo(scene);
      this.demonRig.setVisible(false);
      this.rigs.push(this.demonRig);
      for (const s of ['L', 'R']) {
        const light = new THREE.PointLight(0xff2a3a, 0, 3, 2);
        this.demonRig.nodes['eye' + s].add(light);
        (this.eyeLights ||= []).push(light);
      }
    }
    if (char === 'mimi') {
      this.puru = new Puru(this.rig.spec.puru || 'default');
      this.puru.addTo(scene);
      this.puruPos = new THREE.Vector3();
      this.puruVel = new THREE.Vector3();
      this.puruInit = false;
    }
    if (char === 'brutus') { this.snail = snailMesh(); this.snail.visible = false; this.rig.nodes.handB.add(this.snail); this.snail.position.set(0.05, -0.32, 0); }
    this.lastKey = '';
    this.lastPose = null;
    this.blendFrom = null; this.blendT = 1; this.blendDur = 0.08;
    this.time = Math.random() * 10;
    this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.husks = [];
    this.pos = new THREE.Vector3();
    this.trail = TRAILS.find((t) => t.key === cos.trail && t.key !== 'none') || null;
    this.trailAcc = 0;
    this.demon = false;
    this.airFlip = 0;
    this.prevAirJ = null;
    this.glow = 0;
    this.hidden = false;
    this.victory = cos.victory || 'default';
    this.lightRim = 0;
  }

  get active() { return this.demon ? this.demonRig : this.rig; }

  setDemon(on) {
    if (!this.demonRig) return;
    this.demon = on;
    this.rig.setVisible(!on);
    this.demonRig.setVisible(on);
    this.demonRig.resetChains();
    for (const l of this.eyeLights || []) l.intensity = on ? 2.5 : 0;
  }

  headPos(out = new THREE.Vector3()) { return this.active.headWorld(out); }

  flashHit(color = 0xffffff, amt = 1) { this.flash = amt; this.flashColor.set(color); }

  update(dt, f, alpha, ctx) {
    this.time += dt;
    const rig = this.active;
    // position (interpolated)
    const x = ctx.prevX + (f.x - ctx.prevX) * alpha;
    const y = ctx.prevY + (f.y - ctx.prevY) * alpha;
    this.pos.set(x, y, 0);
    for (const r of this.rigs) { r.root.position.set(x, y, 0); r.setFacing(f.face); }
    // air-jump flip timing
    if (this.prevAirJ !== null && f.airJ < this.prevAirJ && !f.ground) this.airFlip = 0.0001;
    this.prevAirJ = f.airJ;
    if (this.airFlip > 0) { this.airFlip += dt * 2.6; if (this.airFlip >= 1 || f.ground) this.airFlip = 0; }
    const m = f.st === 'attack' && f.mv ? moveFor(f.char, f.cs.demon, f.mv) : null;
    const key = f.st + ':' + (f.mv || '');
    let pose = computePose(f, { time: this.time, alpha: f.hitstop > 0 ? 0 : alpha, move: m, charStats: CHARS[f.char], airFlip: this.airFlip, victory: this.victory, lowBlock: f.st === 'blockstun' && ctx.lowBlock });
    if (key !== this.lastKey) {
      const snappy = f.st === 'attack' || f.st === 'hitstun' || f.st === 'airhit' || f.st === 'blockstun';
      if (this.lastPose) { this.blendFrom = this.lastPose; this.blendT = 0; this.blendDur = snappy ? 0.035 : 0.1; }
      this.lastKey = key;
    }
    if (this.blendFrom && this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      pose = lerpPose(this.blendFrom, pose, this.blendT);
    }
    this.lastPose = pose;
    // demon stutter: update pose only on some frames for a creepy stop-motion look
    if (this.demon && f.st !== 'demonize') {
      this.stut = (this.stut || 0) + dt;
      if (this.stut < 1 / 20 && this.heldPose) pose = this.heldPose; else { this.stut = 0; this.heldPose = pose; }
    }
    rig.applyPose(pose);
    // impacts on the squash spring
    if (ctx.landed) rig.kickSquash(f.char === 'brutus' ? 2.2 : 1.6);
    if (ctx.jumped) rig.kickSquash(-1.6);
    rig.shake = f.hitstop > 0 && (f.st === 'hitstun' || f.st === 'airhit' || f.st === 'blockstun' || f.st === 'dizzy' || f.st === 'ko') ? 1 : 0;
    // flash / crack / glow
    this.flash = Math.max(0, this.flash - dt * 7);
    const crack = 1 - f.shell / Math.max(1, f.shellMax);
    let glow = 0, glowColor = 0xffd890;
    if (f.st === 'molt') { glow = 0.25 + (f.sf / 180) * 0.9; glowColor = 0xfff0b0; }
    else if (f.st === 'charging') { glow = Math.min(1, (f.charge || 0) / 50) * 0.7; glowColor = 0xff9a4a; }
    else if (f.meter >= 100) { glow = 0.12 + Math.sin(this.time * 6) * 0.08; glowColor = 0x8ff0e0; }
    else if (f.soft > 0) { glow = 0.15; glowColor = 0xffd8b0; }
    if (f.drunk >= 250) { glow = Math.max(glow, 0.08); glowColor = 0xff9ab0; }
    for (const mat of rig.materials) {
      const u = mat.userData.u;
      u.uFlash.value = this.flash; u.uFlashColor.value.copy(this.flashColor);
      u.uCrack.value = crack > 0.15 ? crack : 0;
      u.uGlow.value = glow; u.uGlowColor.value.set(glowColor);
    }
    // invisibility for vanish / flop / dodges
    const flopHidden = f.st === 'attack' && m && m.flop && f.mf >= 22 && f.mf < 72;
    const vanish = f.st === 'attack' && m && m.vanish && f.mf < m.t[0] + 2;
    const hide = flopHidden || vanish;
    if (hide !== this.hidden) { this.hidden = hide; rig.setVisible(!hide); if (this.puru) this.puru.setVisible(!hide || this.puruOut); }
    const look = ctx.look;
    rig.update(dt, { look, wander: f.st === 'idle' ? 0.35 : 0.12 });
    // Brutus snack snail
    if (this.snail) this.snail.visible = f.st === 'attack' && f.mv === 'specialB' && f.mf > 6 && f.mf < 55;
    // Puru
    if (this.puru) this.updatePuru(dt, f, ctx);
    // trail cosmetic
    if (this.trail && this.particles) {
      const speed = Math.abs(f.vx) + Math.abs(f.vy);
      this.trailAcc += dt * (speed > 0.04 ? 30 : 3);
      while (this.trailAcc > 1) {
        this.trailAcc -= 1;
        const c = this.trail.colors[Math.floor(Math.random() * this.trail.colors.length)];
        this.particles.spawn({ x: x + (Math.random() - 0.5) * 0.5, y: y + 0.3 + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.4, vx: -f.vx * 10 + (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.4, grav: this.trail.spr === 'bubbleS' ? 0.6 : -0.2, life: 0.9, size: 0.09, size1: 0.03, spr: this.trail.spr, color: c, glow: !!this.trail.glow, alpha: 1, alpha1: 0, rv: (Math.random() - 0.5) * 4, anim: this.trail.spr === 'sparkle' ? 'life' : null, wob: [0.3, 5] });
      }
    }
    // husks fade
    for (let i = this.husks.length - 1; i >= 0; i--) {
      const h = this.husks[i]; h.t += dt;
      if (h.t > 7) { h.obj.position.y -= dt * 0.3; h.mat.opacity = Math.max(0, 0.9 - (h.t - 7) * 0.6); }
      if (h.t > 8.6) { this.scene.remove(h.obj); this.husks.splice(i, 1); }
    }
  }

  updatePuru(dt, f, ctx) {
    const p = this.puru;
    let target;
    const proj = ctx.puruProj;
    this.puruOut = !!proj;
    if (proj) {
      target = _v.set(proj.x, proj.y, 0.1);
      this.puruPos.lerp(target, Math.min(1, dt * 30));
    } else {
      const rig = this.active;
      const t = this.time;
      if (f.st === 'attack' && ['jellySmack', 'puruBonk', 'tornado', 'jellySpring', 'stingDive'].includes(moveFor(f.char, false, f.mv)?.anim)) {
        // Puru held in hand as a weapon
        rig.nodes.handB.updateWorldMatrix(true, false);
        target = _v.setFromMatrixPosition(rig.nodes.handB.matrixWorld);
        if (moveFor(f.char, false, f.mv)?.anim === 'jellySpring') target.set(this.pos.x + f.face * 0.1, this.pos.y + 0.15, 0.2);
        if (moveFor(f.char, false, f.mv)?.anim === 'stingDive') target.set(this.pos.x, this.pos.y - 0.1, 0.2);
        this.puruPos.lerp(target, Math.min(1, dt * 40));
      } else if (f.floating) {
        target = _v.set(this.pos.x, this.pos.y + 2.1, 0.1);
        this.puruPos.lerp(target, Math.min(1, dt * 20));
      } else {
        target = _v.set(this.pos.x - f.face * 0.55 + Math.sin(t * 1.3) * 0.1, this.pos.y + 1.75 + Math.sin(t * 2.2) * 0.1, 0.35);
        this.puruPos.lerp(target, Math.min(1, dt * 6));
      }
    }
    if (!this.puruInit) { this.puruPos.copy(target); this.puruInit = true; }
    p.root.position.copy(this.puruPos);
    p.root.rotation.y = f.face > 0 ? 0 : Math.PI;
    const spinning = f.st === 'attack' && moveFor(f.char, false, f.mv)?.anim === 'tornado';
    p.update(dt, { fast: !!proj || spinning, scale: f.st === 'attack' && moveFor(f.char, false, f.mv)?.anim === 'jellySpring' ? 1.5 : 1 });
    p.setVisible(!this.hidden || this.puruOut);
  }

  // leave the old shell behind
  spawnHusk(color = 0x9a8466) {
    const rig = this.active;
    rig.root.updateWorldMatrix(true, true);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.9, emissive: 0x2a1a0a });
    const group = new THREE.Group();
    rig.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const m = new THREE.Mesh(o.geometry, mat);
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      m.scale.multiplyScalar(1.04);
      m.castShadow = true;
      group.add(m);
    });
    group.position.z -= 0.25;
    this.scene.add(group);
    this.husks.push({ obj: group, mat, t: 0 });
  }

  dispose() {
    for (const r of this.rigs) { r.removeFrom(this.scene); r.dispose(); }
    if (this.puru) this.puru.removeFrom(this.scene);
    for (const h of this.husks) this.scene.remove(h.obj);
  }
}
