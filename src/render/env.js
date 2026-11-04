// Shared underwater environment pieces: lighting with animated caustics, god rays,
// marine snow, background gradient, swimming fish schools, swaying algae.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, shadeColor, mixColor, vhash } from './voxel.js';
import { voxelMaterial, GlobalU } from './materials.js';
import { seeded } from '../core/math.js';

export function setupLighting(scene, renderer, o = {}) {
  const opt = {
    sunColor: 0xd8f8ff, sunIntensity: 4.2, sunPos: [6, 30, 10], target: [0, 0, -1], angle: 0.5,
    hemiSky: 0x6cc4d8, hemiGround: 0x16303a, hemiIntensity: 0.55, shadowSize: 2048, shadowArea: 22, causticScale: 3,
    ...o,
  };
  const L = {};
  const sun = new THREE.SpotLight(opt.sunColor, opt.sunIntensity, 0, opt.angle, 0.55, 0);
  sun.position.set(...opt.sunPos);
  sun.target.position.set(...opt.target);
  sun.castShadow = renderer.quality !== 'low';
  sun.shadow.mapSize.set(opt.shadowSize, opt.shadowSize);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 80;
  sun.map = renderer.causticTexture;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(opt.hemiSky, opt.hemiGround, opt.hemiIntensity);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x5fb0d0, 0.5);
  fill.position.set(-8, 6, 14);
  scene.add(fill);
  L.sun = sun; L.hemi = hemi; L.fill = fill;
  L.base = { sun: opt.sunIntensity, hemi: opt.hemiIntensity, fill: 0.5 };
  L.setDark = (d) => {
    sun.intensity = L.base.sun * (1 - d * 0.97);
    hemi.intensity = L.base.hemi * (1 - d * 0.9);
    fill.intensity = L.base.fill * (1 - d * 0.85);
  };
  return L;
}

