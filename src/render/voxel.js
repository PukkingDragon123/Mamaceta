// Voxel modelling toolkit + greedy mesher with baked ambient occlusion and per-voxel emissive.
import * as THREE from 'three';

// ---------- colour helpers
const _lin = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; _lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

export function hex(c) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') return parseInt(c.replace('#', ''), 16);
  return 0xff00ff;
}
export function shadeColor(c, f) {
  c = hex(c);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
export function mixColor(a, b, t) {
  a = hex(a); b = hex(b);
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
export function hsl(h, s, l) {
  const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l, THREE.SRGBColorSpace);
  return c.getHex(THREE.SRGBColorSpace);
}

// small deterministic hash for procedural paints
export function vhash(x, y, z, s = 0) {
  let n = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (s * 2654435761);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

// ---------- grid
export class VoxelGrid {
  constructor(sx, sy, sz) {
    this.sx = sx | 0; this.sy = sy | 0; this.sz = sz | 0;
    this.n = this.sx * this.sy * this.sz;
    this.col = new Int32Array(this.n).fill(-1); // -1 empty, else 0xRRGGBB
    this.emi = new Uint8Array(this.n);
  }
  idx(x, y, z) { return (z * this.sy + y) * this.sx + x; }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  set(x, y, z, c, e = 0) {
    x |= 0; y |= 0; z |= 0;
    if (!this.inb(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (c === null || c === undefined || c < 0) { this.col[i] = -1; this.emi[i] = 0; return; }
    this.col[i] = hex(c); this.emi[i] = e;
  }
  get(x, y, z) { if (!this.inb(x, y, z)) return -1; return this.col[this.idx(x, y, z)]; }
  filled(x, y, z) { return this.inb(x, y, z) && this.col[this.idx(x, y, z)] >= 0; }

  _paint(paint, x, y, z) {
    if (typeof paint === 'function') return paint(x, y, z);
    return paint;
  }
  _put(x, y, z, paint, emissive, mode) {
    if (!this.inb(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (mode === 'carve') { this.col[i] = -1; this.emi[i] = 0; return; }
    if (mode === 'paint' && this.col[i] < 0) return;
    if (mode === 'under' && this.col[i] >= 0) return;
    const c = this._paint(paint, x, y, z);
    if (c === null || c === undefined) return;
    if (typeof c === 'object') { this.col[i] = hex(c.c); this.emi[i] = c.e || 0; return; }
    this.col[i] = hex(c); this.emi[i] = emissive;
  }

  // half-open box [x0,x1) etc. (floats are floored)
  box(x0, y0, z0, x1, y1, z1, paint, o = {}) {
    const e = o.emissive || 0, m = o.mode;
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this._put(x, y, z, paint, e, m);
    return this;
  }
  // ellipsoid centred at voxel-space point (centres of voxels are at i+0.5)
  ellipsoid(cx, cy, cz, rx, ry, rz, paint, o = {}) {
    const e = o.emissive || 0, m = o.mode;
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) this._put(x, y, z, paint, e, m);
        }
    return this;
  }
  sphere(cx, cy, cz, r, paint, o) { return this.ellipsoid(cx, cy, cz, r, r, r, paint, o); }
  // cylinder along an axis ('x'|'y'|'z')
  cylinder(axis, c1, c2, a0, a1, r, paint, o = {}, r2 = null) {
    const e = o.emissive || 0, m = o.mode;
    r2 = r2 ?? r;
    for (let a = Math.floor(a0); a < Math.ceil(a1); a++) {
      const t = (a - a0) / Math.max(1, a1 - a0);
      const rr = r + (r2 - r) * t;
      for (let j = Math.floor(c2 - rr); j <= Math.ceil(c2 + rr); j++)
        for (let i = Math.floor(c1 - rr); i <= Math.ceil(c1 + rr); i++) {
          const dx = i + 0.5 - c1, dy = j + 0.5 - c2;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (axis === 'y') this._put(i, a, j, paint, e, m);
          else if (axis === 'x') this._put(a, i, j, paint, e, m);
          else this._put(i, j, a, paint, e, m);
        }
    }
    return this;
  }
  // tapered capsule between two points
  capsule(ax, ay, az, bx, by, bz, ra, rb, paint, o = {}) {
    const e = o.emissive || 0, m = o.mode;
    const R = Math.max(ra, rb);
    const minx = Math.floor(Math.min(ax, bx) - R), maxx = Math.ceil(Math.max(ax, bx) + R);
    const miny = Math.floor(Math.min(ay, by) - R), maxy = Math.ceil(Math.max(ay, by) + R);
    const minz = Math.floor(Math.min(az, bz) - R), maxz = Math.ceil(Math.max(az, bz) + R);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    for (let z = minz; z <= maxz; z++) for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
      let t = (px * dx + py * dy + pz * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      const r = ra + (rb - ra) * t;
      if (qx * qx + qy * qy + qz * qz <= r * r) this._put(x, y, z, paint, e, m);
    }
    return this;
  }
  // polyline tube
  tube(points, r0, r1, paint, o) {
    for (let i = 0; i < points.length - 1; i++) {
      const t0 = i / (points.length - 1), t1 = (i + 1) / (points.length - 1);
      const a = points[i], b = points[i + 1];
      this.capsule(a[0], a[1], a[2], b[0], b[1], b[2], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, paint, o);
    }
    return this;
  }
  // repaint existing voxels by function (x,y,z,color) -> color | undefined
  repaint(fn) {
    for (let z = 0; z < this.sz; z++) for (let y = 0; y < this.sy; y++) for (let x = 0; x < this.sx; x++) {
      const i = this.idx(x, y, z); const c = this.col[i]; if (c < 0) continue;
      const r = fn(x, y, z, c, this.emi[i]);
      if (r === undefined) continue;
      if (r === null) { this.col[i] = -1; this.emi[i] = 0; continue; }
      if (typeof r === 'object') { this.col[i] = hex(r.c); this.emi[i] = r.e || 0; } else this.col[i] = hex(r);
    }
    return this;
  }
  // mirror the half z < sz/2 onto the other half
  mirrorZ(fromLow = true) {
    const h = this.sz / 2;
    for (let z = 0; z < Math.floor(h); z++) for (let y = 0; y < this.sy; y++) for (let x = 0; x < this.sx; x++) {
      const zs = fromLow ? z : this.sz - 1 - z, zd = fromLow ? this.sz - 1 - z : z;
      const i = this.idx(x, y, zs), j = this.idx(x, y, zd);
      this.col[j] = this.col[i]; this.emi[j] = this.emi[i];
    }
    return this;
  }
  // count of surface voxels (debug)
  count() { let n = 0; for (let i = 0; i < this.n; i++) if (this.col[i] >= 0) n++; return n; }
}

// ---------- mesher
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

/**
 * Build a BufferGeometry from a VoxelGrid.
 * opts.size   world size of one voxel
 * opts.pivot  [x,y,z] in voxel units -> becomes origin
 * opts.ao     bake ambient occlusion (default true)
 * opts.shade  directional face shading multipliers (fake light for unlit look), default mild
 */
export function meshVoxels(grid, opts = {}) {
  const vs = opts.size ?? 1 / 24;
  const pv = opts.pivot || [grid.sx / 2, 0, grid.sz / 2];
  const useAO = opts.ao !== false;
  const faceShade = opts.faceShade || [1, 1, 1, 1, 1, 1];
  const { sx, sy, sz } = grid;
  const dims = [sx, sy, sz];
  const col = grid.col, emi = grid.emi;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && col[(z * sy + y) * sx + x] >= 0;

  const pos = [], nor = [], clr = [], em = [], idxs = [];
  let vcount = 0;
  const q = [0, 0, 0];
  const x = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const ux = u === 0 ? 1 : 0, uy = u === 1 ? 1 : 0, uz = u === 2 ? 1 : 0;
    const vx_ = v === 0 ? 1 : 0, vy_ = v === 1 ? 1 : 0, vz_ = v === 2 ? 1 : 0;
    const mask = new Float64Array(dims[u] * dims[v]);
    const aoMask = new Int32Array(dims[u] * dims[v]);
    for (const dir of [-1, 1]) {
      q[0] = q[1] = q[2] = 0; q[d] = dir;
      const faceIdx = d * 2 + (dir > 0 ? 1 : 0);
      for (x[d] = 0; x[d] < dims[d]; x[d]++) {
        // build mask
        let n = 0;
        for (x[v] = 0; x[v] < dims[v]; x[v]++) {
          for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
            mask[n] = -1;
            const i = (x[2] * sy + x[1]) * sx + x[0];
            const c = col[i];
            if (c < 0) continue;
            const nx = x[0] + q[0], ny = x[1] + q[1], nz = x[2] + q[2];
            if (solid(nx, ny, nz)) continue;
            let aoBits = 255;
            if (useAO) {
              // neighbours in the plane in front of the face
              const s = (du, dv) => (solid(nx + du * ux + dv * vx_, ny + du * uy + dv * vy_, nz + du * uz + dv * vz_) ? 1 : 0);
              const corner = (du, dv) => {
                const s1 = s(du, 0), s2 = s(0, dv);
                if (s1 && s2) return 0;
                return 3 - (s1 + s2 + s(du, dv));
              };
              const a00 = corner(-1, -1), a10 = corner(1, -1), a11 = corner(1, 1), a01 = corner(-1, 1);
              aoBits = a00 | (a10 << 2) | (a11 << 4) | (a01 << 6);
            }
            mask[n] = c + emi[i] * 16777216 + aoBits * 4294967296;
            aoMask[n] = aoBits;
          }
        }
        // greedy merge
        n = 0;
        for (let j = 0; j < dims[v]; j++) {
          for (let i = 0; i < dims[u];) {
            const key = mask[n];
            if (key < 0) { i++; n++; continue; }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === key) w++;
            let h = 1, done = false;
            while (j + h < dims[v]) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== key) { done = true; break; }
              if (done) break;
              h++;
            }
            // emit quad
            const c = key % 16777216;
            const e = Math.floor(key / 16777216) % 256;
            const ao = aoMask[n];
            const base = [0, 0, 0];
            base[d] = x[d] + (dir > 0 ? 1 : 0);
            base[u] = i; base[v] = j;
            const du = [0, 0, 0], dv = [0, 0, 0];
            du[u] = w; dv[v] = h;
            const corners = [
              [base[0], base[1], base[2]],
              [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
              [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
              [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]],
            ];
            const aos = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
            const r = _lin[(c >> 16) & 255], g = _lin[(c >> 8) & 255], b = _lin[c & 255];
            const fs = faceShade[faceIdx];
            const em1 = e / 255;
            for (let k = 0; k < 4; k++) {
              const p = corners[k];
              pos.push((p[0] - pv[0]) * vs, (p[1] - pv[1]) * vs, (p[2] - pv[2]) * vs);
              nor.push(q[0], q[1], q[2]);
              const a = useAO ? AO_CURVE[aos[k]] : 1;
              const f = a * fs;
              clr.push(r * f, g * f, b * f);
              em.push(em1);
            }
            // winding: ensure front face points along normal
            const flip = aos[0] + aos[2] < aos[1] + aos[3];
            const v0 = vcount, v1 = vcount + 1, v2 = vcount + 2, v3 = vcount + 3;
            const ccw = dir > 0;
            if (!flip) {
              if (ccw) idxs.push(v0, v1, v2, v0, v2, v3); else idxs.push(v0, v2, v1, v0, v3, v2);
            } else {
              if (ccw) idxs.push(v1, v2, v3, v1, v3, v0); else idxs.push(v1, v3, v2, v1, v0, v3);
            }
            vcount += 4;
            // clear mask
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = -1;
            i += w; n += w;
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
  geo.setAttribute('aEmissive', new THREE.Float32BufferAttribute(em, 1));
  geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idxs, 1) : new THREE.Uint16BufferAttribute(idxs, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.voxelSize = vs;
  return geo;
}

// Merge several geometries that share attribute layout
export function mergeVoxelGeometries(geos) {
  let total = 0, itotal = 0;
  for (const g of geos) { total += g.attributes.position.count; itotal += g.index.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), clr = new Float32Array(total * 3), em = new Float32Array(total);
  const idx = total > 65535 ? new Uint32Array(itotal) : new Uint16Array(itotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    clr.set(g.attributes.color.array, vo * 3);
    em.set(g.attributes.aEmissive.array, vo);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
  geo.setAttribute('aEmissive', new THREE.BufferAttribute(em, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

// Bake a world transform into geometry (for merging static props)
export function transformGeometry(geo, matrix) {
  const g = geo.clone();
  g.applyMatrix4(matrix);
  return g;
}
