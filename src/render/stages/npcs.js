// Background characters: the lonely Rust Pit referee (hermit crab in a tin can),
// Don Pulpo the octopus bartender, and Madam Molt the greedy shop owner.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, shadeColor, vhash } from '../voxel.js';
import { voxelMaterial } from '../materials.js';
import { SoftChain } from '../rig.js';

const VS = 1 / 22;
function M(grid, pivot, matOpts = {}) {
  const m = new THREE.Mesh(meshVoxels(grid, { size: VS, pivot }), voxelMaterial({ voxelSize: VS, rim: 0.12, ...matOpts }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function eyeGrid(r = 2.4, iris = 0x101418) {
  const g = new VoxelGrid(6, 7, 6);
  g.ellipsoid(3, 3.5, 3, r, r * 1.2, r, (x, y, z) => (x > 3.8 && Math.abs(y - 4) < 1.3 && Math.abs(z - 3) < 1.3 ? iris : 0xf4f0e0));
  g.set(5, 5, 2, 0xffffff, 120);
  return { g, pivot: [3, 0, 3] };
}

export function buildReferee() {
  const group = new THREE.Group();
  // tin can shell lying on its side, opening facing +z/+x
  const can = new VoxelGrid(22, 20, 26);
  can.cylinder('z', 11, 10, 0, 26, 9.5, (x, y, z) => {
    if (z > 23) return null;
    const label = z > 6 && z < 18;
    if (label) return (y > 13 ? 0xd8322a : y > 8 ? 0xf5e6c4 : 0xd8322a);
    return vhash(x, y, z, 1) < 0.2 ? 0x8a3d1a : 0xaab4be;
  });
  can.cylinder('z', 11, 10, 2, 26, 8.4, null, { mode: 'carve' });
  can.cylinder('z', 11, 10, 0, 2, 9.6, 0x9aa6b2);
  const canM = M(can, [11, 0, 13]);
  canM.rotation.y = -0.6;
  group.add(canM);
  // crab body poking out
  const body = new THREE.Group();
  body.position.set(0.35, 0.42, 0.55);
  group.add(body);
  const bg = new VoxelGrid(14, 14, 14);
  bg.ellipsoid(7, 6, 7, 6, 6, 6, (x, y, z) => (y < 6 ? (Math.floor(x / 2) % 2 ? 0x111111 : 0xf5f5f5) : 0xe8603a)); // striped shirt + orange head
  bg.set(12, 6, 6, 0xc0c8d0); bg.set(13, 6, 6, 0xc0c8d0); bg.set(13, 6, 7, 0xc0c8d0); // whistle
  const bodyM = M(bg, [7, 0, 7]);
  body.add(bodyM);
  // eye stalks
  const eyes = [];
  for (const z of [-0.11, 0.11]) {
    const st = new VoxelGrid(2, 7, 2); st.box(0, 0, 0, 2, 7, 2, 0xe8603a);
    const sm = M(st, [1, 0, 1]); sm.position.set(0.1, 0.5, z); body.add(sm);
    const e = eyeGrid(); const em = M(e.g, e.pivot); em.position.y = 7 * VS; sm.add(em);
    eyes.push(em);
  }
  // claws
  const claws = [];
  for (const [z, big] of [[-0.3, true], [0.32, false]]) {
    const cg = new VoxelGrid(10, 8, 6);
    const s = big ? 1 : 0.7;
    cg.capsule(1, 4, 3, 5, 4, 3, 1.6 * s, 2 * s, 0xe8603a);
    cg.ellipsoid(7, 5, 3, 2.6 * s, 2.2 * s, 2 * s, 0xf07a4a);
    cg.box(6, 1, 2, 10, 3, 4, 0xd8502a);
    const arm = new THREE.Group(); arm.position.set(0.15, 0.25, z); body.add(arm);
    const cm = M(cg, [1, 4, 3]); arm.add(cm);
    claws.push(arm);
  }
  // legs
  for (let i = 0; i < 3; i++) for (const z of [-0.2, 0.2]) {
    const lg = new VoxelGrid(2, 8, 2); lg.box(0, 0, 0, 2, 8, 2, 0xd8502a);
    const lm = M(lg, [1, 8, 1]); lm.position.set(-0.05 + i * 0.12, 0.05, z); lm.rotation.z = 0.4; lm.rotation.x = z > 0 ? -0.5 : 0.5; body.add(lm);
  }
  // flag card for KOs
  const card = new VoxelGrid(6, 9, 1); card.box(0, 0, 0, 6, 9, 1, 0xf0c33c);
  const cardM = M(card, [3, 0, 0.5]); cardM.visible = false; claws[1].add(cardM); cardM.position.set(0.25, 0.1, 0);
  const st = { t: 0, mood: 'idle', moodT: 0, flinch: 0, cheer: 0, whistle: 0, sleepy: 0 };
  return {
    group,
    react(e) {
      if (e.t === 'hit' && e.heavy) { st.flinch = 0.6; st.sleepy = 0; }
      if (e.t === 'fight' || e.t === 'round') { st.whistle = 1.0; st.sleepy = 0; }
      if (e.t === 'ko') { st.cheer = 2.5; cardM.visible = true; st.sleepy = 0; }
      if (e.t === 'roundWin') { st.cheer = 2; }
    },
    update(dt, s) {
      st.t += dt; st.sleepy += dt;
      st.flinch = Math.max(0, st.flinch - dt); st.cheer = Math.max(0, st.cheer - dt); st.whistle = Math.max(0, st.whistle - dt);
      if (st.cheer <= 0) cardM.visible = false;
      const t = st.t;
      let bodyY = 0.42 + Math.sin(t * 2) * 0.01, bodyRot = 0, clawA = 0.2, clawB = 0.2;
      if (st.flinch > 0) { bodyY = 0.3; bodyRot = -0.3; clawA = 1.2; clawB = 1.2; }
      else if (st.cheer > 0) { bodyY = 0.5 + Math.abs(Math.sin(t * 9)) * 0.08; clawA = 2.2 + Math.sin(t * 12) * 0.3; clawB = 2.4; }
      else if (st.whistle > 0) { clawB = 1.6; bodyRot = 0.1; }
      else if (st.sleepy > 12) { bodyY = 0.32; bodyRot = 0.4; clawA = -0.2; clawB = -0.2; }
      body.position.y += (bodyY - body.position.y) * Math.min(1, dt * 10);
      body.rotation.z += (bodyRot - body.rotation.z) * Math.min(1, dt * 8);
      claws[0].rotation.z += (clawA - claws[0].rotation.z) * Math.min(1, dt * 10);
      claws[1].rotation.z += (clawB - claws[1].rotation.z) * Math.min(1, dt * 10);
      for (const e of eyes) { e.rotation.y = Math.sin(t * 0.7 + e.id) * 0.5; e.scale.y = st.sleepy > 12 ? 0.25 : (Math.sin(t * 1.3) > 0.985 ? 0.15 : 1); }
    },
  };
}

export function buildBartender() {
  const group = new THREE.Group();
  const head = new VoxelGrid(20, 20, 18);
  head.ellipsoid(10, 9, 9, 8.5, 9, 8, (x, y, z) => (vhash(x, y, z, 4) < 0.08 ? 0x7a2a5a : 0xa83a6a));
  // eyes
  for (const z of [5, 12]) { head.box(17, 9, z - 1, 19, 13, z + 2, 0xf8f0e0); head.box(18, 10, z, 19.5, 12, z + 1, 0x101418); }
  // mustache
  head.box(17, 6, 4, 19.5, 8, 14, 0x1a1012);
  head.box(16, 5, 2, 18.5, 7, 5, 0x1a1012); head.box(16, 5, 13, 18.5, 7, 16, 0x1a1012);
  // bowler hat
  head.cylinder('y', 10, 9, 16, 22, 6, 0x1a1a20);
  head.cylinder('y', 10, 9, 16, 17, 8.5, 0x1a1a20);
  head.box(4, 17, 2, 16, 18, 16, 0x8a1a2a, { mode: 'paint' });
  const headM = M(head, [10, 0, 9]);
  const hg = new THREE.Group(); hg.add(headM); hg.position.y = 1.0; group.add(hg);
  // tentacles (soft chains) - the octopus arms
  const world = new THREE.Group(); group.add(world);
  const chains = [];
  const tentMat = voxelMaterial({ voxelSize: VS, rim: 0.1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rest = [];
    const reach = i < 2 ? 0 : 1;
    for (let k = 0; k <= 6; k++) {
      const out = 0.2 + k * 0.13;
      rest.push([Math.cos(a) * out * (reach ? 1 : 0.6) + (i < 2 ? 0.25 + k * 0.08 : 0), 0.95 - k * (i < 2 ? 0.02 : 0.12) + (i < 2 ? k * 0.06 : 0), Math.sin(a) * out]);
    }
    const segs = [], lens = [];
    for (let k = 0; k < 6; k++) {
      const sg = new VoxelGrid(3, 3, 3); sg.box(0, 0, 0, 3, 3, 3, k % 2 ? 0xa83a6a : 0xc85a8a);
      const m = new THREE.Mesh(meshVoxels(sg, { size: VS * (1 - k * 0.1), pivot: [1.5, 0, 1.5] }), tentMat);
      const grp = new THREE.Group(); grp.add(m); m.scale.y = 3.2; segs.push(grp);
      const p0 = rest[k], p1 = rest[k + 1]; lens.push(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
    }
    chains.push(new SoftChain({ anchor: group, rest, segments: segs, lens, parent: world, stiff: 0.1, damp: 0.9, grav: -0.5 }));
  }
  // glass + rag in the front tentacle
  const glass = new VoxelGrid(5, 7, 5); glass.cylinder('y', 2.5, 2.5, 0, 7, 2.2, { c: 0xcff6ff, e: 30 }); glass.cylinder('y', 2.5, 2.5, 1, 7, 1.4, null, { mode: 'carve' });
  const glassM = M(glass, [2.5, 0, 2.5], { transparent: true, opacity: 0.6 });
  group.add(glassM);
  const st = { t: 0, surprise: 0 };
  return {
    group,
    react(e) { if (e.t === 'hit' && e.heavy) st.surprise = 0.6; if (e.t === 'jukebox') st.surprise = 0.4; },
    update(dt) {
      st.t += dt; st.surprise = Math.max(0, st.surprise - dt);
      hg.position.y = 1.0 + Math.sin(st.t * 1.6) * 0.03 + st.surprise * 0.25;
      hg.rotation.z = Math.sin(st.t * 0.8) * 0.06;
      glassM.position.set(0.55 + Math.sin(st.t * 3) * 0.06, 0.95 + Math.cos(st.t * 3) * 0.04, 0.25);
      glassM.rotation.y = st.t * 2;
      group.updateWorldMatrix(true, true);
      for (const c of chains) c.update(dt);
    },
  };
}

export function buildMadamMolt() {
  // plump old shrimp lady: pink-orange prawn body, curly antennae, pearls, cat-eye glasses, turban w/ feather, gold rings
  const group = new THREE.Group();
  const body = new VoxelGrid(30, 34, 26);
  // big round body (plump)
  body.ellipsoid(15, 13, 13, 12, 12.5, 11, (x, y, z) => {
    if ((y % 4) === 0 && x < 15) return 0xd8604a;
    if (x > 21 && y < 16) return 0xffc8a8; // belly
    return vhash(x, y, z, 2) < 0.08 ? 0xe86a4a : 0xf07a5a;
  });
  // fur shawl (sea sponge) around shoulders
  body.ellipsoid(15, 21, 13, 12.5, 4, 11.5, (x, y, z) => (vhash(x, y, z, 7) < 0.4 ? 0xf5e6c4 : 0xe8d0a0), { mode: 'under' });
  body.ellipsoid(15, 21, 13, 12.8, 3.5, 11.8, (x, y, z) => (y > 19 ? (vhash(x, y, z, 5) < 0.5 ? 0xf5e6c4 : 0xe0c99a) : undefined), {});
  // pearl necklace
  for (let i = 0; i < 14; i++) { const a = -Math.PI * 0.45 + (i / 13) * Math.PI * 0.9; body.set(Math.round(15 + Math.cos(a) * 11.5), 18 - Math.round(Math.abs(Math.sin(i * 0.45)) * 2), Math.round(13 + Math.sin(a) * 10.5), 0xfff8f0, 80); }
  const bodyM = M(body, [15, 0, 13]);
  group.add(bodyM);
  // head
  const headG = new THREE.Group(); headG.position.set(0.22, 1.08, 0); group.add(headG);
  const head = new VoxelGrid(22, 22, 20);
  head.ellipsoid(11, 9, 10, 9, 8.5, 8.5, (x, y, z) => (x > 17 && y < 7 ? 0xffc0a0 : 0xf07a5a));
  // lipstick mouth
  head.box(19, 4, 7, 20.5, 6, 13, 0xd81a4a);
  head.box(19.5, 5, 9, 20.5, 6, 11, 0xff4a7a);
  // rosy cheeks
  head.box(18, 7, 4, 19.5, 8, 6, 0xff8aa0); head.box(18, 7, 14, 19.5, 8, 16, 0xff8aa0);
  // turban with jewel + feather
  head.ellipsoid(10, 16, 10, 8.5, 5, 8.5, (x, y, z) => ((x + y) % 4 < 2 ? 0x6a2ab0 : 0x8a4ad0));
  head.box(17, 15, 9, 19, 18, 11, { c: 0x2fe8a0, e: 200 });
  head.box(16, 18, 9.5, 17, 22, 10.5, 0xff4fa0);
  head.box(15, 20, 9.5, 16, 22, 10.5, 0xff8ac0);
  const headM = M(head, [11, 0, 10]);
  headG.add(headM);
  // cat-eye glasses on stalk eyes
  const eyes = [];
  for (const z of [-0.16, 0.16]) {
    const st = new VoxelGrid(2, 6, 2); st.box(0, 0, 0, 2, 6, 2, 0xf07a5a);
    const sm = M(st, [1, 0, 1]); sm.position.set(0.3, 0.55, z); sm.rotation.z = -0.4; headG.add(sm);
    const e = new VoxelGrid(9, 8, 9);
    e.ellipsoid(4.5, 4, 4.5, 3, 3.4, 3, (x, y, z) => (x > 6 && Math.abs(y - 4.5) < 1.5 && Math.abs(z - 4.5) < 1.4 ? 0x2a1030 : 0xfff4e8));
    // glasses frame
    e.box(7.5, 1, 1, 8.5, 8, 8, (x, y, z) => ((y === 1 || y === 7 || z === 1 || z === 7) ? 0xd81a8a : null));
    e.box(7.5, 7, 0, 8.5, 8, 2, 0xd81a8a);
    const em = M(e, [4.5, 0, 4.5]); em.position.y = 6 * VS; sm.add(em);
    eyes.push(em);
  }
  // curly antennae (static curls)
  for (const z of [-0.1, 0.1]) {
    const a = new VoxelGrid(16, 24, 3);
    let px = 2, py = 0;
    for (let i = 0; i < 40; i++) { const ang = i * 0.35; px = 8 + Math.cos(ang) * (2 + i * 0.12); py = 2 + i * 0.5; a.set(Math.round(px), Math.round(py), 1, i % 3 ? 0xff9a7a : 0xd8604a); }
    const am = M(a, [8, 0, 1.5]); am.position.set(0.35, 0.45, z); am.rotation.z = -0.5; headG.add(am);
  }
  // arms with gold rings (4 small walking legs as arms)
  const arms = [];
  for (const z of [-0.45, 0.45]) {
    const ag = new VoxelGrid(5, 16, 5);
    ag.capsule(2.5, 15, 2.5, 2.5, 2, 2.5, 1.8, 1.4, (x, y) => (y === 6 || y === 9 ? { c: 0xf0c33c, e: 60 } : 0xf07a5a));
    ag.ellipsoid(2.5, 1.5, 2.5, 2, 2, 2, 0xf07a5a);
    const arm = new THREE.Group(); arm.position.set(0.25, 0.85, z); group.add(arm);
    arm.add(M(ag, [2.5, 15, 2.5]));
    arms.push(arm);
  }
  // tail fan behind
  const fan = new VoxelGrid(10, 4, 18); fan.ellipsoid(5, 2, 9, 5, 1.6, 8.5, (x, y, z) => (Math.abs(z - 9) > 6 ? 0xd8604a : 0xff9a7a));
  const fanM = M(fan, [10, 2, 9]); fanM.position.set(-0.55, 0.25, 0); fanM.rotation.z = -0.6; group.add(fanM);
  // little feet
  for (const z of [-0.2, 0.2]) { const fg = new VoxelGrid(6, 3, 4); fg.box(0, 0, 0, 6, 3, 4, 0xd8604a); const fm = M(fg, [3, 0, 2]); fm.position.set(0.1, 0, z); group.add(fm); }
  const st = { t: 0, talk: 0, mood: 'idle', moodT: 0, snailEyes: 0, count: 0 };
  return {
    group, headG, arms, eyes,
    setTalking(on) { st.talk = on ? 1 : 0; },
    mood(m, dur = 1.5) { st.mood = m; st.moodT = dur; },
    update(dt) {
      st.t += dt; st.moodT -= dt; if (st.moodT <= 0) st.mood = 'idle';
      const t = st.t;
      group.scale.set(1 + Math.sin(t * 2) * 0.015, 1 - Math.sin(t * 2) * 0.015, 1 + Math.sin(t * 2) * 0.015);
      headG.rotation.z = Math.sin(t * 1.1) * 0.06 + (st.talk ? Math.sin(t * 14) * 0.04 : 0);
      headG.position.y = 1.08 + (st.talk ? Math.abs(Math.sin(t * 12)) * 0.02 : 0);
      let a0 = Math.sin(t * 1.5) * 0.15, a1 = -Math.sin(t * 1.5) * 0.15;
      if (st.mood === 'greedy') { a0 = 2.2 + Math.sin(t * 16) * 0.2; a1 = 2.2 - Math.sin(t * 16) * 0.2; }
      if (st.mood === 'wave') { a1 = 2.6 + Math.sin(t * 10) * 0.4; }
      if (st.mood === 'count') { a0 = 1.2 + Math.sin(t * 20) * 0.3; a1 = 1.0; }
      if (st.mood === 'angry') { a0 = 0.6; a1 = 0.6; headG.rotation.z += Math.sin(t * 30) * 0.05; }
      if (st.mood === 'open') { a1 = 1.8; a0 = 0.4; }
      arms[0].rotation.z += (a0 - arms[0].rotation.z) * Math.min(1, dt * 8);
      arms[1].rotation.z += (a1 - arms[1].rotation.z) * Math.min(1, dt * 8);
      for (const e of eyes) { e.scale.y = Math.sin(t * 0.9 + e.id) > 0.99 ? 0.15 : 1; e.rotation.y = Math.sin(t * 0.6 + e.id * 2) * 0.3; }
    },
  };
}
