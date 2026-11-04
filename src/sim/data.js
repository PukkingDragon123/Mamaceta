// Character stats and move frame data. All distances in world units, times in 60Hz frames.
// hb: [x0, x1, y0, y1] hitbox relative to fighter feet, x measured forward (facing direction).
// t: [startup, active, recovery]. lvl: 'mid' | 'low' | 'high' (overhead). kb: [forward, up] velocity on hit.

export const PHYS = {
  GRAV: 0.0115, MAXFALL: 0.33, GROUND_FRIC: 0.72, HIT_FRIC: 0.9, AIR_FRIC: 0.985,
  BUFFER: 7, DASH_WINDOW: 13, PERFECT_WINDOW: 7, CHORD: 3,
  MOLT_FRAMES: 180, MOLT_COOLDOWN: 1200, SOFT_SHELL: 120, DIZZY: 110,
  ROUND_TIME: 99 * 60, METER_MAX: 100,
};

export const CHARS = {
  jim: {
    name: 'JIM', title: 'The Wannabe Wandering Fist', species: 'Peacock mantis shrimp',
    hp: 1000, shell: 100, walk: 0.056, back: 0.044, dash: 0.2, jumpV: 0.272, jumpX: 0.07, airJumps: 1, airJumpV: 0.22, airAcc: 0.006,
    weight: 1, w: 0.56, h: 1.62, ch: 1.08, hurtW: 0.34, smasher: true,
  },
  brutus: {
    name: 'BRUTUS', title: 'The Big Back Bruiser', species: 'Zebra mantis shrimp',
    hp: 1320, shell: 160, walk: 0.036, back: 0.03, dash: 0.15, jumpV: 0.235, jumpX: 0.055, airJumps: 1, airJumpV: 0.16, airAcc: 0.004,
    weight: 0.68, w: 0.95, h: 1.95, ch: 1.45, hurtW: 0.55, spearer: true,
  },
  bobby: {
    name: 'BOBBY', title: 'The Coneheaded Catastrophe', species: 'Purple spot mantis shrimp',
    hp: 820, shell: 70, walk: 0.064, back: 0.05, dash: 0.22, jumpV: 0.29, jumpX: 0.078, airJumps: 2, airJumpV: 0.22, airAcc: 0.007,
    weight: 1.28, w: 0.48, h: 1.12, ch: 0.8, hurtW: 0.27, smasher: true,
    demon: { walk: 0.1, back: 0.085, dash: 0.32, jumpV: 0.305, airJumps: 2, speed: 0.72, dmg: 1.28, shell: 50 },
  },
  mimi: {
    name: 'MIMI', title: 'The Jelly-Slinging Sweetheart', species: 'Pink-eared mantis shrimp',
    hp: 920, shell: 90, walk: 0.054, back: 0.046, dash: 0.2, jumpV: 0.285, jumpX: 0.072, airJumps: 1, airJumpV: 0.22, airAcc: 0.0065,
    weight: 1.1, w: 0.5, h: 1.5, ch: 1.0, hurtW: 0.3, smasher: true,
  },
};

// Shorthand helper
const M = (o) => ({ dmg: 0, sh: 0, hs: 14, bs: 10, stop: 6, kb: [0.05, 0], lvl: 'mid', next: null, hits: 1, every: 0, ...o });

