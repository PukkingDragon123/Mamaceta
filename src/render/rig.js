// Voxel character rig: hierarchy of voxel parts, 2-bone IK limbs, soft chains (antennae,
// ribbons, headband tails), independent eyes with saccades + blinking, squash & stretch.
import * as THREE from 'three';
import { meshVoxels } from './voxel.js';
import { voxelMaterial } from './materials.js';
import { Spring, clamp, lerp } from '../core/math.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export const DEFAULT_POSE = {
  hipX: 0, hipDrop: 0.1, hipRot: 0.08, hipYaw: 0, hipRoll: 0,
  sp1: 0.05, sp2: 0.1, sp2Yaw: 0, head: -0.05, headYaw: 0, headRoll: 0,
  fF: [0.32, 0], fB: [-0.3, 0], footRotF: 0, footRotB: 0, liftF: 0, liftB: 0,
  hF: [0.55, 0.55], hB: [0.42, 0.42], wrF: 0, wrB: 0, armZF: 0, armZB: 0, armYawF: 0, armYawB: 0,
  tail: 0, tail2: 0, fan: 0, fanSpread: 1,
  sqX: 1, sqY: 1, eyesOpen: 1, eyeL: null, eyeR: null, mouth: 0, antLift: 0, rootRot: 0, rootX: 0, rootY: 0,
  clubScale: 1, extra: 0, extra2: 0, tilt: 0,
};

export function blendPose(a, b, t) {
  const out = {};
  for (const k in a) {
    const va = a[k], vb = b[k] ?? va;
    if (Array.isArray(va)) out[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)];
    else if (typeof va === 'number') out[k] = lerp(va, typeof vb === 'number' ? vb : va, t);
    else out[k] = t < 0.5 ? va : vb;
  }
  return out;
}

// Make a mesh from a part definition {grid, pivot}
function partMesh(def, mat, vs) {
  const geo = meshVoxels(def.grid, { size: vs, pivot: def.pivot });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Soft chain in world space (verlet with rest-shape stiffness)
export class SoftChain {
  constructor(o) {
    // o: anchor (Object3D), rest: array of local points (in anchor space) [first = attach], segments: array of meshes (built along +y with length), parent: world group
    this.anchor = o.anchor; this.rest = o.rest.map((p) => new THREE.Vector3(...p));
    this.n = this.rest.length;
    this.p = this.rest.map(() => new THREE.Vector3());
    this.pp = this.rest.map(() => new THREE.Vector3());
    this.stiff = o.stiff ?? 0.25; this.damp = o.damp ?? 0.86; this.grav = o.grav ?? -1.5;
    this.segs = o.segments; this.lens = o.lens;
    this.parent = o.parent;
    this.inited = false;
    this.restBias = o.restBias || null; // extra local offset function
    this.extraRest = new THREE.Vector3();
    for (const s of this.segs) this.parent.add(s);
  }
  reset() { this.inited = false; }
  update(dt) {
    const a = this.anchor;
    a.updateWorldMatrix(true, false);
    const mw = a.matrixWorld;
    if (!this.inited) {
      for (let i = 0; i < this.n; i++) { this.p[i].copy(this.rest[i]).applyMatrix4(mw); this.pp[i].copy(this.p[i]); }
      this.inited = true;
    }
    const h = Math.min(dt, 1 / 30);
    this.p[0].copy(this.rest[0]).applyMatrix4(mw);
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], pp = this.pp[i];
      _v1.subVectors(p, pp).multiplyScalar(this.damp);
      pp.copy(p);
      p.add(_v1);
      p.y += this.grav * h * h;
      _v2.copy(this.rest[i]).applyMatrix4(mw);
      const k = this.stiff * (1 - (i / this.n) * 0.5);
      p.lerp(_v2, clamp(k * h * 60, 0, 1));
    }
    // distance constraints
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < this.n; i++) {
        _v1.subVectors(this.p[i], this.p[i - 1]);
        const d = _v1.length() || 1e-5;
        const target = this.lens[i - 1] * Math.abs(mw.elements[0] ** 2 + mw.elements[1] ** 2 + mw.elements[2] ** 2) ** 0.5;
        this.p[i].copy(this.p[i - 1]).addScaledVector(_v1, target / d);
      }
    }
    // place segments
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      _v1.subVectors(this.p[i + 1], this.p[i]);
      const len = _v1.length();
      if (len < 1e-5) continue;
      _v1.divideScalar(len);
      s.position.copy(this.p[i]);
      s.quaternion.setFromUnitVectors(UP, _v1);
      const sc = Math.sqrt(mw.elements[0] ** 2 + mw.elements[1] ** 2 + mw.elements[2] ** 2);
      s.scale.setScalar(sc);
    }
  }
  setVisible(v) { for (const s of this.segs) s.visible = v; }
  dispose() { for (const s of this.segs) this.parent.remove(s); }
}

