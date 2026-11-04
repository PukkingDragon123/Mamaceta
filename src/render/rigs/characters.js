// Character model specs: Jim (peacock), Brutus (zebra), Bobby (purple spot), Mimi (pink-eared).
// Skins change palettes + add accessories. Gloves replace or recolour the striking appendage.
import {
  VS, segmentBlock, plateStack, eyePart, stalkPart, limbPart, clubPart, glovePart, spearPart, footPart, tailFanPart, tailSegPart,
  antennaSeg, paddlePart, mouthPart, bowPart, acc, shadeColor, mixColor, vhash, VoxelGrid, patternColor, grad,
} from './parts.js';
import { GLOVES } from '../../data/cosmetics.js';
import { voxelMaterial } from '../materials.js';

const V = (a) => a.map((v) => v * VS);

// --------------------------------------------------------------- generic builder
function headPart(pal, S) {
  const [W, H, Z] = S.head;
  const g = new VoxelGrid(W + 6, H + 4, Z + 2);
  const cx = W / 2 + 1, cy = H / 2 + 1.5, cz = (Z + 2) / 2;
  g.ellipsoid(cx, cy, cz, W / 2, H / 2, Z / 2, (x, y, z) => {
    const fx = (x + 0.5 - cx) / (W / 2), fy = (y + 0.5 - cy) / (H / 2);
    let c = patternColor(pal.headPattern, pal.head, x, y, z, 3);
    if (typeof c === 'object') return c;
    if (fx > 0.35 && fy < -0.15) c = pal.face;
    if (fy < -0.55) c = shadeColor(pal.face, -0.1);
    return grad(c, y, H + 4, 0.22);
  });
  // carapace shield rim (slightly flared at the back)
  g.ellipsoid(cx - W * 0.15, cy + H * 0.12, cz, W * 0.42, H * 0.46, Z / 2 + 0.6, (x, y, z) => grad(pal.carapace ?? pal.head, y, H + 4, 0.2), { mode: 'under' });
  // rostral plate between the eyes
  g.box(cx + W / 2 - 2, cy + H / 2 - 2, cz - 1, cx + W / 2 + 1.5, cy + H / 2 - 0.5, cz + 1, pal.rostrum ?? shadeColor(pal.head, 0.2));
  // mouth slit / cheeks
  g.box(cx + W / 2 - 1.5, cy - H * 0.35, cz - 2, cx + W / 2 + 0.6, cy - H * 0.2, cz + 2, pal.mouth ?? 0x2a1015);
  return { grid: g, pivot: [2, 1.5, cz] };
}

function torsoParts(pal, S) {
  const bz = S.bodyZ;
  const pat = pal.bodyPattern, band = pal.band ?? null;
  const pel = plateStack({ pal, plates: S.pelPlates.map((p) => ({ ...p, pattern: pat, band })), bellyAt: 0.45 });
  const t1 = plateStack({ pal, plates: S.t1Plates.map((p) => ({ ...p, pattern: pat, band })), bellyAt: S.bellyAt ?? 0.42 });
  const t2 = plateStack({ pal: { ...pal, body: pal.carapace ?? pal.body }, plates: S.t2Plates.map((p) => ({ ...p, pattern: pal.backPattern ?? pat, band })), bellyAt: 0.5, keel: true });
  // carapace dome over the back of the thorax (the hunched shell)
  if (S.dome) {
    const d = S.dome;
    const g = t2.grid;
    g.ellipsoid(t2.cx + d.dx, d.dy, t2.cz, d.rx, d.ry, d.rz, (x, y, z) => {
      const fx = (x + 0.5 - t2.cx - d.dx) / d.rx;
      if (fx > 0.25) return null;
      let c = pal.carapace ?? pal.body;
      const pc = patternColor(pal.backPattern ?? pat, c, x, y, z, 7);
      if (typeof pc === 'object') return pc;
      c = pc;
      if (band && Math.floor(y / 3) % 2 === 0) c = band;
      if (Math.abs(z + 0.5 - t2.cz) < 0.9) c = shadeColor(c, 0.14); // dorsal keel
      if (y % 4 === 0) c = shadeColor(c, -0.18); // plate grooves
      if (y % 4 === 3) c = mixColor(c, pal.edge, 0.5);
      return grad(c, y, t2.sy, 0.2);
    }, { mode: 'under' });
  }
  return {
    pelvis: { grid: pel.grid, pivot: [pel.cx, pel.H * 0.5 + 0.5, pel.cz] },
    spine1: { grid: t1.grid, pivot: [t1.cx, 0.5, t1.cz] },
    spine2: { grid: t2.grid, pivot: [t2.cx, 0.5, t2.cz] },
    heights: { pel: pel.H, t1: t1.H - 0.6, t2: t2.H },
  };
}

