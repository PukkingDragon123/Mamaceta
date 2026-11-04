// Visual effects driven by simulation events: pixel particles, cavitation bubbles,
// shockwave rings, screen distortion waves, impact flashes and light pops.
import * as THREE from 'three';
import { HITFX } from '../data/cosmetics.js';
import { GlobalU } from './materials.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const BubbleShader = {
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uFlash; varying vec3 vN; varying vec3 vV;
    void main(){ float f = 1.0 - abs(dot(vN, vV)); float rim = pow(f, 2.2); float spec = pow(max(dot(reflect(-vV, vN), normalize(vec3(-0.4,0.7,0.6))),0.0), 30.0);
      vec3 c = uColor * (rim * 1.6 + 0.08) + vec3(1.0) * spec * 1.5 + vec3(1.0, 0.95, 0.8) * uFlash * 6.0;
      gl_FragColor = vec4(c * uAlpha, 1.0); }`,
};
const RingShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uThick; varying vec2 vUv;
    void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float px = 1.0 / 40.0; r = floor(r / px) * px;
      float a = smoothstep(1.0 - uThick, 1.0 - uThick * 0.5, r) * (1.0 - smoothstep(0.96, 1.0, r));
      gl_FragColor = vec4(uColor * a * uAlpha, 1.0); }`,
};

export class FX {
  constructor(scene, renderer, particles, camera) {
    this.scene = scene; this.renderer = renderer; this.p = particles; this.camera = camera;
    this.shakeReq = 0; this.kick = new THREE.Vector2(); this.zoomReq = 0;
    this.bubbles = []; this.rings = []; this.lights = [];
    const geo = new THREE.SphereGeometry(1, 20, 14);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.ShaderMaterial({ ...BubbleShader, uniforms: { uColor: { value: new THREE.Color(0x9ff3ff) }, uAlpha: { value: 0 }, uFlash: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 18; scene.add(m);
      this.bubbles.push({ m, mat, t: 0, active: false });
    }
    const rgeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.ShaderMaterial({ ...RingShader, uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0 }, uThick: { value: 0.25 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const m = new THREE.Mesh(rgeo, mat); m.visible = false; m.renderOrder = 19; scene.add(m);
      this.rings.push({ m, mat, t: 0, active: false });
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 0.1, peak: 0 });
    }
    this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.invert = 0; this.ca = 0; this.speedLines = 0; this.speedCenter = new THREE.Vector2(0.5, 0.5);
    this.texts = []; // world-space popups for HUD to draw
  }

  // --- screen-level effects
  shake(a) { this.shakeReq = Math.max(this.shakeReq, a); }
  screenFlash(a, color = 0xffffff) { this.flash = Math.max(this.flash, a); this.flashColor.set(color); }
  impactFrame(a = 1) { this.invert = Math.max(this.invert, a); }
  waveAt(pos, strength = 1, speed = 1.3, life = 0.5) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return;
    this.renderer.addWave(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, strength, speed, life);
  }
  lightPop(x, y, color = 0xffffff, intensity = 30, dur = 0.12, dist = 6) {
    const L = this.lights.sort((a, b) => a.t - b.t)[0];
    let best = this.lights[0];
    for (const l of this.lights) if (l.peak * (1 - l.t / l.dur) < best.peak * (1 - best.t / best.dur)) best = l;
    best.l.position.set(x, y, 1.2); best.l.color.set(color); best.l.distance = dist; best.peak = intensity; best.t = 0; best.dur = dur;
  }
  ring(x, y, z, o = {}) {
    const r = this.rings.find((q) => !q.active) || this.rings[0];
    r.active = true; r.t = 0; r.dur = o.dur ?? 0.35; r.size0 = o.size0 ?? 0.2; r.size1 = o.size1 ?? 2.2;
    r.m.position.set(x, y, z);
    r.flat = !!o.flat;
    r.m.rotation.set(o.flat ? -Math.PI / 2 : 0, 0, 0);
    r.mat.uniforms.uColor.value.set(o.color ?? 0xffffff).multiplyScalar(o.bright ?? 2.5);
    r.mat.uniforms.uThick.value = o.thick ?? 0.22;
    r.m.visible = true;
  }
  bubble(x, y, r, delay, dark = false, id = null) {
    const b = this.bubbles.find((q) => !q.active) || this.bubbles[0];
    b.active = true; b.t = 0; b.r = r; b.delay = delay / 60; b.id = id; b.popped = false;
    b.m.position.set(x, y, 0.3);
    b.mat.uniforms.uColor.value.set(dark ? 0xc040ff : 0x9ff3ff);
    b.m.visible = true;
    return b;
  }
  popBubble(id) {
    const b = this.bubbles.find((q) => q.active && q.id === id);
    if (b) { b.popped = true; b.t = 0; }
  }
  text(str, x, y, o = {}) { this.texts.push({ str, x, y, t: 0, dur: o.dur ?? 0.9, color: o.color ?? '#fff08a', size: o.size ?? 'big', vy: o.vy ?? 1.2, wobble: o.wobble ?? true }); }

