// Shared materials with shader injections: per-voxel colour jitter, voxel edge shading,
// vertex emissive, rim light, hit flash and wind/water sway.
import * as THREE from 'three';

export const GlobalU = {
  uTime: { value: 0 },
};

const matCache = new Map();

/**
 * opts: voxelSize, jitter, edge, rim (0..), rimColor, sway, emissiveBoost, roughness, metalness,
 *       transparent, opacity, side, shared (cache key)
 */
export function voxelMaterial(opts = {}) {
  const o = {
    voxelSize: 1 / 24, jitter: 0.07, edge: 0.06, rim: 0, rimColor: 0x9ff3ff, sway: 0, emissiveBoost: 2.2,
    roughness: 0.82, metalness: 0.0, transparent: false, opacity: 1, side: THREE.FrontSide, ...opts,
  };
  if (o.shared) {
    const k = JSON.stringify(o);
    if (matCache.has(k)) return matCache.get(k);
  }
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: o.roughness, metalness: o.metalness,
    transparent: o.transparent, opacity: o.opacity, side: o.side,
  });
  const u = {
    uVoxelSize: { value: o.voxelSize },
    uJitter: { value: o.jitter },
    uEdge: { value: o.edge },
    uRim: { value: o.rim },
    uRimColor: { value: new THREE.Color(o.rimColor) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xffffff) },
    uSway: { value: o.sway },
    uEmissiveBoost: { value: o.emissiveBoost },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uDissolve: { value: 0 },
    uTime: GlobalU.uTime,
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aEmissive;
        varying float vEmissive;
        varying vec3 vVoxPos;
        varying vec3 vVoxN;
        uniform float uVoxelSize;
        uniform float uSway;
        uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEmissive = aEmissive;
        vVoxPos = position / uVoxelSize;
        vVoxN = normal;
        if (uSway > 0.0) {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = max(0.0, position.y);
          float ph = wp.x * 0.9 + wp.z * 0.6;
          transformed.x += sin(uTime * 1.6 + ph + position.y * 2.3) * uSway * h;
          transformed.z += cos(uTime * 1.2 + ph * 1.3 + position.y * 1.7) * uSway * 0.6 * h;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vEmissive;
        varying vec3 vVoxPos;
        varying vec3 vVoxN;
        uniform float uJitter;
        uniform float uEdge;
        uniform float uRim;
        uniform vec3 uRimColor;
        uniform float uFlash;
        uniform vec3 uFlashColor;
        uniform float uEmissiveBoost;
        uniform vec3 uTint;
        uniform float uDissolve;
        float vxHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 cell = floor(vVoxPos - vVoxN * 0.5 + 0.0005);
          float hj = vxHash(cell + 17.0);
          diffuseColor.rgb *= 1.0 + (hj - 0.5) * uJitter;
          vec3 f = fract(vVoxPos + 0.0001);
          vec3 ed = min(f, 1.0 - f);
          vec3 an = abs(vVoxN);
          float e = an.x > 0.5 ? min(ed.y, ed.z) : (an.y > 0.5 ? min(ed.x, ed.z) : min(ed.x, ed.y));
          diffuseColor.rgb *= 1.0 - uEdge * (1.0 - smoothstep(0.0, 0.09, e));
          diffuseColor.rgb *= uTint;
          if (uDissolve > 0.0 && hj < uDissolve) discard;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vEmissive * uEmissiveBoost;
        if (uRim > 0.0) {
          float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += uRimColor * pow(rim, 2.5) * uRim;
        }
        if (uFlash > 0.0) {
          diffuseColor.rgb = mix(diffuseColor.rgb, uFlashColor, uFlash);
          totalEmissiveRadiance += uFlashColor * uFlash * 0.9;
        }`);
  };
  mat.customProgramCacheKey = () => 'voxel_v3';
  if (o.shared) matCache.set(JSON.stringify(o), mat);
  return mat;
}

// Unlit additive material for glow quads etc.
export function glowMaterial(color = 0xffffff, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

// Translucent jelly material (Puru, bubbles)
export function jellyMaterial(color = 0xff7ac0, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, transparent: true, opacity: opts.opacity ?? 0.72, roughness: 0.25, metalness: 0,
    emissive: new THREE.Color(color).multiplyScalar(opts.glow ?? 0.35), vertexColors: !!opts.vertexColors,
    depthWrite: opts.depthWrite ?? true,
  });
  return mat;
}