function buildShrimp(pal, S, o = {}) {
  const P = {};
  const bz = S.bodyZ;
  const T = torsoParts(pal, S);
  P.pelvis = T.pelvis; P.spine1 = T.spine1; P.spine2 = T.spine2;
  P.head = headPart(pal, S);
  P.eye = eyePart({ r: S.eyeR, pal, sparkle: S.sparkle, lashes: S.lashes, pupil: S.pupil, band: S.eyeBand });
  if (S.eyeRL) P.eyeL = eyePart({ r: S.eyeRL, pal, sparkle: S.sparkle, lashes: S.lashes, pupil: S.pupil });
  P.stalk = stalkPart(S.stalkL, pal, S.stalkW ?? 2);
  P.merus = limbPart(S.armL1, S.armR[0], S.armR[1], pal.merus, { joint: shadeColor(pal.merus, -0.25), spot: pal.meralSpot, bands: S.armBands ?? 0, bandColor: pal.armBand, pattern: pal.armPattern });
  P.propodus = limbPart(S.armL2, S.armR[1], S.armR[1] * 0.9, pal.propodus, { joint: shadeColor(pal.propodus, -0.2), bands: S.armBands ?? 0, bandColor: pal.armBand, pattern: pal.armPattern });
  // striking appendage + gloves
  const gl = GLOVES.find((x) => x.key === o.gloves && x.key !== 'default');
  if (S.spear) {
    P.hand = spearPart({ len: S.spearL, pal: gl ? { ...pal, barb: gl.band ?? gl.main } : pal, cuff: gl ? gl.main : null });
  } else if (gl) {
    P.hand = glovePart({ r: S.clubR + 0.5, glove: { main: gl.main, cuff: gl.cuff, band: gl.band, pattern: gl.pattern, emissive: gl.emissive, spikes: gl.spikes, glint: gl.glint } });
  } else if (S.mittens) {
    P.hand = glovePart({ r: S.clubR + 0.3, glove: S.mittens });
  } else {
    P.hand = clubPart({ r: S.clubR, pal, wraps: S.wraps });
  }
  P.thigh = limbPart(S.thighL, S.legR[0], S.legR[1], pal.leg, { joint: pal.legDark, bands: S.legBands ?? 0, bandColor: pal.legBand ?? pal.legDark });
  P.shin = limbPart(S.shinL, S.legR[1], S.legR[1] * 0.8, pal.leg, { joint: pal.legDark, bands: S.legBands ?? 0, bandColor: pal.legBand ?? pal.legDark });
  P.foot = footPart(pal, { len: S.footL ?? 7, shoe: S.shoe, shoeSole: S.shoeSole });
  P.tail1 = tailSegPart(pal, S.tail1L, S.tailR, { pattern: pal.bodyPattern, band: pal.band });
  P.tail2 = tailSegPart(pal, S.tail2L, S.tailR * 0.78, { pattern: pal.bodyPattern, band: pal.band });
  P.fan = tailFanPart(pal);
  const [hW, hH, hZ] = S.head;
  const headCx = hW / 2 + 1, headCy = hH / 2 + 1.5;
  const H = T.heights;
  const dims = {
    legSpread: S.legSpread * VS, thighL: S.thighL * VS, shinL: S.shinL * VS, footH: (S.footH ?? 2) * VS,
    legX: 0, legY: -(H.pel * 0.2) * VS,
    spine1Y: (H.pel * 0.32) * VS, spine1Top: H.t1 * VS, spine2X: (S.spine2X ?? -0.5) * VS,
    headMount: V([S.headMount[0], H.t2 * S.headMount[1]]),
    eyeMount: V([headCx + hW * 0.36 - 2, headCy + hH * 0.3 - 1.5, hZ * 0.2]), stalkL: S.stalkL * VS,
    stalkRot: S.stalkRot ?? -0.62, stalkSplay: S.stalkSplay ?? 0.26,
    shoulder: V([S.shoulder[0], H.t2 * S.shoulder[1], bz * 0.5 + 1.5]),
    armL1: S.armL1 * VS, armL2: S.armL2 * VS, handRot: S.spear ? Math.PI / 2 + 0.25 : 0.0, handLevel: S.spear ? 1 : 0.5,
    tailMount: V([-S.pelPlates[0].rx * 0.8, -1]), tail1L: -S.tail1L * 0.85 * VS, tail2L: -S.tail2L * 0.85 * VS,
    tailRest: S.tailRest ?? -0.95, tail2Rest: S.tail2Rest ?? 0.3,
    kneeDir: 1, elbowDir: -1, eyeScaleL: S.eyeScaleL ?? 1, eyeScaleR: S.eyeScaleR ?? 1,
  };
  // extras: mouthparts, antennal scales, antennules, swimmerets
  const extras = [
    { name: 'mouth', attach: 'head', def: mouthPart(pal.mouthparts ?? shadeColor(pal.leg, -0.1)), pos: V([headCx + hW / 2 - 2.5, headCy - hH * 0.42, 0]), rot: [0, 0, 0.3], wiggle: 0.18 },
    { name: 'scaleL', attach: 'head', def: paddlePart(pal.scale, pal.scaleEdge, 4, 7), pos: V([headCx + hW * 0.3, headCy + hH * 0.1, -hZ * 0.48]), rot: [0.5, 0.3, 0.6], wiggle: 0.08 },
    { name: 'scaleR', attach: 'head', def: paddlePart(pal.scale, pal.scaleEdge, 4, 7), pos: V([headCx + hW * 0.3, headCy + hH * 0.1, hZ * 0.48]), rot: [-0.5, -0.3, 0.6], wiggle: 0.08 },
    { name: 'antennules', attach: 'head', def: acc(10, 6, 5, [0.5, 1, 2.5], (g) => { for (let i = 0; i < 3; i++) g.capsule(0.5, 1, 1 + i * 1.5, 9, 4 + i, 1 + i * 1.5, 0.5, 0.5, i === 1 ? pal.antenna : shadeColor(pal.antenna, -0.15)); }), pos: V([headCx + hW / 2 - 1, headCy + hH * 0.12, 0]), rot: [0, 0, 0.35], wiggle: 0.12 },
    { name: 'swim', attach: 'spine1', def: acc(6, 3, bz + 2, [5.5, 1.5, (bz + 2) / 2], (g) => { g.box(0, 0, 1, 6, 2, bz + 1, (x, y, z) => ((z % 3) ? pal.swim ?? pal.leg : shadeColor(pal.swim ?? pal.leg, -0.2))); }), pos: V([S.t1Plates[0].rx * 0.6, 2, 0]), rot: [0, 0, -0.5], wiggle: 0.2 },
  ];
  // antennae soft chains
  const ax = headCx + hW * 0.32, ay = headCy + hH * 0.3;
  const L = S.antL ?? 1;
  const chains = [{
    attach: 'head', mirrorZ: true, stiff: 0.22, damp: 0.84, grav: -0.6,
    rest: [[ax, ay, 2], [ax + 5 * L, ay + 5 * L, 3], [ax + 8 * L, ay + 11 * L, 4], [ax + 8 * L, ay + 17 * L, 5], [ax + 5 * L, ay + 22 * L, 6], [ax + 1 * L, ay + 25 * L, 7]].map((p) => V(p)),
    seg: (i, n) => antennaSeg(pal.antenna, 5, 1, i === n - 1 ? pal.antennaTip ?? null : null),
  }];
  return { vs: VS, parts: P, dims, extras, chains, accessories: [], pal, S };
}

// helpers to place things on the head grid coordinates
function headCoords(S) {
  const [W, H, Z] = S.head;
  return { cx: W / 2 + 1 - 2, cy: H / 2 + 1.5 - 1.5, W, H, Z };
}

// headband ring + knot (accessory on head)
function headbandAcc(S, color, o = {}) {
  const [W, H, Z] = S.head;
  const def = acc(W + 6, H + 4, Z + 4, [2, 1.5, (Z + 4) / 2], (g) => {
    const cx = W / 2 + 1, cy = H / 2 + 1.5, cz = (Z + 4) / 2;
    const y0 = cy + H * (o.y0 ?? 0.08), y1 = cy + H * (o.y1 ?? 0.3);
    g.ellipsoid(cx, cy, cz, W / 2 + 0.9, H / 2 + 0.9, Z / 2 + 0.9, (x, y, z) => (y + 0.5 >= y0 && y + 0.5 <= y1 ? (o.emissive ? { c: color, e: o.emissive } : (y % 2 ? color : shadeColor(color, -0.12))) : null));
    g.ellipsoid(cx, cy, cz, W / 2 - 0.3, H / 2 - 0.3, Z / 2 - 0.3, null, { mode: 'carve' });
    // knot at the back
    g.box(cx - W / 2 - 1.5, y0, cz - 1.5, cx - W / 2 + 0.5, y1 + 1, cz + 1.5, shadeColor(color, -0.2));
    if (o.plate) g.box(cx + W / 2 - 0.6, y0, cz - 2.5, cx + W / 2 + 1.2, y1, cz + 2.5, o.plate);
  });
  return { name: 'headband', attach: 'head', def, pos: [0, 0, 0] };
}

function headbandTails(S, color, len = 1) {
  const [W, H] = S.head;
  const kx = 1 - W * 0.05, ky = H / 2 + 1.5 + H * 0.2 - 1.5;
  return {
    attach: 'head', mirrorZ: false, stiff: 0.06, damp: 0.9, grav: -2.2,
    rest: [[kx - 1, ky, -1.2], [kx - 5 * len, ky - 2, -2.2], [kx - 9 * len, ky - 4, -3], [kx - 13 * len, ky - 7, -3.5], [kx - 16 * len, ky - 10, -4]].map((p) => V(p)),
    seg: (i) => { const g = new VoxelGrid(3, 4, 1); g.box(0, 0, 0, 3, 4, 1, (x, y) => (y % 2 ? color : shadeColor(color, -0.15))); return { grid: g, pivot: [1.5, 0, 0.5], lenScale: 4 * VS }; },
  };
}

