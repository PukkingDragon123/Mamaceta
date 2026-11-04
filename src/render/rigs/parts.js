// Voxel part builders for stylised anthropomorphic mantis shrimp fighters.
import { VoxelGrid, shadeColor, mixColor, vhash, hex } from '../voxel.js';

export const VS = 1 / 24;

// --- paint helpers
export const grad = (c, y, h, amt = 0.18) => shadeColor(c, ((y / Math.max(1, h)) - 0.5) * amt * 2);
export function patternColor(pat, base, x, y, z, seed = 0) {
  if (!pat) return base;
  const { type } = pat;
  if (type === 'leopard') {
    const h = vhash(Math.floor((x + seed) / 2.2), Math.floor(y / 2.2), Math.floor(z / 2.2), 11);
    if (h < (pat.density ?? 0.16)) return pat.color;
    if (h < (pat.density ?? 0.16) + 0.06) return pat.ring ?? shadeColor(pat.color, 0.4);
    return base;
  }
  if (type === 'zebra') {
    const w = pat.width ?? 3;
    const v = Math.floor((x * (pat.ax ?? 1) + y * (pat.ay ?? 0.35) + Math.sin(z * 0.6) * 0.8) / w);
    return v % 2 === 0 ? pat.color : base;
  }
  if (type === 'spots') {
    const h = vhash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), 5 + seed);
    return h < (pat.density ?? 0.12) ? pat.color : base;
  }
  if (type === 'stripes') {
    return Math.floor(y / (pat.width ?? 2)) % 2 === 0 ? pat.color : base;
  }
  if (type === 'circuit') {
    const a = (x * 7 + z * 3) % 11 === 0 || (y * 5 + z) % 13 === 0;
    return a ? { c: pat.color, e: pat.e ?? 200 } : base;
  }
  if (type === 'flame') {
    const n = vhash(x, Math.floor(y / 2), z, 9);
    return (y < (pat.h ?? 6) + n * 4) && n > 0.4 ? { c: pat.color, e: pat.e ?? 120 } : base;
  }
  if (type === 'stars') {
    const h = vhash(x, y, z, 23);
    return h < (pat.density ?? 0.04) ? { c: pat.color, e: 220 } : base;
  }
  if (type === 'checker') return (Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 2)) % 2 ? pat.color : base;
  return base;
}

// Segmented body block (tergite plates with highlighted edges on the back, lighter sternites in front)
export function segmentBlock(sx, sy, sz, o) {
  const g = new VoxelGrid(sx, sy, sz);
  const cx = o.cx ?? sx / 2, cy = o.cy ?? sy / 2, cz = sz / 2;
  const seg = o.seg ?? 4;
  const pal = o.pal;
  g.ellipsoid(cx, cy, cz, o.rx, o.ry, o.rz, (x, y, z) => {
    const front = (x + 0.5 - cx) / o.rx; // -1 back .. 1 front
    const band = ((y + (o.segOff ?? 0)) % seg);
    let c;
    if (front > (o.bellyAt ?? 0.35)) {
      c = pal.belly;
      if (band === 0) c = shadeColor(pal.belly, -0.18);
    } else {
      c = patternColor(o.pattern, pal.body, x, y, z, o.seed || 0);
      if (typeof c === 'object') return c;
      if (band === seg - 1) c = pal.edge; // plate edge highlight
      else if (band === 0) c = shadeColor(c, -0.22);
    }
    // keel ridge
    if (Math.abs(z + 0.5 - cz) < 1 && front < -0.3 && o.keel) c = shadeColor(c, 0.15);
    return grad(c, y, sy, 0.12);
  });
  return g;
}

