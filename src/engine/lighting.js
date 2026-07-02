// top-down lighting: darkness layer with punched-out lights + additive color glow

import { TAU } from './math.js';

export class Lighting {
  constructor() {
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.lights = [];   // {x,y,r,i}  punched out of darkness
    this.cones = [];    // {x,y,ang,spread,len,i}
    this.glows = [];    // {x,y,r,color,a} additive color pass
    this.ambient = 0.86; // 0 = fully lit, 1 = pitch black
  }

  resize(w, h) {
    this.dark.width = w;
    this.dark.height = h;
  }

  begin(ambient) {
    this.ambient = ambient;
    this.lights.length = 0;
    this.cones.length = 0;
    this.glows.length = 0;
  }

  addLight(x, y, r, i = 1) { this.lights.push({ x, y, r, i }); }
  addCone(x, y, ang, spread, len, i = 1) { this.cones.push({ x, y, ang, spread, len, i }); }
  addGlow(x, y, r, color, a = 0.5) { this.glows.push({ x, y, r, color, a }); }

  // render darkness on top of the world. camera must match world pass.
  render(ctx, camera) {
    const d = this.dctx, W = this.dark.width, H = this.dark.height;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = `rgba(2,2,6,${this.ambient})`;
    d.fillRect(0, 0, W, H);

    // punch lights out of the darkness
    d.globalCompositeOperation = 'destination-out';
    camera.apply(d);

    for (const l of this.lights) {
      const g = d.createRadialGradient(l.x, l.y, l.r * 0.08, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(255,255,255,${l.i})`);
      g.addColorStop(0.55, `rgba(255,255,255,${l.i * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      d.fillStyle = g;
      d.beginPath();
      d.arc(l.x, l.y, l.r, 0, TAU);
      d.fill();
    }

    for (const c of this.cones) {
      const g = d.createRadialGradient(c.x, c.y, 10, c.x, c.y, c.len);
      g.addColorStop(0, `rgba(255,255,255,${c.i})`);
      g.addColorStop(0.7, `rgba(255,255,255,${c.i * 0.4})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      d.fillStyle = g;
      d.beginPath();
      d.moveTo(c.x, c.y);
      d.arc(c.x, c.y, c.len, c.ang - c.spread / 2, c.ang + c.spread / 2);
      d.closePath();
      d.fill();
    }

    // composite darkness over scene
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.dark, 0, 0);

    // additive colored glows (drawn in world space)
    ctx.save();
    camera.apply(ctx);
    ctx.globalCompositeOperation = 'lighter';
    for (const gl of this.glows) {
      const g = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
      g.addColorStop(0, gl.color.replace('ALPHA', gl.a.toFixed(3)));
      g.addColorStop(1, gl.color.replace('ALPHA', '0'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gl.x, gl.y, gl.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// helper to build glow color strings: glowColor(109,179,255) -> 'rgba(109,179,255,ALPHA)'
export const glowColor = (r, g, b) => `rgba(${r},${g},${b},ALPHA)`;
