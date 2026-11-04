// On-screen touch controls (virtual stick + LIGHT / HEAVY / BLOCK + pause) for phones and tablets.
// Shown automatically after the first touch; feeds player 1's input bits.
import { BTN } from '../core/input.js';
import { P } from './palette.js';

export class TouchControls {
  constructor(ui, input) {
    this.ui = ui; this.input = input;
    this.enabled = false;
    this.pointers = new Map(); // id -> {x, y} in UI pixels
    this.stick = null; // {id, ox, oy}
    const c = ui.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / ui.cssScale, y: (e.clientY - r.top) / ui.cssScale }; };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.enabled = true;
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      if (this.active && p.x < ui.w * 0.45 && !this.stick && !this.hitPause(p)) this.stick = { id: e.pointerId, ox: p.x, oy: p.y };
      if (this.active && this.hitPause(p)) this.pausePressed = true;
    });
    c.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos(e)); });
    const up = (e) => { if (e.pointerType !== 'touch') return; this.pointers.delete(e.pointerId); if (this.stick?.id === e.pointerId) this.stick = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    this.active = false; // true while a fight is on screen
    this.prev = 0;
  }
  layout() {
    const ui = this.ui;
    const r = Math.max(15, Math.min(24, Math.floor(ui.h * 0.075)));
    const bx = ui.w - r * 2 - 12, by = ui.h - r * 2 - 18;
    return {
      r,
      buttons: [
        { bit: BTN.LIGHT, label: 'L', x: bx - r * 2.3, y: by + r * 0.4, col: P.gold3 },
        { bit: BTN.HEAVY, label: 'H', x: bx, y: by - r * 0.9, col: P.red3 },
        { bit: BTN.BLOCK, label: 'B', x: bx + r * 0.1, y: by + r * 1.4, col: P.teal3 },
        { bit: BTN.LIGHT | BTN.HEAVY, label: 'ULT', x: bx - r * 2.3, y: by - r * 1.9, col: P.purple3, small: true },
      ],
      pause: { x: Math.floor(ui.w / 2) - 14, y: ui.h - 22, w: 28, h: 16 },
    };
  }
  hitPause(p) { const L = this.layout(); return p.x >= L.pause.x && p.x <= L.pause.x + L.pause.w && p.y >= L.pause.y && p.y <= L.pause.y + L.pause.h; }
  bits() {
    if (!this.enabled || !this.active) return 0;
    const L = this.layout();
    let b = 0;
    if (this.stick) {
      const p = this.pointers.get(this.stick.id);
      if (p) {
        const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
        const dead = 7;
        if (dx < -dead) b |= BTN.LEFT; if (dx > dead) b |= BTN.RIGHT;
        if (dy < -dead * 1.4) b |= BTN.UP; if (dy > dead * 1.4) b |= BTN.DOWN;
      }
    }
    for (const [id, p] of this.pointers) {
      if (this.stick?.id === id) continue;
      for (const btn of L.buttons) {
        const rr = btn.small ? L.r * 0.75 : L.r;
        if ((p.x - btn.x) ** 2 + (p.y - btn.y) ** 2 <= (rr + 4) ** 2) b |= btn.bit;
      }
    }
    return b;
  }
  consumePause() { const p = this.pausePressed; this.pausePressed = false; return p; }
  draw(ui) {
    if (!this.enabled || !this.active) return;
    const L = this.layout();
    const bits = this.bits();
    const g = ui.g;
    g.globalAlpha = 0.55;
    // stick
    const sx = this.stick ? this.stick.ox : 50, sy = this.stick ? this.stick.oy : ui.h - 60;
    ring(ui, sx, sy, 26, P.cream2);
    if (this.stick) { const p = this.pointers.get(this.stick.id); if (p) { const dx = Math.max(-22, Math.min(22, p.x - sx)), dy = Math.max(-22, Math.min(22, p.y - sy)); disc(ui, sx + dx, sy + dy, 11, P.cream3); } }
    else disc(ui, sx, sy, 11, P.cream1);
    for (const btn of L.buttons) {
      const rr = btn.small ? L.r * 0.75 : L.r;
      const on = (bits & btn.bit) === btn.bit;
      disc(ui, btn.x, btn.y, rr, on ? P.white : btn.col);
      g.globalAlpha = 0.9;
      ui.text(btn.label, btn.x, btn.y - 4, { font: 'labelB', align: 'center', color: P.ink, outline: null });
      g.globalAlpha = 0.55;
    }
    ui.panel(L.pause.x, L.pause.y, L.pause.w, L.pause.h, { seed: 3, tone: 'dark', plankSize: 16, barnacles: 0, algae: 0, moss: 0, nails: false });
    ui.text('II', L.pause.x + L.pause.w / 2, L.pause.y + 4, { font: 'labelB', align: 'center', color: P.cream4 });
    g.globalAlpha = 1;
  }
}

function disc(ui, cx, cy, r, color) {
  const g = ui.g;
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1); }
}
function ring(ui, cx, cy, r, color) {
  const g = ui.g;
  g.fillStyle = color;
  for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 2, 2); }
}