// Stack of elliptical armour plates (tergites) - the core of the segmented crustacean look.
// plates: [{h, rx, rz, dx, color?, edge?}] from bottom to top.
export function plateStack(o) {
  const plates = o.plates;
  const pal = o.pal;
  let maxRx = 0, maxRz = 0, H = 0, minDx = 0, maxDx = 0;
  for (const p of plates) { maxRx = Math.max(maxRx, p.rx); maxRz = Math.max(maxRz, p.rz); H += p.h; minDx = Math.min(minDx, p.dx || 0); maxDx = Math.max(maxDx, p.dx || 0); }
  const eb = o.extraBack ?? 4, et = o.extraTop ?? 3;
  const sx = Math.ceil(maxRx * 2 + (maxDx - minDx) + 3 + eb), sz = Math.ceil(maxRz * 2 + 5), sy = Math.ceil(H + 2 + et);
  const g = new VoxelGrid(sx, sy, sz);
  const cx0 = maxRx + 1.5 - minDx + eb, cz = sz / 2;
  let y0 = 0.5;
  plates.forEach((p, i) => {
    const cx = cx0 + (p.dx || 0);
    const body = p.color ?? pal.body, edge = p.edge ?? pal.edge, belly = p.belly ?? pal.belly;
    for (let y = Math.floor(y0); y < Math.ceil(y0 + p.h); y++) {
      const ly = y + 0.5 - y0; // 0..h
      const t = ly / p.h;
      const prof = 1 - Math.pow((t - 0.55) * 1.5, 2) * 0.18; // rounded plate profile
      const rx = p.rx * prof, rz = p.rz * prof;
      for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
        const dx = (x + 0.5 - cx) / rx, dz = (z + 0.5 - cz) / rz;
        if (dx * dx + dz * dz > 1) continue;
        let c;
        const front = dx > (o.bellyAt ?? 0.42);
        if (front && belly !== null) {
          c = ly < 1 ? shadeColor(belly, -0.22) : belly;
        } else {
          c = body;
          if (p.band) { if (t > 0.3 && t < 0.75) c = p.band; }
          if (ly >= p.h - 1) c = edge; // highlighted top rim
          else if (ly < 1) c = shadeColor(body, -0.3); // shadow groove
          if (p.pattern) { const pc = patternColor(p.pattern, c, x, y, z, i); if (typeof pc === 'object') { g.set(x, y, z, pc.c, pc.e); continue; } c = pc; }
        }
        if (o.keel && Math.abs(z + 0.5 - cz) < 0.9 && dx < -0.5) c = shadeColor(c, 0.12);
        g.set(x, y, z, shadeColor(c, (1 - Math.abs(dz)) * 0.06 - 0.03));
      }
    }
    y0 += p.h;
  });
  return { grid: g, cx: cx0, cz, sy, H };
}

export function eyePart(o) {
  // mantis shrimp eye: two hemispheres separated by a midband, with pseudo-pupil
  const r = o.r ?? 3.4, ry = o.ry ?? r * 1.15;
  const sx = Math.ceil(r * 2 + 2), sy = Math.ceil(ry * 2 + 2), sz = sx;
  const g = new VoxelGrid(sx, sy, sz);
  const cx = sx / 2, cy = sy / 2, cz = sz / 2;
  const pal = o.pal;
  g.ellipsoid(cx, cy, cz, r, ry, r, (x, y, z) => {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) <= (o.band ?? 0.9)) return pal.eyeBand;
    const front = x + 0.5 - cx;
    const side = z + 0.5 - cz;
    // pupil on the front face
    const pupR = o.pupil ?? r * 0.5;
    const py = dy - (dy > 0 ? (o.pupY ?? 1.3) : -(o.pupY ?? 1.3));
    if (front > r * 0.45 && py * py + side * side < pupR * pupR && dy > 0) return pal.pupil;
    if (front > r * 0.45 && py * py + side * side < (pupR * 0.7) ** 2 && dy < 0) return shadeColor(pal.pupil, 0.15);
    return dy > 0 ? pal.eyeTop : pal.eyeBot;
  });
  // highlights (emissive for sparkle)
  const hx = Math.floor(cx + r * 0.8), hy = Math.floor(cy + ry * 0.55), hz = Math.floor(cz - 1);
  g.set(hx, hy, hz, 0xffffff, 30); g.set(hx, hy, hz - 1, 0xffffff, 30); g.set(hx, hy - 1, hz - 1, 0xe8f8ff, 0);
  if (o.sparkle) { g.set(hx, hy - 1, hz + 2, 0xffffff, 255); g.set(hx - 1, Math.floor(cy - ry * 0.4), hz + 1, 0xffe8f8, 200); }
  if (o.lashes) {
    for (let i = 0; i < 3; i++) g.set(Math.floor(cx + r * 0.3) - i, sy - 1, Math.floor(cz - 1 + i), pal.lash ?? 0x2a1020);
  }
  return { grid: g, pivot: [cx, 0.5, cz] };
}

