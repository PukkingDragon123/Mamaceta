// Character select in the bar: all four fighters line up, 16-second timer, per-player cursors +
// live customization, then a cinematic versus face-off with banter.
import { ensureLobby, lobbyFighters, rebuildFighter, goMainMenu, goMapVote, startMatch } from './flow.js';
import { MenuFighter2D } from '../px/menuFighter.js';
import { P, PLAYER_COLORS, RARITY } from '../ui/palette.js';
import { pips, hintBar, rarityTag } from '../ui/widgets.js';
import { Save, CHARS } from '../core/save.js';
import { Sound } from '../core/sound.js';
import { CHARS as CDATA } from '../sim/data.js';
import { slotList, itemId, SLOT_NAMES } from '../data/cosmetics.js';
import { VERSUS_LINES, line } from '../data/dialogue.js';
import { clamp, ease } from '../core/math.js';
import { keyLabel } from '../core/input.js';
import { porthole } from '../ui/sprites.js';

const ROWS = ['skin', 'gloves', 'hitfx', 'trail', 'victory', 'ready'];
const STATS = {
  jim: { HP: 3, SHELL: 3, SPEED: 3, POWER: 3, DIFFICULTY: 2 },
  brutus: { HP: 5, SHELL: 5, SPEED: 1, POWER: 5, DIFFICULTY: 2 },
  bobby: { HP: 2, SHELL: 1, SPEED: 4, POWER: 2, DIFFICULTY: 5 },
  mimi: { HP: 3, SHELL: 2, SPEED: 3, POWER: 3, DIFFICULTY: 1 },
};
const ORDER = ['jim', 'brutus', 'bobby', 'mimi'];

export class CharSelectScreen {
  constructor(mode, o = {}) { this.mode = mode; this.o = o; this.net = o.net || null; }

  enter() {
    const g = this.game;
    this.L = ensureLobby();
    this.F = lobbyFighters();
    this.L.selectAll();
    for (const c of CHARS) this.F[c].react = null;
    this.L.setCam('select', 1.2, { drift: 0.02 });
    this.time = 16; this.t = 0;
    const local = this.mode === 'local';
    const mkP = (i) => ({ cursor: i === 0 ? ORDER.indexOf(Save.data.mainFighter) : (ORDER.indexOf(Save.data.mainFighter) + 2) % 4, stage: 'pick', row: 0, cos: null, ready: false, cpu: false, remote: false, bob: 0 });
    this.p = [mkP(0), mkP(1)];
    if (this.mode === 'cpu') { this.p[1].cpu = true; this.cpuT = 1.2 + Math.random(); }
    if (this.mode === 'training') { this.p[1].stage = 'wait'; this.trainPhase = 0; }
    if (this.net) {
      this.localIdx = this.net.localIndex;
      this.p[1 - this.localIdx].remote = true;
      this.net.onMessage = (m) => this.onNet(m);
    }
    this.phase = 'select'; // select -> versus
    this.vs = null;
    g.input.mode = local ? 'versus' : 'solo';
    Sound.music('select', { fade: 1 });
    this.tickPrev = 16;
  }
  exit() {
    if (this.vsFighters) this.L.extra = this.L.extra.filter((e) => !this.vsFighters.includes(e));
    this.game.input.mode = 'solo';
  }
  render(d) { this.d = d; this.L.render(d); }

  who(i) {
    if (this.mode === 'local') return i;
    return 'any';
  }
  controls(i) {
    if (this.p[i].cpu || this.p[i].remote) return false;
    if (this.mode === 'local') return true;
    if (this.net) return i === this.localIdx;
    if (this.mode === 'training') return i === (this.trainPhase === 0 ? 0 : 1);
    return i === 0;
  }

