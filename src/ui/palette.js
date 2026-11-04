// Shared UI palette (hand-picked, used by every pixel-art sprite for a coherent look)
export const P = {
  ink: '#120a08', ink2: '#1e120d', black: '#000000', white: '#ffffff',
  deep0: '#04121a', deep1: '#0b1e2b', deep2: '#12324a', deep3: '#1b4a63',
  wood0: '#2a170e', wood1: '#3b2216', wood2: '#5a3522', wood3: '#7a4a2c', wood4: '#9c6436', wood5: '#b97f46', wood6: '#d8a05e', wood7: '#efc485',
  rust0: '#3a1a0c', rust1: '#5c2a14', rust2: '#8a3d1a', rust3: '#b5561f', rust4: '#d97a2b', rust5: '#f0a04b',
  metal0: '#1a1e24', metal1: '#2a2f36', metal2: '#464e58', metal3: '#6b7682', metal4: '#9aa6b2', metal5: '#cfd8df',
  algae0: '#14291a', algae1: '#1d3b1a', algae2: '#2f5d24', algae3: '#4a8a2f', algae4: '#77b83f', algae5: '#a8db5a',
  teal0: '#0a2a33', teal1: '#0f3a4a', teal2: '#17606f', teal3: '#2a8f97', teal4: '#49c2bd', teal5: '#8ff0e0',
  cream0: '#8a7350', cream1: '#bfa274', cream2: '#e0c99a', cream3: '#f5e6c4', cream4: '#fff7e0',
  red0: '#3a0a0a', red1: '#5e1414', red2: '#9c1f1f', red3: '#d93a2b', red4: '#ff6a4a', red5: '#ffa080',
  gold0: '#4a3008', gold1: '#6b4a12', gold2: '#b88a1e', gold3: '#f0c33c', gold4: '#fff08a',
  pink0: '#4a1030', pink1: '#6e1f4a', pink2: '#b8357a', pink3: '#ff6fb0', pink4: '#ffb6d9',
  purple0: '#1a0e2e', purple1: '#2e1a4a', purple2: '#553088', purple3: '#8a52c9', purple4: '#c194ff',
  blue0: '#081838', blue1: '#10306e', blue2: '#2050c0', blue3: '#4f8fff', blue4: '#9cc4ff',
  orange2: '#c4561a', orange3: '#ff8a2a', orange4: '#ffc070',
  green3: '#3fd16a', green4: '#9effa8',
};

export const PLAYER_COLORS = [
  { main: '#ff5a3a', light: '#ffa080', dark: '#9c1f1f', ink: '#3a0a0a', name: 'P1' },
  { main: '#3f8fff', light: '#9cc4ff', dark: '#10306e', ink: '#081838', name: 'P2' },
];

export const RARITY = {
  common: { name: 'COMMON', color: '#cfd8df', dark: '#464e58', gem: '#9aa6b2', price: 120 },
  rare: { name: 'RARE', color: '#4f8fff', dark: '#10306e', gem: '#4f8fff', price: 280 },
  epic: { name: 'EPIC', color: '#c194ff', dark: '#553088', gem: '#8a52c9', price: 550 },
  legendary: { name: 'LEGENDARY', color: '#f0c33c', dark: '#6b4a12', gem: '#ffcf3a', price: 1100 },
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  if (f >= 0) return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
