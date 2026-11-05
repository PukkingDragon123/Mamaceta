// Deterministic fighting-game simulation (60 ticks/s). All state lives in `this.s` as plain data
// so it can be hashed / snapshotted for online play. Uses only deterministic arithmetic.
import { PHYS, CHARS, MOVES, THROWS, moveFor, SKILLS, SKILL_IDS, LOTERIA, ULT_CINE } from './data.js';
import { STAGES } from './stages.js';
import { makeRng, rngFloat, rngInt, rngChance } from '../core/rng.js';
import { BTN } from '../core/input.js';

const { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, BLOCK, SKILL1, SKILL2, SKILL3 } = BTN;
const abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, sqrt = Math.sqrt;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r4 = (v) => Math.round(v * 10000) / 10000; // keep floats tidy (still deterministic)

const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'land', 'block', 'crouchblock', 'dashEnd']);
const HURT_STATES = new Set(['hitstun', 'airhit', 'knockdown', 'getup', 'thrown', 'dizzy', 'blockstun', 'ultVictim', 'bubbled', 'finished', 'ko', 'snagged', 'ucVictim', 'shocked']);

export class Sim {
  /**
   * cfg: { p: [{char, cos}, {char, cos}], stage, seed, rounds (to win), roundTime, qte, training: {...} }
   */
  constructor(cfg) {
    this.cfg = cfg;
    const st = STAGES[cfg.stage] || STAGES.rustpit;
    this.stage = st;
    this.events = [];
    this.s = {
      frame: 0, rng: makeRng(cfg.seed || 12345), phase: 'intro', pt: 0, round: 1, wins: [0, 0],
      timer: cfg.roundTime ? cfg.roundTime * 60 : PHYS.ROUND_TIME, pause: 0, slow: 0, slowAcc: 0,
      cine: null, qte: null, winner: -1, matchWinner: -1, done: false, nextId: 1,
      fighters: [], props: [], proj: [], plats: [], dark: 0, lastHit: -1, bartT: 0, jukebox: 0, roundWinners: [],
      skipIntro: [false, false], pick: null, ucine: null,
    };
    this.resetRound(true);
  }

  // ------------------------------------------------------------------ setup
  makeFighter(i, char, x) {
    const C = CHARS[char];
    return {
      i, char, x, y: 0, vx: 0, vy: 0, face: i === 0 ? 1 : -1, ground: true, plat: -1, drop: 0,
      hp: C.hp, hpMax: C.hp, shell: C.shell, shellMax: C.shell, meter: this.s.fighters[i] ? this.s.fighters[i].meter : 0,
      st: 'idle', sf: 0, mv: null, mf: 0, hitK: -1, connected: 0, charge: 0, chain: 0,
      hitstun: 0, blockstun: 0, hitstop: 0, inv: 0, armor: 0, launched: false,
      airJ: C.airJumps, dashCd: 0, dodgeCd: 0, blockPress: -999,
      inCur: 0, inPrev: 0, buf: { L: -999, H: -999, C: -999, U: -999, F: -999, B: -999, D: -999, S0: -999, S1: -999, S2: -999 }, rel: { F: -999, B: -999 },
      combo: 0, comboDmg: 0, lastComboShown: 0,
      moltCd: 0, molt: 0, soft: 0, dizzy: 0, held: -1, drunk: 0, wob: 0, hic: 90,
      grab: -1, qteEsc: 0, stagger: 0, taunting: 0, sk: [], skill: null,
      cs: { demon: false, demonDone: false, snails: 3, puru: 'held', puruId: -1, bubbleCd: 0, flail: 1, stuck: 0, hide: 0, flop: 0, flopX: 0, seqT: 0, seqV: -1, fireT: 0, eyesT: 0, armorT: 0, drT: 0, slowT: 0, invisT: 0, muerte: 0, card: -1, skHit: 0 },
      stats: { dmg: 0, hits: 0, maxCombo: 0, perfects: 0, shellBreaks: 0, molts: 0, ults: 0, snails: 0, throws: 0, qteEsc: 0, cav: 0, drinks: 0, demon: 0, skills: 0, ultQte: 0 },
    };
  }

  resetRound(first = false) {
    const s = this.s, st = this.stage, cfg = this.cfg;
    const prev = s.fighters.slice();
    const lastW = s.roundWinners.length ? s.roundWinners[s.roundWinners.length - 1] : -1;
    s.fighters = [this.makeFighter(0, cfg.p[0].char, st.spawn[0]), this.makeFighter(1, cfg.p[1].char, st.spawn[1])];
    s.fighters.forEach((f, i) => {
      const p = prev[i];
      if (!p) return;
      f.stats = p.stats; f.meter = first ? 0 : p.meter || 0;
      f.sk = p.sk.map((k) => ({ id: k.id, cd: 0 }));
      f.qteEsc = p.qteEsc;
      // SETS: health is saved between sets. The fighter who fell gets back up fresh (new shell),
      // the set winner (or both, on a draw) keeps the health they finished with.
      const keep = !first && (lastW === i || lastW < -1);
      if (keep && p.hp > 0) {
        f.hp = p.hp; f.shell = Math.max(Math.round(p.shellMax * 0.35), p.shell);
        if (p.cs.demon) { f.cs.demon = true; f.cs.demonDone = true; f.shellMax = p.shellMax; f.shell = Math.min(f.shell, f.shellMax); }
        f.cs.demonDone = p.cs.demonDone; f.cs.snails = p.cs.snails;
      }
    });
    s.plats = st.plats.map((p, i) => ({ ...p, id: i, broken: false, hp: p.hp || 0, ox: 0 }));
    s.props = [];
    for (const p of st.props) this.addProp(p.type, p.x, p.y, p);
    s.proj = [];
    s.timer = cfg.roundTime ? cfg.roundTime * 60 : PHYS.ROUND_TIME;
    s.qte = null; s.cine = null; s.ucine = null; s.dark = 0; s.slow = 0; s.pause = 0; s.winner = -1; s.bartT = 0;
    s.phase = first && !cfg.skipIntro ? 'intro' : 'ready';
    s.pt = 0;
    if (cfg.training) { s.phase = 'fight'; s.timer = 99 * 60; }
    this.event('roundReset', { round: s.round, kept: s.fighters.map((f) => f.hp < f.hpMax) });
    // skill draft
    if (!cfg.noSkills) {
      let who = [false, false];
      if (first) who = cfg.training ? [true, false] : [true, true];
      else {
        if (lastW >= 0) who[1 - lastW] = true;
        const need = this.winsNeeded();
        if (s.wins[0] === need - 1 && s.wins[1] === need - 1) who = [true, true];
      }
      who = who.map((w, i) => w && s.fighters[i].sk.length < 3);
      if (who.some(Boolean)) this.startPick(who, s.phase);
    }
  }

  startPick(who, next) {
    const s = this.s;
    const offers = [0, 1].map((i) => {
      if (!who[i]) return [];
      const owned = new Set(s.fighters[i].sk.map((k) => k.id));
      const pool = SKILL_IDS.filter((id) => !owned.has(id));
      const out = [];
      while (out.length < 3 && pool.length) out.push(pool.splice(rngInt(s.rng, pool.length), 1)[0]);
      return out;
    });
    s.pick = { who, offers, sel: [1, 1], done: who.map((w) => !w), t: 0, dur: this.cfg.pickTime ?? 720, end: 0, next, fall: s.round > 1 };
    s.phase = 'pick';
    this.event('pickStart', { who, offers, round: s.round });
  }
  tickPick() {
    const s = this.s, pk = s.pick;
    pk.t++;
    for (const f of s.fighters) { f.sf++; if (f.st !== 'idle') { f.st = 'idle'; f.sf = 0; } }
    for (let i = 0; i < 2; i++) {
      if (pk.done[i]) continue;
      const f = s.fighters[i];
      const pr = f.inCur & ~f.inPrev;
      if (pk.t > 24) {
        if (pr & LEFT) { pk.sel[i] = (pk.sel[i] + pk.offers[i].length - 1) % pk.offers[i].length; this.event('pickMove', { i }); }
        if (pr & RIGHT) { pk.sel[i] = (pk.sel[i] + 1) % pk.offers[i].length; this.event('pickMove', { i }); }
        if (pr & (LIGHT | SKILL1 | SKILL2 | SKILL3)) this.confirmPick(i);
      }
      if (pk.t >= pk.dur && !pk.done[i]) this.confirmPick(i);
    }
    if (pk.done[0] && pk.done[1]) {
      pk.end++;
      if (pk.end >= 50) {
        s.pick = null;
        // training: keep drafting until all 3 slots are filled
        if (this.cfg.training && s.fighters[0].sk.length < 3) { this.startPick([true, false], pk.next); return; }
        s.phase = pk.next; s.pt = 0;
        this.event('pickEnd', {});
      }
    }
  }
  confirmPick(i) {
    const s = this.s, pk = s.pick;
    const id = pk.offers[i][pk.sel[i]];
    pk.done[i] = true;
    if (id) s.fighters[i].sk.push({ id, cd: 0 });
    this.event('pickDone', { i, id, slot: s.fighters[i].sk.length - 1 });
  }

  addProp(type, x, y, o = {}) {
    const s = this.s;
    const defs = {
      barrel: { w: 0.7, h: 0.95, hp: 0 }, crate: { w: 1, h: 1, hp: 3 }, mug: { w: 0.32, h: 0.38 }, bottle: { w: 0.22, h: 0.5 }, stool: { w: 0.6, h: 0.7 },
      chandelier: { w: 1.6, h: 0.8, hp: 3 }, pinata: { w: 0.8, h: 1, hp: 5 }, jukebox: { w: 1.3, h: 1.9, hp: 0 }, vent: { w: 1.2, h: 6 }, snail: { w: 0.35, h: 0.3 },
    };
    const d = defs[type] || { w: 0.5, h: 0.5 };
    const p = { id: s.nextId++, type, x, y, vx: o.vx || 0, vy: o.vy || 0, w: o.w ?? d.w, h: o.h ?? d.h, hp: o.hp ?? d.hp ?? 0, state: 'rest', t: 0, owner: -1, hitCd: 0, by: -1, active: 0, bounces: 0, ang: 0 };
    s.props.push(p);
    return p;
  }

  event(t, o = {}) { this.events.push({ t, ...o, frame: this.s.frame }); }
  rnd() { return rngFloat(this.s.rng); }

  // ------------------------------------------------------------------ main tick
  step(inputs) {
    const s = this.s;
    s.frame++;
    // record inputs (always, so buffers work through pauses)
    for (let i = 0; i < 2; i++) this.readInput(s.fighters[i], inputs[i] | 0);
    if (s.done) return;
    // slow motion: advance logic every Nth tick (deterministic)
    if (s.slow > 0) {
      s.slow--;
      s.slowAcc += 0.34;
      if (s.slowAcc < 1) { this.tickCine(); return; }
      s.slowAcc -= 1;
    }
    if (s.pause > 0) { s.pause--; this.tickCine(); return; }
    switch (s.phase) {
      case 'intro': this.phaseIntro(); return;
      case 'ready': this.phaseReady(); return;
      case 'qte': this.tickQte(); return;
      case 'pick': this.tickPick(); return;
      case 'ucine': this.tickUltCine(); return;
      case 'finish': this.tickFinish(); return;
      case 'cine': this.tickCine(); return;
      default: break;
    }
    if (s.phase === 'fight') {
      if (!this.cfg.training && !this.cfg.noTimer) {
        s.timer--;
        if (s.timer <= 0) { this.timeUp(); return; }
      }
    }
    this.tickWorld();
    if (s.phase === 'ko' || s.phase === 'roundEnd' || s.phase === 'matchEnd' || s.phase === 'timeup') this.tickEnd();
  }

  readInput(f, bits) {
    const s = this.s;
    // drunk wobble swaps directions
    if (f.wob > 0 && (bits & (LEFT | RIGHT))) {
      const l = bits & LEFT, r = bits & RIGHT;
      bits = (bits & ~(LEFT | RIGHT)) | (l ? RIGHT : 0) | (r ? LEFT : 0);
    }
    f.inPrev = f.inCur; f.inCur = bits;
    const pr = bits & ~f.inPrev, rl = f.inPrev & ~bits;
    const fwd = f.face > 0 ? RIGHT : LEFT, back = f.face > 0 ? LEFT : RIGHT;
    if (pr & LIGHT) f.buf.L = s.frame;
    if (pr & HEAVY) f.buf.H = s.frame;
    if (pr & BLOCK) { f.buf.C = s.frame; f.blockPress = s.frame; }
    if (pr & UP) f.buf.U = s.frame;
    if (pr & DOWN) f.buf.D = s.frame;
    if (pr & SKILL1) f.buf.S0 = s.frame;
    if (pr & SKILL2) f.buf.S1 = s.frame;
    if (pr & SKILL3) f.buf.S2 = s.frame;
    if (pr & fwd) { f.dashF = (s.frame - f.buf.F <= PHYS.DASH_WINDOW && f.rel.F > f.buf.F) ? s.frame : -999; f.buf.F = s.frame; }
    if (pr & back) { f.dashB = (s.frame - f.buf.B <= PHYS.DASH_WINDOW && f.rel.B > f.buf.B) ? s.frame : -999; f.buf.B = s.frame; }
    if (rl & fwd) f.rel.F = s.frame;
    if (rl & back) f.rel.B = s.frame;
    if (rl & HEAVY) f.relH = s.frame;
  }
  held(f, b) { return (f.inCur & b) !== 0; }
  fwdHeld(f) { return this.held(f, f.face > 0 ? RIGHT : LEFT); }
  backHeld(f) { return this.held(f, f.face > 0 ? LEFT : RIGHT); }
  buf(f, k, win = PHYS.BUFFER) { return this.s.frame - f.buf[k] <= win; }
  use(f, k) { f.buf[k] = -999; }
  stats(f) {
    let C = CHARS[f.char];
    if (f.cs.demon && C.demon) C = { ...C, ...C.demon };
    if (f.cs.fireT > 0 || f.cs.slowT > 0) {
      const m = (f.cs.fireT > 0 ? 1.15 : 1) * (f.cs.slowT > 0 ? 0.8 : 1);
      C = { ...C, walk: C.walk * m, back: C.back * m, dash: C.dash * m, jumpX: C.jumpX * m, airAcc: C.airAcc * m };
    }
    return C;
  }
  mv(f, id = f.mv) { return moveFor(f.char, f.cs.demon, id); }

  // ------------------------------------------------------------------ phases
  phaseIntro() {
    const s = this.s;
    s.pt++;
    for (const f of s.fighters) { f.st = 'intro'; f.sf = s.pt; }
    for (let i = 0; i < 2; i++) if (s.pt > 30 && (s.fighters[i].inCur & (LIGHT | HEAVY))) s.skipIntro[i] = true;
    const skip = this.cfg.net ? (s.skipIntro[0] && s.skipIntro[1]) : (s.skipIntro[0] || s.skipIntro[1]);
    if (s.pt >= 260 || skip) { s.phase = 'ready'; s.pt = 0; for (const f of s.fighters) { f.st = 'idle'; f.sf = 0; } }
  }
  phaseReady() {
    const s = this.s;
    if (s.pt === 0) this.event('round', { round: s.round, final: s.wins[0] === this.winsNeeded() - 1 && s.wins[1] === this.winsNeeded() - 1 });
    s.pt++;
    for (const f of s.fighters) { f.st = 'idle'; f.sf++; }
    this.tickProps(true);
    if (s.pt === 70) this.event('fight');
    if (s.pt >= 90) { s.phase = 'fight'; s.pt = 0; }
  }
  winsNeeded() { return Math.ceil((this.cfg.rounds || 3) / 2); }

  timeUp() {
    const s = this.s;
    const [a, b] = s.fighters;
    const pa = a.hp / a.hpMax, pb = b.hp / b.hpMax;
    s.winner = pa > pb + 0.0001 ? 0 : pb > pa + 0.0001 ? 1 : -2;
    s.phase = 'timeup'; s.pt = 0;
    this.event('timeup', { winner: s.winner });
  }

