// Cosmetic catalog (no gameplay stats - purely visual). IDs: "<slot>:<char|any>:<key>"
export const SLOTS = ['skin', 'gloves', 'hitfx', 'trail', 'victory'];
export const SLOT_NAMES = { skin: 'SKINS', gloves: 'GLOVES', hitfx: 'PUNCH FX', trail: 'TRAILS', victory: 'VICTORY' };

export const SKINS = {
  jim: [
    { key: 'default', name: 'Street Dreamer', rarity: 'common', desc: 'Red headband, white wraps, big dreams.' },
    { key: 'shonen', name: 'Shonen Protagonist', rarity: 'rare', desc: 'Spiky crest. Orange gi. Power of friendship (not included).' },
    { key: 'luchador', name: 'El Camaron Enmascarado', rarity: 'epic', desc: 'A gold-and-violet lucha mask and a cape that flaps dramatically.' },
    { key: 'abyss', name: 'Abyssal Flame', rarity: 'epic', desc: 'Bioluminescent flames from the deepest trench.' },
    { key: 'neon', name: 'Neon Ronin', rarity: 'legendary', desc: 'Gunmetal shell with glowing circuitry and a laser visor.' },
  ],
  brutus: [
    { key: 'default', name: 'Big Back', rarity: 'common', desc: 'Zebra stripes, zero regrets.' },
    { key: 'chef', name: 'Sushi Chef', rarity: 'rare', desc: 'Chef toque, hachimaki and suspiciously clean spears.' },
    { key: 'royal', name: 'Royal Glutton', rarity: 'rare', desc: 'A crown for the king of the buffet.' },
    { key: 'sumo', name: 'Yokozuna Brutus', rarity: 'epic', desc: 'Champion mawashi with sacred rope. Top-knot included.' },
    { key: 'mecha', name: 'MECHA-BRUTUS 9000', rarity: 'legendary', desc: 'Riveted steel, exhaust stacks and a nuclear snack core.' },
  ],
  bobby: [
    { key: 'default', name: 'Traffic Hazard', rarity: 'common', desc: 'He found a cone. He kept the cone.' },
    { key: 'party', name: 'Party Animal', rarity: 'rare', desc: 'Polka-dot party hat with a fluffy pom-pom.' },
    { key: 'icecream', name: 'Soft Serve', rarity: 'rare', desc: 'A waffle cone with a strawberry swirl. Do not lick.' },
    { key: 'pumpkin', name: 'Pumpkin Head', rarity: 'epic', desc: 'A glowing jack-o-lantern. Spooky AND hollow.' },
    { key: 'wizard', name: 'Grand Wizard Bobbus', rarity: 'legendary', desc: 'Starry hat, flowing beard, zero spells.' },
  ],
  mimi: [
    { key: 'default', name: 'Pretty in Pink', rarity: 'common', desc: 'Frills, ribbons and her best friend Puru.' },
    { key: 'idol', name: 'Pop Idol', rarity: 'rare', desc: 'Stage outfit, headset mic, star ribbons.' },
    { key: 'sakura', name: 'Sakura Kimono', rarity: 'rare', desc: 'Cherry blossom kimono with a giant obi bow.' },
    { key: 'goth', name: 'Gothic Lolita', rarity: 'epic', desc: 'Black lace, violet frills, and a very dark Puru.' },
    { key: 'magical', name: 'Magical Girl Mimi', rarity: 'legendary', desc: 'Sparkling star outfit and a celestial Puru.' },
  ],
};

