// Post-match results over the arena: winner celebration, stats, snail rewards counting up,
// XP, challenges; then rematch / character select / main menu.
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { Save } from '../core/save.js';
import { applyMatchResult } from '../core/progress.js';
import { CHARS as CDATA } from '../sim/data.js';
import { startMatch, goCharSelect, goMainMenu } from './flow.js';
import { snailCounter } from '../ui/widgets.js';
import { portrait } from '../render/portraits.js';
import { clamp, ease } from '../core/math.js';
import { line } from '../data/dialogue.js';

export class ResultsScreen {
  constructor(match, res, cfg) { this.match = match; this.res = res; this.cfg = cfg; this.net = cfg.net || null; }
  enter() {
    const g = this.game;
    this.scene = this.match.scene; this.camera = this.match.camera;
    const mode = this.cfg.mode;
    const localPlayers = mode === 'local' ? [0, 1] : this.net ? [this.net.localIndex] : [0];
    this.rewards = applyMatchResult(this.res, { mode, localPlayers, stage: this.cfg.stage, cpuLevel: this.cfg.players[1]?.cpu });
    this.t = 0; this.sel = 0;
    this.shown = 0; this.counted = 0; this.startSnails = Save.data.snails - this.rewards.total;
    this.items = [
      { label: this.net ? 'REMATCH' : 'REMATCH', fn: () => this.rematch() },
      { label: 'CHARACTER SELECT', fn: () => this.toSelect() },
      { label: 'MAIN MENU', fn: () => { if (this.net) { this.net.send({ t: 'bye' }); this.net.close(); } goMainMenu(g); } },
    ];
    if (this.net) { this.net.onMessage = (m) => this.onNet(m); this.wantRematch = [false, false]; }
    const w = this.res.winner;
    const winnerName = w >= 0 ? (this.cfg.players[w].name || CDATA[this.res.fighters[w].char].name) : 'NOBODY';
    this.title = w >= 0 ? `${CDATA[this.res.fighters[w].char].name} WINS!` : 'DRAW!';
    this.sub = w >= 0 ? `${winnerName} takes the match ${this.res.wins[w]}-${this.res.wins[1 - w]}` : '';
    this.quote = w >= 0 ? line(this.res.fighters[w].char === 'bobby' && this.match.sim.s.fighters[w].cs.demon ? 'demon' : this.res.fighters[w].char, 'victory') : '';
    this.portrait = w >= 0 ? portrait(g.renderer, this.res.fighters[w].char, this.cfg.players[w].cos || {}, { size: 64, demon: this.match.sim.s.fighters[w].cs.demon }) : null;
    const mine = localPlayers.includes(w);
    Sound.music('results', { fade: 1 });
    if (mode !== 'local' && !mine && w >= 0) Sound.stinger('stinger_lose');
  }
  onNet(m) {
    if (m.t === 'rematch') { this.wantRematch[1 - this.net.localIndex] = true; this.game.toast('Opponent wants a rematch!', P.gold3); this.checkRematch(); }
    if (m.t === 'rematchGo') this.doRematch(m.seed);
    if (m.t === 'toSelect') goCharSelect(this.game, 'online', { net: this.net });
    if (m.t === 'bye') { this.game.toast('Opponent left', P.red4); this.net.close(); this.net = null; this.items[0].label = 'REMATCH (OFFLINE)'; }
  }
  rematch() {
    if (this.net) {
      this.wantRematch[this.net.localIndex] = true;
      this.net.send({ t: 'rematch' });
      this.checkRematch();
      return;
    }
    if (this.cfg.mode === 'online') { goMainMenu(this.game); return; }
    this.doRematch();
  }
  checkRematch() {
    if (this.wantRematch[0] && this.wantRematch[1] && this.net.isHost) {
      const seed = Math.floor(Math.random() * 1e9);
      this.net.send({ t: 'rematchGo', seed });
      this.doRematch(seed);
    }
  }
  doRematch(seed) {
    if (this.leaving) return; this.leaving = true;
    startMatch(this.game, { ...this.cfg, seed: seed ?? Math.floor(Math.random() * 1e9), skipIntro: true });
  }
  toSelect() {
    if (this.leaving) return; this.leaving = true;
    if (this.net) { this.net.send({ t: 'toSelect' }); goCharSelect(this.game, 'online', { net: this.net }); return; }
    goCharSelect(this.game, this.cfg.mode);
  }
  exit() { this.match.exit(); }
  update(dt, active) {
    this.t += dt;
    this.match.renderViews(dt, 1);
    // count up rewards
    const total = this.rewards.total;
    if (this.t > 1.2 && this.counted < total) {
      const step = Math.max(1, Math.round(total * dt * 0.8));
      this.counted = Math.min(total, this.counted + step);
      if (Math.floor(this.t * 14) !== Math.floor((this.t - dt) * 14)) Sound.sfx('ui_coin', { vol: 0.4, pitch: 0.9 + this.counted / Math.max(1, total) * 0.4 });
      if (this.counted === total) { Sound.sfx('ui_coins'); if (this.rewards.levelUps) Sound.sfx('ui_levelup'); if (this.rewards.challenges.length) Sound.sfx('ui_challenge'); }
    }
    if (!active || this.t < 0.8) return;
    const inp = this.game.input;
    if (inp.menu('left') || inp.menu('up')) { this.sel = (this.sel + this.items.length - 1) % this.items.length; Sound.sfx('ui_move'); }
    if (inp.menu('right') || inp.menu('down')) { this.sel = (this.sel + 1) % this.items.length; Sound.sfx('ui_move'); }
    if (inp.menu('confirm')) { Sound.sfx('ui_select'); this.items[this.sel].fn(); }
  }
  drawUI(ui) {
    const t = this.t;
    const a = clamp(t * 2, 0, 1);
    const W = ui.w, H = ui.h;
    ui.rect(0, 0, W, H, P.deep0, 0.35 * a);
    // board
    const bw = Math.min(W - 24, 420), bh = Math.min(H - 30, 210);
    const bx = Math.floor(W / 2 - bw / 2), by = Math.floor(H / 2 - bh / 2) + Math.round((1 - ease.outBack(a)) * 40);
    ui.rope(bx + 20, -2, bx + 20, by + 4, Math.floor(t * 3)); ui.rope(bx + bw - 21, -2, bx + bw - 21, by + 4, Math.floor(t * 3) + 1);
    ui.shadowRect(bx, by, bw, bh, 0.5);
    ui.panel(bx, by, bw, bh, { seed: 404, tone: 'mid', plankSize: 20, barnacles: 5, algae: 1 });
    ui.text(this.title, bx + bw / 2, by + 6, { font: 'huge', align: 'center', color: P.gold3, shadow: P.red1, wave: 1, waveSpeed: 4 });
    ui.text(this.sub, bx + bw / 2, by + 48, { font: 'labelB', align: 'center', color: P.cream3 });
    if (this.portrait) {
      ui.rect(bx + 10, by + 62, 68, 68, P.ink); ui.rect(bx + 12, by + 64, 64, 64, P.deep2);
      ui.img(this.portrait, bx + 12, by + 64);
      if (this.quote) ui.para(`"${this.quote}"`, bx + 10, by + 134, 74, { font: 'body', color: P.cream2 });
    }
    // stats table
    const sx = bx + 92, sy = by + 62;
    const rows = [['DAMAGE', 'dmg'], ['MAX COMBO', 'maxCombo'], ['PERFECT BLOCKS', 'perfects'], ['SHELLS BROKEN', null], ['MOLTS', 'molts'], ['ULTIMATES', 'ults'], ['ARENA SNAILS', 'snails']];
    ui.text('P1', sx + 120, sy, { font: 'labelB', color: PLAYER_COLORS[0].light, align: 'center' });
    ui.text('P2', sx + 160, sy, { font: 'labelB', color: PLAYER_COLORS[1].light, align: 'center' });
    rows.forEach(([lbl, k], i) => {
      const yy = sy + 12 + i * 10;
      ui.text(lbl, sx, yy, { font: 'label', color: P.cream3 });
      for (let p = 0; p < 2; p++) {
        const v = k ? (this.res.stats[p][k] || 0) : (this.res.stats[1 - p].shellBreaks || 0);
        ui.text(String(v), sx + 120 + p * 40, yy, { font: 'body', align: 'center', color: P.cream4 });
      }
    });
    // rewards (local profile)
    const rx = bx + bw - 130, ry = by + 62;
    if (this.cfg.mode !== 'training') {
      ui.text('REWARDS', rx, ry, { font: 'labelB', color: P.gold3 });
      this.rewards.snails.slice(0, 6).forEach((r, i) => {
        if (t < 1 + i * 0.25) return;
        ui.text(r.label, rx, ry + 12 + i * 10, { font: 'body', color: P.cream3 });
        ui.text('+' + r.n, rx + 122, ry + 12 + i * 10, { font: 'body', color: P.gold4, align: 'right' });
      });
      ui.text(`+${this.rewards.xp} XP`, rx, ry + 78, { font: 'labelB', color: P.teal5 });
      if (this.rewards.levelUps) ui.text('LEVEL UP!', rx + 70, ry + 78, { font: 'labelB', color: P.gold4, wave: 1 });
    }
    snailCounter(ui, W - 8, 8, { value: this.startSnails + this.counted, bump: this.counted < this.rewards.total ? 1 : 0 });
    // buttons
    const btnW = Math.floor((bw - 40) / 3);
    this.items.forEach((it, i) => {
      const x = bx + 12 + i * (btnW + 8), y = by + bh - 26;
      let label = it.label;
      if (i === 0 && this.net && this.wantRematch?.[this.net.localIndex]) label = 'WAITING...';
      const r = ui.plank(x, y, btnW, 17, label, { selected: i === this.sel, seed: 300 + i, noPointer: true });
      if (r.hover && ui.mouse.moved) this.sel = i;
      if (r.clicked) { Sound.sfx('ui_select'); it.fn(); }
    });
  }
}