/**
 * Generic rig built from a character spec (see rigs/characters.js).
 * spec = {
 *   vs, parts: {pelvis, spine1, spine2, head, eye, stalk, thigh, shin, foot, merus, propodus, hand, tail1, fan, ...} each {grid,pivot},
 *   dims: { hipH, legSpread, thighL, shinL, footH, shoulder:[x,y,z] (in spine2 space), armL1, armL2, spine1Top, spine2Top, headMount:[x,y],
 *           eyeMount:[x,y,z], antMount:[x,y,z], tailMount:[x,y], kneeDir (1), elbowDir(-1) },
 *   chains: [{ attach: 'head', rest: [[x,y,z]...], seg: {grid,pivot} | function(i), mirrorZ: true }],
 *   accessories: [{ attach: nodeName, def: {grid,pivot}, pos:[x,y,z], rot:[x,y,z], name }]
 * }
 */
export class Rig {
  constructor(spec, opts = {}) {
    this.spec = spec;
    const vs = spec.vs;
    this.vs = vs;
    this.mat = voxelMaterial({ voxelSize: vs, jitter: 0.06, edge: 0.05, rim: opts.rim ?? 0.2, rimColor: opts.rimColor ?? 0x9fe8ff, roughness: 0.6, emissiveBoost: 2.4 });
    this.materials = [this.mat];
    this.root = new THREE.Group(); this.root.name = 'rigRoot';
    this.world = new THREE.Group(); this.world.name = 'rigWorld'; // soft chains live here (world space)
    this.flip = new THREE.Group(); this.root.add(this.flip);
    this.yaw = new THREE.Group(); this.flip.add(this.yaw);
    this.yaw.rotation.y = spec.yaw ?? -0.42;
    this.squash = new THREE.Group(); this.yaw.add(this.squash);
    this.nodes = {};
    const D = spec.dims;
    this.D = D;
    const P = spec.parts;
    const node = (name, parent, pos = [0, 0, 0], part = null, mat = this.mat) => {
      const g = new THREE.Group(); g.name = name; g.position.set(...pos);
      parent.add(g);
      if (part) { const m = partMesh(part, part.mat || mat, vs); m.name = name + '_mesh'; g.add(m); g.userData.mesh = m; }
      this.nodes[name] = g;
      return g;
    };
    // body chain
    const hips = node('hips', this.squash, [0, D.hipH, 0]);
    node('pelvis', hips, [0, 0, 0], P.pelvis);
    const legRoot = node('legRoot', this.squash, [0, D.hipH, 0]);
    for (const side of ['F', 'B']) {
      const z = side === 'F' ? -D.legSpread : D.legSpread;
      const th = node('thigh' + side, legRoot, [D.legX ?? 0, D.legY ?? -0.02, z], P.thigh);
      const sh = node('shin' + side, th, [0, -D.thighL, 0], P.shin);
      node('foot' + side, sh, [0, -D.shinL, 0], P.foot);
    }
    const sp1 = node('spine1', hips, [D.spine1X ?? 0, D.spine1Y ?? 0.06, 0], P.spine1);
    const sp2 = node('spine2', sp1, [D.spine2X ?? 0, D.spine1Top, 0], P.spine2);
    const head = node('head', sp2, [D.headMount[0], D.headMount[1], 0], P.head);
    // eyes
    for (const side of ['L', 'R']) {
      const z = side === 'L' ? -D.eyeMount[2] : D.eyeMount[2];
      const st = node('stalk' + side, head, [D.eyeMount[0], D.eyeMount[1], z], P.stalk);
      st.rotation.z = D.stalkRot ?? -0.25;
      st.rotation.x = (side === 'L' ? 1 : -1) * (D.stalkSplay ?? 0.18);
      const eyePart = side === 'L' ? (P.eyeL || P.eye) : (P.eyeR || P.eye);
      const eye = node('eye' + side, st, [0, D.stalkL, 0], eyePart);
      eye.userData.baseScale = side === 'L' ? (D.eyeScaleL ?? 1) : (D.eyeScaleR ?? 1);
      eye.scale.setScalar(eye.userData.baseScale);
    }
    // arms
    for (const side of ['F', 'B']) {
      const z = side === 'F' ? -D.shoulder[2] : D.shoulder[2];
      const sh = node('shoulder' + side, sp2, [D.shoulder[0], D.shoulder[1], z]);
      const up = node('merus' + side, sh, [0, 0, 0], P.merus);
      const lo = node('propodus' + side, up, [0, -D.armL1, 0], P.propodus);
      const hand = node('hand' + side, lo, [0, -D.armL2, 0], side === 'F' ? (P.handF || P.hand) : (P.handB || P.hand));
      hand.userData.baseRot = D.handRot ?? 0;
    }
    // tail
    const t1 = node('tail1', hips, [D.tailMount[0], D.tailMount[1], 0], P.tail1);
    const t2 = node('tail2', t1, [D.tail1L ?? -0.2, 0, 0], P.tail2 || null);
    node('fan', t2, [D.tail2L ?? -0.14, 0, 0], P.fan);
    // extra parts (mouthparts, swimmerets, belly...)
    for (const ex of spec.extras || []) {
      const n = node(ex.name, this.nodes[ex.attach], ex.pos || [0, 0, 0], ex.def, ex.mat || this.mat);
      if (ex.rot) n.rotation.set(...ex.rot);
      if (ex.scale) n.scale.set(...ex.scale);
      n.userData.restRot = n.rotation.clone();
      n.userData.wiggle = ex.wiggle || 0;
    }
    // accessories
    this.accessories = [];
    for (const ac of spec.accessories || []) {
      const parent = this.nodes[ac.attach] || this.squash;
      const mat = ac.material ? ac.material : this.mat;
      const n = node(ac.name || 'acc' + this.accessories.length, parent, ac.pos || [0, 0, 0], ac.def, mat);
      if (ac.rot) n.rotation.set(...ac.rot);
      if (ac.scale) n.scale.set(...ac.scale);
      n.userData.restRot = n.rotation.clone();
      n.userData.spring = ac.spring ? new Spring(ac.spring[0], ac.spring[1]) : null;
      n.userData.springAxis = ac.springAxis || 'z';
      n.userData.springGain = ac.springGain ?? 1;
      this.accessories.push(n);
    }
    // soft chains
    this.chains = [];
    for (const ch of spec.chains || []) {
      const sides = ch.mirrorZ ? [-1, 1] : [1];
      for (const sgn of sides) {
        const anchor = this.nodes[ch.attach];
        const rest = ch.rest.map((p) => [p[0], p[1], p[2] * sgn]);
        const segs = [], lens = [];
        for (let i = 0; i < rest.length - 1; i++) {
          const a = rest[i], b = rest[i + 1];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          lens.push(len);
          const def = typeof ch.seg === 'function' ? ch.seg(i, rest.length - 1, len, sgn) : ch.seg;
          const g = new THREE.Group();
          if (def) {
            const m = partMesh(def, def.mat || this.mat, vs);
            if (def.lenScale) m.scale.y = len / def.lenScale;
            g.add(m);
          }
          segs.push(g);
        }
        this.chains.push(new SoftChain({ anchor, rest, segments: segs, lens, parent: this.world, stiff: ch.stiff, damp: ch.damp, grav: ch.grav }));
      }
    }
    this.facing = 1;
    // procedural state
    this.t = Math.random() * 10;
    this.blinkT = 1 + Math.random() * 3; this.blink = 0;
    this.sacc = { L: new THREE.Vector2(), R: new THREE.Vector2(), tL: 0.5, tR: 1.2 };
    this.eyeRot = { L: new THREE.Vector2(), R: new THREE.Vector2() };
    this.lookTarget = null;
    this.squashSpring = new Spring(260, 14, 0);
    this.tailSpring = new Spring(90, 9, 0);
    this.prevRootPos = new THREE.Vector3();
    this.rootVel = new THREE.Vector3();
    this.flashAmt = 0;
    this.shake = 0;
    this.pose = { ...DEFAULT_POSE };
    this.visible = true;
  }

