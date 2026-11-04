// Camera director: dynamic fight framing, trauma-based shake, zoom punches and cinematic shots.
import * as THREE from 'three';
import { clamp, damp, valueNoise1, ease } from '../core/math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class CameraDirector {
  constructor(camera, bounds) {
    this.cam = camera;
    this.bounds = bounds; // {left, right, top}
    this.pos = new THREE.Vector3(0, 3, 14);
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.fov = 38;
    this.trauma = 0;
    this.kickV = new THREE.Vector3();
    this.zoom = 0;
    this.shot = null; // cinematic override
    this.t = 0;
    this.roll = 0;
    this.shakeScale = 1;
    this.blendIn = 1;
  }
  addTrauma(a) { this.trauma = clamp(this.trauma + a, 0, 1); }
  kick(dx, dy, a = 0.3) { this.kickV.x += dx * a; this.kickV.y += dy * a; }
  zoomPunch(a) { this.zoom = Math.max(this.zoom, a); }

  // shot: {type:'focus', target:Vector3 | fn, offset:[x,y,z], lookOffset, fov, dur, roll, ease}
  setShot(shot) { this.shot = shot ? { t: 0, ...shot } : null; if (shot && shot.cut) this.blendIn = 1; else if (shot) this.blendIn = 0; }

  fightFraming(fA, fB, stage) {
    const ax = fA.x, bx = fB.x;
    const ay = fA.y, by = fB.y;
    const midX = (ax + bx) / 2;
    const sep = Math.abs(ax - bx);
    const top = Math.max(ay, by);
    const dist = clamp(8.4 + sep * 0.6 + top * 0.3, 9.2, 17.5);
    const lookY = 1.55 + Math.min(top, 5) * 0.42 + dist * 0.035;
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) * dist * (this.cam.aspect || 1.7);
    const lx = clamp(midX, stage.left + halfW - 1.2, stage.right - halfW + 1.2);
    const cx = (stage.left + halfW - 1.2 > stage.right - halfW + 1.2) ? (stage.left + stage.right) / 2 : lx;
    return { pos: new THREE.Vector3(cx + (midX - cx) * 0.1, lookY + 0.35 + dist * 0.045, dist), look: new THREE.Vector3(cx, lookY, 0) };
  }

  update(dt, ctx) {
    this.t += dt;
    let tp, tl, tfov = 38, troll = 0, speed = 5;
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      const target = typeof s.target === 'function' ? s.target() : s.target;
      const k = s.dur ? clamp(s.t / s.dur, 0, 1) : 1;
      const off0 = s.offset, off1 = s.offset2 || s.offset;
      const e = (s.ease || ease.inOutSine)(k);
      const off = [off0[0] + (off1[0] - off0[0]) * e, off0[1] + (off1[1] - off0[1]) * e, off0[2] + (off1[2] - off0[2]) * e];
      tp = new THREE.Vector3(target.x + off[0], target.y + off[1], target.z + off[2]);
      const lo = s.lookOffset || [0, 0, 0];
      tl = new THREE.Vector3(target.x + lo[0], target.y + lo[1], target.z + lo[2]);
      tfov = s.fov ?? 30; troll = s.roll ?? 0;
      speed = s.snap ? 60 : (s.speed ?? 8);
      if (s.dur && s.t >= s.dur && s.autoEnd) this.shot = null;
    } else {
      const fr = this.fightFraming(ctx.a, ctx.b, ctx.stage);
      tp = fr.pos; tl = fr.look;
      speed = 4.2;
    }
    const k = 1 - Math.exp(-speed * dt);
    this.pos.lerp(tp, k); this.look.lerp(tl, k);
    this.fov += (tfov - this.fov) * k; this.roll += (troll - this.roll) * k;
    // zoom punch
    this.zoom = Math.max(0, this.zoom - dt * 2.8);
    // kick spring
    this.kickV.multiplyScalar(Math.exp(-dt * 10));
    // shake (trauma^2)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * this.shakeScale;
    const t = this.t * 28;
    const ox = (valueNoise1(t, 1) - 0.5) * 0.9 * sh, oy = (valueNoise1(t, 2) - 0.5) * 0.7 * sh, or = (valueNoise1(t, 3) - 0.5) * 0.06 * sh;
    const cam = this.cam;
    cam.position.copy(this.pos);
    cam.position.x += ox + this.kickV.x; cam.position.y += oy + this.kickV.y;
    // zoom punch pushes toward look target
    _a.subVectors(this.look, cam.position).multiplyScalar(this.zoom * 0.18);
    cam.position.add(_a);
    cam.lookAt(this.look.x + ox * 0.3, this.look.y + oy * 0.3, this.look.z);
    cam.rotateZ(this.roll + or);
    cam.fov = this.fov * (1 - this.zoom * 0.05);
    cam.updateProjectionMatrix();
  }
}