export function stalkPart(len, pal, w = 2) {
  const g = new VoxelGrid(w, len, w);
  g.box(0, 0, 0, w, len, w, (x, y) => (y % 3 === 2 ? shadeColor(pal.stalk, -0.2) : pal.stalk));
  return { grid: g, pivot: [w / 2, 0, w / 2] };
}

// capsule limb hanging along -y from the pivot (top)
export function limbPart(len, r0, r1, color, o = {}) {
  const pad = 2;
  const R = Math.max(r0, r1);
  const sx = Math.ceil(R * 2 + pad * 2), sz = sx, sy = Math.ceil(len + R * 2 + pad);
  const g = new VoxelGrid(sx, sy, sz);
  const cx = sx / 2, cz = sz / 2, top = sy - R - 0.5;
  g.capsule(cx, top, cz, cx + (o.bendX ?? 0), top - len, cz, r0, r1, (x, y, z) => {
    const t = (top - y) / len;
    let c = color;
    if (o.joint && (t < 0.08 || t > 0.92)) c = o.joint;
    if (o.bands && Math.floor(t * o.bands) % 2 === 1) c = o.bandColor ?? shadeColor(color, -0.15);
    if (o.spot && t > 0.3 && t < 0.65 && x + 0.5 > cx + R * 0.35) c = o.spot;
    if (o.pattern) { const pc = patternColor(o.pattern, c, x, y, z); if (pc !== c) return pc; }
    if (o.spines && x + 0.5 > cx + R * 0.6 && Math.floor(y) % 2 === 0) c = o.spineColor ?? 0xffffff;
    if (typeof c === 'object') return c;
    return shadeColor(c, (x + 0.5 - cx) / R * 0.08 - (z + 0.5 - cz) / R * 0.06);
  });
  if (o.spines) {
    for (let i = 1; i < len; i += 2) g.set(Math.floor(cx + R + 0.5), Math.floor(top - i), Math.floor(cz), o.spineColor ?? 0xffffff);
  }
  return { grid: g, pivot: [cx, top + 0.5, cz] };
}

// Smasher club (dactyl heel), optional wraps
export function clubPart(o) {
  const r = o.r ?? 3.2;
  const sx = Math.ceil(r * 2 + 6), sy = Math.ceil(r * 2 + 6), sz = Math.ceil(r * 2 + 3);
  const g = new VoxelGrid(sx, sy, sz);
  const cx = sx / 2, cy = sy - r - 1.5, cz = sz / 2;
  const pal = o.pal;
  // forearm socket
  g.capsule(cx, sy - 0.5, cz, cx, cy, cz, r * 0.62, r * 0.75, pal.propodus);
  // club heel
  g.ellipsoid(cx + 0.6, cy - 0.6, cz, r, r * 1.05, r * 0.95, (x, y, z) => {
    const d = y + 0.5 - cy;
    let c = pal.club;
    if (o.wraps) {
      if (Math.floor(y) % 2 === 0 && d > -r * 0.4) c = o.wraps;
      else if (d > -r * 0.4) c = shadeColor(o.wraps, -0.12);
    }
    if (x + 0.5 > cx + r * 0.75 && d < 0) c = shadeColor(pal.club, 0.25); // striking surface highlight
    return c;
  });
  // dactyl hook folded under
  g.capsule(cx + r * 0.6, cy - r * 0.9, cz, cx + r * 1.4, cy - r * 0.2, cz, 1.0, 0.6, pal.dactyl ?? shadeColor(pal.club, -0.25));
  return { grid: g, pivot: [cx, sy - 0.5, cz] };
}

