// Low-resolution pixel UI layer. Everything UI is drawn into a small canvas that is
// upscaled by an integer factor with nearest-neighbour filtering, for crisp pixel art.
import { createFonts } from './font.js';
import { P } from './palette.js';
import { woodPanel, metalPlate, drawRope, getIcon, keycap } from './sprites.js';
import { PixelCanvas } from './pixel.js';

export class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.fonts = createFonts();
    this.w = 480; this.h = 270; this.scale = 4;
    this.time = 0;
    this.mouse = { x: -100, y: -100, down: false, clicked: false, rclicked: false, moved: false, wheel: 0, lastMove: 0, inside: false };
    this.textCache = new Map();
    this.hot = null;
    this.cursorVisible = true;
    this.cursorStyle = 'claw';
    this._bindMouse();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(window.innerWidth * dpr), ph = Math.round(window.innerHeight * dpr);
    const s = Math.max(1, Math.floor(ph / 270));
    // keep at least ~470 virtual pixels of width on narrow (portrait) screens
    let scale = s;
    while (scale > 1 && pw / scale < 470) scale--;
    this.scale = scale;
    this.w = Math.ceil(pw / scale); this.h = Math.ceil(ph / scale);
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.canvas.style.width = (this.w * scale) / dpr + 'px';
    this.canvas.style.height = (this.h * scale) / dpr + 'px';
    this.g.imageSmoothingEnabled = false;
    this.cssScale = scale / dpr;
  }

  _bindMouse() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      this.mouse.x = Math.floor((e.clientX - r.left) / this.cssScale);
      this.mouse.y = Math.floor((e.clientY - r.top) / this.cssScale);
    };
    c.addEventListener('pointermove', (e) => { pos(e); this.mouse.moved = true; this.mouse.lastMove = this.time; this.mouse.inside = true; });
    c.addEventListener('pointerdown', (e) => { pos(e); if (e.button === 2) { this.mouse.rclicked = true; return; } this.mouse.down = true; this.mouse.pressed = true; this.mouse.lastMove = this.time; try { c.setPointerCapture(e.pointerId); } catch (_) {} });
    c.addEventListener('pointerup', (e) => { pos(e); if (e.button === 2) return; if (this.mouse.down) this.mouse.clicked = true; this.mouse.down = false; });
    c.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  begin(dt) {
    this.time += dt;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.globalCompositeOperation = 'source-over';
    this.g.clearRect(0, 0, this.w, this.h);
    this.hotThisFrame = null;
  }
  end() {
    this.drawCursor();
    this.mouse.clicked = false; this.mouse.rclicked = false; this.mouse.pressed = false; this.mouse.moved = false; this.mouse.wheel = 0;
    if (this.textCache.size > 900) this.textCache.clear();
  }

  mouseActive() { return this.time - this.mouse.lastMove < 4; }

  // ---------- text
  // opts: font, color, outline, shadow (color), align: left|center|right, valign: top|middle|bottom, alpha
  text(str, x, y, o = {}) {
    str = String(str);
    const font = typeof o.font === 'string' ? this.fonts[o.font] : (o.font || this.fonts.body);
    const color = o.color || P.cream3;
    const outline = o.outline === undefined ? P.ink : o.outline;
    const shadow = o.shadow === undefined ? null : o.shadow;
    const w = font.measure(str);
    let dx = x, dy = y;
    if (o.align === 'center') dx = x - Math.floor(w / 2);
    else if (o.align === 'right') dx = x - w;
    if (o.valign === 'middle') dy = y - Math.floor(font.capHeight / 2);
    else if (o.valign === 'bottom') dy = y - font.capHeight;
    if (o.wave || o.perChar) {
      this._textPerChar(str, dx, dy, font, color, outline, shadow, o);
      return w;
    }
    const key = `${font.id}|${color}|${outline}|${shadow}|${str}`;
    let c = this.textCache.get(key);
    if (!c) {
      const pad = 2;
      const cw = w + pad * 2 + 2, ch = font.cellH + pad * 2 + 2;
      const cv = document.createElement('canvas'); cv.width = Math.max(1, cw); cv.height = Math.max(1, ch);
      const g = cv.getContext('2d');
      if (shadow) font.drawRaw(g, str, pad + 1, pad + 2, shadow);
      if (outline) {
        const offs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [ox, oy] of offs) font.drawRaw(g, str, pad + ox, pad + oy, outline);
        if (shadow == null) font.drawRaw(g, str, pad, pad + 2, outline);
      }
      font.drawRaw(g, str, pad, pad, color);
      c = cv; this.textCache.set(key, c);
    }
    const g = this.g;
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    g.drawImage(c, Math.round(dx) - 2, Math.round(dy) - 2);
    if (o.alpha !== undefined) g.globalAlpha = 1;
    return w;
  }
  _textPerChar(str, dx, dy, font, color, outline, shadow, o) {
    const g = this.g;
    const t = this.time;
    const per = o.perChar || ((i) => [0, Math.round(Math.sin(t * (o.waveSpeed || 6) + i * 0.6) * (o.wave || 1))]);
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    if (shadow) font.drawRaw(g, str, dx + 1, dy + 2, shadow, per);
    if (outline) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) font.drawRaw(g, str, dx + ox, dy + oy, outline, per);
      if (!shadow) font.drawRaw(g, str, dx, dy + 2, outline, per);
    }
    font.drawRaw(g, str, dx, dy, color, per);
    if (o.alpha !== undefined) g.globalAlpha = 1;
  }
  measure(str, font = 'body') { return (typeof font === 'string' ? this.fonts[font] : font).measure(String(str)); }
  wrap(str, maxW, font = 'body') { return (typeof font === 'string' ? this.fonts[font] : font).wrap(String(str), maxW); }
  // multi-line text block; returns height used
  para(str, x, y, maxW, o = {}) {
    const font = typeof o.font === 'string' ? this.fonts[o.font] : (o.font || this.fonts.body);
    const lines = font.wrap(String(str), maxW);
    const lh = o.lineHeight || font.lineHeight + 1;
    let chars = o.reveal === undefined ? Infinity : o.reveal;
    lines.forEach((ln, i) => {
      if (chars <= 0) return;
      const s = ln.slice(0, Math.max(0, chars));
      chars -= ln.length + 1;
      this.text(s, o.align === 'center' ? x + Math.floor(maxW / 2) : x, y + i * lh, { ...o, font, align: o.align === 'center' ? 'center' : 'left' });
    });
    return lines.length * lh;
  }

  // ---------- drawing primitives
  rect(x, y, w, h, color, alpha) {
    const g = this.g; if (alpha !== undefined) g.globalAlpha = alpha;
    g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha !== undefined) g.globalAlpha = 1;
  }
  frame(x, y, w, h, color) { this.rect(x, y, w, 1, color); this.rect(x, y + h - 1, w, 1, color); this.rect(x, y, 1, h, color); this.rect(x + w - 1, y, 1, h, color); }
  img(c, x, y, o = {}) {
    if (!c) return;
    const g = this.g;
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    const s = o.scale || 1;
    const w = c.width * s, h = c.height * s;
    let dx = x, dy = y;
    if (o.center) { dx = x - Math.floor(w / 2); dy = y - Math.floor(h / 2); }
    if (o.flip) { g.save(); g.translate(Math.round(dx) + w, Math.round(dy)); g.scale(-1, 1); g.drawImage(c, 0, 0, w, h); g.restore(); }
    else g.drawImage(c, Math.round(dx), Math.round(dy), w, h);
    if (o.alpha !== undefined) g.globalAlpha = 1;
  }
  icon(name, x, y, o = {}) { this.img(getIcon(name), x, y, o); }
  iconImg(name) { return getIcon(name); }
  panel(x, y, w, h, o = {}) { const c = woodPanel(Math.round(w), Math.round(h), o); this.img(c, x, y, o); return c; }
  metal(x, y, w, h, o = {}) { this.img(metalPlate(Math.round(w), Math.round(h), o), x, y, o); }
  rope(x0, y0, x1, y1, phase = 0) { drawRope(this.g, x0, y0, x1, y1, phase); }
  key(label, x, y, o = {}) { const c = keycap(label, this.fonts.label, o); this.img(c, x, y); return c.width; }
  shadowRect(x, y, w, h, a = 0.35) { this.rect(x + 2, y + 3, w, h, P.ink, a); }
  dim(a = 0.5, color = P.deep0) { this.rect(0, 0, this.w, this.h, color, a); }

  // vertical gradient with dithering
  gradient(x, y, w, h, c0, c1, steps = 6) {
    for (let i = 0; i < steps; i++) {
      const y0 = y + Math.floor((h * i) / steps), y1 = y + Math.floor((h * (i + 1)) / steps);
      this.rect(x, y0, w, y1 - y0, mix(c0, c1, i / (steps - 1)));
    }
  }

  inRect(x, y, w, h) { const m = this.mouse; return m.x >= x && m.y >= y && m.x < x + w && m.y < y + h; }
  hover(x, y, w, h) { return this.mouse.inside && this.mouseActive() && this.inRect(x, y, w, h); }
  clicked(x, y, w, h) { return this.mouse.clicked && this.inRect(x, y, w, h); }

  // A plank button. Returns {hover, clicked}
  plank(x, y, w, h, label, o = {}) {
    const hov = this.hover(x, y, w, h);
    const sel = o.selected || false;
    const dis = o.disabled || false;
    const press = hov && this.mouse.down;
    const t = this.time;
    const lift = sel ? Math.round(Math.sin(t * 5) * 0.6 - 1) : 0;
    const dy = press ? 1 : lift;
    const tone = dis ? 'gray' : (o.tone || (sel ? 'light' : 'mid'));
    this.shadowRect(x, y + dy, w, h, 0.4);
    this.panel(x, y + dy, w, h, { seed: o.seed || (label.length * 7 + w), tone, plankSize: h, barnacles: o.barnacles ?? 1, algae: o.algae ?? 0.4, moss: 0.3, nails: true });
    if (sel) {
      // glow pulse border
      const a = 0.55 + Math.sin(t * 6) * 0.25;
      this.g.globalAlpha = a; this.frame(x - 1, y + dy - 1, w + 2, h + 2, o.glow || P.gold3); this.g.globalAlpha = 1;
    }
    const font = o.font || 'labelB';
    const col = dis ? P.metal4 : (sel ? (o.selColor || P.gold4) : (o.color || P.cream3));
    const f = this.fonts[font];
    const ty = y + dy + Math.floor((h - f.capHeight) / 2);
    if (o.icon) {
      const ic = getIcon(o.icon);
      const tw = f.measure(label) + ic.width + 4;
      const sx = x + Math.floor((w - tw) / 2);
      this.img(ic, sx, y + dy + Math.floor((h - ic.height) / 2));
      this.text(label, sx + ic.width + 4, ty, { font, color: col, shadow: null });
    } else {
      this.text(label, x + Math.floor(w / 2), ty, { font, color: col, align: 'center' });
    }
    if (sel && !o.noPointer) {
      const bob = Math.round(Math.sin(t * 8) * 1.5);
      this.icon('arrowR', x - 10 + bob, y + dy + Math.floor((h - 11) / 2));
    }
    return { hover: hov, clicked: !dis && this.mouse.clicked && this.inRect(x, y, w, h) };
  }

  // Hanging sign: a wooden board hanging from two ropes anchored above
  hangingSign(x, y, w, h, o = {}) {
    const t = this.time;
    const sway = Math.round(Math.sin(t * (o.swaySpeed || 1.3) + (o.phase || 0)) * (o.sway ?? 1.5));
    const ay = o.anchorY ?? -2;
    this.rope(x + 8, ay, x + 8 + sway, y + 3, Math.floor(t * 2));
    this.rope(x + w - 9, ay, x + w - 9 + sway, y + 3, Math.floor(t * 2) + 1);
    this.shadowRect(x + sway, y, w, h, 0.45);
    this.panel(x + sway, y, w, h, { seed: o.seed || 11, tone: o.tone || 'mid', plankSize: o.plankSize || 12, barnacles: o.barnacles ?? 3, algae: o.algae ?? 0.8, moss: 0.6 });
    // rope knots
    this.rect(x + 7 + sway, y + 2, 3, 3, P.cream1); this.rect(x + w - 10 + sway, y + 2, 3, 3, P.cream1);
    return sway;
  }

  drawCursor() {
    if (!this.cursorVisible || !this.mouse.inside || !this.mouseActive()) return;
    const c = cursorSprite(this.mouse.down);
    this.g.drawImage(c, this.mouse.x - 1, this.mouse.y - 1);
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
  return '#' + [r, g, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

let _cur = {};
function cursorSprite(down) {
  const k = down ? 'd' : 'u';
  if (_cur[k]) return _cur[k];
  const pc = new PixelCanvas(12, 13);
  // little orange claw pointer
  const rows = down ? [
    'oo..........', 'oCo.........', 'oCCo........', 'oCWCo.......', 'oCCCCo......', 'oCCCCCo.....', 'oCCCCCCo....', 'oCCCCoooo...', 'oCCoCo......', 'oCo.oCo.....', 'oo..oCo.....', '.....oo.....', '............',
  ] : [
    'oo..........', 'oCo.........', 'oCCo........', 'oCWCo.......', 'oCCCCo......', 'oCCCCCo.....', 'oCCCCCCo....', 'oCCCCCCCo...', 'oCCCCoooo...', 'oCCoCo......', 'oCo.oCo.....', 'oo...oCo....', '......oo....',
  ];
  pc.art(rows, { o: P.ink, C: P.orange3, W: P.orange4 });
  _cur[k] = pc.commit();
  return _cur[k];
}
