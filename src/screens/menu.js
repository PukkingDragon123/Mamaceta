// Title screen + main menu inside the underwater dive bar. The camera tours the bar
// cinematically, gliding between the fighters as they hang out.
import { ensureLobby, lobbyFighters, goCharSelect, goShop, goSettings, goOnline } from './flow.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { snailCounter, rankPlaque, hintBar } from '../ui/widgets.js';
import { Save, CHARS } from '../core/save.js';
import { Sound } from '../core/sound.js';
import { dailyChallenges } from '../core/progress.js';
import { CHARS as CDATA } from '../sim/data.js';
import { ease, clamp } from '../core/math.js';
import { line } from '../data/dialogue.js';
import { keyLabel } from '../core/input.js';

const TIPS = [
  'Hold BLOCK + HEAVY for 3 seconds to molt a fresh shell. You are vulnerable while molting!',
  'Press BLOCK right before a hit lands for a PERFECT BLOCK and a free counter.',
  'Heavy club punches create cavitation bubbles that collapse into a second hit.',
  'Hold HEAVY to wind up a spring-loaded charge punch. Fully charged ones wall-splat!',
  'LIGHT, LIGHT, HEAVY is a combo for every fighter. Try it!',
  'Low attacks must be blocked crouching. Jump attacks must be blocked standing.',
  'When your ultimate meter is full press LIGHT + HEAVY together, then hit the prompts in the cutscene!',
  'Skills: pick one at the start of a match. If you lose a set you get another one!',
  'Health carries over between sets. Win a set big to stay ahead.',
  'P1 skills: R T Y.  P2 skills: I O P.  Gamepad: LB RB LT.',
  'Loteria draws a random card. La Muerte makes your next hit brutal.',
  'Bobby is weak... until his cone cracks.',
  'In the Cantina, grab a drink with LIGHT + BLOCK and gulp it with HEAVY. Not too many!',
  'Hit the vents in the Rust Pit to make a bubble geyser you can ride.',
  'Smash the piñata in the Cantina for free snails!',
  'Madam Molt restocks her secret shop every day at midnight.',
];

function drawTitleSign(ui, cx, y, t, scale = 1) {
  const w = 300, h = 96;
  const x = Math.round(cx - w / 2);
  const sway = Math.round(Math.sin(t * 1.1) * 2);
  ui.rope(x + 22, -4, x + 22 + sway, y + 6, Math.floor(t * 2));
  ui.rope(x + w - 23, -4, x + w - 23 + sway, y + 6, Math.floor(t * 2) + 1);
  ui.shadowRect(x + sway, y, w, h, 0.5);
  ui.panel(x + sway, y, w, h, { seed: 4, tone: 'mid', plankSize: 24, barnacles: 6, algae: 1.2, moss: 1 });
  // carved inner panel
  ui.rect(x + sway + 10, y + 8, w - 20, h - 16, 'rgba(30,14,8,0.35)');
  ui.text('MANTIS', cx + sway, y + 4, { font: 'mega', align: 'center', color: P.gold3, shadow: P.red1, perChar: (i) => [0, Math.round(Math.sin(t * 3 + i * 0.7) * 1.5)] });
  ui.text('MAYHEM', cx + sway, y + 54, { font: 'huge', align: 'center', color: P.red4, shadow: P.ink, perChar: (i) => [0, Math.round(Math.sin(t * 3 + 2 + i * 0.7) * 1.5)] });
  ui.icon('glove', x + sway + 18, y + 60); ui.icon('glove', x + sway + w - 32, y + 60, { flip: true });
  ui.icon('bubble', x + sway + 40, y + 12); ui.icon('bubble', x + sway + w - 52, y + 18);
}

