// Settings: audio, video, gameplay, controls (rebinding) and profile.
import { ensureLocker, goMainMenu } from './flow.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { Save } from '../core/save.js';
import { ACTIONS, DEFAULT_BINDINGS, keyLabel } from '../core/input.js';
import { hintBar } from '../ui/widgets.js';
import { clamp } from '../core/math.js';

const TABS = ['AUDIO', 'VIDEO', 'GAMEPLAY', 'CONTROLS', 'PROFILE'];

export class SettingsScreen {
  constructor(back) { this.backTo = back; }
  enter() {
    const g = this.game;
    this.L = ensureLocker(g);
    this.scene = this.L.scene; this.camera = this.L.camera;
    this.L.setCam([-8.2, 2.2, 0.5], [-9.6, 2.0, -5.5], 44, 1.5);
    this.tab = 0; this.row = 0; this.t = 0; this.capture = null; this.confirmReset = 0;
  }
  exit() { this.game.input.textHandler = null; this.game.input.captureHandler = null; Save.save(); this.game.applySettings(); }
  rows() {
    const s = Save.settings;
    const g = this.game;
    const slider = (label, key, step = 0.1) => ({ label, kind: 'slider', get: () => s[key], set: (v) => { s[key] = clamp(Math.round(v * 100) / 100, 0, 1); Sound.setVolumes({ master: s.master, music: s.music, sfx: s.sfx }); Save.markDirty(); }, step });
    const choice = (label, key, opts, names) => ({ label, kind: 'choice', opts, names, get: () => s[key], set: (v) => { s[key] = v; Save.markDirty(); if (key === 'quality') g.renderer.setQuality(v); } });
    const toggle = (label, key) => ({ label, kind: 'toggle', get: () => !!s[key], set: (v) => { s[key] = v; Save.markDirty(); } });
    switch (TABS[this.tab]) {
      case 'AUDIO': return [slider('MASTER VOLUME', 'master'), slider('MUSIC', 'music'), slider('SOUND FX', 'sfx')];
      case 'VIDEO': return [choice('GRAPHICS QUALITY', 'quality', ['low', 'medium', 'high'], ['LOW', 'MEDIUM', 'HIGH']), slider('SCREEN SHAKE', 'shake'), toggle('SHOW FPS', 'showFps'), { label: 'FULLSCREEN', kind: 'action', fn: () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); } }];
      case 'GAMEPLAY': return [choice('CPU DIFFICULTY', 'cpuLevel', [1, 2, 3, 4], ['CHILL', 'NORMAL', 'TOUGH', 'BRUTAL']), choice('ROUNDS', 'rounds', [1, 3, 5], ['1', 'BEST OF 3', 'BEST OF 5']), choice('ROUND TIME', 'roundTime', [60, 99, 180], ['60s', '99s', '180s']), toggle('KO FINISHER QTE', 'qte')];
      case 'CONTROLS': {
        const out = [];
        for (const p of ['p1', 'p2']) for (const a of ACTIONS) out.push({ label: `${p.toUpperCase()} ${a.toUpperCase()}`, kind: 'bind', p, a });
        out.push({ label: 'RESET TO DEFAULTS', kind: 'action', fn: () => { s.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); g.input.setBindings(s.bindings); Save.markDirty(); Sound.sfx('ui_select'); } });
        return out;
      }
      case 'PROFILE': return [
        { label: 'NAME', kind: 'name' },
        { label: this.confirmReset > 0 ? 'REALLY RESET? PRESS AGAIN' : 'RESET ALL PROGRESS', kind: 'action', fn: () => { if (this.confirmReset > 0) { Save.reset(); this.game.toast('Progress reset. Fresh shell!', P.orange3); this.confirmReset = 0; } else this.confirmReset = 3; } },
      ];
      default: return [];
    }
  }
  adjust(r, dir) {
    if (r.kind === 'slider') { r.set(r.get() + dir * r.step); Sound.sfx('ui_move'); }
    if (r.kind === 'choice') { const i = r.opts.indexOf(r.get()); r.set(r.opts[(i + dir + r.opts.length) % r.opts.length]); Sound.sfx('ui_tab'); }
    if (r.kind === 'toggle') { r.set(!r.get()); Sound.sfx('ui_tab'); }
  }
  activate(r) {
    if (r.kind === 'toggle' || r.kind === 'choice') return this.adjust(r, 1);
    if (r.kind === 'action') { Sound.sfx('ui_select'); r.fn(); return; }
    if (r.kind === 'bind') {
      this.capture = r; Sound.sfx('ui_select');
      this.game.input.captureNextKey((code) => {
        if (code !== 'Escape') {
          const b = Save.settings.bindings[r.p][r.a];
          b[0] = code;
          this.game.input.setBindings(Save.settings.bindings); Save.markDirty();
          Sound.sfx('ui_equip');
        }
        this.capture = null;
      });
    }
    if (r.kind === 'name') {
      this.editing = true;
      this.game.input.textHandler = (k) => {
        if (k === 'Enter' || k === 'Escape') { this.editing = false; this.game.input.textHandler = null; Save.markDirty(); return; }
        if (k === 'Backspace') { Save.data.name = Save.data.name.slice(0, -1); return; }
        if (k.length === 1 && Save.data.name.length < 12 && /[\w\- ]/.test(k)) Save.data.name += k;
      };
    }
  }
  update(dt, active) {
    this.t += dt; this.confirmReset = Math.max(0, this.confirmReset - dt);
    this.L.update(dt);
    if (!active || this.capture || this.editing) return;
    const inp = this.game.input;
    const rows = this.rows();
    if (inp.menu('tabL')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.row = 0; Sound.sfx('ui_tab'); }
    if (inp.menu('tabR')) { this.tab = (this.tab + 1) % TABS.length; this.row = 0; Sound.sfx('ui_tab'); }
    if (inp.menu('up')) { this.row = (this.row + rows.length - 1) % rows.length; Sound.sfx('ui_move'); }
    if (inp.menu('down')) { this.row = (this.row + 1) % rows.length; Sound.sfx('ui_move'); }
    if (inp.menu('left')) this.adjust(rows[this.row], -1);
    if (inp.menu('right')) this.adjust(rows[this.row], 1);
    if (inp.menu('confirm')) this.activate(rows[this.row]);
    if (inp.menu('back')) { Sound.sfx('ui_back'); goMainMenu(this.game); }
  }
  drawUI(ui) {
    const w = Math.min(ui.w - 40, 380), h = Math.min(ui.h - 50, 220);
    const x = Math.floor(ui.w / 2 - w / 2), y = 26;
    ui.hangingSign(x, y, w, h, { seed: 141, sway: 0.8 });
    ui.text('SETTINGS', x + w / 2, y + 5, { font: 'big', align: 'center', color: P.gold3, shadow: P.ink });
    // tabs
    const tw = Math.floor((w - 20) / TABS.length);
    TABS.forEach((tname, i) => {
      const r = ui.plank(x + 10 + i * tw, y + 28, tw - 4, 15, tname, { selected: i === this.tab, seed: 150 + i, noPointer: true, font: 'label' });
      if (r.clicked) { this.tab = i; this.row = 0; Sound.sfx('ui_tab'); }
    });
    const rows = this.rows();
    const listY = y + 50;
    const per = 13;
    const maxRows = Math.floor((h - 64) / per);
    const start = Math.max(0, Math.min(this.row - Math.floor(maxRows / 2), rows.length - maxRows));
    rows.slice(start, start + maxRows).forEach((r, k) => {
      const i = start + k;
      const ry = listY + k * per;
      const sel = i === this.row;
      if (sel) ui.rect(x + 12, ry - 2, w - 24, per - 1, P.ink, 0.35);
      if (ui.hover(x + 12, ry - 2, w - 24, per - 1) && ui.mouse.moved) this.row = i;
      if (ui.clicked(x + 12, ry - 2, w - 24, per - 1)) { this.row = i; if (r.kind === 'slider') { const fx = (ui.mouse.x - (x + w - 120)) / 100; if (fx >= 0 && fx <= 1) r.set(fx); } else this.activate(r); }
      ui.text(r.label, x + 18, ry, { font: 'label', color: sel ? P.gold4 : P.cream3 });
      const vx = x + w - 18;
      if (r.kind === 'slider') {
        const v = r.get();
        ui.rect(vx - 102, ry + 1, 102, 6, P.ink);
        ui.rect(vx - 101, ry + 2, Math.round(100 * v), 4, P.teal4);
        ui.text(Math.round(v * 100) + '%', vx - 108, ry, { font: 'label', align: 'right', color: P.cream2 });
      } else if (r.kind === 'choice') ui.text('< ' + r.names[r.opts.indexOf(r.get())] + ' >', vx, ry, { font: 'labelB', align: 'right', color: P.cream4 });
      else if (r.kind === 'toggle') ui.text(r.get() ? 'ON' : 'OFF', vx, ry, { font: 'labelB', align: 'right', color: r.get() ? P.green3 : P.red4 });
      else if (r.kind === 'bind') {
        const codes = Save.settings.bindings[r.p][r.a];
        const waiting = this.capture === r;
        ui.text(waiting ? 'PRESS A KEY...' : codes.map(keyLabel).join(' / '), vx, ry, { font: 'labelB', align: 'right', color: waiting ? P.gold4 : PLAYER_COLORS[r.p === 'p1' ? 0 : 1].light });
      } else if (r.kind === 'name') ui.text(Save.data.name + (this.editing && Math.floor(this.t * 3) % 2 ? '_' : ''), vx, ry, { font: 'labelB', align: 'right', color: P.cream4 });
    });
    hintBar(ui, [[['Q', 'E'], 'TAB'], [['^', 'v'], 'ROW'], [['<', '>'], 'CHANGE'], [['ESC'], 'BACK']], { x: x + 10, y: y + h + 8 });
    if (TABS[this.tab] === 'CONTROLS') ui.text('Gamepads: X=LIGHT  Y=HEAVY  B/RB=BLOCK  A=JUMP  LB=ULTIMATE', ui.w / 2, ui.h - 10, { font: 'label', align: 'center', color: P.cream2 });
  }
}
