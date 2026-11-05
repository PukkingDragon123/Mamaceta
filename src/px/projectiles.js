// Pixel sprites for projectiles and skill objects living in sim.s.proj.
import { PPU } from './display.js';
import { pxCircle, pxDisc, pxLine, drawPoly } from './fx.js';

const art = (rows, pal) => {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][x]; if (ch === '.') continue; g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
  return c;
};
const K = '#140a0c';
const JUNK = [
  art(['..kkkk....', '..kbbk....', '..kbbk....', '..kbbkkk..', '.kbbbbbbk.', 'kbbbbbbbbk', 'kssssssssk', '.kkkkkkkk.'], { k: K, b: '#6a3a1e', s: '#2a1a10' }), // boot
  art(['.....kk.....', '..kkkggk..kk', '.kggggggkkgk', 'kgwkgggggggk', '.kggggggkkgk', '..kkkggk..kk', '.....kk.....'], { k: K, g: '#6aa0c8', w: '#ffffff' }), // fish
  art(['.kkkkk.', 'kmmmmmk', 'krrrrrk', 'kwwwwwk', 'krrrrrk', 'kmmmmmk', '.kkkkk.'], { k: K, m: '#9aa6b2', r: '#d8322a', w: '#f4f0e6' }), // can
  art(['...kkk...', '..kyyyk..', '..kykyko.', '...kyykoo', '.kkyyyk..', 'kyyyyyyk.', '.kyyyyk..', '..kkkk...'], { k: K, y: '#ffd040', o: '#ff8a2a' }), // duck
  art(['....kk....', '...kmmk...', '....kk....', '..kkmmkk..', '....mm....', '....mm....', 'k...mm...k', 'mk..mm..km', '.mmmmmmmm.', '..kkkkkk..'], { k: K, m: '#5a6272' }), // anchor
];
const HOOK = art(['...kk...', '..kmmk..', '...kk...', '...mm...', '.kmmmmk.', '...mm...', 'mk.mm.km', '.mmmmmm.'], { k: K, m: '#b0bac6' });
const PINATA = art(['....kk....', '...kRRk...', '.kkgRRbkk.', 'kgggyybbbk', '.kgyYYybk.', '..kYYYYk..', '.kpk..kpk.', 'kpk....kpk'], { k: K, R: '#ff4f6a', g: '#3fd16a', b: '#4f8fff', y: '#f0c33c', Y: '#ffe060', p: '#ff6fb0' });