// glove visuals are used by the rig builder
export const GLOVES = [
  { key: 'default', name: 'Signature', rarity: 'common', desc: 'Each fighter\'s own style.' },
  { key: 'champ', name: 'Champ Gloves', rarity: 'common', desc: 'Classic red leather.', main: 0xd8322a, cuff: 0xf5f0e0, band: 0xe8e0c8 },
  { key: 'kelp', name: 'Kelp Wraps', rarity: 'common', desc: 'Organic. Slimy. Effective.', main: 0x3f8a2a, cuff: 0x2a5a1c, band: 0x77b83f, pattern: { type: 'stripes', color: 0x2f6a24, width: 1 } },
  { key: 'lucha', name: 'Lucha Gloves', rarity: 'rare', desc: 'Fiesta stripes for maximum flair.', main: 0x2fae5a, cuff: 0xffffff, band: 0xd8322a, pattern: { type: 'stripes', color: 0xd8322a, width: 2 } },
  { key: 'spiked', name: 'Spiked Knuckles', rarity: 'rare', desc: 'Black leather and steel studs.', main: 0x23212a, cuff: 0x3a3640, band: 0x8a8f98, spikes: 0xcfd8df },
  { key: 'bubble', name: 'Bubble Mittens', rarity: 'rare', desc: 'Squishy, shiny, slightly sticky.', main: 0x7fe8ff, cuff: 0xdff8ff, band: 0x49c2bd, emissive: 40 },
  { key: 'coral', name: 'Coral Gauntlets', rarity: 'epic', desc: 'Grown on the reef over 100 years.', main: 0xff7a5a, cuff: 0xffb48a, band: 0xd84a5a, pattern: { type: 'spots', color: 0xffd0a0, density: 0.3 } },
  { key: 'gold', name: 'Golden Gloves', rarity: 'epic', desc: 'Polished every night by Madam Molt herself.', main: 0xf0c33c, cuff: 0xb88a1e, band: 0xfff08a, glint: true, emissive: 25 },
  { key: 'magma', name: 'Magma Mitts', rarity: 'legendary', desc: 'Volcanic rock with molten cracks.', main: 0x2a1a18, cuff: 0x3a2420, band: 0xff6a1a, pattern: { type: 'flame', color: 0xff7a1a, e: 230, h: 20 } },
];

export const HITFX = [
  { key: 'classic', name: 'Classic Sparks', rarity: 'common', desc: 'Bright, honest sparks.', colors: [0xffffff, 0xffe08a, 0xffb040], spr: 'spark' },
  { key: 'bubbles', name: 'Bubble Pop', rarity: 'common', desc: 'Every punch makes bubbles.', colors: [0xdff8ff, 0x7fe8ff, 0x49c2bd], spr: 'bubble' },
  { key: 'stars', name: 'Pixel Stars', rarity: 'rare', desc: 'You literally see stars.', colors: [0xfff08a, 0xffcf3a, 0xffffff], spr: 'star' },
  { key: 'confetti', name: 'Fiesta Confetti', rarity: 'rare', desc: 'Every hit is a party.', colors: [0xff4f6a, 0x4fd0ff, 0xffcf3a, 0x6aff8a, 0xc194ff], spr: 'confetti' },
  { key: 'sakura', name: 'Sakura Storm', rarity: 'epic', desc: 'Petals drift where fists fly.', colors: [0xffb6d9, 0xff6fb0, 0xffffff], spr: 'petal' },
  { key: 'lightning', name: 'Thunder Knuckle', rarity: 'epic', desc: 'Crackling electric blue.', colors: [0x9cc4ff, 0x4f8fff, 0xffffff], spr: 'bolt' },
  { key: 'ink', name: 'Squid Ink', rarity: 'epic', desc: 'Messy. Dark. Dramatic.', colors: [0x2a1a3a, 0x553088, 0x111018], spr: 'ink', dark: true },
  { key: 'fire', name: 'Inferno', rarity: 'legendary', desc: 'Fire. Underwater. Don\'t ask.', colors: [0xffd040, 0xff7a1a, 0xff3a1a], spr: 'flame' },
  { key: 'skulls', name: 'Spooky Skulls', rarity: 'legendary', desc: 'Ghostly green skulls fly off every hit.', colors: [0xb6ffb0, 0x3fd16a, 0xffffff], spr: 'skull' },
];