  tickEnd() {
    const s = this.s;
    s.pt++;
    if (s.phase === 'ko' && s.pt >= 150) { this.endRound(); return; }
    if (s.phase === 'timeup' && s.pt >= 100) { this.endRound(); return; }
    if (s.phase === 'roundEnd' && s.pt >= 160) {
      const need = this.winsNeeded();
      if (s.wins[0] >= need || s.wins[1] >= need) {
        s.matchWinner = s.wins[0] >= need ? 0 : 1;
        s.phase = 'matchEnd'; s.pt = 0;
        this.event('matchEnd', { winner: s.matchWinner });
        const w = s.fighters[s.matchWinner]; w.st = 'victory'; w.sf = 0;
        const l = s.fighters[1 - s.matchWinner]; if (l.st !== 'ko') { l.st = 'defeat'; l.sf = 0; }
      } else {
        s.round++;
        this.resetRound(false);
      }
      return;
    }
    if (s.phase === 'matchEnd' && s.pt >= 330) s.done = true;
  }

  endRound() {
    const s = this.s;
    if (s.winner >= 0) s.wins[s.winner]++;
    else if (s.winner === -2) { s.wins[0]++; s.wins[1]++; }
    s.roundWinners.push(s.winner);
    s.phase = 'roundEnd'; s.pt = 0;
    if (s.winner >= 0) {
      const w = s.fighters[s.winner];
      if (w.st !== 'ko') { w.st = 'roundWin'; w.sf = 0; }
      const perfect = w.hp >= w.hpMax;
      this.event('roundWin', { winner: s.winner, perfect });
    } else this.event('roundWin', { winner: -1, draw: true });
  }

  // ------------------------------------------------------------------ world
  tickWorld() {
    const s = this.s;
    this.tickPlats();
    for (const f of s.fighters) this.tickFighter(f);
    for (const f of s.fighters) this.physics(f);
    this.tickProps(false);
    this.tickProj();
    this.resolveHits();
    this.pushApart();
    for (const f of s.fighters) this.updateFacing(f);
    this.checkDemon();
    this.checkKO();
    if (this.stage.bartender && s.phase === 'fight') this.tickBartender();
  }

  tickPlats() {
    const s = this.s;
    for (const p of s.plats) {
      if (!p.move) continue;
      const per = p.move.period, t = s.frame % per;
      const half = per / 2;
      const k = t < half ? t / half : 2 - t / half; // triangle 0..1..0
      const sm = k * k * (3 - 2 * k);
      const cx = p.move.a + (p.move.b - p.move.a) * sm;
      const w = (this.stage.plats[p.id].x1 - this.stage.plats[p.id].x0) / 2;
      const nx0 = r4(cx - w);
      p.dx = r4(nx0 - p.x0);
      p.x0 = nx0; p.x1 = r4(cx + w);
    }
  }

  updateFacing(f) {
    const o = this.s.fighters[1 - f.i];
    if (f.st === 'ko' || f.st === 'victory' || f.st === 'defeat') return;
    const turnable = NEUTRAL.has(f.st) || f.st === 'crouch' || (f.st === 'air' && false);
    if (!turnable) return;
    const d = o.x - f.x;
    if (abs(d) > 0.05) {
      const nf = d > 0 ? 1 : -1;
      if (nf !== f.face) { f.face = nf; this.event('turn', { i: f.i }); }
    }
  }

  setState(f, st) { f.st = st; f.sf = 0; }
  toNeutral(f) {
    f.mv = null; f.mf = 0; f.charge = 0; f.armor = 0;
    if (f.ground) this.setState(f, 'idle'); else this.setState(f, 'air');
  }

  startMove(f, id, o = {}) {
    let m = this.mv(f, id);
    if (!m) return false;
    if (m.needPuru && f.cs.puru !== 'held') { if (m.alt) { id = m.alt; m = this.mv(f, id); } else return false; }
    if (m.cooldown && f.cs.bubbleCd > 0) { id = 'bigSlap'; m = this.mv(f, id); }
    f.st = 'attack'; f.sf = 0; f.mv = id; f.mf = 0; f.hitK = -1; f.connected = 0; f.armor = m.armor ? 1 : 0;
    f.chargeLv = o.charge || 0;
    if (m.name) this.event('moveName', { i: f.i, name: m.name });
    if (m.sfx) this.event('whoosh', { i: f.i, sfx: m.sfx, heavy: (m.dmg || 0) >= 70 });
    // move start hooks
    if (m.rand === 'flail') f.cs.flail = 1 + rngInt(this.s.rng, 3);
    if (m.ult) {
      f.meter = 0; f.stats.ults++;
      f.inv = max(f.inv, m.t[0] + 5); // ultimates are invulnerable on startup
      this.s.pause = 42;
      this.event('ult', { i: f.i, name: m.name, char: f.char, demon: f.cs.demon });
    }
    if (m.snack) {
      if (f.cs.snails <= 0) { f.mv = null; this.setState(f, 'noSnack'); this.event('voice', { i: f.i, line: 'nosnack' }); return true; }
    }
    if (m.cooldown) f.cs.bubbleCd = m.cooldown;
    if (m.recall && f.cs.puru !== 'held') {
      // recall Puru instead of throwing
      const p = this.s.proj.find((q) => q.id === f.cs.puruId);
      if (p) { p.state = 'return'; p.life = 120; }
      f.mv = null; this.setState(f, 'recall');
      this.event('puruRecall', { i: f.i });
      return true;
    }
    if (m.vanish) this.event('vanish', { i: f.i, x: f.x, y: f.y });
    return true;
  }

  // ------------------------------------------------------------------ fighter tick
  tickFighter(f) {
    const s = this.s;
    if (f.hitstop > 0) { f.hitstop--; return; }
    const C = this.stats(f);
    f.sf++;
    if (f.inv > 0) f.inv--;
    if (f.dashCd > 0) f.dashCd--;
    if (f.dodgeCd > 0) f.dodgeCd--;
    if (f.moltCd > 0) f.moltCd--;
    if (f.soft > 0) f.soft--;
    if (f.cs.bubbleCd > 0) f.cs.bubbleCd--;
    for (const k of f.sk) if (k.cd > 0) k.cd--;
    const cs = f.cs;
    if (cs.fireT > 0) { cs.fireT--; if (cs.fireT === 0) this.event('buffEnd', { i: f.i, kind: 'fire' }); }
    if (cs.eyesT > 0) { cs.eyesT--; if (cs.eyesT === 0) this.event('buffEnd', { i: f.i, kind: 'eyes' }); }
    if (cs.armorT > 0) { cs.armorT--; if (cs.armorT === 0) this.event('buffEnd', { i: f.i, kind: 'armor' }); }
    if (cs.drT > 0) cs.drT--;
    if (cs.slowT > 0) cs.slowT--;
    if (cs.invisT > 0) cs.invisT--;
    if (f.drop > 0) f.drop--;
    if (f.wob > 0) f.wob--;
    // drunk system
    if (f.drunk > 0) {
      if (s.frame % 6 === 0) f.drunk--;
      if (f.drunk >= 250) {
        if (f.char !== 'bobby' && rngChance(s.rng, 0.012) && f.wob <= 0) f.wob = 26;
        f.hic--;
        if (f.hic <= 0) {
          f.hic = 90 + rngInt(s.rng, 120);
          this.event('hiccup', { i: f.i });
          if (f.ground && NEUTRAL.has(f.st)) { f.vy = 0.08; f.ground = false; f.st = 'air'; f.sf = 0; }
          if (f.char === 'mimi') this.spawnProj(f, 'hiccup');
          if (f.char === 'brutus') this.spawnProj(f, 'burp');
        }
        if (f.drunk >= 470 && NEUTRAL.has(f.st) && f.ground) { this.setState(f, 'sleep'); this.event('voice', { i: f.i, line: 'drunk' }); }
      }
    }
    const st = f.st;
    switch (st) {
      case 'idle': case 'walk': case 'crouch': case 'land': case 'dashEnd':
        if (st === 'land' && f.sf < 3) { f.vx *= 0.5; break; }
        if (!f.ground) { this.setState(f, 'air'); break; }
        if (this.tryGround(f)) break;
        this.groundMove(f, C);
        break;
      case 'block': case 'crouchblock':
        if (!f.ground) { this.setState(f, 'air'); break; }
        if (!this.held(f, BLOCK) || f.shell <= 0) { this.setState(f, 'idle'); if (this.tryGround(f)) break; break; }
        if (this.tryBlockActions(f)) break;
        f.st = this.held(f, DOWN) ? 'crouchblock' : 'block';
        f.vx *= 0.6;
        break;
      case 'prejump':
        if (f.sf >= 4) {
          const dir = this.held(f, RIGHT) ? 1 : this.held(f, LEFT) ? -1 : 0;
          f.vy = C.jumpV * (f.drunk >= 250 ? 0.85 : 1);
          f.vx = dir * C.jumpX;
          f.ground = false; f.plat = -1;
          this.setState(f, 'air');
          this.event('jump', { i: f.i, x: f.x, y: f.y });
        }
        break;
      case 'air':
        if (f.ground) { this.land(f); break; }
        this.airControl(f, C);
        this.tryAir(f, C);
        break;
      case 'dash': {
        const sp = C.dash * (1 - f.sf / 22);
        f.vx = f.face * max(C.walk, sp);
        if (f.sf >= 16) { this.setState(f, 'dashEnd'); break; }
        if (f.sf > 4 && this.tryGround(f)) break;
        break;
      }
      case 'backdash':
        f.vx = -f.face * C.dash * 0.85 * (1 - f.sf / 18);
        if (f.sf >= 15) this.setState(f, 'idle');
        break;
      case 'dodge':
        f.vx = f.dodgeDir * C.dash * 0.75 * (1 - f.sf / 30);
        if (f.sf >= 24) { this.setState(f, 'idle'); f.dodgeCd = 26; }
        break;
      case 'airdodge':
        f.vx = f.dodgeDir * 0.15 * (1 - f.sf / 20); f.vy = 0.02 * (1 - f.sf / 10);
        if (f.sf >= 18) { this.setState(f, 'air'); f.dodgeCd = 40; }
        break;
      case 'attack': this.tickAttack(f, C); break;
      case 'charging': this.tickCharging(f); break;
      case 'hitstun':
        if (f.sf >= f.hitstun) { f.combo = 0; this.toNeutral(f); }
        break;
      case 'blockstun':
        if (f.sf >= f.blockstun) this.setState(f, this.held(f, BLOCK) && f.shell > 0 ? (this.held(f, DOWN) ? 'crouchblock' : 'block') : 'idle');
        break;
      case 'airhit':
        if (f.ground && f.sf > 2) {
          if (f.launched || f.vyLand < -0.18) { this.setState(f, 'knockdown'); this.event('knockdown', { i: f.i, x: f.x }); f.vx *= 0.4; }
          else { f.combo = 0; this.setState(f, 'land'); }
        } else if (f.sf >= f.hitstun && !f.launched) {
          f.combo = 0; this.setState(f, 'air');
        }
        break;
      case 'knockdown':
        f.vx *= 0.8;
        if (f.sf >= 34 || (f.sf >= 18 && (f.inCur & (LIGHT | HEAVY | UP)))) { this.setState(f, 'getup'); f.inv = 14; f.combo = 0; }
        break;
      case 'getup':
        if (f.sf >= 14) this.setState(f, 'idle');
        break;
      case 'dizzy':
        if (f.inCur & ~f.inPrev) f.sf += 3;
        if (f.sf >= PHYS.DIZZY) { f.combo = 0; this.setState(f, 'idle'); }
        break;
      case 'molt':
        if (!(this.held(f, BLOCK) && this.held(f, HEAVY))) { this.setState(f, 'idle'); f.moltCd = 45; this.event('moltCancel', { i: f.i }); break; }
        if (f.sf >= PHYS.MOLT_FRAMES) {
          f.shell = f.shellMax; f.moltCd = PHYS.MOLT_COOLDOWN; f.soft = PHYS.SOFT_SHELL; f.inv = 12;
          f.stats.molts++;
          this.event('molt', { i: f.i, x: f.x, y: f.y, face: f.face });
          this.setState(f, 'moltEnd');
        }
        break;
      case 'moltEnd': if (f.sf >= 24) this.setState(f, 'idle'); break;
      case 'taunt':
        if (f.sf === 40) { f.meter = min(PHYS.METER_MAX, f.meter + 7); }
        if (f.sf >= 70) this.setState(f, 'idle');
        break;
      case 'throwing': this.tickThrowing(f); break;
      case 'thrown': case 'snagged': break; // driven by grabber
      case 'stagger': if (f.sf >= f.stagger) this.toNeutral(f); break;
      case 'bubbled':
        f.vx *= 0.9; f.vy = 0.012;
        if (f.inCur & ~f.inPrev) f.sf += 4;
        if (f.sf >= 110) { this.setState(f, 'air'); this.event('bubblePop', { x: f.x, y: f.y + 0.8 }); }
        break;
      case 'sleep':
        if (f.sf >= 130) { f.drunk = max(0, f.drunk - 180); this.setState(f, 'idle'); }
        break;
      case 'noSnack': if (f.sf >= 36) this.setState(f, 'idle'); break;
      case 'recall': if (f.sf >= 16) this.toNeutral(f); break;
      case 'pickup': if (f.sf >= 10) this.toNeutral(f); break;
      case 'toss': if (f.sf === 6) this.throwHeld(f, f.tossHard); if (f.sf >= 18) this.toNeutral(f); break;
      case 'drink':
        if (f.sf === 34) this.finishDrink(f);
        if (f.sf >= 44) this.toNeutral(f);
        break;
      case 'stumble': f.vx = f.face * 0.03; if (f.sf >= 16) this.setState(f, 'idle'); break;
      case 'stuck': if (f.sf >= 30) this.setState(f, 'idle'); break;
      case 'ultAtk': this.tickUltSeq(f); break;
      case 'ultVictim': break;
      case 'skill': this.tickSkill(f); break;
      case 'shocked': f.vx *= 0.8; if (f.sf >= f.hitstun) { f.combo = 0; this.toNeutral(f); } break;
      case 'ucAtk': case 'ucVictim': break;
      case 'demonize': break;
      case 'ko': f.vx *= 0.95; break;
      case 'roundWin': case 'victory': case 'defeat': f.vx *= 0.8; break;
      default: break;
    }
  }

  groundMove(f, C) {
    const fwd = this.fwdHeld(f), back = this.backHeld(f), down = this.held(f, DOWN);
    if (down) { if (f.st !== 'crouch') this.setState(f, 'crouch'); f.vx *= 0.5; return; }
    let vx = 0;
    if (fwd) vx = C.walk * f.face; else if (back) vx = -C.back * f.face;
    if (f.drunk >= 250) vx += (rngFloat(this.s.rng) - 0.5) * 0.04;
    if (vx !== 0) {
      f.vx = vx;
      if (f.st !== 'walk') this.setState(f, 'walk');
      // Bobby stumbles while walking (unless drunk-master)
      if (f.char === 'bobby' && !f.cs.demon && f.drunk < 250 && rngChance(this.s.rng, 0.004)) { this.setState(f, 'stumble'); this.event('voice', { i: f.i, line: 'oops' }); }
      if (f.sf % 16 === 1) this.event('step', { i: f.i, x: f.x });
    } else {
      if (f.st === 'walk' || f.st === 'crouch' || f.st === 'dashEnd') this.setState(f, 'idle');
    }
  }

  airControl(f, C) {
    let ax = 0;
    if (this.held(f, RIGHT)) ax = C.airAcc; else if (this.held(f, LEFT)) ax = -C.airAcc;
    const cap = C.jumpX * 1.25;
    if (ax) f.vx = clamp(f.vx + ax, -cap, cap);
    // Mimi float with Puru as a parachute
    if (f.char === 'mimi' && f.cs.puru === 'held' && this.held(f, UP) && f.vy < -0.04 && f.sf > 6) { f.vy = -0.04; f.floating = true; } else f.floating = false;
  }

