// the Figure: blind, hunts by sound. patrols the library (door 50)
// and the electrical room (door 100).

import { TAU, dist, clamp, rectContains, angleTo } from '../engine/math.js';
import { glowColor } from '../engine/lighting.js';

export class Figure {
  constructor(room, game) {
    this.type = 'figure';
    this.room = room;
    this.done = false;
    const r = room.rect;
    // patrol waypoints on a loose grid, skipping solid furniture
    this.waypoints = [];
    for (let i = 0; i < 10; i++) {
      this.waypoints.push({
        x: r.x + 90 + game.rng.next() * (r.w - 180),
        y: r.y + 90 + game.rng.next() * (r.h - 180),
      });
    }
    this.x = r.x + r.w * 0.75;
    this.y = r.y + r.h * 0.35;
    this.wp = 0;
    this.state = 'patrol';       // patrol | investigate | chase
    this.alert = 0;              // 0..1
    this.target = { x: this.x, y: this.y };
    this.stepT = 0;
    this.facing = 0;
    this.growlT = 4;
    this.limbT = 0;
  }

  hear(x, y, loudness, game) {
    const d = dist(this.x, this.y, x, y);
    const heard = loudness * clamp(1 - d / 640, 0, 1);
    if (heard > 0.1) {
      this.alert = clamp(this.alert + heard, 0, 1.2);
      this.target = { x, y };
      if (this.alert > 0.85) {
        if (this.state !== 'chase') {
          game.audio.playAt('figureRoar', this.x, this.y);
          game.camera.shake(6, 0.4);
          game._fxFlash([150, 20, 30], 0.7);
          game._fxShake(0.9);
          game._fxDarken(0.6);
          game._fxNoise(0.4);
        }
        this.state = 'chase';
      } else if (this.alert > 0.35 && this.state !== 'chase') {
        this.state = 'investigate';
      }
    }
  }

  update(dt, game) {
    const p = game.player;
    this.limbT += dt;
    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = 5 + Math.random() * 6;
      game.audio.playAt('breath', this.x, this.y, 700);
    }

    // hear the player continuously
    if (!p.dead && !p.hidden && rectContains(this.room.rect, p.x, p.y)) {
      this.hear(p.x, p.y, p.noise * dt * 3.2, game);
    }
    this.alert = Math.max(0, this.alert - dt * (this.state === 'chase' ? 0.06 : 0.12));
    if (this.state === 'chase' && this.alert < 0.3) this.state = 'investigate';
    if (this.state === 'investigate' && this.alert < 0.05) this.state = 'patrol';

    // pick destination
    let dest, speed;
    if (this.state === 'patrol') {
      dest = this.waypoints[this.wp];
      speed = 95;
      if (dist(this.x, this.y, dest.x, dest.y) < 24) this.wp = (this.wp + 1) % this.waypoints.length;
    } else {
      dest = this.target;
      speed = this.state === 'chase' ? 300 : 150;
      if (dist(this.x, this.y, dest.x, dest.y) < 26 && this.state === 'investigate') {
        this.alert = Math.max(0, this.alert - dt * 0.6);
      }
    }

    // move with light wall avoidance (steer around solid furniture)
    const a = angleTo(this.x, this.y, dest.x, dest.y);
    let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
    for (const f of this.room.furniture) {
      if (!f.solid) continue;
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      const d = dist(this.x, this.y, cx, cy);
      const rad = Math.max(f.w, f.h) / 2 + 34;
      if (d < rad) {
        const push = (rad - d) / rad * speed * 1.4;
        const pa = angleTo(cx, cy, this.x, this.y);
        vx += Math.cos(pa) * push;
        vy += Math.sin(pa) * push;
      }
    }
    this.x += vx * dt;
    this.y += vy * dt;
    const r = this.room.rect;
    this.x = clamp(this.x, r.x + 50, r.x + r.w - 50);
    this.y = clamp(this.y, r.y + 50, r.y + r.h - 50);
    this.facing += (Math.atan2(vy, vx) - this.facing) * clamp(dt * 6, 0, 1);