// Boxing glove replacing the club
export function glovePart(o) {
  const r = o.r ?? 3.6;
  const sx = Math.ceil(r * 2 + 6), sy = Math.ceil(r * 2 + 7), sz = Math.ceil(r * 2 + 4);
  const g = new VoxelGrid(sx, sy, sz);
  const cx = sx / 2, cy = sy - r - 2.5, cz = sz / 2;
  const G = o.glove;
  g.capsule(cx, sy - 0.5, cz, cx, cy + r * 0.5, cz, r * 0.7, r * 0.72, G.cuff);
  g.ellipsoid(cx + 0.8, cy - 0.5, cz, r * 1.08, r * 1.12, r * 1.02, (x, y, z) => {
    const p = patternColor(G.pattern, G.main, x, y, z);
    if (typeof p === 'object') return p;
    let c = p;
    if (x + 0.5 > cx + r * 0.6 && y + 0.5 > cy) c = shadeColor(c, 0.18);
    if (y + 0.5 < cy - r * 0.6) c = shadeColor(c, -0.15);
    return G.emissive ? { c, e: G.emissive } : c;
  });
  // thumb
  g.ellipsoid(cx + 1.5, cy + 1.5, cz + r * 0.85, 1.6, 2, 1.3, G.thumb ?? shadeColor(G.main, -0.1));
  // cuff band
  g.box(cx - r * 0.75, cy + r * 0.45, cz - r * 0.75, cx + r * 0.75, cy + r * 0.45 + 2, cz + r * 0.75, G.band ?? G.cuff);
  if (G.spikes) for (let i = -1; i <= 1; i++) { g.set(Math.floor(cx + r * 1.9), Math.floor(cy + i * 2), Math.floor(cz), G.spikes); g.set(Math.floor(cx + r * 1.9) + 1, Math.floor(cy + i * 2), Math.floor(cz), G.spikes); }
  if (G.glint) g.set(Math.floor(cx + r * 1.2), Math.floor(cy + r * 0.6), Math.floor(cz - 1), 0xffffff, 255);
  return { grid: g, pivot: [cx, sy - 0.5, cz] };
}

// Spearer dactyl: long barbed spear
export function spearPart(o) {
  const len = o.len ?? 16, r = o.r ?? 1.5;
  const sx = 9, sz = 7, sy = Math.ceil(len + 6);
  const g = new VoxelGrid(sx, sy, sz);
  const cx = 4.5, cz = 3.5, top = sy - 1;
  const pal = o.pal;
  g.capsule(cx, top, cz, cx, top - 3, cz, r * 1.4, r * 1.3, pal.propodus);
  g.capsule(cx, top - 2, cz, cx + 0.5, top - len, cz, r * 1.2, 0.5, (x, y) => (o.cuff && y > top - 5 ? o.cuff : pal.spear));
  // barbs along the front edge
  for (let i = 4; i < len - 1; i += 2) {
    const y = Math.floor(top - i);
    g.set(Math.floor(cx + r + 0.6), y, Math.floor(cz), pal.barb);
    g.set(Math.floor(cx + r + 1.4), y + 1, Math.floor(cz), pal.barb);
  }
  return { grid: g, pivot: [cx, top + 0.5, cz] };
}

export function footPart(pal, o = {}) {
  const g = new VoxelGrid(10, 5, 6);
  const len = o.len ?? 7;
  g.box(2, 0, 1.5, 2 + len - 2, 2, 4.5, pal.legDark);
  g.box(2, 1, 1, 6, 3.5, 5, pal.leg);
  // claw toes
  g.box(2 + len - 2, 0, 1, 2 + len, 1, 2.5, pal.claw ?? 0xf5e6c4);
  g.box(2 + len - 2, 0, 3.5, 2 + len, 1, 5, pal.claw ?? 0xf5e6c4);
  g.set(2 + len, 0, 1, pal.claw ?? 0xf5e6c4); g.set(2 + len, 0, 4, pal.claw ?? 0xf5e6c4);
  g.box(0, 0, 2, 2, 1.5, 4, pal.legDark);
  if (o.shoe) g.box(1, 0, 1, 2 + len, 2.5, 5, (x, y) => (y === 0 ? o.shoeSole ?? 0xffffff : o.shoe), { mode: 'paint' });
  return { grid: g, pivot: [4, 2.5, 3] };
}