export const MOVES = {
  jim: {
    jab: M({ t: [4, 2, 8], dmg: 30, sh: 8, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.25, 0.95, 1.0, 1.35], next: { L: 'jab2', H: 'heavy', S: true }, anim: 'jab', sfx: 'whiff_light', chainWhiff: true }),
    jab2: M({ t: [4, 2, 10], dmg: 32, sh: 8, hs: 14, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.25, 1.0, 0.95, 1.3], next: { L: 'jab3', H: 'llh', S: true }, anim: 'jab2', sfx: 'whiff_light', chainWhiff: true }),
    jab3: M({ t: [6, 3, 14], dmg: 44, sh: 12, hs: 18, bs: 12, stop: 7, kb: [0.12, 0.04], hb: [0.25, 1.05, 0.95, 1.4], next: { S: true }, anim: 'jab3', sfx: 'whiff_heavy', step: 0.06 }),
    llh: M({ t: [8, 4, 22], dmg: 90, sh: 26, hs: 30, bs: 14, stop: 10, kb: [0.05, 0.26], hb: [0.2, 1.0, 0.9, 1.8], launch: true, anim: 'uppercut', cav: { delay: 7, dmg: 18, r: 0.55 }, sfx: 'whiff_heavy', next: { S: true, U: true }, step: 0.05 }),
    barrage: M({ t: [7, 22, 14], dmg: 14, sh: 4, hs: 12, bs: 7, stop: 3, kb: [0.025, 0], hb: [0.2, 1.05, 0.95, 1.4], hits: 6, every: 4, lastKb: [0.12, 0.05], anim: 'barrage', sfx: 'whiff_light', step: 0.015 }),
    clight: M({ t: [5, 2, 9], dmg: 26, sh: 7, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.2, 1.0, 0.1, 0.55], lvl: 'low', crouch: true, next: { L: 'clight', H: 'uppercut', S: true }, anim: 'clight', sfx: 'whiff_light', chainWhiff: true }),
    heavy: M({ t: [11, 4, 20], dmg: 85, sh: 26, hs: 21, bs: 15, stop: 10, kb: [0.14, 0.02], hb: [0.25, 1.15, 0.9, 1.4], charge: true, cav: { delay: 8, dmg: 22, r: 0.6 }, anim: 'heavy', sfx: 'whiff_heavy', next: { S: true }, step: 0.04 }),
    charged: M({ t: [4, 4, 24], dmg: 95, sh: 40, hs: 26, bs: 18, stop: 12, kb: [0.2, 0.06], hb: [0.25, 1.3, 0.85, 1.45], cav: { delay: 8, dmg: 30, r: 0.9 }, anim: 'charged', sfx: 'whiff_heavy', step: 0.12, chargeScale: true, wallBounce: true }),
    uppercut: M({ t: [5, 6, 26], dmg: 95, sh: 24, hs: 30, bs: 16, stop: 10, kb: [0.04, 0.3], hb: [0.1, 0.85, 0.7, 2.0], launch: true, inv: [1, 6], anim: 'dp', rise: [0.03, 0.26], cav: { delay: 6, dmg: 15, r: 0.5 }, sfx: 'whiff_heavy', name: 'RISING SHRIMP FIST!' }),
    specialF: M({ t: [14, 1, 22], anim: 'cannon', proj: { f: 14, type: 'cannon' }, sfx: 'projectile_bubble', name: 'CAVITATION CANNON!' }),
    specialB: M({ t: [3, 30, 16], anim: 'counter', counter: true, sfx: 'charge_start', name: 'MIRAGE STANCE' }),
    counterHit: M({ t: [3, 4, 18], dmg: 110, sh: 30, hs: 26, bs: 16, stop: 14, kb: [0.18, 0.12], hb: [0.2, 1.2, 0.7, 1.6], inv: [0, 10], anim: 'heavy', cav: { delay: 6, dmg: 20, r: 0.7 }, sfx: 'whiff_heavy' }),
    airL: M({ t: [5, 6, 10], dmg: 34, sh: 8, hs: 14, bs: 10, stop: 5, kb: [0.06, 0.02], hb: [0.1, 0.85, 0.5, 1.2], lvl: 'high', air: true, anim: 'airL', sfx: 'whiff_light' }),
    airH: M({ t: [9, 7, 12], dmg: 78, sh: 22, hs: 22, bs: 14, stop: 9, kb: [0.08, -0.2], hb: [0.1, 1.0, -0.05, 0.9], lvl: 'high', air: true, anim: 'airH', dive: [0.07, -0.16], groundBounce: true, cav: { delay: 6, dmg: 14, r: 0.5 }, sfx: 'whiff_heavy' }),
    throw: M({ t: [4, 2, 26], grab: true, hb: [0.1, 0.9, 0.4, 1.4], anim: 'grab', sfx: 'throw_grab' }),
    ult: M({ t: [12, 20, 34], dmg: 60, sh: 0, hs: 60, stop: 4, kb: [0.04, 0], hb: [0.2, 1.1, 0.5, 1.6], ult: true, dash: 0.32, anim: 'ultDash', name: 'ABYSSAL WAVE FIST', ultSeq: 'jim' }),
  },
  brutus: {
    jab: M({ t: [7, 3, 12], dmg: 40, sh: 10, hs: 15, bs: 10, stop: 6, kb: [0.05, 0], hb: [0.5, 1.75, 1.0, 1.35], next: { L: 'jab2', H: 'heavy', S: true }, anim: 'stab', sfx: 'spear_stab', chainWhiff: true }),
    jab2: M({ t: [7, 3, 14], dmg: 42, sh: 10, hs: 16, bs: 10, stop: 6, kb: [0.06, 0], hb: [0.5, 1.8, 0.9, 1.3], next: { H: 'llh', S: true }, anim: 'stab2', sfx: 'spear_stab', chainWhiff: true }),
    llh: M({ t: [10, 4, 26], dmg: 110, sh: 32, hs: 32, bs: 16, stop: 11, kb: [-0.12, 0.24], hb: [0.4, 1.6, 0.8, 1.6], launch: true, anim: 'skewerToss', sfx: 'whiff_heavy', name: 'SKEWER TOSS!' }),
    barrage: M({ t: [10, 18, 16], dmg: 18, sh: 5, hs: 13, bs: 8, stop: 4, kb: [0.03, 0], hb: [0.5, 1.85, 0.9, 1.45], hits: 4, every: 5, lastKb: [0.1, 0.02], anim: 'spearFlurry', sfx: 'spear_stab' }),
    clight: M({ t: [8, 3, 12], dmg: 35, sh: 9, hs: 14, bs: 10, stop: 6, kb: [0.05, 0], hb: [0.45, 1.65, 0.05, 0.5], lvl: 'low', crouch: true, next: { S: true, H: 'uppercut' }, anim: 'lowStab', sfx: 'spear_stab' }),
    heavy: M({ t: [14, 5, 22], dmg: 100, sh: 34, hs: 22, bs: 16, stop: 11, kb: [0.16, 0.03], hb: [0.3, 1.25, 0.5, 1.6], armor: [3, 14], charge: true, anim: 'bellyBump', sfx: 'belly_bounce', next: { S: true }, step: 0.06 }),
    charged: M({ t: [6, 6, 26], dmg: 110, sh: 50, hs: 26, bs: 18, stop: 13, kb: [0.24, 0.06], hb: [0.3, 1.4, 0.4, 1.7], armor: [0, 6], anim: 'bellyBash', sfx: 'belly_bounce', step: 0.16, chargeScale: true, wallBounce: true }),
    uppercut: M({ t: [9, 5, 24], dmg: 100, sh: 28, hs: 30, bs: 16, stop: 11, kb: [0.05, 0.28], hb: [0.2, 1.2, 0.6, 2.2], launch: true, armor: [2, 9], anim: 'bellyLaunch', sfx: 'belly_bounce', name: 'BIG BACK BOUNCE!' }),
    specialF: M({ t: [12, 6, 28], dmg: 0, hb: [0.6, 3.2, 0.8, 1.5], snag: true, anim: 'snag', sfx: 'spear_snag', name: 'SPEAR SNAG!' }),
    specialB: M({ t: [70, 0, 6], anim: 'snack', snack: true, sfx: 'snail_crunch', name: 'SNACK TIME' }),
    airL: M({ t: [6, 6, 10], dmg: 40, sh: 10, hs: 14, bs: 10, stop: 6, kb: [0.05, 0.02], hb: [0.3, 1.5, 0.4, 1.1], lvl: 'high', air: true, anim: 'airStab', sfx: 'spear_stab' }),
    airH: M({ t: [10, 30, 16], dmg: 120, sh: 34, hs: 26, bs: 16, stop: 12, kb: [0.1, 0.12], hb: [-0.4, 0.9, -0.2, 0.8], lvl: 'high', air: true, anim: 'bodySlam', dive: [0.02, -0.34], slam: true, sfx: 'whiff_heavy', name: 'BODY SLAM!' }),
    throw: M({ t: [5, 2, 30], grab: true, hb: [0.2, 1.1, 0.4, 1.6], anim: 'grab', sfx: 'throw_grab' }),
    ult: M({ t: [14, 1, 40], ult: true, anim: 'flopJump', flop: true, name: 'BELLY FLOP OF DOOM' }),
  },
  bobby: {
    jab: M({ t: [5, 7, 7], dmg: 20, sh: 6, hs: 12, bs: 8, stop: 4, kb: [0.04, 0], hb: [0.15, 0.75, 0.45, 0.9], hits: 3, every: 3, next: { L: 'jab2', H: 'heavy', S: true }, anim: 'flail', sfx: 'whiff_light', chainWhiff: true, rand: 'flail' }),
    jab2: M({ t: [5, 3, 11], dmg: 25, sh: 6, hs: 13, bs: 8, stop: 4, kb: [0.05, 0], hb: [0.15, 0.8, 0.4, 0.95], next: { H: 'llh', L: 'jab', S: true }, anim: 'flail2', sfx: 'whiff_light', chainWhiff: true }),
    llh: M({ t: [9, 5, 22], dmg: 80, sh: 22, hs: 26, bs: 14, stop: 9, kb: [0.12, 0.2], hb: [0.1, 0.9, 0.5, 1.4], launch: true, anim: 'coneBonk', sfx: 'cone_bonk', name: 'CONE BONK!' }),
    barrage: M({ t: [6, 30, 14], dmg: 12, sh: 4, hs: 12, bs: 7, stop: 3, kb: [0.03, 0], hb: [0.1, 0.8, 0.2, 1.0], hits: 6, every: 5, lastKb: [0.08, 0.04], anim: 'wobbleRush', sfx: 'whiff_light', rush: 0.07, rand: 'trip' }),
    clight: M({ t: [6, 2, 10], dmg: 26, sh: 7, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.15, 0.8, 0.0, 0.4], lvl: 'low', crouch: true, next: { L: 'clight', S: true }, anim: 'conePoke', sfx: 'whiff_light' }),
    heavy: M({ t: [12, 6, 20], dmg: 90, sh: 26, hs: 22, bs: 14, stop: 10, kb: [0.15, 0.04], hb: [0.2, 1.05, 0.3, 1.2], charge: true, anim: 'headbutt', sfx: 'cone_bonk', step: 0.09, rand: 'faceplant' }),
    charged: M({ t: [4, 40, 18], dmg: 22, sh: 8, hs: 14, bs: 9, stop: 4, kb: [0.06, 0.04], hb: [-0.6, 0.6, 0.1, 1.3], hits: 8, every: 5, lastKb: [0.16, 0.12], anim: 'coneSpin', sfx: 'whiff_heavy', rush: 0.09, chargeScale: true }),
    uppercut: M({ t: [7, 5, 24], dmg: 85, sh: 22, hs: 28, bs: 14, stop: 9, kb: [0.04, 0.28], hb: [0.0, 0.8, 0.3, 1.6], launch: true, inv: [1, 4], anim: 'oops', rise: [0.02, 0.2], sfx: 'cone_bonk', name: 'OOPS-PERCUT!' }),
    specialF: M({ t: [12, 1, 20], anim: 'junkToss', proj: { f: 12, type: 'junk' }, sfx: 'junk_toss', name: 'JUNK TOSS!' }),
    specialB: M({ t: [3, 60, 10], anim: 'coneHide', hide: true, sfx: 'cone_bonk', name: 'CONE HIDE' }),
    airL: M({ t: [4, 6, 9], dmg: 25, sh: 6, hs: 13, bs: 9, stop: 4, kb: [0.05, 0.02], hb: [0.0, 0.7, 0.0, 0.8], lvl: 'high', air: true, anim: 'airL', sfx: 'whiff_light' }),
    airH: M({ t: [8, 24, 14], dmg: 25, sh: 7, hs: 14, bs: 9, stop: 4, kb: [0.05, -0.1], hb: [0.0, 0.8, -0.2, 0.7], lvl: 'high', air: true, anim: 'coneDrill', dive: [0.12, -0.22], hits: 3, every: 6, sfx: 'whiff_heavy', name: 'CONE DRILL!' }),
    throw: M({ t: [4, 2, 26], grab: true, hb: [0.1, 0.75, 0.2, 1.1], anim: 'grab', sfx: 'throw_grab' }),
    ult: M({ t: [16, 150, 30], dmg: 30, sh: 10, hs: 20, bs: 10, stop: 3, kb: [0.08, 0.1], hb: [-0.7, 0.7, 0.0, 1.3], hits: 10, every: 14, ult: true, anim: 'trafficJam', jam: true, name: 'TRAFFIC JAM' }),
  },
  // Bobby demon mode overrides (merged over bobby moves)
  bobbyDemon: {
    jab: M({ t: [3, 2, 7], dmg: 30, sh: 8, hs: 13, bs: 8, stop: 5, kb: [0.04, 0], hb: [0.1, 0.95, 0.3, 1.1], next: { L: 'jab2', H: 'heavy', S: true }, anim: 'rend', sfx: 'demon_slash', chainWhiff: true }),
    jab2: M({ t: [3, 2, 7], dmg: 30, sh: 8, hs: 13, bs: 8, stop: 5, kb: [0.04, 0], hb: [0.1, 1.0, 0.3, 1.1], next: { L: 'jab3', H: 'llh', S: true }, anim: 'rend2', sfx: 'demon_slash', chainWhiff: true }),
    jab3: M({ t: [3, 2, 7], dmg: 32, sh: 8, hs: 14, bs: 8, stop: 5, kb: [0.05, 0], hb: [0.1, 1.0, 0.3, 1.1], next: { L: 'jab4', H: 'llh', S: true }, anim: 'rend', sfx: 'demon_slash', chainWhiff: true }),
    jab4: M({ t: [4, 3, 12], dmg: 46, sh: 12, hs: 20, bs: 12, stop: 8, kb: [0.12, 0.08], hb: [0.1, 1.05, 0.3, 1.2], next: { H: 'llh', S: true }, anim: 'rend2', sfx: 'demon_slash' }),
    llh: M({ t: [6, 4, 18], dmg: 100, sh: 30, hs: 30, bs: 14, stop: 12, kb: [0.1, 0.3], hb: [0.1, 1.0, 0.3, 1.8], launch: true, anim: 'abyssRise', sfx: 'demon_slash', cav: { delay: 6, dmg: 25, r: 0.7, dark: true }, name: 'ABYSS RISE' }),
    barrage: M({ t: [4, 24, 10], dmg: 16, sh: 4, hs: 12, bs: 7, stop: 3, kb: [0.03, 0], hb: [0.1, 1.0, 0.2, 1.2], hits: 8, every: 3, lastKb: [0.12, 0.06], anim: 'frenzy', sfx: 'demon_slash' }),
    clight: M({ t: [3, 2, 8], dmg: 28, sh: 7, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.1, 1.0, 0.0, 0.45], lvl: 'low', crouch: true, next: { L: 'clight', S: true, H: 'uppercut' }, anim: 'crawlSlash', sfx: 'demon_slash' }),
    heavy: M({ t: [8, 4, 16], dmg: 105, sh: 32, hs: 22, bs: 15, stop: 12, kb: [0.16, 0.04], hb: [0.2, 1.2, 0.3, 1.3], anim: 'nightClub', cav: { delay: 6, dmg: 26, r: 0.8, dark: true }, sfx: 'demon_slash', charge: false, next: { S: true } }),
    uppercut: M({ t: [4, 5, 18], dmg: 100, sh: 26, hs: 30, bs: 15, stop: 11, kb: [0.04, 0.32], hb: [0.0, 0.9, 0.3, 2.0], launch: true, inv: [1, 5], anim: 'abyssRise', rise: [0.03, 0.28], sfx: 'demon_slash' }),
    specialF: M({ t: [5, 18, 12], dmg: 80, sh: 22, hs: 22, bs: 13, stop: 9, kb: [0.12, 0.06], hb: [0.0, 1.0, 0.0, 0.7], lvl: 'low', anim: 'shadowLunge', rush: 0.34, sfx: 'demon_slash', name: 'SHADOW LUNGE' }),
    specialB: M({ t: [6, 1, 16], anim: 'vanish', vanish: true, inv: [0, 18], sfx: 'demon_whisper', name: 'VANISH' }),
    airH: M({ t: [5, 20, 10], dmg: 70, sh: 20, hs: 22, bs: 14, stop: 9, kb: [0.08, -0.2], hb: [0.0, 1.0, -0.2, 0.8], lvl: 'high', air: true, anim: 'nightfall', dive: [0.16, -0.3], groundBounce: true, sfx: 'demon_slash' }),
    ult: M({ t: [10, 4, 40], dmg: 45, hs: 60, stop: 4, kb: [0.02, 0], hb: [-0.2, 1.4, 0.0, 1.6], ult: true, dash: 0.5, anim: 'ultDash', name: 'LIGHTS OUT', ultSeq: 'demon' }),
  },
  mimi: {
    jab: M({ t: [4, 2, 8], dmg: 28, sh: 7, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.2, 0.9, 0.85, 1.25], next: { L: 'jab2', H: 'heavy', S: true }, anim: 'slap', sfx: 'whiff_light', chainWhiff: true }),
    jab2: M({ t: [4, 2, 10], dmg: 30, sh: 8, hs: 14, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.2, 0.95, 0.8, 1.25], next: { H: 'llh', S: true }, anim: 'twirlSlap', sfx: 'whiff_light', chainWhiff: true }),
    llh: M({ t: [9, 5, 18], dmg: 85, sh: 24, hs: 26, bs: 14, stop: 10, kb: [0.16, 0.1], hb: [0.2, 1.35, 0.5, 1.6], anim: 'jellySmack', sting: 12, sfx: 'puru_boing', name: 'JELLY SMACK!', needPuru: true, alt: 'kick' }),
    kick: M({ t: [7, 4, 16], dmg: 60, sh: 16, hs: 20, bs: 12, stop: 8, kb: [0.12, 0.05], hb: [0.2, 1.0, 0.3, 1.0], anim: 'kick', sfx: 'whiff_heavy' }),
    barrage: M({ t: [6, 24, 12], dmg: 12, sh: 3, hs: 11, bs: 7, stop: 3, kb: [0.025, 0], hb: [0.2, 0.95, 0.8, 1.3], hits: 6, every: 4, lastKb: [0.1, 0.06], anim: 'pattycake', sfx: 'whiff_light' }),
    clight: M({ t: [5, 2, 9], dmg: 24, sh: 6, hs: 13, bs: 9, stop: 5, kb: [0.05, 0], hb: [0.2, 0.95, 0.0, 0.45], lvl: 'low', crouch: true, next: { L: 'clight', S: true, H: 'uppercut' }, anim: 'tippyKick', sfx: 'whiff_light' }),
    heavy: M({ t: [12, 4, 18], dmg: 80, sh: 24, hs: 21, bs: 14, stop: 10, kb: [0.12, 0.04], hb: [0.3, 1.4, 0.4, 2.0], lvl: 'high', charge: true, anim: 'puruBonk', sting: 10, sfx: 'puru_boing', needPuru: true, alt: 'bigSlap' }),
    bigSlap: M({ t: [10, 3, 16], dmg: 60, sh: 18, hs: 18, bs: 12, stop: 8, kb: [0.12, 0.03], hb: [0.2, 1.0, 0.7, 1.35], anim: 'heavySlap', sfx: 'whiff_heavy' }),
    charged: M({ t: [8, 1, 18], anim: 'puruThrow', proj: { f: 8, type: 'puru', power: true }, sfx: 'whiff_heavy', needPuru: true, alt: 'bigSlap', chargeScale: true }),
    uppercut: M({ t: [6, 5, 22], dmg: 75, sh: 20, hs: 28, bs: 14, stop: 9, kb: [0.04, 0.28], hb: [0.0, 0.85, 0.3, 1.9], launch: true, inv: [1, 4], anim: 'jellySpring', rise: [0.02, 0.27], sfx: 'puru_boing', name: 'JELLY SPRING!' }),
    specialF: M({ t: [10, 1, 18], anim: 'puruThrow', proj: { f: 10, type: 'puru' }, sfx: 'whiff_heavy', name: 'GO, PURU!', recall: true }),
    specialB: M({ t: [16, 1, 18], anim: 'bubbleBlow', proj: { f: 16, type: 'bubble' }, sfx: 'projectile_bubble', needPuru: true, alt: 'bigSlap', cooldown: 300, name: 'BUBBLE TRAP!' }),
    airL: M({ t: [5, 6, 9], dmg: 30, sh: 8, hs: 14, bs: 9, stop: 5, kb: [0.06, 0.03], hb: [0.0, 0.85, 0.4, 1.2], lvl: 'high', air: true, anim: 'airTwirl', sfx: 'whiff_light' }),
    airH: M({ t: [8, 14, 12], dmg: 70, sh: 20, hs: 22, bs: 14, stop: 9, kb: [0.08, 0.16], hb: [-0.3, 0.6, -0.4, 0.6], lvl: 'high', air: true, anim: 'stingDive', dive: [0.06, -0.2], bounceOff: true, sting: 10, sfx: 'puru_zap' }),
    throw: M({ t: [4, 2, 26], grab: true, hb: [0.1, 0.85, 0.3, 1.4], anim: 'grab', sfx: 'throw_grab' }),
    ult: M({ t: [14, 200, 30], dmg: 22, sh: 8, hs: 18, bs: 9, stop: 2, kb: [0.05, 0.05], hb: [-0.9, 0.9, 0.0, 1.7], hits: 12, every: 12, ult: true, anim: 'tornado', tornado: true, name: 'PURU PURU TORNADO' }),
  },
};

export const THROWS = {
  jim: { dmg: 110, frames: 40, toss: [0.16, 0.2], anim: 'throwJim' },
  brutus: { dmg: 140, frames: 48, toss: [0.12, 0.24], anim: 'throwBrutus' },
  bobby: { dmg: 90, frames: 40, toss: [0.18, 0.22], anim: 'throwBobby' },
  mimi: { dmg: 100, frames: 42, toss: [0.15, 0.2], anim: 'throwMimi' },
};

export function moveFor(char, demon, id) {
  if (demon && MOVES.bobbyDemon[id]) return MOVES.bobbyDemon[id];
  return MOVES[char][id];
}

export const ULT_NAMES = { jim: 'ABYSSAL WAVE FIST', brutus: 'BELLY FLOP OF DOOM', bobby: 'TRAFFIC JAM', mimi: 'PURU PURU TORNADO', demon: 'LIGHTS OUT' };
