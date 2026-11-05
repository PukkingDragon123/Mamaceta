// Map vote: two huge rusty bulkhead doors with the arena names. Pick a door; ties go to a roulette.
import { ensureLobby, lobbyFighters, startMatch, goMainMenu } from './flow.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { CHARS } from '../core/save.js';
import { STAGES, STAGE_LIST } from '../sim/stages.js';
import { clamp, ease } from '../core/math.js';
import { porthole } from '../ui/sprites.js';
import { hintBar } from '../ui/widgets.js';

const NAMES = ['THE RUST PIT', 'SOGGY BOTTOM CANTINA'];
const SUBS = ['catwalks, barrels, bubble vents', 'drinks, tables, a pinata'];

export class MapVoteScreen {
  constructor(cfg) { this.cfg = cfg; this.net = cfg.net || null; }
  enter() {
    const g = this.game;
    this.L = ensureLobby();
    const F = lobbyFighters();
    for (const c of CHARS) F[c].visible = false;
    this.doors = this.L.bar.spots?.doors || [{ x: 16, y: 1.8 }, { x: 20, y: 1.8 }];
    this.L.setCam('doors', 1.6, { drift: 0.02 });
    this.L.bar.setDoor?.(0, 0); this.L.bar.setDoor?.(1, 0);
    this.doorOpen = [0, 0];
    this.p = [{ door: 0, voted: false }, { door: 1, voted: false }];
    this.local = this.cfg.mode === 'local';
    this.cpu = this.cfg.mode === 'cpu';
    if (this.cpu) this.cpuT = 1 + Math.random() * 1.5;
    if (this.net) { this.localIdx = this.net.localIndex; this.net.onMessage = (m) => this.onNet(m); }
    this.time = 9; this.t = 0; this.phase = 'vote'; this.result = -1; this.roul = null;
    g.input.mode = this.local ? 'versus' : 'solo';
    Sound.music('doors', { fade: 1 });
  }
  exit() { this.game.input.mode = 'solo'; for (const c of CHARS) if (this.L.F[c]) this.L.F[c].visible = true; }
  render(d) { this.d = d; this.L.render(d); }
  controls(i) { if (this.net) return i === this.localIdx; if (this.cpu) return i === 0; return true; }
  vote(i, door) {
    const p = this.p[i];
    if (p.voted) return;
    p.door = door; p.voted = true;
    Sound.sfx('ui_vote'); Sound.sfx('metal_clang', { vol: 0.4 });
    this.L.cam.addTrauma(0.3);
    if (this.net && i === this.localIdx) this.net.send({ t: 'vote', door });
  }
  onNet(m) {
    if (m.t === 'vote') { const p = this.p[1 - this.localIdx]; p.door = m.door; p.voted = true; Sound.sfx('ui_vote'); }
    if (m.t === 'voteMove') { this.p[1 - this.localIdx].door = m.door; }
    if (m.t === 'voteDone') this.begin(m.result, m.seed, m.roulette);
    if (m.t === 'bye') { this.game.toast('Opponent left', P.red4); this.net.close(); goMainMenu(this.game); }
  }
  resolve() {
    if (this.phase !== 'vote') return;
    const a = this.p[0].door, b = this.p[1].door;
    const roulette = a !== b;
    const result = roulette ? (Math.random() < 0.5 ? a : b) : a;
    const seed = Math.floor(Math.random() * 1e9);
    if (this.net) this.net.send({ t: 'voteDone', result, seed, roulette });
    this.begin(result, seed, roulette);
  }
  begin(result, seed, roulette) {
    if (this.phase !== 'vote') return;
    this.result = result; this.seed = seed;
    this.phase = roulette ? 'roulette' : 'open';
    this.roul = { t: 0, cur: 0, next: 0.08, steps: 14 + result + (14 % 2 === result ? 0 : 1) };
    if (!roulette) this.openDoor();
  }
  openDoor() {
    this.phase = 'open'; this.openT = 0;
    const d = this.doors[this.result];
    Sound.sfx('ui_door_creak');
    this.L.cam.addTrauma(0.5);
    this.L.setCam({ x: d.x, y: d.y || 2, zoom: 2.2 }, 0.9, { drift: 0.1 });
  }
  update(dt, active) {
    this.t += dt;
    this.L.update(dt);
    for (let i = 0; i < 2; i++) this.L.bar.doorVotes?.(i, this.p.filter((q) => q.door === i).length);
    if (this.phase === 'open') { this.doorOpen[this.result] = Math.min(1, this.doorOpen[this.result] + dt * 0.9); this.L.bar.setDoor?.(this.result, ease.inOutSine(this.doorOpen[this.result])); }
    if (this.phase === 'vote') {
      this.time -= dt;
      if (this.cpu && !this.p[1].voted) { this.cpuT -= dt; if (this.cpuT <= 0) this.vote(1, Math.random() < 0.5 ? 0 : 1); }
      if (active) {
        const inp = this.game.input;
        for (let i = 0; i < 2; i++) {
          if (!this.controls(i) || this.p[i].voted) continue;
          const who = this.local ? i : 'any';
          if (inp.menu('left', who) || inp.menu('right', who)) { this.p[i].door = 1 - this.p[i].door; Sound.sfx('ui_move'); if (this.net) this.net.send({ t: 'voteMove', door: this.p[i].door }); }
          if (inp.menu('confirm', who)) this.vote(i, this.p[i].door);
        }
        const ui = this.game.ui;
        if (ui.mouse.clicked) { const me = this.net ? this.localIdx : 0; this.vote(me, ui.mouse.x < ui.w / 2 ? 0 : 1); }
      }
      const host = !this.net || this.net.isHost;
      if (host && ((this.p[0].voted && this.p[1].voted) || this.time <= 0)) {
        for (let i = 0; i < 2; i++) if (!this.p[i].voted) this.p[i].voted = true;
        this.resolve();
      }
    } else if (this.phase === 'roulette') {
      const r = this.roul;
      r.t += dt;
      if (r.t >= r.next) {
        r.t = 0; r.cur++; r.next *= 1.13;
        Sound.sfx('ui_roulette');
        if (r.cur >= r.steps) { this.openDoor(); }
      }
    } else if (this.phase === 'open') {
      this.openT += dt;
      const dr = this.doors[this.result];
      if (this.openT > 0.6 && Math.random() < 0.5) this.L.fx.bubbleBurst(dr.x + (Math.random() - 0.5) * 2, 0.3 + Math.random() * 3, 2, 0.8);
      if (this.openT > 1.2 && !this.pushed) { this.pushed = true; this.L.setCam({ x: dr.x, y: dr.y || 2, zoom: 4.5 }, 1.0); }
      if (this.openT > 2.1 && !this.started) {
        this.started = true;
        startMatch(this.game, { mode: this.cfg.mode, players: this.cfg.players, stage: STAGE_LIST[this.result], net: this.net, seed: this.seed, localIndex: this.localIdx });
      }
    }
  }
  drawUI(ui) {
    const t = this.t;
    ui.text('PICK A DOOR', ui.w / 2, 6, { font: 'big', align: 'center', color: P.gold3, shadow: P.ink });
    if (this.phase === 'vote') {
      const tr = 15, tx = ui.w / 2;
      ui.rect(tx - tr + 3, 28 + 3, tr * 2 - 4, tr * 2 - 4, P.deep1);
      ui.img(porthole(tr, { seed: 3, tone: 'rust', bolts: 6 }), tx - tr - 1, 27);
      ui.text(String(Math.max(0, Math.ceil(this.time))), tx, 34, { font: 'big', align: 'center', color: P.cream4 });
    }
    for (let i = 0; i < 2; i++) {
      const d = this.doors[i];
      if (!this.d) continue;
      const p = this.d.toUI(d.x, (d.y || 2) + 1.9, ui);
      const sx = Math.round(p.x), sy = Math.round(p.y);
      const lit = this.phase === 'roulette' ? (this.roul.cur % 2 === i) : this.phase === 'open' ? i === this.result : this.p.some((q) => q.door === i);
      const w = Math.max(ui.measure(NAMES[i], 'labelB') + 14, 96);
      ui.panel(sx - w / 2, sy - 14, w, 28, { seed: 100 + i, tone: lit ? 'light' : 'dark', plankSize: 14, barnacles: 2 });
      ui.text(NAMES[i], sx, sy - 9, { font: 'labelB', align: 'center', color: lit ? P.gold4 : P.cream2 });
      ui.text(SUBS[i], sx, sy + 3, { font: 'body', align: 'center', color: P.cream1 });
      // player badges on the door
      const fp = this.d.toUI(d.x, 0.9, ui);
      const fx = Math.round(fp.x), fy = Math.round(fp.y);
      this.p.forEach((q, k) => {
        if (q.door !== i || this.phase !== 'vote') return;
        const col = PLAYER_COLORS[k];
        const bx = fx + (k === 0 ? -16 : 16) - 10, by = fy + Math.round(Math.sin(t * 6 + k) * 2);
        ui.rect(bx - 1, by - 1, 22, 14, P.ink); ui.rect(bx, by, 20, 12, q.voted ? col.dark : col.main);
        ui.text(this.cpu && k === 1 ? 'CPU' : `${k + 1}P`, bx + 10, by + 2, { font: 'labelB', align: 'center', color: P.white });
        if (q.voted) ui.icon('check', bx + 14, by - 6);
      });
    }
    if (this.phase === 'roulette') ui.text('TIE! SPINNING...', ui.w / 2, ui.h - 40, { font: 'big', align: 'center', color: P.cream4 });
    if (this.phase === 'open') ui.text(STAGES[STAGE_LIST[this.result]].name, ui.w / 2, ui.h - 46, { font: 'huge', align: 'center', color: P.gold3, shadow: P.ink, alpha: clamp(this.openT * 2, 0, 1) });
    if (this.phase === 'vote') hintBar(ui, [[['<', '>'], 'CHOOSE DOOR'], [['OK'], 'VOTE']], { x: Math.floor(ui.w / 2) - 80, y: ui.h - 12 });
  }
}