  ownedOptions(slot, char) {
    return slotList(slot, char).filter((it) => Save.owns(itemId(slot, char, it.key)));
  }
  lock(i) {
    const p = this.p[i];
    const c = ORDER[p.cursor];
    p.stage = 'custom'; p.row = 0;
    p.cos = { ...Save.equipped(c) };
    if (p.cpu || p.remote) p.cos = p.cpu ? this.randomCos(c) : p.cos;
    this.F[c].doReact('locked');
    Sound.sfx('ui_lock_in');
    this.say(c, line(c, 'select'));
    this.send();
  }
  randomCos(c) {
    const pick = (slot) => { const o = this.ownedOptions(slot, c); return Math.random() < 0.6 ? 'default' : o[Math.floor(Math.random() * o.length)].key; };
    return { skin: pick('skin'), gloves: 'default', hitfx: 'classic', trail: 'none', victory: 'default' };
  }
  say(c, txt) { if (!txt) return; this.speech = { c, txt, t: 0 }; Sound.voice(c, txt); }
  changeCos(i, dir) {
    const p = this.p[i];
    const c = ORDER[p.cursor];
    const slot = ROWS[p.row];
    if (slot === 'ready') return;
    const opts = this.ownedOptions(slot, c);
    if (opts.length <= 1) { Sound.sfx('ui_error', { vol: 0.5 }); return; }
    let idx = opts.findIndex((o) => o.key === p.cos[slot]);
    idx = (idx + dir + opts.length) % opts.length;
    p.cos[slot] = opts[idx].key;
    Sound.sfx('ui_equip', { vol: 0.7 });
    if (slot === 'skin' || slot === 'gloves') {
      // only one of the players may change the shared locker model; mirror picks get their own model at versus time
      const other = this.p[1 - i];
      if (!(other.stage !== 'pick' && ORDER[other.cursor] === c)) { const f = rebuildFighter(this.game, c, p.cos); this.F = this.L.F; f.setSpot(this.L.spots.select[c]); f.setActivity('guard'); f.doReact('locked'); }
    }
    this.send();
  }
  setReady(i) {
    const p = this.p[i];
    p.ready = true; p.stage = 'ready';
    Sound.sfx('ui_select');
    this.F[ORDER[p.cursor]].doReact('pick');
    this.send();
    if (this.mode === 'training' && this.trainPhase === 0) { this.trainPhase = 1; this.p[1].stage = 'pick'; this.p[1].cursor = (p.cursor + 1) % 4; }
  }

  // ---------------------------------------------------------------- networking
  send() {
    if (!this.net) return;
    const p = this.p[this.localIdx];
    this.net.send({ t: 'sel', cursor: p.cursor, stage: p.stage, row: p.row, cos: p.cos, ready: p.ready });
  }
  onNet(m) {
    if (m.t === 'sel') {
      const p = this.p[1 - this.localIdx];
      const changedChar = p.cursor !== m.cursor;
      p.cursor = m.cursor; p.row = m.row; p.ready = m.ready;
      if (p.stage === 'pick' && m.stage !== 'pick') { this.F[ORDER[p.cursor]].doReact('locked'); Sound.sfx('ui_lock_in'); }
      p.stage = m.stage; p.cos = m.cos;
      if (changedChar) Sound.sfx('ui_move', { vol: 0.5 });
    }
    if (m.t === 'selDone') this.beginVersus(m.picks);
    if (m.t === 'bye') { this.game.toast('Opponent left the lobby', P.red4); this.net.close(); goMainMenu(this.game); }
  }

