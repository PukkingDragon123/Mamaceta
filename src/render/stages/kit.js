// Environment voxel kit: reusable builders for rusty industrial + cantina pieces.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, shadeColor, mixColor, vhash } from '../voxel.js';
import { voxelMaterial } from '../materials.js';
import { valueNoise2, valueNoise3, seeded } from '../../core/math.js';

export const VS_BIG = 1 / 8, VS_MED = 1 / 12, VS_SM = 1 / 16, VS_XS = 1 / 24;

export function mat(vs, o = {}) { return voxelMaterial({ voxelSize: vs, jitter: o.jitter ?? 0.09, edge: o.edge ?? 0.07, shared: true, roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0, sway: o.sway ?? 0, emissiveBoost: o.emissiveBoost ?? 2.4 }); }

export function mesh(grid, vs, pivot, pos = [0, 0, 0], o = {}) {
  const m = new THREE.Mesh(meshVoxels(grid, { size: vs, pivot }), o.material || mat(vs, o));
  m.position.set(...pos);
  m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true;
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale) m.scale.setScalar(o.scale);
  return m;
}

// ---- palettes
export const RUST = [0x2a1810, 0x3e2418, 0x56301e, 0x6e3e24, 0x8a5030];
export const STEEL = [0x1c2126, 0x262c33, 0x313840, 0x3d454e, 0x4e5862];
export const WOOD = [0x3b2216, 0x5a3522, 0x7a4a2c, 0x9c6436, 0xb97f46];
export const ALGAE = [0x1d3b1a, 0x2f5d24, 0x4a8a2f, 0x77b83f];

// rusty metal paint: base steel tone with rust patches + streaks (deterministic)
export function rustPaint(seed = 0, o = {}) {
  const base = o.base || STEEL, rustAmt = o.rust ?? 0.45;
  return (x, y, z) => {
    const n = valueNoise3(x * 0.045, y * 0.045, z * 0.045, seed);
    const n2 = valueNoise3(x * 0.18, y * 0.18, z * 0.18, seed + 3);
    const streak = valueNoise2(x * 0.12 + z * 0.12, y * 0.015, seed + 7);
    let c;
    if (n * 0.8 + streak * 0.3 > 1.02 - rustAmt * 0.7) c = RUST[1 + Math.min(3, Math.floor(n2 * 4))];
    else c = base[1 + Math.min(2, Math.floor(n2 * 2.4))];
    if (o.algae && y < (o.algaeH ?? 4) + n * 3 && vhash(x, y, z, seed) < 0.55) c = ALGAE[Math.floor(n2 * 3)];
    return c;
  };
}
export function woodPaint(seed = 0, o = {}) {
  const pal = o.pal || WOOD;
  const plank = o.plank ?? 6, axis = o.axis ?? 'x';
  return (x, y, z) => {
    const across = axis === 'x' ? z : x;
    const along = axis === 'x' ? x : z;
    const p = Math.floor(across / plank);
    const lp = across - p * plank;
    if (lp === 0) return pal[0];
    const g = valueNoise2(along * 0.06 + p * 13.1, lp * 0.8 + y * 0.3, seed);
    let i = 2 + (vhash(p, 0, 0, seed) < 0.3 ? -1 : vhash(p, 1, 0, seed) < 0.3 ? 1 : 0);
    if (g > 0.65) i -= 1; else if (g < 0.25) i += 1;
    if (o.wet && vhash(x, y, z, seed + 1) < 0.08) i -= 1;
    return pal[Math.max(0, Math.min(pal.length - 1, i))];
  };
}