  tryAir(f, C) {
    const s = this.s;
    if (this.buf(f, 'C', 3) && (this.held(f, LEFT) || this.held(f, RIGHT)) && f.dodgeCd <= 0) {
      this.use(f, 'C'); f.dodgeDir = this.held(f, RIGHT) ? 1 : -1; f.inv = 12; this.setState(f, 'airdodge'); this.event('dodge', { i: f.i }); return true;
    }
    if (this.trySkill(f, true)) return true;
    if (this.buf(f, 'H')) { this.use(f, 'H'); return this.startMove(f, 'airH'); }
    if (this.buf(f, 'L')) { this.use(f, 'L'); return this.startMove(f, 'airL'); }
    if (this.buf(f, 'U', 4) && f.airJ > 0 && f.sf > 3) {
      this.use(f, 'U'); f.airJ--;
      f.vy = C.airJumpV; const dir = this.held(f, RIGHT) ? 1 : this.held(f, LEFT) ? -1 : 0;
      f.vx = dir * C.jumpX; this.setState(f, 'air'); f.sf = 4;
      this.event('airjump', { i: f.i, x: f.x, y: f.y });
      return true;
    }
    return false;
  }

  tryBlockActions(f) {
    const s = this.s;
    if (this.buf(f, 'L', 4)) { this.use(f, 'L'); this.doThrowOrPickup(f); return true; }
    if (this.buf(f, 'H', 4) && f.shell < f.shellMax && f.moltCd <= 0) { this.use(f, 'H'); this.setState(f, 'molt'); this.event('moltStart', { i: f.i }); return true; }
    if (this.buf(f, 'H', 4) && f.shell >= f.shellMax) { this.use(f, 'H'); this.event('moltDenied', { i: f.i, why: 'full' }); }
    else if (this.buf(f, 'H', 4) && f.moltCd > 0) { this.use(f, 'H'); this.event('moltDenied', { i: f.i, why: 'cooldown' }); }
    if (this.buf(f, 'U', 4)) { this.use(f, 'U'); this.setState(f, 'taunt'); this.event('taunt', { i: f.i, char: f.char }); return true; }
    const fwdP = s.frame - f.buf.F <= 3, backP = s.frame - f.buf.B <= 3;
    if ((fwdP || backP) && f.dodgeCd <= 0) {
      f.buf.F = f.buf.B = -999;
      f.dodgeDir = fwdP ? f.face : -f.face; f.inv = 16; this.setState(f, 'dodge'); this.event('dodge', { i: f.i }); return true;
    }
    return false;
  }

  tryGround(f) {
    const s = this.s, P = PHYS;
    const C = this.stats(f);
    // item in hand
    if (f.held >= 0) {
      const it = this.propById(f.held);
      if (!it) f.held = -1;
      else {
        if (this.buf(f, 'L')) { this.use(f, 'L'); f.tossHard = false; this.setState(f, 'toss'); return true; }
        if (this.buf(f, 'H')) {
          this.use(f, 'H');
          if (it.type === 'mug' || it.type === 'bottle') { this.setState(f, 'drink'); this.event('drinkStart', { i: f.i }); }
          else { f.tossHard = true; this.setState(f, 'toss'); }
          return true;
        }
        if (this.buf(f, 'C', 3)) { this.use(f, 'C'); this.dropHeld(f); }
      }
    }
    const L = this.buf(f, 'L'), H = this.buf(f, 'H');
    // ultimate: light + heavy together
    if (L && H && abs(f.buf.L - f.buf.H) <= P.CHORD && f.meter >= P.METER_MAX && f.held < 0) {
      this.use(f, 'L'); this.use(f, 'H');
      return this.startMove(f, 'ult');
    }
    if (this.trySkill(f, false)) return true;
    // throw: light + block together
    if (L && this.buf(f, 'C') && abs(f.buf.L - f.buf.C) <= P.CHORD) {
      this.use(f, 'L'); this.use(f, 'C');
      this.doThrowOrPickup(f);
      return true;
    }
    if (this.held(f, BLOCK)) {
      if (this.tryBlockActions(f)) return true;
      if (f.shell > 0) {
        this.setState(f, this.held(f, DOWN) ? 'crouchblock' : 'block');
        return true;
      }
      if (this.buf(f, 'C', 1)) this.event('noShell', { i: f.i });
    }
    // wait for chords (don't fire single button on the first frame of a possible chord)
    if ((L && s.frame - f.buf.L < 1) || (H && s.frame - f.buf.H < 1)) return false;
    if (H) {
      this.use(f, 'H');
      if (this.held(f, DOWN)) return this.startMove(f, 'uppercut');
      if (this.fwdHeld(f)) return this.startMove(f, 'specialF');
      if (this.backHeld(f)) return this.startMove(f, 'specialB');
      return this.startMove(f, 'heavy');
    }
    if (L) {
      this.use(f, 'L');
      if (this.held(f, DOWN)) return this.startMove(f, 'clight');
      if (this.fwdHeld(f) && f.st !== 'idle' || (this.fwdHeld(f) && s.frame - f.buf.F < 10)) return this.startMove(f, 'barrage');
      if (this.fwdHeld(f)) return this.startMove(f, 'barrage');
      return this.startMove(f, 'jab');
    }
    if (this.buf(f, 'U', 5)) {
      this.use(f, 'U');
      if (this.held(f, DOWN) && f.plat >= 0) { f.drop = 14; f.ground = false; f.plat = -1; f.vy = -0.05; this.setState(f, 'air'); this.event('drop', { i: f.i }); return true; }
      this.setState(f, 'prejump');
      return true;
    }
    // double-tap down on a platform also drops through
    if (f.plat >= 0 && this.buf(f, 'D', 1) && s.frame - (f.lastD || -999) < 14) { f.drop = 14; f.ground = false; f.plat = -1; f.vy = -0.05; this.setState(f, 'air'); return true; }
    if (this.buf(f, 'D', 0)) f.lastD = s.frame;
    if (f.dashF === s.frame - 0 || (f.dashF > 0 && s.frame - f.dashF <= 1)) {
      f.dashF = -999; this.setState(f, 'dash'); this.event('dash', { i: f.i, x: f.x, dir: f.face }); return true;
    }
    if (f.dashB === s.frame || (f.dashB > 0 && s.frame - f.dashB <= 1)) {
      f.dashB = -999; f.inv = 5; this.setState(f, 'backdash'); this.event('dash', { i: f.i, x: f.x, dir: -f.face }); return true;
    }
    return false;
  }

  doThrowOrPickup(f) {
    const o = this.s.fighters[1 - f.i];
    const dist = abs(o.x - f.x);
    const C = CHARS[f.char];
    // pick up an item if one is at our feet and the opponent is not in throw range
    if (f.held < 0 && dist > C.w + 0.8) {
      const it = this.s.props.find((p) => (p.type === 'mug' || p.type === 'bottle' || p.type === 'stool') && p.state === 'rest' && abs(p.x - f.x) < 0.75 && abs(p.y - f.y) < 0.6);
      if (it) {
        it.state = 'held'; it.owner = f.i; f.held = it.id;
        this.setState(f, 'pickup');
        this.event('pickup', { i: f.i, type: it.type });
        return;
      }
    }
    this.startMove(f, 'throw');
  }

  land(f) {
    const C = this.stats(f);
    f.airJ = C.airJumps;
    this.event('land', { i: f.i, x: f.x, y: f.y, heavy: f.char === 'brutus', v: f.vyLand || 0 });
    this.setState(f, 'land');
  }

  // ------------------------------------------------------------------ attacks
  tickAttack(f, C) {
    const s = this.s;
    const m = this.mv(f);
    if (!m) { this.toNeutral(f); return; }
    f.mf++;
    const [S0, A, R] = m.t;
    const mf = f.mf;
    let total = S0 + A + R;
    if (f.mv === 'heavy' && m.charge && mf === S0 - 3 && this.held(f, HEAVY)) { this.setState(f, 'charging'); f.charge = 0; this.event('chargeStart', { i: f.i }); return; }
    if (f.cs.stuck > 0) total += f.cs.stuck;
    // self motion
    if (m.step && mf === S0 - 1) f.vx += f.face * m.step * (1 + (f.chargeLv || 0) * 1.2);
    if (m.rush && mf >= S0 && mf < S0 + A) f.vx = f.face * m.rush;
    if (m.rise && mf === S0) { f.vx = f.face * m.rise[0]; f.vy = m.rise[1]; f.ground = false; f.plat = -1; }
    if (m.dive && mf === S0) { f.vx = f.face * m.dive[0]; f.vy = m.dive[1]; }
    if (m.dash && mf >= S0 && mf < S0 + A) f.vx = f.face * m.dash;
    if (m.proj && mf === m.proj.f) this.spawnProj(f, m.proj.type, m.proj);
    // per-move special behaviour
    if (m.snack) {
      if (mf === 20) this.event('snackCrack', { i: f.i });
      if (mf === 48) { f.cs.snails--; const heal = Math.round(f.hpMax * 0.09 * (f.drunk >= 250 ? 1.4 : 1)); f.hp = min(f.hpMax, f.hp + heal); this.event('heal', { i: f.i, amt: heal }); this.event('snackEat', { i: f.i }); }
    }
    if (m.counter && mf >= S0 && mf < S0 + A) f.countering = true; else f.countering = false;
    if (m.hide) {
      f.hiding = mf >= S0 && mf < S0 + A;
      if (f.hiding && this.buf(f, 'H', 3) && mf > S0 + 4) { this.use(f, 'H'); f.hiding = false; this.startMove(f, 'uppercut'); return; }
    } else f.hiding = false;
    if (m.vanish && mf === S0) {
      const o = s.fighters[1 - f.i];
      f.x = clamp(o.x - o.face * 1.1, this.stage.left + 0.5, this.stage.right - 0.5);
      f.face = o.x > f.x ? 1 : -1;
      this.event('vanishOut', { i: f.i, x: f.x, y: f.y });
    }
    if (m.slam && !f.ground && mf > S0) { /* falling body slam; landing handled in physics */ }
    if (m.slam && f.ground && mf > S0 + 1 && !f.slammed) {
      f.slammed = true; this.spawnProj(f, 'quake', { dmg: 80 });
      this.event('slam', { i: f.i, x: f.x, y: f.y });
      f.mf = S0 + A; // jump to recovery
    }
    if (m.flop) { this.tickFlop(f, m); return; }
    if (m.jam || m.tornado) {
      if (mf >= S0 && mf < S0 + A) {
        let dir = f.face;
        if (m.tornado) { if (this.held(f, RIGHT)) f.spinDir = 1; else if (this.held(f, LEFT)) f.spinDir = -1; dir = f.spinDir || f.face; f.vx = dir * 0.13; }
        else { if (!f.jamV) f.jamV = f.face * 0.16; f.vx = f.jamV; if (f.ground && mf % 40 === 0) { f.vy = 0.12 + rngFloat(s.rng) * 0.1; f.ground = false; } }
        if (mf % 8 === 0) this.event('spinFx', { i: f.i, x: f.x, y: f.y });
      }
      if (mf === S0 + A) { f.jamV = 0; this.event('ultEnd', { i: f.i, x: f.x, y: f.y }); }
    }
    if (m.rand === 'trip' && mf === S0 + A - 1 && !f.connected && f.drunk < 250 && rngChance(s.rng, 0.3)) {
      this.event('voice', { i: f.i, line: 'oops' }); f.mv = null; f.vx = f.face * 0.12; this.setState(f, 'stumble'); return;
    }
    if (m.rand === 'faceplant' && mf === S0 + A && !f.connected && f.drunk < 250 && rngChance(s.rng, 0.25)) {
      f.cs.stuck = 22; this.event('faceplant', { i: f.i, x: f.x });
    }
    // cancels
    if (this.tryCancel(f, m)) return;
    if (mf >= total) {
      f.cs.stuck = 0; f.slammed = false;
      if (m.air && !f.ground) { f.mv = null; this.setState(f, 'air'); return; }
      this.toNeutral(f);
      return;
    }
    if (m.air && f.ground && mf > 2) {
      // landing during an air attack -> small landing lag
      f.mv = null; this.setState(f, 'land'); f.sf = -4; this.event('land', { i: f.i, x: f.x, y: f.y });
    }
  }

  tryCancel(f, m) {
    const s = this.s;
    const [S0, A] = m.t;
    const mf = f.mf;
    const next = m.next;
    if (!next) {
      // specials can super-cancel into the ultimate on hit
      if (f.connected && f.meter >= PHYS.METER_MAX && this.buf(f, 'L') && this.buf(f, 'H') && mf >= S0 && !m.ult) { this.use(f, 'L'); this.use(f, 'H'); return this.startMove(f, 'ult'); }
      return false;
    }
    const inWindow = mf >= S0 && mf <= S0 + A + 9;
    const allowed = (f.connected && inWindow) || (m.chainWhiff && mf >= S0 + A && mf <= S0 + A + 9);
    if (!allowed) return false;
    if (f.meter >= PHYS.METER_MAX && this.buf(f, 'L') && this.buf(f, 'H') && abs(f.buf.L - f.buf.H) <= PHYS.CHORD) { this.use(f, 'L'); this.use(f, 'H'); return this.startMove(f, 'ult'); }
    if (this.buf(f, 'H') && f.connected) {
      if (next.S && this.held(f, DOWN)) { this.use(f, 'H'); return this.startMove(f, 'uppercut'); }
      if (next.S && this.fwdHeld(f)) { this.use(f, 'H'); return this.startMove(f, 'specialF'); }
      if (next.S && this.backHeld(f)) { this.use(f, 'H'); return this.startMove(f, 'specialB'); }
    }
    if (next.H && this.buf(f, 'H') && s.frame - f.buf.H >= 1) { this.use(f, 'H'); return this.startMove(f, next.H); }
    if (next.L && this.buf(f, 'L') && s.frame - f.buf.L >= 1) { this.use(f, 'L'); return this.startMove(f, next.L); }
    if (next.U && f.connected && this.buf(f, 'U')) { this.use(f, 'U'); this.toNeutral(f); this.setState(f, 'prejump'); f.sf = 3; return true; }
    return false;
  }

  tickCharging(f) {
    f.charge++;
    f.vx *= 0.7;
    if (f.charge === 50) this.event('chargeFull', { i: f.i });
    if (!this.held(f, HEAVY) || f.charge >= 90) {
      const lv = min(1, f.charge / 50);
      this.event('chargeRelease', { i: f.i, lv });
      this.startMove(f, 'charged', { charge: lv });
    }
  }

  tickFlop(f, m) {
    const s = this.s, o = s.fighters[1 - f.i];
    const mf = f.mf;
    if (mf === 14) { f.vy = 0.5; f.ground = false; f.plat = -1; f.inv = 999; f.vx = 0; this.event('flopJump', { i: f.i, x: f.x }); }
    if (mf > 14 && mf < 70) {
      f.vy = mf < 30 ? f.vy : 0; if (mf >= 30) f.y = 14;
      if (mf >= 30) {
        // steer shadow toward opponent, player can nudge
        const target = o.x + (this.held(f, RIGHT) ? 1.5 : this.held(f, LEFT) ? -1.5 : 0);
        f.flopX = f.flopX === undefined || mf === 30 ? f.x : f.flopX;
        f.flopX += clamp(target - f.flopX, -0.12, 0.12);
        f.x = f.flopX;
      }
    }
    if (mf === 70) { f.vy = -0.9; f.inv = 0; f.drop = 60; this.event('flopFall', { i: f.i, x: f.x }); }
    if (mf > 70 && !f.ground) f.drop = max(f.drop, 2); // crash through platforms down to the floor
    if (mf > 70 && f.ground && !f.slammed) {
      f.slammed = true;
      this.event('flopLand', { i: f.i, x: f.x });
      // direct hit check
      const dx = abs(o.x - f.x);
      if (dx < 1.8 && abs(o.y - f.y) < 1.6 && o.inv <= 0 && o.st !== 'ko') {
        this.applyHit(f, o, { dmg: 90, sh: 80, hs: 70, bs: 30, stop: 16, kb: [0.12 * (o.x >= f.x ? f.face : -f.face), 0.32], launch: true, lvl: 'mid', unblockable: true, ult: true, fx: 'flop' }, f.face, { x: o.x, y: 0.6 });
        this.event('flatten', { i: o.i });
        if (s.phase === 'ucine') { f.slammed = false; return; }
      }
      this.spawnProj(f, 'quake', { dmg: 90, big: true });
      f.mf = 200; f.mv = 'ult';
    }
    if (mf > 220 || (f.slammed && mf > 200 + 34)) { f.slammed = false; f.inv = 0; this.toNeutral(f); }
    if (mf > 300) { f.slammed = false; f.inv = 0; this.toNeutral(f); }
  }

