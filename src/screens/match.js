// The fight: runs the deterministic sim at 60Hz (local, vs CPU, training or online lockstep),
// renders the 2D pixel-art arena + fighters, turns sim events into juicy pixel feedback,
// directs the camera and the ultimate cutscenes, and draws the HUD.
import { Sim } from '../sim/sim.js';
import { AI } from '../sim/ai.js';
import { CHARS, PHYS, ULT_NAMES, SKILLS, LOTERIA } from '../sim/data.js';
import { STAGES } from '../sim/stages.js';
import { Camera2D } from '../px/camera.js';
import { FX } from '../px/fx.js';
import { FighterView2D } from '../px/fighterView.js';
import { drawProjectiles } from '../px/projectiles.js';
import { UltCinema } from '../px/cinema.js';
import { portrait } from '../px/portrait.js';
import { HUD, keyNamesFor } from '../ui/hud.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { keyLabel } from '../core/input.js';
import { ease, clamp } from '../core/math.js';
import { line } from '../data/dialogue.js';
import { makeStage } from '../px/stages/index.js';

const STEP = 1 / 60;
// a broken stage must never take the match down: fall back to a plain arena
async function loadStage(id, def) {
  try { return makeStage(id, def); } catch (e) { console.warn('stage load failed', e); return null; }
}
const hex = (n) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : n);

export class MatchScreen {
  constructor(cfg) { this.cfg = cfg; this.ready = false; }

  enter() {
    const g = this.game, cfg = this.cfg;
    const simCfg = {
      p: cfg.players.map((p) => ({ char: p.char, cos: p.cos })),
      stage: cfg.stage, seed: cfg.seed ?? Math.floor(Math.random() * 1e9), rounds: cfg.rounds || 3,
      roundTime: cfg.roundTime || 99, qte: cfg.qte !== false, training: cfg.mode === 'training', net: cfg.mode === 'online',
      skipIntro: cfg.skipIntro, noSkills: cfg.noSkills, pickTime: cfg.pickTime,
    };
    this.sim = new Sim(simCfg);
    const st = STAGES[cfg.stage] || STAGES.rustpit;
    this.stageDef = st;
    this.fx = new FX();
    this.stage = null;
    const B = { left: st.left - 3, right: st.right + 3, bottom: -1.5, top: 13 };
    loadStage(cfg.stage, st).then((stage) => { if (!stage) return; this.stage = stage; if (stage.bounds) this.cam.bounds = stage.bounds; }).catch((e) => console.error(e));
    this.cam = new Camera2D(B);
    this.cam.shakeScale = g.save.settings.shake ?? 1;
    this.views = cfg.players.map((p, i) => new FighterView2D(i, p.char, p.cos || {}, this.fx));
    this.prev = this.sim.s.fighters.map((f) => ({ x: f.x, y: f.y }));
    this.ai = cfg.players.map((p, i) => (p.cpu ? new AI(i, p.cpu, (simCfg.seed + i * 99) | 0) : null));
    this.acc = 0; this.time = 0;
    this.paused = false; this.pauseSel = 0;
    const bnd = g.save.settings.bindings;
    const kn = keyNamesFor(bnd);
    // local versus: each player has their own keys; otherwise the one local player uses P1's keys
    const localIdx = cfg.mode === 'online' ? (cfg.localIndex ?? cfg.net?.localIndex ?? 0) : 0;
    const keys = cfg.mode === 'local' ? kn : [0, 1].map((i) => (i === localIdx ? kn[0] : null));
    this.keys = keys;
    this.hud = new HUD(g, {
      names: cfg.players.map((p) => p.name),
      portraits: cfg.players.map((p) => portrait(p.char, p.cos || {}, { size: 32 })),
      demonPortraits: cfg.players.map((p) => (p.char === 'bobby' ? portrait('bobby', p.cos || {}, { size: 32, demon: true }) : null)),
      mode: cfg.mode, keys,
    });
    g.input.mode = cfg.mode === 'local' ? 'versus' : 'solo';
    g.touch.active = true;
    g.input.clearLatched();
    this.cine = null;
    this.cinema = new UltCinema();
    this.trainingOpts = { dummy: 'stand', showInputs: true, infiniteMeter: false };
    this.inputLog = [[], []];
    this.lastHitInfo = null;
    this.musicTrack = st.music || 'rustpit';
    this.dark = 0; this.letter = 0; this.redTint = 0;
    if (cfg.net) {
      cfg.net.bindSim(this.sim);
      cfg.net.onDisconnect = (msg) => { this.netLost = msg || 'Opponent disconnected'; };
      cfg.net.onMessage = (m) => { if (m.t === 'bye') this.netLost = 'Opponent left the match'; };
    }
    Sound.music(cfg.mode === 'training' ? 'training' : this.musicTrack, { fade: 1.5 });
    Sound.muffle(false);
    this.ready = true;
    // opening camera sweep across the arena
    const f = this.sim.s.fighters;
    if (!cfg.skipIntro && cfg.mode !== 'training') {
      this.cam.snap(B.left + 6, 5.5, 1.25);
      this.cam.setShot({ target: { x: 0, y: 0 }, dx: B.left + 6, dx2: 0, dy: 5.5, dy2: 3.2, zoom: 1.2, zoom2: 1.6, dur: 4, speed: 3 });
      this.introShot = true;
    } else this.cam.snap((f[0].x + f[1].x) / 2, 3.2, 1.6);
    this.cam.aspect = g.display.aspect;
  }

  exit() {
    if (this.keepAlive) { this.keepAlive = false; return; }
    Sound.slowmo(1); Sound.muffle(false);
    this.game.input.mode = 'solo';
    this.game.touch.active = false;
  }

  // ---------------------------------------------------------- input gathering
  localInputs() {
    const g = this.game, cfg = this.cfg;
    const out = [0, 0];
    for (let i = 0; i < 2; i++) {
      if (this.ai[i]) out[i] = this.ai[i].think(this.sim);
      else if (cfg.mode === 'local') out[i] = g.input.sample(i);
      else if (i === 0) out[i] = g.input.sample(0);
    }
    if (cfg.mode === 'training') out[1] = this.trainingDummy();
    return out;
  }
  trainingDummy() {
    const o = this.trainingOpts, f = this.sim.s.fighters[1];
    if (o.dummy === 'cpu') { this.ai[1] ||= new AI(1, 3, 77); return this.ai[1].think(this.sim); }
    if (o.dummy === 'crouch') return 8;
    if (o.dummy === 'jump') return f.st === 'idle' ? 4 : 0;
    if (o.dummy === 'block') return 64;
    if (o.dummy === 'block-low') return 64 | 8;
    return 0;
  }