  // ---------------------------------------------------------------- update
  update(dt, active) {
    this.t += dt;
    this.L.update(dt);
    // camera leans toward whoever P1 is hovering
    if (this.phase === 'select' && !this.camLean) this.camLean = 0;
    if (this.phase === 'select') {
      const sp = this.L.spots.select[ORDER[this.p[0].cursor]];
      const base = this.L.camOf('select');
      const tx = base.x + (sp.x - base.x) * 0.25;
      if (Math.abs((this.lastLean ?? 99) - tx) > 0.01) { this.lastLean = tx; this.L.setCam({ x: tx, y: base.y, zoom: base.zoom * 1.04 }, 0.6, { drift: 0.01 }); }
    }
    if (this.speech) { this.speech.t += dt; if (this.speech.t > 3) this.speech = null; }
    if (this.phase === 'versus') { this.updateVersus(dt, active); return; }
    // timer
    const isHostAuthority = !this.net || this.net.isHost;
    this.time -= dt;
    if (Math.ceil(this.time) !== this.tickPrev && this.time > 0) { this.tickPrev = Math.ceil(this.time); if (this.time < 5.5) Sound.sfx('ui_timer_tick'); }
    if (this.time <= 0) { // every client auto-readies its own local players; the host then starts the versus
      for (let i = 0; i < 2; i++) { const p = this.p[i]; if (p.remote) continue; if (p.stage === 'pick') this.lock(i); if (!p.ready && p.stage !== 'wait') this.setReady(i); }
      if (this.mode === 'training' && this.trainPhase === 1 && !this.p[1].ready) { if (this.p[1].stage === 'pick') this.lock(1); this.setReady(1); }
    }
    // CPU behaviour
    if (this.mode === 'cpu') {
      this.cpuT -= dt;
      const p = this.p[1];
      if (this.cpuT <= 0 && !p.ready) {
        if (p.stage === 'pick') {
          if (Math.random() < 0.55) { p.cursor = (p.cursor + (Math.random() < 0.5 ? 1 : 3)) % 4; Sound.sfx('ui_move', { vol: 0.4 }); this.cpuT = 0.35 + Math.random() * 0.4; }
          else { this.lock(1); this.cpuT = 0.8; }
        } else if (p.stage === 'custom') { this.setReady(1); }
      }
    }
    if (!active) return;
    const inp = this.game.input;
    for (let i = 0; i < 2; i++) {
      if (!this.controls(i)) continue;
      const p = this.p[i];
      const who = this.who(i);
      if (p.stage === 'pick') {
        if (inp.menu('left', who)) { p.cursor = (p.cursor + 3) % 4; Sound.sfx('ui_move'); this.F[ORDER[p.cursor]].doReact('wave'); this.send(); }
        if (inp.menu('right', who)) { p.cursor = (p.cursor + 1) % 4; Sound.sfx('ui_move'); this.F[ORDER[p.cursor]].doReact('wave'); this.send(); }
        if (inp.menu('confirm', who)) this.lock(i);
        if (inp.menu('back', who)) {
          if (this.mode === 'training' && i === 1) { this.trainPhase = 0; this.p[1].stage = 'wait'; this.p[0].ready = false; this.p[0].stage = 'custom'; Sound.sfx('ui_back'); }
          else if (this.mode !== 'local' || i === 0) { Sound.sfx('ui_back'); if (this.net) { this.net.send({ t: 'bye' }); this.net.close(); } goMainMenu(this.game); return; }
        }
      } else if (p.stage === 'custom') {
        if (inp.menu('up', who)) { p.row = (p.row + ROWS.length - 1) % ROWS.length; Sound.sfx('ui_move'); this.send(); }
        if (inp.menu('down', who)) { p.row = (p.row + 1) % ROWS.length; Sound.sfx('ui_move'); this.send(); }
        if (inp.menu('left', who)) this.changeCos(i, -1);
        if (inp.menu('right', who)) this.changeCos(i, 1);
        if (inp.menu('confirm', who)) { if (ROWS[p.row] === 'ready') this.setReady(i); else { p.row = ROWS.length - 1; Sound.sfx('ui_move'); this.send(); } }
        if (inp.menu('back', who)) { p.stage = 'pick'; Sound.sfx('ui_back'); this.send(); }
      } else if (p.stage === 'ready') {
        if (inp.menu('back', who)) { p.stage = 'custom'; p.ready = false; Sound.sfx('ui_back'); this.send(); if (this.mode === 'training' && i === 0) { this.trainPhase = 0; this.p[1].stage = 'wait'; } }
      }
    }
    // mouse: click a fighter to hover/lock for P1 (or the local online player)
    const ui = this.game.ui;
    const me = this.net ? this.localIdx : (this.mode === 'training' && this.trainPhase === 1 ? 1 : 0);
    if (ui.mouse.clicked && this.p[me].stage === 'pick') {
      const hit = this.fighterAtMouse(ui);
      if (hit >= 0) { if (this.p[me].cursor === hit) this.lock(me); else { this.p[me].cursor = hit; Sound.sfx('ui_move'); this.send(); } }
    }
    // everyone ready?
    const allReady = this.mode === 'training' ? (this.p[0].ready && this.p[1].ready) : (this.p[0].ready && this.p[1].ready);
    if (allReady && isHostAuthority && !this.sentDone) {
      this.sentDone = true;
      const picks = this.p.map((p) => ({ char: ORDER[p.cursor], cos: p.cos || Save.equipped(ORDER[p.cursor]) }));
      if (this.net) this.net.send({ t: 'selDone', picks });
      if (this.mode === 'training') { this.picks = picks; this.finishSelect(); return; }
      this.beginVersus(picks);
    }
  }