  tickUltSeq(f) {
    const s = this.s;
    const o = s.fighters[1 - f.i];
    const t = ++f.cs.seqT;
    const demon = f.cs.seqV === 1;
    if (o.st === 'ultVictim') { o.x = clamp(f.x + f.face * 0.85, this.stage.left + 0.3, this.stage.right - 0.3); o.y = max(o.y, 0); o.vx = 0; o.vy = 0; }
    if (t % 9 === 0 && t < 90 && o.st === 'ultVictim') {
      const dmg = demon ? 26 : 22;
      this.dealSeqDamage(f, o, dmg, t);
    }
    if (t === 96 && o.st === 'ultVictim') {
      this.event('ultFinal', { i: f.i, x: o.x, y: o.y + 1, demon });
      this.dealSeqDamage(f, o, demon ? 120 : 140, t, true);
      if (o.st !== 'ko') { o.st = 'airhit'; o.sf = 0; o.hitstun = 60; o.launched = true; o.vx = f.face * 0.28; o.vy = 0.3; o.ground = false; }
      this.s.pause = 8;
    }
    if (t >= 120) { f.cs.seqT = 0; this.toNeutral(f); }
  }
  dealSeqDamage(f, o, dmg, t, final = false) {
    const scaled = Math.round(dmg * (f.cs.demon ? 1.1 : 1));
    if (o.hp - scaled <= 0 && !final) { o.hp = max(1, o.hp - scaled); }
    else if (o.hp - scaled <= 0 && final) {
      o.hp = 0; this.event('hit', { a: f.i, d: o.i, x: o.x, y: o.y + 1, dmg: scaled, heavy: true, ult: true, combo: o.combo, kb: f.face });
      this.koHit(f, o, true);
      return;
    } else o.hp -= scaled;
    o.combo++; f.stats.dmg += scaled; f.stats.hits++;
    this.event('hit', { a: f.i, d: o.i, x: o.x, y: o.y + 1, dmg: scaled, heavy: final, ult: true, combo: o.combo, kb: f.face, seq: t });
  }

  // ------------------------------------------------------------------ throws
  tickThrowing(f) {
    const o = this.s.fighters[1 - f.i];
    const T = THROWS[f.char];
    o.x = f.x + f.face * (CHARS[f.char].w * 0.5 + 0.35); o.y = f.y + (f.sf > 14 && f.sf < 30 ? 0.5 : 0.1);
    o.vx = 0; o.vy = 0;
    // throw tech window
    if (f.sf < 9 && o.st === 'thrown' && this.buf(o, 'L', 8) && this.buf(o, 'C', 8)) {
      this.use(o, 'L'); this.use(o, 'C');
      this.event('tech', { x: (f.x + o.x) / 2, y: 1 });
      f.vx = -f.face * 0.12; o.vx = f.face * 0.12;
      this.setState(f, 'stagger'); f.stagger = 14; this.setState(o, 'stagger'); o.stagger = 14;
      return;
    }
    if (f.sf === 16 || f.sf === 26) this.event('throwShake', { i: f.i });
    if (f.sf >= T.frames) {
      const back = this.backHeld(f);
      const dir = back ? -f.face : f.face;
      if (back) o.x = f.x - f.face * 0.4;
      const dmg = T.dmg;
      this.applyHit(f, o, { dmg, sh: 0, hs: 40, bs: 0, stop: 10, kb: [T.toss[0] * dir * f.face, T.toss[1]], launch: true, unblockable: true, throwHit: true, fx: 'throw' }, dir, { x: o.x, y: o.y + 0.7 });
      f.stats.throws++;
      this.toNeutral(f);
    }
  }

  // ------------------------------------------------------------------ physics
  physics(f) {
    const s = this.s, st = this.stage;
    if (f.hitstop > 0 || f.st === 'thrown' || f.st === 'snagged' || f.st === 'ultVictim') return;
    const C = this.stats(f);
    const P = PHYS;
    const wasGround = f.ground;
    // gravity
    const noGrav = f.st === 'bubbled' || (f.mv === 'ult' && this.mv(f)?.flop && f.mf >= 30 && f.mf < 70);
    if (!f.ground && !noGrav) {
      let g = P.GRAV;
      if (f.st === 'airhit') g *= 1.05;
      const mvd = f.st === 'attack' ? this.mv(f) : null;
      f.vy = max(f.vy - g, f.st === 'airhit' ? -0.4 : -P.MAXFALL * (mvd && mvd.flop ? 3 : mvd && mvd.dive ? 2.2 : 1));
    }
    // vents (updraft)
    for (const p of s.props) {
      if (p.type === 'vent' && p.active > 0 && abs(f.x - p.x) < 0.9 && f.y < 7) { f.vy = min(f.vy + 0.024, 0.22); if (f.ground) { f.ground = false; f.plat = -1; if (NEUTRAL.has(f.st)) this.setState(f, 'air'); } }
    }
    // friction
    if (f.ground) {
      const moving = f.st === 'walk' || f.st === 'dash' || f.st === 'backdash' || f.st === 'dodge' || (f.st === 'attack' && (this.mv(f)?.rush || this.mv(f)?.dash || this.mv(f)?.jam || this.mv(f)?.tornado)) || f.st === 'stumble';
      if (!moving) f.vx *= (f.st === 'hitstun' || f.st === 'blockstun' || f.st === 'knockdown') ? P.HIT_FRIC : P.GROUND_FRIC;
    } else if (f.st !== 'airhit' && f.st !== 'air' && f.st !== 'airdodge') f.vx *= P.AIR_FRIC;
    if (abs(f.vx) < 0.0005) f.vx = 0;
    // platform carry
    if (f.ground && f.plat >= 0) { const pl = s.plats[f.plat]; if (pl && pl.dx) f.x += pl.dx; }
    // integrate X with walls & solid crates
    let nx = f.x + f.vx;
    const hw = C.w / 2;
    for (const p of s.props) {
      if (p.type !== 'crate' || p.state === 'broken') continue;
      const top = p.y + p.h;
      if (f.y >= top - 0.05 || f.y + C.h <= p.y) continue;
      const pl = p.x - p.w / 2 - hw, pr = p.x + p.w / 2 + hw;
      if (nx > pl && nx < pr) { nx = f.x <= p.x ? pl : pr; if (f.st === 'airhit' && abs(f.vx) > 0.15) { this.damageProp(p, 1, f.i); } f.vx = 0; }
    }
    for (const p of s.proj) {
      if (p.type !== 'coralWall' || p.owner === f.i) continue;
      if (f.y >= p.y + p.h - 0.05 || f.y + C.h <= p.y) continue;
      const pl = p.x - p.w / 2 - hw, pr = p.x + p.w / 2 + hw;
      if (nx > pl && nx < pr) { nx = f.x <= p.x ? pl : pr; if (f.st === 'airhit' && abs(f.vx) > 0.15) { p.hp--; this.event('coralHit', { id: p.id, x: p.x, y: f.y + 0.8 }); } f.vx = 0; }
    }
    const L = st.left + hw, R = st.right - hw;
    if (nx < L || nx > R) {
      nx = clamp(nx, L, R);
      if ((f.st === 'airhit' || f.st === 'hitstun') && abs(f.vx) > 0.17 && f.wallBounce) {
        f.vx = -f.vx * 0.55; f.vy = max(f.vy, 0.15); f.wallBounce = false; f.ground = false;
        this.event('wallBounce', { i: f.i, x: nx, y: f.y + 0.8 });
      } else f.vx = 0;
    }
    f.x = nx;
    // integrate Y
    const oldY = f.y;
    let ny = f.y + f.vy;
    f.ground = false;
    let landedPlat = -1;
    if (f.vy <= 0) {
      if (ny <= 0) { ny = 0; f.ground = true; }
      else if (f.drop <= 0 && !(this.held(f, DOWN) && f.st === 'airhit')) {
        for (const pl of s.plats) {
          if (pl.broken) continue;
          if (f.x < pl.x0 - 0.05 || f.x > pl.x1 + 0.05) continue;
          if (oldY >= pl.y - 0.001 && ny <= pl.y) { ny = pl.y; f.ground = true; landedPlat = pl.id; break; }
        }
        if (!f.ground) {
          for (const p of s.props) {
            if (p.type !== 'crate' || p.state === 'broken') continue;
            const top = p.y + p.h;
            if (abs(f.x - p.x) < p.w / 2 + hw * 0.6 && oldY >= top - 0.001 && ny <= top) { ny = top; f.ground = true; landedPlat = -2 - p.id; break; }
          }
        }
      }
    }
    if (f.ground) {
      f.vyLand = f.vy;
      if (!wasGround && f.vy < -0.02) f.vy = 0;
      f.vy = 0; f.plat = landedPlat >= 0 ? landedPlat : -1;
      if (f.groundBounce && f.st === 'airhit' && f.vyLand < -0.15) {
        f.groundBounce = false; f.vy = 0.17; f.ground = false; ny += 0.01;
        this.event('groundBounce', { i: f.i, x: f.x, y: 0 });
      }
    } else if (wasGround && f.vy <= 0 && landedPlat === -1) {
      // walked off a ledge
      if (NEUTRAL.has(f.st)) this.setState(f, 'air');
    }
    f.y = ny;
    f.x = r4(f.x); f.y = r4(f.y); f.vx = r4(f.vx); f.vy = r4(f.vy);
  }

  pushApart() {
    const [a, b] = this.s.fighters;
    if (a.st === 'thrown' || b.st === 'thrown' || a.st === 'snagged' || b.st === 'snagged' || a.st === 'ultVictim' || b.st === 'ultVictim' || a.st === 'ko' || b.st === 'ko') return;
    if (a.inv > 900 || b.inv > 900) return;
    if ((a.st === 'skill' && a.skill === 'riptide') || (b.st === 'skill' && b.skill === 'riptide')) return;
    if (a.st === 'ucAtk' || a.st === 'ucVictim') return;
    const Ca = CHARS[a.char], Cb = CHARS[b.char];
    const overlapY = a.y < b.y + Cb.h * 0.8 && b.y < a.y + Ca.h * 0.8;
    if (!overlapY) return;
    const minD = (Ca.w + Cb.w) / 2;
    const d = b.x - a.x;
    if (abs(d) >= minD) return;
    const push = (minD - abs(d)) / 2;
    const dir = d === 0 ? (a.face > 0 ? 1 : -1) : (d > 0 ? 1 : -1);
    a.x -= dir * push; b.x += dir * push;
    const st = this.stage;
    for (const f of [a, b]) { const hw = CHARS[f.char].w / 2; f.x = r4(clamp(f.x, st.left + hw, st.right - hw)); }
    // if one is cornered, push the other more
    const ha = Ca.w / 2, hb = Cb.w / 2;
    if (abs(b.x - a.x) < minD - 0.001) {
      if (a.x <= st.left + ha + 0.001 || a.x >= st.right - ha - 0.001) b.x = r4(a.x + dir * minD);
      else if (b.x <= st.left + hb + 0.001 || b.x >= st.right - hb - 0.001) a.x = r4(b.x - dir * minD);
    }
  }