    // heavy steps
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = this.state === 'chase' ? 0.26 : 0.55;
      game.audio.playAt('figureStep', this.x, this.y, 900);
      if (this.state === 'chase') game.camera.shake(2.5, 0.12);
    }

    // catch the player
    const pd = dist(this.x, this.y, p.x, p.y);
    if (!p.dead && !p.hidden && pd < 34) {
      p.damage(999, game, 'figure');
    }
    // heartbeat pressure while hiding close
    game.figureNear = pd < 240 ? this : (game.figureNear === this ? null : game.figureNear);
  }

  draw(ctx, time, game) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 6, 26, 18, 0, 0, TAU); ctx.fill();
    ctx.rotate(this.facing + Math.PI / 2);

    const lurch = Math.sin(this.limbT * (this.state === 'chase' ? 14 : 6)) * 6;
    // long arms
    ctx.strokeStyle = '#1c1417'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-26, -22 - lurch); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(26, -22 + lurch); ctx.stroke();
    // torso
    ctx.fillStyle = '#231a1e';
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, TAU); ctx.fill();
    // eyeless head, huge maw
    ctx.fillStyle = '#2e2126';
    ctx.beginPath(); ctx.arc(0, -14, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6e1420';
    ctx.beginPath(); ctx.ellipse(0, -12, 7, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8dfd0';
    for (let i = -5; i <= 5; i += 2.5) {
      ctx.beginPath(); ctx.moveTo(i, -18); ctx.lineTo(i + 1, -12); ctx.lineTo(i + 2, -18); ctx.fill();
    }
    ctx.restore();

    const alertGlow = this.state === 'chase' ? 0.5 : this.state === 'investigate' ? 0.25 : 0.1;
    game.pendingGlows.push({ x: this.x, y: this.y, r: 130, color: glowColor(160, 30, 40), a: alertGlow });
  }
}

// -------------------------------------------------- door 50 padlock puzzle

export class LibraryPuzzle {
  constructor(room) {
    this.room = room;
    this.code = room.libCode;           // [d,d,d,d,d]
    this.symbols = room.libSymbols;
    this.found = new Array(5).fill(false);
    this.entered = new Array(5).fill(null);
    this.solved = false;
  }

  collect(idx) { this.found[idx] = true; }
  get foundCount() { return this.found.filter(Boolean).length; }

  tryDigit(pos, d) {
    this.entered[pos] = d;
    return this.entered.every((v, i) => v === this.code[i]);
  }
}

// -------------------------------------------------- door 100 breaker puzzle

export class BreakerPuzzle {
  constructor(rng) {
    this.fusesNeeded = 3;
    this.fuses = 0;
    // flip order for 10 switches, shown 2 at a time
    this.order = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    this.progress = 0;
    this.on = new Array(10).fill(false);
    this.solved = false;
  }

  get ready() { return this.fuses >= this.fusesNeeded; }

  flip(idx, game) {
    if (this.solved) return 'done';
    if (this.on[idx]) return 'already';
    if (this.order[this.progress] === idx) {
      this.on[idx] = true;
      this.progress++;
      game.audio.play('breakerGood');
      if (this.progress >= this.order.length) {
        this.solved = true;
        return 'solved';
      }
      return 'good';
    }
    // wrong switch: loud clunk resets two steps and makes noise for Figure
    game.audio.play('breakerBad');
    this.progress = Math.max(0, this.progress - 2);
    for (let i = 0; i < 10; i++) this.on[i] = false;
    for (let i = 0; i < this.progress; i++) this.on[this.order[i]] = true;
    return 'bad';
  }

  // what the display shows: next two switch numbers
  displayText() {
    if (this.solved) return 'OK';
    const nxt = this.order.slice(this.progress, this.progress + 2).map(n => n + 1);
    return nxt.map(n => String(n).padStart(2, '0')).join(' → ');
  }
}
