// Bitmap fonts rasterised from licensed (OFL) pixel fonts at startup.
// Alpha is thresholded so text is perfectly crisp when the UI canvas is upscaled.

const CHARSET = (() => {
  let s = '';
  for (let c = 32; c < 127; c++) s += String.fromCharCode(c);
  return s + '¡¿áéíóúñÑüÁÉÍÓÚ';
})();

const FONT_FILES = {
  tiny5: 'fonts/tiny5-latin-400-normal.woff2',
  silk: 'fonts/silkscreen-latin-400-normal.woff2',
  silkb: 'fonts/silkscreen-latin-700-normal.woff2',
  jersey: 'fonts/jersey-10-latin-400-normal.woff2',
};

let fontsLoaded = false;
export async function loadFontFaces(base = './') {
  if (fontsLoaded) return;
  const jobs = Object.entries(FONT_FILES).map(async ([name, file]) => {
    try {
      const ff = new FontFace('mm_' + name, `url(${base}${file})`);
      await ff.load();
      document.fonts.add(ff);
    } catch (e) { console.warn('font load failed', name, e); }
  });
  await Promise.all(jobs);
  fontsLoaded = true;
}

export class BitmapFont {
  constructor(id, family, size, opts = {}) {
    this.id = id;
    this.family = family;
    this.size = size;
    this.threshold = opts.threshold ?? 128;
    this.spacing = opts.spacing ?? 0;
    this.spaceWidth = opts.spaceWidth;
    this.yOffset = opts.yOffset ?? 0;
    this.glyphs = new Map();
    this.tinted = new Map();
    this.build();
  }

  build() {
    const ctx0 = document.createElement('canvas').getContext('2d');
    ctx0.font = `${this.size}px ${this.family}`;
    const mM = ctx0.measureText('M');
    const mg = ctx0.measureText('gjpqy|');
    this.ascent = Math.ceil(mM.actualBoundingBoxAscent || this.size * 0.7);
    const descent = Math.ceil(mg.actualBoundingBoxDescent || this.size * 0.25);
    this.cellH = this.ascent + descent + 2;
    this.lineHeight = Math.ceil(this.ascent + descent + Math.max(1, this.size * 0.15));
    this.capHeight = this.ascent;
    const pad = 2;
    // measure all
    const entries = [];
    let totalW = 0;
    for (const ch of CHARSET) {
      let adv = Math.round(ctx0.measureText(ch).width);
      if (ch === ' ' && this.spaceWidth) adv = this.spaceWidth;
      const w = Math.max(1, adv + pad * 2);
      entries.push({ ch, adv, w });
      totalW += w;
    }
    const cols = 32;
    const rows = Math.ceil(entries.length / cols);
    const cellW = Math.max(...entries.map((e) => e.w));
    const atlas = document.createElement('canvas');
    atlas.width = cols * cellW; atlas.height = rows * this.cellH;
    const g = atlas.getContext('2d');
    g.font = `${this.size}px ${this.family}`;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    entries.forEach((e, i) => {
      const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * this.cellH;
      g.fillText(e.ch, cx + pad, cy + this.ascent + 1 + this.yOffset);
      this.glyphs.set(e.ch, { x: cx, y: cy, w: e.w, h: this.cellH, adv: e.adv, pad });
    });
    const id = g.getImageData(0, 0, atlas.width, atlas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] >= this.threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a;
    }
    g.putImageData(id, 0, 0);
    this.atlas = atlas;
  }

  glyph(ch) { return this.glyphs.get(ch) || this.glyphs.get('?'); }

  measure(str) {
    let w = 0;
    for (const ch of str) w += this.glyph(ch).adv + this.spacing;
    return Math.max(0, w - this.spacing);
  }

  atlasFor(color) {
    let c = this.tinted.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = this.atlas.width; c.height = this.atlas.height;
      const g = c.getContext('2d');
      g.drawImage(this.atlas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      this.tinted.set(color, c);
    }
    return c;
  }

  // draw raw (no outline), top-left anchored at (x,y) = top of cap height
  drawRaw(ctx, str, x, y, color, perChar) {
    const at = this.atlasFor(color);
    let cx = Math.round(x);
    let i = 0;
    for (const ch of str) {
      const gl = this.glyph(ch);
      let ox = 0, oy = 0;
      if (perChar) { const o = perChar(i, ch); ox = o[0] | 0; oy = o[1] | 0; }
      if (ch !== ' ') ctx.drawImage(at, gl.x, gl.y, gl.w, gl.h, cx - gl.pad + ox, Math.round(y) - 1 + oy, gl.w, gl.h);
      cx += gl.adv + this.spacing; i++;
    }
    return cx - x;
  }

  wrap(str, maxW) {
    const out = [];
    for (const para of String(str).split('\n')) {
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (this.measure(test) > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      out.push(line);
    }
    return out;
  }
}

export function createFonts() {
  return {
    body: new BitmapFont('body', 'mm_tiny5', 8, { threshold: 128 }),
    body2: new BitmapFont('body2', 'mm_tiny5', 16, { threshold: 128 }),
    label: new BitmapFont('label', 'mm_silk', 8, { threshold: 128 }),
    labelB: new BitmapFont('labelB', 'mm_silkb', 8, { threshold: 128 }),
    label2: new BitmapFont('label2', 'mm_silkb', 16, { threshold: 128 }),
    big: new BitmapFont('big', 'mm_jersey', 20, { threshold: 110 }),
    huge: new BitmapFont('huge', 'mm_jersey', 40, { threshold: 110 }),
    mega: new BitmapFont('mega', 'mm_jersey', 64, { threshold: 110 }),
  };
}
