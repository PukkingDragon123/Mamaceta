// CPU opponent: reads the simulation state and produces controller input bitmasks.
import { BTN } from '../core/input.js';
import { CHARS, PHYS } from './data.js';

const { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, BLOCK } = BTN;
const LEVELS = [
  null,
  { react: 26, aggro: 0.35, block: 0.25, perfect: 0.0, combo: 0.2, special: 0.25, qte: 4, anti: 0.15, throw: 0.1, mistake: 0.25 },
  { react: 17, aggro: 0.55, block: 0.5, perfect: 0.06, combo: 0.5, special: 0.45, qte: 7, anti: 0.4, throw: 0.25, mistake: 0.12 },
  { react: 11, aggro: 0.7, block: 0.72, perfect: 0.18, combo: 0.75, special: 0.6, qte: 10, anti: 0.65, throw: 0.4, mistake: 0.06 },
  { react: 7, aggro: 0.85, block: 0.88, perfect: 0.35, combo: 0.95, special: 0.75, qte: 13, anti: 0.85, throw: 0.55, mistake: 0.02 },
];
const RANGE = { jim: 0.9, brutus: 1.6, bobby: 0.75, mimi: 0.95 };

export class AI {
  constructor(idx, level = 2, seed = 7) {
    this.i = idx; this.L = LEVELS[Math.max(1, Math.min(4, level))];
    this.plan = []; this.hold = 0; this.t = 0;
    this.s = (seed * 2654435761) >>> 0 || 1;
    this.lastSeenAttack = -999; this.reactAt = -1; this.qteT = 0;
    this.mood = 'neutral'; this.moodT = 0;
  }
  r() { this.s ^= this.s << 13; this.s >>>= 0; this.s ^= this.s >> 17; this.s ^= this.s << 5; this.s >>>= 0; return this.s / 4294967296; }
  press(seq) { this.plan.push(...seq); }

