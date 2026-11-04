// Renders pixel-art portraits of fighters from their actual voxel models (cached per skin).
import * as THREE from 'three';
import { Rig, DEFAULT_POSE } from './rig.js';
import { buildSpec } from './rigs/characters.js';
import { STYLE, stance } from './anim.js';

const cache = new Map();
let scene, cam, rt, lights;

function setup(renderer) {
  if (scene) return;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
  rt = new THREE.WebGLRenderTarget(96, 96, { samples: 0 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const key = new THREE.DirectionalLight(0xfff4e0, 2.6); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fd8ff, 2.2); rim.position.set(-3, 2, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fe0f0, 0x203038, 1.1));
}

// opts: { size, full (whole body), demon, flip, bg }
export function portrait(renderer, char, cos = {}, opts = {}) {
  const size = opts.size || 40;
  const k = `${char}|${cos.skin || 'default'}|${cos.gloves || 'default'}|${size}|${opts.full ? 1 : 0}|${opts.demon ? 1 : 0}|${opts.angle || 0}`;
  if (cache.has(k)) return cache.get(k);
  setup(renderer);
  const gl = renderer.gl;
  const rig = new Rig(buildSpec(char, cos, { demon: opts.demon }), { rim: 0.0 });
  rig.addTo(scene);
  const st = char === 'bobby' && opts.demon ? STYLE.demon : STYLE[char];
  const pose = stance(st, 0.7, 0);
  rig.applyPose({ ...DEFAULT_POSE, ...pose });
  rig.root.rotation.y = opts.angle ?? 0.35;
  rig.update(0.016, {});
  for (let i = 0; i < 30; i++) rig.update(1 / 60, {});
  // frame the head (or full body)
  const head = rig.headWorld(new THREE.Vector3());
  const box = new THREE.Box3().setFromObject(rig.root);
  if (opts.full) {
    const c = box.getCenter(new THREE.Vector3());
    const h = box.max.y - box.min.y;
    cam.position.set(c.x + 0.6, c.y + 0.2, h * 2.3 + 1);
    cam.lookAt(c.x, c.y, 0);
  } else {
    const sc = char === 'brutus' ? 1.25 : char === 'bobby' ? 0.95 : 1;
    cam.position.set(head.x + 0.75 * sc, head.y + 0.25 * sc, 1.65 * sc);
    cam.lookAt(head.x + 0.12 * sc, head.y + 0.1 * sc, 0);
  }
  const prevRT = gl.getRenderTarget();
  const prevClear = gl.getClearColor(new THREE.Color()); const prevAlpha = gl.getClearAlpha();
  gl.setRenderTarget(rt);
  gl.setClearColor(0x000000, 0);
  gl.clear();
  const prevTM = gl.toneMapping; gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.render(scene, cam);
  gl.toneMapping = prevTM;
  const px = new Uint8Array(96 * 96 * 4);
  gl.readRenderTargetPixels(rt, 0, 0, 96, 96, px);
  gl.setRenderTarget(prevRT);
  gl.setClearColor(prevClear, prevAlpha);
  rig.removeFrom(scene); rig.dispose();
  // downsample to pixel art + outline
  const src = document.createElement('canvas'); src.width = 96; src.height = 96;
  const sg = src.getContext('2d');
  const id = sg.createImageData(96, 96);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const si = ((95 - y) * 96 + x) * 4, di = (y * 96 + x) * 4;
    id.data[di] = px[si]; id.data[di + 1] = px[si + 1]; id.data[di + 2] = px[si + 2]; id.data[di + 3] = px[si + 3];
  }
  sg.putImageData(id, 0, 0);
  const out = document.createElement('canvas'); out.width = size; out.height = size;
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = true;
  og.drawImage(src, 0, 0, size, size);
  const d = og.getImageData(0, 0, size, size);
  // threshold alpha, posterize colours slightly
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 110) { d.data[i + 3] = 0; continue; }
    d.data[i + 3] = 255;
    for (let c = 0; c < 3; c++) d.data[i + c] = Math.min(255, Math.round(d.data[i + c] / 16) * 16 * 1.05);
  }
  // 1px dark outline
  const W = size;
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : d.data[(y * W + x) * 4 + 3]);
  const copy = new Uint8ClampedArray(d.data);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (copy[i + 3]) continue;
    if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { d.data[i] = 18; d.data[i + 1] = 10; d.data[i + 2] = 8; d.data[i + 3] = 255; }
  }
  og.putImageData(d, 0, 0);
  if (opts.flip) {
    const f = document.createElement('canvas'); f.width = size; f.height = size;
    const fg = f.getContext('2d'); fg.translate(size, 0); fg.scale(-1, 1); fg.drawImage(out, 0, 0);
    cache.set(k, f); return f;
  }
  cache.set(k, out);
  return out;
}

export function clearPortraits() { cache.clear(); }
