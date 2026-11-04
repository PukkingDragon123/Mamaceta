// The fight: runs the deterministic sim at 60Hz (local, vs CPU, training or online lockstep),
// renders fighters + stage, turns sim events into juicy feedback, and draws the HUD.
import * as THREE from 'three';
import { Sim } from '../sim/sim.js';
import { AI } from '../sim/ai.js';
import { CHARS, PHYS, ULT_NAMES, moveFor } from '../sim/data.js';
import { STAGES } from '../sim/stages.js';
import { Particles } from '../render/particles.js';
import { FX } from '../render/fx.js';
import { CameraDirector } from '../render/camera.js';
import { FighterView } from '../render/fighterView.js';
import { portrait } from '../render/portraits.js';
import { HUD, keyHintsFor } from '../ui/hud.js';
import { P, PLAYER_COLORS } from '../ui/palette.js';
import { Sound } from '../core/sound.js';
import { keyLabel } from '../core/input.js';
import { ease, clamp } from '../core/math.js';
import { LINES, line } from '../data/dialogue.js';
import { CantinaView } from '../render/stages/cantina.js';
import { RustPitView } from '../render/stages/rustpit.js';
import { MangaPanels } from '../render/panels.js';

const STEP = 1 / 60;
const _v = new THREE.Vector3();

async function stageView(id, scene, renderer, particles, fx, sim) {
  if (id === 'cantina') return new CantinaView(scene, renderer, particles, fx, sim);
  return new RustPitView(scene, renderer, particles, fx, sim);
}

export class MatchScreen {
  constructor(cfg) {
    this.cfg = cfg;
    this.ready = false;
  }