  // ------------------------------------------------------------------ hit detection
  hurtbox(f) {
    const C = CHARS[f.char];
    const crouch = f.st === 'crouch' || f.st === 'crouchblock' || (f.st === 'attack' && this.mv(f)?.crouch);
    const h = (f.st === 'knockdown' || f.st === 'sleep') ? 0.45 : crouch ? C.ch : (f.hiding ? C.ch * 0.8 : C.h);
    return [f.x - C.hurtW, f.x + C.hurtW, f.y, f.y + h];
  }
  hitbox(f) {
    if (f.st !== 'attack') return null;
    const m = this.mv(f);
    if (!m || !m.hb || (m.dmg <= 0 && !m.snag && !m.grab)) return null;
    const [S0, A] = m.t;
    const mf = f.mf;
    if (mf < S0 || mf >= S0 + A) return null;
    const k = m.every > 0 ? floor((mf - S0) / m.every) : 0;
    const hits = m.rand === 'flail' ? min(m.hits, f.cs.flail) : m.hits;
    if (k >= hits) return null;
    if (f.hitK === k) return null;
    const hb = m.hb;
    const x0 = f.face > 0 ? f.x + hb[0] : f.x - hb[1], x1 = f.face > 0 ? f.x + hb[1] : f.x - hb[0];
    return { box: [x0, x1, f.y + hb[2], f.y + hb[3]], k, m };
  }
  overlap(a, b) { return a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3]; }

  resolveHits() {
    const s = this.s;
    const hits = [];
    for (const f of s.fighters) {
      const hb = this.hitbox(f);
      if (!hb) continue;
      const o = s.fighters[1 - f.i];
      // props can be hit by any attack
      this.hitProps(f, hb);
      this.hitSkillObjects(f, hb);
      if (o.st === 'ko' || o.st === 'thrown' || o.st === 'ultVictim' || o.st === 'snagged' || o.st === 'ucVictim') continue;
      if (o.inv > 0 && !(hb.m.grab && false)) continue;
      if (!this.overlap(hb.box, this.hurtbox(o))) continue;
      hits.push({ f, o, hb });
    }
    // simultaneous application allows trades (but an ultimate always wins a trade)
    if (hits.length === 2) { const u = hits.findIndex((h) => h.hb.m.ult); if (u >= 0) hits.splice(1 - u, 1); }
    for (const h of hits) {
      const { f, o, hb } = h;
      const m = hb.m;
      f.hitK = hb.k;
      if (m.grab) { this.tryGrab(f, o); continue; }
      if (m.snag) { this.trySnag(f, o); continue; }
      const last = m.hits > 1 && hb.k === m.hits - 1;
      const cx = (max(hb.box[0], this.hurtbox(o)[0]) + min(hb.box[1], this.hurtbox(o)[1])) / 2;
      const cy = (max(hb.box[2], this.hurtbox(o)[2]) + min(hb.box[3], this.hurtbox(o)[3])) / 2;
      const lvMul = m.chargeScale ? (1 + (f.chargeLv || 0) * 1.1) : 1;
      const hit = {
        dmg: Math.round(m.dmg * lvMul), sh: Math.round(m.sh * (m.chargeScale ? (1 + (f.chargeLv || 0) * 1.4) : 1)), hs: m.hs, bs: m.bs, stop: m.stop + (m.chargeScale ? Math.round((f.chargeLv || 0) * 6) : 0),
        kb: last && m.lastKb ? m.lastKb : [m.kb[0] * (m.chargeScale ? 1 + (f.chargeLv || 0) : 1), m.kb[1]], lvl: m.lvl, launch: m.launch || (last && m.lastKb && m.lastKb[1] > 0.1),
        cav: m.cav, sting: m.sting, wallBounce: m.wallBounce && (f.chargeLv || 0) > 0.7, groundBounce: m.groundBounce, ult: m.ult, ultSeq: m.ultSeq, heavy: m.dmg >= 70, fx: m.anim, mvId: f.mv, bounceOff: m.bounceOff,
      };
      if (f.cs.demon) hit.dmg = Math.round(hit.dmg * 1.15);
      if (f.drunk >= 250 && f.char === 'bobby') hit.dmg = Math.round(hit.dmg * 1.1);
      this.applyHit(f, o, hit, f.face, { x: cx, y: cy });
    }
  }

  // central damage routine. src: attacker fighter (may be null for hazards). dir: knockback direction (+1 right)
  applyHit(f, o, hit, dir, at) {
    const s = this.s;
    if (o.st === 'ko' || o.st === 'ucVictim' || o.st === 'ucAtk') return 'none';
    // Jim's mirage counter stance
    if (o.countering && !hit.throwHit && f) {
      o.countering = false;
      this.event('counterStance', { i: o.i, x: o.x, y: o.y + 1 });
      if (f.st === 'attack') { f.hitstop = 14; }
      this.startMove(o, 'counterHit'); o.inv = 12; o.hitstop = 0;
      s.pause = 18;
      return 'countered';
    }
    // Bobby cone hide: blocks strikes from anywhere
    if (o.hiding && !hit.throwHit && !hit.unblockable) {
      if (f) { f.hitstop = 6; f.vx = -dir * 0.06; }
      this.event('block', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, perfect: false, cone: true });
      return 'blocked';
    }
    // POLARIZED EYES: every blockable hit is perfectly parried while active
    if (o.cs.eyesT > 0 && !hit.unblockable && !hit.throwHit && !hit.ult && (NEUTRAL.has(o.st) || o.st === 'blockstun' || o.st === 'crouch')) {
      o.stats.perfects++;
      o.meter = min(PHYS.METER_MAX, o.meter + 6);
      this.setState(o, 'block'); o.st = 'blockstun'; o.blockstun = 3; o.hitstop = 6;
      if (f && f.st === 'attack') { f.hitstop = 8; f.mv = null; this.setState(f, 'stagger'); f.stagger = 18; f.vx = -dir * 0.07; }
      this.event('perfect', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, eyes: true });
      return 'perfect';
    }
    const blocking = (o.st === 'block' || o.st === 'crouchblock' || o.st === 'blockstun') && o.shell > 0 && !hit.unblockable;
    const crouching = o.st === 'crouchblock' || this.held(o, DOWN);
    const canBlock = blocking && !(hit.lvl === 'low' && !crouching) && !(hit.lvl === 'high' && crouching);
    if (canBlock) {
      const perfect = s.frame - o.blockPress <= PHYS.PERFECT_WINDOW && o.st !== 'blockstun';
      if (perfect) {
        o.stats.perfects++;
        o.meter = min(PHYS.METER_MAX, o.meter + 8);
        o.st = 'blockstun'; o.sf = 0; o.blockstun = 3; o.hitstop = 6;
        if (f && f.st === 'attack') { f.hitstop = 8; f.mv = null; this.setState(f, 'stagger'); f.stagger = 18; f.vx = -dir * 0.07; }
        this.event('perfect', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y });
        return 'perfect';
      }
      let shDmg = hit.sh * (o.soft > 0 ? 1.5 : 1);
      if (hit.heavy) shDmg *= 1.15;
      o.shell = max(0, o.shell - Math.round(shDmg));
      o.st = 'blockstun'; o.sf = 0; o.blockstun = hit.bs; o.hitstop = Math.max(3, hit.stop - 2);
      o.vx = dir * hit.kb[0] * 0.7 * CHARS[o.char].weight;
      if (f) { f.hitstop = Math.max(3, hit.stop - 2); f.connected = 1; }
      const chip = Math.round(hit.dmg * 0.08);
      if (hit.heavy && o.hp - chip > 0) o.hp -= chip;
      o.meter = min(PHYS.METER_MAX, o.meter + hit.dmg * 0.03);
      this.event('block', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, shell: o.shell / o.shellMax, heavy: hit.heavy });
      if (o.shell <= 0) {
        o.shell = 0; o.stats.shellBreaks++;
        if (f) f.stats.shellBreaks = (f.stats.shellBreaks || 0);
        this.setState(o, 'dizzy'); o.vx = dir * 0.05; o.hitstop = 14;
        if (f) { f.hitstop = 14; f.meter = min(PHYS.METER_MAX, f.meter + 10); }
        this.event('shellBreak', { i: o.i, x: o.x, y: o.y + 1, by: f ? f.i : -1 });
        s.pause = 10;
      } else if (o.shell / o.shellMax < 0.34) this.event('shellCrack', { i: o.i, x: at.x, y: at.y });
      if (hit.cav && f) this.spawnCav(f, at, hit.cav, true);
      return 'blocked';
    }
    // ---- clean hit
    let dmg = hit.dmg;
    const counter = o.st === 'attack' && this.mv(o) && o.mf < this.mv(o).t[0];
    const punish = o.st === 'attack' && this.mv(o) && o.mf >= this.mv(o).t[0] + this.mv(o).t[1];
    if (counter) dmg = Math.round(dmg * 1.2);
    if (f && f.cs.fireT > 0) dmg = Math.round(dmg * 1.25);
    if (f && f.cs.muerte && !hit.proj) { dmg = Math.round(dmg * 1.6); f.cs.muerte = 0; this.event('muerte', { i: f.i, x: at.x, y: at.y }); }
    if (o.cs.fireT > 0) dmg = Math.round(dmg * 1.1);
    if (o.cs.drT > 0) dmg = Math.round(dmg * 0.7);
    if (o.st === 'molt') dmg = Math.round(dmg * 1.25);
    // armor absorbs hitstun (Brutus)
    const armored = (o.st === 'attack' && o.armor > 0 && this.mv(o)?.armor && o.mf >= this.mv(o).armor[0] && o.mf <= this.mv(o).armor[1] && !hit.throwHit && !hit.ult)
      || (o.cs.armorT > 0 && !hit.throwHit && !hit.ult && o.st !== 'ko');
    // combo scaling
    const inCombo = HURT_STATES.has(o.st) && o.st !== 'blockstun' && o.st !== 'dizzy';
    o.combo = inCombo ? o.combo + 1 : 1;
    const scale = [1, 1, 0.92, 0.84, 0.76, 0.68, 0.62, 0.56, 0.5, 0.46, 0.42, 0.38][min(11, o.combo - 1)] ?? 0.35;
    if (!hit.throwHit && !hit.ult) dmg = Math.round(dmg * scale);
    const preHp = o.hp;
    if (f) {
      f.stats.dmg += min(dmg, o.hp); f.stats.hits++;
      f.meter = min(PHYS.METER_MAX, f.meter + dmg * 0.07 * (f.char === 'jim' && f.drunk >= 250 ? 2 : 1));
      f.connected = 1;
      f.stats.maxCombo = max(f.stats.maxCombo, o.combo);
    }
    o.meter = min(PHYS.METER_MAX, o.meter + dmg * 0.045);
    // drop held item
    if (o.held >= 0) this.dropHeld(o);
    // lethal?
    if (o.hp - dmg <= 0) {
      o.hp = 0;
      this.event('hit', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, dmg, heavy: true, counter, combo: o.combo, kb: dir, lethal: true, fx: hit.fx, mv: hit.mvId });
      if (hit.cav && f) this.spawnCav(f, at, hit.cav, false);
      this.koHit(f, o, false, preHp, dir);
      return 'ko';
    }
    o.hp -= dmg;
    if (armored) {
      if (o.cs.armorT <= 0) o.armor = 0;
      o.hitstop = hit.stop; if (f) f.hitstop = hit.stop;
      this.event('armor', { i: o.i, x: at.x, y: at.y, dmg });
      this.event('hit', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, dmg, heavy: hit.heavy, armor: true, combo: o.combo, kb: dir });
      return 'armor';
    }
    // reaction
    const w = CHARS[o.char].weight * (o.cs.demon ? 1.12 : 1);
    o.mv = null; o.countering = false; o.hiding = false;
    const air = !o.ground || hit.launch || hit.kb[1] > 0.08 || o.st === 'bubbled';
    o.hitstun = hit.hs + (counter ? 6 : 0) + (hit.sting || 0);
    o.hitstop = hit.stop + (counter ? 3 : 0);
    if (f) f.hitstop = hit.stop + (counter ? 3 : 0);
    o.vx = dir * hit.kb[0] * w;
    o.wallBounce = !!hit.wallBounce; o.groundBounce = !!hit.groundBounce;
    if (air) {
      o.vy = max(hit.kb[1] * w, o.ground ? 0.12 : 0.1);
      o.ground = false; o.plat = -1; o.launched = !!hit.launch || o.y > 0.4;
      o.st = 'airhit'; o.sf = 0;
    } else {
      o.st = 'hitstun'; o.sf = 0; o.launched = false;
    }
    if (hit.bounceOff && f) { f.vy = 0.2; f.mv = null; f.st = 'air'; f.sf = 5; }
    this.event('hit', { a: f ? f.i : -1, d: o.i, x: at.x, y: at.y, dmg, heavy: hit.heavy || dmg >= 70, counter, punish, combo: o.combo, kb: dir, fx: hit.fx, mv: hit.mvId, air, sting: !!hit.sting });
    if (hit.cav && f) this.spawnCav(f, at, hit.cav, false);
    if (hit.ult && f && f.st === 'attack' && f.mv === 'ult' && s.phase === 'fight' && !s.ucine && !this.cfg.noUltCine) this.startUltCine(f, o);
    return 'hit';
  }

  koHit(f, o, fromSeq, preHp = 0, dir = 1) {
    const s = this.s;
    const qteOn = this.cfg.qte !== false && !this.cfg.training;
    if (qteOn && !fromSeq && f && preHp > 0 && s.phase === 'fight') {
      this.startQte(f, o, preHp);
      return;
    }
    this.doKO(f, o, dir);
  }

  doKO(f, o, dir) {
    const s = this.s;
    if (this.cfg.training) { o.hp = o.hpMax; this.event('trainingKO', { i: o.i }); return; }
    o.hp = 0;
    o.st = 'ko'; o.sf = 0; o.vx = (dir || (f ? f.face : 1)) * 0.22; o.vy = 0.28; o.ground = false; o.launched = true;
    if (f) { f.stats.kos = (f.stats.kos || 0) + 1; }
    s.winner = f ? f.i : 1 - o.i;
    s.phase = 'ko'; s.pt = 0; s.slow = 70;
    this.event('ko', { a: f ? f.i : -1, d: o.i, x: o.x, y: o.y + 1 });
  }

  // ------------------------------------------------------------------ QTE (cinematic finish)
  startQte(f, o, preHp) {
    const s = this.s;
    const frac = preHp / o.hpMax;
    let str = 0.42 + 1.6 * frac;
    for (let i = 0; i < o.qteEsc; i++) str *= 0.72;
    s.qte = { a: f.i, d: o.i, t: 0, dur: 170, m: 0.5, str: r4(str), pa: rngInt(s.rng, 3), pd: rngInt(s.rng, 3), ta: 50, td: 50, preHp, result: null, presses: [0, 0] };
    s.phase = 'qte';
    f.st = 'qteAtk'; f.sf = 0; f.vx = 0; f.vy = 0; f.mv = null;
    o.st = 'qteDef'; o.sf = 0; o.vx = 0; o.vy = 0; o.mv = null;
    o.hp = 0;
    this.event('qteStart', { a: f.i, d: o.i, str: s.qte.str });
  }

  tickQte() {
    const s = this.s, q = s.qte;
    q.t++;
    const A = s.fighters[q.a], D = s.fighters[q.d];
    A.sf++; D.sf++;
    const btn = [LIGHT, HEAVY, BLOCK];
    if (q.t > 20) {
      for (const [who, isA] of [[A, true], [D, false]]) {
        const pr = who.inCur & ~who.inPrev;
        if (!pr) continue;
        const want = btn[isA ? q.pa : q.pd];
        if (pr & want) {
          q.m += isA ? -0.05 : 0.05 * q.str;
          q.presses[isA ? 0 : 1]++;
          this.event('qtePress', { i: who.i, good: true });
        } else if (pr & (LIGHT | HEAVY | BLOCK)) {
          q.m += isA ? 0.025 : -0.025;
          this.event('qtePress', { i: who.i, good: false });
        }
      }
      q.m -= 0.0016;
      if (--q.ta <= 0) { q.pa = (q.pa + 1 + rngInt(s.rng, 2)) % 3; q.ta = 38 + rngInt(s.rng, 26); this.event('qtePrompt', { i: A.i }); }
      if (--q.td <= 0) { q.pd = (q.pd + 1 + rngInt(s.rng, 2)) % 3; q.td = 38 + rngInt(s.rng, 26); this.event('qtePrompt', { i: D.i }); }
    }
    q.m = clamp(q.m, -0.01, 1.01);
    let res = null;
    if (q.m <= 0) res = 'finish'; else if (q.m >= 1) res = 'escape';
    else if (q.t >= q.dur) res = q.m < 0.5 ? 'finish' : 'escape';
    if (!res) return;
    q.result = res;
    if (res === 'finish') {
      s.phase = 'finish'; s.pt = 0;
      A.st = 'finisher'; A.sf = 0; D.st = 'finished'; D.sf = 0;
      this.event('qteEnd', { result: 'finish', a: A.i, d: D.i, char: A.char, demon: A.cs.demon });
    } else {
      D.qteEsc++; D.stats.qteEsc++;
      D.hp = max(1, Math.round(D.hpMax * 0.06));
      s.phase = 'fight';
      this.setState(D, 'air'); D.vy = 0.18; D.ground = false; D.inv = 40; D.combo = 0;
      A.st = 'airhit'; A.sf = 0; A.hitstun = 40; A.launched = true; A.vx = -A.face * 0.26; A.vy = 0.2; A.ground = false;
      s.qte = null;
      this.event('qteEnd', { result: 'escape', a: A.i, d: D.i, x: D.x, y: D.y + 1 });
    }
  }

  tickFinish() {
    const s = this.s, q = s.qte;
    s.pt++;
    const A = s.fighters[q.a], D = s.fighters[q.d];
    A.sf++; D.sf++;
    if (s.pt === 1) { A.x = D.x - A.face * 1.0; }
    if (s.pt === 120) {
      this.event('finisherHit', { a: A.i, d: D.i, x: D.x, y: D.y + 1, char: A.char });
    }
    if (s.pt >= 150) {
      s.qte = null;
      s.phase = 'fight';
      this.doKO(A, D, A.face);
    }
  }

  // ------------------------------------------------------------------ cinematics (demon transform)
  checkDemon() {
    const s = this.s;
    for (const f of s.fighters) {
      if (f.char !== 'bobby' || f.cs.demon || f.cs.demonDone || this.cfg.noDemon) continue;
      if (f.hp > f.hpMax * 0.5 || f.hp <= 0 || f.hitstop > 0) continue;
      if (f.st === 'thrown' || f.st === 'ultVictim' || f.st === 'snagged' || s.phase !== 'fight') continue;
      if (f.st === 'airhit' && !f.ground) continue;
      f.cs.demonDone = true;
      s.cine = { type: 'demon', i: f.i, t: 0, dur: 170 };
      s.phase = 'cine';
      f.st = 'demonize'; f.sf = 0; f.vx = 0; f.vy = 0; f.mv = null; f.combo = 0;
      const o = s.fighters[1 - f.i];
      if (o.st === 'attack') { o.mv = null; this.setState(o, o.ground ? 'idle' : 'air'); }
      // the opponent recoils in fear, giving the transformation some room
      const away = o.x >= f.x ? 1 : -1;
      const hw = CHARS[o.char].w / 2;
      o.x = r4(clamp(o.x + away * 1.4, this.stage.left + hw, this.stage.right - hw));
      o.vx = 0;
      this.event('demonStart', { i: f.i, x: f.x, y: f.y });
    }
  }
  tickCine() {
    const s = this.s, c = s.cine;
    if (!c) return;
    c.t++;
    const f = s.fighters[c.i];
    f.sf++;
    if (c.type === 'demon') {
      s.dark = min(1, c.t / 30);
      if (c.t === 80) {
        f.cs.demon = true; f.stats.demon++;
        const D = CHARS.bobby.demon;
        f.shellMax = D.shell; f.shell = max(f.shell, D.shell); f.shell = min(f.shell, f.shellMax);
        f.meter = min(PHYS.METER_MAX, f.meter + 30);
        this.event('demonReveal', { i: f.i, x: f.x, y: f.y });
      }
      if (c.t >= c.dur) {
        s.cine = null; s.phase = 'fight';
        this.setState(f, 'idle'); f.inv = 20;
        const o = s.fighters[1 - f.i];
        o.vx = (o.x > f.x ? 1 : -1) * 0.2; if (o.ground && NEUTRAL.has(o.st)) { this.setState(o, 'hitstun'); o.hitstun = 16; }
        this.event('demonBurst', { i: f.i, x: f.x, y: f.y + 0.6 });
      }
    }
  }

  checkKO() { /* KO is handled inside applyHit */ }

  // ------------------------------------------------------------------ grabs
  tryGrab(f, o) {
    const s = this.s;
    if (!o.ground || o.inv > 0 || o.st === 'airhit' || o.st === 'hitstun' || o.st === 'knockdown' || o.st === 'getup' || o.st === 'blockstun' || o.st === 'ko') return;
    // simultaneous throws -> tech
    if (o.st === 'attack' && o.mv === 'throw' && o.mf <= this.mv(o).t[0] + this.mv(o).t[1]) {
      this.event('tech', { x: (f.x + o.x) / 2, y: 1 });
      f.vx = -f.face * 0.12; o.vx = -o.face * 0.12;
      this.setState(f, 'stagger'); f.stagger = 14; f.mv = null;
      this.setState(o, 'stagger'); o.stagger = 14; o.mv = null;
      return;
    }
    if (o.held >= 0) this.dropHeld(o);
    f.mv = null; this.setState(f, 'throwing');
    o.mv = null; this.setState(o, 'thrown'); o.combo = 0; o.hiding = false; o.countering = false;
    this.event('grab', { a: f.i, d: o.i, x: o.x, y: o.y + 1, char: f.char });
  }
  trySnag(f, o) {
    if (o.inv > 0 || o.st === 'ko') return;
    if (o.held >= 0) this.dropHeld(o);
    o.mv = null; this.setState(o, 'thrown'); o.combo = 0;
    f.mv = null; this.setState(f, 'throwing'); f.sf = 6;
    this.event('snag', { a: f.i, d: o.i, x: o.x, y: o.y + 1 });
  }

  // ------------------------------------------------------------------ projectiles
  spawnProj(f, type, o = {}) {
    const s = this.s;
    const P = (props) => { const p = { id: s.nextId++, type, owner: f.i, x: f.x + f.face * 0.8, y: f.y + 1.1, vx: 0, vy: 0, life: 120, w: 0.5, h: 0.5, dmg: 50, sh: 15, hs: 18, bs: 12, stop: 7, kb: [0.1, 0.05], hitCd: 0, bounces: 0, state: 'fly', data: 0, face: f.face, ...props }; s.proj.push(p); this.event('projSpawn', { id: p.id, type, i: f.i, x: p.x, y: p.y, data: p.data }); return p; };
    if (type === 'cannon') {
      if (s.proj.some((p) => p.type === 'cannon' && p.owner === f.i)) { this.event('fizzle', { i: f.i }); return; }
      return P({ vx: f.face * 0.15, y: f.y + 1.15, life: 100, w: 0.6, h: 0.6, dmg: 60, sh: 20, hs: 20, bs: 13, stop: 8, kb: [0.1, 0.08], cav: true });
    }
    if (type === 'junk') {
      const r = rngFloat(s.rng);
      const kind = r < 0.06 ? 4 : r < 0.3 ? 0 : r < 0.52 ? 1 : r < 0.76 ? 2 : 3; // boot, fish, can, duck, anchor
      const defs = [
        { vx: 0.14, vy: 0.16, g: 0.009, dmg: 50, life: 140 },
        { vx: 0.24, vy: 0.02, g: 0.002, dmg: 40, life: 90, trip: true },
        { vx: 0.12, vy: 0.13, g: 0.008, dmg: 35, life: 200, bounce: 3 },
        { vx: 0.06, vy: 0.02, g: -0.0004, dmg: 30, life: 220 },
        { vx: 0.09, vy: 0.17, g: 0.012, dmg: 130, life: 140, heavy: true },
      ][kind];
      return P({ vx: f.face * defs.vx, vy: defs.vy, g: defs.g, dmg: defs.dmg, life: defs.life, data: kind, maxBounce: defs.bounce || 0, trip: defs.trip, w: kind === 4 ? 0.7 : 0.45, h: 0.45, kb: kind === 4 ? [0.12, 0.25] : [0.08, 0.06], heavy: defs.heavy });
    }
    if (type === 'puru') {
      if (f.cs.puru !== 'held') return;
      const power = o.power ? 1 + (f.chargeLv || 0) * 0.6 : 1;
      const p = P({ vx: f.face * 0.19 * power, vy: 0.07, g: 0.006, life: 170, w: 0.6, h: 0.6, dmg: Math.round(55 * power), sh: 14, hs: 20, bs: 12, kb: [0.1, 0.1], maxBounce: 5, sting: 12, y: f.y + 1.2 });
      f.cs.puru = 'thrown'; f.cs.puruId = p.id;
      return p;
    }
    if (type === 'bubble') return P({ vx: f.face * 0.045, vy: 0, g: 0, life: 210, w: 0.9, h: 0.9, dmg: 0, trap: true, y: f.y + 1.0 });
    if (type === 'hiccup') return P({ vx: f.face * 0.09, vy: 0.01, g: 0, life: 60, w: 0.35, h: 0.35, dmg: 14, sh: 5, hs: 10, bs: 6, kb: [0.04, 0.02], y: f.y + 1.3 });
    if (type === 'burp') return P({ x: f.x + f.face * 0.6, vx: f.face * 0.02, life: 18, w: 1.6, h: 1.4, dmg: 30, sh: 10, hs: 14, bs: 8, kb: [0.12, 0.06], y: f.y + 0.5, burp: true });
    if (type === 'quake') {
      const dmg = o.dmg || 80;
      P({ x: f.x + 0.5, vx: 0.18, y: 0.01, life: o.big ? 40 : 24, w: 0.9, h: 0.5, dmg, sh: 30, hs: 26, bs: 14, kb: [0.08, 0.22], quake: true, lvl: 'low', launch: true });
      P({ x: f.x - 0.5, vx: -0.18, y: 0.01, life: o.big ? 40 : 24, w: 0.9, h: 0.5, dmg, sh: 30, hs: 26, bs: 14, kb: [0.08, 0.22], quake: true, lvl: 'low', launch: true });
      return;
    }
  }

  spawnCav(f, at, cav, blocked) {
    const s = this.s;
    const p = { id: s.nextId++, type: 'cav', owner: f.i, x: at.x, y: at.y, vx: 0, vy: 0, life: cav.delay + 2, delay: cav.delay, w: cav.r * 2, h: cav.r * 2, dmg: cav.dmg, sh: Math.round(cav.dmg * 0.6), hs: 8, bs: 6, stop: 3, kb: [0.03, 0.02], hitCd: 0, bounces: 0, state: 'fly', data: cav.dark ? 1 : 0, face: f.face, blocked };
    s.proj.push(p);
    this.event('cavSpawn', { id: p.id, i: f.i, x: at.x, y: at.y, r: cav.r, dark: !!cav.dark, delay: cav.delay });
  }

  tickProj() {
    const s = this.s, st = this.stage;
    for (let k = s.proj.length - 1; k >= 0; k--) {
      const p = s.proj[k];
      p.life--;
      const owner = s.fighters[p.owner];
      if (p.type === 'cav') {
        p.delay--;
        if (p.delay === 0) {
          this.event('cavPop', { id: p.id, x: p.x, y: p.y, r: p.w / 2, dark: p.data === 1, i: p.owner });
          owner.stats.cav = (owner.stats.cav || 0) + 1;
          const o = s.fighters[1 - p.owner];
          const hb = [p.x - p.w / 2, p.x + p.w / 2, p.y - p.h / 2, p.y + p.h / 2];
          if (o.inv <= 0 && o.st !== 'ko' && this.overlap(hb, this.hurtbox(o))) {
            this.applyHit(owner, o, { dmg: p.dmg, sh: p.sh, hs: p.hs + (HURT_STATES.has(o.st) ? 6 : 0), bs: p.bs, stop: p.stop, kb: p.kb, lvl: 'mid', fx: 'cav' }, o.x >= p.x ? 1 : -1, { x: p.x, y: p.y });
          }
          for (const q of s.props) this.propInRadius(q, p.x, p.y, p.w / 2 + 0.3, p.owner, 1);
        }
        if (p.life <= 0) s.proj.splice(k, 1);
        continue;
      }
      if (p.type === 'puru') { this.tickPuru(p, owner, k); continue; }
      if (p.skill) { this.tickSkillProj(p, owner, k); continue; }
      // motion
      p.vy -= p.g || 0;
      if (p.trap) p.vy = ((s.frame % 60) < 30 ? 0.004 : -0.004);
      p.x += p.vx; p.y += p.vy;
      if (p.quake) { p.y = 0.01; }
      // bounce / walls
      if (p.y < p.h / 2 && !p.quake) {
        if (p.bounces < (p.maxBounce || 0)) { p.y = p.h / 2; p.vy = abs(p.vy) * 0.7; p.bounces++; this.event('projBounce', { id: p.id, x: p.x, y: p.y }); }
        else { this.killProj(k, true); continue; }
      }
      if (p.x < st.left || p.x > st.right) {
        if (p.bounces < (p.maxBounce || 0)) { p.vx = -p.vx; p.bounces++; p.x = clamp(p.x, st.left, st.right); }
        else { this.killProj(k, true); continue; }
      }
      if (p.life <= 0) { this.killProj(k, p.type === 'cannon'); continue; }
      if (p.hitCd > 0) { p.hitCd--; continue; }
      // vs fighters
      const o = s.fighters[1 - p.owner];
      const box = [p.x - p.w / 2, p.x + p.w / 2, p.y - p.h / 2, p.y + p.h / 2];
      if (o.inv <= 0 && o.st !== 'ko' && o.st !== 'thrown' && o.st !== 'ultVictim' && o.st !== 'ucVictim' && this.overlap(box, this.hurtbox(o))) {
        if (p.trap) {
          if (o.st !== 'bubbled') { o.mv = null; o.st = 'bubbled'; o.sf = 0; o.ground = false; o.plat = -1; o.vx = 0; o.vy = 0.01; o.combo = 0; this.event('trapped', { i: o.i, x: o.x, y: o.y }); }
          this.killProj(k, false); continue;
        }
        const res = this.applyHit(owner, o, { dmg: p.dmg, sh: p.sh, hs: p.hs, bs: p.bs, stop: p.stop, kb: p.kb, lvl: p.lvl || 'mid', launch: p.launch || p.trip || p.heavy, sting: p.sting, heavy: p.dmg >= 70, fx: p.type, proj: true }, p.vx >= 0 ? 1 : -1, { x: p.x, y: p.y });
        if (p.trip && res === 'hit') { o.st = 'airhit'; o.launched = true; o.vy = 0.12; }
        if (p.type === 'cannon') this.event('cavPop', { id: p.id, x: p.x, y: p.y, r: 0.8, i: p.owner, big: true });
        if (p.quake) { p.hitCd = 60; continue; }
        this.killProj(k, false);
        continue;
      }
      // vs opponent projectiles (clash)
      for (let j = 0; j < s.proj.length; j++) {
        const q = s.proj[j];
        if (q.skill && q.type !== 'coralWall' && q.type !== 'sonic') continue;
        if (q.type === 'coralWall' && q.owner !== p.owner && abs(q.x - p.x) < (q.w + p.w) / 2 && p.y < q.y + q.h && p.y > q.y - 0.2) { p.life = 0; q.hp--; this.event('coralHit', { id: q.id, x: q.x, y: p.y }); continue; }
        if (q.type === 'sonic' && q.owner !== p.owner && abs(q.x - p.x) < (q.w + p.w) / 2 && abs(q.y - p.y) < (q.h + p.h) / 2 && p.type !== 'quake') { p.owner = q.owner; p.vx = -p.vx * 1.2; p.face = -p.face; this.event('reflect', { x: p.x, y: p.y }); continue; }
        if (q.type === 'coralWall' || q.type === 'sonic') continue;
        if (q === p || q.owner === p.owner || q.type === 'cav' || q.quake || p.quake) continue;
        if (abs(q.x - p.x) < (q.w + p.w) / 2 && abs(q.y - p.y) < (q.h + p.h) / 2) {
          this.event('clash', { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
          if (q.type !== 'puru') q.life = 0; if (p.type !== 'puru') p.life = 0;
        }
      }
      // vs props
      for (const q of s.props) {
        if (p.type === 'bubble' || p.type === 'hiccup') break;
        if (this.propHitbox(q) && this.overlap(box, this.propHitbox(q))) {
          if (this.damageProp(q, p.heavy ? 2 : 1, p.owner, p.vx >= 0 ? 1 : -1, p.kb)) { if (!p.quake) { this.killProj(k, true); break; } }
        }
      }
    }
  }
  killProj(k, poof) {
    const p = this.s.proj[k];
    if (!p) return;
    this.s.proj.splice(k, 1);
    if (p.type === 'cannon' && poof) this.event('cavPop', { id: p.id, x: p.x, y: p.y, r: 0.6, i: p.owner, big: true, miss: true });
    this.event('projEnd', { id: p.id, type: p.type, x: p.x, y: p.y, poof, data: p.data });
  }

  tickPuru(p, owner, k) {
    const s = this.s, st = this.stage;
    if (p.state === 'fly') {
      p.vy -= p.g; p.x += p.vx; p.y += p.vy;
      if (p.y < 0.3) { p.y = 0.3; p.vy = abs(p.vy) * 0.85 + 0.03; p.bounces++; this.event('puruBounce', { x: p.x, y: p.y }); }
      for (const pl of s.plats) { if (!pl.broken && p.vy < 0 && p.x > pl.x0 && p.x < pl.x1 && p.y - p.vy >= pl.y + 0.3 && p.y <= pl.y + 0.3) { p.y = pl.y + 0.3; p.vy = abs(p.vy) * 0.85 + 0.03; p.bounces++; this.event('puruBounce', { x: p.x, y: p.y }); } }
      if (p.x < st.left + 0.3 || p.x > st.right - 0.3) { p.vx = -p.vx; p.x = clamp(p.x, st.left + 0.3, st.right - 0.3); p.bounces++; this.event('puruBounce', { x: p.x, y: p.y }); }
      if (p.y > 7) p.vy = -abs(p.vy);
      if (p.life <= 0 || p.bounces > (p.maxBounce || 5)) { p.state = 'return'; p.life = 150; }
    } else {
      // home back to Mimi
      const tx = owner.x - owner.face * 0.5, ty = owner.y + 1.5;
      const dx = tx - p.x, dy = ty - p.y, d = sqrt(dx * dx + dy * dy) || 1;
      const sp = 0.2;
      p.vx = r4(dx / d * sp); p.vy = r4(dy / d * sp);
      p.x += p.vx; p.y += p.vy;
      if (d < 0.4 || p.life <= 0) {
        owner.cs.puru = 'held'; owner.cs.puruId = -1;
        s.proj.splice(k, 1);
        this.event('puruBack', { i: owner.i });
        return;
      }
    }
    p.x = r4(p.x); p.y = r4(p.y); p.vx = r4(p.vx); p.vy = r4(p.vy);
    if (p.hitCd > 0) { p.hitCd--; return; }
    const o = s.fighters[1 - p.owner];
    const box = [p.x - p.w / 2, p.x + p.w / 2, p.y - p.h / 2, p.y + p.h / 2];
    if (o.inv <= 0 && o.st !== 'ko' && o.st !== 'thrown' && this.overlap(box, this.hurtbox(o))) {
      this.applyHit(owner, o, { dmg: p.dmg, sh: p.sh, hs: p.hs, bs: p.bs, stop: p.stop, kb: p.kb, lvl: 'mid', sting: p.sting, fx: 'puru', proj: true }, p.vx >= 0 ? 1 : -1, { x: p.x, y: p.y });
      this.event('puruZap', { x: p.x, y: p.y });
      p.hitCd = 25; p.vx = -p.vx * 0.6; p.vy = 0.12;
    }
    for (const q of s.props) { const hb = this.propHitbox(q); if (hb && this.overlap(box, hb) && q.hitCd <= 0) { this.damageProp(q, 1, p.owner, p.vx >= 0 ? 1 : -1, [0.08, 0.06]); q.hitCd = 20; } }
  }

  // ------------------------------------------------------------------ props
  propById(id) { return this.s.props.find((p) => p.id === id); }
  propHitbox(p) {
    if (p.state === 'broken' || p.state === 'gone' || p.state === 'held') return null;
    if (p.type === 'vent') return [p.x - 0.5, p.x + 0.5, 0.3, 1.6];
    if (p.type === 'snail') return null;
    if (p.type === 'chandelier' || p.type === 'pinata') return [p.x - p.w / 2, p.x + p.w / 2, p.y - p.h / 2, p.y + p.h / 2];
    return [p.x - p.w / 2, p.x + p.w / 2, p.y, p.y + p.h];
  }
  hitProps(f, hb) {
    for (const p of this.s.props) {
      const box = this.propHitbox(p);
      if (!box || p.hitCd > 0 || !this.overlap(hb.box, box)) continue;
      const m = hb.m;
      this.damageProp(p, m.dmg >= 70 ? 2 : 1, f.i, f.face, m.kb, m.dmg);
      p.hitCd = 12;
    }
  }
  propInRadius(p, x, y, r, by, dmg) {
    const box = this.propHitbox(p);
    if (!box) return;
    const cx = (box[0] + box[1]) / 2, cy = (box[2] + box[3]) / 2;
    if (abs(cx - x) < r + (box[1] - box[0]) / 2 && abs(cy - y) < r + (box[3] - box[2]) / 2) this.damageProp(p, dmg, by, cx >= x ? 1 : -1, [0.1, 0.1]);
  }
  // returns true if the prop "absorbed" the hit
  damageProp(p, amt, by, dir = 1, kb = [0.1, 0.05], rawDmg = 50) {
    const s = this.s;
    switch (p.type) {
      case 'barrel':
        p.vx += dir * (0.08 + abs(kb[0]) * 1.6); p.vy = max(p.vy, kb[1] * 1.2 + (amt > 1 ? 0.06 : 0.02)); p.by = by; p.hitCd = 10;
        this.event('propHit', { id: p.id, type: p.type, x: p.x, y: p.y + 0.5 });
        return true;
      case 'crate':
        p.hp -= amt;
        this.event('propHit', { id: p.id, type: p.type, x: p.x, y: p.y + 0.5 });
        if (p.hp <= 0) {
          p.state = 'broken';
          this.event('propBreak', { id: p.id, type: p.type, x: p.x, y: p.y + 0.5 });
          if (rngChance(s.rng, 0.55)) for (let i = 0; i < 1 + rngInt(s.rng, 2); i++) this.addProp('snail', p.x, p.y + 0.5, { vx: (rngFloat(s.rng) - 0.5) * 0.12, vy: 0.12 + rngFloat(s.rng) * 0.08 }).state = 'fly';
        }
        return true;
      case 'vent':
        p.active = 240;
        this.event('ventBurst', { id: p.id, x: p.x });
        return true;
      case 'mug': case 'bottle': case 'stool':
        if (p.state === 'rest') { p.state = 'fly'; p.vx = dir * 0.12; p.vy = 0.12; p.owner = by; this.event('propHit', { id: p.id, type: p.type, x: p.x, y: p.y }); }
        return false;
      case 'chandelier':
        if (p.state !== 'rest') return false;
        p.hp -= amt;
        this.event('propHit', { id: p.id, type: p.type, x: p.x, y: p.y });
        if (p.hp <= 0) { p.state = 'fall'; p.vy = 0; p.owner = by; this.event('chandelierFall', { id: p.id, x: p.x, y: p.y }); }
        return true;
      case 'pinata':
        if (p.state !== 'rest') return false;
        p.hp -= amt; p.ang = dir;
        this.event('propHit', { id: p.id, type: p.type, x: p.x, y: p.y, dir });
        if (p.hp <= 0) {
          p.state = 'broken';
          this.event('propBreak', { id: p.id, type: p.type, x: p.x, y: p.y });
          const n = 4 + rngInt(s.rng, 3);
          for (let i = 0; i < n; i++) this.addProp('snail', p.x, p.y, { vx: (rngFloat(s.rng) - 0.5) * 0.2, vy: 0.05 + rngFloat(s.rng) * 0.12 }).state = 'fly';
        }
        return true;
      case 'jukebox':
        if (p.hitCd > 0) return true;
        s.jukebox = (s.jukebox + 1) % 2;
        p.hitCd = 40;
        this.event('jukebox', { track: s.jukebox, x: p.x, y: p.y + 1 });
        return true;
      default: return false;
    }
  }

  tickProps(frozen) {
    const s = this.s, st = this.stage;
    for (let k = s.props.length - 1; k >= 0; k--) {
      const p = s.props[k];
      if (p.hitCd > 0) p.hitCd--;
      if (p.active > 0) p.active--;
      if (frozen) continue;
      if (p.type === 'barrel') {
        p.vy -= PHYS.GRAV; p.x += p.vx; p.y += p.vy;
        if (p.y <= 0) { if (p.vy < -0.08) this.event('propLand', { id: p.id, type: p.type, x: p.x }); p.y = 0; p.vy = 0; p.vx *= 0.993; }
        for (const c of s.props) { if (c.type === 'crate' && c.state !== 'broken' && abs(c.x - p.x) < (c.w + p.w) / 2 && p.y < c.y + c.h && p.y + p.h > c.y) { p.vx = -p.vx * 0.5; p.x += p.vx * 2; if (abs(p.vx) > 0.05) this.damageProp(c, 1, p.by, 1); } }
        if (p.x < st.left + p.w / 2) { p.x = st.left + p.w / 2; p.vx = abs(p.vx) * 0.6; if (abs(p.vx) > 0.03) this.event('propHit', { id: p.id, type: 'barrelWall', x: p.x, y: 0.5 }); }
        if (p.x > st.right - p.w / 2) { p.x = st.right - p.w / 2; p.vx = -abs(p.vx) * 0.6; if (abs(p.vx) > 0.03) this.event('propHit', { id: p.id, type: 'barrelWall', x: p.x, y: 0.5 }); }
        if (abs(p.vx) < 0.002) p.vx = 0;
        // rolling barrels hurt
        if (abs(p.vx) > 0.11 && p.hitCd <= 0) {
          for (const f of s.fighters) {
            if (f.inv > 0 || f.st === 'ko' || f.y > p.y + p.h) continue;
            if (abs(f.x - p.x) < CHARS[f.char].hurtW + p.w / 2) {
              const owner = p.by >= 0 ? s.fighters[p.by] : null;
              if (owner && owner.i === f.i && p.hitCd > -30) continue;
              this.applyHit(owner && owner.i !== f.i ? owner : null, f, { dmg: 55, sh: 20, hs: 22, bs: 12, stop: 8, kb: [0.12, 0.16], lvl: 'low', launch: true, heavy: true, fx: 'barrel' }, p.vx > 0 ? 1 : -1, { x: f.x, y: f.y + 0.4 });
              p.vx = -p.vx * 0.35; p.hitCd = 20;
            }
          }
        }
        p.x = r4(p.x); p.y = r4(p.y); p.vx = r4(p.vx); p.vy = r4(p.vy);
      } else if ((p.type === 'mug' || p.type === 'bottle' || p.type === 'stool') && (p.state === 'fly' || p.state === 'thrown')) {
        p.vy -= PHYS.GRAV * 0.9; p.x += p.vx; p.y += p.vy;
        let landed = false;
        if (p.y <= 0) { p.y = 0; landed = true; }
        for (const pl of s.plats) if (!pl.broken && p.vy < 0 && p.x > pl.x0 && p.x < pl.x1 && p.y - p.vy >= pl.y && p.y <= pl.y) { p.y = pl.y; landed = true; }
        if (p.x < st.left || p.x > st.right) { p.vx = -p.vx * 0.5; p.x = clamp(p.x, st.left, st.right); if (p.state === 'thrown') { this.breakItem(p, k); continue; } }
        if (p.state === 'thrown') {
          const o = s.fighters[1 - p.owner];
          if (o.inv <= 0 && o.st !== 'ko' && this.overlap([p.x - 0.25, p.x + 0.25, p.y, p.y + 0.4], this.hurtbox(o))) {
            const dmg = p.type === 'stool' ? 60 : p.type === 'bottle' ? 50 : 35;
            this.applyHit(s.fighters[p.owner], o, { dmg, sh: 14, hs: 18, bs: 10, stop: 7, kb: [0.1, 0.08], lvl: 'mid', heavy: dmg >= 60, fx: 'item' }, p.vx >= 0 ? 1 : -1, { x: p.x, y: p.y + 0.2 });
            this.breakItem(p, k); continue;
          }
          if (landed) { this.breakItem(p, k); continue; }
        } else if (landed) { p.state = 'rest'; p.vx = 0; p.vy = 0; this.event('propLand', { id: p.id, type: p.type, x: p.x }); }
        p.x = r4(p.x); p.y = r4(p.y); p.vx = r4(p.vx); p.vy = r4(p.vy);
      } else if (p.state === 'slide') {
        p.x = r4(p.x + p.vx); p.vx = r4(p.vx * 0.985);
        if (abs(p.vx) < 0.004 || p.x < 6.8) { p.state = 'rest'; p.vx = 0; }
      } else if ((p.type === 'mug' || p.type === 'bottle' || p.type === 'stool') && p.state === 'held') {
        const f = s.fighters[p.owner];
        if (!f || f.held !== p.id) { p.state = 'fly'; p.vy = 0.05; continue; }
        p.x = f.x + f.face * 0.35; p.y = f.y + 1.0;
      } else if ((p.type === 'mug' || p.type === 'bottle' || p.type === 'stool') && p.state === 'rest') {
        // fall if the table under it broke
        if (p.y > 0) { const on = s.plats.some((pl) => !pl.broken && p.x > pl.x0 && p.x < pl.x1 && abs(pl.y - p.y) < 0.01); if (!on) { p.state = 'fly'; p.vy = 0; } }
      } else if (p.type === 'chandelier' && p.state === 'fall') {
        p.vy -= PHYS.GRAV * 1.4; p.y += p.vy;
        for (const f of s.fighters) {
          if (f.inv <= 0 && f.st !== 'ko' && abs(f.x - p.x) < p.w / 2 + CHARS[f.char].hurtW && f.y + CHARS[f.char].h > p.y - 0.4 && f.y < p.y) {
            const owner = p.owner >= 0 && p.owner !== f.i ? s.fighters[p.owner] : null;
            this.applyHit(owner, f, { dmg: 120, sh: 40, hs: 30, bs: 16, stop: 12, kb: [0.05, 0.2], lvl: 'high', launch: true, heavy: true, unblockable: false, fx: 'chandelier' }, f.x >= p.x ? 1 : -1, { x: f.x, y: f.y + 1.2 });
            p.owner = -9;
          }
        }
        if (p.y <= 0.3) { p.y = 0.3; p.state = 'broken'; this.event('propBreak', { id: p.id, type: p.type, x: p.x, y: p.y }); }
      } else if (p.type === 'snail') {
        if (p.state === 'fly') {
          p.vy -= PHYS.GRAV * 0.8; p.x += p.vx; p.y += p.vy;
          if (p.y <= 0) { p.y = 0; p.vy = abs(p.vy) > 0.05 ? abs(p.vy) * 0.45 : 0; p.vx *= 0.7; if (p.vy === 0) p.state = 'rest'; }
          for (const pl of s.plats) if (!pl.broken && p.vy < 0 && p.x > pl.x0 && p.x < pl.x1 && p.y - p.vy >= pl.y && p.y <= pl.y) { p.y = pl.y; p.vy = 0; p.state = 'rest'; }
          p.x = r4(clamp(p.x, st.left + 0.3, st.right - 0.3)); p.y = r4(p.y); p.vx = r4(p.vx); p.vy = r4(p.vy);
        }
        p.t++;
        if (p.t > 20) {
          for (const f of s.fighters) {
            if (f.st === 'ko') continue;
            if (abs(f.x - p.x) < 0.5 && p.y >= f.y - 0.2 && p.y <= f.y + CHARS[f.char].h) {
              f.stats.snails++; f.hp = min(f.hpMax, f.hp + 10);
              this.event('snailPickup', { i: f.i, x: p.x, y: p.y });
              s.props.splice(k, 1); break;
            }
          }
        }
        if (p.t > 900 && s.props[k] === p) { s.props.splice(k, 1); this.event('snailGone', { x: p.x, y: p.y }); }
      }
    }
    // tables break under heavy knockback
    for (const pl of s.plats) {
      if (pl.kind !== 'table' || pl.broken) continue;
      for (const f of s.fighters) {
        if ((f.st === 'airhit' || f.st === 'ko') && f.vy < -0.2 && f.x > pl.x0 && f.x < pl.x1 && abs(f.y - pl.y) < 0.4) {
          pl.broken = true; this.event('tableBreak', { id: pl.id, x: (pl.x0 + pl.x1) / 2, y: pl.y });
        }
      }
    }
  }
  breakItem(p, k) {
    this.event('itemBreak', { id: p.id, type: p.type, x: p.x, y: p.y });
    this.s.props.splice(k, 1);
  }
  dropHeld(f) {
    const p = this.propById(f.held);
    f.held = -1;
    if (!p) return;
    p.state = 'fly'; p.vx = f.face * 0.03; p.vy = 0.06; p.owner = f.i;
  }
  throwHeld(f, hard) {
    const p = this.propById(f.held);
    f.held = -1;
    if (!p) return;
    p.state = 'thrown'; p.owner = f.i; p.x = f.x + f.face * 0.5; p.y = f.y + 1.1;
    p.vx = f.face * (hard ? 0.26 : 0.2); p.vy = hard ? 0.08 : 0.05;
    this.event('throwItem', { i: f.i, type: p.type });
  }
  finishDrink(f) {
    const p = this.propById(f.held);
    f.held = -1;
    if (!p) return;
    const k = this.s.props.indexOf(p);
    if (k >= 0) this.s.props.splice(k, 1);
    const heal = p.type === 'bottle' ? 85 : 60;
    const mult = f.char === 'brutus' ? 1.5 : 1;
    const amt = Math.round(heal * mult);
    f.hp = min(f.hpMax, f.hp + amt);
    f.drunk = min(600, f.drunk + (p.type === 'bottle' ? 150 : 100));
    f.stats.drinks++;
    this.event('drink', { i: f.i, amt, drunk: f.drunk, type: p.type });
    if (f.drunk >= 250) this.event('voice', { i: f.i, line: 'tipsy' });
  }
  tickBartender() {
    const s = this.s, B = this.stage.bartender;
    s.bartT++;
    if (s.bartT < B.every) return;
    s.bartT = 0;
    const onCounter = s.props.filter((p) => (p.type === 'mug' || p.type === 'bottle') && p.state === 'rest' && p.y > 1.0).length;
    if (onCounter >= 4) return;
    const p = this.addProp(rngChance(s.rng, 0.5) ? 'mug' : 'bottle', 11.6, B.spawnY);
    p.state = 'slide'; p.vx = r4(-0.07 - rngFloat(s.rng) * 0.04);
    this.event('bartenderSlide', { id: p.id });
  }

  // ------------------------------------------------------------------ skills
  trySkill(f, air) {
    const s = this.s;
    for (let j = 0; j < 3; j++) {
      if (s.frame - f.buf['S' + j] > PHYS.BUFFER) continue;
      const k = f.sk[j];
      this.use(f, 'S' + j);
      if (!k) { this.event('skillEmpty', { i: f.i, slot: j }); return false; }
      const S = SKILLS[k.id];
      if (k.cd > 0) { this.event('skillCd', { i: f.i, slot: j }); return false; }
      if (air && !S.air) { this.event('skillCd', { i: f.i, slot: j, air: true }); return false; }
      if (f.held >= 0) this.dropHeld(f);
      k.cd = S.cd;
      f.st = 'skill'; f.sf = 0; f.skill = k.id; f.mv = null; f.skAir = !f.ground; f.cs.skHit = 0;
      f.stats.skills++;
      this.event('skill', { i: f.i, id: k.id, slot: j, x: f.x, y: f.y, name: S.name });
      return true;
    }
    return false;
  }

  tickSkill(f) {
    const s = this.s, o = s.fighters[1 - f.i], sf = f.sf, id = f.skill, S = SKILLS[id];
    if (!S) { this.toNeutral(f); return; }
    if (!f.skAir) f.vx *= 0.75;
    const front = (d) => clamp(f.x + f.face * d, this.stage.left + 0.4, this.stage.right - 0.4);
    switch (id) {
      case 'mine':
        if (sf === 10) {
          for (let k = s.proj.length - 1; k >= 0; k--) if (s.proj[k].type === 'mine' && s.proj[k].owner === f.i) this.killProj(k, true);
          this.spawnSkillProj(f, 'mine', { x: front(0.55), y: f.y + 0.2, w: 0.8, h: 0.7, life: 420, arm: 20 });
        }
        break;
      case 'riptide':
        if (sf === 3) { f.inv = 20; this.event('riptide', { i: f.i, x: f.x, y: f.y }); }
        if (sf >= 3 && sf < 18) {
          f.vx = f.face * 0.4; if (f.skAir) f.vy = 0;
          if (!f.cs.skHit && abs(o.x - f.x) < 0.55 && abs(o.y - f.y) < 1.2 && o.inv <= 0 && o.st !== 'ko' && !HURT_STATES.has('x')) {
            f.cs.skHit = 1;
            this.applyHit(f, o, { dmg: 55, sh: 10, hs: 40, bs: 14, stop: 8, kb: [-0.04, 0.2], lvl: 'mid', launch: true, unblockable: true, fx: 'riptide', skill: true }, f.face, { x: o.x, y: o.y + 0.9 });
          }
        }
        if (sf >= 22) { f.face = o.x > f.x ? 1 : -1; this.toNeutral(f); }
        return;
      case 'habanero':
        if (sf === 22) { f.cs.fireT = 360; this.event('habanero', { i: f.i, x: f.x, y: f.y }); }
        break;
      case 'eyes':
        if (sf === 8) { f.cs.eyesT = 180; this.event('eyes', { i: f.i, x: f.x, y: f.y }); }
        break;
      case 'coral':
        if (sf === 12) {
          for (let k = s.proj.length - 1; k >= 0; k--) if (s.proj[k].type === 'coralWall' && s.proj[k].owner === f.i) this.killProj(k, true);
          this.spawnSkillProj(f, 'coralWall', { x: front(1.05), y: 0, w: 0.55, h: 1.9, life: 300, hp: 4 });
        }
        break;
      case 'hook':
        if (sf === 9) this.spawnSkillProj(f, 'hook', { x: f.x + f.face * 0.6, y: f.y + 1.0, vx: f.face * 0.34, w: 0.5, h: 0.5, life: 24 });
        if (f.skAir) f.vy = max(f.vy, -0.02);
        break;
      case 'loteria':
        if (sf === 16) {
          const card = rngInt(s.rng, LOTERIA.length);
          f.cs.card = card;
          if (card === 0) { const h = Math.round(f.hpMax * 0.12); f.hp = min(f.hpMax, f.hp + h); this.event('heal', { i: f.i, amt: h }); }
          if (card === 1) f.cs.muerte = 1;
          if (card === 2) f.cs.armorT = 240;
          if (card === 3) f.meter = min(PHYS.METER_MAX, f.meter + 35);
          if (card === 4) { o.wob = 200; this.event('voice', { i: o.i, line: 'oops' }); }
          if (card === 5) { f.shell = f.shellMax; f.soft = 0; }
          this.event('loteria', { i: f.i, card, x: f.x, y: f.y });
        }
        break;
      case 'hermit':
        if (sf === 12) { f.cs.armorT = 240; f.cs.drT = 240; f.cs.slowT = 240; this.event('hermit', { i: f.i, x: f.x, y: f.y }); }
        break;
      case 'decoy':
        if (sf === 1) {
          const x0 = f.x, y0 = f.y;
          this.spawnSkillProj(f, 'husk', { x: x0, y: y0, w: 0.6, h: CHARS[f.char].h, life: 240, hp: 1, face: f.face });
          const hw = CHARS[f.char].w / 2;
          let nx = o.x - o.face * 1.15;
          if (nx < this.stage.left + hw || nx > this.stage.right - hw) nx = o.x + o.face * 1.15;
          f.x = r4(clamp(nx, this.stage.left + hw, this.stage.right - hw)); f.y = max(0, o.y);
          f.face = o.x > f.x ? 1 : -1; f.inv = 24; f.cs.invisT = 26; f.vx = 0; f.vy = 0;
          if (f.y > 0) { f.ground = false; f.skAir = true; }
          this.event('decoy', { i: f.i, x0, y0, x: f.x, y: f.y });
        }
        if (sf >= 8) { this.toNeutral(f); }
        return;
      case 'eel':
        if (sf === 8) this.event('eel', { i: f.i, x: f.x, y: f.y });
        if (f.skAir) f.vy = max(f.vy, -0.01);
        if (sf >= 10 && sf <= 18 && !f.cs.skHit) {
          const dx = o.x - f.x, dy = (o.y + 0.8) - (f.y + 0.8);
          if (dx * dx + dy * dy < 1.6 * 1.6 && o.inv <= 0 && o.st !== 'ko') {
            f.cs.skHit = 1;
            const r = this.applyHit(f, o, { dmg: 70, sh: 28, hs: 44, bs: 16, stop: 10, kb: [0.06, 0.05], lvl: 'mid', fx: 'eel', skill: true, heavy: true }, dx >= 0 ? 1 : -1, { x: o.x, y: o.y + 0.9 });
            if (r === 'hit' && o.st === 'hitstun') { o.st = 'shocked'; o.sf = 0; }
          }
        }
        break;
      case 'mariachi':
        if (sf === 12) this.spawnSkillProj(f, 'sonic', { x: f.x + f.face * 0.8, y: f.y + 0.9, vx: f.face * 0.2, w: 0.9, h: 1.9, life: 46, dmg: 30 });
        break;
      case 'pinata':
        if (sf === 10) this.spawnSkillProj(f, 'pinataBomb', { x: f.x + f.face * 0.5, y: f.y + 1.3, vx: f.face * (0.1 + abs(o.x - f.x) * 0.012), vy: 0.2, g: 0.012, w: 0.55, h: 0.6, life: 150 });
        break;
      default: break;
    }
    if (sf >= S.t) this.toNeutral(f);
  }

  spawnSkillProj(f, type, o) {
    const s = this.s;
    const p = { id: s.nextId++, type, owner: f.i, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, life: o.life || 120, w: o.w || 0.5, h: o.h || 0.5, dmg: o.dmg || 0, hp: o.hp || 0, hitCd: 0, bounces: 0, state: 'fly', data: 0, face: o.face ?? f.face, skill: true, arm: o.arm || 0, t: 0 };
    s.proj.push(p);
    this.event('projSpawn', { id: p.id, type, i: f.i, x: p.x, y: p.y, data: 0 });
    return p;
  }

  tickSkillProj(p, owner, k) {
    const s = this.s, st = this.stage, o = s.fighters[1 - p.owner];
    p.t++;
    const box = () => [p.x - p.w / 2, p.x + p.w / 2, p.y - (p.type === 'coralWall' || p.type === 'husk' ? 0 : p.h / 2), p.y + (p.type === 'coralWall' || p.type === 'husk' ? p.h : p.h / 2)];
    const touch = () => o.inv <= 0 && o.st !== 'ko' && o.st !== 'thrown' && o.st !== 'ucVictim' && this.overlap(box(), this.hurtbox(o));
    switch (p.type) {
      case 'mine': {
        if (p.t > p.arm && touch()) { this.mineBoom(p, k, owner, o); return; }
        if (p.life <= 0) { this.mineBoom(p, k, owner, o); return; }
        return;
      }
      case 'coralWall':
        if (p.life <= 0 || p.hp <= 0) { this.killProj(k, true); return; }
        return;
      case 'husk':
        if (p.life <= 0) { this.killProj(k, true); return; }
        if (p.hp <= 0) {
          this.event('huskBoom', { id: p.id, x: p.x, y: p.y + 0.8 });
          const dx = o.x - p.x;
          if (abs(dx) < 1.2 && o.inv <= 0 && o.st !== 'ko') this.applyHit(owner, o, { dmg: 45, sh: 15, hs: 22, bs: 12, stop: 8, kb: [0.12, 0.16], lvl: 'mid', launch: true, fx: 'husk', proj: true, skill: true }, dx >= 0 ? 1 : -1, { x: o.x, y: o.y + 0.9 });
          this.killProj(k, false);
        }
        return;
      case 'hook': {
        p.x += p.vx;
        if (p.x < st.left || p.x > st.right || p.life <= 0) { this.killProj(k, true); return; }
        if (touch()) {
          const res = this.applyHit(owner, o, { dmg: 35, sh: 12, hs: 34, bs: 12, stop: 8, kb: [-0.27, 0.07], lvl: 'mid', fx: 'hook', proj: true, skill: true }, p.vx >= 0 ? 1 : -1, { x: p.x, y: p.y });
          this.event('hookHit', { id: p.id, i: p.owner, x: p.x, y: p.y, res });
          this.killProj(k, false);
        }
        return;
      }
      case 'sonic':
        p.x += p.vx;
        if (p.life <= 0 || p.x < st.left || p.x > st.right) { this.killProj(k, true); return; }
        if (!p.hitDone && touch()) {
          p.hitDone = true;
          this.applyHit(owner, o, { dmg: 30, sh: 22, hs: 24, bs: 16, stop: 6, kb: [0.34, 0.14], lvl: 'mid', launch: true, wallBounce: true, fx: 'sonic', proj: true, skill: true }, p.vx >= 0 ? 1 : -1, { x: o.x, y: o.y + 1 });
        }
        return;
      case 'pinataBomb': {
        p.vy -= p.g; p.x += p.vx; p.y += p.vy;
        p.x = r4(p.x); p.y = r4(p.y); p.vy = r4(p.vy);
        let boom = p.life <= 0 || touch() || p.y <= 0.3 || p.x < st.left || p.x > st.right;
        for (const pl of s.plats) if (!pl.broken && p.vy < 0 && p.x > pl.x0 && p.x < pl.x1 && abs(p.y - pl.y) < 0.2) boom = true;
        if (boom) {
          this.event('pinataBoom', { id: p.id, x: p.x, y: max(0.3, p.y) });
          const dx = o.x - p.x, dy = (o.y + 0.8) - p.y;
          if (dx * dx + dy * dy < 1.5 * 1.5 && o.inv <= 0 && o.st !== 'ko') this.applyHit(owner, o, { dmg: 70, sh: 24, hs: 28, bs: 14, stop: 9, kb: [0.12, 0.22], lvl: 'mid', launch: true, heavy: true, fx: 'pinata', proj: true, skill: true }, dx >= 0 ? 1 : -1, { x: o.x, y: o.y + 0.9 });
          for (let i = 0; i < 2; i++) this.addProp('snail', p.x, max(0.3, p.y), { vx: (rngFloat(s.rng) - 0.5) * 0.16, vy: 0.1 + rngFloat(s.rng) * 0.08 }).state = 'fly';
          this.killProj(k, false);
        }
        return;
      }
      default:
        if (p.life <= 0) this.killProj(k, true);
    }
  }
  mineBoom(p, k, owner, o) {
    this.event('mineBoom', { id: p.id, x: p.x, y: p.y, i: p.owner });
    const dx = o.x - p.x, dy = (o.y + 0.6) - p.y;
    if (dx * dx + dy * dy < 1.3 * 1.3 && o.inv <= 0 && o.st !== 'ko') this.applyHit(owner, o, { dmg: 90, sh: 30, hs: 30, bs: 16, stop: 10, kb: [0.1, 0.26], lvl: 'mid', launch: true, heavy: true, fx: 'cav', proj: true, skill: true }, dx >= 0 ? 1 : -1, { x: p.x, y: p.y + 0.4 });
    for (const q of this.s.props) this.propInRadius(q, p.x, p.y, 1.2, p.owner, 2);
    this.killProj(k, false);
  }
  hitSkillObjects(f, hb) {
    for (const p of this.s.proj) {
      if (!p.skill || p.owner === f.i) continue;
      if (p.type !== 'coralWall' && p.type !== 'husk') continue;
      if (p.hitCd > 0) { p.hitCd--; continue; }
      const box = [p.x - p.w / 2, p.x + p.w / 2, p.y, p.y + p.h];
      if (!this.overlap(hb.box, box)) continue;
      p.hp -= hb.m.dmg >= 70 ? 2 : 1; p.hitCd = 10;
      f.hitstop = max(f.hitstop, 4);
      this.event(p.type === 'coralWall' ? 'coralHit' : 'huskHit', { id: p.id, x: p.x, y: f.y + 1 });
    }
  }

  // ------------------------------------------------------------------ cinematic ultimate (with QTE)
  startUltCine(f, o) {
    const s = this.s, U = ULT_CINE;
    s.ucine = { a: f.i, d: o.i, t: 0, char: f.cs.demon ? 'demon' : f.char, btns: U.steps.map(() => rngInt(s.rng, 3)), res: U.steps.map(() => 0), good: 0, mash: 0, done: false, dmg: 0, x: o.x };
    s.phase = 'ucine';
    f.st = 'ucAtk'; f.sf = 0; f.mv = null; f.vx = 0; f.vy = 0; f.hitstop = 0;
    o.st = 'ucVictim'; o.sf = 0; o.mv = null; o.vx = 0; o.vy = 0; o.hitstop = 0; o.held >= 0 && this.dropHeld(o);
    f.stats.ults = f.stats.ults || 0;
    this.event('ucStart', { a: f.i, d: o.i, char: s.ucine.char, btns: s.ucine.btns });
  }
  tickUltCine() {
    const s = this.s, c = s.ucine, U = ULT_CINE;
    if (!c) { s.phase = 'fight'; return; }
    c.t++;
    const A = s.fighters[c.a], D = s.fighters[c.d];
    A.sf++; D.sf++;
    // keep them grounded and facing
    const hw = CHARS[D.char].w / 2;
    A.face = D.x >= A.x ? 1 : -1;
    const btn = [LIGHT, HEAVY, BLOCK];
    const prA = A.inCur & ~A.inPrev, prD = D.inCur & ~D.inPrev;
    const red = () => 1 - min(0.3, c.mash * 0.01);
    for (let i = 0; i < U.steps.length; i++) {
      if (c.res[i]) continue;
      const at = U.steps[i];
      if (c.t < at - U.window) break;
      let r = 0;
      if (c.t <= at + U.window && (prA & (LIGHT | HEAVY | BLOCK))) r = (prA & btn[c.btns[i]]) ? 1 : -1;
      if (!r && c.t > at + U.window) r = -1;
      if (!r && this.cfg.cpuUlt?.[A.i]) { if (c.t === at - 2) r = rngChance(s.rng, 0.6) ? 1 : -1; }
      if (r) {
        c.res[i] = r;
        if (r > 0) c.good++;
        const dmg = Math.round((r > 0 ? U.good : U.bad) * red());
        D.hp = max(1, D.hp - dmg); c.dmg += dmg;
        A.stats.dmg += dmg; A.stats.hits++;
        this.event('ucHit', { k: i, good: r > 0, a: A.i, d: D.i, dmg, x: D.x, y: D.y + 1 });
      }
      break;
    }
    if (prD & (LIGHT | HEAVY | BLOCK)) { c.mash = min(40, c.mash + 1); if (c.mash % 5 === 0) this.event('ucMash', { i: D.i, mash: c.mash }); }
    if (this.cfg.cpuUlt?.[D.i] && s.frame % 9 === 0) c.mash = min(40, c.mash + 1);
    if (c.t === U.final) {
      const dmg = Math.round((U.finalBase + U.finalPer * c.good) * red());
      c.dmg += dmg; A.stats.dmg += min(dmg, D.hp);
      if (c.good === U.steps.length) A.stats.ultQte = (A.stats.ultQte || 0) + 1;
      this.event('ucFinal', { a: A.i, d: D.i, dmg, good: c.good, total: c.dmg, x: D.x, y: D.y + 1, char: c.char, perfect: c.good === U.steps.length });
      if (D.hp - dmg <= 0) {
        D.hp = 0; s.ucine = null; s.phase = 'fight';
        this.setState(A, 'idle');
        this.doKO(A, D, A.face);
        return;
      }
      D.hp -= dmg;
    }
    if (c.t >= U.dur) {
      s.ucine = null; s.phase = 'fight';
      this.setState(A, 'idle'); A.inv = 10;
      D.st = 'airhit'; D.sf = 0; D.hitstun = 50; D.launched = true; D.vx = A.face * 0.22; D.vy = 0.24; D.ground = false; D.plat = -1; D.combo = 0;
      D.x = r4(clamp(D.x, this.stage.left + hw, this.stage.right - hw));
      this.event('ucEnd', { a: A.i, d: D.i, total: c.dmg, good: c.good });
    }
  }

  // ------------------------------------------------------------------ util
  hash() {
    const str = JSON.stringify(this.s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  snapshot() { return JSON.stringify(this.s); }
  restore(json) { this.s = JSON.parse(json); }
  consumeEvents() { const e = this.events; this.events = []; return e; }
}
