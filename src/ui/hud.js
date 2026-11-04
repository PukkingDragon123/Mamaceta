// In-match HUD: porthole portraits, health/shell/ultimate bars, timer, combo counters,
// callouts, round announcements and the KO QTE overlay. All pixel art drawn on the UI canvas.
import { P, PLAYER_COLORS, shade } from './palette.js';
import { porthole, barFill, metalPlate } from './sprites.js';
import { CHARS, PHYS, ULT_NAMES } from '../sim/data.js';
import { clamp, ease } from '../core/math.js';
import { keyLabel } from '../core/input.js';

const SHELL_SEG = 10;

export class HUD {
  constructor(game, o) {
    this.game = game;
    this.names = o.names; // [p1 name, p2 name]
    this.portraits = o.portraits; // [canvas, canvas]
    this.demonPortrait = o.demonPortraits || [];
    this.trail = [1, 1]; // delayed damage trail per player
    this.lastHp = [1, 1];
    this.shake = [0, 0];
    this.combo = [null, null]; // {n, dmg, t}
    this.callouts = []; // {text, side, t, color}
    this.banner = null; // {text, sub, t, dur, kind}
    this.ultBanner = null;
    this.shellLost = [[], []];
    this.prevShellSeg = [99, 99];
    this.t = 0;
    this.mode = o.mode;
  }

  comboHit(attacker, n, dmg) {
    if (n < 2) return;
    this.combo[attacker] = { n, dmg: (this.combo[attacker]?.dmg || 0) + dmg, t: 0, pop: 1 };
  }
  callout(text, side, color = P.gold3, big = false) { this.callouts.push({ text, side, t: 0, color, big }); if (this.callouts.length > 6) this.callouts.shift(); }
  announce(text, o = {}) { this.banner = { text, sub: o.sub || '', t: 0, dur: o.dur || 1.4, kind: o.kind || 'sign', color: o.color || P.gold3 }; }
  ult(i, name, char) { this.ultBanner = { i, name, char, t: 0 }; }