// ---------------------------------------------------------------- JIM
const JIM_PAL = {
  head: 0x3fae5c, carapace: 0x38a055, face: 0x2f8a4a, rostrum: 0x5fd07a, mouth: 0x23101a,
  headPattern: { type: 'leopard', color: 0x1c4a28, ring: 0x2f8a4a, density: 0.07 },
  body: 0x2e9a74, edge: 0xf0d84a, belly: 0xa8e6b8, bodyPattern: null,
  merus: 0x3fae5c, meralSpot: 0xff5a8a, propodus: 0xff6a2a, club: 0xff4a2a, dactyl: 0xc2331a,
  leg: 0xff7a32, legDark: 0xc2431a, claw: 0xfff2d0, swim: 0xff8a3a,
  eyeTop: 0x8ad070, eyeBot: 0x5aa050, eyeBand: 0xe8604a, pupil: 0x101418, stalk: 0x3fae5c,
  antenna: 0xff6a4a, antennaTip: 0xffd04a, scale: 0xff8a2a, scaleEdge: 0xffd04a,
  fan: 0x2a6fd0, fan2: 0x3a8fe8, fanEdge: 0xff6a2a, mouthparts: 0xff8a3a, barb: 0xffffff,
};
const JIM_SHAPE = {
  bodyZ: 12, pel: [12, 7], s1: [12, 10.5], s2: [14, 14], head: [14, 12, 12],
  pelPlates: [{ h: 3.5, rx: 5.6, rz: 6 }, { h: 3.5, rx: 6, rz: 6.3, dx: -0.3 }],
  t1Plates: [{ h: 3.5, rx: 5.5, rz: 6.1 }, { h: 3.5, rx: 5.8, rz: 6.3, dx: -0.4 }, { h: 3.5, rx: 6.0, rz: 6.5, dx: -0.9 }],
  t2Plates: [{ h: 3.5, rx: 6.3, rz: 6.7, dx: -1.2 }, { h: 3.5, rx: 6.6, rz: 6.9, dx: -1.6 }, { h: 3.5, rx: 6.4, rz: 6.7, dx: -1.8 }, { h: 3, rx: 5.4, rz: 5.9, dx: -1.5 }],
  dome: { dx: -2.6, dy: 9.5, rx: 6.4, ry: 6.8, rz: 7.1 }, headMount: [4.6, 0.52], shoulder: [3.6, 0.2],
  eyeR: 4.1, stalkL: 4, armL1: 8, armL2: 7, armR: [2.7, 2.3], clubR: 3.4,
  thighL: 8.5, shinL: 8, legR: [2.6, 2.1], legSpread: 3.6, footH: 2, tail1L: 8, tail2L: 6, tailR: 3.4,
  wraps: 0xf5f0e0, legBands: 3, sparkle: false,
};

const JIM_SKINS = {
  default: { pal: {}, acc: (S, spec) => { spec.accessories.push(headbandAcc(S, 0xd8322a)); spec.chains.push(headbandTails(S, 0xd8322a)); } },
  shonen: {
    pal: { head: 0xff8a2a, carapace: 0xff7a1a, face: 0xd8621a, rostrum: 0xffb060, headPattern: null, body: 0x2a4fb0, edge: 0xffd04a, belly: 0xffe0b0, merus: 0xff8a2a, propodus: 0x2a4fb0, club: 0x2a4fb0, leg: 0x2a4fb0, legDark: 0x14286a, stalk: 0xff8a2a, antenna: 0xffb060, scale: 0xffd04a, scaleEdge: 0xffffff, fan: 0xff8a2a, fan2: 0xffa040, fanEdge: 0x2a4fb0, swim: 0x2a4fb0 },
    shape: { wraps: 0x1a1a24 },
    acc: (S, spec) => {
      spec.accessories.push(headbandAcc(S, 0x2a4fb0, { plate: 0xcfd8df }));
      spec.chains.push(headbandTails(S, 0x2a4fb0, 1.2));
      // spiky anime crest
      const [W, H, Z] = S.head;
      spec.accessories.push({ name: 'crest', attach: 'head', pos: V([W * 0.1, H * 0.9, 0]), def: acc(16, 12, 12, [8, 0, 6], (g) => {
        const spikes = [[8, 0, 6, -6, 9, 0], [8, 0, 6, -2, 11, -3], [8, 0, 6, -2, 11, 3], [8, 0, 6, 3, 10, 0], [8, 0, 6, -7, 6, -4], [8, 0, 6, -7, 6, 4]];
        for (const s of spikes) g.capsule(s[0], s[1], s[2], s[0] + s[3], s[1] + s[4], s[2] + s[5], 2.4, 0.5, (x, y) => (y > 7 ? 0xffd04a : 0xff8a1a));
      }), spring: [140, 9], springGain: 0.6 });
    },
  },
  luchador: {
    pal: { head: 0x6a2ab0, carapace: 0x5a2098, face: 0xf0c33c, rostrum: 0xf0c33c, headPattern: null, body: 0x4a1c80, edge: 0xf0c33c, belly: 0xf5e6c4, merus: 0x6a2ab0, meralSpot: 0xf0c33c, propodus: 0xf0c33c, club: 0xf0c33c, leg: 0x6a2ab0, legDark: 0x3a1460, stalk: 0xf0c33c, antenna: 0xf0c33c, scale: 0xd8322a, scaleEdge: 0xf0c33c, fan: 0xd8322a, fan2: 0xff4a3a, fanEdge: 0xf0c33c, swim: 0xf0c33c },
    shape: { wraps: 0xf0c33c },
    acc: (S, spec) => {
      const [W, H, Z] = S.head;
      // lucha mask: covers the head with flame pattern around the eyes
      spec.accessories.push({ name: 'mask', attach: 'head', pos: [0, 0, 0], def: acc(W + 6, H + 4, Z + 4, [2, 1.5, (Z + 4) / 2], (g) => {
        const cx = W / 2 + 1, cy = H / 2 + 1.5, cz = (Z + 4) / 2;
        g.ellipsoid(cx, cy, cz, W / 2 + 0.7, H / 2 + 0.7, Z / 2 + 0.7, (x, y, z) => {
          const fx = (x + 0.5 - cx) / (W / 2), fy = (y + 0.5 - cy) / (H / 2), fz = (z + 0.5 - cz) / (Z / 2);
          if (fx > 0.55 && fy < -0.2) return null; // mouth opening
          if (Math.abs(fz) > 0.25 && Math.abs(fz) < 0.75 && fy > -0.1 && fy < 0.45 && fx > 0.3) return 0xf0c33c; // flame eye trim
          if (Math.abs(fz) < 0.12) return 0xd8322a; // center stripe
          return y % 3 === 0 ? 0x7a34c8 : 0x6a2ab0;
        });
        g.ellipsoid(cx, cy, cz, W / 2 - 0.2, H / 2 - 0.2, Z / 2 - 0.2, null, { mode: 'carve' });
      }) });
      // cape (soft chain-like accessory on spine2) - use a stiff accessory with spring
      const [s2w, s2h] = S.s2;
      spec.accessories.push({ name: 'cape', attach: 'spine2', pos: V([-s2w * 0.45, s2h * 0.75, 0]), rot: [0, 0, -0.25], spring: [70, 6], springGain: 1.6, def: acc(4, 22, 18, [3, 21, 9], (g) => {
        g.box(0, 0, 0, 3, 22, 18, (x, y, z) => {
          const edge = y < 2 || z < 1 || z > 16;
          if (y < 6 && (z + y) % 4 === 0) return null;
          return edge ? 0xf0c33c : (x === 2 ? 0xd8322a : 0x9c1f1f);
        });
      }) });
    },
  },
  abyss: {
    pal: { head: 0x1a2048, carapace: 0x141838, face: 0x10142a, rostrum: 0x2a3060, headPattern: { type: 'flame', color: 0xff4fd0, e: 200, h: 5 }, body: 0x161c40, edge: 0xff4fd0, belly: 0x2a3060, merus: 0x1a2048, meralSpot: 0xff8a2a, propodus: 0x2a1a48, club: 0xff4fd0, leg: 0x1a2048, legDark: 0x0c1028, stalk: 0x1a2048, antenna: 0xff4fd0, antennaTip: 0xffb0f0, scale: 0xff8a2a, scaleEdge: 0xff4fd0, fan: 0x2a1a48, fan2: 0x3a2a68, fanEdge: 0xff4fd0, eyeTop: 0xffd0f0, eyeBot: 0xd090c0, eyeBand: 0xff8a2a, swim: 0x2a1a48, bodyPattern: { type: 'flame', color: 0xff6ad8, e: 160, h: 4 }, legPattern: { type: 'spots', color: 0x49c2bd, density: 0.08 } },
    shape: { wraps: 0x2a1a48 },
    acc: (S, spec) => { spec.accessories.push(headbandAcc(S, 0xff4fd0, { emissive: 160 })); spec.chains.push(headbandTails(S, 0xff4fd0)); },
  },
  neon: {
    pal: { head: 0x2a2e36, carapace: 0x22262e, face: 0x1a1d24, rostrum: 0x3a404a, headPattern: { type: 'circuit', color: 0x2ff0ff, e: 230 }, body: 0x262a32, edge: 0x2ff0ff, belly: 0x3a404a, merus: 0x2a2e36, meralSpot: 0x2ff0ff, propodus: 0x30343e, club: 0x2ff0ff, dactyl: 0x1a1d24, leg: 0x2a2e36, legDark: 0x16181e, stalk: 0x3a404a, antenna: 0x2ff0ff, antennaTip: 0xffffff, scale: 0xff3a8a, scaleEdge: 0x2ff0ff, fan: 0x22262e, fan2: 0x2a2e36, fanEdge: 0x2ff0ff, eyeTop: 0xb0f8ff, eyeBot: 0x60c8d8, eyeBand: 0xff3a8a, swim: 0x30343e, bodyPattern: { type: 'circuit', color: 0x2ff0ff, e: 220 }, legPattern: { type: 'circuit', color: 0xff3a8a, e: 200 } },
    shape: { wraps: 0x16181e },
    acc: (S, spec) => {
      spec.accessories.push(headbandAcc(S, 0x2ff0ff, { emissive: 255, y0: 0.15, y1: 0.42 }));
      spec.chains.push(headbandTails(S, 0x2ff0ff, 1.3));
      spec.chains[spec.chains.length - 1].seg = (i) => { const g = new VoxelGrid(2, 4, 1); g.box(0, 0, 0, 2, 4, 1, () => ({ c: 0x2ff0ff, e: 255 })); return { grid: g, pivot: [1, 0, 0.5], lenScale: 4 * VS }; };
    },
  },
};

