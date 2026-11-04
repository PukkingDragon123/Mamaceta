// 2D pixel-art particles rendered as crisp billboards in the 3D world.
// Two pools: "pixel" (opaque with ordered-dither fades, no sorting needed) and "glow" (additive HDR).
import * as THREE from 'three';
import { PixelCanvas } from '../ui/pixel.js';

const CELL = 16, COLS = 16;
export const SPR = {};
let atlasTex = null;

function buildAtlas() {
  const pc = new PixelCanvas(CELL * COLS, CELL * COLS);
  let n = 0;
  const W = '#ffffff';
  const def = (name, frames, fn) => {
    SPR[name] = { f: n, n: frames };
    for (let i = 0; i < frames; i++) {
      const ox = (n % COLS) * CELL, oy = Math.floor(n / COLS) * CELL;
      fn(pc, ox, oy, i, frames);
      n++;
    }
  };
  const art = (rows, map) => (pc, ox, oy) => pc.art(rows, map, ox + Math.floor((CELL - rows[0].length) / 2), oy + Math.floor((CELL - rows.length) / 2));
  def('px', 1, (pc, ox, oy) => pc.rect(ox + 4, oy + 4, 8, 8, W));
  def('dot', 1, (pc, ox, oy) => pc.disc(ox + 8, oy + 8, 5, W));
  def('bubble', 1, (pc, ox, oy) => { pc.ring(ox + 8, oy + 8, 4.6, 6.6, W); pc.rect(ox + 5, oy + 5, 2, 2, W); pc.set(ox + 7, oy + 4, W); pc.blend(ox + 8, oy + 8, W, 0.0); });
  def('bubbleS', 1, (pc, ox, oy) => { pc.ring(ox + 8, oy + 8, 2.4, 4.2, W); pc.set(ox + 6, oy + 6, W); });
  def('spark', 2, (pc, ox, oy, i) => {
    const r = i === 0 ? 7 : 4;
    for (let k = -r; k <= r; k++) { pc.set(ox + 8 + k, oy + 8, W); pc.set(ox + 8, oy + 8 + k, W); }
    pc.rect(ox + 7, oy + 7, 3, 3, W);
    if (i === 0) { pc.set(ox + 6, oy + 6, W); pc.set(ox + 10, oy + 10, W); pc.set(ox + 6, oy + 10, W); pc.set(ox + 10, oy + 6, W); }
  });
  def('star', 1, art(['....w....', '...www...', 'wwwwwwwww', '.wwwwwww.', '..wwwww..', '..ww.ww..', '.ww...ww.'], { w: W }));
  def('shard', 4, (pc, ox, oy, i) => {
    const shapes = [
      ['..ww....', '.wwww...', 'wwwwww..', '.wwwwwww', '..wwwww.', '...ww...'],
      ['www.....', 'wwwww...', '.wwwwww.', '..wwww..', '...ww...'],
      ['....w...', '...www..', '..wwwww.', '.wwwwww.', 'wwwww...'],
      ['.ww..', 'wwww.', 'wwwww', '.www.'],
    ];
    art(shapes[i], { w: W })(pc, ox, oy);
  });
  def('smoke', 4, (pc, ox, oy, i) => {
    const r = 3 + i * 1.3;
    pc.disc(ox + 8, oy + 8, r, W);
    if (i > 1) { for (let k = 0; k < 14 + i * 6; k++) { const a = k * 2.4, rr = r * (0.3 + (k % 3) * 0.25); pc.set(ox + 8 + Math.round(Math.cos(a) * rr), oy + 8 + Math.round(Math.sin(a) * rr), 0); } }
  });
  def('ring', 1, (pc, ox, oy) => pc.ring(ox + 8, oy + 8, 5.6, 7.4, W));
  def('heart', 1, art(['.ww.ww.', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...'], { w: W }));
  def('heartC', 1, art(['.rr.rr.', 'rpwrrrr', 'rwrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#ff4f9a', p: '#ffd0e6', w: '#ffb6d9' }));
  def('snail', 1, art(['...yyy.....', '..yYYYy....', '.yYyyYYy...', '.yYyYyYy.c.', '.yYYyYYy.c.', 'ccyyyyyyccc', 'cccccccccc.'], { y: '#b88a1e', Y: '#f0c33c', c: '#e0c99a' }));
  def('skull', 1, art(['.wwwww.', 'wwwwwww', 'w..w..w', 'wwwwwww', '.w.w.w.'], { w: W }));
  def('note', 1, art(['...ww', '...w.w', '...w..', '...w..', '.www..', 'wwww..', '.ww...'], { w: W }));
  def('leaf', 1, art(['....ww', '..wwww', '.wwwww', 'wwwww.', 'www...', 'w.....'], { w: W }));
  def('petal', 1, art(['.ww..', 'wwww.', 'wwwww', '.wwww', '..ww.'], { w: W }));
  def('flame', 4, (pc, ox, oy, i) => {
    const h = 10 - i * 2;
    for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round((1 - y / h) * 4 + (y < 2 ? 0 : 0.5))); for (let x = -w; x <= w; x++) pc.set(ox + 8 + x + (y > h - 3 ? (i % 2 ? 1 : -1) : 0), oy + 13 - y, W); }
  });
  def('bolt', 1, art(['...ww', '..ww.', '.www.', 'wwwww', '..ww.', '.ww..', '.w...'], { w: W }));
  def('confetti', 2, (pc, ox, oy, i) => i ? pc.rect(ox + 6, oy + 7, 5, 2, W) : pc.rect(ox + 7, oy + 5, 2, 6, W));
  def('drop', 1, art(['..w..', '..w..', '.www.', 'wwwww', 'wwwww', '.www.'], { w: W }));
  def('glass', 2, (pc, ox, oy, i) => i ? art(['w....', 'ww...', '.ww..', '.www.', '..www'], { w: W })(pc, ox, oy) : art(['.w.', 'www', 'www', '.w.', '.w.'], { w: W })(pc, ox, oy));
  def('splinter', 2, (pc, ox, oy, i) => i ? pc.rect(ox + 4, oy + 7, 8, 2, W) : art(['w....', '.ww..', '..ww.', '...ww'], { w: W })(pc, ox, oy));
  def('sweat', 1, art(['..w..', '.ww..', 'www..', 'wwww.', '.ww..'], { w: W }));
  def('zzz', 1, art(['wwwww', '...w.', '..w..', '.w...', 'wwwww'], { w: W }));
  def('streak', 1, (pc, ox, oy) => pc.rect(ox + 1, oy + 7, 14, 2, W));
  def('sparkle', 4, (pc, ox, oy, i) => {
    const r = [1, 3, 5, 2][i];
    for (let k = -r; k <= r; k++) { pc.set(ox + 8 + k, oy + 8, W); pc.set(ox + 8, oy + 8 + k, W); }
    if (i === 2) { pc.set(ox + 7, oy + 7, W); pc.set(ox + 9, oy + 9, W); pc.set(ox + 7, oy + 9, W); pc.set(ox + 9, oy + 7, W); }
  });
  def('ink', 1, (pc, ox, oy) => { pc.disc(ox + 8, oy + 8, 4, W); pc.disc(ox + 4, oy + 5, 1.5, W); pc.disc(ox + 12, oy + 11, 1.6, W); pc.disc(ox + 12, oy + 4, 1, W); });
  def('hit', 4, (pc, ox, oy, i) => {
    const r = [3, 6, 7, 7][i];
    const rays = 8;
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2 + (k % 2) * 0.2;
      const len = (k % 2 ? r * 0.6 : r);
      for (let s = (i === 3 ? len * 0.6 : 0); s <= len; s += 0.5) pc.set(ox + 8 + Math.round(Math.cos(a) * s), oy + 8 + Math.round(Math.sin(a) * s), W);
    }
    if (i < 2) pc.disc(ox + 8, oy + 8, i ? 2.5 : 3, W);
  });
  def('cross', 1, art(['w...w', '.w.w.', '..w..', '.w.w.', 'w...w'], { w: W }));
  def('exclaim', 1, art(['ww', 'ww', 'ww', 'ww', '..', 'ww'], { w: W }));
  def('pixelS', 1, (pc, ox, oy) => pc.rect(ox + 6, oy + 6, 4, 4, W));
  def('coneChip', 1, art(['ooo.', 'owwo', '.ooo'], { o: '#ff8a2a', w: '#fff7e0' }));
  def('plank', 1, (pc, ox, oy) => { pc.rect(ox + 2, oy + 6, 12, 4, '#9c6436'); pc.rect(ox + 2, oy + 6, 12, 1, '#d8a05e'); pc.rect(ox + 2, oy + 9, 12, 1, '#5a3522'); });
  def('papel', 2, (pc, ox, oy, i) => { pc.rect(ox + 4, oy + 3, 8, 10, W); for (let k = 0; k < 4; k++) pc.set(ox + 5 + k * 2, oy + 12, 0); pc.rect(ox + 6 + i, oy + 6, 2, 2, 0); });
  def('glint', 1, art(['..w..', '..w..', 'wwwww', '..w..', '..w..'], { w: W }));
  def('eyeTrail', 1, (pc, ox, oy) => pc.ellipse(ox + 8, oy + 8, 5, 2.4, W));
  def('rain', 1, (pc, ox, oy) => pc.rect(ox + 7, oy + 3, 2, 10, W));
  const canvas = pc.commit();
  atlasTex = new THREE.CanvasTexture(canvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = THREE.NoColorSpace;
  atlasTex.flipY = false;
  return atlasTex;
}

const VERT = `
  attribute vec3 iPos; attribute vec4 iColor; attribute vec4 iData; attribute vec3 iVel;
  uniform float uCols;
  varying vec2 vUv; varying vec4 vColor; varying vec2 vCell;
  void main(){
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float size = iData.x; float rot = iData.y; float frame = iData.z; float stretch = iData.w;
    vec2 c = position.xy;
    vec2 uvq = position.xy + 0.5;
    if (stretch > 0.0) {
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      float sp = length(vv.xy);
      if (sp > 1e-5) { vec2 d = vv.xy / sp; vec2 n = vec2(-d.y, d.x); c = d * c.x * (1.0 + sp * stretch) + n * c.y; }
    } else {
      float q = floor(rot / 1.5707963 + 0.5) * 1.5707963;
      float cr = cos(q), sr = sin(q);
      c = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
    }
    mv.xy += c * size;
    gl_Position = projectionMatrix * mv;
    float fx = mod(frame, uCols), fy = floor(frame / uCols);
    vUv = (vec2(fx, fy) + vec2(uvq.x, 1.0 - uvq.y)) / uCols;
    vCell = vec2(uvq.x, 1.0 - uvq.y) * 16.0;
    vColor = iColor;
  }`;
const FRAG_PIXEL = `
  uniform sampler2D uTex; varying vec2 vUv; varying vec4 vColor; varying vec2 vCell;
  float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a) + 0.03; }
  void main(){
    vec4 t = texture2D(uTex, vUv);
    if (t.a < 0.5) discard;
    float a = vColor.a;
    if (a < bayer4(vCell)) discard;
    gl_FragColor = vec4(t.rgb * vColor.rgb, 1.0);
  }`;
const FRAG_GLOW = `
  uniform sampler2D uTex; varying vec2 vUv; varying vec4 vColor;
  void main(){
    vec4 t = texture2D(uTex, vUv);
    if (t.a < 0.5) discard;
    gl_FragColor = vec4(t.rgb * vColor.rgb * vColor.a, 1.0);
  }`;

class Pool {
  constructor(cap, additive) {
    this.cap = cap; this.count = 0;
    const F = (n) => new Float32Array(cap * n);
    this.p = F(3); this.v = F(3); this.life = F(1); this.max = F(1); this.grav = F(1); this.drag = F(1);
    this.s0 = F(1); this.s1 = F(1); this.rot = F(1); this.rv = F(1);
    this.c0 = F(4); this.c1 = F(4); this.frame = F(1); this.frames = F(1); this.fps = F(1); this.stretch = F(1);
    this.wob = F(2); this.floorY = F(1); this.bounce = F(1);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aDat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iColor', this.aCol); geo.setAttribute('iData', this.aDat); geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: atlasTex }, uCols: { value: COLS } },
      vertexShader: VERT, fragmentShader: additive ? FRAG_GLOW : FRAG_PIXEL,
      transparent: additive, depthWrite: !additive, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 5;
    this.geo = geo;
  }
}

const _c = new THREE.Color();
function lin(hexOrColor, out, off, a, boost = 1) {
  _c.set(hexOrColor); _c.convertSRGBToLinear();
  out[off] = _c.r * boost; out[off + 1] = _c.g * boost; out[off + 2] = _c.b * boost; out[off + 3] = a;
}

export class Particles {
  constructor(scene, opts = {}) {
    if (!atlasTex) buildAtlas();
    this.pixel = new Pool(opts.pixelCap || 4000, false);
    this.glow = new Pool(opts.glowCap || 2500, true);
    scene.add(this.pixel.mesh); scene.add(this.glow.mesh);
    this.scene = scene;
    this.timeScale = 1;
  }
  dispose() {
    this.scene.remove(this.pixel.mesh); this.scene.remove(this.glow.mesh);
    this.pixel.geo.dispose(); this.glow.geo.dispose();
  }
  clear() { this.pixel.count = 0; this.glow.count = 0; }

  /**
   * spawn one particle
   * o: x,y,z, vx,vy,vz, life, grav, drag, size, size1, rot, rv, color, color1, alpha, alpha1,
   *    spr (name), frame (offset), anim ('life'|'loop'|none), fps, stretch, glow (bool), boost, wob [amp,freq], floor, bounce
   */
  spawn(o) {
    const pool = o.glow ? this.glow : this.pixel;
    if (pool.count >= pool.cap) return;
    const i = pool.count++;
    pool.p[i * 3] = o.x || 0; pool.p[i * 3 + 1] = o.y || 0; pool.p[i * 3 + 2] = o.z || 0;
    pool.v[i * 3] = o.vx || 0; pool.v[i * 3 + 1] = o.vy || 0; pool.v[i * 3 + 2] = o.vz || 0;
    pool.life[i] = 0; pool.max[i] = o.life || 1; pool.grav[i] = o.grav || 0; pool.drag[i] = o.drag ?? 0.5;
    pool.s0[i] = o.size || 0.1; pool.s1[i] = o.size1 ?? pool.s0[i];
    pool.rot[i] = o.rot || 0; pool.rv[i] = o.rv || 0;
    const boost = o.glow ? (o.boost ?? 2.5) : 1;
    lin(o.color || 0xffffff, pool.c0, i * 4, o.alpha ?? 1, boost);
    lin(o.color1 || o.color || 0xffffff, pool.c1, i * 4, o.alpha1 ?? 0, boost);
    const spr = SPR[o.spr || 'px'] || SPR.px;
    pool.frame[i] = spr.f + (o.frame || 0);
    pool.frames[i] = o.anim ? spr.n : 0;
    pool.fps[i] = o.anim === 'loop' ? (o.fps || 10) : 0;
    pool.stretch[i] = o.stretch || 0;
    pool.wob[i * 2] = o.wob ? o.wob[0] : 0; pool.wob[i * 2 + 1] = o.wob ? o.wob[1] : 0;
    pool.floorY[i] = o.floor ?? -999; pool.bounce[i] = o.bounce ?? 0;
  }

  update(dt) {
    dt *= this.timeScale;
    for (const pool of [this.pixel, this.glow]) {
      let n = pool.count;
      const P = pool.p, V = pool.v;
      for (let i = 0; i < n; i++) {
        pool.life[i] += dt;
        if (pool.life[i] >= pool.max[i]) {
          // swap-remove
          n--; this._copy(pool, n, i); i--; continue;
        }
        const d = Math.max(0, 1 - pool.drag[i] * dt);
        V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d + pool.grav[i] * dt; V[i * 3 + 2] *= d;
        const wa = pool.wob[i * 2];
        P[i * 3] += V[i * 3] * dt + (wa ? Math.sin(pool.life[i] * pool.wob[i * 2 + 1] + i) * wa * dt : 0);
        P[i * 3 + 1] += V[i * 3 + 1] * dt;
        P[i * 3 + 2] += V[i * 3 + 2] * dt;
        if (P[i * 3 + 1] < pool.floorY[i]) {
          P[i * 3 + 1] = pool.floorY[i];
          V[i * 3 + 1] = -V[i * 3 + 1] * pool.bounce[i]; V[i * 3] *= 0.6; pool.rv[i] *= 0.5;
        }
        pool.rot[i] += pool.rv[i] * dt;
      }
      pool.count = n;
      // upload
      const ap = pool.aPos.array, ac = pool.aCol.array, ad = pool.aDat.array, av = pool.aVel.array;
      for (let i = 0; i < n; i++) {
        const t = pool.life[i] / pool.max[i];
        ap[i * 3] = P[i * 3]; ap[i * 3 + 1] = P[i * 3 + 1]; ap[i * 3 + 2] = P[i * 3 + 2];
        for (let k = 0; k < 4; k++) ac[i * 4 + k] = pool.c0[i * 4 + k] + (pool.c1[i * 4 + k] - pool.c0[i * 4 + k]) * t;
        ad[i * 4] = pool.s0[i] + (pool.s1[i] - pool.s0[i]) * t;
        ad[i * 4 + 1] = pool.rot[i];
        let fr = pool.frame[i];
        if (pool.frames[i] > 0) fr += pool.fps[i] > 0 ? Math.floor(pool.life[i] * pool.fps[i]) % pool.frames[i] : Math.min(pool.frames[i] - 1, Math.floor(t * pool.frames[i]));
        ad[i * 4 + 2] = fr;
        ad[i * 4 + 3] = pool.stretch[i];
        av[i * 3] = V[i * 3]; av[i * 3 + 1] = V[i * 3 + 1]; av[i * 3 + 2] = V[i * 3 + 2];
      }
      pool.geo.instanceCount = n;
      pool.aPos.needsUpdate = pool.aCol.needsUpdate = pool.aDat.needsUpdate = pool.aVel.needsUpdate = true;
      pool.aPos.updateRanges = [{ start: 0, count: n * 3 }];
    }
  }
  _copy(pool, from, to) {
    if (from === to) return;
    const c3 = (a) => { a[to * 3] = a[from * 3]; a[to * 3 + 1] = a[from * 3 + 1]; a[to * 3 + 2] = a[from * 3 + 2]; };
    const c1 = (a) => { a[to] = a[from]; };
    const c4 = (a) => { for (let k = 0; k < 4; k++) a[to * 4 + k] = a[from * 4 + k]; };
    c3(pool.p); c3(pool.v); c1(pool.life); c1(pool.max); c1(pool.grav); c1(pool.drag); c1(pool.s0); c1(pool.s1);
    c1(pool.rot); c1(pool.rv); c4(pool.c0); c4(pool.c1); c1(pool.frame); c1(pool.frames); c1(pool.fps); c1(pool.stretch);
    pool.wob[to * 2] = pool.wob[from * 2]; pool.wob[to * 2 + 1] = pool.wob[from * 2 + 1]; c1(pool.floorY); c1(pool.bounce);
  }
}