  think(sim) {
    const s = sim.s;
    const f = s.fighters[this.i], o = s.fighters[1 - this.i];
    this.t++;
    const fwd = f.face > 0 ? RIGHT : LEFT, back = f.face > 0 ? LEFT : RIGHT;
    // QTE mashing
    if (s.phase === 'qte' && s.qte) {
      const q = s.qte;
      const want = [LIGHT, HEAVY, BLOCK][q.a === this.i ? q.pa : q.pd];
      this.qteT++;
      const rate = Math.max(2, Math.round(60 / this.L.qte));
      return this.qteT % rate === 0 ? want : 0;
    }
    if (s.phase === 'intro') return this.t % 40 === 0 ? LIGHT : 0;
    if (s.phase !== 'fight') { this.plan.length = 0; return 0; }
    if (f.st === 'dizzy' || f.st === 'bubbled') return this.t % 3 === 0 ? (LIGHT | HEAVY) : 0;
    if (this.plan.length) return this.plan.shift();
    const dx = o.x - f.x, dist = Math.abs(dx), towards = dx > 0 ? RIGHT : LEFT, away = dx > 0 ? LEFT : RIGHT;
    const L = this.L;
    const range = RANGE[f.char] || 0.9;
    const myC = CHARS[f.char];
    const oAttacking = o.st === 'attack' && o.mv && o.mv !== 'specialB';
    const oThreat = oAttacking && dist < 2.4;
    const actionable = ['idle', 'walk', 'crouch', 'land', 'dashEnd', 'block', 'crouchblock'].includes(f.st);
    const inAir = f.st === 'air';
    // react to incoming attacks with a delay
    if (oThreat && this.reactAt < 0) this.reactAt = s.frame + L.react + Math.floor(this.r() * 6);
    if (!oThreat) this.reactAt = -1;
    const canReact = this.reactAt >= 0 && s.frame >= this.reactAt;
    // projectiles incoming
    const proj = s.proj.find((p) => p.owner !== this.i && p.type !== 'cav' && Math.abs(p.x - f.x) < 3 && Math.sign(p.vx) === Math.sign(f.x - p.x));
    if (actionable && proj && this.r() < L.block) {
      if (this.r() < 0.4 && f.st !== 'block') return UP | fwd; // jump over
      if (f.shell > 10) return BLOCK;
    }
    if (actionable && canReact) {
      if (f.shell > 8 && this.r() < L.block) {
        const low = o.st === 'attack' && sim.mv(o)?.lvl === 'low';
        if (this.r() < L.perfect && f.st !== 'block') { this.press([0, BLOCK | (low ? DOWN : 0), BLOCK | (low ? DOWN : 0), BLOCK | (low ? DOWN : 0), BLOCK, BLOCK, BLOCK, BLOCK]); return 0; }
        return BLOCK | (low ? DOWN : 0);
      }
      if (this.r() < 0.15 && f.dodgeCd <= 0 && f.shell > 0) { this.press([BLOCK, BLOCK | back, BLOCK]); return BLOCK; }
    }
    // keep blocking while being pressured
    if (f.st === 'block' || f.st === 'crouchblock') {
      if (oThreat && f.shell > 6) return BLOCK | (f.st === 'crouchblock' ? DOWN : 0);
      if (o.st === 'attack' && sim.mv(o) && o.mf >= sim.mv(o).t[0] + sim.mv(o).t[1] && dist < range + 0.6 && this.r() < L.combo) { this.press([0, LIGHT, 0, 0, LIGHT, 0, 0, HEAVY]); return 0; }
    }
    if (f.st === 'blockstun') return BLOCK;
    // anti-air
    if (actionable && o.st === 'air' && o.vy < 0.05 && dist < 2.2 && o.y > 0.6 && this.r() < L.anti) { this.press([DOWN, DOWN | HEAVY, 0]); return DOWN; }
    // ultimate
    if (actionable && f.meter >= PHYS.METER_MAX && dist < (f.char === 'brutus' ? 6 : f.char === 'bobby' || f.char === 'mimi' ? 3 : 3.2) && this.r() < 0.05) { this.press([LIGHT | HEAVY, LIGHT | HEAVY, 0]); return 0; }
    // molt when shell is low and safe
    if (actionable && f.shell < f.shellMax * 0.35 && f.moltCd <= 0 && dist > 4.5 && this.r() < 0.04) { this.press(new Array(190).fill(BLOCK | HEAVY)); return BLOCK; }
    // brutus snack
    if (actionable && f.char === 'brutus' && f.hp < f.hpMax * 0.6 && f.cs.snails > 0 && dist > 4 && this.r() < 0.03) { this.press([back | HEAVY, 0]); return back; }
    // in the air: attack when near
    if (inAir) {
      if (dist < range + 0.6 && o.y < f.y + 0.4 && this.r() < 0.25) return this.r() < 0.5 ? HEAVY : LIGHT;
      if (f.airJ > 0 && f.vy < -0.05 && this.r() < 0.03) return UP | towards;
      return towards;
    }
    if (!actionable) return f.st === 'attack' ? this.comboFollow(sim, f, o) : 0;
    // mood changes
    if (--this.moodT <= 0) { this.mood = this.r() < L.aggro ? 'rush' : (this.r() < 0.5 ? 'zone' : 'bait'); this.moodT = 40 + Math.floor(this.r() * 90); }
    // pick up items in the cantina sometimes
    if (sim.stage.id === 'cantina' && f.held < 0 && this.r() < 0.02) {
      const it = s.props.find((p) => (p.type === 'mug' || p.type === 'bottle') && p.state === 'rest' && Math.abs(p.x - f.x) < 0.7 && Math.abs(p.y - f.y) < 0.5);
      if (it && dist > 2) { this.press([LIGHT | BLOCK, 0]); return 0; }
    }
    if (f.held >= 0) { this.press([this.r() < 0.5 && f.hp < f.hpMax * 0.8 ? HEAVY : LIGHT, 0]); return 0; }
    // in range: attack
    if (dist < range + 0.25) {
      const roll = this.r();
      if (o.st === 'block' || o.st === 'crouchblock') {
        if (roll < L.throw) { this.press([LIGHT | BLOCK, 0]); return towards; }
        if (roll < L.throw + 0.25) { this.press([DOWN, DOWN | LIGHT, 0]); return DOWN; }
      }
      if (roll < 0.35) { this.press([LIGHT, 0, 0, 0, 0, 0, LIGHT, 0, 0, 0, 0, 0, HEAVY]); return 0; }
      if (roll < 0.5) { this.press([HEAVY, 0]); return 0; }
      if (roll < 0.62) { this.press([towards | LIGHT, towards]); return towards; }
      if (roll < 0.72) { this.press([DOWN, DOWN | LIGHT, 0]); return DOWN; }
      if (roll < 0.8) { this.press([back | HEAVY, 0]); return back; }
      if (roll < 0.9) { this.press([LIGHT | BLOCK, 0]); return 0; }
      return away;
    }
    // mid range
    if (dist < 5.5) {
      if (this.mood === 'zone' && this.r() < L.special * 0.08) {
        if (f.char === 'jim' || f.char === 'bobby' || (f.char === 'mimi')) { this.press([towards | HEAVY, 0]); return towards; }
        if (f.char === 'brutus' && dist < 3.2) { this.press([towards | HEAVY, 0]); return towards; }
      }
      if (f.char === 'mimi' && f.cs.puru === 'held' && f.cs.bubbleCd <= 0 && this.r() < L.special * 0.03) { this.press([back | HEAVY, 0]); return back; }
      if (this.mood === 'rush' && this.r() < 0.05) { this.press([towards, 0, towards, towards, towards]); return towards; } // dash
      if (this.r() < 0.012) { this.press([UP | towards]); return UP | towards; }
      if (this.mood === 'bait' && this.r() < 0.5) return this.r() < 0.5 ? away : 0;
      return towards;
    }
    // far
    if (this.r() < L.special * 0.02 && (f.char === 'jim' || f.char === 'bobby' || f.char === 'mimi')) { this.press([towards | HEAVY, 0]); return towards; }
    if (this.r() < 0.01) { this.press([towards, 0, towards, towards]); return towards; }
    return towards;
  }
  comboFollow(sim, f, o) {
    if (!f.connected || this.r() > this.L.combo) return 0;
    const m = sim.mv(f);
    if (!m || !m.next) return 0;
    if (f.mf >= m.t[0] + m.t[1] - 1 && f.mf <= m.t[0] + m.t[1] + 4) {
      if (m.next.H && this.r() < 0.5) return HEAVY;
      if (m.next.L) return LIGHT;
      if (m.next.S && this.r() < 0.4) return (f.face > 0 ? RIGHT : LEFT) | HEAVY;
    }
    return 0;
  }
}