export class TitleScreen {
  enter() {
    const g = this.game;
    this.L = ensureLobby();
    this.F = lobbyFighters();
    this.L.homeAll();
    this.L.snapCam('overview');
    this.t = 0; this.leg = -1;
    Sound.music('title', { fade: 2 });
  }
  update(dt, active) {
    this.t += dt;
    // slow cinematic sweep across the bar, one leg per fighter
    const legs = ['jim', 'brutus', 'bobby', 'mimi', 'overview'];
    const leg = Math.floor(this.t / 5.5) % legs.length;
    if (leg !== this.leg) { this.leg = leg; this.L.setCam(legs[leg], 3.2, { zk: legs[leg] === 'overview' ? 1 : 0.75, drift: 0.08 }); }
    this.L.update(dt);
    const inp = this.game.input;
    if (active && this.t > 0.6 && (inp.anyPressed || this.game.ui.mouse.clicked)) {
      Sound.resume(); Sound.sfx('ui_select');
      this.game.setScreen(new MainMenuScreen({ fromTitle: true }), { instant: true });
    }
  }
  render(d) { this.L.render(d, { dim: 0.1 }); }
  drawUI(ui) {
    const t = this.t;
    const drop = Math.round((1 - ease.outBounce(clamp(t / 1.2, 0, 1))) * -160);
    drawTitleSign(ui, Math.floor(ui.w / 2), 20 + drop, t);
    ui.text('an underwater mantis shrimp fight club', ui.w / 2, 124 + drop, { font: 'body', align: 'center', color: P.teal5, shadow: P.ink });
    if (t > 1.2 && Math.floor(t * 2) % 2 === 0) ui.text('PRESS ANY KEY', ui.w / 2, ui.h - 40, { font: 'big', align: 'center', color: P.cream4, shadow: P.ink });
    ui.text('v2.0  -  P1: WASD + F G H, skills R T Y   P2: ARROWS + K L ;, skills I O P', ui.w / 2, ui.h - 12, { font: 'label', align: 'center', color: P.cream2, shadow: P.ink });
  }
}