  // ---------------------------------------------------------- update
  update(dt, active) {
    if (!this.ready) return;
    const g = this.game, cfg = this.cfg;
    this.time += dt;
    if (active && cfg.mode !== 'online' && (g.input.startPressed() || g.touch.consumePause()) && !this.sim.s.done) { this.paused = !this.paused; Sound.sfx(this.paused ? 'ui_select' : 'ui_back'); Sound.muffle(this.paused); }
    if (this.paused) { this.updatePause(); return; }
    if (cfg.mode === 'training' && active) this.trainingKeys();
    const speed = this.simSpeed ?? (this.simSpeed = +(new URLSearchParams(location.search).get('simspeed') || 1));
    this.acc += dt * (cfg.mode === 'online' ? 1 : speed);
    let steps = 0;
    const maxSteps = 5 * Math.max(1, speed);
    while (this.acc >= STEP && steps < maxSteps) {
      if (cfg.mode === 'online') {
        const ok = this.netStep();
        if (!ok) { this.acc = Math.min(this.acc, STEP); break; }
      } else this.stepSim(this.localInputs());
      this.acc -= STEP; steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    this.alpha = clamp(this.acc / STEP, 0, 1);
    this.updateVisuals(dt);
    if (this.sim.s.done) this.finish();
    if (this.netLost && !this.netLostShown) {
      this.netLostShown = true;
      g.toast(this.netLost, P.red4);
      setTimeout(() => { this.cfg.net?.close(); this.cfg.onQuit?.(); }, 1800);
    }
  }
  netStep() {
    const net = this.cfg.net;
    if (!net) return false;
    return net.stepLockstep(this.game.input.sample(0), (inputs) => this.stepSim(inputs));
  }
  stepSim(inputs) {
    const s = this.sim.s;
    for (let i = 0; i < 2; i++) { this.prev[i].x = s.fighters[i].x; this.prev[i].y = s.fighters[i].y; }
    if (this.cfg.mode === 'training') {
      for (const f of s.fighters) { if (this.trainingOpts.infiniteMeter) f.meter = PHYS.METER_MAX; if (f.st === 'idle' && f.combo === 0) f.hp = Math.min(f.hpMax, f.hp + 6); }
      this.inputLog[0].unshift(inputs[0]); if (this.inputLog[0].length > 40) this.inputLog[0].pop();
    }
    this.sim.step(inputs);
    for (const e of this.sim.consumeEvents()) this.onEvent(e);
  }

  // ---------------------------------------------------------- events -> feedback
  onEvent(e) {
    const fx = this.fx, hud = this.hud, s = this.sim.s, cam = this.cam, V = this.views;
    const cos = (i) => this.cfg.players[i]?.cos || {};
    try { this.stage?.onEvent?.(e); } catch (err) { console.error(err); }
    this.cinema.onEvent(e);
    const F = (i) => s.fighters[i];
    switch (e.t) {
      case 'hit': {
        const power = e.ult ? 2 : e.heavy ? 1.6 : e.dmg > 40 ? 1.1 : 0.7;
        fx.hitEffect(e.x, e.y, power, e.kb || 1, e.a >= 0 ? cos(e.a).hitfx || 'classic' : 'classic');
        if (e.d >= 0) V[e.d].flashHit('#ffffff', 1);
        cam.addTrauma(e.heavy ? 0.42 : 0.16 + Math.min(0.2, e.dmg / 400));
        cam.kick((e.kb || 1) * 0.12, 0.03, e.heavy ? 1.2 : 0.6);
        if (e.heavy) { cam.zoomPunch(0.6); fx.ring(e.x, e.y, 0.2, { size1: 1.4, dur: 0.2, color: '#ffffff', color2: '#ffd040' }); }
        if (e.lethal || (e.heavy && e.counter)) fx.impactFrame(3, { x: e.x, y: e.y });
        Sound.sfx(e.ult ? 'hit_super' : e.heavy ? 'hit_heavy' : e.dmg > 35 ? 'hit_medium' : 'hit_light', { pitch: 0.95 + Math.random() * 0.1, pan: this.pan(e.x) });
        if (e.counter) { hud.callout('COUNTER!', e.a, P.red4, true); Sound.sfx('counter'); fx.text('COUNTER!', e.x, e.y + 0.8, { color: '#ff6a4a' }); }
        else if (e.punish) hud.callout('PUNISH!', e.a, P.orange3);
        if (e.a >= 0 && s.fighters[e.d]) hud.comboHit(e.a, e.combo, e.dmg);
        if (e.sting) { fx.icons(e.x, e.y, 6, 'bolt', ['#ffb6d9', '#ffffff'], { sp1: 4 }); Sound.sfx('puru_zap'); }
        if (e.dmg >= 20) fx.text(String(e.dmg), e.x + (Math.random() - 0.5) * 0.4, e.y + 0.6, { size: 'small', color: e.heavy ? '#ffd040' : '#ffffff', dur: 0.6, vy: 1.6 });
        if (this.cfg.mode === 'training' && e.a === 0) this.lastHitInfo = { mv: e.mv, dmg: e.dmg, combo: e.combo, t: 2 };
        break;
      }
      case 'block':
        fx.sparks(e.x, e.y, e.cone ? 8 : 10, { colors: ['#9ff3ff', '#ffffff', '#49c2bd'], sp1: 6, dir: -(e.kb || 1) });
        fx.ring(e.x, e.y, 0.15, { size1: 0.7, dur: 0.14, color: '#9ff3ff', color2: '#49c2bd', thick: 1 });
        if (e.d >= 0) V[e.d].flashHit('#9ff3ff', 0.5);
        cam.addTrauma(e.heavy ? 0.2 : 0.08);
        Sound.sfx(e.cone ? 'cone_bonk' : e.heavy ? 'block_heavy' : 'block', { pan: this.pan(e.x) });
        if (e.shell !== undefined && e.shell < 0.34) fx.shards(e.x, e.y, 4, this.shellColors(e.d));
        break;
      case 'perfect':
        fx.screenFlash(0.3, '#bff8ff');
        fx.ring(e.x, e.y, 0.3, { size1: 2.2, dur: 0.28, color: '#ffffff', color2: '#bff8ff', thick: 2 });
        fx.icons(e.x, e.y, 10, 'star', ['#ffffff', '#bff8ff'], { sp1: 7 });
        V[e.d].flashHit('#bff8ff', 1);
        hud.callout(e.eyes ? 'POLARIZED PARRY!' : 'PERFECT BLOCK!', e.d, P.teal5, true);
        fx.text('PERFECT!', e.x, e.y + 0.9, { color: '#8ff0e0' });
        Sound.sfx('perfect_block');
        cam.zoomPunch(0.5);
        break;
      case 'shellCrack': fx.shards(e.x, e.y, 6, this.shellColors(e.i)); Sound.sfx('shell_crack', { pan: this.pan(e.x) }); break;
      case 'shellBreak':
        fx.shards(e.x, e.y, 40, this.shellColors(e.i), { sp1: 9, s1: 1, life: 2 });
        fx.ring(e.x, e.y, 0.3, { size1: 2.8, dur: 0.38, color: '#ffd090', color2: '#ffffff', thick: 3 });
        fx.burst(e.x, e.y, 1.6, '#ffd090');
        fx.screenFlash(0.35); fx.impactFrame(3, { x: e.x, y: e.y });
        cam.addTrauma(0.6); cam.zoomPunch(1);
        hud.callout('SHELL BREAK!', e.by >= 0 ? e.by : 1 - e.i, P.orange3, true);
        hud.announce('SHELL BREAK!', { dur: 0.9, color: P.orange3 });
        Sound.sfx('shell_break'); Sound.sfx('dizzy', { delay: 0.3 });
        break;
      case 'cavSpawn': fx.bubble(e.x, e.y, e.r * 0.85, e.delay, e.dark, e.id); Sound.sfx('projectile_bubble', { vol: 0.35, pitch: 1.6 }); break;
      case 'cavPop': {
        fx.popBubble(e.id);
        const big = e.big ? 1.6 : 1;
        fx.ring(e.x, e.y, 0.2, { size1: (e.r || 0.6) * 2.6 * big, dur: 0.26, color: e.dark ? '#c040ff' : '#ffffff', color2: e.dark ? '#ff4080' : '#bff8ff', thick: 2 });
        fx.sparks(e.x, e.y, 14, { colors: e.dark ? ['#d080ff', '#ff4080'] : ['#ffffff', '#bff8ff', '#fff8c0'], sp1: 7 * big });
        fx.bubbleBurst(e.x, e.y, 10, 1.2 * big);
        if (e.big) fx.burst(e.x, e.y, 1.2, e.dark ? '#ff4080' : '#bff8ff');
        cam.addTrauma(0.22 * big);
        Sound.sfx('cavitation', { pan: this.pan(e.x) }); if (e.big) Sound.sfx('shockwave', { vol: 0.6 });
        break;
      }
      case 'whoosh': Sound.sfx(e.sfx || 'whiff_light', { vol: 0.6, pitch: 0.95 + Math.random() * 0.1 }); break;
      case 'moveName': if (e.name !== (ULT_NAMES[s.fighters[e.i].cs?.demon ? 'demon' : s.fighters[e.i].char])) hud.callout(e.name, e.i, PLAYER_COLORS[e.i].light); if (Math.random() < 0.6) this.say(e.i, 'special'); break;
      case 'jump': fx.dust(e.x, e.y, 4, '#a89070', 0.6); Sound.sfx('jump', { vol: 0.5 }); break;
      case 'airjump': fx.bubbleBurst(e.x, e.y + 0.3, 8, 0.8); fx.ring(e.x, e.y + 0.1, 0.1, { size1: 0.6, dur: 0.2, flat: true, color: '#bff8ff' }); Sound.sfx('double_jump', { vol: 0.6 }); break;
      case 'land': fx.dust(e.x, e.y, e.heavy ? 10 : 5, '#a89070', e.heavy ? 1.3 : 0.8); Sound.sfx(e.heavy ? 'land_heavy' : 'land', { vol: 0.5 }); if (e.heavy) cam.addTrauma(0.08); break;
      case 'step': if (Math.random() < 0.5) fx.dust(e.x, 0, 1, '#a89070', 0.3); Sound.sfx('step', { vol: 0.18, pitch: 0.9 + Math.random() * 0.3 }); break;
      case 'dash': fx.dust(e.x, 0, 6, '#a89070', 1); Sound.sfx('dash', { vol: 0.6 }); break;
      case 'dodge': Sound.sfx('dodge', { vol: 0.6 }); fx.bubbleBurst(F(e.i).x, 0.8, 6, 0.5); break;
      case 'knockdown': fx.dust(e.x, 0, 10, '#a89070', 1.2); cam.addTrauma(0.15); Sound.sfx('knockdown'); break;
      case 'wallBounce': fx.sparks(e.x, e.y, 14, { colors: ['#ffd080', '#ffffff'] }); fx.burst(e.x, e.y, 1, '#ffd080'); cam.addTrauma(0.35); Sound.sfx('wall_bounce'); hud.callout('WALL SPLAT!', 1 - e.i, P.orange3); break;
      case 'groundBounce': fx.dust(e.x, 0, 12, '#a89070', 1.5); cam.addTrauma(0.3); Sound.sfx('knockdown'); break;
      case 'chargeStart': Sound.sfx('charge_start'); this.chargeLoop = Sound.loopStart?.('charge_loop'); break;
      case 'chargeFull': Sound.sfx('charge_full'); fx.icons(F(e.i).x, F(e.i).y + 1, 8, 'star', ['#ffb060', '#ffffff'], { sp1: 3 }); break;
      case 'chargeRelease': Sound.loopStop?.(this.chargeLoop); this.chargeLoop = null; if (e.lv > 0.7) { cam.zoomPunch(0.8); fx.speedLines(0.6, { x: F(e.i).x, y: F(e.i).y + 1 }); } break;
      case 'grab': Sound.sfx('throw_grab'); hud.callout('GRAB!', e.a, P.cream3); break;
      case 'snag': Sound.sfx('spear_snag'); hud.callout('SNAGGED!', e.a, P.cream3); fx.sparks(e.x, e.y, 10, { colors: ['#ffffff'] }); break;
      case 'throwShake': cam.addTrauma(0.15); Sound.sfx('whiff_heavy', { vol: 0.5 }); break;
      case 'tech': fx.sparks(e.x, e.y, 16, { colors: ['#ffffff', '#fff08a'] }); Sound.sfx('perfect_block', { pitch: 0.8 }); hud.callout('THROW TECH!', 0, P.cream4); break;
      case 'taunt': this.say(e.i, 'taunt'); Sound.sfx('taunt', { vol: 0.6 }); break;
      case 'moltStart': this.moltLoop = Sound.loopStart?.('molt_loop'); Sound.sfx('molt_start', { vol: 0.8 }); break;
      case 'moltCancel': Sound.loopStop?.(this.moltLoop); this.moltLoop = null; break;
      case 'moltDenied': fx.text(e.why === 'cooldown' ? 'MOLT COOLDOWN' : 'SHELL FULL', F(e.i).x, F(e.i).y + 2.3, { size: 'small', color: '#9aa6b2' }); break;
      case 'molt':
        Sound.loopStop?.(this.moltLoop); this.moltLoop = null;
        V[e.i].spawnHusk();
        fx.icons(e.x, e.y + 1, 14, 'star', ['#fff0b0', '#ffffff', '#8ff0e0'], { sp1: 5 });
        fx.bubbleBurst(e.x, e.y + 0.8, 20, 1.4);
        fx.ring(e.x, e.y + 1, 0.3, { size1: 2.4, dur: 0.4, color: '#fff0b0', color2: '#ffffff' });
        fx.screenFlash(0.2, '#fff6d0');
        hud.callout('MOLTED! NEW SHELL!', e.i, P.teal5, true);
        Sound.sfx('molt_done'); this.say(e.i, 'molt');
        break;
      case 'ult': {
        hud.ult(e.i, e.name, e.char);
        fx.speedLines(1.2, { x: F(e.i).x, y: F(e.i).y + 1 }); fx.screenFlash(0.3);
        Sound.stinger('stinger_ult'); Sound.sfx('ult_start');
        this.say(e.i, 'ult');
        const v = V[e.i];
        this.ultShot = 0.7;
        cam.setShot({ target: () => v.headPos(), zoom: 3.4, snap: true, dy: -0.2 });
        break;
      }
      case 'ucStart': {
        this.cinema.start(e, this.sim, this.cfg.players);
        cam.setShot(null);
        Sound.sfx('ult_hit'); Sound.sfx('shockwave'); Sound.stinger('stinger_ult');
        this.say(e.a, 'ult');
        break;
      }
      case 'ucHit':
        Sound.sfx(e.good ? 'hit_super' : 'hit_medium', { pitch: e.good ? 1 : 0.9 });
        if (e.good) Sound.sfx('qte_press');
        else Sound.sfx('ui_error', { vol: 0.4 });
        hud.ucResult(e.good);
        break;
      case 'ucMash': Sound.sfx('qte_press', { vol: 0.25, pitch: 1.3 }); break;
      case 'ucFinal':
        Sound.sfx('hit_super'); Sound.sfx('shockwave'); Sound.sfx('ko', { vol: 0.5 });
        if (e.perfect) hud.announce('PERFECT ULTIMATE!', { dur: 1.2, color: P.gold3, sub: e.total + ' DAMAGE' });
        else hud.callout(e.total + ' DAMAGE!', e.a, P.gold3, true);
        break;
      case 'ucEnd':
        this.cinema.stop();
        fx.screenFlash(0.5); cam.addTrauma(0.5);
        { const D = F(e.d); fx.dust(D.x, 0, 14, '#a89070', 1.5); cam.snap(D.x * 0.5 + F(e.a).x * 0.5, 3, 1.9); }
        break;
      case 'spinFx': fx.bubbleBurst(e.x, e.y + 0.8, 4, 1); if (this.cfg.players[e.i].char === 'mimi') fx.icons(e.x, e.y + 1, 2, 'heart', ['#ffffff', '#ff6fb0'], { sp1: 3 }); else fx.dust(e.x, 0, 2, '#a89070', 0.8); break;
      case 'flopJump': Sound.sfx('jump', { pitch: 0.6 }); fx.dust(e.x, 0, 16, '#a89070', 1.5); break;
      case 'flopFall': Sound.sfx('whiff_heavy', { pitch: 0.5 }); break;
      case 'flopLand': case 'slam':
        fx.dust(e.x, 0, 30, '#a89070', 2.4); fx.ring(e.x, 0.05, 0, { flat: true, size1: e.t === 'flopLand' ? 7 : 3.5, dur: 0.5, color: '#ffd8a0', color2: '#a89070', thick: 2 });
        cam.addTrauma(e.t === 'flopLand' ? 1 : 0.55); fx.screenFlash(0.25);
        Sound.sfx('belly_flop'); break;
      case 'flatten': V[e.i].kickSquash(); break;
      case 'projSpawn':
        if (e.type === 'cannon') { Sound.sfx('projectile_bubble'); this.say(e.i, 'cannon'); }
        if (e.type === 'junk') Sound.sfx('junk_toss');
        if (e.type === 'bubble') Sound.sfx('projectile_bubble', { pitch: 0.7 });
        if (e.type === 'burp') { Sound.sfx('burp'); fx.bubbleBurst(e.x, e.y, 16, 1.2); }
        if (e.type === 'puru') Sound.sfx('puru_squeak');
        if (e.type === 'mine') Sound.sfx('projectile_bubble', { pitch: 0.5 });
        if (e.type === 'coralWall') { Sound.sfx('wood_break', { pitch: 1.4 }); fx.dust(e.x, 0, 8, '#ff9a7a', 1); }
        if (e.type === 'hook') Sound.sfx('chain_rattle');
        if (e.type === 'sonic') { Sound.sfx('shockwave', { pitch: 1.4 }); Sound.sfx('jukebox', { vol: 0.5 }); }
        if (e.type === 'pinataBomb') Sound.sfx('whiff_heavy', { pitch: 1.3 });
        break;
      case 'projEnd':
        if (e.type === 'junk') { Sound.sfx(['boot_thud', 'fish_slap', 'can_clang', 'duck_squeak', 'anchor_clang'][e.data] || 'boot_thud'); fx.dust(e.x, e.y, 4, '#a89070', 0.6); }
        if (e.type === 'bubble' || e.type === 'hiccup') { fx.bubbleBurst(e.x, e.y, 10, 1); Sound.sfx('bubble_pop'); }
        if (e.type === 'coralWall' && e.poof) { fx.shards(e.x, 0.8, 14, ['#ff7a5a', '#ffb48a', '#d84a5a']); Sound.sfx('crate_break', { pitch: 1.3 }); }
        if (e.type === 'husk' && e.poof) fx.shards(e.x, 0.8, 10, ['#e8dcc0', '#c8b890']);
        break;
      case 'projBounce': Sound.sfx('can_clang', { vol: 0.5 }); break;
      case 'puruBounce': Sound.sfx('puru_boing', { vol: 0.6 }); fx.bubbleBurst(e.x, e.y, 4, 0.6); break;
      case 'puruZap': fx.icons(e.x, e.y, 6, 'bolt', ['#ffb6d9', '#ffffff', '#ff6fb0'], { sp1: 5 }); break;
      case 'puruBack': Sound.sfx('puru_squeak', { pitch: 1.3 }); break;
      case 'puruRecall': Sound.sfx('puru_squeak', { pitch: 0.9 }); break;
      case 'trapped': Sound.sfx('projectile_bubble', { pitch: 0.6 }); hud.callout('BUBBLED!', 1 - e.i, P.pink3, true); break;
      case 'bubblePop': fx.bubbleBurst(e.x, e.y, 18, 1.4); Sound.sfx('bubble_pop'); break;
      case 'clash': fx.sparks(e.x, e.y, 16, { colors: ['#ffffff', '#9ff3ff'] }); fx.ring(e.x, e.y, 0.2, { size1: 1.2 }); Sound.sfx('cavitation', { pitch: 0.8 }); break;
      case 'counterStance': fx.screenFlash(0.35, '#bff8ff'); fx.ring(e.x, e.y, 0.3, { size1: 2.2, color: '#ffffff', color2: '#bff8ff' }); hud.callout('MIRAGE COUNTER!', e.i, P.teal5, true); fx.speedLines(0.7, { x: e.x, y: e.y }); Sound.sfx('perfect_block'); this.say(e.i, 'counter'); break;
      case 'armor': fx.sparks(e.x, e.y, 8, { colors: ['#ffd080'] }); hud.callout('ARMOR!', s.fighters[e.i] ? e.i : 0, P.gold3); Sound.sfx('block_heavy'); break;
      case 'vanish': case 'vanishOut': fx.pixels(e.x, e.y + 0.8, 26, { colors: ['#1a0a20', '#3a0a2a', '#6a1a3a'], sp1: 3, up: 1.5, grav: 1, size: 3, l1: 0.8 }); Sound.sfx('demon_whisper', { vol: 0.6 }); break;
      case 'faceplant': Sound.sfx('cone_bonk'); fx.dust(e.x, 0, 8, '#a89070', 1); hud.callout('STUCK!', e.i, P.orange3); this.say(e.i, 'oops'); break;
      case 'heal': fx.icons(F(e.i).x, F(e.i).y + 1.2, 8, 'heart', ['#6aff8a', '#b6ffb0'], { sp1: 2, grav: 1.5 }); fx.text('+' + e.amt, F(e.i).x, F(e.i).y + 2.4, { color: '#6aff8a', size: 'small' }); break;
      case 'snackCrack': Sound.sfx('snail_crunch'); fx.shards(F(e.i).x + F(e.i).face * 0.4, 1.5, 8, ['#f0c33c', '#b88a1e']); break;
      case 'snackEat': Sound.sfx('munch'); this.say(e.i, 'snack'); break;
      case 'pickup': Sound.sfx('glass_clink'); break;
      case 'throwItem': Sound.sfx('whiff_heavy', { pitch: 1.2 }); break;
      case 'drinkStart': Sound.sfx('gulp'); break;
      case 'drink': fx.text(e.drunk >= 250 ? 'TIPSY!' : '+' + e.amt, F(e.i).x, F(e.i).y + 2.4, { color: e.drunk >= 250 ? '#ff9ab0' : '#6aff8a', size: 'small' }); Sound.sfx('gulp'); break;
      case 'hiccup': Sound.sfx('hiccup'); fx.bubbleBurst(F(e.i).x, F(e.i).y + 1.4, 3, 0.4); if (Math.random() < 0.3) this.say(e.i, 'drunk'); break;
      case 'voice': this.say(e.i, e.line); break;
      case 'noShell': fx.text('NO SHELL!', F(e.i).x, F(e.i).y + 2.3, { size: 'small', color: '#ff6a4a' }); break;
      case 'chandelierFall': Sound.sfx('chandelier_fall'); hud.callout('LOOK OUT!', 0, P.gold3); break;
      case 'tableBreak': Sound.sfx('wood_break'); cam.addTrauma(0.25); fx.debris(e.x, e.y, 10, ['#7a4a2c', '#b97f46']); break;
      case 'jukebox': Sound.sfx('jukebox'); this.musicTrack = e.track ? 'cantina2' : 'cantina'; Sound.music(this.musicTrack, { fade: 0.4 }); fx.icons(e.x, e.y + 0.5, 6, 'note', ['#fff08a', '#ffffff'], { sp1: 2, up: 2 }); break;
      case 'bartenderSlide': Sound.sfx('glass_clink'); break;
      case 'propBreak':
        Sound.sfx(e.type === 'crate' ? 'crate_break' : e.type === 'pinata' ? 'pinata_break' : e.type === 'chandelier' ? 'chandelier_fall' : 'wood_break');
        if (e.type === 'crate') fx.debris(e.x, e.y, 12, ['#7a4a2c', '#b97f46', '#5a3522']);
        if (e.type === 'pinata') fx.icons(e.x, e.y, 18, 'confetti', ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a'], { sp1: 6 });
        if (e.type === 'chandelier') fx.shards(e.x, e.y, 20, ['#f0c33c', '#fff08a', '#cfd8df']);
        break;
      case 'propHit': Sound.sfx(e.type === 'crate' ? 'crate_hit' : e.type === 'barrel' || e.type === 'barrelWall' ? 'barrel_hit' : e.type === 'pinata' ? 'pinata_hit' : e.type === 'chandelier' ? 'metal_clang' : 'stool_hit', { vol: 0.7 }); break;
      case 'itemBreak': Sound.sfx(e.type === 'stool' ? 'wood_break' : 'bottle_break'); fx.shards(e.x, e.y + 0.2, 8, e.type === 'stool' ? ['#7a4a2c', '#b97f46'] : ['#bff8ff', '#7ac8a0', '#ffffff']); break;
      case 'ventBurst': Sound.sfx('pipe_hiss'); Sound.sfx('valve_steam'); break;
      case 'snailPickup': Sound.sfx('snail_pickup'); fx.icons(e.x, e.y + 0.3, 3, 'star', ['#fff08a'], { sp1: 2 }); break;
      // ---- skills
      case 'skill': {
        const S = SKILLS[e.id];
        hud.callout(S.name + '!', e.i, P.gold4, true);
        fx.ring(e.x, e.y + 1, 0.2, { size1: 1.3, dur: 0.25, color: S.color, color2: '#ffffff', thick: 2 });
        fx.pixels(e.x, e.y + 1, 12, { colors: [S.color, '#ffffff'], sp1: 4, up: 2 });
        cam.zoomPunch(0.4);
        Sound.sfx('ui_lock_in', { vol: 0.5 }); Sound.sfx('charge_full', { vol: 0.5, pitch: 1.3 });
        if (Math.random() < 0.5) this.say(e.i, 'special');
        break;
      }
      case 'skillCd': hud.skillDenied(e.i, e.slot); Sound.sfx('ui_error', { vol: 0.35 }); break;
      case 'skillEmpty': hud.skillDenied(e.i, e.slot); break;
      case 'mineBoom':
        fx.ring(e.x, e.y, 0.2, { size1: 2.2, dur: 0.3, color: '#ffffff', color2: '#9ff3ff', thick: 3 });
        fx.bubbleBurst(e.x, e.y, 24, 1.6); fx.burst(e.x, e.y, 1.4, '#bff8ff'); fx.sparks(e.x, e.y, 18, { colors: ['#ffffff', '#9ff3ff'], sp1: 9 });
        cam.addTrauma(0.45); Sound.sfx('cavitation'); Sound.sfx('shockwave'); break;
      case 'riptide': fx.bubbleBurst(e.x, e.y + 0.6, 20, 1.3); fx.speedLines(0.5, { x: e.x, y: e.y + 1 }); Sound.sfx('dash'); Sound.sfx('bubbles'); break;
      case 'habanero': fx.icons(e.x, e.y + 1.5, 10, 'flame', ['#ff5a2a', '#ffd040'], { sp1: 3, up: 3 }); hud.callout('SPICY!!', e.i, P.red4, true); Sound.sfx('munch'); Sound.sfx('charge_full'); fx.screenFlash(0.2, '#ff5a2a'); break;
      case 'eyes': fx.ring(e.x, e.y + 1.4, 0.1, { size1: 1.6, color: '#c194ff', color2: '#ffffff' }); Sound.sfx('perfect_block', { pitch: 1.4 }); break;
      case 'hermit': fx.dust(e.x, 0, 10, '#d8a05e', 1.2); Sound.sfx('block_heavy'); hud.callout('SUPER ARMOR!', e.i, P.gold3); break;
      case 'decoy': fx.pixels(e.x0, e.y0 + 0.8, 20, { colors: ['#e8dcc0', '#ffffff'], sp1: 3 }); fx.pixels(e.x, e.y + 0.8, 20, { colors: ['#e8dcc0', '#ffffff'], sp1: 3 }); Sound.sfx('dodge'); Sound.sfx('molt_done', { vol: 0.5 }); break;
      case 'eel': {
        const f = F(e.i);
        for (let k = 0; k < 3; k++) fx.ring(f.x, f.y + 0.9, 0.3, { size1: 1.6, dur: 0.3 + k * 0.08, color: '#fff08a', color2: '#9cc4ff', thick: 2 });
        fx.icons(f.x, f.y + 0.9, 14, 'bolt', ['#fff08a', '#ffffff', '#9cc4ff'], { sp1: 6 });
        fx.screenFlash(0.25, '#fff08a'); cam.addTrauma(0.3); Sound.sfx('puru_zap', { pitch: 0.6 }); Sound.sfx('shockwave', { pitch: 1.2 }); break;
      }
      case 'loteria': hud.showCard(e.i, e.card); Sound.sfx('ui_paper'); Sound.sfx(e.card === 1 ? 'demon_whisper' : 'ui_coins', { delay: 0.3 }); break;
      case 'muerte': fx.icons(e.x, e.y, 6, 'skull', ['#ffffff'], { sp1: 4 }); hud.callout('LA MUERTE!', e.i, P.red4, true); Sound.sfx('demon_slash'); break;
      case 'hookHit': if (e.res === 'hit') { hud.callout('GET OVER HERE!', e.i, P.cream4, true); Sound.sfx('anchor_clang'); cam.addTrauma(0.2); } break;
      case 'coralHit': fx.shards(e.x, e.y, 4, ['#ff7a5a', '#ffb48a']); Sound.sfx('crate_hit', { pitch: 1.3, vol: 0.6 }); break;
      case 'huskHit': break;
      case 'huskBoom': fx.shards(e.x, e.y, 24, ['#e8dcc0', '#c8b890', '#ffffff'], { sp1: 8 }); fx.ring(e.x, e.y, 0.2, { size1: 1.6, color: '#e8dcc0' }); Sound.sfx('shell_break'); cam.addTrauma(0.3); break;
      case 'reflect': fx.ring(e.x, e.y, 0.1, { size1: 0.8, color: '#ff6fb0' }); hud.callout('REFLECT!', 0, P.pink3); Sound.sfx('perfect_block', { pitch: 1.6 }); break;
      case 'pinataBoom':
        fx.icons(e.x, e.y, 22, 'confetti', ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a'], { sp1: 8 }); fx.icons(e.x, e.y, 8, 'candy', ['#ff6fb0', '#fff08a'], { sp1: 6 });
        fx.ring(e.x, e.y, 0.2, { size1: 1.8, color: '#ffcf3a', color2: '#ff4f6a', thick: 3 }); fx.burst(e.x, e.y, 1.2, '#ffcf3a');
        cam.addTrauma(0.4); Sound.sfx('pinata_break'); Sound.sfx('shockwave', { vol: 0.5 }); break;
      case 'buffEnd': break;
      // ---- skill draft
      case 'pickStart': Sound.stinger('stinger_round'); Sound.sfx('ui_paper'); this.say(e.who[0] ? 0 : 1, 'select'); break;
      case 'pickMove': Sound.sfx('ui_move', { vol: 0.6 }); break;
      case 'pickDone': Sound.sfx('ui_lock_in'); break;
      case 'pickEnd': break;
      // ---- round flow
      case 'round': { const txt = e.final ? 'FINAL SET' : 'SET ' + e.round; this.hud.announce(txt, { dur: 1.1, sub: e.round > 1 ? 'HEALTH CARRIES OVER!' : '' }); Sound.stinger('stinger_round'); cam.setShot(null); break; }
      case 'fight': this.hud.announce('¡PELEA!', { dur: 0.75, color: P.red4 }); Sound.stinger('stinger_fight'); cam.addTrauma(0.25); Sound.sfx('referee_whistle', { vol: 0.6 }); break;
      case 'roundReset':
        this.fx.clear(); this.cinema.stop();
        for (let i = 0; i < 2; i++) { this.prev[i].x = s.fighters[i].x; this.prev[i].y = s.fighters[i].y; }
        this.views.forEach((v) => v.setDemon(false));
        break;
      case 'qteStart':
        Sound.stinger('stinger_ko'); this.qteLoop = Sound.loopStart?.('qte_tension');
        fx.impactFrame(3); fx.screenFlash(0.4, '#ff4a3a');
        this.cine = { kind: 'qte', t: 0, a: e.a, d: e.d };
        cam.setShot({ target: () => ({ x: (F(e.a).x + F(e.d).x) / 2, y: 1.6 }), zoom: 2.6, zoom2: 3.0, dur: 2.8, speed: 8 });
        this.say(e.a, 'finish');
        break;
      case 'qtePress': if (e.good) { Sound.sfx('qte_press', { vol: 0.6, pitch: e.i === s.qte?.a ? 0.9 : 1.15 }); V[e.i].kickSquash(); cam.addTrauma(0.05); } else Sound.sfx('ui_error', { vol: 0.4 }); break;
      case 'qteEnd':
        Sound.loopStop?.(this.qteLoop); this.qteLoop = null;
        if (e.result === 'escape') {
          fx.ring(e.x, e.y, 0.3, { size1: 3, dur: 0.4, color: '#8ff0e0' }); fx.screenFlash(0.45, '#8ff0e0');
          hud.announce('CLUTCH ESCAPE!', { dur: 1.2, color: P.teal5 }); Sound.sfx('qte_escape'); this.cine = null; cam.setShot(null);
          this.say(e.d, 'escape');
        } else {
          Sound.sfx('qte_win');
          this.cine = { kind: 'finisher', t: 0, a: e.a, d: e.d, char: e.char };
          cam.setShot({ target: () => ({ x: (F(e.a).x + F(e.d).x) / 2, y: 1.5 }), zoom: 3.2, zoom2: 2.0, dur: 2.5, speed: 5 });
        }
        break;
      case 'finisherHit':
        fx.impactFrame(5, { x: e.x, y: e.y }); fx.screenFlash(0.9); cam.addTrauma(1);
        fx.ring(e.x, e.y, 0.3, { size1: 5, dur: 0.6, color: '#ffffff', color2: '#ffd040', thick: 3 }); fx.burst(e.x, e.y, 2, '#ffffff');
        fx.sparks(e.x, e.y, 40, { colors: ['#ffffff', '#fff08a', '#ff6a4a'], sp1: 16 });
        if (e.char === 'brutus') fx.dust(e.x, 0, 40, '#a89070', 2.6);
        if (e.char === 'mimi') fx.icons(e.x, e.y, 24, 'heart', ['#ffffff', '#ff6fb0'], { sp1: 8 });
        Sound.sfx('hit_super'); Sound.sfx('shockwave');
        break;
      case 'ko':
        this.cine = { kind: 'ko', t: 0, d: e.d };
        fx.impactFrame(4, { x: e.x, y: e.y }); fx.screenFlash(0.7);
        cam.addTrauma(0.8);
        this.hud.announce('K.O.!', { dur: 2.2, kind: 'ko', color: P.red4 });
        Sound.stinger('stinger_ko'); Sound.sfx('ko');
        cam.setShot({ target: () => ({ x: F(e.d).x, y: F(e.d).y + 0.8 }), zoom: 2.8, zoom2: 2.2, dur: 3, speed: 4 });
        this.say(e.a >= 0 ? e.a : 1 - e.d, 'ko');
        break;
      case 'timeup': this.hud.announce('TIME!', { dur: 1.4 }); Sound.stinger('stinger_timeup'); break;
      case 'roundWin':
        cam.setShot(null); this.cine = null;
        if (e.draw) this.hud.announce('DRAW', { dur: 1.6 });
        else {
          const name = CHARS[s.fighters[e.winner].char].name;
          if (e.perfect) this.hud.announce('PERFECT!', { dur: 1.8, color: P.gold3, sub: name + ' TAKES THE SET' });
          else this.hud.announce(name + ' WINS THE SET!', { dur: 1.6, sub: 'SET ' + s.round });
          cam.setShot({ target: () => this.views[e.winner].headPos(), zoom: 2.8, dy: -0.4, speed: 3 });
          this.say(e.winner, 'win');
        }
        break;
      case 'matchEnd':
        Sound.stinger('stinger_victory');
        cam.setShot({ target: () => this.views[e.winner].headPos(), zoom: 2.4, zoom2: 3.2, dy: -0.6, dur: 5, speed: 3 });
        if ((this.cfg.players[e.winner].cos?.victory || 'default') === 'fireworks') this.fireworks = 5;
        this.say(e.winner, 'victory');
        break;
      case 'demonStart':
        Sound.stinger('stinger_demon'); Sound.sfx('demon_transform'); Sound.music(null, { fade: 0.3 });
        this.cine = { kind: 'demon', t: 0, i: e.i };
        cam.setShot({ target: () => this.views[e.i].headPos(), zoom: 3.2, zoom2: 4.2, dur: 2.6, speed: 5 });
        fx.shards(e.x, e.y + 1.2, 20, ['#ff8a2a', '#ffffff', '#ff7a1a']);
        Sound.sfx('cone_crack');
        this.say(e.i, 'demon');
        break;
      case 'demonReveal':
        V[e.i].setDemon(true);
        fx.screenFlash(0.8, '#ff0a2a'); fx.impactFrame(5, { x: e.x, y: e.y + 1 });
        fx.pixels(e.x, e.y + 1, 50, { colors: ['#0a0008', '#2a0010', '#400818', '#ff2a3a'], sp1: 5, up: 2, grav: 0.5, size: 3, l1: 1.4 });
        cam.addTrauma(0.7);
        Sound.sfx('demon_whisper');
        break;
      case 'demonBurst':
        fx.ring(e.x, e.y, 0.3, { size1: 5, dur: 0.6, color: '#ff1a3a', color2: '#2a0010', thick: 3 });
        cam.setShot(null); this.cine = null;
        Sound.music('demon', { fade: 0.8 });
        this.hud.callout('DEMON MODE', e.i, P.red4, true);
        break;
      case 'trainingKO': fx.text('KO! (training)', F(e.i).x, 2.5, { color: '#ff6a4a' }); break;
      default: break;
    }
  }

  say(i, kind) {
    const p = this.cfg.players[i];
    if (!p) return;
    const f = this.sim.s.fighters[i];
    const who = p.char === 'bobby' && f.cs?.demon ? 'demon' : p.char;
    const txt = line(who, kind);
    if (!txt) return;
    if (this.speech && this.speech.i === i && this.speech.t < 0.6) return;
    this.speech = { i, text: txt, t: 0, dur: Math.min(3.2, 1.2 + txt.length * 0.045) };
    Sound.voice(who, txt, { speed: 1.1 });
  }
  pan(x) { return clamp(x / 12, -0.8, 0.8); }
  shellColors(i) {
    const c = { jim: ['#3fae5c', '#f0d84a', '#2e9a74'], brutus: ['#e0d2b0', '#3a3028', '#f5ecd8'], bobby: ['#9a6ad8', '#e8d24a', '#553088'], mimi: ['#ffa8cc', '#ffffff', '#ff6fb0'] };
    const f = this.sim.s.fighters[i];
    if (f?.cs?.demon) return ['#1a1024', '#6a0a2a', '#ff1a3a'];
    return c[f?.char] || c.jim;
  }

  // ---------------------------------------------------------- per-frame visuals
  updateVisuals(dt) {
    const s = this.sim.s;
    const slow = s.slow > 0 ? 0.34 : 1;
    const frozen = s.pause > 0;
    const vdt = dt * (frozen ? 0.06 : slow);
    this.vdt = vdt;
    Sound.slowmo(s.slow > 0 ? 0.45 : 1);
    const alpha = frozen ? 1 : this.alpha;
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i];
      this.views[i].update(vdt, f, this.prev[i], alpha, s);
      const v = this.views[i];
      if (v.demon && Math.random() < 0.5) { const hp = v.headPos(); this.fx.pixels(hp.x + f.face * 0.15, hp.y + 0.05, 1, { colors: ['#ff1a3a', '#8a0a1a'], sp0: 0.2, sp1: 0.6, up: 0.2, grav: 0, l0: 0.2, l1: 0.4 }); }
      if (f.st === 'molt' && Math.random() < 0.4) this.fx.icons(f.x + (Math.random() - 0.5) * 0.8, f.y + 0.3 + Math.random() * 1.4, 1, 'star', ['#fff0b0'], { sp1: 0.5, up: 1, grav: 0.5 });
      if (f.cs?.fireT > 0 && Math.random() < 0.7) this.fx.pixels(f.x + (Math.random() - 0.5) * 0.6, f.y + 0.2 + Math.random() * 1.5, 1, { colors: ['#ffd040', '#ff8a2a', '#e8401c'], sp0: 0.2, sp1: 0.8, up: 2.5, grav: 1, l0: 0.25, l1: 0.5, size: 2 });
      if (f.cs?.eyesT > 0 && Math.random() < 0.3) { const hp = v.headPos(); this.fx.pixels(hp.x, hp.y + 0.3, 1, { colors: ['#c194ff', '#ffffff'], sp1: 1, up: 0.5, grav: 0 }); }
      if (f.cs?.armorT > 0 && Math.random() < 0.2) this.fx.pixels(f.x, f.y + 0.9, 1, { colors: ['#ffd040'], sp1: 1.5, up: 0, grav: 0 });
      if (f.wob > 0 && Math.random() < 0.08) { const hp = v.headPos(); this.fx.icons(hp.x, hp.y + 0.5, 1, 'spiral', ['#c194ff'], { sp1: 0.4, up: 0.8, grav: 0 }); }
    }
    this.stage?.update?.(vdt, s);
    this.fx.update(vdt);
    if (this.cine) this.cine.t += dt;
    if (this.introShot && (s.phase !== 'intro' || this.cam.shot?.t > 4.2)) { this.introShot = false; if (!this.cine) this.cam.setShot(null); }
    if (this.ultShot > 0) { this.ultShot -= dt; if (this.ultShot <= 0 && !this.cine && s.phase !== 'ucine') this.cam.setShot(null); }
    if (this.fireworks > 0) { this.fireworks -= dt; if (Math.random() < dt * 5) { const x = (Math.random() - 0.5) * 10, y = 4 + Math.random() * 3; this.fx.sparks(x, y, 40, { colors: ['#ff4f6a', '#4fd0ff', '#ffcf3a', '#6aff8a'], sp0: 3, sp1: 7 }); this.fx.ring(x, y, 0.1, { size1: 1.5, color: '#ffcf3a' }); Sound.sfx('shockwave', { vol: 0.3, pitch: 1.5 }); } }
    if (this.speech) { this.speech.t += dt; if (this.speech.t > this.speech.dur) this.speech = null; }
    if (this.lastHitInfo) { this.lastHitInfo.t -= dt; if (this.lastHitInfo.t <= 0) this.lastHitInfo = null; }
    // darkness for Bobby's demon mode
    const anyDemon = s.fighters.some((f) => f.cs?.demon);
    const targetDark = this.cine?.kind === 'demon' ? Math.min(0.9, this.cine.t / 0.6) : anyDemon ? 0.45 : 0;
    this.dark += (targetDark - this.dark) * Math.min(1, dt * 3);
    try { this.stage?.setDark?.(this.dark); } catch (_) { /* optional */ }
    const wantLetter = (this.cine && this.cine.kind !== 'ko') || s.phase === 'intro' || s.phase === 'matchEnd' || s.pause > 0 || s.phase === 'ucine' ? 1 : 0;
    this.letter += (wantLetter - this.letter) * Math.min(1, dt * 6);
    this.redTint += ((s.phase === 'qte' ? 1 : 0) - this.redTint) * Math.min(1, dt * 6);
    this.cam.aspect = this.game.display.aspect;
    this.camOut = this.cam.update(dt, { a: s.fighters[0], b: s.fighters[1] });
    this.hud.update(dt, this.sim);
  }

  // world rendering (called by the game after update)
  render(d, dt) {
    if (!this.ready) { d.clearScreen(); return; }
    const s = this.sim.s;
    if (s.phase === 'ucine' && this.cinema.active) {
      this.cinema.render(d, this.vdt ?? dt, s.ucine, this.time);
      d.present();
      return;
    }
    const cam = this.camOut || { x: 0, y: 3, zoom: 1.4 };
    const g = d.begin(cam, '#071820');
    const t = this.time;
    if (this.fx.impact > 0) {
      // anime impact frame: inverted silhouettes over rays
      const black = Math.floor(this.fx.impact) % 2 === 1;
      g.fillStyle = black ? '#000000' : '#ffffff'; g.fillRect(0, 0, d.vw, d.vh);
      for (const v of this.views) v.drawSilhouette(d, black ? '#ffffff' : '#000000');
      d.present();
      return;
    }
    if (this.stage) { this.stage.drawBack(d, t); this.stage.drawProps(d, s, this.alpha, t); }
    else this.fallbackBack(d);
    for (const v of this.views) v.drawShadow(d);
    // the attacking fighter draws on top
    const order = [0, 1].sort((a, b) => this.zRank(s.fighters[a]) - this.zRank(s.fighters[b]));
    for (const i of order) this.views[i].draw(d);
    drawProjectiles(d, s, this.views, t, this.fx);
    this.fx.draw(d);
    if (this.stage) this.stage.drawFront(d, t);
    if (this.dark > 0.02) d.dither('#000000', this.dark * 0.8);
    if (this.cine?.kind === 'demon') for (const v of this.views) if (v.i === this.cine.i) v.draw(d);
    if (this.redTint > 0.02) d.dither('#5a0000', this.redTint * 0.35);
    this.fx.drawScreen(d);
    if (this.paused) d.dither('#04121a', 0.45);
    d.present();
  }
  zRank(f) { return f.st === 'attack' || f.st === 'skill' || f.st === 'throwing' || f.st === 'finisher' ? 2 : f.st === 'ko' || f.st === 'knockdown' ? 0 : 1; }
  fallbackBack(d) {
    const g = d.g;
    g.fillStyle = '#0b2a3a'; g.fillRect(0, 0, d.vw, d.vh);
    g.fillStyle = '#3a2a22'; g.fillRect(0, d.by(0), d.vw, d.vh);
    g.fillStyle = '#6a4a30'; g.fillRect(0, d.by(0), d.vw, 2);
    g.fillStyle = '#5a6272';
    for (const p of this.sim.s.plats) if (!p.broken) g.fillRect(d.bx(p.x0), d.by(p.y), d.bx(p.x1) - d.bx(p.x0), 6);
  }

  // ---------------------------------------------------------- pause + training
  updatePause() {
    const inp = this.game.input;
    const items = this.pauseItems();
    if (inp.menu('up')) { this.pauseSel = (this.pauseSel + items.length - 1) % items.length; Sound.sfx('ui_move'); }
    if (inp.menu('down')) { this.pauseSel = (this.pauseSel + 1) % items.length; Sound.sfx('ui_move'); }
    if (inp.menu('confirm')) { Sound.sfx('ui_select'); items[this.pauseSel].fn(); }
    if (inp.menu('back') && !inp.keyPressed('Escape')) { this.paused = false; Sound.muffle(false); }
  }
  pauseItems() {
    const items = [{ label: 'RESUME', fn: () => { this.paused = false; Sound.muffle(false); } }];
    if (this.cfg.mode !== 'online') items.push({ label: 'RESTART', fn: () => { this.paused = false; this.game.setScreen(new MatchScreen({ ...this.cfg, seed: undefined, skipIntro: true }), { kind: 'planks' }); } });
    items.push({ label: this.showMoves ? 'HIDE MOVE LIST' : 'MOVE LIST', fn: () => { this.showMoves = !this.showMoves; } });
    items.push({ label: 'QUIT TO MENU', fn: () => { this.paused = false; this.cfg.onQuit?.(); } });
    return items;
  }
  trainingKeys() {
    const inp = this.game.input;
    const order = ['stand', 'crouch', 'jump', 'block', 'block-low', 'cpu'];
    if (inp.keyPressed('Digit4')) { this.trainingOpts.dummy = order[(order.indexOf(this.trainingOpts.dummy) + 1) % order.length]; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit5')) { this.trainingOpts.infiniteMeter = !this.trainingOpts.infiniteMeter; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit6')) { this.trainingOpts.showInputs = !this.trainingOpts.showInputs; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit7')) { const s = this.sim.s; for (const f of s.fighters) { f.hp = f.hpMax; f.shell = f.shellMax; f.moltCd = 0; for (const k of f.sk) k.cd = 0; f.x = f.i === 0 ? -2.5 : 2.5; f.y = 0; f.vx = f.vy = 0; f.st = 'idle'; } Sound.sfx('ui_select'); }
    if (inp.keyPressed('Digit8')) { this.showMoves = !this.showMoves; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit9')) { const f = this.sim.s.fighters[0]; f.sk = []; this.sim.startPick([true, false], 'fight'); Sound.sfx('ui_tab'); }
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    const s = this.sim.s;
    this.cfg.onEnd?.({ winner: s.matchWinner, stats: s.fighters.map((f) => f.stats), fighters: s.fighters.map((f) => ({ char: f.char, hp: f.hp, hpMax: f.hpMax, skills: f.sk.map((k) => k.id) })), wins: s.wins, cfg: this.cfg });
  }

  // ---------------------------------------------------------- UI
  drawUI(ui) {
    if (!this.ready) { ui.dim(1, P.deep0); ui.text('LOADING...', ui.w / 2, ui.h / 2, { font: 'big', align: 'center' }); return; }
    const s = this.sim.s, d = this.game.display;
    const proj = (x, y) => d.toUI(x, y, ui);
    // letterbox bars (cinematic)
    if (this.letter > 0.01) { const h = Math.round(ui.h * 0.085 * this.letter); ui.rect(0, 0, ui.w, h, P.black); ui.rect(0, ui.h - h, ui.w, h, P.black); }
    const b = this.game.save.settings.bindings;
    const hideBars = s.phase === 'intro' || (this.cine && (this.cine.kind === 'demon' || this.cine.kind === 'finisher'));
    this.hud.draw(ui, this.sim, {
      texts: s.phase === 'ucine' ? [] : this.fx.texts, project: proj, hideBars,
      keyHints: this.keys.map((k) => (k ? `${k.light}+${k.heavy}` : '')),
      qteKeys: this.qteKeyNames(),
    });
    if (s.phase === 'ucine' && s.ucine) {
      const name = ULT_NAMES[s.ucine.char] || 'ULTIMATE';
      const k = clamp(s.ucine.t / 12, 0, 1);
      if (s.ucine.t < 60) ui.text(name, Math.round(ui.w * (0.5 + (1 - ease.outExpo(k)) * 0.6)), Math.round(ui.h * 0.15), { font: 'huge', align: 'center', color: P.gold3, shadow: P.red1, wave: 1 });
    }
    if (this.speech && s.phase !== 'ucine') {
      const hp = this.views[this.speech.i].headPos();
      const p = proj(hp.x, hp.y + 0.55);
      if (p) this.drawSpeech(ui, p.x, p.y, this.speech);
    }
    if (s.phase === 'intro') this.drawIntro(ui);
    if (this.cine?.kind === 'demon' && this.cine.t > 1.2) ui.text('...', ui.w / 2, ui.h * 0.25, { font: 'huge', align: 'center', color: P.red4, alpha: Math.min(1, this.cine.t - 1.2) });
    if (this.cfg.mode === 'training' && s.phase !== 'ucine') this.drawTraining(ui);
    if (this.cfg.mode === 'online' && this.cfg.net) this.drawNet(ui);
    if (!this.paused) this.game.touch.draw(ui);
    if (this.showMoves) this.drawMoveList(ui);
    if (this.paused) this.drawPause(ui);
  }
  qteKeyNames() {
    const b = this.game.save.settings.bindings;
    const mk = (p) => [keyLabel(b[p].light[0]), keyLabel(b[p].heavy[0]), keyLabel(b[p].block[0])];
    if (this.cfg.mode === 'local') return [mk('p1'), mk('p2')];
    return [mk('p1'), mk('p1')];
  }
  drawSpeech(ui, x, y, sp) {
    const lines = ui.wrap(sp.text.slice(0, Math.floor(sp.t * 40)), 120, 'body');
    if (!lines.length || !lines[0]) return;
    const w = Math.max(...lines.map((l) => ui.measure(l, 'body'))) + 10, h = lines.length * 9 + 7;
    const bx = Math.round(Math.max(4, Math.min(ui.w - w - 4, x - w / 2))), by = Math.round(Math.max(52, y - h - 8));
    const a = sp.t > sp.dur - 0.25 ? (sp.dur - sp.t) / 0.25 : 1;
    ui.g.globalAlpha = a;
    ui.rect(bx - 1, by - 1, w + 2, h + 2, P.ink); ui.rect(bx, by, w, h, P.cream3); ui.rect(bx, by + h - 2, w, 2, P.cream1);
    ui.rect(Math.max(bx + 4, Math.min(bx + w - 8, x - 2)), by + h, 4, 3, P.cream3);
    lines.forEach((l, i) => ui.text(l, bx + 5, by + 4 + i * 9, { font: 'body', color: P.ink, outline: null }));
    ui.g.globalAlpha = 1;
  }
  drawIntro(ui) {
    const s = this.sim.s, t = s.pt / 60, p = this.cfg.players, W = ui.w;
    const a = Math.min(1, t * 2);
    const slide = ease.outBack(Math.min(1, t * 1.5));
    for (let i = 0; i < 2; i++) {
      const right = i === 1;
      const w = 150, h = 44;
      const x = right ? W - w - 10 + Math.round((1 - slide) * 200) : 10 - Math.round((1 - slide) * 200);
      const y = ui.h - h - 30;
      ui.panel(x, y, w, h, { seed: 40 + i, tone: right ? 'blue' : 'red', plankSize: 15, barnacles: 3 });
      ui.text(CHARS[p[i].char].name, x + w / 2, y + 6, { font: 'big', align: 'center', color: P.cream4 });
      ui.text(CHARS[p[i].char].title, x + w / 2, y + 30, { font: 'body', align: 'center', color: P.cream2 });
    }
    ui.text('VS', W / 2, ui.h - 56, { font: 'huge', align: 'center', color: P.gold3, alpha: a, shadow: P.ink });
    ui.text(this.cfg.mode === 'online' ? 'PRESS LIGHT (BOTH) TO SKIP' : 'PRESS LIGHT TO SKIP', W / 2, ui.h - 14, { font: 'label', align: 'center', color: P.cream2, alpha: 0.7 });
    ui.text(this.stageDef?.name || '', W / 2, 40, { font: 'big', align: 'center', color: P.cream3, alpha: a, shadow: P.ink });
  }
  drawTraining(ui) {
    const o = this.trainingOpts;
    const x = 8, y = 76;
    ui.panel(x, y, 132, 82, { seed: 77, tone: 'dark', plankSize: 12, barnacles: 1 });
    ui.text('TRAINING TANK', x + 66, y + 5, { font: 'labelB', align: 'center', color: P.gold3 });
    const rows = [`[4] DUMMY: ${o.dummy.toUpperCase()}`, `[5] INF METER: ${o.infiniteMeter ? 'ON' : 'OFF'}`, `[6] INPUTS: ${o.showInputs ? 'ON' : 'OFF'}`, '[7] RESET + COOLDOWNS', '[8] MOVE LIST', '[9] RE-DRAFT SKILLS'];
    rows.forEach((r, i) => ui.text(r, x + 6, y + 18 + i * 10, { font: 'body', color: P.cream3 }));
    if (o.showInputs) {
      let yy = y + 90, last = -1, n = 0;
      for (const b of this.inputLog[0]) {
        if (b === last) continue; last = b;
        if (n++ > 9) break;
        const v = (b & 4 ? 1 : 0) - (b & 8 ? 1 : 0), h = (b & 2 ? 1 : 0) - (b & 1 ? 1 : 0);
        const dir = ['DB', 'D', 'DF', 'B', '', 'F', 'UB', 'U', 'UF'][(v + 1) * 3 + (h + 1)];
        const parts = [dir];
        if (b & 16) parts.push('L'); if (b & 32) parts.push('H'); if (b & 64) parts.push('B');
        if (b & 128) parts.push('S1'); if (b & 256) parts.push('S2'); if (b & 512) parts.push('S3');
        ui.text(parts.filter(Boolean).join(' ') || '-', x + 6, yy, { font: 'label', color: P.teal5 }); yy += 9;
      }
    }
    if (this.lastHitInfo) ui.text(`${(this.lastHitInfo.mv || '').toUpperCase()} ${this.lastHitInfo.dmg} DMG  COMBO ${this.lastHitInfo.combo}`, ui.w / 2, ui.h - 40, { font: 'labelB', align: 'center', color: P.gold3 });
  }
  drawNet(ui) {
    const net = this.cfg.net;
    const ping = Math.round(net.rtt || 0);
    ui.text(`PING ${ping}ms  DELAY ${net.delay}f`, ui.w / 2, ui.h - 8, { font: 'label', align: 'center', color: ping < 80 ? P.green3 : ping < 150 ? P.gold3 : P.red4 });
    if (net.stalled > 0.25) ui.text('WAITING FOR OPPONENT...', ui.w / 2, ui.h / 2 + 40, { font: 'labelB', align: 'center', color: P.cream3 });
    if (net.desync) ui.text('RESYNCING...', ui.w / 2, ui.h / 2 + 52, { font: 'label', align: 'center', color: P.orange3 });
  }
  drawPause(ui) {
    ui.dim(0.45);
    const items = this.pauseItems();
    const w = 170, h = 40 + items.length * 20;
    const x = this.showMoves ? ui.w - w - 10 : Math.floor(ui.w / 2 - w / 2), y = Math.floor(ui.h / 2 - h / 2);
    ui.hangingSign(x, y, w, h, { seed: 9 });
    ui.text('PAUSED', x + w / 2, y + 8, { font: 'big', align: 'center', color: P.gold3 });
    items.forEach((it, i) => {
      const r = ui.plank(x + 20, y + 34 + i * 20, w - 40, 16, it.label, { selected: i === this.pauseSel, seed: i + 30 });
      if (r.hover && ui.mouse.moved) this.pauseSel = i;
      if (r.clicked) { Sound.sfx('ui_select'); it.fn(); }
    });
  }
  drawMoveList(ui) {
    const ch = this.cfg.players[0].char;
    const b = this.game.save.settings.bindings.p1;
    const K = (a) => keyLabel((b[a] || [])[0]);
    const w = Math.min(ui.w - (this.paused ? 200 : 40), 340), h = Math.min(ui.h - 30, 250);
    const x = this.paused ? 10 : Math.floor(ui.w / 2 - w / 2), y = Math.floor(ui.h / 2 - h / 2);
    ui.panel(x, y, w, h, { seed: 61, tone: 'dark', plankSize: 16, barnacles: 3 });
    ui.text(CHARS[ch].name + ' - MOVE LIST', x + w / 2, y + 6, { font: 'labelB', align: 'center', color: P.gold3 });
    const list = MOVELIST(ch, { L: K('light'), H: K('heavy'), B: K('block'), F: 'FWD', BK: 'BACK', D: K('down'), U: K('up'), S: [K('skill1'), K('skill2'), K('skill3')] });
    list.forEach((row, i) => {
      const yy = y + 20 + i * 10;
      if (yy > y + h - 12) return;
      ui.text(row[0], x + 8, yy, { font: 'body', color: P.cream3 });
      ui.text(row[1], x + w - 8, yy, { font: 'body', color: P.teal5, align: 'right' });
    });
  }
}

export function MOVELIST(ch, k) {
  const common = [
    ['Skills (pick 1 at start, +1 when you fall)', `${k.S.join(' / ')}`],
    ['Jab / chain', `${k.L}, ${k.L}`], ['Light-Light-Heavy finisher', `${k.L}, ${k.L}, ${k.H}`], ['Jab barrage', `${k.F} + ${k.L}`], ['Low poke', `${k.D} + ${k.L}`],
    ['Heavy (hold to charge spring punch)', `${k.H} (hold)`], ['Uppercut / launcher', `${k.D} + ${k.H}`], ['Aerial light / heavy', `air ${k.L} / ${k.H}`],
    ['Block (crouch-block lows)', `${k.B} (+${k.D})`], ['Perfect block', `${k.B} right before impact`], ['Dodge roll', `${k.B} + ${k.F}/${k.BK}`], ['Throw (tech: same)', `${k.L} + ${k.B}`],
    ['Molt (regrow shell, 3s, vulnerable)', `hold ${k.B} + ${k.H}`], ['Taunt', `${k.B} + ${k.U}`], ['Dash / backdash', `double-tap ${k.F}/${k.BK}`], ['Drop through platform', `${k.D} + ${k.U}`],
    ['ULTIMATE (full meter) - hit the prompts!', `${k.L} + ${k.H}`],
  ];
  const sp = {
    jim: [['Cavitation Cannon', `${k.F} + ${k.H}`], ['Mirage Stance (counter)', `${k.BK} + ${k.H}`]],
    brutus: [['Spear Snag (long grab)', `${k.F} + ${k.H}`], ['Snack Time (eat a snail, heal)', `${k.BK} + ${k.H}`], ['Body Slam', `air ${k.H}`]],
    bobby: [['Junk Toss (random!)', `${k.F} + ${k.H}`], ['Cone Hide (then ${k.H} to pop)', `${k.BK} + ${k.H}`], ['Below half HP...', '???']],
    mimi: [['Throw / recall Puru', `${k.F} + ${k.H}`], ['Bubble Trap', `${k.BK} + ${k.H}`], ['Puru parachute', `hold ${k.U} in air`]],
  };
  return [...(sp[ch] || []), ...common];
}