// Gradient backdrop dome
export function makeBackdrop(scene, o = {}) {
  const top = new THREE.Color(o.top ?? 0x2b8fa3), mid = new THREE.Color(o.mid ?? 0x0f4a5e), bot = new THREE.Color(o.bottom ?? 0x041820);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: top }, uMid: { value: mid }, uBot: { value: bot }, uTime: GlobalU.uTime, uDark: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform float uTime; uniform float uDark; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.8, y)) : mix(uMid, uBot, smoothstep(0.0, -0.5, y));
        float rays = pow(max(0.0, sin(vP.x * 9.0 + uTime * 0.12) * sin(vP.x * 23.0 - uTime * 0.07)), 3.0) * smoothstep(-0.1, 0.7, y) * 0.25;
        c += vec3(0.5, 0.8, 0.9) * rays * (1.0 - uDark);
        gl_FragColor = vec4(c * (1.0 - uDark * 0.92), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 90, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

const RayShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; uniform float uSeed; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
    void main(){
      float x = vUv.x; float y = vUv.y;
      float edge = smoothstep(0.0, 0.35, x) * smoothstep(1.0, 0.65, x);
      float fall = smoothstep(0.0, 0.85, y);
      float flick = 0.65 + 0.35 * sin(uTime * 0.7 + uSeed * 6.0) * sin(uTime * 0.31 + uSeed * 3.0);
      float streak = 0.6 + 0.4 * sin(x * 18.0 + uSeed * 10.0 + uTime * 0.2);
      gl_FragColor = vec4(uColor * edge * fall * flick * streak * uOpacity, 1.0);
    }`,
};

export class GodRays {
  constructor(scene, o = {}) {
    const opt = { count: 7, x0: -14, x1: 14, z0: -7, z1: -1, y: 3, h: 16, w: [1.2, 3.2], color: 0x9fe8ff, opacity: 0.13, tilt: 0.28, seed: 4, ...o };
    this.group = new THREE.Group();
    const rnd = seeded(opt.seed);
    this.mats = [];
    for (let i = 0; i < opt.count; i++) {
      const w = opt.w[0] + rnd() * (opt.w[1] - opt.w[0]);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: GlobalU.uTime, uSeed: { value: rnd() * 10 }, uColor: { value: new THREE.Color(opt.color) }, uOpacity: { value: opt.opacity * (0.6 + rnd() * 0.6) } },
        vertexShader: RayShader.vertexShader, fragmentShader: RayShader.fragmentShader,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      this.mats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, opt.h), mat);
      const x = opt.x0 + (opt.x1 - opt.x0) * ((i + rnd() * 0.8) / opt.count);
      m.position.set(x, opt.y + opt.h / 2 - 2, opt.z0 + rnd() * (opt.z1 - opt.z0));
      m.rotation.z = opt.tilt + (rnd() - 0.5) * 0.1;
      m.rotation.y = (rnd() - 0.5) * 0.5;
      m.renderOrder = 15;
      this.group.add(m);
    }
    scene.add(this.group);
    this.base = opt.opacity;
  }
  setIntensity(k) { for (const m of this.mats) m.uniforms.uOpacity.value = m.uniforms.uOpacity.value * 0 + this.base * k * (0.8 + (m.uniforms.uSeed.value % 1) * 0.4); }
}

// floating plankton / marine snow as tiny square points
export class MarineSnow {
  constructor(scene, o = {}) {
    const opt = { count: 900, box: [-16, 16, -1, 12, -9, 5], size: 0.045, color: 0xbff6ff, opacity: 0.55, ...o };
    this.box = opt.box;
    const n = opt.count;
    const pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    const r = seeded(77);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = opt.box[0] + r() * (opt.box[1] - opt.box[0]);
      pos[i * 3 + 1] = opt.box[2] + r() * (opt.box[3] - opt.box[2]);
      pos[i * 3 + 2] = opt.box[4] + r() * (opt.box[5] - opt.box[4]);
      this.vel[i * 3] = (r() - 0.5) * 0.08; this.vel[i * 3 + 1] = -0.03 - r() * 0.06; this.vel[i * 3 + 2] = (r() - 0.5) * 0.05;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: opt.color, size: opt.size, sizeAttenuation: true, transparent: true, opacity: opt.opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const p = this.points.geometry.attributes.position.array, v = this.vel, b = this.box;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += (v[i] + Math.sin(this.t * 0.5 + i) * 0.03) * dt;
      p[i + 1] += v[i + 1] * dt;
      p[i + 2] += v[i + 2] * dt;
      if (p[i + 1] < b[2]) p[i + 1] = b[3];
      if (p[i] < b[0]) p[i] = b[1]; else if (p[i] > b[1]) p[i] = b[0];
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- fish
function fishGrid(kind, seed) {
  const r = seeded(seed);
  const palettes = [
    [0xffb03a, 0xff6a1a, 0xfff2c0], [0x4fd0ff, 0x1c6fd0, 0xe8fbff], [0xff6fb0, 0xb8357a, 0xffe0ef],
    [0xb6ff6a, 0x4a8a2f, 0xf0ffe0], [0xfff08a, 0xb88a1e, 0xffffff], [0xc194ff, 0x553088, 0xf5ecff],
  ];
  const [c1, c2, c3] = palettes[kind % palettes.length];
  const g = new VoxelGrid(12, 7, 4);
  g.ellipsoid(6.5, 3.5, 2, 4.5, 2.8, 1.8, (x, y) => (y < 3 ? c3 : ((x + (kind % 2)) % 3 === 0 ? c2 : c1)));
  g.box(0, 2, 1, 2, 5, 3, c2); // tail
  g.box(0, 1, 1, 1, 6, 3, c2);
  g.box(6, 6, 1, 9, 7, 3, c2); // dorsal
  g.set(9, 4, 0, 0x111111); g.set(9, 4, 3, 0x111111);
  g.set(9, 5, 0, 0xffffff); g.set(9, 5, 3, 0xffffff);
  return g;
}

export class FishSchool {
  constructor(scene, o = {}) {
    const opt = { count: 14, kinds: [0, 1, 4], area: [-18, 18, 3, 10, -14, -8], speed: [0.8, 1.6], size: 0.06, seed: 9, ...o };
    this.opt = opt;
    this.fish = [];
    this.group = new THREE.Group();
    const r = seeded(opt.seed);
    const geos = opt.kinds.map((k, i) => meshVoxels(fishGrid(k, i + opt.seed), { size: opt.size, pivot: [6, 3.5, 2] }));
    const mat = voxelMaterial({ voxelSize: opt.size, jitter: 0.05, edge: 0.04, shared: true, roughness: 0.6 });
    for (let i = 0; i < opt.count; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], mat);
      const f = {
        mesh: m, x: opt.area[0] + r() * (opt.area[1] - opt.area[0]), y: opt.area[2] + r() * (opt.area[3] - opt.area[2]), z: opt.area[4] + r() * (opt.area[5] - opt.area[4]),
        dir: r() < 0.5 ? 1 : -1, sp: opt.speed[0] + r() * (opt.speed[1] - opt.speed[0]), ph: r() * 10, s: 0.7 + r() * 0.7,
      };
      m.scale.setScalar(f.s);
      this.group.add(m);
      this.fish.push(f);
    }
    scene.add(this.group);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const a = this.opt.area;
    for (const f of this.fish) {
      f.x += f.dir * f.sp * dt;
      if (f.x > a[1] + 3) { f.x = a[0] - 3; }
      if (f.x < a[0] - 3) { f.x = a[1] + 3; }
      const wig = Math.sin(this.t * 8 + f.ph);
      f.mesh.position.set(f.x, f.y + Math.sin(this.t * 0.8 + f.ph) * 0.3, f.z);
      f.mesh.rotation.y = (f.dir > 0 ? 0 : Math.PI) + wig * 0.18;
      f.mesh.rotation.z = Math.sin(this.t * 0.8 + f.ph) * 0.1;
    }
  }
}

// ---------- algae strand voxel mesh (sways via material)
export function algaeMesh(height, o = {}) {
  const opt = { seed: 1, color: 0x4a8a2f, color2: 0x77b83f, size: 1 / 12, width: 2, ...o };
  const r = seeded(opt.seed);
  const H = Math.max(4, Math.round(height / opt.size));
  const g = new VoxelGrid(7, H + 1, 3);
  let x = 3;
  for (let y = 0; y < H; y++) {
    if (r() < 0.25) x += r() < 0.5 ? -1 : 1;
    x = Math.max(1, Math.min(5, x));
    const t = y / H;
    const c = mixColor(opt.color, opt.color2, t + (r() - 0.5) * 0.2);
    g.set(x, y, 1, c);
    if (opt.width > 1 && t < 0.85) g.set(x + (y % 2 ? 1 : -1), y, 1, shadeColor(c, -0.15));
    if (r() < 0.18) g.set(x + (r() < 0.5 ? -1 : 1), y, r() < 0.5 ? 0 : 2, shadeColor(c, 0.15));
  }
  const geo = meshVoxels(g, { size: opt.size, pivot: [3.5, 0, 1.5] });
  const mat = voxelMaterial({ voxelSize: opt.size, sway: opt.sway ?? 0.09, jitter: 0.1, edge: 0.0, shared: true, roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  return m;
}

// Static algae carpet tufts: returns merged mesh
export function algaeField(points, o = {}) {
  const group = new THREE.Group();
  points.forEach((p, i) => {
    const m = algaeMesh(p.h ?? 0.6, { seed: (o.seed || 1) * 100 + i, color: p.color ?? o.color ?? 0x2f5d24, color2: p.color2 ?? o.color2 ?? 0x77b83f, size: o.size ?? 1 / 14, width: p.w ?? 1, sway: o.sway });
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = p.ry ?? (i * 1.3);
    group.add(m);
  });
  return group;
}

// rising bubble column emitter helper (visual only) - uses the Particles system
export class BubbleVents {
  constructor(particles, vents) { this.p = particles; this.vents = vents; this.acc = vents.map(() => Math.random()); }
  update(dt) {
    this.vents.forEach((v, i) => {
      this.acc[i] += dt * (v.rate ?? 3);
      while (this.acc[i] > 1) {
        this.acc[i] -= 1;
        const s = 0.05 + Math.random() * 0.09;
        this.p.spawn({ x: v.x + (Math.random() - 0.5) * (v.w ?? 0.2), y: v.y, z: v.z + (Math.random() - 0.5) * 0.2, vy: 0.8 + Math.random() * 0.9, vx: 0, grav: 0.6, drag: 0.4, life: v.life ?? 3.5, size: s, size1: s * 1.4, spr: 'bubble', color: 0xcff8ff, alpha: 0.9, alpha1: 0.6, wob: [0.35, 4 + Math.random() * 3] });
      }
    });
  }
}
