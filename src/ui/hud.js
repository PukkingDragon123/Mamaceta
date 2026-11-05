// In-match HUD (pixel UI canvas): portraits, health with damage trail, segmented shell, 3 skill
// slots with cooldown wipes, set medallions, the flaming ultimate meter, combo counters,
// callouts, announcements, the skill-draft cards, the KO QTE and the ultimate-cinematic QTE.
import { P, PLAYER_COLORS } from './palette.js';
import { porthole, barFill } from './sprites.js';
import { CHARS, PHYS, SKILLS, ULT_CINE, LOTERIA } from '../sim/data.js';
import { clamp, ease, valueNoise2 } from '../core/math.js';
import { keyLabel } from '../core/input.js';

const SHELL_SEG = 10;
const FIRE = ['#fff6c0', '#ffd040', '#ff8a2a', '#e8401c', '#8a1414'];

export class HUD {
  constructor(game, o) {
    this.game = game;
    this.names = o.names;
    this.portraits = o.portraits;
    this.demonPortrait = o.demonPortraits || [];
    this.trail = [1, 1]; this.lastHp = [1, 1]; this.shake = [0, 0];
    this.combo = [null, null];
    this.callouts = [];
    this.banner = null; this.ultBanner = null;
    this.shellLost = [[], []]; this.prevShellSeg = [99, 99];
    this.t = 0; this.mode = o.mode;
    this.keys = o.keys || [null, null];
    this.skillFlash = [[0, 0, 0], [0, 0, 0]];
    this.skillReady = [[true, true, true], [true, true, true]];
    this.embers = [[], []];
    this.meterShown = [0, 0];
    this.ucFx = [];
    this.card = null;
  }
  comboHit(attacker, n, dmg) { if (n < 2) return; this.combo[attacker] = { n, dmg: (this.combo[attacker]?.dmg || 0) + dmg, t: 0, pop: 1 }; }
  callout(text, side, color = P.gold3, big = false) { this.callouts.push({ text, side, t: 0, color, big }); if (this.callouts.length > 6) this.callouts.shift(); }
  announce(text, o = {}) { this.banner = { text, sub: o.sub || '', t: 0, dur: o.dur || 1.4, kind: o.kind || 'sign', color: o.color || P.gold3 }; }
  ult(i, name, char) { this.ultBanner = { i, name, char, t: 0 }; }
  skillDenied(i, slot) { this.skillFlash[i][slot] = -0.4; }
  showCard(i, card) { this.card = { i, card, t: 0 }; }
  ucResult(good) { this.ucFx.push({ good, t: 0 }); }