export const TRAILS = [
  { key: 'none', name: 'No Trail', rarity: 'common', desc: 'Clean and simple.' },
  { key: 'bubbles', name: 'Bubble Trail', rarity: 'common', desc: 'A stream of bubbles follows you.', colors: [0xdff8ff, 0x7fe8ff], spr: 'bubbleS' },
  { key: 'notes', name: 'Mariachi Notes', rarity: 'rare', desc: 'Your moves have rhythm.', colors: [0xfff08a, 0xffffff], spr: 'note' },
  { key: 'glitter', name: 'Glitter Bomb', rarity: 'rare', desc: 'Fabulous sparkles everywhere.', colors: [0xffb6d9, 0xfff08a, 0x9cc4ff], spr: 'sparkle', glow: true },
  { key: 'biolum', name: 'Bioluminescence', rarity: 'epic', desc: 'Glowing plankton swirls around you.', colors: [0x49c2bd, 0x8ff0e0], spr: 'dot', glow: true },
  { key: 'embers', name: 'Embers', rarity: 'epic', desc: 'Hot coals drift off your shell.', colors: [0xff7a1a, 0xffd040], spr: 'pixelS', glow: true },
  { key: 'petals', name: 'Petal Breeze', rarity: 'legendary', desc: 'Blossoms swirl in your wake.', colors: [0xffb6d9, 0xffffff], spr: 'petal' },
];

export const VICTORY = [
  { key: 'default', name: 'Signature Pose', rarity: 'common', desc: 'Each fighter\'s own celebration.' },
  { key: 'flex', name: 'Shell Flex', rarity: 'common', desc: 'Show off those meral spots.' },
  { key: 'cumbia', name: 'Cumbia Shuffle', rarity: 'rare', desc: 'A victory dance to the rhythm of the rig.' },
  { key: 'snack', name: 'Victory Snack', rarity: 'rare', desc: 'Nothing tastes better than winning. Except snails.' },
  { key: 'guitar', name: 'Air Guitar', rarity: 'epic', desc: 'Shred an invisible vihuela.' },
  { key: 'spin', name: 'Breakdance Spin', rarity: 'epic', desc: 'Head spin on the rusty floor.' },
  { key: 'fireworks', name: 'Fiesta Fireworks', rarity: 'legendary', desc: 'Underwater fireworks. Somehow.' },
];

// Flat list of purchasable items (defaults are owned from the start)
export function allItems() {
  const out = [];
  for (const c of Object.keys(SKINS)) for (const s of SKINS[c]) if (s.key !== 'default') out.push({ id: `skin:${c}:${s.key}`, slot: 'skin', char: c, ...s });
  for (const g of GLOVES) if (g.key !== 'default') out.push({ id: `gloves:any:${g.key}`, slot: 'gloves', char: 'any', ...g });
  for (const g of HITFX) if (g.key !== 'classic') out.push({ id: `hitfx:any:${g.key}`, slot: 'hitfx', char: 'any', ...g });
  for (const g of TRAILS) if (g.key !== 'none') out.push({ id: `trail:any:${g.key}`, slot: 'trail', char: 'any', ...g });
  for (const g of VICTORY) if (g.key !== 'default') out.push({ id: `victory:any:${g.key}`, slot: 'victory', char: 'any', ...g });
  return out;
}

export function itemDef(slot, char, key) {
  if (slot === 'skin') return SKINS[char]?.find((s) => s.key === key);
  const list = slot === 'gloves' ? GLOVES : slot === 'hitfx' ? HITFX : slot === 'trail' ? TRAILS : VICTORY;
  return list.find((s) => s.key === key);
}
export function slotList(slot, char) {
  if (slot === 'skin') return SKINS[char];
  return slot === 'gloves' ? GLOVES : slot === 'hitfx' ? HITFX : slot === 'trail' ? TRAILS : VICTORY;
}
export function itemId(slot, char, key) {
  return slot === 'skin' ? `skin:${char}:${key}` : `${slot}:any:${key}`;
}
export function isDefaultKey(slot, key) {
  return (slot === 'hitfx' && key === 'classic') || (slot === 'trail' && key === 'none') || key === 'default';
}
