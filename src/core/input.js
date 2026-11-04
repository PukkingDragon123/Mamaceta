// Keyboard + gamepad input.
// Gameplay input is a 7-bit mask per player, sampled once per simulation tick.
// Taps shorter than a tick are latched so they are never lost.

export const BTN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, LIGHT: 16, HEAVY: 32, BLOCK: 64 };
export const ACTIONS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'block'];
const ACTION_BIT = { left: 1, right: 2, up: 4, down: 8, light: 16, heavy: 32, block: 64 };

export const DEFAULT_BINDINGS = {
  p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], light: ['KeyF'], heavy: ['KeyG'], block: ['KeyH'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], light: ['KeyK', 'Numpad1'], heavy: ['KeyL', 'Numpad2'], block: ['Semicolon', 'Numpad3'] },
};
// extra keys that also work for a single player (training / vs CPU / online)
const SOLO_EXTRA = { light: ['KeyJ', 'KeyZ'], heavy: ['KeyX'], block: ['KeyC', 'ShiftLeft'] };

export function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'N' + code.slice(6);
  const map = { ArrowLeft: '<', ArrowRight: '>', ArrowUp: '^', ArrowDown: 'v', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Space: 'SPC', Enter: 'ENT', ShiftLeft: 'LSHF', ShiftRight: 'RSHF', ControlLeft: 'LCTL', ControlRight: 'RCTL', AltLeft: 'LALT', AltRight: 'RALT', Backspace: 'BKSP', Tab: 'TAB', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };
  return map[code] || code.slice(0, 4).toUpperCase();
}

