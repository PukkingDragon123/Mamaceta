// Game shell: owns renderer, UI, input, save; runs the main loop and screen stack/transitions.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/ui.js';
import { Input } from './core/input.js';
import { Save } from './core/save.js';
import { Sound } from './core/sound.js';
import { P } from './ui/palette.js';
import { clamp } from './core/math.js';

export class Game {
  constructor() {
    this.glCanvas = document.getElementById('gl');
    this.uiCanvas = document.getElementById('ui');
    this.renderer = new Renderer(this.glCanvas);
    this.ui = new UI(this.uiCanvas);
    this.input = new Input();
    this.save = Save;
    this.screen = null;
    this.next = null;
    this.trans = null; // {t, dur, mid, kind, fn}
    this.time = 0;
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.paused = false;
    this.toasts = [];
    this.net = null;
    window.__game = this;
  }

  applySettings() {
    const s = this.save.settings;
    const q = new URLSearchParams(location.search).get('q');
    if (q) s.quality = q;
    Sound.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.input.setBindings(s.bindings);
    this.renderer.setQuality(s.quality);
  }

  start(firstScreen) {
    this.applySettings();
    this.setScreen(firstScreen, { instant: true });
    const gesture = () => { Sound.resume(); };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) dt = 0.0001;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  // Replace the current screen. opts.kind: 'bubbles' | 'planks' | 'fade'
  setScreen(screen, opts = {}) {
    if (opts.instant || !this.screen) {
      this.screen?.exit?.();
      this.screen = screen;
      screen.game = this;
      screen.enter?.();
      return;
    }
    if (this.trans) return;
    const kind = opts.kind || 'bubbles';
    this.trans = { t: 0, dur: opts.dur || (kind === 'planks' ? 1.1 : 0.8), switched: false, kind, screen, seed: Math.random() * 1000 };
    Sound.sfx(kind === 'planks' ? 'ui_door_slam' : 'ui_whoosh', { vol: 0.7 });
  }

  toast(text, color = P.cream3, icon = null) {
    this.toasts.push({ text, color, icon, t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  frame(dt) {
    this.time += dt;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    this.input.poll(dt);
    this.save.update(dt);
    Sound.update(dt);
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      if (!tr.switched && tr.t >= tr.dur * 0.5) {
        tr.switched = true;
        this.screen?.exit?.();
        this.screen = tr.screen; tr.screen.game = this; tr.screen.enter?.();
      }
      if (tr.t >= tr.dur) this.trans = null;
    }
    const scr = this.screen;
    if (scr) {
      try {
        scr.update?.(dt, !this.trans);
      } catch (e) { this.crash(e); }
      this.renderer.update(dt);
      if (scr.scene && scr.camera) {
        try { this.renderer.render(scr.scene, scr.camera); } catch (e) { this.crash(e); }
      }
      this.ui.begin(dt);
      try { scr.drawUI?.(this.ui, dt); } catch (e) { this.crash(e); }
    } else {
      this.ui.begin(dt);
    }
    this._drawToasts(dt);
    if (this.trans) this._drawTransition(this.trans);
    if (this.save.settings.showFps) this.ui.text(`${Math.round(this.fps)} FPS`, this.ui.w - 4, 4, { font: 'label', align: 'right', color: P.teal5 });
    this.ui.end();
    this.input.endFrame();
  }

  crash(e) {
    if (this._crashed) return;
    this._crashed = true;
    console.error(e);
    window.__lastError = String(e && e.stack || e);
    this.toast('Oops: ' + String(e.message || e).slice(0, 80), P.red4);
    setTimeout(() => { this._crashed = false; }, 2000);
  }

  _drawToasts(dt) {
    const ui = this.ui;
    let y = 30;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]; t.t += dt;
      if (t.t > 3.2) { this.toasts.splice(i, 1); continue; }
    }
    for (const t of this.toasts) {
      const slide = clamp(t.t * 5, 0, 1) * clamp((3.2 - t.t) * 4, 0, 1);
      const w = ui.measure(t.text, 'body') + 18 + (t.icon ? 14 : 0);
      const x = Math.round(ui.w - (w + 6) * slide);
      ui.panel(x, y, w, 15, { seed: 5, tone: 'dark', plankSize: 15, barnacles: 0, algae: 0, moss: 0 });
      if (t.icon) ui.icon(t.icon, x + 5, y + 2);
      ui.text(t.text, x + 9 + (t.icon ? 14 : 0), y + 4, { color: t.color });
      y += 18;
    }
  }

  _drawTransition(tr) {
    const ui = this.ui;
    const k = tr.t / tr.dur;
    if (tr.kind === 'planks') {
      // two wooden doors slam shut then open
      const c = k < 0.5 ? Math.min(1, k / 0.32) : Math.max(0, 1 - (k - 0.62) / 0.38);
      const e = c < 1 ? 1 - Math.pow(1 - c, 3) : 1;
      const half = Math.ceil(ui.w / 2);
      const off = Math.round(half * (1 - e));
      ui.panel(-off, 0, half + 2, ui.h, { seed: 21, tone: 'mid', planks: 'v', plankSize: 18, barnacles: 6, algae: 1, moss: 1 });
      ui.panel(half - 2 + off, 0, half + 2, ui.h, { seed: 22, tone: 'mid', planks: 'v', plankSize: 18, barnacles: 6, algae: 1, moss: 1 });
      if (e > 0.98) {
        ui.metal(half - 18, Math.floor(ui.h / 2) - 14, 36, 28, { seed: 3, rust: 0.7 });
        ui.icon('snail', half - 7, Math.floor(ui.h / 2) - 6);
      }
      return;
    }
    if (tr.kind === 'fade') {
      const a = k < 0.5 ? k * 2 : (1 - k) * 2;
      ui.rect(0, 0, ui.w, ui.h, P.deep0, Math.min(1, a * 1.2));
      return;
    }
    // bubbles wipe: a wall of pixel bubbles rising through the screen
    const g = ui.g;
    const cover = k < 0.5 ? k * 2 : (1 - k) * 2;
    const yTop = ui.h * (1 - (k * 2.2 - 0.1));
    g.fillStyle = P.deep1;
    if (cover > 0) {
      const top = Math.round(Math.max(0, yTop + 20 - (k > 0.5 ? (k - 0.5) * 3 * ui.h : 0)));
      const bottom = k < 0.5 ? ui.h : Math.round(ui.h - (k - 0.5) * 2 * ui.h);
      if (bottom > top) g.fillRect(0, top, ui.w, bottom - top);
    }
    const n = 60;
    for (let i = 0; i < n; i++) {
      const sx = ((i * 97.13 + tr.seed) % 1) * ui.w + ((i * 37) % ui.w);
      const r = 4 + ((i * 13) % 11);
      const speed = 1.6 + ((i * 7) % 5) * 0.25;
      const y = ui.h + 30 - (k * speed) * (ui.h + 120) + ((i * 53) % 60);
      const x = (sx + Math.sin(k * 8 + i) * 6) % ui.w;
      g.fillStyle = P.teal3; g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
      g.fillStyle = P.deep1; g.fillRect(Math.round(x - r + 2), Math.round(y - r + 2), r * 2 - 4, r * 2 - 4);
      g.fillStyle = P.teal5; g.fillRect(Math.round(x - r + 2), Math.round(y - r + 2), 2, 2);
    }
  }
}

// convenience: create a basic underwater scene shell
export function makeScene(fogColor = 0x0a3a4a, density = 0.035) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.FogExp2(fogColor, density);
  return scene;
}