  addTo(parent) { parent.add(this.root); parent.add(this.world); }
  removeFrom(parent) { parent.remove(this.root); parent.remove(this.world); }
  setVisible(v) { this.root.visible = v; this.world.visible = v; this.visible = v; }

  setFacing(f) { this.facing = f >= 0 ? 1 : -1; this.flip.scale.x = this.facing; }

  // squash impulse: positive = squash (flatten), negative = stretch
  kickSquash(v) { this.squashSpring.kick(v); }

  _ik2(L1, L2, tx, ty, bend) {
    let d = Math.hypot(tx, ty);
    const dmin = Math.abs(L1 - L2) + 1e-3, dmax = L1 + L2 - 1e-3;
    if (d < dmin) d = dmin; if (d > dmax) d = dmax;
    const phi = Math.atan2(ty, tx);
    const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const alpha = Math.acos(ca);
    const phi1 = phi + bend * alpha;
    const kx = Math.cos(phi1) * L1, ky = Math.sin(phi1) * L1;
    const ex = Math.cos(phi) * d, ey = Math.sin(phi) * d;
    const phi2 = Math.atan2(ey - ky, ex - kx);
    return [phi1 + Math.PI / 2, phi2 - phi1];
  }

  applyPose(p) {
    const D = this.D, N = this.nodes;
    this.pose = p;
    const legLen = D.thighL + D.shinL;
    const hipH = D.footH + legLen * (1 - p.hipDrop);
    // squash & stretch around the feet
    const s = this.squashSpring.x;
    const sy = p.sqY * (1 - s), sx = p.sqX * (1 + s * 0.6);
    this.squash.scale.set(sx, sy, sx);
    this.squash.position.set(p.rootX, p.rootY, 0);
    this.squash.rotation.z = p.rootRot;
    this.squash.rotation.x = p.tilt || 0;
    N.hips.position.set(p.hipX, hipH, 0);
    N.hips.rotation.set(p.hipRoll, p.hipYaw, p.hipRot);
    N.legRoot.position.set(p.hipX, hipH, 0);
    N.spine1.rotation.z = -p.sp1;
    N.spine2.rotation.set(0, p.sp2Yaw, -p.sp2);
    N.head.rotation.set(p.headRoll, p.headYaw, -p.head);
    // legs IK (targets relative to hip joint, normalized by leg length; y is height above ground)
    for (const side of ['F', 'B']) {
      const f = side === 'F' ? p.fF : p.fB;
      const lift = side === 'F' ? p.liftF : p.liftB;
      const th = N['thigh' + side], sh = N['shin' + side], ft = N['foot' + side];
      const tx = f[0] * legLen - (D.legX ?? 0);
      const ty = -hipH - (D.legY ?? -0.02) + D.footH + (f[1] + lift) * legLen;
      const [a1, a2] = this._ik2(D.thighL, D.shinL, tx, ty, D.kneeDir ?? 1);
      th.rotation.z = a1; sh.rotation.z = a2;
      ft.rotation.z = -(a1 + a2) + (side === 'F' ? p.footRotF : p.footRotB) - p.rootRot;
    }
    // arms IK (targets relative to shoulder in spine2 space, normalized by arm length)
    const armLen = D.armL1 + D.armL2;
    for (const side of ['F', 'B']) {
      const h = side === 'F' ? p.hF : p.hB;
      const sh = N['shoulder' + side], up = N['merus' + side], lo = N['propodus' + side], hand = N['hand' + side];
      const [a1, a2] = this._ik2(D.armL1, D.armL2, h[0] * armLen, h[1] * armLen, D.elbowDir ?? -1);
      up.rotation.z = a1; lo.rotation.z = a2;
      hand.rotation.z = (side === 'F' ? p.wrF : p.wrB) + hand.userData.baseRot - (a1 + a2) * (D.handLevel ?? 0.6);
      sh.rotation.x = side === 'F' ? p.armZF : -p.armZB;
      sh.rotation.y = side === 'F' ? p.armYawF : p.armYawB;
      hand.scale.setScalar(p.clubScale);
    }
    // tail
    N.tail1.rotation.z = (D.tailRest ?? -0.5) + p.tail + this.tailSpring.x;
    N.tail2.rotation.z = (D.tail2Rest ?? 0.15) + p.tail2 + this.tailSpring.x * 0.6;
    N.fan.rotation.z = p.fan;
    N.fan.scale.z = p.fanSpread;
  }