  update(dt, sim) {
    this.t += dt;
    const s = sim.s;
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i];
      const hp = f.hp / f.hpMax;
      if (hp < this.lastHp[i] - 0.001) this.shake[i] = 0.35;
      this.lastHp[i] = hp;
      if (this.trail[i] > hp) this.trail[i] = Math.max(hp, this.trail[i] - dt * (this.trail[i] - hp > 0.2 ? 0.5 : 0.28) * (this.shake[i] > 0 ? 0.2 : 1));
      else this.trail[i] = hp;
      this.shake[i] = Math.max(0, this.shake[i] - dt);
      const c = this.combo[i];
      if (c) { c.t += dt; c.pop = Math.max(0, c.pop - dt * 4); if (c.t > 1.6) this.combo[i] = null; }
      const seg = Math.ceil((f.shell / f.shellMax) * SHELL_SEG - 0.001);
      if (seg < this.prevShellSeg[i] && this.prevShellSeg[i] !== 99) for (let k = seg; k < this.prevShellSeg[i]; k++) this.shellLost[i].push({ k, t: 0, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30 });
      this.prevShellSeg[i] = seg;
      for (let k = this.shellLost[i].length - 1; k >= 0; k--) { const q = this.shellLost[i][k]; q.t += dt; if (q.t > 0.8) this.shellLost[i].splice(k, 1); }
      // skill ready pops
      for (let j = 0; j < 3; j++) {
        const sk = f.sk[j];
        const ready = !sk || sk.cd <= 0;
        if (ready && !this.skillReady[i][j]) this.skillFlash[i][j] = 0.5;
        this.skillReady[i][j] = ready;
        const fl = this.skillFlash[i][j];
        if (fl > 0) this.skillFlash[i][j] = Math.max(0, fl - dt); else if (fl < 0) this.skillFlash[i][j] = Math.min(0, fl + dt);
      }
      // meter display eases
      const m = clamp(f.meter / PHYS.METER_MAX, 0, 1);
      this.meterShown[i] += (m - this.meterShown[i]) * Math.min(1, dt * 10);
      const E = this.embers[i];
      for (let k = E.length - 1; k >= 0; k--) { const e = E[k]; e.t += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= 10 * dt; if (e.t > e.life) E.splice(k, 1); }
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) { this.callouts[i].t += dt; if (this.callouts[i].t > 1.3) this.callouts.splice(i, 1); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.ultBanner) { this.ultBanner.t += dt; if (this.ultBanner.t > 1.0) this.ultBanner = null; }
    if (this.card) { this.card.t += dt; if (this.card.t > 1.8) this.card = null; }
    for (let i = this.ucFx.length - 1; i >= 0; i--) { this.ucFx[i].t += dt; if (this.ucFx[i].t > 0.7) this.ucFx.splice(i, 1); }
  }

  draw(ui, sim, ctx = {}) {
    const s = sim.s;
    this.rounds = sim.cfg.rounds || 3;
    const cine = s.phase === 'ucine';
    if (ctx.hideBars !== true && !cine) {
      for (let i = 0; i < 2; i++) this.drawPlayer(ui, s.fighters[i], i, s, ctx);
      this.drawTimer(ui, s, sim);
      for (let i = 0; i < 2; i++) this.drawMeter(ui, s.fighters[i], i, ctx);
    }
    this.drawCombos(ui);
    this.drawCallouts(ui);
    if (ctx.texts) this.drawWorldTexts(ui, ctx.texts, ctx.project);
    if (s.phase === 'qte' && s.qte) this.drawQte(ui, s, ctx);
    if (cine && s.ucine) this.drawUltQte(ui, s, ctx);
    if (s.phase === 'pick' && s.pick) this.drawPick(ui, s, ctx);
    if (this.card) this.drawCard(ui);
    if (this.ultBanner) this.drawUltBanner(ui);
    if (this.banner) this.drawBanner(ui);
  }

  // ------------------------------------------------------------------ player block
  drawPlayer(ui, f, i, s, ctx) {
    const W = ui.w, right = i === 1, pc = PLAYER_COLORS[i];
    const barW = Math.min(184, Math.floor(W * 0.34));
    const sx = this.shake[i] > 0 ? Math.round((Math.random() - 0.5) * 4 * this.shake[i] * 3) : 0;
    const top = 5, portR = 17;
    const px = right ? W - 6 - portR * 2 - 2 : 6;
    // portrait
    const port = porthole(portR, { seed: i + 1, tone: 'brass' });
    ui.rect(px + 3, top + 3, portR * 2 - 4, portR * 2 - 4, f.cs?.demon ? '#1a0610' : P.deep2);
    const pimg = f.cs?.demon && this.demonPortrait[i] ? this.demonPortrait[i] : this.portraits[i];
    if (pimg) {
      const g = ui.g;
      g.save(); g.beginPath(); g.arc(px + portR + 1, top + portR + 1, portR - 3.5, 0, Math.PI * 2); g.clip();
      const hurt = this.shake[i] > 0.2 ? Math.round((Math.random() - 0.5) * 2) : 0;
      ui.img(pimg, px + portR + 1 - pimg.width / 2 + hurt, top + portR + 2 - pimg.height / 2, { flip: right });
      g.restore();
    }
    ui.img(port, px, top);
    // health bar: chunky riveted frame
    const bx = right ? px - 5 - barW : px + portR * 2 + 7;
    const by = top + 3;
    ui.rect(bx - 3 + sx, by - 3, barW + 6, 16, P.ink);
    ui.rect(bx - 2 + sx, by - 2, barW + 4, 14, P.metal1);
    ui.rect(bx - 2 + sx, by - 2, barW + 4, 1, P.metal3);
    for (const rx of [bx - 1, bx + barW]) ui.rect(rx + sx, by + 4, 1, 2, P.metal4);
    ui.rect(bx + sx, by, barW, 10, '#1a0a0a');
    const hp = clamp(f.hp / f.hpMax, 0, 1), tr = clamp(this.trail[i], 0, 1);
    const hw = Math.round(barW * hp), tw = Math.round(barW * tr);
    const low = hp < 0.25, flick = low && Math.floor(this.t * 6) % 2 === 0;
    const fillCols = low ? [P.red1, flick ? P.red4 : P.red3, P.red5] : [P.green3 === undefined ? P.red2 : '#2a8a3a', '#4ac24a', '#b8ff8a'];
    const X = (w) => (right ? bx + sx + barW - w : bx + sx);
    if (tw > 0) ui.rect(X(tw), by, tw, 10, '#ffb060');
    if (hw > 0) ui.img(barFill(hw, 10, fillCols), X(hw), by);
    for (let k = 1; k < 10; k++) ui.rect(bx + sx + Math.round(barW * k / 10), by + 7, 1, 3, P.ink);
    ui.rect(bx + sx, by, barW, 1, 'rgba(255,255,255,0.3)');
    // name + set medallions
    const charName = CHARS[f.char].name + (f.cs?.demon ? '?!' : '');
    const name = this.names?.[i] || '';
    ui.text(charName, right ? bx + barW : bx, by + 14, { font: 'labelB', color: f.cs?.demon ? P.red4 : P.cream4, align: right ? 'right' : 'left' });
    const nw = ui.measure(charName, 'labelB');
    ui.text(name, right ? bx + barW - nw - 6 : bx + nw + 6, by + 15, { font: 'body', color: pc.light, align: right ? 'right' : 'left' });
    const need = Math.ceil((this.rounds || 3) / 2);
    for (let k = 0; k < need; k++) {
      const wx = right ? bx + 2 + k * 12 : bx + barW - 10 - k * 12;
      const won = k < s.wins[i];
      ui.rect(wx - 1, by + 13, 10, 10, P.ink);
      ui.rect(wx, by + 14, 8, 8, won ? pc.main : P.metal1);
      if (won) { ui.rect(wx + 1, by + 15, 3, 2, pc.light); ui.icon('star', wx - 1, by + 13, { alpha: 0.9 }); }
    }
    // shell plates
    const sy = by + 25;
    const segW = Math.floor((barW * 0.56) / SHELL_SEG);
    const shellFrac = f.shell / f.shellMax, segs = shellFrac * SHELL_SEG;
    for (let k = 0; k < SHELL_SEG; k++) {
      const kx = right ? bx + barW - (k + 1) * segW : bx + k * segW;
      const fill = clamp(segs - k, 0, 1);
      ui.rect(kx, sy, segW - 1, 5, P.ink);
      if (fill > 0) {
        const col = f.soft > 0 ? P.cream2 : (shellFrac < 0.34 ? P.orange3 : P.teal4);
        ui.rect(kx + 1, sy + 1, Math.max(1, Math.round((segW - 3) * fill)), 3, col);
        ui.rect(kx + 1, sy + 1, Math.max(1, Math.round((segW - 3) * fill)), 1, P.white);
      }
    }
    for (const q of this.shellLost[i]) {
      const kx = right ? bx + barW - (q.k + 1) * segW : bx + q.k * segW;
      ui.rect(kx + q.vx * q.t, sy + q.vy * q.t + 120 * q.t * q.t, 3, 3, P.teal4, 1 - q.t / 0.8);
    }
    ui.text(f.shell <= 0 ? 'NO SHELL!' : 'SHELL', right ? bx + barW - SHELL_SEG * segW - 4 : bx + SHELL_SEG * segW + 4, sy - 1, { font: 'label', color: f.shell <= 0 ? (Math.floor(this.t * 4) % 2 ? P.red4 : P.cream3) : P.teal5, align: right ? 'right' : 'left' });
    // skill slots
    const ky = sy + 8;
    for (let j = 0; j < 3; j++) {
      const sxp = right ? bx + barW - (j + 1) * 20 + 2 : bx + j * 20;
      this.drawSkillSlot(ui, f, i, j, sxp, ky, ctx);
    }
    // buffs / status
    let ix = right ? bx + barW - 66 - 12 : bx + 64;
    const iconAt = (name, a = 1) => { ui.icon(name, ix, ky + 3, { alpha: a }); ix += right ? -13 : 13; };
    if (f.cs?.fireT > 0) iconAt('sk_chili', Math.floor(this.t * 6) % 2 ? 1 : 0.6);
    if (f.cs?.eyesT > 0) iconAt('sk_eye');
    if (f.cs?.armorT > 0) iconAt('sk_shellArmor');
    if (f.cs?.muerte) iconAt('skull', 0.7 + Math.sin(this.t * 8) * 0.3);
    if (f.wob > 0) iconAt('qmark');
    if (f.char === 'brutus') for (let k = 0; k < 3; k++) iconAt('snail', k < f.cs.snails ? 1 : 0.25);
    if (f.char === 'mimi') iconAt('jelly', f.cs.puru === 'held' ? 1 : 0.3);
    if (f.drunk >= 100) iconAt('beer', 0.5 + Math.min(1, f.drunk / 400) * 0.5);
    if (f.moltCd > 0) iconAt('clock', 0.8);
  }

  drawSkillSlot(ui, f, i, j, x, y, ctx) {
    const sk = f.sk[j];
    const S = sk && SKILLS[sk.id];
    const fl = this.skillFlash[i][j];
    const shake = fl < 0 ? Math.round(Math.sin(this.t * 60) * 2) : 0;
    x += shake;
    ui.rect(x - 1, y - 1, 18, 18, P.ink);
    ui.rect(x, y, 16, 16, sk ? P.metal1 : '#0b1218');
    ui.rect(x, y, 16, 1, sk ? P.metal3 : P.metal1);
    if (!sk) {
      ui.icon('lock', x + 4, y + 3, { alpha: 0.35 });
      return;
    }
    const cdFrac = sk.cd > 0 ? sk.cd / S.cd : 0;
    ui.rect(x + 1, y + 1, 14, 14, cdFrac > 0 ? '#14202a' : S.color);
    ui.rect(x + 1, y + 1, 14, 3, cdFrac > 0 ? '#1c2a36' : 'rgba(255,255,255,0.25)');
    ui.icon('sk_' + S.icon, x + 1, y + 1, { alpha: cdFrac > 0 ? 0.45 : 1 });
    if (cdFrac > 0) {
      // pixel cooldown wipe from the top
      const h = Math.ceil(14 * cdFrac);
      ui.rect(x + 1, y + 1, 14, h, 'rgba(4,10,16,0.62)');
      ui.rect(x + 1, y + 1 + h, 14, 1, P.cream2);
      ui.text(String(Math.ceil(sk.cd / 60)), x + 8, y + 5, { font: 'labelB', align: 'center', color: P.cream4 });
    }
    if (fl > 0) { ui.rect(x - 2, y - 2, 20, 1, P.white); ui.rect(x - 2, y + 17, 20, 1, P.white); ui.rect(x - 2, y - 2, 1, 20, P.white); ui.rect(x + 17, y - 2, 1, 20, P.white); }
    const key = this.keys[i]?.skills?.[j];
    if (key) ui.text(key, x + 8, y + 18, { font: 'label', align: 'center', color: cdFrac > 0 ? P.cream1 : P.gold4 });
  }

  // ------------------------------------------------------------------ flaming ultimate meter
  drawMeter(ui, f, i, ctx) {
    const W = ui.w, right = i === 1;
    const mw = Math.min(150, Math.floor(W * 0.27));
    const mx = right ? W - 10 - mw : 10, my = ui.h - 16;
    const m = this.meterShown[i];
    const full = f.meter >= PHYS.METER_MAX;
    const t = this.t;
    const g = ui.g;
    // flames behind/above the bar when full; a smoulder at the fill tip otherwise
    if (full) {
      for (let x = 0; x < mw; x++) {
        const n = valueNoise2(x * 0.22 + i * 30, t * 7);
        const n2 = valueNoise2(x * 0.5 + 9, t * 11);
        const h = Math.round(5 + n * 13 + n2 * 5 + Math.sin(t * 4 + x * 0.15) * 2);
        const cx = right ? mx + mw - 1 - x : mx + x;
        for (let yy = 0; yy < h; yy++) {
          const k = yy / h;
          const ci = k < 0.2 ? 0 : k < 0.45 ? 1 : k < 0.7 ? 2 : k < 0.9 ? 3 : 4;
          if (k > 0.85 && ((x + yy + Math.floor(t * 20)) & 1)) continue;
          g.fillStyle = FIRE[ci]; g.fillRect(cx, my - 1 - yy, 1, 1);
        }
      }
      if (Math.random() < 0.6) this.embers[i].push({ x: right ? mx + mw - Math.random() * mw : mx + Math.random() * mw, y: my - 6 - Math.random() * 10, vx: (Math.random() - 0.5) * 10, vy: -14 - Math.random() * 18, t: 0, life: 0.5 + Math.random() * 0.6 });
    } else if (m > 0.02) {
      const tip = right ? mx + mw - Math.round(mw * m) : mx + Math.round(mw * m);
      for (let k = 0; k < 4; k++) { const h = 2 + Math.round(valueNoise2(k * 3 + i, t * 8) * 4 * m); g.fillStyle = FIRE[2 + (k & 1)]; g.fillRect(tip - 2 + k, my - h, 1, h); }
      if (Math.random() < m * 0.25) this.embers[i].push({ x: tip, y: my - 2, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 10, t: 0, life: 0.4 + Math.random() * 0.3 });
    }
    for (const e of this.embers[i]) { const k = e.t / e.life; g.fillStyle = FIRE[Math.min(4, Math.floor(k * 4) + 1)]; g.fillRect(Math.round(e.x), Math.round(e.y), k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1); }
    // frame
    ui.rect(mx - 3, my - 3, mw + 6, 13, P.ink);
    ui.rect(mx - 2, my - 2, mw + 4, 11, full ? '#5a1a0a' : P.metal1);
    ui.rect(mx, my, mw, 7, '#120606');
    const fw = Math.round(mw * m);
    if (fw > 0) {
      const cols = full ? [Math.floor(t * 10) % 2 ? '#ff8a2a' : '#e8401c', '#ffd040', '#fff6c0'] : ['#8a1414', '#e8401c', '#ff8a2a'];
      ui.img(barFill(fw, 7, cols), right ? mx + mw - fw : mx, my);
      // moving heat shimmer pixels inside the bar
      for (let k = 0; k < 6; k++) { const xx = ((t * 40 + k * 29) % Math.max(1, fw)); ui.rect(right ? mx + mw - 1 - xx : mx + xx, my + 1 + (k % 3) * 2, 2, 1, '#fff0a0', 0.8); }
    }
    for (let k = 1; k < 4; k++) ui.rect(mx + Math.round(mw * k / 4), my, 1, 7, P.ink);
    // emblem cap (skull in flames when full)
    const ex = right ? mx - 16 : mx + mw + 4;
    ui.icon(full ? 'fire' : 'skull', ex, my - 3, { alpha: full ? 1 : 0.5 });
    const lbl = full ? 'ULTIMATE READY!' : 'ULTIMATE';
    ui.text(lbl, right ? mx + mw : mx, my - (full ? 30 : 11), { font: full ? 'big' : 'label', color: full ? (Math.floor(t * 6) % 2 ? P.gold4 : P.white) : P.orange4, align: right ? 'right' : 'left', shadow: full ? P.red1 : undefined, wave: full ? 1 : 0 });
    if (full) { const keys = ctx.keyHints?.[i]; if (keys) ui.text(keys, right ? mx + mw : mx, my - 12, { font: 'labelB', color: P.cream4, align: right ? 'right' : 'left' }); }
  }

  drawTimer(ui, s, sim) {
    const cx = Math.floor(ui.w / 2), r = 18;
    const port = porthole(r, { seed: 5, tone: 'rust', bolts: 6 });
    ui.rect(cx - r + 3, 5 + 3, r * 2 - 4, r * 2 - 4, P.deep1);
    ui.img(port, cx - r - 1, 4);
    const tsec = Math.max(0, Math.ceil(s.timer / 60));
    const urgent = tsec <= 10 && s.phase === 'fight';
    ui.text(this.mode === 'training' ? '--' : String(tsec), cx, 15, { font: 'big', align: 'center', color: urgent ? (Math.floor(this.t * 4) % 2 ? P.red4 : P.cream4) : P.cream4 });
    const final = s.wins[0] === Math.ceil(this.rounds / 2) - 1 && s.wins[1] === s.wins[0] && s.round > 1;
    ui.text(final ? 'FINAL SET' : 'SET ' + s.round, cx, 5 + r * 2 + 2, { font: 'labelB', align: 'center', color: final ? P.red4 : P.cream3 });
    // set history dots
    const n = Math.max(3, s.roundWinners.length + 1);
    for (let k = 0; k < 3; k++) {
      const w = s.roundWinners[k];
      const dx = cx - 12 + k * 12;
      ui.rect(dx - 1, 5 + r * 2 + 12, 7, 7, P.ink);
      ui.rect(dx, 5 + r * 2 + 13, 5, 5, w === 0 ? PLAYER_COLORS[0].main : w === 1 ? PLAYER_COLORS[1].main : k === s.roundWinners.length ? (Math.floor(this.t * 3) % 2 ? P.cream3 : P.metal3) : P.metal1);
    }
  }

  drawCombos(ui) {
    for (let i = 0; i < 2; i++) {
      const c = this.combo[i];
      if (!c) continue;
      const right = i === 1;
      const x = right ? ui.w - 14 : 14, y = Math.floor(ui.h * 0.34);
      const a = c.t > 1.2 ? 1 - (c.t - 1.2) / 0.4 : 1;
      ui.text(String(c.n), x, y - Math.round(c.pop * 6), { font: c.n >= 10 ? 'mega' : 'huge', color: c.n >= 8 ? P.red4 : c.n >= 5 ? P.orange3 : P.gold3, align: right ? 'right' : 'left', alpha: a, shadow: P.ink });
      ui.text('HITS!', right ? x : x + (c.n >= 10 ? 62 : 34), y + (c.n >= 10 ? 40 : 18), { font: 'labelB', color: P.cream3, align: right ? 'right' : 'left', alpha: a });
      ui.text(`${c.dmg} DMG`, x, y + (c.n >= 10 ? 52 : 30), { font: 'label', color: P.cream2, align: right ? 'right' : 'left', alpha: a });
    }
  }
  drawCallouts(ui) {
    const counts = [0, 0];
    for (const c of this.callouts) {
      const right = c.side === 1;
      const k = counts[right ? 1 : 0]++;
      const slide = ease.outBack(clamp(c.t * 6, 0, 1));
      const a = c.t > 1 ? 1 - (c.t - 1) / 0.3 : 1;
      const x = right ? ui.w - 10 - Math.round((1 - slide) * -60) : 10 + Math.round((1 - slide) * -60);
      const y = Math.floor(ui.h * 0.55) + k * (c.big ? 24 : 14);
      ui.text(c.text, x, y, { font: c.big ? 'big' : 'labelB', color: c.color, align: right ? 'right' : 'left', alpha: a, wave: c.big ? 1 : 0, shadow: P.ink });
    }
  }
  drawWorldTexts(ui, texts, project) {
    for (const t of texts) {
      const p = project(t.x, t.y);
      if (!p) continue;
      const a = t.t > t.dur * 0.7 ? 1 - (t.t - t.dur * 0.7) / (t.dur * 0.3) : 1;
      const pop = ease.outBack(clamp(t.t * 8, 0, 1));
      ui.text(t.str, p.x, p.y - Math.round(pop * 4), { font: t.size === 'small' ? 'labelB' : 'big', color: t.color, align: 'center', alpha: a, shadow: P.ink });
    }
  }
  drawBanner(ui) {
    const b = this.banner;
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
    if (b.sub) ui.text(b.sub, cx, y + h + 6, { font: 'labelB', color: P.cream3, align: 'center', alpha: outT, shadow: P.ink });
  }
  drawUltBanner(ui) {
    const u = this.ultBanner;
    const h = 46, y = Math.floor(ui.h * 0.62);
    const slide = ease.outExpo(clamp(u.t * 4, 0, 1));
    const out = clamp((1.0 - u.t) * 6, 0, 1);
    const right = u.i === 1;
    const g = ui.g;
    g.save(); g.globalAlpha = out;
    const x0 = right ? ui.w - ui.w * slide : -ui.w + ui.w * slide;
    g.fillStyle = '#2a0606'; g.fillRect(Math.round(x0), y, ui.w, h);
    g.fillStyle = PLAYER_COLORS[u.i].dark; g.fillRect(Math.round(x0), y + 3, ui.w, h - 6);
    for (let x = 0; x < ui.w; x += 1) { const fh = Math.round(4 + valueNoise2(x * 0.2, this.t * 9) * 10); g.fillStyle = FIRE[fh > 10 ? 2 : 1]; g.fillRect(Math.round(x0) + x, y + h - 3 - fh, 1, fh * 0.4); }
    g.restore();
    ui.text(u.name, Math.floor(ui.w / 2) + (right ? -10 : 10), y + 12, { font: 'big', color: P.cream4, align: 'center', shadow: P.red1, alpha: out });
    ui.text('ULTIMATE', Math.floor(ui.w / 2), y - 10, { font: 'labelB', color: P.gold4, align: 'center', alpha: out, shadow: P.ink });
  }

  // ------------------------------------------------------------------ skill draft cards
  drawPick(ui, s, ctx) {
    const pk = s.pick;
    const W = ui.w, H = ui.h;
    ui.rect(0, 0, W, H, P.deep0, 0.55);
    const both = pk.who[0] && pk.who[1];
    const title = s.round === 1 ? 'CHOOSE YOUR FIRST SKILL' : both ? 'FINAL SET - ONE MORE SKILL EACH!' : 'YOU FELL... RISE WITH A NEW SKILL!';
    ui.text(title, W / 2, 16, { font: 'big', align: 'center', color: P.gold3, shadow: P.ink, wave: 1 });
    const tl = Math.max(0, Math.ceil((pk.dur - pk.t) / 60));
    ui.text(String(tl), W / 2, 36, { font: 'labelB', align: 'center', color: tl <= 3 ? P.red4 : P.cream3 });
    for (let i = 0; i < 2; i++) {
      if (!pk.who[i]) continue;
      const cx = both ? (i === 0 ? W * 0.26 : W * 0.74) : W / 2;
      const offers = pk.offers[i];
      const cw = 76, ch = 112, gap = 6;
      const total = offers.length * cw + (offers.length - 1) * gap;
      const x0 = Math.round(cx - total / 2), y0 = Math.round(H * 0.3);
      const pc = PLAYER_COLORS[i];
      ui.text(this.names?.[i] || `P${i + 1}`, cx, y0 - 16, { font: 'labelB', align: 'center', color: pc.light, shadow: P.ink });
      offers.forEach((id, j) => {
        const S = SKILLS[id];
        const sel = pk.sel[i] === j;
        const done = pk.done[i];
        const chosen = done && sel;
        const lift = sel ? Math.round(-6 - Math.sin(this.t * 5) * 2) : 0;
        const x = x0 + j * (cw + gap), y = y0 + lift + (done && !sel ? 6 : 0);
        ui.rect(x - 2, y - 2, cw + 4, ch + 4, sel ? (chosen ? P.gold4 : pc.main) : P.ink);
        ui.panel(x, y, cw, ch, { seed: 40 + j + i * 7, tone: sel ? 'light' : 'dark', plankSize: 24, barnacles: 1, algae: 0.2, moss: 0, nails: true });
        ui.rect(x + cw / 2 - 15, y + 8, 30, 30, P.ink);
        ui.rect(x + cw / 2 - 14, y + 9, 28, 28, S.color);
        ui.rect(x + cw / 2 - 14, y + 9, 28, 6, 'rgba(255,255,255,0.25)');
        // 2x icon
        const ic = ui.iconImg ? ui.iconImg('sk_' + S.icon) : null;
        if (ic) { const g = ui.g; g.drawImage(ic, x + cw / 2 - ic.width, y + 23 - ic.height, ic.width * 2, ic.height * 2); }
        else ui.icon('sk_' + S.icon, x + cw / 2 - 7, y + 16);
        const lines = ui.wrap(S.name, cw - 6, 'labelB');
        lines.forEach((l, k) => ui.text(l, x + cw / 2, y + 42 + k * 8, { font: 'labelB', align: 'center', color: sel ? P.ink : P.gold4, outline: sel ? null : undefined }));
        const dl = ui.wrap(S.desc, cw - 8, 'label');
        dl.slice(0, 5).forEach((l, k) => ui.text(l, x + cw / 2, y + 46 + lines.length * 8 + k * 8, { font: 'label', align: 'center', color: sel ? P.ink : P.cream2, outline: sel ? null : undefined }));
        ui.text(`CD ${Math.round(S.cd / 60)}s${S.air ? '  AIR' : ''}`, x + cw / 2, y + ch - 10, { font: 'label', align: 'center', color: sel ? P.red2 : P.teal5, outline: sel ? null : undefined });
        if (chosen) { ui.rect(x + 4, y + 14, cw - 8, 18, P.red2); ui.text('LOCKED!', x + cw / 2, y + 17, { font: 'labelB', align: 'center', color: P.cream4 }); }
      });
      const keys = this.keys[i];
      if (!pk.done[i]) ui.text(`${keys?.left || '<'} ${keys?.right || '>'} CHOOSE   ${keys?.light || 'LIGHT'} PICK`, cx, y0 + ch + 10, { font: 'label', align: 'center', color: P.cream3 });
    }
  }

  drawCard(ui) {
    const c = this.card;
    const L = LOTERIA[c.card];
    if (!L) return;
    const k = ease.outBack(clamp(c.t * 3, 0, 1));
    const out = clamp((1.8 - c.t) * 4, 0, 1);
    const w = 70, h = 98;
    const x = Math.round((c.i === 0 ? ui.w * 0.25 : ui.w * 0.75) - w / 2), y = Math.round(ui.h * 0.28 - (1 - k) * 60);
    ui.g.globalAlpha = out;
    ui.rect(x - 2, y - 2, w + 4, h + 4, P.ink);
    ui.rect(x, y, w, h, P.cream3);
    ui.rect(x + 4, y + 4, w - 8, h - 22, ['#f0c33c', '#2a2a3a', '#d84a2a', '#4f8fff', '#d8322a', '#49c2bd'][c.card]);
    ui.icon(['star', 'skull', 'sk_shellArmor', 'star', 'fire', 'shell'][c.card], x + w / 2 - 6, y + 30);
    ui.text(String(c.card + 1), x + 8, y + 7, { font: 'labelB', color: P.ink, outline: null });
    ui.text(L.name, x + w / 2, y + h - 16, { font: 'labelB', align: 'center', color: P.ink, outline: null });
    ui.g.globalAlpha = 1;
    ui.text(L.desc, x + w / 2, y + h + 6, { font: 'labelB', align: 'center', color: P.gold4, shadow: P.ink, alpha: out });
  }

  // ------------------------------------------------------------------ QTEs
  drawQte(ui, s, ctx) {
    const q = s.qte;
    const cx = Math.floor(ui.w / 2), y = Math.floor(ui.h * 0.74);
    const w = Math.min(260, ui.w - 60);
    const pulse = 0.25 + Math.sin(this.t * 10) * 0.08;
    ui.rect(0, 0, ui.w, ui.h, '#3a0000', pulse * 0.4);
    ui.text('FINISH THEM!?', cx, 30, { font: 'huge', align: 'center', color: Math.floor(this.t * 6) % 2 ? P.red4 : P.gold3, shadow: P.ink });
    ui.text('MASH THE SHOWN BUTTON!', cx, 74, { font: 'labelB', align: 'center', color: P.cream3 });
    ui.rect(cx - w / 2 - 3, y - 3, w + 6, 16, P.ink);
    ui.rect(cx - w / 2, y, w, 10, P.ink);
    const m = clamp(q.m, 0, 1);
    const frac = q.a === 0 ? m : 1 - m;
    const mx = Math.round(cx - w / 2 + frac * w);
    ui.rect(cx - w / 2, y, mx - (cx - w / 2), 10, PLAYER_COLORS[0].main);
    ui.rect(mx, y, cx + w / 2 - mx, 10, PLAYER_COLORS[1].main);
    ui.rect(mx - 2, y - 3, 4, 16, P.white);
    ui.icon('skull', mx - 5, y - 16);
    const names = ['LIGHT', 'HEAVY', 'BLOCK'];
    for (const who of [q.a, q.d]) {
      const isA = who === q.a;
      const btn = isA ? q.pa : q.pd;
      const keyName = ctx.qteKeys ? ctx.qteKeys[who][btn] : names[btn];
      const right = who === 1;
      const bx = right ? cx + w / 2 - 10 : cx - w / 2 + 10;
      const shake = Math.round(Math.sin(this.t * 40 + who) * 1.5);
      ui.text(isA ? 'FINISH!' : 'SURVIVE!', bx, y + 22, { font: 'labelB', align: right ? 'right' : 'left', color: isA ? P.red4 : P.teal5 });
      ui.text(`[${keyName}]`, bx + shake, y + 34, { font: 'big', align: right ? 'right' : 'left', color: P.gold4, shadow: P.ink });
    }
    ui.text(Math.max(0, (q.dur - q.t) / 60).toFixed(1), cx, y + 22, { font: 'labelB', align: 'center', color: P.cream4 });
  }

  // cinematic ultimate: timed prompts for the attacker, mash meter for the defender
  drawUltQte(ui, s, ctx) {
    const c = s.ucine, U = ULT_CINE;
    const W = ui.w, H = ui.h;
    const names = ['LIGHT', 'HEAVY', 'BLOCK'];
    const keysA = ctx.qteKeys ? ctx.qteKeys[c.a] : names;
    // find the active step
    let cur = -1;
    for (let k = 0; k < U.steps.length; k++) if (!c.res[k]) { cur = k; break; }
    const ax = c.a === 0 ? Math.round(W * 0.3) : Math.round(W * 0.7);
    const ay = Math.round(H * 0.72);
    // result pips
    for (let k = 0; k < U.steps.length; k++) {
      const r = c.res[k];
      const px = ax - 30 + k * 16;
      ui.rect(px - 1, ay + 30, 12, 12, P.ink);
      ui.rect(px, ay + 31, 10, 10, r > 0 ? P.gold3 : r < 0 ? P.red2 : P.metal1);
      if (r > 0) ui.icon('star', px, ay + 31);
      if (r < 0) ui.icon('cross', px + 1, ay + 32);
    }
    if (cur >= 0) {
      const at = U.steps[cur];
      const lead = at - c.t;
      if (lead <= U.lead && lead >= -U.window) {
        const k = clamp(1 - lead / U.lead, 0, 1);
        const key = keysA[c.btns[cur]];
        const kw = Math.max(26, ui.measure(key, 'big') + 12);
        // shrinking timing ring (square pixel ring)
        const R = Math.round(10 + (1 - k) * 34);
        const inWin = Math.abs(lead) <= U.window;
        const col = inWin ? P.gold4 : P.cream3;
        ui.rect(ax - R, ay - R, R * 2, 2, col); ui.rect(ax - R, ay + R - 2, R * 2, 2, col); ui.rect(ax - R, ay - R, 2, R * 2, col); ui.rect(ax + R - 2, ay - R, 2, R * 2, col);
        ui.rect(ax - kw / 2 - 2, ay - 14, kw + 4, 28, P.ink);
        ui.rect(ax - kw / 2, ay - 12, kw, 24, inWin ? P.red3 : P.metal2);
        ui.rect(ax - kw / 2, ay - 12, kw, 4, 'rgba(255,255,255,0.3)');
        ui.text(key, ax, ay - 7, { font: 'big', align: 'center', color: P.cream4, shadow: P.ink });
        ui.text(['LIGHT!', 'HEAVY!', 'BLOCK!'][c.btns[cur]], ax, ay - R - 12, { font: 'labelB', align: 'center', color: P.gold4, shadow: P.ink });
      }
    }
    for (const fx of this.ucFx) {
      const k = fx.t / 0.7;
      ui.text(fx.good ? 'PERFECT!' : 'MISS', ax, ay - 50 - Math.round(k * 16), { font: fx.good ? 'huge' : 'big', align: 'center', color: fx.good ? P.gold3 : P.red4, shadow: P.ink, alpha: 1 - k });
    }
    // defender mash meter
    const dx = c.d === 0 ? Math.round(W * 0.3) : Math.round(W * 0.7);
    const dy = Math.round(H * 0.22);
    const keysD = ctx.qteKeys ? ctx.qteKeys[c.d] : names;
    ui.text('MASH TO RESIST!', dx, dy - 14, { font: 'labelB', align: 'center', color: P.teal5, shadow: P.ink });
    ui.text(`${keysD[0]} ${keysD[1]} ${keysD[2]}`, dx, dy + 12, { font: 'label', align: 'center', color: P.cream3, shadow: P.ink });
    const mw = 90;
    ui.rect(dx - mw / 2 - 2, dy - 2, mw + 4, 10, P.ink);
    ui.rect(dx - mw / 2, dy, Math.round(mw * Math.min(1, c.mash / 30)), 6, P.teal4);
  }
}

export function keyHintsFor(bindings) {
  const f = (p) => `${keyLabel(bindings[p].light[0])}+${keyLabel(bindings[p].heavy[0])}`;
  return [f('p1'), f('p2')];
}
export function keyNamesFor(bindings, mode) {
  const mk = (p) => ({ light: keyLabel(bindings[p].light[0]), heavy: keyLabel(bindings[p].heavy[0]), block: keyLabel(bindings[p].block[0]), left: keyLabel(bindings[p].left[0]), right: keyLabel(bindings[p].right[0]), skills: [0, 1, 2].map((j) => keyLabel((bindings[p]['skill' + (j + 1)] || [])[0])) });
  return [mk('p1'), mk('p2')];
}