  fighterAtMouse(ui) {
    let best = -1, bd = 40;
    ORDER.forEach((c, i) => {
      const f = this.F[c];
      const p = this.project(f.x, f.y + 0.9, ui);
      const d = Math.hypot(p.x - ui.mouse.x, p.y - ui.mouse.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  project(x, y, ui) { if (!this.d) return { x: 0, y: 0 }; const p = this.d.toUI(x, y, ui); return { x: Math.round(p.x), y: Math.round(p.y) }; }

  // ---------------------------------------------------------------- versus sequence
  beginVersus(picks) {
    if (this.phase === 'versus') return;
    this.phase = 'versus';
    this.picks = picks;
    for (const c of CHARS) this.F[c].visible = false;
    const vs = this.L.spots.versus;
    this.vsFighters = picks.map((pk, i) => {
      const mf = new MenuFighter2D(pk.char, pk.cos);
      mf.setSpot(vs[i]); mf.setActivity('guard');
      mf.doReact('locked');
      return mf;
    });
    this.L.extra.push(...this.vsFighters);
    this.L.setCam('versus', 0.9, { drift: 0.05 });
    const key = picks[0].char + '|' + picks[1].char;
    const lines = VERSUS_LINES[key]?.[0] || [line(picks[0].char, 'intro'), line(picks[1].char, 'intro')];
    this.vs = { t: 0, lines, step: -1, stepT: 0 };
    Sound.stinger('stinger_round');
  }
  updateVersus(dt, active) {
    const v = this.vs;
    v.t += dt; v.stepT += dt;
    // cinematic: close-up on each speaker, then pull back for the stare-down
    const closeUp = (i) => { const h = this.vsFighters[i].headPos(); this.L.setCam({ x: h.x + (i === 0 ? 0.9 : -0.9), y: h.y - 0.25, zoom: 3.6 }, 0.5, { drift: 0.1 }); };
    if (v.step === -1 && v.t > 0.6) { v.step = 0; v.stepT = 0; Sound.voice(this.picks[0].char, v.lines[0]); this.vsFighters[0].doReact('talk'); closeUp(0); }
    if (v.step === 0 && v.stepT > 2.2) { v.step = 1; v.stepT = 0; Sound.voice(this.picks[1].char, v.lines[1]); this.vsFighters[1].doReact('talk'); closeUp(1); }
    if (v.step === 1 && v.stepT > 2.2) { v.step = 2; v.stepT = 0; this.vsFighters.forEach((f) => f.doReact('locked')); Sound.sfx('ui_lock_in'); this.L.setCam('versus', 0.35, { zk: 1.15 }); this.L.cam.addTrauma(0.4); }
    const skip = active && (this.game.input.menu('confirm') || this.game.ui.mouse.clicked) && v.t > 0.8 && !this.net;
    if ((v.step === 2 && v.stepT > 1.0) || skip) this.finishSelect();
  }
  finishSelect() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    const players = this.picks.map((pk, i) => ({
      char: pk.char, cos: pk.cos,
      name: this.net ? (i === this.localIdx ? Save.data.name : (this.net.remoteName || 'RIVAL')) : (this.mode === 'local' ? `P${i + 1}` : i === 0 ? Save.data.name : (this.mode === 'training' ? 'DUMMY' : 'CPU')),
      cpu: this.mode === 'cpu' && i === 1 ? (Save.settings.cpuLevel || 2) : null,
    }));
    if (this.mode === 'training') { startMatch(g, { mode: 'training', players, stage: 'rustpit', skipIntro: true }); return; }
    goMapVote(g, { mode: this.mode, players, net: this.net });
  }

  // ---------------------------------------------------------------- UI
  drawUI(ui) {
    if (this.phase === 'versus') return this.drawVersus(ui);
    const t = this.t;
    // header sign + timer
    const title = this.mode === 'training' ? (this.trainPhase === 1 ? 'CHOOSE THE DUMMY' : 'CHOOSE YOUR FIGHTER') : 'CHOOSE YOUR FIGHTER';
    const hw = ui.measure(title, 'big') + 40;
    ui.hangingSign(Math.floor(ui.w / 2 - hw / 2), 6, hw, 26, { seed: 3, sway: 1 });
    ui.text(title, ui.w / 2, 10, { font: 'big', align: 'center', color: P.gold3, shadow: P.ink });
    const tr = 16;
    const tx = Math.floor(ui.w / 2) + Math.floor(hw / 2) + 14;
    ui.rect(tx - tr + 3, 6 + 3, tr * 2 - 4, tr * 2 - 4, P.deep1);
    ui.img(porthole(tr, { seed: 2, tone: 'rust', bolts: 6 }), tx - tr - 1, 5);
    const tl = Math.max(0, Math.ceil(this.time));
    ui.text(String(tl), tx, 13, { font: 'big', align: 'center', color: tl <= 5 ? (Math.floor(t * 4) % 2 ? P.red4 : P.cream4) : P.cream4 });
    // name tags + cursors above fighters
    ORDER.forEach((c, i) => {
      const f = this.F[c];
      const hh = f.headPos();
      const p = this.project(hh.x, hh.y + (c === 'bobby' ? 0.75 : 0.62), ui);
      const nm = CDATA[c].name;
      const tw = ui.measure(nm, 'labelB') + 12;
      const hovered = this.p.some((q) => q.cursor === i && q.stage !== 'wait');
      ui.panel(p.x - tw / 2, p.y, tw, 13, { seed: 70 + i, tone: hovered ? 'light' : 'dark', plankSize: 13, barnacles: 0, algae: 0, moss: 0 });
      ui.text(nm, p.x, p.y + 3, { font: 'labelB', align: 'center', color: hovered ? P.gold4 : P.cream2 });
      // cursors
      for (let k = 0; k < 2; k++) {
        const q = this.p[k];
        if (q.cursor !== i || q.stage === 'wait') continue;
        const both = this.p[0].cursor === this.p[1].cursor && this.p[0].stage !== 'wait' && this.p[1].stage !== 'wait';
        const ox = both ? (k === 0 ? -12 : 12) : 0;
        const bob = Math.round(Math.sin(t * 7 + k) * 2);
        const col = PLAYER_COLORS[k];
        const lbl = q.cpu ? 'CPU' : (this.mode === 'training' && k === 1) ? 'DMY' : `${k + 1}P`;
        const bw = ui.measure(lbl, 'labelB') + 8;
        const by = p.y - 18 + bob;
        ui.rect(p.x + ox - bw / 2 - 1, by - 1, bw + 2, 13, P.ink);
        ui.rect(p.x + ox - bw / 2, by, bw, 11, q.stage === 'pick' ? col.main : col.dark);
        ui.text(lbl, p.x + ox, by + 2, { font: 'labelB', align: 'center', color: P.white });
        ui.rect(p.x + ox - 2, by + 11, 4, 3, q.stage === 'pick' ? col.main : col.dark);
        if (q.stage !== 'pick') ui.icon('check', p.x + ox + bw / 2 - 2, by - 6);
      }
    });
    // player panels
    for (let i = 0; i < 2; i++) this.drawPanel(ui, i);
    // hints
    const b = Save.settings.bindings;
    if (this.mode === 'local') ui.text(`P1: ${keyLabel(b.p1.left[0])}/${keyLabel(b.p1.right[0])} move  ${keyLabel(b.p1.light[0])} ok  ${keyLabel(b.p1.heavy[0])} back      P2: ARROWS move  ${keyLabel(b.p2.light[0])} ok  ${keyLabel(b.p2.heavy[0])} back`, ui.w / 2, ui.h - 10, { font: 'label', align: 'center', color: P.cream2 });
    else hintBar(ui, [[['<', '>'], 'CHOOSE'], [['^', 'v'], 'CUSTOMIZE'], [[keyLabel(b.p1.light[0]), 'ENT'], 'OK'], [[keyLabel(b.p1.heavy[0]), 'ESC'], 'BACK']], { x: Math.floor(ui.w / 2) - 140, y: ui.h - 12 });
    if (this.speech) {
      const f = this.F[this.speech.c];
      const hh = f.headPos();
      const p = this.project(hh.x, hh.y + 0.9, ui);
      const s = this.speech.txt.slice(0, Math.floor(this.speech.t * 40));
      const lines = ui.wrap(s, 120, 'body');
      const w = Math.max(10, ...lines.map((l) => ui.measure(l, 'body'))) + 10, h = lines.length * 9 + 7;
      const bx = clamp(p.x - w / 2, 4, ui.w - w - 4), by = clamp(p.y - h - 22, 36, ui.h);
      ui.rect(bx - 1, by - 1, w + 2, h + 2, P.ink); ui.rect(bx, by, w, h, P.cream3);
      lines.forEach((l, k) => ui.text(l, bx + 5, by + 4 + k * 9, { font: 'body', color: P.ink, outline: null }));
    }
  }

  drawPanel(ui, i) {
    const p = this.p[i];
    if (p.stage === 'wait') return;
    const c = ORDER[p.cursor];
    const col = PLAYER_COLORS[i];
    const w = Math.min(176, Math.floor(ui.w * 0.36)), h = p.stage === 'pick' ? 84 : 108;
    const x = i === 0 ? 8 : ui.w - 8 - w, y = ui.h - 20 - h;
    ui.shadowRect(x, y, w, h, 0.5);
    ui.panel(x, y, w, h, { seed: 80 + i, tone: i === 0 ? 'red' : 'blue', plankSize: 18, barnacles: 2, algae: 0.6 });
    const lbl = p.cpu ? 'CPU' : p.remote ? (this.net?.remoteName || 'RIVAL') : (this.mode === 'training' && i === 1 ? 'DUMMY' : (this.net ? Save.data.name : `PLAYER ${i + 1}`));
    ui.text(lbl, x + 6, y + 5, { font: 'labelB', color: col.light });
    ui.text(CDATA[c].name, x + w - 6, y + 3, { font: 'big', align: 'right', color: P.cream4, shadow: P.ink });
    ui.text(CDATA[c].species, x + 8, y + 23, { font: 'body', color: P.teal5 });
    if (p.stage === 'pick') {
      const st = STATS[c];
      ui.text(CDATA[c].title, x + 8, y + 32, { font: 'body', color: P.gold4 });
      Object.entries(st).forEach(([k, v], j) => {
        ui.text(k, x + 8, y + 44 + j * 7, { font: 'label', color: P.cream3 });
        pips(ui, x + 76, y + 45 + j * 7, v, 5, k === 'DIFFICULTY' ? P.red3 : P.gold3);
      });
      return;
    }
    // customization rows
    ROWS.forEach((slot, j) => {
      const ry = y + 34 + j * 12;
      const selRow = p.row === j && p.stage === 'custom';
      if (selRow) ui.rect(x + 4, ry - 2, w - 8, 12, P.ink, 0.35);
      if (slot === 'ready') {
        ui.text(p.ready ? 'READY!' : 'READY?', x + w / 2, ry, { font: 'labelB', align: 'center', color: p.ready ? P.green3 : selRow ? P.gold4 : P.cream3, wave: p.ready ? 1 : 0, perChar: p.ready ? undefined : null });
        return;
      }
      const key = p.cos?.[slot] || 'default';
      const def = slotList(slot, c).find((it) => it.key === key) || slotList(slot, c)[0];
      ui.text(SLOT_NAMES[slot], x + 8, ry, { font: 'label', color: P.cream2 });
      const R = RARITY[def.rarity] || RARITY.common;
      ui.text(def.name, x + w - 16, ry, { font: 'body', align: 'right', color: selRow ? P.gold4 : R.color });
      if (selRow) { ui.icon('arrowL', x + w / 2 - 14, ry - 1, { alpha: 0.8 }); ui.icon('arrowR', x + w - 12, ry - 1, { alpha: 0.8 }); }
    });
    if (p.ready) ui.text('✓', x + w - 10, y + 5, { font: 'labelB', color: P.green3 });
  }

  drawVersus(ui) {
    const v = this.vs;
    const t = v.t;
    const W = ui.w;
    // diagonal versus bands
    const slide = ease.outExpo(clamp(t * 2, 0, 1));
    for (let i = 0; i < 2; i++) {
      const col = PLAYER_COLORS[i];
      const y = i === 0 ? ui.h - 62 : 30;
      const x0 = i === 0 ? -W + W * slide : W - W * slide;
      ui.rect(x0, y, W, 34, col.dark, 0.85); ui.rect(x0, y + 3, W, 28, col.main, 0.6);
      const name = CDATA[this.picks[i].char].name;
      ui.text(name, i === 0 ? 20 + x0 + W * 0 : W - 20 + x0 - 0, y + 7, { font: 'big', align: i === 0 ? 'left' : 'right', color: P.cream4, shadow: P.ink });
    }
    ui.text('VS', W / 2, ui.h / 2 - 20, { font: 'mega', align: 'center', color: P.gold3, shadow: P.red1, alpha: clamp(t * 2 - 0.3, 0, 1) });
    // speech bubbles
    const showLine = (i, txt, k) => {
      const f = this.vsFighters[i];
      const hh = f.headPos();
      const p = this.project(hh.x, hh.y + 0.6, ui);
      const s = txt.slice(0, Math.floor(k * 40));
      const lines = ui.wrap(s, 150, 'body');
      const w = Math.max(10, ...lines.map((l) => ui.measure(l, 'body'))) + 12, h = lines.length * 9 + 8;
      const bx = clamp(p.x - w / 2, 6, ui.w - w - 6), by = clamp(p.y - h - 10, 70, ui.h - 80);
      ui.rect(bx - 1, by - 1, w + 2, h + 2, P.ink); ui.rect(bx, by, w, h, P.cream3);
      ui.rect(clamp(p.x - 2, bx + 4, bx + w - 8), by + h, 4, 4, P.cream3);
      lines.forEach((l, j) => ui.text(l, bx + 6, by + 4 + j * 9, { font: 'body', color: P.ink, outline: null }));
    };
    if (v.step === 0 && v.lines[0]) showLine(0, v.lines[0], v.stepT);
    if (v.step === 1 && v.lines[1]) showLine(1, v.lines[1], v.stepT);
    if (!this.net) ui.text('PRESS LIGHT TO SKIP', W / 2, ui.h - 12, { font: 'label', align: 'center', color: P.cream2, alpha: 0.6 });
  }
}
