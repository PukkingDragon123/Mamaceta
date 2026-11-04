// Persistent profile: snails, inventory, equipped cosmetics, progression, settings.
import { DEFAULT_BINDINGS } from './input.js';
import { todayKey } from './math.js';

const KEY = 'mantis-mayhem-save-v1';
export const CHARS = ['jim', 'brutus', 'bobby', 'mimi'];

function defaultEquip() {
  return { skin: 'default', gloves: 'default', hitfx: 'classic', trail: 'none', victory: 'default' };
}

export function defaultProfile() {
  const equipped = {};
  for (const c of CHARS) equipped[c] = defaultEquip();
  return {
    version: 1,
    name: 'Shrimpy' + Math.floor(100 + Math.random() * 900),
    snails: 350,
    xp: 0,
    level: 1,
    owned: {},
    equipped,
    mainFighter: 'jim',
    stats: { matches: 0, wins: 0, losses: 0, rounds: 0, kos: 0, perfectBlocks: 0, shellBreaks: 0, molts: 0, qteEscapes: 0, ults: 0, snailsEarned: 0, charWins: { jim: 0, brutus: 0, bobby: 0, mimi: 0 } },
    challenges: { day: '', list: [] },
    lastWinDay: '',
    shopSeen: '',
    seenIntro: false,
    settings: {
      master: 0.8, music: 0.55, sfx: 0.9,
      shake: 1, quality: 'high', showFps: false, qte: true, flashes: true,
      cpuLevel: 2, rounds: 3, roundTime: 99,
      bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
      peerHost: '',
    },
  };
}

function merge(def, val) {
  if (val === undefined || val === null) return def;
  if (typeof def !== 'object' || Array.isArray(def)) return typeof val === typeof def ? val : def;
  const out = {};
  for (const k of Object.keys(def)) out[k] = merge(def[k], val[k]);
  for (const k of Object.keys(val)) if (!(k in out)) out[k] = val[k];
  return out;
}

class SaveStore {
  constructor() {
    this.data = defaultProfile();
    this.available = true;
    this._dirty = false;
    this._t = 0;
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaultProfile(), JSON.parse(raw));
    } catch (e) {
      this.available = false;
      console.warn('Save unavailable, progress will not persist.', e);
    }
    // owned/equipped are dynamic maps: keep stored values as-is
    return this.data;
  }
  save() {
    this._dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { this.available = false; }
  }
  markDirty() { this._dirty = true; }
  update(dt) {
    this._t += dt;
    if (this._dirty && this._t > 0.5) { this._t = 0; this.save(); }
  }
  reset() {
    const keepSettings = this.data.settings;
    this.data = defaultProfile();
    this.data.settings = keepSettings;
    this.save();
  }

  get settings() { return this.data.settings; }
  owns(id) { return !!this.data.owned[id] || id.endsWith(':default') || id === 'hitfx:classic' || id === 'trail:none'; }
  grant(id) { this.data.owned[id] = true; this.markDirty(); }
  equip(char, slot, value) { this.data.equipped[char][slot] = value; this.markDirty(); }
  equipped(char) { return this.data.equipped[char] || defaultEquip(); }
  addSnails(n) { this.data.snails = Math.max(0, Math.floor(this.data.snails + n)); if (n > 0) this.data.stats.snailsEarned += n; this.markDirty(); }
  spend(n) { if (this.data.snails < n) return false; this.data.snails -= n; this.markDirty(); return true; }

  xpForLevel(l) { return 200 + (l - 1) * 120; }
  addXp(n) {
    const d = this.data; let ups = 0;
    d.xp += n;
    while (d.xp >= this.xpForLevel(d.level)) { d.xp -= this.xpForLevel(d.level); d.level++; ups++; }
    this.markDirty();
    return ups;
  }
  rankTitle(level = this.data.level) {
    const t = ['Plankton', 'Shrimpling', 'Tidepool Tough', 'Reef Brawler', 'Rust Pit Regular', 'Shell Shocker', 'Cavitation Captain', 'Abyssal Ace', 'Pit Legend', 'Mantis Monarch'];
    return t[Math.min(t.length - 1, Math.floor((level - 1) / 3))];
  }
  firstWinToday() { return this.data.lastWinDay !== todayKey(); }
}

export const Save = new SaveStore();