export function tailFanPart(pal, o = {}) {
  const g = new VoxelGrid(14, 7, 17);
  const cz = 8.5;
  // telson central plate
  g.ellipsoid(6, 3.5, cz, 6, 1.6, 3.2, (x, y, z) => (x < 2 ? pal.fanEdge : pal.fan));
  // uropods (paddles) on both sides
  for (const s of [-1, 1]) {
    g.ellipsoid(6.5, 3, cz + s * 5.2, 5.5, 1.2, 2.6, (x, y, z) => {
      const e = Math.abs(z + 0.5 - cz);
      if (x < 2.5) return pal.fanEdge;
      return e > 6.5 ? pal.fanEdge : (vhash(x, y, z, 3) < 0.1 ? shadeColor(pal.fan, 0.3) : pal.fan2 ?? pal.fan);
    });
  }
  // spines on the telson tip
  g.set(0, 3, Math.floor(cz) - 1, pal.fanEdge); g.set(0, 3, Math.floor(cz) + 1, pal.fanEdge);
  return { grid: g, pivot: [13, 3.5, cz] };
}

export function tailSegPart(pal, len = 9, r = 3.4, o = {}) {
  const sx = Math.ceil(len + 2), sy = Math.ceil(r * 2 + 2), sz = Math.ceil(r * 2.4 + 2);
  const g = new VoxelGrid(sx, sy, sz);
  const cy = sy / 2, cz = sz / 2;
  g.capsule(sx - 1.5, cy, cz, 1.5, cy, cz, r, r * 0.8, (x, y, z) => {
    let c = patternColor(o.pattern, pal.body, x, y, z);
    if (typeof c === 'object') return c;
    if (o.band && x % 4 === 1) c = o.band;
    if (x % 4 === 3) c = pal.edge;
    else if (x % 4 === 0) c = shadeColor(c, -0.25);
    if (y + 0.5 < cy - r * 0.4) c = pal.belly;
    return grad(c, y, sy, 0.15);
  });
  return { grid: g, pivot: [sx - 1, cy, cz] };
}

// thin antenna segment (built along +y)
export function antennaSeg(color, len = 5, w = 1, tip = null) {
  const g = new VoxelGrid(w, len, w);
  g.box(0, 0, 0, w, len, w, (x, y) => (tip && y >= len - 1 ? tip : (y % 2 ? shadeColor(color, -0.15) : color)));
  return { grid: g, pivot: [w / 2, 0, w / 2], lenScale: len * VS };
}

export function paddlePart(color, edge, w = 5, l = 7) {
  const g = new VoxelGrid(l, 2, w);
  g.ellipsoid(l / 2, 1, w / 2, l / 2, 0.8, w / 2, (x, y, z) => (x < 1 || z < 0.5 || z > w - 1.5 ? edge : color));
  return { grid: g, pivot: [0.5, 1, w / 2] };
}

export function mouthPart(color, n = 3) {
  const g = new VoxelGrid(5, 6, 5);
  for (let i = 0; i < n; i++) g.capsule(1 + i, 5, 1 + i * 1.3, 2 + i, 1, 1 + i * 1.3, 0.6, 0.5, shadeColor(color, -i * 0.1));
  return { grid: g, pivot: [1, 5, 2.5] };
}

// Ribbon bow (for Mimi)
export function bowPart(color, center, size = 1) {
  const s = size;
  const g = new VoxelGrid(Math.ceil(9 * s), Math.ceil(6 * s), Math.ceil(4 * s));
  const cx = g.sx / 2, cy = g.sy / 2, cz = g.sz / 2;
  g.ellipsoid(cx - 2.4 * s, cy + 0.4, cz, 2.2 * s, 2.2 * s, 1.2 * s, (x, y) => (y % 2 ? color : shadeColor(color, 0.12)));
  g.ellipsoid(cx + 2.4 * s, cy + 0.4, cz, 2.2 * s, 2.2 * s, 1.2 * s, (x, y) => (y % 2 ? color : shadeColor(color, 0.12)));
  g.box(cx - 1, cy - 1, cz - 1, cx + 1, cy + 1.5, cz + 1, center);
  g.box(cx - 2, cy - 3 * s, cz - 0.5, cx - 1, cy - 0.5, cz + 0.5, shadeColor(color, -0.1));
  g.box(cx + 1, cy - 3 * s, cz - 0.5, cx + 2, cy - 0.5, cz + 0.5, shadeColor(color, -0.1));
  return { grid: g, pivot: [cx, cy, cz] };
}

// generic accessory from a grid builder
export function acc(sx, sy, sz, pivot, fn) {
  const g = new VoxelGrid(sx, sy, sz);
  fn(g);
  return { grid: g, pivot };
}

export { shadeColor, mixColor, vhash, hex, VoxelGrid };