// ---------------------------------------------------------------- BRUTUS
const BRUTUS_PAL = {
  head: 0xe8dcc0, carapace: 0xd8c8a0, face: 0xc8b890, rostrum: 0xf5ecd8, mouth: 0x3a1a10,
  headPattern: { type: 'stripes', color: 0x3a3028, width: 2 },
  body: 0xe0d2b0, edge: 0xf5ecd8, belly: 0xf8f0dc, bodyPattern: null, band: 0x3a3028, armBand: 0x4a4036, legBand: 0x4a4036,
  merus: 0xe0d2b0, meralSpot: 0x8a6a4a, propodus: 0xd8c8a0, spear: 0xf0e6cc, barb: 0xffffff,
  leg: 0xd8c8a0, legDark: 0x6a5a48, claw: 0xffffff, swim: 0xc8b890,
  eyeTop: 0x8aa8c8, eyeBot: 0x6a88a8, eyeBand: 0x3a4a6a, pupil: 0x101418, stalk: 0xd8c8a0,
  antenna: 0xc8b890, scale: 0xa89070, scaleEdge: 0x40362c, fan: 0xd8c8a0, fan2: 0xe8dcc0, fanEdge: 0x40362c, mouthparts: 0xa89070,

};
const BRUTUS_SHAPE = {
  bodyZ: 18, pel: [16, 8], s1: [21, 15], s2: [19, 16], head: [15, 12, 14], bellyAt: 0.3,
  pelPlates: [{ h: 4, rx: 8, rz: 9 }, { h: 4, rx: 8.6, rz: 9.5, dx: -0.3 }],
  t1Plates: [{ h: 5, rx: 9.6, rz: 10 }, { h: 5, rx: 10.4, rz: 10.6, dx: 0.3 }, { h: 5, rx: 10, rz: 10.2, dx: 0 }],
  t2Plates: [{ h: 4, rx: 9.4, rz: 9.6, dx: -1 }, { h: 4, rx: 9.4, rz: 9.6, dx: -1.8 }, { h: 4, rx: 8.6, rz: 8.9, dx: -2.4 }, { h: 3.5, rx: 7, rz: 7.6, dx: -2.6 }],
  dome: { dx: -3.6, dy: 10.5, rx: 8.6, ry: 7.4, rz: 9.4 }, headMount: [6.4, 0.5], shoulder: [6, 0.28],
  eyeR: 3.7, stalkL: 4, armL1: 10, armL2: 8, armR: [3.4, 2.8], spear: true, spearL: 15, clubR: 3.4, armBands: 4,
  thighL: 6, shinL: 5.5, legR: [3.6, 3], legSpread: 6, footH: 2, footL: 8, tail1L: 9, tail2L: 7, tailR: 4.5, legBands: 2, antL: 1.1,
};
function bellyAcc(S, pal, o = {}) {
  const [W, H] = S.s1;
  return { name: 'belly', attach: 'spine1', pos: V([W * 0.18, H * 0.42, 0]), spring: [120, 5], springGain: 2.4, springAxis: 'z', def: acc(W + 4, H + 2, S.bodyZ + 6, [W / 2, H / 2 + 1, (S.bodyZ + 6) / 2], (g) => {
    const cx = W / 2 + 2, cy = H / 2 + 1, cz = (S.bodyZ + 6) / 2;
    g.ellipsoid(cx, cy, cz, W / 2 + 0.5, H / 2, S.bodyZ / 2 + 2, (x, y, z) => {
      const f = (x + 0.5 - cx) / (W / 2);
      if (f < -0.1) return null;
      if (o.core && Math.abs(y + 0.5 - cy) < 2.5 && Math.abs(z + 0.5 - cz) < 2.5 && f > 0.7) return { c: o.core, e: 255 };
      let c = o.belly ?? pal.belly;
      if (y % 3 === 0) c = shadeColor(c, -0.12);
      if (o.pattern) { const pc = patternColor(o.pattern, c, x, y, z); if (typeof pc === 'object') return pc; c = pc; }
      return grad(c, y, H + 2, 0.15);
    });
    // belly button
    g.set(Math.floor(cx + W / 2), Math.floor(cy - 1), Math.floor(cz), shadeColor(o.belly ?? pal.belly, -0.4));
  }) };
}
const BRUTUS_SKINS = {
  default: { pal: {}, acc: (S, spec, pal) => spec.accessories.push(bellyAcc(S, pal)) },
  chef: {
    pal: { head: 0xf5f0e6, carapace: 0xffffff, face: 0xe8e0d0, headPattern: null, body: 0xf5f0e6, bodyPattern: { type: 'stripes', color: 0xd8322a, width: 4 }, backPattern: null, edge: 0xd8322a, merus: 0xf5f0e6, propodus: 0xe8e0d0, spear: 0xcfd8df, barb: 0x9aa6b2, leg: 0x2a2a30, legDark: 0x16161a, armPattern: null, legPattern: null, fan: 0xf5f0e6, fanEdge: 0xd8322a },
    acc: (S, spec, pal) => {
      spec.accessories.push(bellyAcc(S, pal, { belly: 0xffffff }));
      spec.accessories.push(headbandAcc(S, 0xffffff, { y0: 0.1, y1: 0.32, plate: 0xd8322a }));
      const [W, H] = S.head;
      spec.accessories.push({ name: 'toque', attach: 'head', pos: V([W * 0.2, H * 0.85, 0]), spring: [120, 8], springGain: 0.8, def: acc(14, 16, 14, [7, 0, 7], (g) => {
        g.cylinder('y', 7, 7, 0, 7, 5, 0xffffff);
        g.ellipsoid(7, 10, 7, 6.5, 5, 6.5, (x, y, z) => (vhash(x, y, z, 2) < 0.2 ? 0xe8e8e8 : 0xffffff));
      }) });
    },
  },
  royal: {
    pal: { edge: 0xf0c33c, meralSpot: 0xd8322a, spear: 0xf0c33c, barb: 0xfff08a, legDark: 0x6a2ab0 },
    acc: (S, spec, pal) => {
      spec.accessories.push(bellyAcc(S, pal, { core: 0xd8322a }));
      const [W, H] = S.head;
      spec.accessories.push({ name: 'crown', attach: 'head', pos: V([W * 0.25, H * 0.88, 0]), rot: [0, 0, -0.15], spring: [160, 9], springGain: 0.6, def: acc(12, 8, 12, [6, 0, 6], (g) => {
        g.cylinder('y', 6, 6, 0, 3, 5, 0xf0c33c);
        g.cylinder('y', 6, 6, 0, 3, 4, null, { mode: 'carve' });
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const x = 6 + Math.cos(a) * 4.5, z = 6 + Math.sin(a) * 4.5; g.box(x - 0.5, 3, z - 0.5, x + 0.5, 6, z + 0.5, 0xf0c33c); g.set(Math.floor(x), 6, Math.floor(z), i % 2 ? 0xd8322a : 0x4f8fff, 120); }
        g.box(1, 0, 1, 11, 1, 11, 0xfff08a, { mode: 'paint' });
      }) });
      const [s2w, s2h] = S.s2;
      spec.accessories.push({ name: 'cloak', attach: 'spine2', pos: V([-s2w * 0.42, s2h * 0.8, 0]), rot: [0, 0, -0.35], spring: [60, 6], springGain: 1.2, def: acc(4, 24, 26, [3, 23, 13], (g) => {
        g.box(0, 0, 0, 3, 24, 26, (x, y, z) => (y > 20 ? (vhash(x, y, z, 1) < 0.5 ? 0xffffff : 0xe8e8f0) : (y < 2 ? 0xf0c33c : (x === 2 ? 0x6a2ab0 : 0x4a1c80))));
      }) });
    },
  },
  sumo: {
    pal: { head: 0xf0c8a8, carapace: 0xe8b898, face: 0xe0a888, headPattern: null, body: 0xf0c8a8, bodyPattern: null, backPattern: null, edge: 0xffd8c0, belly: 0xffe0cc, merus: 0xf0c8a8, propodus: 0xe8b898, leg: 0xf0c8a8, legDark: 0xc08870, armPattern: null, legPattern: null, scale: 0xd8322a, fan: 0xf0c8a8, fanEdge: 0xc08870 },
    acc: (S, spec, pal) => {
      spec.accessories.push(bellyAcc(S, pal, { belly: 0xffe0cc }));
      const [W, H] = S.head;
      // top-knot
      spec.accessories.push({ name: 'topknot', attach: 'head', pos: V([W * 0.05, H * 0.9, 0]), rot: [0, 0, 0.6], spring: [120, 7], def: acc(8, 6, 5, [1, 1, 2.5], (g) => { g.capsule(1, 1, 2.5, 6, 4, 2.5, 1.4, 1.8, 0x1a1418); }) });
      // mawashi belt on pelvis with white rope + shide zigzags
      const [pw, ph] = S.pel;
      spec.accessories.push({ name: 'mawashi', attach: 'pelvis', pos: [0, 0, 0], def: acc(pw + 6, ph + 6, S.bodyZ + 8, [(pw + 6) / 2, (ph + 6) / 2, (S.bodyZ + 8) / 2], (g) => {
        const cx = (pw + 6) / 2, cy = (ph + 6) / 2, cz = (S.bodyZ + 8) / 2;
        g.ellipsoid(cx, cy, cz, pw / 2 + 1.5, ph / 2 + 1.5, S.bodyZ / 2 + 2, (x, y) => (y + 0.5 > cy + 1.5 ? 0xffffff : 0x1c2a6a));
        g.ellipsoid(cx, cy, cz, pw / 2 + 0.2, ph / 2 + 3, S.bodyZ / 2 + 0.6, null, { mode: 'carve' });
        for (let i = -2; i <= 2; i++) g.box(cx + pw / 2 + 1, cy - 4, cz + i * 3 - 0.5, cx + pw / 2 + 2, cy + 1, cz + i * 3 + 0.5, (x, y) => (y % 2 ? 0xffffff : 0xf5ecd8));
      }) });
    },
  },
  mecha: {
    pal: { head: 0x8a96a2, carapace: 0x6b7682, face: 0x3a424c, rostrum: 0xff3a1a, headPattern: { type: 'checker', color: 0x7a8692 }, body: 0x7a8692, edge: 0xffb040, belly: 0x9aa6b2, bodyPattern: null, backPattern: { type: 'checker', color: 0x6b7682 }, merus: 0x6b7682, meralSpot: 0xffb040, propodus: 0x464e58, spear: 0xcfd8df, barb: 0xff6a1a, leg: 0x464e58, legDark: 0x2a2f36, claw: 0xffb040, stalk: 0x464e58, eyeTop: 0xff6a4a, eyeBot: 0xd8322a, eyeBand: 0xffd040, pupil: 0xffffff, antenna: 0xcfd8df, antennaTip: 0xff3a1a, scale: 0xffb040, scaleEdge: 0x2a2f36, fan: 0x6b7682, fan2: 0x8a96a2, fanEdge: 0xffb040, armPattern: null, legPattern: null },
    acc: (S, spec, pal) => {
      spec.accessories.push(bellyAcc(S, pal, { belly: 0x9aa6b2, core: 0xff7a1a }));
      const [s2w, s2h] = S.s2;
      for (const z of [-4, 4]) spec.accessories.push({ name: 'exhaust' + z, attach: 'spine2', pos: V([-s2w * 0.3, s2h * 0.85, z]), rot: [0, 0, 0.3], def: acc(5, 9, 5, [2.5, 0, 2.5], (g) => { g.cylinder('y', 2.5, 2.5, 0, 8, 2, 0x464e58); g.cylinder('y', 2.5, 2.5, 7, 9, 2.4, 0x2a2f36); g.set(2, 8, 2, 0xff6a1a, 255); }) });
      const [W, H] = S.head;
      spec.accessories.push({ name: 'visor', attach: 'head', pos: [0, 0, 0], def: acc(W + 6, H + 4, S.head[2] + 4, [2, 1.5, (S.head[2] + 4) / 2], (g) => { const cx = W / 2 + 1, cy = H / 2 + 1.5, cz = (S.head[2] + 4) / 2; g.box(cx + W / 2 - 1, cy + 0.5, cz - 4, cx + W / 2 + 1, cy + 2.5, cz + 4, { c: 0xff3a1a, e: 255 }); }) });
      spec.extras.find((e) => e.name === 'swim').def = acc(6, 3, S.bodyZ + 2, [5.5, 1.5, (S.bodyZ + 2) / 2], (g) => g.box(0, 0, 1, 6, 2, S.bodyZ + 1, 0x2a2f36));
    },
  },
};

