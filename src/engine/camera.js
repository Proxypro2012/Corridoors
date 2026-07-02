// camera: smooth follow, screen shake, cutscene tweening

import { lerp, clamp, easeInOut } from './math.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.follow = null;        // {x, y} to track
    this.lookAhead = 40;       // bias toward facing/aim
    this.aimBias = { x: 0, y: 0 };
    this.shakeMag = 0;
    this.shakeDur = 0;
    this.shakeT = 0;
    this.sx = 0; this.sy = 0;  // current shake offset
    this.tween = null;         // {fx, fy, fz, tx, ty, tz, t, dur, ease}
    this.viewW = 1280; this.viewH = 720;
  }

  snapTo(x, y, zoom = this.zoom) {
    this.x = x; this.y = y; this.zoom = zoom; this.targetZoom = zoom;
    this.tween = null;
  }

  shake(mag = 8, dur = 0.4) {
    if (mag >= this.shakeMag || this.shakeT >= this.shakeDur) {
      this.shakeMag = mag; this.shakeDur = dur; this.shakeT = 0;
    }
  }

  // cutscene helper: glide to a point/zoom over dur seconds
  tweenTo(x, y, zoom, dur) {
    this.tween = { fx: this.x, fy: this.y, fz: this.zoom, tx: x, ty: y, tz: zoom, t: 0, dur };
  }

  get tweening() { return !!this.tween; }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = easeInOut(clamp(tw.t / tw.dur, 0, 1));
      this.x = lerp(tw.fx, tw.tx, k);
      this.y = lerp(tw.fy, tw.ty, k);
      this.zoom = lerp(tw.fz, tw.tz, k);
      if (tw.t >= tw.dur) this.tween = null;
    } else if (this.follow) {
      const tx = this.follow.x + this.aimBias.x;
      const ty = this.follow.y + this.aimBias.y;
      const s = 1 - Math.pow(0.0018, dt); // framerate-independent smoothing
      this.x = lerp(this.x, tx, s);
      this.y = lerp(this.y, ty, s);
      this.zoom = lerp(this.zoom, this.targetZoom, s * 0.6);
    }

    // shake with decay
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const f = 1 - this.shakeT / this.shakeDur;
      this.sx = (Math.random() * 2 - 1) * this.shakeMag * f;
      this.sy = (Math.random() * 2 - 1) * this.shakeMag * f;
    } else { this.sx = 0; this.sy = 0; }
  }

  apply(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x + this.sx, -this.y + this.sy);
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x - this.sx,
      y: (sy - this.viewH / 2) / this.zoom + this.y - this.sy,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x + this.sx) * this.zoom + this.viewW / 2,
      y: (wy - this.y + this.sy) * this.zoom + this.viewH / 2,
    };
  }

  // visible world rect (with margin) for culling
  viewRect(margin = 100) {
    const hw = this.viewW / 2 / this.zoom + margin;
    const hh = this.viewH / 2 / this.zoom + margin;
    return { x: this.x - hw, y: this.y - hh, w: hw * 2, h: hh * 2 };
  }
}