  async enter() {
    const g = this.game, cfg = this.cfg;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, g.renderer.aspect, 0.1, 220);
    this.particles = new Particles(this.scene);
    this.fx = new FX(this.scene, g.renderer, this.particles, this.camera);
    const simCfg = {
      p: cfg.players.map((p) => ({ char: p.char, cos: p.cos })),
      stage: cfg.stage, seed: cfg.seed ?? Math.floor(Math.random() * 1e9), rounds: cfg.rounds || 3,
      roundTime: cfg.roundTime || 99, qte: cfg.qte !== false, training: cfg.mode === 'training', net: cfg.mode === 'online',
      skipIntro: cfg.skipIntro,
    };
    this.sim = new Sim(simCfg);
    this.stage = await stageView(cfg.stage, this.scene, g.renderer, this.particles, this.fx, this.sim);
    this.views = cfg.players.map((p, i) => new FighterView(this.scene, i, p.char, p.cos || {}, this.particles));
    this.prev = this.sim.s.fighters.map((f) => ({ x: f.x, y: f.y }));
    const st = STAGES[cfg.stage] || STAGES.rustpit;
    this.director = new CameraDirector(this.camera, { left: st.left, right: st.right });
    this.director.shakeScale = g.save.settings.shake ?? 1;
    this.ai = cfg.players.map((p, i) => (p.cpu ? new AI(i, p.cpu, (simCfg.seed + i * 99) | 0) : null));
    this.acc = 0;
    this.time = 0;
    this.paused = false; this.pauseSel = 0;
    this.hud = new HUD(g, {
      names: cfg.players.map((p) => p.name),
      portraits: cfg.players.map((p, i) => portrait(g.renderer, p.char, p.cos || {}, { size: 36, flip: false })),
      demonPortraits: cfg.players.map((p) => (p.char === 'bobby' ? portrait(g.renderer, 'bobby', p.cos || {}, { size: 36, demon: true }) : null)),
      mode: cfg.mode,
    });
    g.input.mode = (cfg.mode === 'local') ? 'versus' : 'solo';
    g.touch.active = true;
    g.input.clearLatched();
    this.landed = [false, false]; this.jumped = [false, false];
    this.slowmo = 1;
    this.panels = new MangaPanels();
    this.darkCur = 0;
    this.cine = null;
    this.trainingOpts = { dummy: 'stand', showInputs: true, showHit: true, infiniteMeter: false, page: 0 };
    this.inputLog = [[], []];
    this.netWait = 0;
    this.lastHitInfo = null;
    this.musicTrack = st.music || 'rustpit';
    if (cfg.net) {
      cfg.net.bindSim(this.sim);
      cfg.net.onDisconnect = (msg) => { this.netLost = msg || 'Opponent disconnected'; };
      cfg.net.onMessage = (m) => { if (m.t === 'bye') this.netLost = 'Opponent left the match'; };
    }
    Sound.music(cfg.mode === 'training' ? 'training' : this.musicTrack, { fade: 1.5 });
    Sound.muffle(false);
    this.endTimer = 0;
    this.ready = true;
    // intro camera sweep
    if (!cfg.skipIntro && cfg.mode !== 'training') this.introShot();
  }

  exit() {
    if (this.keepAlive) { this.keepAlive = false; return; }
    for (const v of this.views || []) v.dispose();
    this.stage?.dispose();
    this.particles?.dispose();
    // free GPU memory held by this arena's geometry
    this.scene?.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    Sound.slowmo(1);
    Sound.muffle(false);
    this.game.input.mode = 'solo';
    this.game.touch.active = false;
  }

  introShot() {
    const d = this.director;
    d.setShot({ type: 'focus', target: new THREE.Vector3(0, 2.2, 0), offset: [-9, 5, 12], offset2: [6, 2.5, 9], lookOffset: [0, 0, -2], fov: 40, dur: 4.2, speed: 2, cut: true });
    this.camera.position.set(-9, 7, 12);
    this.director.pos.set(-9, 7, 12);
    this.introT = 0;
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
    const o = this.trainingOpts;
    const s = this.sim.s, f = s.fighters[1];
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
    if (this.paused) { this.updatePause(); this.renderViews(0, 1); return; }
    if (cfg.mode === 'training' && active) this.trainingKeys();
    // fixed-step simulation (?simspeed=N speeds things up for automated tests)
    const speed = this.simSpeed ?? (this.simSpeed = +(new URLSearchParams(location.search).get('simspeed') || 1));
    this.acc += dt * (cfg.mode === 'online' ? 1 : speed);
    let steps = 0;
    const maxSteps = 5 * Math.max(1, speed);
    while (this.acc >= STEP && steps < maxSteps) {
      if (cfg.mode === 'online') {
        const ok = this.netStep();
        if (!ok) { this.acc = Math.min(this.acc, STEP); break; }
      } else {
        this.stepSim(this.localInputs());
      }
      this.acc -= STEP; steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    const alpha = clamp(this.acc / STEP, 0, 1);
    this.renderViews(dt, alpha);
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
    const local = this.game.input.sample(0);
    return net.stepLockstep(local, (inputs) => this.stepSim(inputs));
  }

  stepSim(inputs) {
    const s = this.sim.s;
    for (let i = 0; i < 2; i++) { this.prev[i].x = s.fighters[i].x; this.prev[i].y = s.fighters[i].y; }
    if (this.cfg.mode === 'training') {
      for (const f of s.fighters) { if (this.trainingOpts.infiniteMeter) f.meter = PHYS.METER_MAX; if (f.st === 'idle' && f.combo === 0) { f.hp = Math.min(f.hpMax, f.hp + 6); } }
      this.inputLog[0].unshift(inputs[0]); if (this.inputLog[0].length > 40) this.inputLog[0].pop();
    }
    this.sim.step(inputs);
    for (const e of this.sim.consumeEvents()) this.onEvent(e);
  }

  // ---------------------------------------------------------- events -> feedback
  onEvent(e) {
    const fx = this.fx, hud = this.hud, s = this.sim.s, d = this.director;
    const V = this.views;
    const cos = (i) => this.cfg.players[i]?.cos || {};
    this.stage.onEvent?.(e);
    switch (e.t) {
      case 'hit': {
        const power = e.ult ? 2 : e.heavy ? 1.6 : e.dmg > 40 ? 1.1 : 0.7;
        fx.hitEffect(e.x, e.y, power, e.kb || 1, e.a >= 0 ? cos(e.a).hitfx || 'classic' : 'classic');
        if (e.d >= 0) V[e.d].flashHit(0xffffff, 1);
        d.addTrauma(e.heavy ? 0.42 : 0.18 + Math.min(0.2, e.dmg / 400));
        d.kick((e.kb || 1) * 0.12, 0.03, e.heavy ? 1.2 : 0.6);
        if (e.heavy) { d.zoomPunch(0.5); fx.waveAt(_v.set(e.x, e.y, 0), 0.6); fx.ca = 0.35; }
        if (e.ult && !e.seq) { fx.impactFrame(1); fx.screenFlash(0.6); }
        Sound.sfx(e.ult ? 'hit_super' : e.heavy ? 'hit_heavy' : e.dmg > 35 ? 'hit_medium' : 'hit_light', { pitch: 0.95 + Math.random() * 0.1, pan: this.pan(e.x) });
        if (e.counter) { hud.callout('COUNTER!', e.a, P.red4, true); Sound.sfx('counter'); fx.text('COUNTER!', e.x, e.y + 0.8, { color: '#ff6a4a' }); }
        else if (e.punish) hud.callout('PUNISH!', e.a, P.orange3);
        if (e.a >= 0 && s.fighters[e.d]) hud.comboHit(e.a, e.combo, e.dmg);
        if (e.sting) { fx.burst(e.x, e.y, { n: 8, spr: 'bolt', colors: [0xffb6d9, 0xffffff], glow: true, sp1: 4 }); Sound.sfx('puru_zap'); }
        if (e.lethal) { fx.impactFrame(1); }
        if (this.cfg.mode === 'training' && e.a === 0) this.lastHitInfo = { mv: e.mv, dmg: e.dmg, combo: e.combo, t: 2 };
        break;
      }
      case 'block':
        fx.sparks(e.x, e.y, e.cone ? 8 : 10, { colors: [0x9ff3ff, 0xffffff, 0x49c2bd], sp1: 6, dir: -(e.kb || 1) });
        fx.ring(e.x, e.y, 0.6, { size1: 0.9, dur: 0.15, color: 0x9ff3ff });
        if (e.d >= 0) V[e.d].flashHit(0x9ff3ff, 0.5);
        d.addTrauma(e.heavy ? 0.2 : 0.08);
        Sound.sfx(e.cone ? 'cone_bonk' : e.heavy ? 'block_heavy' : 'block', { pan: this.pan(e.x) });
        if (e.shell !== undefined && e.shell < 0.34) fx.shards(e.x, e.y, 4, this.shellColors(e.d), { s1: 0.12 });
        break;
      case 'perfect':
        fx.screenFlash(0.35, 0xbff8ff);
        fx.ring(e.x, e.y, 0.8, { size1: 2.6, dur: 0.3, color: 0xbff8ff, thick: 0.15 });
        fx.sparks(e.x, e.y, 22, { colors: [0xffffff, 0xbff8ff], sp1: 10, spr: 'sparkle', frame: 2 });
        V[e.d].flashHit(0xbff8ff, 1);
        hud.callout('PERFECT BLOCK!', e.d, P.teal5, true);
        fx.text('PERFECT!', e.x, e.y + 0.9, { color: '#8ff0e0' });
        Sound.sfx('perfect_block');
        d.zoomPunch(0.4);
        break;
      case 'shellCrack': fx.shards(e.x, e.y, 6, this.shellColors(e.i), {}); Sound.sfx('shell_crack', { pan: this.pan(e.x) }); break;
      case 'shellBreak':
        fx.shards(e.x, e.y, 46, this.shellColors(e.i), { sp1: 9, s1: 0.24, life: 2.2 });
        fx.burst(e.x, e.y, { n: 16, spr: 'shard', colors: this.shellColors(e.i), sp1: 10, frames: 4, grav: -12, floor: 0.03, bounce: 0.4, life1: 1.5, fade: false });
        fx.ring(e.x, e.y, 0.5, { size1: 3.2, dur: 0.4, color: 0xffd090, thick: 0.18 });
        fx.screenFlash(0.4); fx.impactFrame(1);
        fx.waveAt(_v.set(e.x, e.y, 0), 1.2, 1.6);
        d.addTrauma(0.6); d.zoomPunch(1);
        hud.callout('SHELL BREAK!', e.by >= 0 ? e.by : 1 - e.i, P.orange3, true);
        hud.announce('SHELL BREAK!', { dur: 0.9, color: P.orange3 });
        Sound.sfx('shell_break'); Sound.sfx('dizzy', { delay: 0.3 });
        break;
      case 'cavSpawn': fx.bubble(e.x, e.y, e.r * 0.85, e.delay, e.dark, e.id); Sound.sfx('projectile_bubble', { vol: 0.35, pitch: 1.6 }); break;
      case 'cavPop': {
        fx.popBubble(e.id);
        const big = e.big ? 1.6 : 1;
        fx.screenFlash(0.12 * big, e.dark ? 0xd080ff : 0xeaffff);
        fx.ring(e.x, e.y, 0.7, { size1: (e.r || 0.6) * 3.4 * big, dur: 0.3, color: e.dark ? 0xc040ff : 0xbff8ff, thick: 0.14 });
        fx.sparks(e.x, e.y, 14, { colors: e.dark ? [0xd080ff, 0xff4080] : [0xffffff, 0xbff8ff, 0xfff8c0], sp1: 7 * big, spr: 'spark' });
        fx.bubbleBurst(e.x, e.y, 10, 1.2 * big);
        fx.lightPop(e.x, e.y, e.dark ? 0xc040ff : 0xd8ffff, 40 * big, 0.12);
        fx.waveAt(_v.set(e.x, e.y, 0), 0.9 * big, 1.5);
        d.addTrauma(0.22 * big);
        Sound.sfx('cavitation', { pan: this.pan(e.x) }); if (e.big) Sound.sfx('shockwave', { vol: 0.6 });
        break;
      }
      case 'whoosh': Sound.sfx(e.sfx || 'whiff_light', { vol: 0.6, pitch: 0.95 + Math.random() * 0.1 }); break;
      case 'moveName': if (this.cfg.mode !== 'training' || true) hud.callout(e.name, e.i, PLAYER_COLORS[e.i].light); if (Math.random() < 0.6) this.say(e.i, 'special'); break;
      case 'jump': this.jumped[e.i] = true; fx.dust(e.x, e.y, 4, 0xa89070, 0.6); Sound.sfx('jump', { vol: 0.5 }); break;
      case 'airjump': this.jumped[e.i] = true; fx.bubbleBurst(e.x, e.y + 0.3, 8, 0.8); Sound.sfx('double_jump', { vol: 0.6 }); break;
      case 'land': this.landed[e.i] = true; fx.dust(e.x, e.y, e.heavy ? 10 : 5, 0xa89070, e.heavy ? 1.3 : 0.8); Sound.sfx(e.heavy ? 'land_heavy' : 'land', { vol: 0.5 }); if (e.heavy) d.addTrauma(0.08); break;
      case 'step': if (Math.random() < 0.5) fx.dust(e.x, 0, 1, 0xa89070, 0.3); Sound.sfx('step', { vol: 0.18, pitch: 0.9 + Math.random() * 0.3 }); break;
      case 'dash': fx.dust(e.x, 0, 6, 0xa89070, 1); fx.bubbleBurst(e.x - e.dir * 0.4, 0.8, 5, 0.6); Sound.sfx('dash', { vol: 0.6 }); break;
      case 'dodge': Sound.sfx('dodge', { vol: 0.6 }); fx.bubbleBurst(s.fighters[e.i].x, 0.8, 6, 0.5); break;
      case 'knockdown': fx.dust(e.x, 0, 10, 0xa89070, 1.2); d.addTrauma(0.15); Sound.sfx('knockdown'); break;
      case 'wallBounce': fx.sparks(e.x, e.y, 14, { colors: [0xffd080, 0xffffff] }); d.addTrauma(0.35); fx.waveAt(_v.set(e.x, e.y, 0), 0.6); Sound.sfx('wall_bounce'); hud.callout('WALL SPLAT!', 1 - e.i, P.orange3); break;
      case 'groundBounce': fx.dust(e.x, 0, 12, 0xa89070, 1.5); d.addTrauma(0.3); Sound.sfx('knockdown'); break;
      case 'chargeStart': Sound.sfx('charge_start'); this.chargeLoop = Sound.loopStart('charge_loop'); break;
      case 'chargeFull': Sound.sfx('charge_full'); fx.burst(s.fighters[e.i].x, s.fighters[e.i].y + 1, { n: 14, spr: 'sparkle', colors: [0xffb060, 0xffffff], glow: true, anim: 'life', sp1: 3 }); break;
      case 'chargeRelease': Sound.loopStop(this.chargeLoop); this.chargeLoop = null; if (e.lv > 0.7) { d.zoomPunch(0.8); fx.speedLines = 0.6; } break;
      case 'grab': Sound.sfx('throw_grab'); hud.callout('GRAB!', e.a, P.cream3); break;
      case 'snag': Sound.sfx('spear_snag'); hud.callout('SNAGGED!', e.a, P.cream3); fx.sparks(e.x, e.y, 10, { colors: [0xffffff] }); break;
      case 'throwShake': d.addTrauma(0.15); Sound.sfx('whiff_heavy', { vol: 0.5 }); break;
      case 'tech': fx.sparks(e.x, e.y, 16, { colors: [0xffffff, 0xfff08a] }); Sound.sfx('perfect_block', { pitch: 0.8 }); hud.callout('THROW TECH!', 0, P.cream4); break;
      case 'taunt': this.say(e.i, 'taunt'); Sound.sfx('taunt', { vol: 0.6 }); break;
      case 'moltStart': this.moltLoop = Sound.loopStart('molt_loop'); Sound.sfx('molt_start', { vol: 0.8 }); break;
      case 'moltCancel': Sound.loopStop(this.moltLoop); this.moltLoop = null; break;
      case 'moltDenied': if (e.why === 'cooldown') fx.text('MOLT COOLDOWN', s.fighters[e.i].x, 2.4, { size: 'small', color: '#9aa6b2' }); else fx.text('SHELL FULL', s.fighters[e.i].x, 2.4, { size: 'small', color: '#9aa6b2' }); break;
      case 'molt':
        Sound.loopStop(this.moltLoop); this.moltLoop = null;
        V[e.i].spawnHusk();
        fx.burst(e.x, e.y + 1, { n: 30, spr: 'sparkle', colors: [0xfff0b0, 0xffffff, 0x8ff0e0], glow: true, anim: 'life', sp1: 5, life1: 1 });
        fx.bubbleBurst(e.x, e.y + 0.8, 20, 1.4);
        fx.ring(e.x, e.y + 1, 0.5, { size1: 3, dur: 0.45, color: 0xfff0b0 });
        fx.screenFlash(0.25, 0xfff6d0);
        hud.callout('MOLTED! NEW SHELL!', e.i, P.teal5, true);
        Sound.sfx('molt_done');
        this.say(e.i, 'molt');
        break;
      case 'ult': {
        const f = s.fighters[e.i];
        hud.ult(e.i, e.name, e.char);
        fx.speedLines = 1.2; fx.screenFlash(0.3, 0xffffff);
        Sound.stinger('stinger_ult'); Sound.sfx('ult_start');
        this.say(e.i, 'ult');
        const view = V[e.i];
        this.ultShot = 0.7;
        d.setShot({ type: 'focus', target: () => view.headPos(new THREE.Vector3()), offset: [f.face * 1.4, 0.15, 1.9], lookOffset: [0, -0.1, 0], fov: 26, snap: true, cut: true });
        break;
      }
      case 'ultConnect': {
        const a = V[e.a];
        Sound.sfx('ult_hit');
        this.cine = { kind: 'ultSeq', t: 0, dur: 2.1, a: e.a, d: e.d };
        const fa = s.fighters[e.a];
        d.setShot({ type: 'focus', target: () => { const p = a.pos.clone(); p.x += fa.face * 0.5; p.y += 1.0; return p; }, offset: [-fa.face * 1.2, 0.4, 3.4], offset2: [fa.face * 1.6, 0.9, 3.0], lookOffset: [0, 0, 0], fov: 32, dur: 2.0, speed: 6 });
        break;
      }
      case 'ultFinal': fx.impactFrame(1); fx.screenFlash(0.8); fx.waveAt(_v.set(e.x, e.y, 0), 2, 1.8, 0.7); d.addTrauma(0.9); fx.ring(e.x, e.y, 0.5, { size1: 6, dur: 0.6, color: e.demon ? 0xff2a5a : 0x9ff3ff, thick: 0.1 }); fx.sparks(e.x, e.y, 40, { colors: [0xffffff, 0x9ff3ff], sp1: 14 }); Sound.sfx('shockwave'); Sound.sfx('hit_super'); this.cine = null; d.setShot(null); break;
      case 'ultEnd': break;
      case 'spinFx': fx.bubbleBurst(e.x, e.y + 0.8, 4, 1); if (this.cfg.players[e.i].char === 'mimi') fx.burst(e.x, e.y + 1, { n: 3, spr: 'heartC', colors: [0xffffff], sp1: 3, grav: 1 }); else fx.dust(e.x, 0, 2, 0xa89070, 0.8); break;
      case 'flopJump': Sound.sfx('jump', { pitch: 0.6 }); fx.dust(e.x, 0, 16, 0xa89070, 1.5); break;
      case 'flopFall': Sound.sfx('whiff_heavy', { pitch: 0.5 }); break;
      case 'flopLand': case 'slam':
        fx.dust(e.x, 0, 30, 0xa89070, 2.4); fx.ring(e.x, 0.05, 0, { flat: true, size1: e.t === 'flopLand' ? 9 : 4, dur: 0.5, color: 0xffd8a0 });
        fx.waveAt(_v.set(e.x, 0.5, 0), e.t === 'flopLand' ? 2 : 1, 1.6, 0.6); d.addTrauma(e.t === 'flopLand' ? 1 : 0.55); fx.screenFlash(0.3);
        Sound.sfx('belly_flop'); this.landed[e.i] = true; break;
      case 'flatten': V[e.i].active.kickSquash(5); break;
      case 'projSpawn':
        if (e.type === 'cannon') { Sound.sfx('projectile_bubble'); this.say(e.i, 'cannon'); }
        if (e.type === 'junk') Sound.sfx('junk_toss');
        if (e.type === 'bubble') Sound.sfx('projectile_bubble', { pitch: 0.7 });
        if (e.type === 'burp') { Sound.sfx('burp'); fx.bubbleBurst(e.x, e.y, 16, 1.2); }
        if (e.type === 'puru') Sound.sfx('puru_squeak');
        break;
      case 'projEnd': if (e.type === 'junk') { Sound.sfx(['boot_thud', 'fish_slap', 'can_clang', 'duck_squeak', 'anchor_clang'][e.data] || 'boot_thud'); fx.dust(e.x, e.y, 4, 0xa89070, 0.6); } if (e.type === 'bubble' || e.type === 'hiccup') { fx.bubbleBurst(e.x, e.y, 10, 1); Sound.sfx('bubble_pop'); } break;
      case 'projBounce': Sound.sfx('can_clang', { vol: 0.5 }); break;
      case 'puruBounce': Sound.sfx('puru_boing', { vol: 0.6 }); fx.bubbleBurst(e.x, e.y, 4, 0.6); break;
      case 'puruZap': fx.burst(e.x, e.y, { n: 10, spr: 'bolt', colors: [0xffb6d9, 0xffffff, 0xff6fb0], glow: true, sp1: 5 }); break;
      case 'puruBack': Sound.sfx('puru_squeak', { pitch: 1.3 }); break;
      case 'puruRecall': Sound.sfx('puru_squeak', { pitch: 0.9 }); break;
      case 'trapped': Sound.sfx('projectile_bubble', { pitch: 0.6 }); hud.callout('BUBBLED!', 1 - e.i, P.pink3, true); break;
      case 'bubblePop': fx.bubbleBurst(e.x, e.y, 18, 1.4); Sound.sfx('bubble_pop'); break;
      case 'clash': fx.sparks(e.x, e.y, 16, { colors: [0xffffff, 0x9ff3ff] }); fx.ring(e.x, e.y, 0.5, { size1: 1.6 }); Sound.sfx('cavitation', { pitch: 0.8 }); break;
      case 'fizzle': break;
      case 'counterStance': fx.screenFlash(0.4, 0xbff8ff); fx.ring(e.x, e.y, 0.7, { size1: 2.5, color: 0xbff8ff }); hud.callout('MIRAGE COUNTER!', e.i, P.teal5, true); fx.speedLines = 0.7; Sound.sfx('perfect_block'); this.say(e.i, 'counter'); break;
      case 'armor': fx.sparks(e.x, e.y, 8, { colors: [0xffd080] }); hud.callout('ARMOR!', s.fighters[e.i] ? e.i : 0, P.gold3); Sound.sfx('block_heavy'); break;
      case 'vanish': case 'vanishOut': fx.burst(e.x, e.y + 0.8, { n: 16, spr: 'smoke', colors: [0x1a0a20, 0x3a0a2a], anim: 'life', sp1: 2, s0: 0.2, s1: 0.4, grav: 0.5 }); Sound.sfx('demon_whisper', { vol: 0.6 }); break;
      case 'faceplant': Sound.sfx('cone_bonk'); fx.dust(e.x, 0, 8, 0xa89070, 1); hud.callout('STUCK!', e.i, P.orange3); this.say(e.i, 'oops'); break;
      case 'heal': fx.burst(s.fighters[e.i].x, s.fighters[e.i].y + 1.2, { n: 10, spr: 'heart', colors: [0x6aff8a, 0xb6ffb0], glow: true, sp1: 2, grav: 1.5, life1: 1 }); fx.text('+' + e.amt, s.fighters[e.i].x, 2.4, { color: '#6aff8a', size: 'small' }); break;
      case 'snackCrack': Sound.sfx('snail_crunch'); fx.shards(s.fighters[e.i].x + s.fighters[e.i].face * 0.4, 1.5, 8, [0xf0c33c, 0xb88a1e], { s1: 0.1 }); break;
      case 'snackEat': Sound.sfx('munch'); this.say(e.i, 'snack'); break;
      case 'pickup': Sound.sfx('glass_clink'); break;
      case 'throwItem': Sound.sfx('whiff_heavy', { pitch: 1.2 }); break;
      case 'drinkStart': Sound.sfx('gulp'); break;
      case 'drink': fx.text(e.drunk >= 250 ? 'TIPSY!' : '+' + e.amt, s.fighters[e.i].x, 2.4, { color: e.drunk >= 250 ? '#ff9ab0' : '#6aff8a', size: 'small' }); Sound.sfx('gulp'); break;
      case 'hiccup': Sound.sfx('hiccup'); fx.bubbleBurst(s.fighters[e.i].x, s.fighters[e.i].y + 1.4, 3, 0.4); if (Math.random() < 0.3) this.say(e.i, 'drunk'); break;
      case 'voice': this.say(e.i, e.line); break;
      case 'noShell': fx.text('NO SHELL!', s.fighters[e.i].x, 2.3, { size: 'small', color: '#ff6a4a' }); break;
      case 'chandelierFall': Sound.sfx('chandelier_fall'); hud.callout('LOOK OUT!', 0, P.gold3); break;
      case 'tableBreak': Sound.sfx('wood_break'); d.addTrauma(0.25); break;
      case 'jukebox': Sound.sfx('jukebox'); this.musicTrack = e.track ? 'cantina2' : 'cantina'; Sound.music(this.musicTrack, { fade: 0.4 }); break;
      case 'bartenderSlide': Sound.sfx('glass_clink'); break;
      case 'propBreak': Sound.sfx(e.type === 'crate' ? 'crate_break' : e.type === 'pinata' ? 'pinata_break' : e.type === 'chandelier' ? 'chandelier_fall' : 'wood_break'); break;
      case 'propHit': Sound.sfx(e.type === 'crate' ? 'crate_hit' : e.type === 'barrel' || e.type === 'barrelWall' ? 'barrel_hit' : e.type === 'pinata' ? 'pinata_hit' : e.type === 'chandelier' ? 'metal_clang' : 'stool_hit', { vol: 0.7 }); break;
      case 'itemBreak': Sound.sfx(e.type === 'stool' ? 'wood_break' : 'bottle_break'); break;
      case 'ventBurst': Sound.sfx('pipe_hiss'); Sound.sfx('valve_steam'); break;
      case 'snailPickup': Sound.sfx('snail_pickup'); break;
      // ---- round flow
      case 'round': {
        const txt = e.final ? 'FINAL ROUND' : 'ROUND ' + e.round;
        this.hud.announce(txt, { dur: 1.1 });
        Sound.stinger('stinger_round');
        d.setShot(null);
        break;
      }
      case 'fight': this.hud.announce('¡PELEA!', { dur: 0.75, color: P.red4 }); Sound.stinger('stinger_fight'); d.addTrauma(0.25); Sound.sfx('referee_whistle', { vol: 0.6 }); break;
      case 'roundReset': for (const v of this.views) v.lastPose = null; this.fx.clear(); this.prevDark = 0; for (let i = 0; i < 2; i++) { this.prev[i].x = s.fighters[i].x; this.prev[i].y = s.fighters[i].y; } this.views.forEach((v) => v.setDemon && v.setDemon(false)); break;
      case 'qteStart': {
        Sound.stinger('stinger_ko'); Sound.loopStart && (this.qteLoop = Sound.loopStart('qte_tension'));
        fx.impactFrame(1); fx.screenFlash(0.5, 0xff4a3a);
        this.cine = { kind: 'qte', t: 0, a: e.a, d: e.d };
        const A = V[e.a], D = V[e.d];
        d.setShot({ type: 'focus', target: () => A.pos.clone().lerp(D.pos, 0.5).add(new THREE.Vector3(0, 1.0, 0)), offset: [0.4, -0.2, 4.2], offset2: [-0.4, 0.1, 3.6], fov: 34, roll: 0.12, dur: 2.8, speed: 10 });
        this.say(e.a, 'finish');
        break;
      }
      case 'qtePress': if (e.good) { Sound.sfx('qte_press', { vol: 0.6, pitch: e.i === this.sim.s.qte?.a ? 0.9 : 1.15 }); this.views[e.i].active.kickSquash(0.6); d.addTrauma(0.05); } else Sound.sfx('ui_error', { vol: 0.4 }); break;
      case 'qteEnd':
        Sound.loopStop(this.qteLoop); this.qteLoop = null;
        if (e.result === 'escape') {
          fx.ring(e.x, e.y, 0.6, { size1: 4, dur: 0.4, color: 0x8ff0e0 }); fx.waveAt(_v.set(e.x, e.y, 0), 1.6, 1.8); fx.screenFlash(0.5, 0x8ff0e0);
          hud.announce('CLUTCH ESCAPE!', { dur: 1.2, color: P.teal5 }); Sound.sfx('qte_escape'); this.cine = null; d.setShot(null);
          this.say(e.d, 'escape');
        } else {
          Sound.sfx('qte_win');
          this.cine = { kind: 'finisher', t: 0, a: e.a, d: e.d, char: e.char, demon: e.demon };
          this.finisherShot(e);
        }
        break;
      case 'finisherHit':
        fx.impactFrame(1); fx.screenFlash(0.9); fx.waveAt(_v.set(e.x, e.y, 0), 2.2, 2, 0.8); d.addTrauma(1);
        fx.ring(e.x, e.y, 0.5, { size1: 7, dur: 0.7, color: 0xffffff, thick: 0.08 });
        fx.sparks(e.x, e.y, 50, { colors: [0xffffff, 0xfff08a, 0xff6a4a], sp1: 16 });
        if (e.char === 'brutus') fx.dust(e.x, 0, 40, 0xa89070, 2.6);
        if (e.char === 'mimi') fx.burst(e.x, e.y, { n: 30, spr: 'heartC', colors: [0xffffff], sp1: 8, grav: -2 });
        Sound.sfx('hit_super'); Sound.sfx('shockwave');
        break;
      case 'ko':
        this.cine = { kind: 'ko', t: 0, d: e.d };
        fx.impactFrame(1); fx.screenFlash(0.7);
        fx.waveAt(_v.set(e.x, e.y, 0), 2, 1.6, 0.8);
        d.addTrauma(0.8);
        this.hud.announce('K.O.!', { dur: 2.2, kind: 'ko', color: P.red4 });
        Sound.stinger('stinger_ko'); Sound.sfx('ko');
        { const D = V[e.d]; d.setShot({ type: 'focus', target: () => D.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), offset: [-2.6, 0.8, 4.4], offset2: [2.4, 1.6, 5.4], fov: 32, dur: 3.2, speed: 4 }); }
        this.say(e.a >= 0 ? e.a : 1 - e.d, 'ko');
        break;
      case 'timeup': this.hud.announce('TIME!', { dur: 1.4 }); Sound.stinger('stinger_timeup'); break;
      case 'roundWin':
        d.setShot(null); this.cine = null;
        if (e.draw) this.hud.announce('DRAW', { dur: 1.6 });
        else {
          if (e.perfect) this.hud.announce('PERFECT!', { dur: 1.8, color: P.gold3, sub: CHARS[s.fighters[e.winner].char].name + ' WINS THE ROUND' });
          else this.hud.announce(CHARS[s.fighters[e.winner].char].name + ' WINS!', { dur: 1.6, sub: 'ROUND ' + s.round });
          const W = V[e.winner];
          d.setShot({ type: 'focus', target: () => W.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), offset: [s.fighters[e.winner].face * 2.2, 0.4, 3.6], fov: 30, speed: 3 });
          this.say(e.winner, 'win');
        }
        break;
      case 'matchEnd': {
        const W = V[e.winner];
        Sound.stinger('stinger_victory');
        d.setShot({ type: 'focus', target: () => W.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), offset: [s.fighters[e.winner].face * 2.6, 0.6, 4], offset2: [s.fighters[e.winner].face * 1.4, 0.3, 3.0], fov: 30, dur: 5, speed: 3 });
        if ((this.cfg.players[e.winner].cos?.victory || 'default') === 'fireworks') this.fireworks = 5;
        this.say(e.winner, 'victory');
        break;
      }
      case 'demonStart': {
        Sound.stinger('stinger_demon'); Sound.sfx('demon_transform'); Sound.music(null, { fade: 0.3 });
        this.cine = { kind: 'demon', t: 0, i: e.i };
        const D = V[e.i];
        d.setShot({ type: 'focus', target: () => D.headPos(new THREE.Vector3()), offset: [s.fighters[e.i].face * 1.1, 0.45, 1.7], offset2: [s.fighters[e.i].face * 0.7, 0.2, 1.1], fov: 32, dur: 2.6, speed: 5 });
        fx.shards(e.x, e.y + 1.4, 20, [0xff8a2a, 0xffffff, 0xff7a1a], { spr: 'shard', s1: 0.16 });
        Sound.sfx('cone_crack');
        this.say(e.i, 'demon');
        break;
      }
      case 'demonReveal':
        V[e.i].setDemon(true);
        fx.screenFlash(0.8, 0xff0a2a); fx.impactFrame(1);
        fx.burst(e.x, e.y + 1, { n: 40, spr: 'smoke', colors: [0x0a0008, 0x2a0010, 0x400818], anim: 'life', sp1: 3, s0: 0.3, s1: 0.6, grav: 0.3, life1: 1.6 });
        d.addTrauma(0.7);
        Sound.sfx('demon_whisper');
        break;
      case 'demonBurst':
        fx.ring(e.x, e.y, 0.5, { size1: 6, dur: 0.6, color: 0xff1a3a, thick: 0.12 }); fx.waveAt(_v.set(e.x, e.y, 0), 1.8, 1.6, 0.7);
        d.setShot(null); this.cine = null;
        Sound.music('demon', { fade: 0.8 });
        this.hud.callout('DEMON MODE', e.i, P.red4, true);
        break;
      case 'trainingKO': fx.text('KO! (training)', s.fighters[e.i].x, 2.5, { color: '#ff6a4a' }); break;
      default: break;
    }
  }

  updatePanels() {
    const c = this.cine, s = this.sim.s;
    if (c && c.kind === 'qte' && c.t > 0.25) {
      const A = this.views[c.a], D = this.views[c.d];
      const fa = s.fighters[c.a], fd = s.fighters[c.d];
      const left = c.a === 0 ? 0 : 1;
      const tg = [
        { pos: A.headPos(new THREE.Vector3()), face: fa.face, shake: 1, fov: 32, dist: 0.7, side: 1.45, up: 0.25 },
        { pos: D.headPos(new THREE.Vector3()), face: fd.face, shake: 1, fov: 32, dist: 0.7, side: 1.45, up: 0.25 },
      ];
      const rects = [[0.05, 0.29, 0.4, 0.3], [0.55, 0.29, 0.4, 0.3]];
      this.panels.set(left === 0 ? tg : [tg[1], tg[0]], rects);
    } else if (c && c.kind === 'demon' && c.t > 1.0 && c.t < 2.6) {
      const D = this.views[c.i];
      this.panels.set([{ pos: D.headPos(new THREE.Vector3()), face: s.fighters[c.i].face, dist: 0.75, side: 0.75, fov: 22, shake: 0.6, bg: 0x000000 }], [[0.3, 0.12, 0.4, 0.3]]);
    } else this.panels.clear();
  }

  postRender(renderer) { if (this.panels?.active) this.panels.render(renderer, this.scene, this.time); }

  finisherShot(e) {
    const d = this.director, V = this.views, s = this.sim.s;
    const A = V[e.a], D = V[e.d];
    const fa = s.fighters[e.a];
    d.setShot({ type: 'focus', target: () => A.pos.clone().lerp(D.pos, 0.5).add(new THREE.Vector3(0, 1.0, 0)), offset: [-fa.face * 2.5, 0.2, 3.2], offset2: [fa.face * 2.8, 1.2, 4.4], fov: 30, dur: 2.5, speed: 4, roll: -0.08 });
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
    const c = { jim: [0x3fae5c, 0xf0d84a, 0x2e9a74], brutus: [0xe0d2b0, 0x3a3028, 0xf5ecd8], bobby: [0x9a6ad8, 0xc8f05a, 0x553088], mimi: [0xffa8cc, 0xffffff, 0xff6fb0] };
    const f = this.sim.s.fighters[i];
    if (f?.cs?.demon) return [0x1a1024, 0x6a0a2a, 0xff1a3a];
    return c[f?.char] || c.jim;
  }

  // ---------------------------------------------------------- per-frame visuals
  renderViews(dt, alpha) {
    const s = this.sim.s, g = this.game;
    const slow = s.slow > 0 ? 0.34 : 1;
    const frozen = s.pause > 0;
    const vdt = dt * (frozen ? 0.05 : slow);
    this.particles.timeScale = frozen ? 0.15 : slow;
    Sound.slowmo(s.slow > 0 ? 0.45 : 1);
    // darkness for Bobby's demon mode
    const anyDemon = s.fighters.some((f) => f.cs?.demon);
    const targetDark = (this.cine?.kind === 'demon' ? Math.min(1, (this.cine.t) / 0.6) : 0) * 0.92 + (anyDemon && this.cine?.kind !== 'demon' ? 0.78 : 0);
    this.darkCur += (Math.min(0.94, targetDark) - this.darkCur) * Math.min(1, dt * 3);
    if (Math.abs(this.darkCur - (this.prevDark || 0)) > 0.002) { this.stage.setDark(this.darkCur); this.prevDark = this.darkCur; }
    if (anyDemon && Math.random() < dt * 0.6) { this.stage.setDark(Math.max(0, this.darkCur - 0.5)); this.prevDark = -1; Sound.sfx('lamp_swing', { vol: 0.15 }); }
    // views
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i], o = s.fighters[1 - i];
      const view = this.views[i];
      const look = this.views[1 - i].headPos(_v.clone());
      const puruProj = f.char === 'mimi' && f.cs.puru !== 'held' ? s.proj.find((p) => p.id === f.cs.puruId) : null;
      view.update(vdt, f, alpha, { prevX: this.prev[i].x, prevY: this.prev[i].y, look, landed: this.landed[i], jumped: this.jumped[i], puruProj });
      this.landed[i] = false; this.jumped[i] = false;
      // demon eye trails
      if (view.demon && Math.random() < 0.7) {
        const hp = view.headPos(new THREE.Vector3());
        this.particles.spawn({ glow: true, x: hp.x + f.face * 0.18, y: hp.y + 0.12, z: 0.25, vx: -f.vx * 20, life: 0.35, size: 0.08, size1: 0.01, spr: 'dot', color: 0xff1a3a, boost: 4 });
      }
      // dizzy stars
      if (f.st === 'dizzy' && Math.random() < 0.3) {
        const hp = view.headPos(new THREE.Vector3()); const a = this.time * 5 + Math.random();
        this.particles.spawn({ glow: true, x: hp.x + Math.cos(a) * 0.4, y: hp.y + 0.45, z: Math.sin(a) * 0.4, life: 0.3, size: 0.12, spr: 'star', color: 0xfff08a, boost: 2 });
      }
      if (f.st === 'sleep' && Math.random() < dt * 2) { const hp = view.headPos(new THREE.Vector3()); this.particles.spawn({ x: hp.x, y: hp.y + 0.3, z: 0.3, vy: 0.5, vx: 0.2, life: 1.4, size: 0.12, size1: 0.2, spr: 'zzz', color: 0xffffff, alpha: 1, alpha1: 0 }); }
      if (f.st === 'molt' && Math.random() < 0.5) this.particles.spawn({ glow: true, x: f.x + (Math.random() - 0.5) * 0.8, y: f.y + 0.3 + Math.random() * 1.4, z: 0.4, vy: 0.6, life: 0.6, size: 0.08, size1: 0.02, spr: 'sparkle', anim: 'life', color: 0xfff0b0 });
    }
    // projectiles visuals (cannon bubble, junk, bubble traps) - simple sprites via particles each frame
    for (const p of s.proj) this.drawProj(p, dt);
    this.stage.update(vdt, this.sim);
    this.particles.update(dt);
    this.fx.update(vdt);
    // cinematics timer + manga close-up panels
    if (this.cine) { this.cine.t += dt; }
    this.updatePanels();
    if (this.introT !== undefined) { this.introT += dt; if ((s.phase !== 'intro' && this.introT > 0.5) || this.introT > 4.4) { this.introT = undefined; if (!this.cine) this.director.setShot(null); } }
    if (this.ultShot !== undefined && this.ultShot > 0) { this.ultShot -= dt; if (this.ultShot <= 0 && !this.cine) this.director.setShot(null); }
    if (this.fireworks > 0) { this.fireworks -= dt; if (Math.random() < dt * 5) { const x = (Math.random() - 0.5) * 10, y = 4 + Math.random() * 3; this.fx.burst(x, y, { n: 40, spr: 'spark', colors: [0xff4f6a, 0x4fd0ff, 0xffcf3a, 0x6aff8a], glow: true, sp0: 3, sp1: 6, grav: -2, life1: 1.2 }); Sound.sfx('shockwave', { vol: 0.3, pitch: 1.5 }); } }
    if (this.speech) { this.speech.t += dt; if (this.speech.t > this.speech.dur) this.speech = null; }
    if (this.lastHitInfo) { this.lastHitInfo.t -= dt; if (this.lastHitInfo.t <= 0) this.lastHitInfo = null; }
    // camera
    this.camera.aspect = g.renderer.aspect;
    this.director.update(dt, { a: s.fighters[0], b: s.fighters[1], stage: STAGES[this.cfg.stage] || STAGES.rustpit });
    this.fx.applyPost(g.renderer.post, {});
    const post = g.renderer.post;
    post.uLetterbox.value += (((this.cine && this.cine.kind !== 'ultSeq') || s.phase === 'intro' || s.phase === 'matchEnd' || s.pause > 0 ? 1 : 0) - post.uLetterbox.value) * Math.min(1, dt * 6);
    post.uRedTint.value += ((s.phase === 'qte' ? 0.35 : 0) - post.uRedTint.value) * Math.min(1, dt * 6);
    post.uDark.value = s.pause > 0 && !this.cine ? 0.25 : 0;
    post.uDesat.value = this.paused ? 0.6 : (s.phase === 'ko' && s.slow > 0 ? 0.35 : 0);
    if (this.fx.shakeReq > 0) { this.director.addTrauma(this.fx.shakeReq); this.fx.shakeReq = 0; }
    this.hud.update(dt, this.sim);
  }

  drawProj(p, dt) {
    const P2 = this.particles;
    if (p.type === 'cannon') {
      // swirling cavitation bubble
      P2.spawn({ glow: true, x: p.x, y: p.y, z: 0.3, life: 0.05, size: 0.9, spr: 'ring', color: 0x9ff3ff, boost: 3 });
      P2.spawn({ x: p.x - p.vx * 3, y: p.y + (Math.random() - 0.5) * 0.4, z: 0.3, vx: -p.vx * 20, vy: (Math.random() - 0.5), grav: 1, life: 0.5, size: 0.08, size1: 0.14, spr: 'bubble', color: 0xdff8ff, wob: [0.4, 6] });
      if (Math.random() < 0.5) P2.spawn({ glow: true, x: p.x, y: p.y, z: 0.35, life: 0.08, size: 0.5, spr: 'dot', color: 0xbff8ff, boost: 1.2, alpha: 0.6 });
    } else if (p.type === 'junk') {
      const spr = ['plank', 'eyeTrail', 'pixelS', 'heartC', 'shard'][p.data] || 'pixelS';
      const col = [0x6a4a2a, 0x8ab0d0, 0xb0b8c0, 0xffd040, 0x3a3f46][p.data] || 0xffffff;
      P2.spawn({ x: p.x, y: p.y, z: 0.3, life: 0.04, size: p.data === 4 ? 0.7 : 0.45, spr, color: col, rot: this.time * 10 });
    } else if (p.type === 'bubble') {
      P2.spawn({ glow: true, x: p.x, y: p.y, z: 0.3, life: 0.04, size: 1.0, spr: 'ring', color: 0xff8ac8, boost: 2 });
      if (Math.random() < 0.3) P2.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + (Math.random() - 0.5) * 0.6, z: 0.3, life: 0.4, size: 0.08, spr: 'heartC', color: 0xffffff, vy: 0.3 });
    } else if (p.type === 'hiccup') {
      P2.spawn({ glow: true, x: p.x, y: p.y, z: 0.3, life: 0.04, size: 0.35, spr: 'ring', color: 0xff8ac8, boost: 1.5 });
    } else if (p.type === 'quake') {
      if (Math.random() < 0.8) this.fx.dust(p.x, 0, 2, 0xa89070, 1.2);
      P2.spawn({ glow: true, x: p.x, y: 0.15, z: 0.2, life: 0.06, size: 0.6, spr: 'hit', frame: 3, color: 0xffd8a0, boost: 2 });
    } else if (p.type === 'burp') {
      if (Math.random() < 0.5) this.fx.bubbleBurst(p.x, p.y, 2, 1);
    }
  }

  // ---------------------------------------------------------- pause + training
  updatePause() {
    const g = this.game, inp = g.input;
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
    if (inp.keyPressed('Digit1')) { this.trainingOpts.dummy = order[(order.indexOf(this.trainingOpts.dummy) + 1) % order.length]; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit2')) { this.trainingOpts.infiniteMeter = !this.trainingOpts.infiniteMeter; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit3')) { this.trainingOpts.showInputs = !this.trainingOpts.showInputs; Sound.sfx('ui_tab'); }
    if (inp.keyPressed('Digit4')) { const s = this.sim.s; for (const f of s.fighters) { f.hp = f.hpMax; f.shell = f.shellMax; f.moltCd = 0; f.x = f.i === 0 ? -2.5 : 2.5; f.y = 0; f.vx = f.vy = 0; f.st = 'idle'; } Sound.sfx('ui_select'); }
    if (inp.keyPressed('Digit5')) { this.showMoves = !this.showMoves; Sound.sfx('ui_tab'); }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const s = this.sim.s;
    this.cfg.onEnd?.({ winner: s.matchWinner, stats: s.fighters.map((f) => f.stats), fighters: s.fighters.map((f) => ({ char: f.char, hp: f.hp, hpMax: f.hpMax })), wins: s.wins, cfg: this.cfg });
  }

  // ---------------------------------------------------------- UI
  drawUI(ui, dt) {
    if (!this.ready) { ui.dim(1, P.deep0); ui.text('LOADING...', ui.w / 2, ui.h / 2, { font: 'big', align: 'center' }); return; }
    const s = this.sim.s;
    const proj = (x, y) => { _v.set(x, y, 0.3).project(this.camera); if (_v.z > 1) return null; return { x: Math.round((_v.x * 0.5 + 0.5) * ui.w), y: Math.round((1 - (_v.y * 0.5 + 0.5)) * ui.h) }; };
    const b = this.game.save.settings.bindings;
    const hideBars = s.phase === 'intro' || (this.cine && (this.cine.kind === 'demon' || this.cine.kind === 'finisher'));
    this.hud.draw(ui, this.sim, {
      texts: this.fx.texts, project: proj, hideBars,
      keyHints: this.cfg.mode === 'local' ? [`${keyLabel(b.p1.light[0])}+${keyLabel(b.p1.heavy[0])}`, `${keyLabel(b.p2.light[0])}+${keyLabel(b.p2.heavy[0])}`] : ['LIGHT+HEAVY', this.cfg.mode === 'online' ? '' : 'LIGHT+HEAVY'],
      qteKeys: this.qteKeyNames(),
    });
    // speech bubble
    if (this.speech) {
      const f = s.fighters[this.speech.i];
      const hp = this.views[this.speech.i].headPos(new THREE.Vector3());
      const p = proj(hp.x, hp.y + 0.55);
      if (p) this.drawSpeech(ui, p.x, p.y, this.speech);
    }
    if (this.panels?.active) this.panels.drawUI(ui, this.time, this.cine?.kind === 'qte' ? (this.cine.a === 0 ? [PLAYER_COLORS[0].main, PLAYER_COLORS[1].main] : [PLAYER_COLORS[0].main, PLAYER_COLORS[1].main]) : ['#ff1a3a']);
    if (s.phase === 'intro') this.drawIntro(ui);
    if (this.cine?.kind === 'demon') {
      const t = this.cine.t;
      if (t > 1.2) ui.text('...', ui.w / 2, ui.h * 0.25, { font: 'huge', align: 'center', color: P.red4, alpha: Math.min(1, t - 1.2) });
    }
    if (this.cfg.mode === 'training') this.drawTraining(ui);
    if (this.cfg.mode === 'online' && this.cfg.net) this.drawNet(ui);
    if (!this.paused) this.game.touch.draw(ui);
    if (this.showMoves) this.drawMoveList(ui);
    if (this.paused) this.drawPause(ui);
  }

  qteKeyNames() {
    const b = this.game.save.settings.bindings;
    const mk = (p) => [keyLabel(b[p].light[0]), keyLabel(b[p].heavy[0]), keyLabel(b[p].block[0])];
    if (this.cfg.mode === 'local') return [mk('p1'), mk('p2')];
    return [mk('p1'), ['LIGHT', 'HEAVY', 'BLOCK']];
  }

  drawSpeech(ui, x, y, sp) {
    const lines = ui.wrap(sp.text.slice(0, Math.floor(sp.t * 40)), 120, 'body');
    if (!lines.length || !lines[0]) return;
    const w = Math.max(...lines.map((l) => ui.measure(l, 'body'))) + 10;
    const h = lines.length * 9 + 7;
    const bx = Math.round(Math.max(4, Math.min(ui.w - w - 4, x - w / 2))), by = Math.round(Math.max(4, y - h - 8));
    const a = sp.t > sp.dur - 0.25 ? (sp.dur - sp.t) / 0.25 : 1;
    ui.g.globalAlpha = a;
    ui.rect(bx - 1, by - 1, w + 2, h + 2, P.ink);
    ui.rect(bx, by, w, h, P.cream3);
    ui.rect(bx, by + h - 2, w, 2, P.cream1);
    ui.rect(Math.max(bx + 4, Math.min(bx + w - 8, x - 2)), by + h, 4, 3, P.cream3);
    ui.rect(Math.max(bx + 5, Math.min(bx + w - 7, x - 1)), by + h + 3, 2, 2, P.cream3);
    lines.forEach((l, i) => ui.text(l, bx + 5, by + 4 + i * 9, { font: 'body', color: P.ink, outline: null }));
    ui.g.globalAlpha = 1;
  }

  drawIntro(ui) {
    const s = this.sim.s;
    const t = s.pt / 60;
    const p = this.cfg.players;
    const a = Math.min(1, t * 2);
    const W = ui.w;
    // versus plates sliding in
    const slide = ease.outBack(Math.min(1, t * 1.5));
    for (let i = 0; i < 2; i++) {
      const right = i === 1;
      const w = 150, h = 44;
      const x = right ? W - w - 10 + Math.round((1 - slide) * 200) : 10 - Math.round((1 - slide) * 200);
      const y = ui.h - h - 26;
      ui.panel(x, y, w, h, { seed: 40 + i, tone: right ? 'blue' : 'red', plankSize: 15, barnacles: 3 });
      ui.text(CHARS[p[i].char].name, x + w / 2, y + 6, { font: 'big', align: 'center', color: P.cream4 });
      ui.text(CHARS[p[i].char].title, x + w / 2, y + 30, { font: 'body', align: 'center', color: P.cream2 });
    }
    ui.text('VS', W / 2, ui.h - 52, { font: 'huge', align: 'center', color: P.gold3, alpha: a, shadow: P.ink });
    ui.text(this.cfg.mode === 'online' ? 'PRESS LIGHT (BOTH) TO SKIP' : 'PRESS LIGHT TO SKIP', W / 2, ui.h - 12, { font: 'label', align: 'center', color: P.cream2, alpha: 0.7 });
    const st = STAGES[this.cfg.stage];
    ui.text(st?.name || '', W / 2, 54, { font: 'big', align: 'center', color: P.cream3, alpha: a });
  }

  drawTraining(ui) {
    const o = this.trainingOpts;
    const x = 8, y = 64;
    ui.panel(x, y, 132, 72, { seed: 77, tone: 'dark', plankSize: 12, barnacles: 1 });
    ui.text('TRAINING TANK', x + 66, y + 5, { font: 'labelB', align: 'center', color: P.gold3 });
    const rows = [`[1] DUMMY: ${o.dummy.toUpperCase()}`, `[2] INF METER: ${o.infiniteMeter ? 'ON' : 'OFF'}`, `[3] INPUTS: ${o.showInputs ? 'ON' : 'OFF'}`, '[4] RESET POSITIONS', '[5] MOVE LIST'];
    rows.forEach((r, i) => ui.text(r, x + 6, y + 18 + i * 10, { font: 'body', color: P.cream3 }));
    if (o.showInputs) {
      const arrows = (b) => { const v = (b & 4 ? 1 : 0) - (b & 8 ? 1 : 0), h = (b & 2 ? 1 : 0) - (b & 1 ? 1 : 0); return ['↙', '↓', '↘', '←', '•', '→', '↖', '↑', '↗'][(v + 1) * 3 + (h + 1)] ?? '•'; };
      const dirs = { '↙': 'DB', '↓': 'D', '↘': 'DF', '←': 'B', '•': '', '→': 'F', '↖': 'UB', '↑': 'U', '↗': 'UF' };
      let yy = y + 80;
      let last = -1, n = 0;
      for (const b of this.inputLog[0]) {
        if (b === last) continue; last = b;
        if (n++ > 10) break;
        const parts = [dirs[arrows(b)]];
        if (b & 16) parts.push('L'); if (b & 32) parts.push('H'); if (b & 64) parts.push('B');
        ui.text(parts.filter(Boolean).join(' ') || '-', x + 6, yy, { font: 'label', color: P.teal5 }); yy += 9;
      }
    }
    if (this.lastHitInfo) ui.text(`${(this.lastHitInfo.mv || '').toUpperCase()} ${this.lastHitInfo.dmg} DMG  COMBO ${this.lastHitInfo.combo}`, ui.w / 2, ui.h - 32, { font: 'labelB', align: 'center', color: P.gold3 });
  }

  drawNet(ui) {
    const net = this.cfg.net;
    const ping = Math.round(net.rtt || 0);
    ui.text(`PING ${ping}ms  DELAY ${net.delay}f`, ui.w / 2, ui.h - 10, { font: 'label', align: 'center', color: ping < 80 ? P.green3 : ping < 150 ? P.gold3 : P.red4 });
    if (net.stalled > 0.25) ui.text('WAITING FOR OPPONENT...', ui.w / 2, ui.h / 2 + 40, { font: 'labelB', align: 'center', color: P.cream3 });
    if (net.desync) ui.text('RESYNCING...', ui.w / 2, ui.h / 2 + 52, { font: 'label', align: 'center', color: P.orange3 });
  }

  drawPause(ui) {
    ui.dim(0.55);
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
    const p = this.cfg.players[0];
    const ch = p.char;
    const b = this.game.save.settings.bindings.p1;
    const K = (a) => keyLabel(b[a][0]);
    const w = Math.min(ui.w - (this.paused ? 200 : 40), 330), h = Math.min(ui.h - 40, 230);
    const x = this.paused ? 10 : Math.floor(ui.w / 2 - w / 2), y = Math.floor(ui.h / 2 - h / 2);
    ui.panel(x, y, w, h, { seed: 61, tone: 'dark', plankSize: 16, barnacles: 3 });
    ui.text(CHARS[ch].name + ' - MOVE LIST', x + w / 2, y + 6, { font: 'labelB', align: 'center', color: P.gold3 });
    const list = MOVELIST(ch, { L: K('light'), H: K('heavy'), B: K('block'), F: 'FWD', BK: 'BACK', D: K('down'), U: K('up') });
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
    ['Jab / chain', `${k.L}, ${k.L}`], ['Light-Light-Heavy finisher', `${k.L}, ${k.L}, ${k.H}`], ['Jab barrage', `${k.F} + ${k.L}`], ['Low poke', `${k.D} + ${k.L}`],
    ['Heavy (hold to charge spring punch)', `${k.H} (hold)`], ['Uppercut / launcher', `${k.D} + ${k.H}`], ['Aerial light / heavy', `air ${k.L} / ${k.H}`],
    ['Block (crouch-block lows)', `${k.B} (+${k.D})`], ['Perfect block', `${k.B} right before impact`], ['Dodge roll', `${k.B} + ${k.F}/${k.BK}`], ['Throw (tech: same)', `${k.L} + ${k.B}`],
    ['Molt (regrow shell, 3s, vulnerable)', `hold ${k.B} + ${k.H}`], ['Taunt', `${k.B} + ${k.U}`], ['Dash / backdash', `double-tap ${k.F}/${k.BK}`], ['Drop through platform', `${k.D} + ${k.U}`], ['ULTIMATE (full meter)', `${k.L} + ${k.H}`],
  ];
  const sp = {
    jim: [['Cavitation Cannon', `${k.F} + ${k.H}`], ['Mirage Stance (counter)', `${k.BK} + ${k.H}`]],
    brutus: [['Spear Snag (long grab)', `${k.F} + ${k.H}`], ['Snack Time (eat a snail, heal)', `${k.BK} + ${k.H}`], ['Body Slam', `air ${k.H}`]],
    bobby: [['Junk Toss (random!)', `${k.F} + ${k.H}`], ['Cone Hide (then ${k.H} to pop)', `${k.BK} + ${k.H}`], ['Below half HP...', '???']],
    mimi: [['Throw / recall Puru', `${k.F} + ${k.H}`], ['Bubble Trap', `${k.BK} + ${k.H}`], ['Puru parachute', `hold ${k.U} in air`]],
  };
  return [...(sp[ch] || []), ...common];
}
