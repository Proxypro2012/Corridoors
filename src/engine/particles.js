// lightweight particle system

import { TAU } from './math.js';

export class Particles {
  constructor() {
    this.list = [];
  }

  spawn(o) {
    // o: {x,y, vx,vy, life, size, sizeEnd, color, additive, drag, grav, spin}
    this.list.push({
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 1, maxLife: o.life || 1,
      size: o.size || 4, sizeEnd: o.sizeEnd ?? 0,
      color: o.color || '255,255,255', alpha: o.alpha ?? 1,
      additive: !!o.additive,
      drag: o.drag ?? 0.99, grav: o.grav || 0,
      rot: Math.random() * TAU, spin: o.spin || 0,
      square: !!o.square,
    });
  }

  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (opts.speed || 60) * (0.4 + Math.random() * 0.9);
      this.spawn({
        x: x + (Math.random() - 0.5) * (opts.jitter || 6),
        y: y + (Math.random() - 0.5) * (opts.jitter || 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (opts.life || 0.8) * (0.6 + Math.random() * 0.8),
        size: (opts.size || 5) * (0.6 + Math.random() * 0.9),
        sizeEnd: opts.sizeEnd ?? 0,
        color: opts.color, additive: opts.additive,
        drag: opts.drag ?? 0.94, grav: opts.grav || 0,
        spin: (Math.random() - 0.5) * 4, square: opts.square,
        alpha: opts.alpha ?? 1,
      });
    }
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      p.vy += p.grav * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      const size = p.sizeEnd + (p.size - p.sizeEnd) * t;
      ctx.globalAlpha = Math.min(1, t * 2) * p.alpha;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.fillStyle = `rgba(${p.color},1)`;
      if (p.square) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
