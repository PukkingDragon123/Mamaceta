// Reusable handcrafted menu widgets: snail counter, rank plaque, hint bar, dialogue box, pips.
import { P, PLAYER_COLORS, RARITY } from './palette.js';
import { getIcon, paperTag, woodPanel } from './sprites.js';
import { Save } from '../core/save.js';
import { ease, clamp } from '../core/math.js';

export function snailCounter(ui, x, y, o = {}) {
  const n = o.value ?? Save.data.snails;
  const txt = n.toLocaleString('en-US');
  const w = ui.measure(txt, 'big') + 34;
  const bump = o.bump ? Math.round(Math.sin(o.bump * 20) * 2 * o.bump) : 0;
  ui.panel(x - w, y, w, 22, { seed: 13, tone: 'dark', plankSize: 22, barnacles: 1, algae: 0.3 });
  ui.icon('snail', x - w + 5, y + 4 + bump);
  ui.text(txt, x - 6, y + 4, { font: 'big', align: 'right', color: P.gold4, shadow: P.ink });
  return w;
}

export function rankPlaque(ui, x, y) {
  const d = Save.data;
  const need = Save.xpForLevel(d.level);
  const w = 132;
  ui.panel(x - w, y, w, 26, { seed: 17, tone: 'mid', plankSize: 13, barnacles: 1 });
  ui.text(`LV ${d.level}`, x - w + 6, y + 4, { font: 'labelB', color: P.gold4 });
  ui.text(Save.rankTitle(), x - 6, y + 4, { font: 'label', align: 'right', color: P.cream3 });
  ui.rect(x - w + 6, y + 16, w - 12, 5, P.ink);
  ui.rect(x - w + 7, y + 17, Math.round((w - 14) * clamp(d.xp / need, 0, 1)), 3, P.teal4);
}

// hints: array of [key labels, text]
export function hintBar(ui, hints, o = {}) {
  let x = o.x ?? 8;
  const y = o.y ?? ui.h - 14;
  for (const [keys, text] of hints) {
    for (const k of [].concat(keys)) { x += ui.key(k, x, y - 1) + 2; }
    x += ui.text(text, x + 2, y + 1, { font: 'label', color: P.cream2 }) + 12;
  }
}

export function pips(ui, x, y, n, max = 5, color = P.gold3) {
  for (let i = 0; i < max; i++) { ui.rect(x + i * 7, y, 6, 5, P.ink); if (i < n) { ui.rect(x + i * 7 + 1, y + 1, 4, 3, color); ui.rect(x + i * 7 + 1, y + 1, 4, 1, P.white); } }
}

// wooden dialogue box with name plate and typewriter text
export function dialogueBox(ui, x, y, w, h, name, text, reveal, o = {}) {
  ui.shadowRect(x, y, w, h, 0.5);
  ui.panel(x, y, w, h, { seed: 23, tone: 'mid', plankSize: 14, barnacles: 2, algae: 0.6 });
  ui.rect(x + 6, y + 6, w - 12, h - 12, P.cream3);
  ui.rect(x + 6, y + h - 8, w - 12, 2, P.cream1);
  const nw = ui.measure(name, 'labelB') + 12;
  ui.panel(x + 10, y - 9, nw, 14, { seed: 29, tone: o.nameTone || 'red', plankSize: 14, barnacles: 0, algae: 0, moss: 0 });
  ui.text(name, x + 16, y - 6, { font: 'labelB', color: P.cream4 });
  ui.para(text, x + 12, y + 12, w - 24, { font: 'body', color: P.ink, outline: null, reveal });
  if (reveal >= text.length && o.prompt !== false) ui.icon('arrowR', x + w - 18 + Math.round(Math.sin(ui.time * 8) * 2), y + h - 20);
}

export function rarityTag(ui, rarity, x, y, align = 'left') {
  const R = RARITY[rarity] || RARITY.common;
  ui.text(R.name, x, y, { font: 'label', color: R.color, align });
}

export function panelTitle(ui, x, y, w, text, o = {}) {
  ui.text(text, x + w / 2, y, { font: o.font || 'big', align: 'center', color: o.color || P.gold3, shadow: P.ink });
}

// pointer selection helper for vertical lists: returns new index
export function listNav(input, idx, n, o = {}) {
  if (input.menu('up', o.who ?? 'any')) return { idx: (idx + n - 1) % n, moved: true };
  if (input.menu('down', o.who ?? 'any')) return { idx: (idx + 1) % n, moved: true };
  return { idx, moved: false };
}