export class MainMenuScreen {
  constructor(o = {}) { this.o = o; this.sel = 0; }
  enter() {
    const g = this.game;
    this.L = ensureLobby();
    this.F = lobbyFighters();
    this.main = Save.data.mainFighter;
    this.L.homeAll();
    this.L.bar.setSecretDoor?.(0);
    this.L.bar.setDoor?.(0, 0); this.L.bar.setDoor?.(1, 0);
    this.tourT = 0; this.focus = this.main;
    this.L.setCam(this.main, this.o.fromTitle ? 1.6 : 0.01, { drift: 0.06 });
    this.t = 0;
    this.items = [
      { label: 'LOCAL VERSUS', icon: 'keyboard', fn: () => goCharSelect(g, 'local') },
      { label: 'VS CPU', icon: 'skull', fn: () => goCharSelect(g, 'cpu') },
      { label: 'ONLINE', icon: 'wifi', fn: () => goOnline(g) },
      { label: 'TRAINING', icon: 'sword', fn: () => goCharSelect(g, 'training') },
      { label: "MADAM MOLT'S", icon: 'shirt', fn: () => goShop(g) },
      { label: 'SETTINGS', icon: 'gear', fn: () => goSettings(g, 'menu') },
    ];
    this.tip = Math.floor(Math.random() * TIPS.length); this.tipT = 0;
    this.chal = dailyChallenges();
    this.speech = null; this.speechT = 0; this.nextSpeech = 4;
    Sound.music('menu', { fade: 1.5 });
    this.changeT = 0;
  }
  switchMain(dir) {
    const i = (CHARS.indexOf(this.main) + dir + CHARS.length) % CHARS.length;
    this.main = CHARS[i];
    Save.data.mainFighter = this.main; Save.markDirty();
    this.focus = this.main; this.tourT = 0;
    this.L.setCam(this.main, 1.1, { drift: 0.06 });
    this.F[this.main].doReact('wave');
    Sound.sfx('ui_tab'); this.changeT = 0.3;
    this.say(line(this.main, 'select'));
  }
  say(txt) { if (!txt) return; this.speech = txt; this.speechT = 0; Sound.voice(this.main, txt); }
  update(dt, active) {
    this.t += dt; this.changeT = Math.max(0, this.changeT - dt);
    // cinematic tour: after a while the camera drifts to visit the other fighters, then returns
    this.tourT += dt;
    if (this.tourT > 7.5) {
      this.tourT = 0;
      const others = CHARS.filter((c) => c !== this.focus);
      this.focus = this.focus === this.main ? others[Math.floor(Math.random() * others.length)] : this.main;
      this.L.setCam(this.focus, 2.4, { drift: 0.07, zk: this.focus === this.main ? 1 : 0.9 });
      if (this.focus !== this.main && Math.random() < 0.5) this.F[this.focus].doReact('wave');
    }
    this.L.update(dt);
    const f = this.F[this.main];
    this.tipT += dt; if (this.tipT > 7) { this.tipT = 0; this.tip = (this.tip + 1) % TIPS.length; }
    this.speechT += dt; this.nextSpeech -= dt;
    if (this.nextSpeech <= 0) { this.nextSpeech = 12 + Math.random() * 10; this.say(line(this.main, Math.random() < 0.5 ? 'taunt' : 'intro')); }
    if (!active) return;
    const inp = this.game.input;
    if (inp.menu('up')) { this.sel = (this.sel + this.items.length - 1) % this.items.length; Sound.sfx('ui_move'); Sound.sfx('ui_rope', { vol: 0.3 }); }
    if (inp.menu('down')) { this.sel = (this.sel + 1) % this.items.length; Sound.sfx('ui_move'); Sound.sfx('ui_rope', { vol: 0.3 }); }
    if (inp.menu('tabL') || inp.menu('left')) this.switchMain(-1);
    if (inp.menu('tabR') || inp.menu('right')) this.switchMain(1);
    if (inp.menu('confirm')) this.activate(this.sel);
    if (inp.menu('back')) { Sound.sfx('ui_back'); this.game.setScreen(new TitleScreen(), { instant: true }); }
    if (this.game.ui.mouse.clicked) {
      // click on the fighter: they react
      const ui = this.game.ui;
      if (ui.mouse.x > ui.w * 0.45 && ui.mouse.x < ui.w * 0.8 && ui.mouse.y > ui.h * 0.3) { f.doReact('wave'); this.say(line(this.main, 'taunt')); }
    }
  }
  render(d) { this.L.render(d); this.d = d; }
  activate(i) {
    Sound.sfx('ui_select');
    this.F[this.main].doReact('pick');
    this.items[i].fn();
  }
  drawUI(ui) {
    const t = this.t;
    // hanging menu sign
    const sx = 14, sy = 26, sw = 156, sh = 34 + this.items.length * 21 + 8;
    const sway = ui.hangingSign(sx, sy, sw, sh, { seed: 7, sway: 1.2 });
    ui.text('MANTIS', sx + sw / 2 + sway, sy + 4, { font: 'big', align: 'center', color: P.gold3, shadow: P.red1 });
    ui.text('MAYHEM', sx + sw / 2 + sway, sy + 20, { font: 'labelB', align: 'center', color: P.red4 });
    this.items.forEach((it, i) => {
      const y = sy + 36 + i * 21;
      const r = ui.plank(sx + 16 + sway, y, sw - 32, 17, it.label, { selected: i === this.sel, seed: i + 40, icon: it.icon });
      if (r.hover && ui.mouse.moved && this.sel !== i) { this.sel = i; Sound.sfx('ui_move'); }
      if (r.clicked) this.activate(i);
    });
    // top right: snails + rank
    snailCounter(ui, ui.w - 8, 8);
    rankPlaque(ui, ui.w - 8, 34);
    // daily challenges board
    this.drawChallenges(ui, ui.w - 150, 68);
    // main fighter selector
    const name = CDATA[this.main].name;
    const bw = 140, bx = Math.floor(ui.w * 0.62) - bw / 2, by = ui.h - 66;
    ui.panel(bx, by, bw, 24, { seed: 51, tone: 'dark', plankSize: 24, barnacles: 1 });
    ui.text(name, bx + bw / 2, by + 3, { font: 'big', align: 'center', color: P.cream4, alpha: 1 - this.changeT });
    ui.text(CDATA[this.main].title, bx + bw / 2, by + 26, { font: 'body', align: 'center', color: P.cream2 });
    const l = ui.plank(bx - 20, by + 4, 16, 16, '', { noPointer: true, seed: 60 }), r = ui.plank(bx + bw + 4, by + 4, 16, 16, '', { noPointer: true, seed: 61 });
    ui.icon('arrowL', bx - 15, by + 7); ui.icon('arrowR', bx + bw + 9, by + 7);
    if (l.clicked) this.switchMain(-1); if (r.clicked) this.switchMain(1);
    // speech bubble near the bench fighter
    if (this.speech && this.speechT < 3.5 && this.d && this.focus === this.main) {
      const hp = this.F[this.main].headPos();
      const pp = this.d.toUI(hp.x, hp.y + 0.6, ui);
      const px = Math.round(pp.x), py = Math.round(pp.y);
      const txt = this.speech.slice(0, Math.floor(this.speechT * 40));
      const lines = ui.wrap(txt, 130, 'body');
      const w = Math.max(...lines.map((s) => ui.measure(s, 'body'))) + 10, h = lines.length * 9 + 7;
      const bx2 = clamp(px - w / 2, 180, ui.w - w - 4), by2 = Math.max(4, py - h - 6);
      ui.rect(bx2 - 1, by2 - 1, w + 2, h + 2, P.ink); ui.rect(bx2, by2, w, h, P.cream3);
      ui.rect(clamp(px, bx2 + 4, bx2 + w - 6), by2 + h, 3, 3, P.cream3);
      lines.forEach((s, i) => ui.text(s, bx2 + 5, by2 + 4 + i * 9, { font: 'body', color: P.ink, outline: null }));
    }
    // tip ticker
    const tip = 'TIP: ' + TIPS[this.tip];
    ui.rect(0, ui.h - 15, ui.w, 15, P.ink, 0.6);
    const b = Save.settings.bindings.p1;
    hintBar(ui, [[[keyLabel(b.up[0]), keyLabel(b.down[0])], 'SELECT'], [[keyLabel(b.light[0]), 'ENT'], 'OK'], [['Q', 'E'], 'FIGHTER']], { x: 6, y: ui.h - 12 });
    ui.rect(0, ui.h - 29, ui.w, 13, P.ink, 0.45);
    ui.text(tip, ui.w / 2, ui.h - 26, { font: 'body', align: 'center', color: P.teal5, alpha: Math.min(1, this.tipT * 2, (7 - this.tipT) * 2) });
  }
  drawChallenges(ui, x, y) {
    const w = 142, h = 92;
    ui.panel(x, y, w, h, { seed: 91, tone: 'dark', plankSize: 16, barnacles: 2, algae: 0.6 });
    ui.text('DAILY CHALLENGES', x + w / 2, y + 5, { font: 'labelB', align: 'center', color: P.gold3 });
    this.chal.forEach((c, i) => {
      const cy = y + 18 + i * 24;
      ui.rect(x + 6, cy, w - 12, 21, c.done ? P.cream1 : P.cream3);
      ui.rect(x + 6, cy + 20, w - 12, 1, P.cream0);
      ui.rect(x + w / 2 - 1, cy - 2, 3, 3, P.red3); // pin
      ui.text(c.text, x + 10, cy + 3, { font: 'body', color: P.ink, outline: null });
      const pr = clamp(c.progress / c.goal, 0, 1);
      ui.rect(x + 10, cy + 13, 70, 4, P.ink); ui.rect(x + 11, cy + 14, Math.round(68 * pr), 2, c.done ? P.green3 : P.teal3);
      ui.text(`${Math.min(c.progress, c.goal)}/${c.goal}`, x + 84, cy + 12, { font: 'label', color: P.ink, outline: null });
      ui.icon('snail', x + w - 40, cy + 6, {});
      ui.text(String(c.reward), x + w - 10, cy + 9, { font: 'label', color: P.gold1, outline: null, align: 'right' });
      if (c.done) ui.text('DONE!', x + w / 2 + 6, cy + 6, { font: 'labelB', color: P.red3, align: 'center' });
    });
  }
}