  // --- particle recipes
  sparks(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.dir !== undefined ? (o.dir > 0 ? 0 : Math.PI) : 0) + rnd(-1, 1) * (o.spread ?? Math.PI);
      const sp = rnd(o.sp0 ?? 3, o.sp1 ?? 9);
      this.p.spawn({ glow: o.glow ?? true, x, y, z: rnd(-0.2, 0.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: o.grav ?? -4, drag: 3, life: rnd(0.15, o.life ?? 0.4), size: o.size ?? 0.16, size1: 0.02, spr: o.spr ?? 'spark', frame: o.frame ?? 0, color: o.color ?? pick(o.colors || [0xffffff]), stretch: o.stretch ?? 0.12, boost: o.boost ?? 3 });
    }
  }
  burst(x, y, o) {
    // generic sprite burst, used by hit effects cosmetics
    const n = o.n ?? 10;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(o.sp0 ?? 2, o.sp1 ?? 6);
      this.p.spawn({ glow: !!o.glow, x, y, z: rnd(-0.2, 0.5), vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp + (o.vy ?? 0), grav: o.grav ?? -3, drag: o.drag ?? 2.5, life: rnd(o.life0 ?? 0.35, o.life1 ?? 0.8), size: rnd(o.s0 ?? 0.1, o.s1 ?? 0.2), size1: o.shrink === false ? undefined : 0.03, spr: o.spr, frame: o.frames ? Math.floor(Math.random() * o.frames) : 0, color: pick(o.colors), rv: rnd(-10, 10), alpha: 1, alpha1: o.fade === false ? 1 : 0, anim: o.anim, fps: o.fps, wob: o.wob, floor: o.floor, bounce: o.bounce, boost: o.boost });
    }
  }
  dust(x, y, n = 8, color = 0xc8b890, power = 1) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.p.spawn({ x: x + rnd(-0.2, 0.2), y: y + 0.05, z: rnd(-0.4, 0.4), vx: dir * rnd(0.6, 2.4) * power, vy: rnd(0.2, 1.0) * power, grav: 0.4, drag: 3, life: rnd(0.4, 0.8), size: rnd(0.14, 0.26), size1: 0.36, spr: 'smoke', anim: 'life', color, alpha: 0.85, alpha1: 0 });
    }
  }
  bubbleBurst(x, y, n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const s = rnd(0.05, 0.16);
      this.p.spawn({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), z: rnd(-0.3, 0.5), vx: rnd(-2, 2) * power, vy: rnd(0.5, 3) * power, grav: 1.4, drag: 2, life: rnd(0.8, 1.8), size: s, size1: s * 1.3, spr: 'bubble', color: 0xd8fbff, alpha: 0.95, alpha1: 0.3, wob: [0.6, rnd(4, 8)] });
    }
  }
  shards(x, y, n, colors, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(o.sp0 ?? 2, o.sp1 ?? 7);
      this.p.spawn({ x, y, z: rnd(-0.3, 0.5), vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.abs(Math.sin(a)) * sp + (o.vy ?? 2), grav: o.grav ?? -14, drag: 0.8, life: rnd(0.8, o.life ?? 1.6), size: rnd(o.s0 ?? 0.08, o.s1 ?? 0.18), spr: o.spr ?? 'shard', frame: Math.floor(Math.random() * 4), color: pick(colors), rv: rnd(-14, 14), floor: o.floor ?? 0.03, bounce: 0.45, alpha: 1, alpha1: 0.9 });
    }
  }

  // Hit effect respecting the attacker's equipped "punch FX" cosmetic
  hitEffect(x, y, power, dir, styleKey = 'classic') {
    const st = HITFX.find((h) => h.key === styleKey) || HITFX[0];
    const big = power > 1.4;
    // core flash sprite
    this.p.spawn({ glow: true, x, y, z: 0.6, life: big ? 0.16 : 0.1, size: big ? 1.2 : 0.75, size1: big ? 1.6 : 1.0, spr: 'hit', anim: 'life', color: st.dark ? 0xc090ff : 0xffffff, boost: 4 });
    this.sparks(x, y, Math.round(6 + power * 6), { dir, spread: 1.1, colors: st.colors, sp1: 6 + power * 4, life: 0.35 });
    const spr = st.spr;
    const glowy = spr === 'spark' || spr === 'bolt' || spr === 'flame' || spr === 'skull';
    this.burst(x, y, { n: Math.round(4 + power * 5), spr, colors: st.colors, glow: glowy, sp0: 1.5, sp1: 4 + power * 2, vx: dir * 2, s0: 0.12, s1: big ? 0.3 : 0.2, grav: spr === 'bubble' ? 2 : spr === 'flame' ? 2 : -3, anim: spr === 'flame' ? 'life' : null, frames: spr === 'confetti' ? 2 : 0, wob: spr === 'petal' || spr === 'bubble' ? [0.8, 5] : null, life1: 0.9, boost: 2.5 });
    if (spr === 'ink') this.burst(x, y, { n: 6, spr: 'ink', colors: st.colors, sp0: 0.5, sp1: 2, grav: -1, s0: 0.2, s1: 0.4, life1: 1 });
    this.ring(x, y, 0.5, { size1: 0.6 + power * 0.7, dur: 0.18 + power * 0.06, color: st.colors[0], thick: 0.3 });
    this.lightPop(x, y, st.colors[1] ?? 0xffffff, 10 + power * 18, 0.1 + power * 0.03);
  }

  update(dt) {
    // bubbles
    for (const b of this.bubbles) {
      if (!b.active) continue;
      b.t += dt;
      if (!b.popped) {
        const k = Math.min(1, b.t / Math.max(0.05, b.delay));
        const s = b.r * (0.25 + 0.75 * Math.sin(k * Math.PI * 0.5));
        b.m.scale.setScalar(s);
        b.mat.uniforms.uAlpha.value = 0.9; b.mat.uniforms.uFlash.value = 0;
        if (b.t > b.delay + 0.4) b.popped = true;
      } else {
        const k = b.t / 0.09;
        b.m.scale.setScalar(b.r * Math.max(0.02, 1 - k));
        b.mat.uniforms.uFlash.value = Math.max(0, 1 - k);
        b.mat.uniforms.uAlpha.value = Math.max(0, 1 - k);
        if (k >= 1) { b.active = false; b.m.visible = false; }
      }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.dur;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      const s = r.size0 + (r.size1 - r.size0) * e;
      r.m.scale.set(s, s, s);
      if (!r.flat) r.m.quaternion.copy(this.camera.quaternion);
      r.mat.uniforms.uAlpha.value = Math.max(0, 1 - k);
      if (k >= 1) { r.active = false; r.m.visible = false; }
    }
    for (const L of this.lights) {
      L.t += dt;
      L.l.intensity = L.t < L.dur ? L.peak * (1 - L.t / L.dur) : 0;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += dt; t.y += t.vy * dt * (1 - t.t / t.dur); if (t.t >= t.dur) this.texts.splice(i, 1); }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.invert = Math.max(0, this.invert - dt * 14);
    this.ca = Math.max(0, this.ca - dt * 3);
    this.speedLines = Math.max(0, this.speedLines - dt * 2);
  }

  applyPost(post, base = {}) {
    post.uFlash.value = this.flash * 0.85;
    post.uFlashColor.value.copy(this.flashColor);
    post.uInvert.value = this.invert > 0.5 ? 1 : 0;
    post.uCA.value = (base.ca ?? 0.12) + this.ca;
    post.uSpeedLines.value = this.speedLines;
    post.uSpeedCenter.value.copy(this.speedCenter);
  }

  clear() {
    for (const b of this.bubbles) { b.active = false; b.m.visible = false; }
    for (const r of this.rings) { r.active = false; r.m.visible = false; }
    this.texts.length = 0;
  }
}