// ---- pieces
export function barrelGrid(color = 0x9c1f1f, o = {}) {
  const r = 5.2, h = 15;
  const g = new VoxelGrid(12, h, 12);
  g.cylinder('y', 6, 6, 0, h, r, (x, y, z) => {
    const ring = y === 1 || y === 2 || y === h - 2 || y === h - 3 || y === Math.floor(h / 2);
    let c = ring ? shadeColor(color, -0.35) : color;
    const n = vhash(x, y, z, 5);
    if (n < 0.18) c = RUST[2 + Math.floor(n * 10) % 3];
    if (o.label && y > 4 && y < 9 && x > 8) c = (y === 6 ? 0x111111 : 0xf0c33c);
    return c;
  });
  g.cylinder('y', 6, 6, h - 1, h, r - 1, shadeColor(color, -0.5));
  g.set(4, h - 1, 4, 0x2a2a2a); g.set(4, h - 1, 5, 0x2a2a2a);
  return g;
}
export function crateGrid(seed = 1, o = {}) {
  const n = 16;
  const g = new VoxelGrid(n, n, n);
  const pal = o.pal || WOOD;
  g.box(0, 0, 0, n, n, n, (x, y, z) => {
    const ex = x < 2 || x > n - 3, ey = y < 2 || y > n - 3, ez = z < 2 || z > n - 3;
    if ((ex && ey) || (ex && ez) || (ey && ez)) return pal[1];
    const diag = Math.abs((x - y)) < 1.5 && (z < 1 || z > n - 2);
    if (diag) return pal[1];
    const plank = Math.floor(y / 4);
    let c = pal[2 + (vhash(plank, 0, 0, seed) < 0.4 ? 1 : 0)];
    if (y % 4 === 0) c = pal[1];
    if (vhash(x, y, z, seed) < 0.06) c = pal[3];
    if (o.stencil && z === n - 1 && x > 4 && x < 11 && y > 5 && y < 10 && ((x + y) % 3 === 0)) c = 0xf0e6cc;
    return c;
  });
  return g;
}

// horizontal pipe along x with flanges
export function pipeGrid(len, r = 2.5, color = 0x6b7682, o = {}) {
  const g = new VoxelGrid(len, Math.ceil(r * 2 + 3), Math.ceil(r * 2 + 3));
  const c = (r * 2 + 3) / 2;
  g.cylinder('x', c, c, 0, len, r, (x, y, z) => {
    const n = vhash(x, y, z, 2);
    if (n < 0.25) return RUST[2 + (n * 12 | 0) % 3];
    return y > c ? shadeColor(color, 0.1) : color;
  });
  for (let x = o.flangeEvery ?? 12; x < len; x += o.flangeEvery ?? 12) g.cylinder('x', c, c, x - 1, x + 1, r + 1, shadeColor(color, -0.2));
  return g;
}

// chain hanging along -y
export function chainGrid(len) {
  const g = new VoxelGrid(3, len, 3);
  for (let y = 0; y < len; y++) {
    const link = Math.floor(y / 3) % 2;
    const ly = y % 3;
    if (link === 0) { if (ly !== 1) g.box(0, y, 1, 3, y + 1, 2, 0x5a5048); else { g.set(0, y, 1, 0x5a5048); g.set(2, y, 1, 0x4a4038); } }
    else { if (ly !== 1) g.box(1, y, 0, 2, y + 1, 3, 0x6a5e52); else { g.set(1, y, 0, 0x6a5e52); g.set(1, y, 2, 0x5a5048); } }
  }
  return g;
}

// catwalk: grated deck + railing
export function catwalkGrid(lenVox, depthVox, o = {}) {
  const H = 14;
  const g = new VoxelGrid(lenVox, H, depthVox);
  const rp = rustPaint(o.seed || 3, { rust: 0.5 });
  // deck (grating)
  g.box(0, 0, 0, lenVox, 2, depthVox, (x, y, z) => {
    if (x === 0 || x === lenVox - 1 || z === 0 || z === depthVox - 1) return rp(x, y, z);
    if (y === 1 && (x % 3 === 0 || z % 3 === 0)) return rp(x, y, z);
    if (y === 0 && (x % 6 === 0)) return rp(x, y, z);
    return null;
  });
  // back railing
  for (let x = 0; x < lenVox; x += 8) g.box(x, 2, 0, x + 1, H, 1, rp);
  g.box(0, H - 1, 0, lenVox, H, 1, rp);
  g.box(0, H - 6, 0, lenVox, H - 5, 1, rp);
  // kick plate with hazard stripes on the front edge
  g.box(0, 0, depthVox - 1, lenVox, 3, depthVox, (x, y) => ((Math.floor((x + y) / 3) % 2) ? 0xf0c33c : 0x1a1a1a));
  return g;
}

// hazard striped bar
export function hazardGrid(len, h = 3, d = 2) {
  const g = new VoxelGrid(len, h, d);
  g.box(0, 0, 0, len, h, d, (x, y) => ((Math.floor((x + y) / 3) % 2) ? 0xe8b830 : 0x1a1a1a));
  return g;
}