// ---------------------------------------------------------------- BOBBY
const BOBBY_PAL = {
  head: 0x9a6ad8, carapace: 0x8a5ac8, face: 0x7a4ab0, rostrum: 0xb88ae8, mouth: 0x2a1030,
  headPattern: { type: 'spots', color: 0x553088, density: 0.14 },
  body: 0x8a5ac8, edge: 0xc8f05a, belly: 0xd8c0f0, bodyPattern: { type: 'spots', color: 0x553088, density: 0.12 },
  merus: 0x9a6ad8, meralSpot: 0x3fd16a, propodus: 0xb08ae0, club: 0xc8f05a, dactyl: 0x8ab030,
  leg: 0xa87ae0, legDark: 0x6a3aa8, claw: 0xfff2d0, swim: 0xc8f05a,
  eyeTop: 0xf0e8c0, eyeBot: 0xd8c898, eyeBand: 0xc8f05a, pupil: 0x101418, stalk: 0x9a6ad8,
  antenna: 0xc8f05a, antennaTip: 0xff8a2a, scale: 0xc8f05a, scaleEdge: 0x553088,
  fan: 0x9a6ad8, fan2: 0xb88ae8, fanEdge: 0xc8f05a, mouthparts: 0xc8a0f0,
};
const BOBBY_SHAPE = {
  bodyZ: 9, pel: [9, 6], s1: [9, 6], s2: [10, 9], head: [13, 11, 11],
  pelPlates: [{ h: 3, rx: 4.5, rz: 4.8 }, { h: 3, rx: 4.8, rz: 5, dx: -0.2 }],
  t1Plates: [{ h: 3, rx: 4.5, rz: 4.8 }, { h: 3, rx: 4.8, rz: 5, dx: -0.3 }],
  t2Plates: [{ h: 3, rx: 5.2, rz: 5.4, dx: -0.6 }, { h: 3, rx: 5.4, rz: 5.5, dx: -0.9 }, { h: 2.5, rx: 4.6, rz: 4.8, dx: -1 }],
  dome: { dx: -2, dy: 5.5, rx: 5, ry: 4.8, rz: 5.6 }, headMount: [3.4, 0.45], shoulder: [3, 0.25],
  eyeR: 4, eyeRL: 5, eyeScaleL: 1, eyeScaleR: 1, stalkL: 5, stalkSplay: 0.45, armL1: 6, armL2: 5, armR: [2, 1.7], clubR: 2.5,
  thighL: 5.5, shinL: 5, legR: [1.9, 1.5], legSpread: 2.6, footH: 2, footL: 6, tail1L: 6, tail2L: 4, tailR: 2.6, antL: 0.8, pupil: 1.3,
};
function coneAcc(S, o = {}) {
  const [W, H] = S.head;
  const h = o.h ?? 16, base = o.base ?? 11;
  return { name: 'cone', attach: 'head', pos: V([W * 0.35, H * 0.82, 0]), rot: [0.15, 0, -0.32], spring: [90, 5], springGain: 1.8, def: acc(base + 2, h + 2, base + 2, [(base + 2) / 2, 0, (base + 2) / 2], (g) => {
    const c = (base + 2) / 2;
    // square base
    if (o.squareBase !== false) g.box(2, 0, 2, base, 2, base, (x, y) => (y === 0 ? shadeColor(o.baseColor ?? 0x3a3236, -0.2) : o.baseColor ?? 0x3a3236));
    g.cylinder('y', c, c, 2, h, base * 0.4, (x, y, z) => {
      if (o.paint) return o.paint(x, y, z);
      const band = (y >= 6 && y <= 7) || (y >= 11 && y <= 12);
      return band ? { c: 0xf5f8ff, e: 40 } : (vhash(x, y, z, 4) < 0.08 ? 0xff6a1a : 0xff7a1a);
    }, {}, base * 0.08);
    if (o.cracked) g.repaint((x, y, z) => (y > h - 6 && vhash(x, y, z, 7) < 0.6 ? null : (y > h - 8 && vhash(x, y, z, 9) < 0.25 ? 0x2a1a10 : undefined)));
    if (o.extra) o.extra(g, c, h);
  }) };
}
const BOBBY_SKINS = {
  default: { pal: {}, acc: (S, spec) => spec.accessories.push(coneAcc(S)) },
  party: {
    pal: { head: 0x3fc8b8, carapace: 0x2fb0a0, face: 0x2a9a8a, rostrum: 0x6ae8d8, headPattern: { type: 'spots', color: 0xff6fb0, density: 0.1 }, body: 0x2fb0a0, bodyPattern: { type: 'spots', color: 0xffcf3a, density: 0.1 }, edge: 0xff6fb0, merus: 0x3fc8b8, propodus: 0x6ae8d8, club: 0xff6fb0, leg: 0x3fc8b8, legDark: 0x1a7a70, stalk: 0x3fc8b8, antenna: 0xffcf3a, fan: 0xff6fb0, fanEdge: 0xffcf3a, swim: 0xffcf3a },
    acc: (S, spec) => spec.accessories.push(coneAcc(S, { squareBase: false, h: 15, base: 12, paint: (x, y, z) => (vhash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), 3) < 0.25 ? 0xffcf3a : 0xff4fa0), extra: (g, c, h) => { g.sphere(c, h + 0.5, c, 2.3, (x, y, z) => (vhash(x, y, z, 1) < 0.5 ? 0xffffff : 0x9cf0ff)); } })),
  },
  icecream: {
    pal: { head: 0x9af0d0, carapace: 0x8ae0c0, face: 0x7ad0b0, rostrum: 0xc0fff0, headPattern: { type: 'spots', color: 0xffb6d9, density: 0.08 }, body: 0x8ae0c0, bodyPattern: null, edge: 0xffb6d9, belly: 0xf0fff8, merus: 0x9af0d0, propodus: 0xc0fff0, club: 0xffb6d9, leg: 0x9af0d0, legDark: 0x4aa080, stalk: 0x9af0d0, antenna: 0xffb6d9, fan: 0xffb6d9, fanEdge: 0x9af0d0, swim: 0xffb6d9 },
    acc: (S, spec) => spec.accessories.push(coneAcc(S, { squareBase: false, h: 14, base: 12, paint: (x, y, z) => ((x + y + z) % 3 === 0 ? 0xb07a3a : 0xd8a05e), extra: (g, c, h) => { g.ellipsoid(c, 2, c, 5.5, 3, 5.5, (x, y, z) => ((x + z) % 4 < 2 ? 0xffb6d9 : 0xfff0f8)); g.set(Math.floor(c), 0, Math.floor(c), 0xd8322a); } })),
  },
  pumpkin: {
    pal: { head: 0x2a1a3a, carapace: 0x241430, face: 0x1a1028, rostrum: 0x3a2a4a, headPattern: { type: 'spots', color: 0xff8a2a, density: 0.05 }, body: 0x241430, bodyPattern: null, edge: 0xff8a2a, belly: 0x3a2a4a, merus: 0x2a1a3a, meralSpot: 0xff8a2a, propodus: 0x3a2a4a, club: 0xff8a2a, leg: 0x2a1a3a, legDark: 0x140a1c, stalk: 0x2a1a3a, antenna: 0xff8a2a, fan: 0x2a1a3a, fanEdge: 0xff8a2a, swim: 0xff8a2a, eyeTop: 0xfff0c0, eyeBot: 0xffd890 },
    acc: (S, spec) => {
      const [W, H] = S.head;
      spec.accessories.push({ name: 'cone', attach: 'head', pos: V([W * 0.3, H * 0.75, 0]), rot: [0.1, 0, -0.2], spring: [90, 5], springGain: 1.6, def: acc(15, 14, 15, [7.5, 0, 7.5], (g) => {
        g.ellipsoid(7.5, 6, 7.5, 7, 6, 7, (x, y, z) => {
          const fx = x + 0.5 - 7.5, fz = z + 0.5 - 7.5;
          const a = Math.atan2(fz, fx);
          const ridge = Math.abs(Math.sin(a * 4)) < 0.25;
          // carved face on the front (+x)
          if (fx > 5 && ((y === 7 || y === 8) && Math.abs(fz) > 1.5 && Math.abs(fz) < 3.5)) return { c: 0xffd040, e: 255 };
          if (fx > 5 && y >= 3 && y <= 4 && Math.abs(fz) < 4) return { c: 0xffd040, e: 255 };
          return ridge ? 0xd8621a : 0xff8a1a;
        });
        g.box(6.5, 11, 6.5, 8.5, 14, 8.5, 0x3a6a1a);
      }) });
    },
  },
  wizard: {
    pal: { head: 0x3a2a8a, carapace: 0x30207a, face: 0x281a6a, rostrum: 0x4a3aa8, headPattern: { type: 'stars', color: 0xfff08a, density: 0.05 }, body: 0x30207a, bodyPattern: { type: 'stars', color: 0xfff08a, density: 0.04 }, edge: 0xf0c33c, belly: 0x5a4ab8, merus: 0x3a2a8a, meralSpot: 0xf0c33c, propodus: 0x4a3aa8, club: 0xf0c33c, leg: 0x3a2a8a, legDark: 0x1a1048, stalk: 0x3a2a8a, antenna: 0xf0c33c, antennaTip: 0xffffff, fan: 0x3a2a8a, fanEdge: 0xf0c33c, swim: 0xf0c33c },
    acc: (S, spec) => {
      spec.accessories.push(coneAcc(S, { squareBase: false, h: 19, base: 15, paint: (x, y, z) => (vhash(x, y, z, 5) < 0.06 ? { c: 0xfff08a, e: 255 } : (y < 3 ? 0xf0c33c : 0x2a2a9a)), extra: (g, c) => { g.cylinder('y', c, c, 0, 1.5, c - 0.5, 0x2a2a9a); } }));
      const [W, H] = S.head;
      // flowing beard
      spec.accessories.push({ name: 'beard', attach: 'head', pos: V([W * 0.75, H * 0.1, 0]), rot: [0, 0, 0.2], spring: [80, 6], springGain: 1.4, def: acc(6, 12, 8, [2, 11, 4], (g) => { g.ellipsoid(2.5, 6, 4, 2.5, 6, 3.5, (x, y, z) => (vhash(x, y, z, 6) < 0.3 ? 0xe8e8f0 : 0xffffff)); g.box(1, 0, 3, 3, 3, 5, 0xffffff); }) });
    },
  },
};
// demon form overrides (applied on top of whichever skin)
const BOBBY_DEMON = {
  head: 0x1a1024, carapace: 0x140a1c, face: 0x0c0612, rostrum: 0x2a1a3a, headPattern: { type: 'spots', color: 0x3a0a1a, density: 0.15 },
  body: 0x140a1c, bodyPattern: { type: 'spots', color: 0x3a0a1a, density: 0.15 }, edge: 0x6a0a2a, belly: 0x2a1a30,
  merus: 0x1a1024, meralSpot: { c: 0xff1a3a, e: 255 }, propodus: 0x241430, club: 0x2a0a1a, dactyl: 0x140a10,
  leg: 0x1a1024, legDark: 0x0a0610, swim: 0x2a0a1a, stalk: 0x1a1024,
  eyeTop: 0xff2a3a, eyeBot: 0xd81a2a, eyeBand: 0xffffff, pupil: 0xffffff,
  antenna: 0x3a0a1a, antennaTip: 0xff1a3a, scale: 0x2a0a1a, scaleEdge: 0xff1a3a, fan: 0x140a1c, fan2: 0x1a1024, fanEdge: 0x6a0a2a, mouthparts: 0x3a0a1a,
};