const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space', 'NumpadEnter'], back: ['Escape', 'Backspace'],
  tabL: ['KeyQ', 'PageUp'], tabR: ['KeyE', 'PageDown'],
};

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'Semicolon', 'Slash', 'Quote']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedThisFrame = new Set();
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.latched = [0, 0];
    this.gpPrev = [{}, {}];
    this.gpState = [0, 0];
    this.gpMenu = [{}, {}];
    this.repeat = {};
    this.textHandler = null; // function(key) when text input active
    this.anyPressed = false;
    this.lastDevice = 'keyboard';
    this.captureHandler = null; // for key rebinding
    this.mode = 'solo';
    this.time = 0;
    window.addEventListener('keydown', (e) => this._onKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => this._onKey(e, false), { passive: false });
    window.addEventListener('blur', () => { this.down.clear(); this.latched = [0, 0]; });
  }

  setBindings(b) {
    if (!b) return;
    for (const p of ['p1', 'p2']) {
      if (!b[p]) continue;
      for (const a of ACTIONS) if (Array.isArray(b[p][a]) && b[p][a].length) this.bindings[p][a] = b[p][a].slice(0, 2);
    }
  }

  _onKey(e, isDown) {
    const code = e.code;
    if (this.captureHandler && isDown) {
      e.preventDefault();
      const h = this.captureHandler; this.captureHandler = null; h(code); return;
    }
    if (this.textHandler && isDown) {
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Escape') {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() === 'v') {
          e.preventDefault();
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            navigator.clipboard?.readText?.().then((t) => { for (const ch of t) this.textHandler?.(ch); }).catch(() => {});
          } else this.textHandler(e.key);
          return;
        }
      }
    }
    if (PREVENT.has(code)) e.preventDefault();
    if (isDown) {
      if (!e.repeat) {
        this.pressedThisFrame.add(code);
        this.anyPressed = true;
        this.lastDevice = 'keyboard';
        // latch gameplay presses so short taps reach the sim
        for (let p = 0; p < 2; p++) {
          const bits = this._bitsForCode(code, p);
          if (bits) this.latched[p] |= bits;
        }
      }
      this.down.add(code);
    } else {
      this.down.delete(code);
    }
  }

  _bindingSetFor(player) {
    // returns list of binding tables that drive this player in current mode
    if (this.mode === 'solo') return player === 0 ? [this.bindings.p1, this.bindings.p2, SOLO_EXTRA] : [];
    return player === 0 ? [this.bindings.p1] : [this.bindings.p2];
  }

  _bitsForCode(code, player) {
    let bits = 0;
    for (const t of this._bindingSetFor(player)) {
      for (const a of ACTIONS) if (t[a] && t[a].includes(code)) bits |= ACTION_BIT[a];
    }
    return bits;
  }

  _keyboardBits(player) {
    let bits = 0;
    for (const t of this._bindingSetFor(player)) {
      for (const a of ACTIONS) {
        const codes = t[a]; if (!codes) continue;
        for (const c of codes) if (this.down.has(c)) { bits |= ACTION_BIT[a]; break; }
      }
    }
    return bits;
  }

  _pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let idx = 0;
    for (let i = 0; i < pads.length && idx < 2; i++) {
      const gp = pads[i]; if (!gp || !gp.connected) continue;
      const b = (n) => gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.5);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      let bits = 0;
      if (b(14) || ax < -0.45) bits |= BTN.LEFT;
      if (b(15) || ax > 0.45) bits |= BTN.RIGHT;
      if (b(12) || ay < -0.55 || b(0)) bits |= BTN.UP;
      if (b(13) || ay > 0.55) bits |= BTN.DOWN;
      if (b(2)) bits |= BTN.LIGHT;
      if (b(3)) bits |= BTN.HEAVY;
      if (b(1) || b(5) || b(7)) bits |= BTN.BLOCK;
      if (b(4) || b(6)) bits |= BTN.LIGHT | BTN.HEAVY;
      const menu = {
        up: b(12) || ay < -0.55, down: b(13) || ay > 0.55, left: b(14) || ax < -0.45, right: b(15) || ax > 0.45,
        confirm: b(0) || b(2), back: b(1), start: b(9), tabL: b(4), tabR: b(5),
      };
      const prev = this.gpPrev[idx];
      if (bits && bits !== this.gpState[idx]) { this.lastDevice = 'gamepad'; }
      // latch new presses
      const newBits = bits & ~this.gpState[idx];
      if (newBits) { this.anyPressed = true; }
      this.gpState[idx] = bits;
      this.gpMenu[idx] = { cur: menu, prev: prev.cur || {} };
      this.gpPrev[idx] = { cur: menu };
      idx++;
    }
    for (; idx < 2; idx++) { this.gpState[idx] = 0; this.gpMenu[idx] = { cur: {}, prev: this.gpMenu[idx]?.cur || {} }; }
  }

  // call once per render frame, BEFORE game logic
  poll(dt) {
    this.time += dt;
    this._pollGamepads();
  }
  // call once per render frame, AFTER game logic
  endFrame() {
    this.pressedThisFrame.clear();
    this.anyPressed = false;
  }

  // gameplay bits for a player, for one sim tick (consumes latched taps)
  sample(player) {
    let bits = this._keyboardBits(player) | this.latched[player];
    this.latched[player] = 0;
    if (this.mode === 'solo') { if (player === 0) bits |= this.gpState[0] | this.gpState[1]; }
    else bits |= this.gpState[player] || 0;
    if (this.textHandler) bits = 0;
    return bits;
  }
  peek(player) {
    let bits = this._keyboardBits(player);
    if (this.mode === 'solo') { if (player === 0) bits |= this.gpState[0] | this.gpState[1]; }
    else bits |= this.gpState[player] || 0;
    return bits;
  }
  clearLatched() { this.latched = [0, 0]; }

  keyPressed(code) { return this.pressedThisFrame.has(code); }

  // Menu actions with key-repeat. who: 'any' | 0 | 1  (0/1 use that player's bindings, for split menus)
  menu(action, who = 'any', repeat = true) {
    const held = this._menuHeld(action, who);
    const pressed = this._menuPressed(action, who);
    if (!repeat || !['up', 'down', 'left', 'right'].includes(action)) return pressed;
    const key = action + ':' + who;
    if (pressed) { this.repeat[key] = this.time + 0.32; return true; }
    if (held && this.repeat[key] && this.time >= this.repeat[key]) { this.repeat[key] = this.time + 0.075; return true; }
    if (!held) delete this.repeat[key];
    return false;
  }
  _playerKeysFor(action, p) {
    const t = p === 0 ? this.bindings.p1 : this.bindings.p2;
    const map = { up: 'up', down: 'down', left: 'left', right: 'right', confirm: 'light', back: 'heavy' };
    const a = map[action];
    return a ? t[a] : [];
  }
  _menuCodes(action, who) {
    if (who === 'any') {
      const codes = [...(MENU_KEYS[action] || [])];
      if (action === 'confirm') codes.push(...this.bindings.p1.light, ...this.bindings.p2.light, 'KeyJ');
      if (action === 'back') codes.push(...this.bindings.p1.heavy, ...this.bindings.p2.heavy);
      if (['up', 'down', 'left', 'right'].includes(action)) codes.push(...this.bindings.p1[action], ...this.bindings.p2[action]);
      return codes;
    }
    return this._playerKeysFor(action, who);
  }
  _menuPressed(action, who) {
    if (this.textHandler && action !== 'back' && action !== 'confirm') return false;
    for (const c of this._menuCodes(action, who)) if (this.pressedThisFrame.has(c)) return true;
    const pads = who === 'any' ? [0, 1] : [who];
    for (const i of pads) { const m = this.gpMenu[i]; if (m && m.cur[action] && !m.prev[action]) return true; }
    return false;
  }
  _menuHeld(action, who) {
    for (const c of this._menuCodes(action, who)) if (this.down.has(c)) return true;
    const pads = who === 'any' ? [0, 1] : [who];
    for (const i of pads) { const m = this.gpMenu[i]; if (m && m.cur[action]) return true; }
    return false;
  }
  startPressed() {
    if (this.pressedThisFrame.has('Escape') || this.pressedThisFrame.has('KeyP')) return true;
    for (const i of [0, 1]) { const m = this.gpMenu[i]; if (m && m.cur.start && !m.prev.start) return true; }
    return false;
  }

  captureNextKey(cb) { this.captureHandler = cb; }
  hasGamepad() { return this.gpState && (navigator.getGamepads ? [...navigator.getGamepads()].some((g) => g && g.connected) : false); }
}