// industrial cage lamp with emissive bulb (returns group with a point light)
export function cageLamp(color = 0xffb060, o = {}) {
  const g = new VoxelGrid(9, 10, 9);
  g.cylinder('y', 4.5, 4.5, 7, 10, 3.5, 0x2a2f36);
  g.cylinder('y', 4.5, 4.5, 1, 7, 2.6, { c: color, e: 255 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.box(4 + Math.cos(a) * 3.4, 0, 4 + Math.sin(a) * 3.4, 5 + Math.cos(a) * 3.4, 8, 5 + Math.sin(a) * 3.4, 0x3a3f46); }
  g.box(2, 0, 2, 7, 1, 7, 0x3a3f46);
  const grp = new THREE.Group();
  const m = mesh(g, VS_SM, [4.5, 10, 4.5], [0, 0, 0], { cast: false });
  grp.add(m);
  if (o.light !== false) {
    const l = new THREE.PointLight(color, o.intensity ?? 18, o.dist ?? 9, 1.6);
    l.position.y = -0.35;
    grp.add(l);
    grp.userData.light = l;
  }
  grp.userData.base = o.intensity ?? 18;
  return grp;
}

// papel picado banner string (colorful cut-paper flags) between two points
export function papelPicado(x0, x1, y, z, o = {}) {
  const grp = new THREE.Group();
  const cols = o.colors || [0xff4f6a, 0x4fd0ff, 0xffcf3a, 0x6aff8a, 0xc194ff, 0xff8a2a];
  const n = Math.max(2, Math.round((x1 - x0) / (o.spacing ?? 0.7)));
  const sag = o.sag ?? 0.6;
  const flagG = (color, seed) => {
    const g = new VoxelGrid(8, 10, 1);
    g.box(0, 0, 0, 8, 10, 1, (x, y) => {
      if (y < 2 && (x % 2 === 0)) return null; // fringe
      const cx = x - 3.5, cy = y - 5.5;
      if (((Math.abs(cx) < 1 && Math.abs(cy) < 2.5) || (Math.abs(cy) < 1 && Math.abs(cx) < 2.5)) && y > 2) return null; // cut-out cross
      if (vhash(x, y, seed, 2) < 0.06 && y > 2) return null;
      return color;
    });
    g.box(0, 9, 0, 8, 10, 1, shadeColor(color, -0.2));
    return g;
  };
  const m = mat(1 / 40, { jitter: 0.02, edge: 0 });
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, yy = y - Math.sin(t * Math.PI) * sag;
    const c = cols[i % cols.length];
    const fm = new THREE.Mesh(meshVoxels(flagG(c, i), { size: 1 / 40 * 2.4, pivot: [4, 10, 0.5] }), m);
    fm.position.set(x, yy, z);
    fm.material = m;
    fm.userData.swayPh = i * 0.7;
    fm.castShadow = false;
    grp.add(fm);
  }
  // string
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * sag + 0.02, z)); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe0c99a }));
  grp.add(line);
  grp.userData.flags = grp.children.filter((c) => c.isMesh);
  return grp;
}
export function swayPapel(grp, t) {
  for (const f of grp.userData.flags) f.rotation.x = Math.sin(t * 1.7 + f.userData.swayPh) * 0.25;
}

// barnacle cluster
export function barnacles(n = 6, seed = 1) {
  const g = new VoxelGrid(12, 5, 12);
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = 2 + r() * 8, z = 2 + r() * 8, rr = 1 + r() * 1.6;
    g.cylinder('y', x, z, 0, 2 + r() * 2, rr, (X, Y) => (Y > 2 ? 0xd8c8a0 : 0xbfa274), {}, rr * 0.6);
    g.set(Math.floor(x), Math.floor(2 + r() * 2), Math.floor(z), 0x3a2a20);
  }
  return g;
}

// coral/rock chunks for decoration
export function rockGrid(w, h, d, seed = 1, colors = [0x3a4048, 0x4a5058, 0x5a626a]) {
  const g = new VoxelGrid(w, h, d);
  g.ellipsoid(w / 2, 0, d / 2, w / 2, h, d / 2, (x, y, z) => {
    const n = valueNoise3(x * 0.3, y * 0.3, z * 0.3, seed);
    if (n < 0.28) return null;
    if (y > h * 0.6 && vhash(x, y, z, seed) < 0.4) return ALGAE[1 + (vhash(x, y, z, 3) < 0.5 ? 1 : 0)];
    return colors[Math.floor(n * 3) % 3];
  });
  return g;
}

export function addToScene(scene, ...objs) { for (const o of objs) scene.add(o); }
