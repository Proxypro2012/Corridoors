// the Figure: blind, hunts by sound. patrols the library (door 50)
// and the electrical room (door 100).

import { TAU, dist, clamp, rectContains, angleTo, circleVsRect } from '../engine/math.js';
import { glowColor } from '../engine/lighting.js';
import { floorColliders, stairProgressAt } from './mapgen.js';

export class Figure {
  constructor(room, game) {
    this.type = 'figure';
    this.room = room;
    this.done = false;
    this.floor = 0;
    const r = room.rect;
    // patrol waypoints on a loose grid, skipping solid furniture — and, in a
    // room with mezzanine decks, a sweep of each deck as part of his rounds
    this.waypoints = [];
    if (room.platforms) {
      const blocked = (x, y) =>
        room.platforms.some(p => x > p.x - 70 && x < p.x + p.w + 70 && y > p.y - 70 && y < p.y + p.h + 70) ||
        room.stairs.some(s => x > s.x - 50 && x < s.x + s.w + 50 && y > s.y - 50 && y < s.y + s.h + 50) ||
        room.furniture.some(f => f.solid && x > f.x - 40 && x < f.x + f.w + 40 && y > f.y - 40 && y < f.y + f.h + 40);
      let guard = 0;
      while (this.waypoints.length < 9 && guard++ < 220) {
        const x = r.x + 110 + game.rng.next() * (r.w - 220);
        const y = r.y + 110 + game.rng.next() * (r.h - 220);
        if (!blocked(x, y)) this.waypoints.push({ x, y, floor: 0 });
      }
      for (const p of room.platforms) {
        const along = p.w >= p.h;
        for (const t of [0.2, 0.5, 0.8]) {
          this.waypoints.push({
            x: along ? p.x + p.w * t : p.x + p.w / 2,
            y: along ? p.y + p.h / 2 : p.y + p.h * t,
            floor: 1,
          });
        }
      }
    } else {
      for (let i = 0; i < 10; i++) {
        this.waypoints.push({
          x: r.x + 90 + game.rng.next() * (r.w - 180),
          y: r.y + 90 + game.rng.next() * (r.h - 180),
          floor: 0,
        });
      }
    }
    const w0 = this.waypoints[0] || { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
    this.x = w0.x;
    this.y = w0.y;
    this.wp = 0;
    this.state = 'patrol';       // patrol | investigate | chase
    this.alert = 0;              // 0..1
    this.target = { x: this.x, y: this.y, floor: 0 };
    this.stepT = 0;
    this.facing = 0;
    this.growlT = 4;
    this.limbT = 0;
  }

  // one-shot noises: door slams, breaker clunks, drawer rummaging
  hear(x, y, loudness, game) {
    const d = dist(this.x, this.y, x, y);
    const heard = loudness * clamp(1 - d / 640, 0, 1);
    if (heard > 0.1) {
      this.target = { x, y, floor: game.player.floor };
      this._raise(heard, game);
    }
  }

  // continuous listening — footsteps. no minimum threshold: alert accrues over
  // time, and the decay in update() forgives brief slips. crouching stays
  // below the decay rate except at point-blank range.
  listen(x, y, noise, floor, dt, game) {
    const d = dist(this.x, this.y, x, y);
    let f = clamp(1 - d / 700, 0, 1);
    if (floor !== this.floor) f *= 0.5;   // muffled through the deck
    const gain = noise * f * f * dt * (noise > 0.7 ? 2.4 : 0.9);
    if (gain <= 0) return;
    if (this.alert + gain > 0.3 || this.state !== 'patrol') this.target = { x, y, floor };
    this._raise(gain, game);
  }

  _raise(amount, game) {
    this.alert = clamp(this.alert + amount, 0, 1.2);
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

  // which walkable region a point belongs to: 0 = ground hall, i+1 = deck i
  _region(x, y, floor) {
    if (floor !== 1 || !this.room.platforms) return 0;
    for (let i = 0; i < this.room.platforms.length; i++) {
      const p = this.room.platforms[i];
      if (x >= p.x - 30 && x <= p.x + p.w + 30 && y >= p.y - 30 && y <= p.y + p.h + 30) return i + 1;
    }
    return 0;
  }

  // where to actually walk: the destination itself, or the stair that leads
  // toward it. descending re-evaluates naturally deck → hall → other deck.
  _navPoint(dest) {
    const room = this.room;
    if (!room.stairs || !room.stairs.length) return dest;
    const destRegion = this._region(dest.x, dest.y, dest.floor ?? 0);
    const sp = stairProgressAt(room, this.x, this.y);
    if (sp) {
      const st = sp.stair;
      return destRegion === st.platform + 1 ? { x: st.hx, y: st.hy } : { x: st.lx, y: st.ly };
    }
    const myRegion = this._region(this.x, this.y, this.floor);
    if (myRegion === destRegion) return dest;
    let best = null, bestScore = Infinity;
    for (const st of room.stairs) {
      const usable = myRegion === 0 ? st.platform + 1 === destRegion : st.platform + 1 === myRegion;
      if (!usable) continue;
      const enter = myRegion === 0 ? { x: st.lx, y: st.ly } : { x: st.hx, y: st.hy };
      const exit = myRegion === 0 ? { x: st.hx, y: st.hy } : { x: st.lx, y: st.ly };
      const score = dist(this.x, this.y, enter.x, enter.y) + dist(exit.x, exit.y, dest.x, dest.y);
      if (score < bestScore) { bestScore = score; best = enter; }
    }
    return best || dest;
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
      this.listen(p.x, p.y, p.noise, p.floor, dt, game);
    }
    this.alert = Math.max(0, this.alert - dt * (this.state === 'chase' ? 0.06 : 0.12));
    if (this.state === 'chase' && this.alert < 0.3) this.state = 'investigate';
    if (this.state === 'investigate' && this.alert < 0.05) this.state = 'patrol';

    // pick destination
    let dest, speed;
    if (this.state === 'patrol') {
      dest = this.waypoints[this.wp];
      speed = 95;
      if (dist(this.x, this.y, dest.x, dest.y) < 24 && (dest.floor ?? 0) === this.floor) {
        this.wp = (this.wp + 1) % this.waypoints.length;
      }
    } else {
      dest = this.target;
      speed = this.state === 'chase' ? 300 : 150;
      if (dist(this.x, this.y, dest.x, dest.y) < 26 && (dest.floor ?? 0) === this.floor &&
          this.state === 'investigate') {
        this.alert = Math.max(0, this.alert - dt * 0.6);
      }
    }
    // stairs route him between floors; he climbs a touch slower
    const nav = this._navPoint(dest);
    if (stairProgressAt(this.room, this.x, this.y)) speed *= 0.8;

    // move with light wall avoidance (steer around solid furniture)
    const a = angleTo(this.x, this.y, nav.x, nav.y);
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
    // decks, railings and stair rails are hard walls for him too
    if (this.room.platforms) {
      for (const c of floorColliders(this.room, this.floor)) {
        const fix = circleVsRect(this.x, this.y, 16, c);
        if (fix) { this.x = fix.x; this.y = fix.y; }
      }
      const sp = stairProgressAt(this.room, this.x, this.y);
      if (sp) this.floor = sp.t > 0.5 ? 1 : 0;
    }
    this.facing += (Math.atan2(vy, vx) - this.facing) * clamp(dt * 6, 0, 1);

    // heavy steps
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = this.state === 'chase' ? 0.26 : 0.55;
      game.audio.playAt('figureStep', this.x, this.y, 900);
      if (this.state === 'chase') game.camera.shake(2.5, 0.12);
    }

    // catch the player — only on the same floor
    const pd = dist(this.x, this.y, p.x, p.y);
    if (!p.dead && !p.hidden && pd < 34 && p.floor === this.floor) {
      p.damage(999, game, 'figure');
    }
    // heartbeat pressure while hiding close (same floor only)
    game.figureNear = (pd < 240 && p.floor === this.floor) ? this : (game.figureNear === this ? null : game.figureNear);
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