const HUSKS = new Map();
export function drawProjectiles(d, s, views, t, fxRef) {
  const g = d.g;
  for (const p of s.proj) {
    const x = d.bx(p.x), y = d.by(p.y);
    switch (p.type) {
      case 'cannon': {
        const r = Math.round(p.w * PPU * 0.5 * (1 + Math.sin(t * 30) * 0.06));
        g.fillStyle = '#0d3a4a'; pxDisc(g, x, y, r);
        g.fillStyle = '#9ff3ff'; pxCircle(g, x, y, r, 2);
        g.fillStyle = '#ffffff'; pxCircle(g, x - Math.sign(p.vx) * 3, y, Math.max(2, r - 6), 1);
        g.fillRect(x - Math.round(r * 0.45), y - Math.round(r * 0.45), 3, 2);
        // trailing pixels
        g.fillStyle = '#bff8ff';
        for (let i = 1; i < 5; i++) g.fillRect(x - Math.sign(p.vx) * (r + i * 4), y + Math.round(Math.sin(t * 20 + i) * 3), 2, 2);
        break;
      }
      case 'junk': {
        const img = JUNK[p.data] || JUNK[0];
        const rot = Math.floor(t * 12 + p.id) % 4;
        drawRot(g, img, x, y, rot, p.vx < 0);
        break;
      }
      case 'puru': {
        const v = views?.find((w) => w.puru && w.i === p.owner);
        if (v) v.drawPuru(d, p.x, p.y - 0.15, p.state === 'return' ? 'happy' : 'angry');
        break;
      }
      case 'bubble': {
        const r = Math.round(p.w * PPU * 0.5 * (1 + Math.sin(t * 6) * 0.05));
        g.fillStyle = '#bff8ff'; pxCircle(g, x, y, r, 1);
        g.fillStyle = '#ffffff'; g.fillRect(x - Math.round(r * 0.5), y - Math.round(r * 0.55), 3, 2); g.fillRect(x - Math.round(r * 0.6), y - Math.round(r * 0.3), 1, 2);
        g.fillStyle = '#ff6fb0'; pxCircle(g, x, y, r - 2, 1);
        break;
      }
      case 'hiccup': { g.fillStyle = '#bff8ff'; pxCircle(g, x, y, 5, 1); g.fillStyle = '#ffffff'; g.fillRect(x - 2, y - 3, 2, 1); break; }
      case 'burp': {
        g.fillStyle = '#8ac04a';
        for (let i = 0; i < 6; i++) pxDisc(g, x + Math.round(Math.cos(i + t * 3) * 14), y + Math.round(Math.sin(i * 1.7 + t * 2) * 10), 6 + (i % 3));
        g.fillStyle = '#b8e06a';
        for (let i = 0; i < 4; i++) pxDisc(g, x + Math.round(Math.cos(i * 2 + t * 4) * 9), y - 4 + Math.round(Math.sin(i * 2.3) * 6), 4);
        break;
      }
      case 'quake': {
        g.fillStyle = '#8a7350';
        for (let i = 0; i < 5; i++) { const h = 4 + ((p.id * 7 + i * 13 + Math.floor(t * 30)) % 9); g.fillRect(x - 10 + i * 5, y - h, 4, h); }
        g.fillStyle = '#c8b090';
        for (let i = 0; i < 3; i++) g.fillRect(x - 8 + i * 7, y - 12 - (i % 2) * 4, 3, 3);
        break;
      }
      case 'mine': {
        const pulse = Math.floor(t * 4 + p.id) % 2;
        const r = Math.round(p.w * PPU * 0.42);
        g.fillStyle = '#0d3a4a'; pxDisc(g, x, y, r);
        g.fillStyle = pulse ? '#9ff3ff' : '#49c2bd'; pxCircle(g, x, y, r, 2);
        g.fillStyle = '#ffffff'; g.fillRect(x - 3, y - 4, 3, 2);
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t; g.fillStyle = '#bff8ff'; g.fillRect(x + Math.round(Math.cos(a) * (r + 3)), y + Math.round(Math.sin(a) * (r + 3)), 2, 2); }
        if (p.t > p.arm && pulse) { g.fillStyle = '#ff4a4a'; g.fillRect(x - 1, y - 1, 3, 3); }
        break;
      }
      case 'coralWall': {
        const w = Math.round(p.w * PPU), h = Math.round(p.h * PPU);
        const grow = Math.min(1, p.t / 12);
        const hh = Math.round(h * grow);
        const x0 = x - (w >> 1), y0 = d.by(p.y);
        const cols = ['#ff7a5a', '#ffb48a', '#d84a5a', '#8a2a3a'];
        for (let i = 0; i < 7; i++) {
          const bx = x0 + Math.round((i / 6) * w), bh = Math.round(hh * (0.55 + ((i * 37) % 10) / 22));
          g.fillStyle = '#3a0a14'; g.fillRect(bx - 3, y0 - bh - 1, 6, bh + 1);
          g.fillStyle = cols[i % 3]; g.fillRect(bx - 2, y0 - bh, 4, bh);
          g.fillStyle = cols[1]; g.fillRect(bx - 2, y0 - bh, 2, 2);
          for (let k = 6; k < bh; k += 7) { g.fillStyle = cols[3]; g.fillRect(bx + (k % 2 ? 2 : -4), y0 - k, 3, 2); }
        }
        if (p.hp <= 1 && Math.floor(t * 10) % 2) { g.fillStyle = '#ffffff'; g.fillRect(x - 2, y0 - hh + 4, 4, 2); }
        break;
      }
      case 'hook': {
        const v = views?.[p.owner];
        if (v) {
          const h = v.handPos(true);
          g.fillStyle = '#6b7682';
          const hx = d.bx(h.x), hy = d.by(h.y);
          const n = Math.max(2, Math.round(Math.hypot(x - hx, y - hy) / 4));
          for (let i = 0; i <= n; i++) { const k = i / n; g.fillRect(Math.round(hx + (x - hx) * k) - 1, Math.round(hy + (y - hy) * k + Math.sin(k * Math.PI) * 3) - 1, 3, 2); }
        }
        drawRot(g, HOOK, x, y, p.vx < 0 ? 3 : 1, false);
        break;
      }
      case 'sonic': {
        const k = p.t / 46;
        const R = Math.round(10 + k * 26);
        g.fillStyle = k < 0.5 ? '#ff6fb0' : '#ffb6d9';
        for (let j = 0; j < 3; j++) {
          const rr = R - j * 7;
          if (rr < 4) continue;
          for (let a = -1.1; a <= 1.1; a += 0.08) g.fillRect(x + Math.round(Math.cos(a) * rr * Math.sign(p.vx)), y + Math.round(Math.sin(a) * rr * 1.5), 2, 2);
        }
        g.fillStyle = '#fff08a';
        for (let i = 0; i < 3; i++) g.fillRect(x - Math.sign(p.vx) * (6 + i * 7), y - 18 + Math.round(Math.sin(t * 10 + i) * 4) + i * 12, 3, 3);
        break;
      }
      case 'pinataBomb': drawRot(g, PINATA, x, y, Math.floor(t * 10 + p.id) % 4, p.vx < 0); break;
      case 'husk': {
        const v = views?.[p.owner];
        if (v && v.canvas) {
          let h = HUSKS.get(p.id);
          if (!h) { const c = document.createElement('canvas'); c.width = v.canvas.width; c.height = v.canvas.height; const gg = c.getContext('2d'); gg.drawImage(v.canvas, 0, 0); gg.globalCompositeOperation = 'source-atop'; gg.globalAlpha = 0.55; gg.fillStyle = '#e8dcc0'; gg.fillRect(0, 0, c.width, c.height); h = { c, ox: v.spr.ox, oy: v.spr.oy, flip: p.face < 0 }; HUSKS.set(p.id, h); if (HUSKS.size > 8) HUSKS.delete(HUSKS.keys().next().value); }
          const flicker = p.life < 40 && Math.floor(t * 20) % 2;
          if (!flicker) v.blit(d, h.c, p.x, p.y, h.flip, h.ox, h.oy);
        }
        break;
      }
      default: break;
    }
  }
}

function drawRot(g, img, x, y, rot, flip) {
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.rotate((rot % 4) * Math.PI / 2);
  g.drawImage(img, -(img.width >> 1), -(img.height >> 1));
  g.restore();
}
