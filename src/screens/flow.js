// Game flow / navigation between screens. The bar lobby world is built once and shared.
import { getLobby } from '../px/lobby.js';
import { Save, CHARS } from '../core/save.js';
import { TitleScreen, MainMenuScreen } from './menu.js';
import { CharSelectScreen } from './select.js';
import { MapVoteScreen } from './mapvote.js';
import { ShopScreen } from './shop.js';
import { SettingsScreen } from './settings.js';
import { OnlineScreen } from './online.js';
import { MatchScreen } from './match.js';
import { ResultsScreen } from './results.js';

export function ensureLobby() { return getLobby(); }
// fighters hanging out in the bar (rebuilt when cosmetics change)
export function lobbyFighters() {
  const L = getLobby();
  const map = {};
  for (const c of CHARS) map[c] = Save.equipped(c);
  return L.fighters(map);
}
export function rebuildFighter(game, c, cos) {
  const L = getLobby();
  const map = {};
  for (const k of CHARS) map[k] = k === c ? cos : (L.F[k]?.cos || Save.equipped(k));
  L.fighters(map);
  return L.F[c];
}

export async function createMainFlow(game, params) {
  ensureLobby(); lobbyFighters();
  if (params.get('skiptitle')) return new MainMenuScreen();
  return new TitleScreen();
}

export async function goMainMenu(game, o = {}) { game.setScreen(new MainMenuScreen(o), { kind: o.kind || 'bubbles' }); }
export async function goCharSelect(game, mode, o = {}) { game.setScreen(new CharSelectScreen(mode, o), { kind: o.kind || 'bubbles' }); }
export async function goMapVote(game, cfg) { game.setScreen(new MapVoteScreen(cfg), { kind: 'fade', dur: 0.5 }); }
export async function goShop(game) { game.setScreen(new ShopScreen(), { kind: 'fade', dur: 0.4 }); }
export async function goSettings(game, back) { game.setScreen(new SettingsScreen(back), { kind: 'fade', dur: 0.3 }); }
export async function goOnline(game) { game.setScreen(new OnlineScreen(), { kind: 'bubbles' }); }

// Start a match. cfg: { mode, players:[{char,cos,name,cpu}], stage, net, localIndex }
export async function startMatch(game, cfg) {
  const full = { rounds: Save.settings.rounds || 3, roundTime: Save.settings.roundTime || 99, qte: Save.settings.qte !== false, ...cfg };
  const match = new MatchScreen({
    ...full,
    onEnd: (res) => { match.keepAlive = true; game.setScreen(new ResultsScreen(match, res, full), { instant: true }); },
    onQuit: () => { if (full.net) full.net.close?.(); goMainMenu(game); },
  });
  game.setScreen(match, { kind: 'planks' });
}