// ---------------------------------------------------------------- MIMI
const MIMI_PAL = {
  head: 0xffa8cc, carapace: 0xff98c0, face: 0xff88b4, rostrum: 0xffd0e4, mouth: 0x8a1a4a,
  headPattern: null, body: 0xff98c0, edge: 0xffffff, belly: 0xfff0f6, bodyPattern: null,
  merus: 0xffa8cc, meralSpot: 0xff4f9a, propodus: 0xffc0dc, club: 0xff6fb0,
  leg: 0xffa8cc, legDark: 0xd86a9a, claw: 0xffffff, swim: 0xffd0e4,
  eyeTop: 0x5a2a6a, eyeBot: 0x8a4aa8, eyeBand: 0xff6fb0, pupil: 0x1a0a20, stalk: 0xffa8cc, lash: 0x2a1020,
  antenna: 0xff6fb0, antennaTip: 0xffffff, scale: 0xffd0e4, scaleEdge: 0xff6fb0,
  fan: 0xff88b4, fan2: 0xffb0d0, fanEdge: 0xffffff, mouthparts: 0xffc0dc,
  skirt: 0xff6fb0, skirt2: 0xffffff, bow: 0xff3a8a, bowCenter: 0xffd0e4,
};
const MIMI_SHAPE = {
  bodyZ: 10, pel: [10, 6], s1: [10, 10], s2: [11, 10], head: [13, 11, 12],
  pelPlates: [{ h: 3, rx: 4.8, rz: 5.2 }, { h: 3, rx: 5, rz: 5.4, dx: -0.2 }],
  t1Plates: [{ h: 3.5, rx: 4.3, rz: 4.7 }, { h: 3.5, rx: 4.5, rz: 4.9, dx: -0.3 }, { h: 3, rx: 4.8, rz: 5.1, dx: -0.6 }],
  t2Plates: [{ h: 3.5, rx: 5.3, rz: 5.7, dx: -0.8 }, { h: 3.5, rx: 5.5, rz: 5.7, dx: -1.1 }, { h: 3, rx: 4.7, rz: 5.1, dx: -1.2 }],
  dome: { dx: -2.2, dy: 7, rx: 5.2, ry: 5.2, rz: 5.9 }, headMount: [3.8, 0.52], shoulder: [3.2, 0.26],
  eyeR: 4.4, stalkL: 4, stalkSplay: 0.3, armL1: 7, armL2: 6, armR: [2.1, 1.8], clubR: 2.6,
  thighL: 8.5, shinL: 8, legR: [2, 1.6], legSpread: 3, footH: 2, tail1L: 7, tail2L: 5, tailR: 2.8,
  sparkle: true, lashes: true, pupil: 2.2, antL: 0.95,
  mittens: { main: 0xff6fb0, cuff: 0xffffff, band: 0xffd0e4 }, shoe: 0xffffff, shoeSole: 0xff6fb0,
};
function skirtAcc(S, pal, o = {}) {
  const [pw, ph] = S.pel;
  const R = pw / 2 + 3, Rz = S.bodyZ / 2 + 3;
  return { name: 'skirt', attach: 'hips', pos: V([0, -1, 0]), spring: [110, 7], springGain: 1.1, springAxis: 'x', def: acc(Math.ceil(R * 2 + 4), 9, Math.ceil(Rz * 2 + 4), [R + 2, 6, Rz + 2], (g) => {
    const cx = R + 2, cz = Rz + 2;
    for (let layer = 0; layer < 3; layer++) {
      const y0 = 6 - layer * 2.2, r = R - 2.5 + layer * 1.3, rz = Rz - 2.5 + layer * 1.3;
      g.cylinder('y', cx, cz, y0 - 2.5, y0 + 0.5, r, (x, y, z) => {
        const a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
        const scallop = Math.sin(a * 9) > 0.3;
        if (y < y0 - 1.6 && !scallop) return null;
        const col = layer % 2 === 0 ? (o.c1 ?? pal.skirt) : (o.c2 ?? pal.skirt2);
        return y % 2 ? col : shadeColor(col, 0.1);
      }, {}, r);
    }
    g.cylinder('y', cx, cz, 0, 9, R - 4.5, null, { mode: 'carve' });
  }) };
}
function bowsAcc(S, color, center, size = 1) {
  const [W, H, Z] = S.head;
  const out = [];
  for (const z of [-1, 1]) {
    out.push({ name: 'bow' + z, attach: 'head', pos: V([W * 0.62, H * 0.92, z * Z * 0.3]), rot: [z * 0.3, 0, 0.3], spring: [150, 8], springGain: 0.6, def: bowPart(color, center, size) });
  }
  return out;
}
function collarAcc(S, c1, c2) {
  const [s2w, s2h] = S.s2;
  return { name: 'collar', attach: 'spine2', pos: V([s2w * 0.2, s2h * 0.55, 0]), def: acc(16, 4, S.bodyZ + 8, [8, 2, (S.bodyZ + 8) / 2], (g) => {
    const cz = (S.bodyZ + 8) / 2;
    g.cylinder('y', 8, cz, 0, 3, 7.5, (x, y, z) => { const a = Math.atan2(z + 0.5 - cz, x + 0.5 - 8); return Math.sin(a * 8) > 0 ? c1 : c2; }, {}, 6);
    g.cylinder('y', 8, cz, 0, 4, 5.2, null, { mode: 'carve' });
  }) };
}
const MIMI_SKINS = {
  default: { pal: {}, puru: 'default', acc: (S, spec, pal) => { spec.accessories.push(skirtAcc(S, pal), ...bowsAcc(S, pal.bow, pal.bowCenter), collarAcc(S, pal.skirt2, pal.skirt)); } },
  idol: {
    pal: { head: 0x8ae8e0, carapace: 0x7ad8d0, face: 0x6ac8c0, rostrum: 0xc0fff8, body: 0x7ad8d0, belly: 0xf0fffc, merus: 0x8ae8e0, propodus: 0xc0fff8, leg: 0x8ae8e0, legDark: 0x3a9a90, stalk: 0x8ae8e0, antenna: 0xff6fb0, skirt: 0xff6fb0, skirt2: 0x2fb0a0, bow: 0xffcf3a, bowCenter: 0xff6fb0, fan: 0x8ae8e0, fanEdge: 0xff6fb0 },
    shape: { mittens: { main: 0xffffff, cuff: 0xff6fb0, band: 0x8ae8e0 }, shoe: 0xff6fb0, shoeSole: 0xffffff },
    puru: 'idol',
    acc: (S, spec, pal) => {
      spec.accessories.push(skirtAcc(S, pal), ...bowsAcc(S, pal.bow, pal.bowCenter, 1.1), collarAcc(S, 0xffffff, 0xff6fb0));
      const [W, H, Z] = S.head;
      spec.accessories.push({ name: 'mic', attach: 'head', pos: V([W * 0.6, H * 0.2, Z * 0.5]), def: acc(8, 3, 2, [0.5, 1.5, 1], (g) => { g.box(0, 1, 0, 7, 2, 1, 0x2a2a30); g.box(6, 0, 0, 8, 3, 2, 0x16161a); }) });
    },
  },
  sakura: {
    pal: { head: 0xfff0f4, carapace: 0xffe8f0, face: 0xffd8e6, rostrum: 0xffffff, body: 0xffe8f0, belly: 0xffffff, bodyPattern: { type: 'spots', color: 0xffb6d9, density: 0.1 }, merus: 0xfff0f4, propodus: 0xffd0e4, leg: 0xfff0f4, legDark: 0xd8a0b8, stalk: 0xfff0f4, antenna: 0xff6fb0, skirt: 0xffb6d9, skirt2: 0xffffff, bow: 0xd8322a, bowCenter: 0xf0c33c, fan: 0xffb6d9, fanEdge: 0xffffff, eyeTop: 0x6a2a3a, eyeBot: 0x9a3a5a },
    shape: { mittens: { main: 0xffb6d9, cuff: 0xffffff, band: 0xd8322a }, shoe: 0x6a3a2a, shoeSole: 0x3a2018 },
    puru: 'sakura',
    acc: (S, spec, pal) => {
      spec.accessories.push(skirtAcc(S, pal, { c1: 0xffb6d9, c2: 0xffffff }), ...bowsAcc(S, 0xffb6d9, 0xffffff, 0.8));
      const [s1w, s1h] = S.s1;
      // big obi bow at the back
      spec.accessories.push({ name: 'obi', attach: 'spine1', pos: V([-s1w * 0.55, s1h * 0.35, 0]), rot: [0, Math.PI / 2, 0], spring: [100, 6], springGain: 0.8, def: bowPart(0xd8322a, 0xf0c33c, 1.6) });
    },
  },
  goth: {
    pal: { head: 0x5a3a6a, carapace: 0x4a2a5a, face: 0x3a2048, rostrum: 0x8a5aa8, body: 0x2a1a30, belly: 0x6a4a7a, edge: 0x8a1a3a, merus: 0x5a3a6a, meralSpot: 0xd8322a, propodus: 0x2a1a30, leg: 0x2a1a30, legDark: 0x140a18, stalk: 0x5a3a6a, antenna: 0x2a1a30, antennaTip: 0xd8322a, skirt: 0x16101a, skirt2: 0x6a2a8a, bow: 0x16101a, bowCenter: 0xd8322a, fan: 0x2a1a30, fanEdge: 0x6a2a8a, eyeTop: 0xd8322a, eyeBot: 0x8a1a2a, eyeBand: 0x16101a, lash: 0x000000 },
    shape: { mittens: { main: 0x16101a, cuff: 0x6a2a8a, band: 0xd8322a }, shoe: 0x16101a, shoeSole: 0x6a2a8a },
    puru: 'goth',
    acc: (S, spec, pal) => { spec.accessories.push(skirtAcc(S, pal), ...bowsAcc(S, pal.bow, pal.bowCenter, 1.2), collarAcc(S, 0x16101a, 0x6a2a8a)); },
  },
  magical: {
    pal: { head: 0xfff8ff, carapace: 0xf0e8ff, face: 0xe8dcff, rostrum: 0xffffff, body: 0xf0e8ff, belly: 0xffffff, edge: 0xf0c33c, bodyPattern: { type: 'stars', color: 0xfff08a, density: 0.035 }, merus: 0xfff8ff, meralSpot: { c: 0xffcf3a, e: 200 }, propodus: 0xe8dcff, leg: 0xfff8ff, legDark: 0xb8a8e8, stalk: 0xfff8ff, antenna: 0xf0c33c, antennaTip: 0xffffff, skirt: 0xc194ff, skirt2: 0xffffff, bow: 0xffcf3a, bowCenter: 0xc194ff, fan: 0xc194ff, fanEdge: 0xf0c33c, eyeTop: 0x3a4ac8, eyeBot: 0x6a7af0, eyeBand: 0xffcf3a },
    shape: { mittens: { main: 0xffffff, cuff: 0xf0c33c, band: 0xc194ff, emissive: 30 }, shoe: 0xf0c33c, shoeSole: 0xffffff },
    puru: 'magical',
    acc: (S, spec, pal) => {
      spec.accessories.push(skirtAcc(S, pal), ...bowsAcc(S, pal.bow, pal.bowCenter, 1.15), collarAcc(S, 0xffffff, 0xf0c33c));
      const [s1w, s1h] = S.s1;
      spec.accessories.push({ name: 'brooch', attach: 'spine2', pos: V([S.s2[0] * 0.45, S.s2[1] * 0.4, 0]), def: acc(3, 5, 5, [0, 2.5, 2.5], (g) => { g.box(0, 2, 0, 2, 3, 5, { c: 0xffcf3a, e: 255 }); g.box(0, 0, 2, 2, 5, 3, { c: 0xffcf3a, e: 255 }); g.set(1, 2, 2, 0xff4fa0, 255); }) });
    },
  },
};