  // procedural layer: eyes, blinking, chains, springs
  update(dt, ctx = {}) {
    this.t += dt;
    const N = this.nodes;
    this.root.updateWorldMatrix(true, true);
    // velocity for secondary motion
    _v1.setFromMatrixPosition(N.hips.matrixWorld);
    const vel = _v2.subVectors(_v1, this.prevRootPos).divideScalar(Math.max(dt, 1e-4));
    const acc = _v3.subVectors(vel, this.rootVel);
    this.rootVel.copy(vel);
    this.prevRootPos.copy(_v1);
    if (dt > 0) {
      this.tailSpring.kick(clamp(-acc.y * 0.004 + acc.x * 0.002 * this.facing, -1, 1));
      this.tailSpring.update(dt);
      this.squashSpring.update(dt);
    }
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 1.5 + Math.random() * 3.5; if (Math.random() < 0.15) this.blinkT = 0.25; }
    let blinkAmt = 0;
    if (this.blink > 0) { this.blink -= dt; blinkAmt = Math.sin((1 - this.blink / 0.14) * Math.PI); }
    const open = clamp(this.pose.eyesOpen, 0, 1.3) * (1 - blinkAmt * 0.92);
    // saccades (independent eyes)
    for (const s of ['L', 'R']) {
      this.sacc['t' + s] -= dt;
      if (this.sacc['t' + s] <= 0) {
        this.sacc['t' + s] = 0.4 + Math.random() * 2.2;
        const wander = ctx.wander ?? 0.25;
        this.sacc[s].set((Math.random() - 0.5) * wander * 2, (Math.random() - 0.5) * wander);
        if (Math.random() < 0.12) this.sacc[s].set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8); // goofy independent look
      }
    }
    for (const s of ['L', 'R']) {
      const eye = N['eye' + s];
      if (!eye) continue;
      let yaw = 0, pitch = 0;
      const forced = s === 'L' ? this.pose.eyeL : this.pose.eyeR;
      if (forced) { yaw = forced[0]; pitch = forced[1]; }
      else if (ctx.look) {
        eye.parent.updateWorldMatrix(true, false);
        _v1.copy(ctx.look);
        eye.parent.worldToLocal(_v1);
        _v1.sub(eye.position);
        yaw = Math.atan2(-_v1.z, _v1.x);
        pitch = Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z));
        yaw = clamp(yaw, -0.9, 0.9); pitch = clamp(pitch - 0.2, -0.8, 0.8);
      }
      yaw += this.sacc[s].x; pitch += this.sacc[s].y;
      const er = this.eyeRot[s];
      const k = 1 - Math.exp(-dt * 18);
      er.x += (yaw - er.x) * k; er.y += (pitch - er.y) * k;
      eye.rotation.set(0, er.x, er.y);
      const bs = eye.userData.baseScale;
      eye.scale.set(bs, bs * Math.max(0.08, open), bs);
    }
    // extras wiggle (mouthparts, swimmerets)
    for (const name in N) {
      const n = N[name];
      if (n.userData.wiggle) { const r = n.userData.restRot; n.rotation.z = r.z + Math.sin(this.t * 9 + name.length) * n.userData.wiggle; }
    }
    // accessory springs
    for (const a of this.accessories) {
      const sp = a.userData.spring;
      if (!sp) continue;
      sp.kick(clamp((-acc.y * 0.003 - acc.x * 0.002 * this.facing) * a.userData.springGain, -1.5, 1.5));
      sp.update(dt);
      const r = a.userData.restRot;
      a.rotation[a.userData.springAxis] = r[a.userData.springAxis] + sp.x;
    }
    // flash/shake
    for (const m of this.materials) if (m.userData.u) m.userData.u.uFlash.value = this.flashAmt;
    if (this.shake > 0) {
      this.squash.position.x += (Math.random() - 0.5) * this.shake * 0.12;
      this.squash.position.y += (Math.random() - 0.5) * this.shake * 0.06;
    }
    this.root.updateWorldMatrix(true, true);
    for (const c of this.chains) c.update(dt);
  }

  resetChains() { for (const c of this.chains) c.reset(); }

  headWorld(out = new THREE.Vector3()) { this.nodes.head.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.nodes.head.matrixWorld); }
  nodeWorld(name, out = new THREE.Vector3()) { const n = this.nodes[name]; n.updateWorldMatrix(true, false); return out.setFromMatrixPosition(n.matrixWorld); }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.world.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
