// Puru the jellyfish: Mimi's companion. Small procedural pixel sprite with a dithered bell,
// face, and verlet tentacles. Skins recolour it (goth = dark, magical = celestial).
import { PixBuf } from './raster.js';
import { Painter, M, R, G, hexU, u32 } from './fighter/kit.js';

const SKIN = {
  default: ['#ffb6d9', '#ff6fb0', '#ffffff'], idol: ['#9cdcff', '#4fa0ff', '#ffffff'], sakura: ['#ffd0e2', '#ff8ab8', '#ffffff'],
  goth: ['#5a3a7a', '#2a1a3a', '#c194ff'], magical: ['#fff4a0', '#ffcf3a', '#ffffff'],
};

export class Puru {
  constructor(skin = 'default') {
    const c = SKIN[skin] || SKIN.default;
    this.buf = new PixBuf(34, 40);
    this.bell = M(R(c[0], { spread: 0.1 }), { bias: 0.2, tex: (t, u, v, x, y) => (y % 4 === 0 && t > 1 && v > -0.2 ? t - 1 : t) });
    this.rim = M(R(c[1]));
    this.ten = M(R(c[1]), { flat: 2 });
    this.shine = hexU(c[2]);
    for (let g = 1; g < 32; g++) this.buf.group(g, hexU('#2a0c1e'), hexU('#6a2a4a'));
    this.t = Math.random() * 10;
    this.tent = [0, 1, 2, 3].map(() => []);
  }
  // mood: 'happy' | 'angry' | 'dizzy' | 'sleep'
  render(dt, o = {}) {
    this.t += dt;
    const B = this.buf; B.clear(); B.face = o.face ?? 1;
    const P = new Painter(B, 17, 14);
    const pulse = Math.sin(this.t * 5);
    const rx = 8 + pulse * 0.8, ry = 6.5 - pulse * 0.6;
    // tentacles: wavy strokes hanging from the rim
    for (let i = 0; i < 4; i++) {
      const bx = -5 + i * 3.4;
      const pts = [];
      for (let k = 0; k <= 4; k++) pts.push([bx + Math.sin(this.t * 4 + i + k * 0.9) * (1 + k * 0.5) - (o.vx || 0) * k * 3, -2 - k * 3.2]);
      P.stroke(pts, 2, 1, this.ten, 1, G.legB);
    }
    P.ell([0, 1], rx, ry, 0, this.bell, 5, G.torso);
    P.cap([-rx + 1, -2], [rx - 1, -2], 1.3, 1.3, this.rim, 5.5, G.torso);
    // face
    const ink = hexU('#2a0c1e');
    const mood = o.mood || 'happy';
    if (mood === 'sleep') { P.line([-4, 2], [-2, 2], ink, 6, G.torso); P.line([2, 2], [4, 2], ink, 6, G.torso); }
    else if (mood === 'angry') { P.line([-4, 3], [-2, 2], ink, 6, G.torso); P.line([2, 2], [4, 3], ink, 6, G.torso); P.px([-3, 1], ink, 6, G.torso); P.px([3, 1], ink, 6, G.torso); }
    else if (mood === 'dizzy') { P.px([-3, 2], ink, 6, G.torso); P.px([-2, 1], ink, 6, G.torso); P.px([3, 2], ink, 6, G.torso); P.px([2, 1], ink, 6, G.torso); }
    else { P.rect([-4, 3], 2, 2, ink, 6, G.torso); P.rect([2, 3], 2, 2, ink, 6, G.torso); P.px([-3.5, 3.5], u32(255, 255, 255), 6.1, G.torso); P.px([2.5, 3.5], u32(255, 255, 255), 6.1, G.torso); }
    P.px([-5.5, 0], hexU('#ff5a8a'), 6, G.torso); P.px([5.5, 0], hexU('#ff5a8a'), 6, G.torso);
    P.px([0, -0.5], ink, 6, G.torso);
    P.px([-3, 6], this.shine, 6, G.torso); P.px([-2, 6.5], this.shine, 6, G.torso);
    return B.finish({ mode: o.mode });
  }
}