  update(dt, sim) {
    this.t += dt;
    const s = sim.s;
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i];
      const hp = f.hp / f.hpMax;
      if (hp < this.lastHp[i] - 0.001) { this.shake[i] = 0.35; }
      this.lastHp[i] = hp;
      if (this.trail[i] > hp) this.trail[i] = Math.max(hp, this.trail[i] - dt * (this.trail[i] - hp > 0.2 ? 0.5 : 0.28) * (this.shake[i] > 0 ? 0.2 : 1));
      else this.trail[i] = hp;
      this.shake[i] = Math.max(0, this.shake[i] - dt);
      const c = this.combo[i];
      if (c) { c.t += dt; c.pop = Math.max(0, c.pop - dt * 4); if (c.t > 1.6) this.combo[i] = null; }
      // shell segment loss particles
      const seg = Math.ceil((f.shell / f.shellMax) * SHELL_SEG - 0.001);
      if (seg < this.prevShellSeg[i] && this.prevShellSeg[i] !== 99) for (let k = seg; k < this.prevShellSeg[i]; k++) this.shellLost[i].push({ k, t: 0, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30 });
      this.prevShellSeg[i] = seg;
      for (let k = this.shellLost[i].length - 1; k >= 0; k--) { const q = this.shellLost[i][k]; q.t += dt; if (q.t > 0.8) this.shellLost[i].splice(k, 1); }
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) { this.callouts[i].t += dt; if (this.callouts[i].t > 1.3) this.callouts.splice(i, 1); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.ultBanner) { this.ultBanner.t += dt; if (this.ultBanner.t > 0.9) this.ultBanner = null; }
  }

  draw(ui, sim, ctx = {}) {
    const s = sim.s;
    this.rounds = sim.cfg.rounds || 3;
    const W = ui.w;
    if (ctx.hideBars !== true) {
      for (let i = 0; i < 2; i++) this.drawPlayer(ui, s.fighters[i], i, s, ctx);
      this.drawTimer(ui, s);
    }
    this.drawCombos(ui);
    this.drawCallouts(ui);
    if (ctx.texts) this.drawWorldTexts(ui, ctx.texts, ctx.project);
    if (s.phase === 'qte' && s.qte) this.drawQte(ui, s, ctx);
    if (this.ultBanner) this.drawUltBanner(ui);
    if (this.banner) this.drawBanner(ui);
  }

  drawPlayer(ui, f, i, s, ctx) {
    const W = ui.w;
    const right = i === 1;
    const pc = PLAYER_COLORS[i];
    const barW = Math.min(170, Math.floor(W * 0.32));
    const sx = this.shake[i] > 0 ? Math.round((Math.random() - 0.5) * 4 * this.shake[i] * 3) : 0;
    const top = 6;
    const portR = 17;
    const px = right ? W - 6 - portR * 2 - 2 : 6;
    // porthole portrait
    const port = porthole(portR, { seed: i + 1, tone: 'brass' });
    ui.rect(px + 3, top + 3, portR * 2 - 4, portR * 2 - 4, P.deep2);
    const pimg = f.cs?.demon && this.demonPortrait[i] ? this.demonPortrait[i] : this.portraits[i];
    if (pimg) {
      const g = ui.g;
      g.save(); g.beginPath(); g.arc(px + portR + 1, top + portR + 1, portR - 3.5, 0, Math.PI * 2); g.clip();
      ui.img(pimg, px + portR + 1 - pimg.width / 2 + (right ? 2 : -2), top + portR + 3 - pimg.height / 2, { flip: right });
      g.restore();
    }
    ui.img(port, px, top);
    // health bar frame
    const bx = right ? px - 4 - barW : px + portR * 2 + 6;
    const by = top + 4;
    ui.metal(bx - 3 + sx, by - 3, barW + 6, 15, { seed: 7 + i, rust: 0.6 });
    ui.rect(bx + sx, by, barW, 9, P.ink);
    const hp = clamp(f.hp / f.hpMax, 0, 1);
    const tr = clamp(this.trail[i], 0, 1);
    const hw = Math.round(barW * hp), tw = Math.round(barW * tr);
    const low = hp < 0.25;
    const flick = low && Math.floor(this.t * 6) % 2 === 0;
    const fillCols = low ? [P.red1, flick ? P.red4 : P.red3, P.red5] : [P.red2, P.red3, P.orange4];
    if (right) {
      if (tw > 0) ui.rect(bx + sx + barW - tw, by, tw, 9, P.cream4);
      if (hw > 0) ui.img(barFill(hw, 9, fillCols), bx + sx + barW - hw, by);
    } else {
      if (tw > 0) ui.rect(bx + sx, by, tw, 9, P.cream4);
      if (hw > 0) ui.img(barFill(hw, 9, fillCols), bx + sx, by);
    }
    for (let k = 1; k < 10; k++) ui.rect(bx + sx + Math.round(barW * k / 10), by + 6, 1, 3, P.ink);
    ui.rect(bx + sx, by, barW, 1, 'rgba(255,255,255,0.25)');
    // name plate
    const name = (this.names?.[i] || CHARS[f.char].name);
    const charName = CHARS[f.char].name + (f.cs?.demon ? ' ?!' : '');
    const nw = ui.measure(charName, 'labelB') + 10;
    const nx = right ? bx + barW - nw : bx;
    ui.panel(nx, by + 13, nw, 11, { seed: 3 + i, tone: f.cs?.demon ? 'dark' : 'mid', plankSize: 11, barnacles: 0, algae: 0, moss: 0, nails: false });
    ui.text(charName, nx + 5, by + 15, { font: 'labelB', color: f.cs?.demon ? P.red4 : P.cream3 });
    ui.text(name, right ? nx - 4 : nx + nw + 4, by + 16, { font: 'body', color: pc.light, align: right ? 'right' : 'left' });
    // shell bar (segmented plates)
    const sy = by + 26;
    const segW = Math.floor((barW * 0.62) / SHELL_SEG);
    const shellFrac = f.shell / f.shellMax;
    const segs = shellFrac * SHELL_SEG;
    for (let k = 0; k < SHELL_SEG; k++) {
      const kx = right ? bx + barW - (k + 1) * segW : bx + k * segW;
      const fill = clamp(segs - k, 0, 1);
      ui.rect(kx, sy, segW - 1, 6, P.ink);
      if (fill > 0) {
        const col = f.soft > 0 ? P.cream2 : (shellFrac < 0.34 ? P.orange3 : P.teal4);
        ui.rect(kx + 1, sy + 1, Math.max(1, Math.round((segW - 3) * fill)), 4, col);
        ui.rect(kx + 1, sy + 1, Math.max(1, Math.round((segW - 3) * fill)), 1, P.white);
        if (shellFrac < 0.5 && (k * 7) % 3 === 0) ui.rect(kx + 2, sy + 2, 1, 2, P.ink);
      }
    }
    for (const q of this.shellLost[i]) {
      const kx = right ? bx + barW - (q.k + 1) * segW : bx + q.k * segW;
      ui.rect(kx + q.vx * q.t, sy + q.vy * q.t + 120 * q.t * q.t, 3, 3, P.teal4, 1 - q.t / 0.8);
    }
    const shellLbl = f.shell <= 0 ? 'NO SHELL!' : 'SHELL';
    ui.text(shellLbl, right ? bx + barW - SHELL_SEG * segW - 4 : bx + SHELL_SEG * segW + 4, sy, { font: 'label', color: f.shell <= 0 ? (Math.floor(this.t * 4) % 2 ? P.red4 : P.cream3) : P.teal5, align: right ? 'right' : 'left' });
    // status icons row
    let ix = right ? bx + barW - 8 : bx;
    const icon = (name, tint) => { ui.icon(name, ix, sy + 9, { alpha: tint ?? 1 }); ix += right ? -14 : 14; };
    if (f.moltCd > 0) { icon('clock', 0.9); }
    if (f.char === 'brutus') for (let k = 0; k < 3; k++) icon('snail', k < f.cs.snails ? 1 : 0.25);
    if (f.char === 'mimi') icon('jelly', f.cs.puru === 'held' ? 1 : 0.3);
    if (f.drunk >= 100) icon('beer', 0.5 + Math.min(1, f.drunk / 400) * 0.5);
    if (f.cs?.demon) icon('skull', 0.6 + Math.sin(this.t * 8) * 0.4);
    // round wins (snail shells)
    const need = Math.ceil((this.rounds || 3) / 2);
    for (let k = 0; k < need; k++) {
      const wx = right ? px - 2 - (k + 1) * 13 : px + portR * 2 + 2 + k * 13;
      ui.icon('shell', wx + (right ? 0 : 0), top + portR * 2 + 2, { alpha: k < s.wins[i] ? 1 : 0.25 });
    }
    // ultimate meter (bottom corner)
    const mw = Math.min(120, Math.floor(W * 0.22));
    const mx = right ? W - 8 - mw : 8, my = ui.h - 18;
    ui.metal(mx - 3, my - 3, mw + 6, 13, { seed: 11 + i, rust: 0.4, tone: 'dark' });
    ui.rect(mx, my, mw, 7, P.deep1);
    const m = clamp(f.meter / PHYS.METER_MAX, 0, 1);
    const full = m >= 1;
    const mwf = Math.round(mw * m);
    if (mwf > 0) {
      const cols = full ? [P.teal3, Math.floor(this.t * 8) % 2 ? P.white : P.teal5, P.white] : [P.blue2, P.blue3, P.blue4];
      ui.img(barFill(mwf, 7, cols), right ? mx + mw - mwf : mx, my);
      // bubbles inside the meter
      for (let k = 0; k < 4; k++) {
        const bxp = ((this.t * 20 + k * 37 + i * 13) % Math.max(1, mwf));
        ui.rect(right ? mx + mw - 1 - bxp : mx + bxp, my + 2 + (k % 2) * 2, 2, 2, P.blue4, 0.8);
      }
    }
    const lbl = full ? 'ULTIMATE READY!' : 'ULT';
    ui.text(lbl, right ? mx + mw : mx, my - 11, { font: full ? 'labelB' : 'label', color: full ? (Math.floor(this.t * 6) % 2 ? P.teal5 : P.white) : P.blue4, align: right ? 'right' : 'left' });
    if (full && this.mode !== 'online-remote') {
      const keys = ctx.keyHints?.[i];
      if (keys) ui.text(keys, right ? mx - 6 : mx + mw + 6, my - 1, { font: 'label', color: P.cream2, align: right ? 'right' : 'left' });
    }
  }

  drawTimer(ui, s) {
    const cx = Math.floor(ui.w / 2);
    const r = 18;
    const port = porthole(r, { seed: 5, tone: 'rust', bolts: 6 });
    ui.rect(cx - r + 3, 6 + 3, r * 2 - 4, r * 2 - 4, P.deep1);
    ui.img(port, cx - r - 1, 5);
    const tsec = Math.ceil(s.timer / 60);
    const txt = s.phase === 'fight' || s.phase === 'ready' ? String(Math.max(0, tsec)) : String(Math.max(0, tsec));
    const urgent = tsec <= 10 && s.phase === 'fight';
    ui.text(this.mode === 'training' ? '∞'.replace('∞', '--') : txt, cx, 16, { font: 'big', align: 'center', color: urgent ? (Math.floor(this.t * 4) % 2 ? P.red4 : P.cream4) : P.cream4 });
    ui.text('ROUND ' + s.round, cx, 6 + r * 2 + 3, { font: 'label', align: 'center', color: P.cream2 });
  }

  drawCombos(ui) {
    for (let i = 0; i < 2; i++) {
      const c = this.combo[i];
      if (!c) continue;
      const right = i === 1;
      const x = right ? ui.w - 14 : 14;
      const y = Math.floor(ui.h * 0.32);
      const a = c.t > 1.2 ? 1 - (c.t - 1.2) / 0.4 : 1;
      const sc = 1 + c.pop * 0.4;
      ui.text(String(c.n), x, y - Math.round(c.pop * 6), { font: c.n >= 10 ? 'mega' : 'huge', color: c.n >= 8 ? P.red4 : c.n >= 5 ? P.orange3 : P.gold3, align: right ? 'right' : 'left', alpha: a, shadow: P.ink });
      ui.text('HITS!', right ? x : x + (c.n >= 10 ? 52 : 34) + (c.n >= 10 ? 10 : 0), y + (c.n >= 10 ? 40 : 18), { font: 'labelB', color: P.cream3, align: right ? 'right' : 'left', alpha: a });
      ui.text(`${c.dmg} DMG`, x, y + (c.n >= 10 ? 52 : 30), { font: 'label', color: P.cream2, align: right ? 'right' : 'left', alpha: a });
    }
  }

  drawCallouts(ui) {
    const counts = [0, 0];
    for (const c of this.callouts) {
      const right = c.side === 1;
      const k = counts[c.side === 1 ? 1 : 0]++;
      const slide = ease.outBack(clamp(c.t * 6, 0, 1));
      const a = c.t > 1 ? 1 - (c.t - 1) / 0.3 : 1;
      const x = right ? ui.w - 10 - Math.round((1 - slide) * -60) : 10 + Math.round((1 - slide) * -60);
      const y = Math.floor(ui.h * 0.52) + k * (c.big ? 24 : 14);
      ui.text(c.text, x, y, { font: c.big ? 'big' : 'labelB', color: c.color, align: right ? 'right' : 'left', alpha: a, wave: c.big ? 1 : 0, perChar: c.big ? undefined : null });
    }
  }

  drawWorldTexts(ui, texts, project) {
    for (const t of texts) {
      const p = project(t.x, t.y);
      if (!p) continue;
      const a = t.t > t.dur * 0.7 ? 1 - (t.t - t.dur * 0.7) / (t.dur * 0.3) : 1;
      const pop = ease.outBack(clamp(t.t * 8, 0, 1));
      ui.text(t.str, p.x, p.y - Math.round(pop * 4), { font: t.size === 'small' ? 'labelB' : 'big', color: t.color, align: 'center', alpha: a });
    }
  }

  drawBanner(ui) {
    const b = this.banner;
    const k = b.t / b.dur;
    const cx = Math.floor(ui.w / 2), cy = Math.floor(ui.h * 0.4);
    const inT = clamp(b.t / 0.25, 0, 1), outT = clamp((b.dur - b.t) / 0.25, 0, 1);
    const drop = Math.round((1 - ease.outBounce(inT)) * -ui.h * 0.6) + Math.round((1 - outT) * -40);
    const font = b.kind === 'ko' ? 'mega' : 'huge';
    const tw = ui.measure(b.text, font);
    const w = tw + 40, h = b.kind === 'ko' ? 72 : 52;
    const x = cx - Math.floor(w / 2), y = cy - Math.floor(h / 2) + drop;
    ui.rope(x + 12, -2, x + 12, y + 4, Math.floor(this.t * 3));
    ui.rope(x + w - 13, -2, x + w - 13, y + 4, Math.floor(this.t * 3) + 1);
    ui.shadowRect(x, y, w, h, 0.5);
    ui.panel(x, y, w, h, { seed: b.text.length + 5, tone: b.kind === 'ko' ? 'red' : 'mid', plankSize: Math.floor(h / 3), barnacles: 4, algae: 1, moss: 0.7 });
    ui.text(b.text, cx, y + Math.floor((h - (b.kind === 'ko' ? 44 : 28)) / 2), { font, color: b.color, align: 'center', shadow: P.ink, alpha: outT });
    if (b.sub) ui.text(b.sub, cx, y + h + 6, { font: 'labelB', color: P.cream3, align: 'center', alpha: outT });
  }

  drawUltBanner(ui) {
    const u = this.ultBanner;
    const k = u.t / 0.9;
    const h = 46;
    const y = Math.floor(ui.h * 0.62);
    const slide = ease.outExpo(clamp(u.t * 4, 0, 1));
    const out = clamp((0.9 - u.t) * 6, 0, 1);
    const right = u.i === 1;
    const g = ui.g;
    // diagonal slashed band
    g.save();
    g.globalAlpha = out;
    const x0 = right ? ui.w - ui.w * slide : -ui.w + ui.w * slide;
    g.fillStyle = PLAYER_COLORS[u.i].dark; g.fillRect(Math.round(x0), y, ui.w, h);
    g.fillStyle = PLAYER_COLORS[u.i].main; g.fillRect(Math.round(x0), y + 3, ui.w, h - 6);
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(Math.round(x0 + ((i * 47 + u.t * 900) % ui.w)), y + 4 + (i % 5) * 8, 30, 1); }
    g.restore();
    ui.text(u.name, Math.floor(ui.w / 2) + (right ? -10 : 10), y + 12, { font: 'big', color: P.cream4, align: 'center', shadow: P.ink, alpha: out });
    ui.text('ULTIMATE', Math.floor(ui.w / 2), y - 10, { font: 'labelB', color: P.gold4, align: 'center', alpha: out });
  }

  drawQte(ui, s, ctx) {
    const q = s.qte;
    const cx = Math.floor(ui.w / 2), y = Math.floor(ui.h * 0.74);
    const w = Math.min(260, ui.w - 60);
    // red danger vignette bars
    const pulse = 0.25 + Math.sin(this.t * 10) * 0.08;
    ui.rect(0, 0, ui.w, ui.h, '#3a0000', pulse * 0.4);
    ui.text('FINISH THEM!?', cx, 30, { font: 'huge', align: 'center', color: Math.floor(this.t * 6) % 2 ? P.red4 : P.gold3, shadow: P.ink });
    ui.text('MASH THE SHOWN BUTTON!', cx, 74, { font: 'labelB', align: 'center', color: P.cream3 });
    // tug of war bar: left = attacker side if attacker is P1
    ui.metal(cx - w / 2 - 4, y - 4, w + 8, 18, { seed: 31, rust: 0.6 });
    ui.rect(cx - w / 2, y, w, 10, P.ink);
    const m = clamp(q.m, 0, 1);
    // attacker pushes toward 0, defender toward 1. Map so P1 is on the left.
    const aLeft = q.a === 0;
    const frac = aLeft ? m : 1 - m; // position of the marker from left
    const mx = Math.round(cx - w / 2 + frac * w);
    ui.rect(cx - w / 2, y, mx - (cx - w / 2), 10, PLAYER_COLORS[0].main);
    ui.rect(mx, y, cx + w / 2 - mx, 10, PLAYER_COLORS[1].main);
    ui.rect(mx - 2, y - 3, 4, 16, P.white);
    ui.icon('skull', mx - 5, y - 16);
    // prompts
    const names = ['LIGHT', 'HEAVY', 'BLOCK'];
    for (const who of [q.a, q.d]) {
      const isA = who === q.a;
      const btn = isA ? q.pa : q.pd;
      const keyName = ctx.qteKeys ? ctx.qteKeys[who][btn] : names[btn];
      const right = who === 1;
      const bx = right ? cx + w / 2 - 10 : cx - w / 2 + 10;
      const shake = Math.round(Math.sin(this.t * 40 + who) * 1.5);
      const tag = isA ? 'FINISH!' : 'SURVIVE!';
      ui.text(tag, bx, y + 22, { font: 'labelB', align: right ? 'right' : 'left', color: isA ? P.red4 : P.teal5 });
      const lbl = `[${keyName}]`;
      ui.text(lbl, bx + shake, y + 34, { font: 'big', align: right ? 'right' : 'left', color: P.gold4, shadow: P.ink });
      if (!isA) ui.text(`ESCAPE POWER x${q.str.toFixed(2)}`, bx, y + 60, { font: 'label', align: right ? 'right' : 'left', color: P.cream2 });
    }
    const tl = Math.max(0, (q.dur - q.t) / 60);
    ui.text(tl.toFixed(1), cx, y + 22, { font: 'labelB', align: 'center', color: P.cream4 });
  }
}

export function keyHintsFor(bindings, mode) {
  const b = bindings;
  const f = (p) => `${keyLabel(b[p].light[0])}+${keyLabel(b[p].heavy[0])}`;
  return mode === 'solo' ? [f('p1'), f('p2')] : [f('p1'), f('p2')];
}
