// Game flow / navigation between screens. The locker room scene is built once and shared.
import { LockerRoom } from '../render/stages/lockerroom.js';
import { MenuFighter } from '../render/menuFighter.js';
import { Save, CHARS } from '../core/save.js';

export function ensureLocker(game) {
  if (!game.locker) game.locker = new LockerRoom(game.renderer);
  return game.locker;
}

// fighters living in the locker room (rebuilt when cosmetics change)
export function lockerFighters(game) {
  const L = ensureLocker(game);
  L.fighters ||= {};
  for (const c of CHARS) {
    const cos = Save.equipped(c);
    const key = JSON.stringify(cos);
    const cur = L.fighters[c];
    if (!cur || cur.cosKey !== key) {
      if (cur) cur.dispose();
      const mf = new MenuFighter(L.scene, c, cos, L.particles);
      mf.cosKey = key;
      L.fighters[c] = mf;
    }
  }
  return L.fighters;
}

export function rebuildFighter(game, c, cos) {
  const L = ensureLocker(game);
  const cur = L.fighters?.[c];
  const slot = cur?.slot;
  if (cur) cur.dispose();
  const mf = new MenuFighter(L.scene, c, cos, L.particles);
  mf.cosKey = JSON.stringify(cos);
  if (slot) mf.setSlot(slot);
  L.fighters[c] = mf;
  return mf;
}

export async function createMainFlow(game, params) {
  ensureLocker(game);
  lockerFighters(game);
  const { TitleScreen } = await import('./menu.js');
  if (params.get('skiptitle')) { const { MainMenuScreen } = await import('./menu.js'); return new MainMenuScreen(); }
  return new TitleScreen();
}

export async function goMainMenu(game, o = {}) {
  const { MainMenuScreen } = await import('./menu.js');
  game.setScreen(new MainMenuScreen(o), { kind: o.kind || 'bubbles' });
}
export async function goCharSelect(game, mode, o = {}) {
  const { CharSelectScreen } = await import('./select.js');
  game.setScreen(new CharSelectScreen(mode, o), { kind: o.kind || 'bubbles' });
}
export async function goMapVote(game, cfg) {
  const { MapVoteScreen } = await import('./mapvote.js');
  game.setScreen(new MapVoteScreen(cfg), { kind: 'fade', dur: 0.5 });
}
export async function goShop(game) {
  const { ShopScreen } = await import('./shop.js');
  game.setScreen(new ShopScreen(), { kind: 'fade', dur: 0.4 });
}
export async function goSettings(game, back) {
  const { SettingsScreen } = await import('./settings.js');
  game.setScreen(new SettingsScreen(back), { kind: 'fade', dur: 0.3 });
}
export async function goOnline(game) {
  const { OnlineScreen } = await import('./online.js');
  game.setScreen(new OnlineScreen(), { kind: 'bubbles' });
}

// Start a match. cfg: { mode, players:[{char,cos,name,cpu}], stage, net, localIndex }
export async function startMatch(game, cfg) {
  const { MatchScreen } = await import('./match.js');
  const { ResultsScreen } = await import('./results.js');
  const full = {
    rounds: Save.settings.rounds || 3, roundTime: Save.settings.roundTime || 99, qte: Save.settings.qte !== false,
    ...cfg,
  };
  const match = new MatchScreen({
    ...full,
    onEnd: (res) => { match.keepAlive = true; game.setScreen(new ResultsScreen(match, res, full), { instant: true }); },
    onQuit: () => { if (full.net) full.net.close?.(); goMainMenu(game); },
  });
  game.setScreen(match, { kind: 'planks' });
}