// ---------------------------------------------------------------- public API
const CHAR = {
  jim: { pal: JIM_PAL, shape: JIM_SHAPE, skins: JIM_SKINS },
  brutus: { pal: BRUTUS_PAL, shape: BRUTUS_SHAPE, skins: BRUTUS_SKINS },
  bobby: { pal: BOBBY_PAL, shape: BOBBY_SHAPE, skins: BOBBY_SKINS },
  mimi: { pal: MIMI_PAL, shape: MIMI_SHAPE, skins: MIMI_SKINS },
};

export function buildSpec(charId, cos = {}, o = {}) {
  const C = CHAR[charId] || CHAR.jim;
  const skin = C.skins[cos.skin] || C.skins.default;
  let pal = { ...C.pal, ...(skin.pal || {}) };
  if (o.demon) pal = { ...pal, ...BOBBY_DEMON };
  const S = { ...C.shape, ...(skin.shape || {}) };
  if (o.demon) { S.eyeRL = 4.2; S.eyeR = 3.2; S.stalkSplay = 0.6; }
  const spec = buildShrimp(pal, S, { gloves: cos.gloves });
  spec.charId = charId;
  spec.skinKey = cos.skin || 'default';
  spec.puru = skin.puru || 'default';
  if (skin.acc) skin.acc(S, spec, pal);
  if (o.demon) {
    // crack the cone (if any) and add glowing eye cores
    const cone = spec.accessories.find((a) => a.name === 'cone');
    if (cone) {
      cone.def.grid.repaint((x, y, z, c) => {
        if (y > cone.def.grid.sy * 0.55 && vhash(x, y, z, 7) < 0.55) return null;
        if (vhash(x, y, z, 3) < 0.12) return 0x1a0a0a;
        return shadeColor(c, -0.45);
      });
    }
    spec.demon = true;
  }
  return spec;
}

export const CHAR_IDS = ['jim', 'brutus', 'bobby', 'mimi'];
export { BOBBY_DEMON };
