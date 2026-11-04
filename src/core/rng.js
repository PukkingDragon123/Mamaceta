// Deterministic PRNG with serialisable state, used by the combat simulation.
// State is a plain object {s: uint32} so it can live inside the sim state.

export function makeRng(seed) {
  return { s: (seed >>> 0) || 0x1234567 };
}

// mulberry32 step: integer ops only -> identical on every JS engine.
export function rngU32(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
export function rngFloat(r) { return rngU32(r) / 4294967296; }
export function rngInt(r, n) { return rngU32(r) % n; }
export function rngRange(r, a, b) { return a + rngFloat(r) * (b - a); }
export function rngChance(r, p) { return rngFloat(r) < p; }
export function rngPick(r, arr) { return arr[rngInt(r, arr.length)]; }
