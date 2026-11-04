// Three.js renderer, post-processing (bloom + custom final grade with shockwave distortion,
// chromatic aberration, vignette, grain, impact frames, letterbox) and animated caustics.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GlobalU } from './materials.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uWaves: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCA: { value: 0.15 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uExposure: { value: 1.0 },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uInvert: { value: 0 },
    uWobble: { value: 1 },
    uLetterbox: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uDesat: { value: 0 },
    uSpeedLines: { value: 0 },
    uSpeedCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uDark: { value: 0 },
    uRedTint: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
    uniform vec4 uWaves[8]; uniform float uCA; uniform float uVignette; uniform float uGrain;
    uniform float uFlash; uniform vec3 uFlashColor; uniform float uExposure; uniform float uSat; uniform float uContrast;
    uniform float uInvert; uniform float uWobble; uniform float uLetterbox; uniform vec3 uTint; uniform float uDesat;
    uniform float uSpeedLines; uniform vec2 uSpeedCenter; uniform float uDark; uniform float uRedTint;
    varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
    vec3 toSRGB(vec3 c){ return mix(12.92*c, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = vUv;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      uv += vec2(sin(uv.y * 13.0 + uTime * 1.25), cos(uv.x * 10.0 + uTime * 1.05)) * 0.0007 * uWobble;
      float waveGlow = 0.0;
      for (int i = 0; i < 8; i++) {
        vec4 w = uWaves[i];
        if (w.w <= 0.0) continue;
        vec2 d = (uv - w.xy) * asp;
        float dist = length(d);
        float x = dist - w.z;
        float ring = exp(-x * x * 1400.0);
        uv -= (d / max(dist, 1e-4)) / asp * ring * w.w * 0.022;
        waveGlow += ring * w.w * 0.25;
      }
      vec2 dir = uv - 0.5;
      float ca = uCA * (0.4 + dot(dir, dir) * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca * 0.02).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca * 0.02).b;
      col += waveGlow * vec3(0.6, 0.9, 1.0);
      col *= uExposure * uTint;
      col = aces(col);
      col = toSRGB(col);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * vec3(1.3, 0.45, 0.45) + vec3(0.06, 0.0, 0.0), uRedTint);
      // speed lines (anime)
      if (uSpeedLines > 0.0) {
        vec2 sd = (vUv - uSpeedCenter) * asp;
        float ang = atan(sd.y, sd.x);
        float r = length(sd);
        float n = h12(vec2(floor(ang * 90.0), floor(uTime * 24.0)));
        float line = step(0.82, n) * smoothstep(0.18, 0.75, r);
        col = mix(col, vec3(1.0), line * uSpeedLines * 0.85);
      }
      vec2 vu = vUv - 0.5;
      float vig = smoothstep(0.85, 0.2, length(vu * vec2(1.0, 1.1)));
      col *= mix(1.0 - uVignette, 1.0, vig);
      col *= 1.0 - uDark;
      col = mix(col, uFlashColor, uFlash);
      if (uInvert > 0.0) {
        float lum = dot(col, vec3(0.3, 0.59, 0.11));
        vec3 inv = vec3(step(0.42, 1.0 - lum));
        col = mix(col, inv, uInvert);
      }
      float g = h12(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += g * uGrain;
      if (uLetterbox > 0.0) {
        float bar = 0.11 * uLetterbox;
        if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      }
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const CausticShader = {
  uniforms: { uTime: { value: 0 }, uScale: { value: 6.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform float uScale; varying vec2 vUv;
    #define TAU 6.28318530718
    void main(){
      float time = uTime * 0.45 + 23.0;
      vec2 p = mod(vUv * TAU * uScale, TAU) - 250.0;
      vec2 i = vec2(p);
      float c = 1.0; float inten = 0.005;
      for (int n = 0; n < 5; n++) {
        float t = time * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
      }
      c /= 5.0;
      c = 1.17 - pow(c, 1.4);
      float k = pow(abs(c), 8.0);
      vec2 e = abs(vUv - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
      vec3 col = vec3(0.26, 0.33, 0.38) + vec3(0.85, 1.0, 1.05) * k * 2.6 + vec3(0.1,0.14,0.16) * pow(abs(c), 3.0);
      gl_FragColor = vec4(col * mix(0.55, 1.0, edge), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.setClearColor(0x04121a, 1);
    this.quality = 'high';
    this.post = {}; // final pass uniforms shortcut
    this.time = 0;
    this._buildComposer();
    this._buildCaustics();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.waves = []; // active shockwaves {x,y (uv), r, speed, str, life}
    this.extraRender = null;
  }

  _buildComposer() {
    const samples = this.quality === 'high' ? 4 : 0;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.gl, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.82);
    this.bloom.enabled = this.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);
    this.post = this.finalPass.uniforms;
  }

  _buildCaustics() {
    this.causticRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
    this.causticRT.texture.wrapS = this.causticRT.texture.wrapT = THREE.RepeatWrapping;
    this.causticScene = new THREE.Scene();
    this.causticMat = new THREE.ShaderMaterial({ ...CausticShader, uniforms: THREE.UniformsUtils.clone(CausticShader.uniforms), depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.causticMat);
    quad.frustumCulled = false;
    this.causticScene.add(quad);
    this.causticCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  get causticTexture() { return this.causticRT.texture; }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.composer.dispose?.();
    this._buildComposer();
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const maxPR = this.quality === 'high' ? 1.5 : this.quality === 'medium' ? 1 : 0.7;
    const pr = Math.min(dpr, maxPR);
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.post.uRes.value.set(w * pr, h * pr);
    this.width = w; this.height = h; this.aspect = w / h;
    this.gl.shadowMap.enabled = this.quality !== 'low';
  }

  // shockwave in normalized screen coords
  addWave(u, v, strength = 1, speed = 1.2, life = 0.55) {
    this.waves.push({ u, v, r: 0, str: strength, speed, life, t: 0 });
    if (this.waves.length > 8) this.waves.shift();
  }

  update(dt) {
    this.time += dt;
    GlobalU.uTime.value = this.time;
    this.post.uTime.value = this.time;
    // waves
    const arr = this.post.uWaves.value;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.t += dt; w.r += w.speed * dt * (1 - w.t / w.life * 0.5);
      if (w.t >= w.life) this.waves.splice(i, 1);
    }
    for (let i = 0; i < 8; i++) {
      const w = this.waves[i];
      if (w) arr[i].set(w.u, w.v, w.r, w.str * (1 - w.t / w.life)); else arr[i].set(0, 0, 0, 0);
    }
  }

  renderCaustics() {
    this.causticMat.uniforms.uTime.value = this.time;
    const prev = this.gl.getRenderTarget();
    this.gl.setRenderTarget(this.causticRT);
    this.gl.render(this.causticScene, this.causticCam);
    this.gl.setRenderTarget(prev);
  }

  render(scene, camera) {
    this.renderCaustics();
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
