// Anime-style manga panels: extra close-up camera renders drawn straight into screen rectangles
// (used for the KO finisher duel, ultimate activations and Bobby's demon transformation).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class MangaPanels {
  constructor() {
    this.cams = [new THREE.PerspectiveCamera(30, 1, 0.05, 80), new THREE.PerspectiveCamera(30, 1, 0.05, 80)];
    this.active = false;
    this.t = 0;
    this.layout = [];
  }

  // targets: [{pos: Vector3 (head), face: +-1, shake}], rects in normalized screen coords [x, y, w, h] (y from top)
  set(targets, rects) { this.targets = targets; this.rects = rects; this.active = true; }
  clear() { this.active = false; }

  render(renderer, scene, t) {
    if (!this.active || !this.targets) return;
    const gl = renderer.gl;
    const size = gl.getSize(new THREE.Vector2());
    const prevTM = gl.toneMapping, prevExp = gl.toneMappingExposure;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
    const prevAuto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.setScissorTest(true);
    this.layout = [];
    this.targets.forEach((tg, i) => {
      const r = this.rects[i];
      if (!r) return;
      const x = Math.round(r[0] * size.x), w = Math.round(r[2] * size.x), h = Math.round(r[3] * size.y);
      const y = Math.round(size.y - (r[1] * size.y) - h);
      const cam = this.cams[i];
      cam.aspect = w / h;
      const sh = tg.shake || 0;
      const jitter = (Math.random() - 0.5) * sh * 0.05;
      cam.position.set(tg.pos.x + tg.face * (tg.dist ?? 1.25) + jitter, tg.pos.y + (tg.up ?? 0.1) + jitter, tg.pos.z + (tg.side ?? 1.15));
      cam.lookAt(tg.pos.x + tg.face * 0.1, tg.pos.y - 0.05, tg.pos.z);
      cam.fov = tg.fov ?? 26;
      cam.updateProjectionMatrix();
      gl.setViewport(x, y, w, h);
      gl.setScissor(x, y, w, h);
      gl.setClearColor(tg.bg ?? 0x000000, 1);
      gl.clear(true, true, false);
      gl.render(scene, cam);
      this.layout.push(r);
    });
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.x, size.y);
    gl.autoClear = prevAuto;
    gl.toneMapping = prevTM; gl.toneMappingExposure = prevExp;
  }

  // draw manga borders + speed lines on the UI canvas
  drawUI(ui, t, colors = ['#ff5a3a', '#3f8fff']) {
    if (!this.active) return;
    const g = ui.g;
    this.rects?.forEach((r, i) => {
      const x = Math.round(r[0] * ui.w), y = Math.round(r[1] * ui.h), w = Math.round(r[2] * ui.w), h = Math.round(r[3] * ui.h);
      // speed lines inside the panel (radial streaks from the center)
      g.save();
      g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.globalAlpha = 0.35;
      g.fillStyle = '#ffffff';
      const cx = x + w / 2, cy = y + h / 2;
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * Math.PI * 2 + Math.floor(t * 12) * 0.37;
        const r0 = Math.max(w, h) * (0.45 + ((k * 7) % 5) * 0.04);
        for (let s = 0; s < 10; s++) {
          const rr = r0 + s * 3;
          g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 2, 2);
        }
      }
      g.restore();
      // thick ink border + player colour inner line
      ui.rect(x - 3, y - 3, w + 6, 3, '#000'); ui.rect(x - 3, y + h, w + 6, 3, '#000');
      ui.rect(x - 3, y - 3, 3, h + 6, '#000'); ui.rect(x + w, y - 3, 3, h + 6, '#000');
      ui.frame(x - 1, y - 1, w + 2, h + 2, colors[i] || '#fff');
    });
  }
}
