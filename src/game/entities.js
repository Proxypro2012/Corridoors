// hostile entities. each implements update(dt, game) / draw(ctx, time, game),
// sets this.done when finished.

import { TAU, dist, clamp, angDiff, rectContains } from '../engine/math.js';
import { glowColor } from '../engine/lighting.js';

// build a waypoint path through the alive room chain: entry → center → exit
function roomChainPath(game) {
  const pts = [];
  for (const room of game.roomChain) {
    if (room.entryDoor) pts.push({ x: room.entryDoor.cx, y: room.entryDoor.cy });
    pts.push({ x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 });
    const exit = room.doors.find(d => d.kind === 'next');
    if (exit) pts.push({ x: exit.cx, y: exit.cy });
  }
  return pts;
}

// ---------------------------------------------------------------- RUSH

export class Rush {
  constructor(game, opts = {}) {
    this.type = opts.type || 'rush';
    this.path = roomChainPath(game);
    this.seg = 0;
    this.x = this.path[0].x;
    this.y = this.path[0].y;
    this.speed = opts.speed || 560;
    this.bounces = opts.bounces ?? 0;      // ambush reverses
    this.dir = 1;
    this.done = false;
    this.killR = 46;
    this.warmup = opts.warmup ?? 0;        // delay before moving
    this.trail = [];
  }

  update(dt, game) {
    if (this.warmup > 0) { this.warmup -= dt; return; }
    let remaining = this.speed * dt;
    while (remaining > 0) {
      const targetIdx = this.seg + this.dir;
      if (targetIdx < 0 || targetIdx >= this.path.length) {
        if (this.bounces > 0) {
          this.bounces--;
          this.dir *= -1;
          if (this.type === 'ambush') game.audio.play('ambushWarble', { vol: 0.8 });
          continue;
        }
        this.done = true;
        game.onRushGone(this);
        return;
      }
      const t = this.path[targetIdx];
      const d = dist(this.x, this.y, t.x, t.y);
      if (d <= remaining) {
        this.x = t.x; this.y = t.y;
        this.seg = targetIdx;
        remaining -= d;
      } else {
        this.x += (t.x - this.x) / d * remaining;
        this.y += (t.y - this.y) / d * remaining;
        remaining = 0;
      }
    }

    this.trail.push({ x: this.x, y: this.y, t: 0.35 });
    for (const tr of this.trail) tr.t -= dt;
    while (this.trail.length && this.trail[0].t <= 0) this.trail.shift();

    // break lights in the room we're inside
    for (const room of game.rooms) {
      if (rectContains(room.rect, this.x, this.y) && !room.lightsBroken) {
        room.lightsBroken = true;
        room.flicker = 0;
        game.audio.playAt('shatter', this.x, this.y);
        game.particles.burst(this.x, this.y, 12, { color: '255,240,190', speed: 140, life: 0.6, size: 3, additive: true });
      }
    }

    // proximity shake + kill
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < 600) game.camera.shake(clamp((600 - d) / 60, 0, 9), 0.15);
    if (d < this.killR && !p.hidden && !p.dead) {
      p.damage(999, game, this.type);
    }
    game.particles.burst(this.x, this.y, 2, {
      color: this.type === 'ambush' ? '90,230,140' : '30,30,40',
      speed: 60, life: 0.5, size: 9, sizeEnd: 2, additive: this.type === 'ambush',
    });
  }

  draw(ctx, time, game) {
    // smoke trail
    for (const tr of this.trail) {
      ctx.globalAlpha = tr.t * 1.6;
      ctx.fillStyle = this.type === 'ambush' ? 'rgba(30,60,40,0.6)' : 'rgba(10,10,16,0.7)';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 26 * tr.t * 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const jx = (Math.random() - 0.5) * 4, jy = (Math.random() - 0.5) * 4;
    ctx.save();
    ctx.translate(this.x + jx, this.y + jy);
    // dark mass
    ctx.fillStyle = this.type === 'ambush' ? '#0c1a10' : '#0a0a10';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    // wide distorted face
    ctx.fillStyle = '#e8e8f0';
    ctx.beginPath(); ctx.ellipse(-10, -6, 7, 10 + Math.random() * 3, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -6, 7, 10 + Math.random() * 3, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 12, 12, 7 + Math.random() * 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-10, -6, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -6, 3, 0, TAU); ctx.fill();
    ctx.restore();

    if (this.type === 'ambush') game.pendingGlows.push({ x: this.x, y: this.y, r: 220, color: glowColor(80, 230, 130), a: 0.35 });
    else game.pendingGlows.push({ x: this.x, y: this.y, r: 160, color: glowColor(60, 60, 90), a: 0.25 });
  }
}

// ---------------------------------------------------------------- EYES

export class Eyes {
  constructor(room, rng) {
    this.type = 'eyes';
    this.room = room;
    this.x = room.rect.x + room.rect.w * rng.range(0.3, 0.7);
    this.y = room.rect.y + room.rect.h * rng.range(0.3, 0.7);
    this.baseY = this.y;
    this.done = false;
    this.tickT = 0;
    this.eyes = [];
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * TAU, r = 8 + rng.next() * 22;
      this.eyes.push({ ox: Math.cos(a) * r * 1.3, oy: Math.sin(a) * r, s: 3 + rng.next() * 5, ph: rng.next() * TAU });
    }
  }

  update(dt, game) {
    this.y = this.baseY + Math.sin(game.time * 1.4) * 8;
    const p = game.player;
    if (p.dead || p.hidden) return;
    // looking at it = damage
    const toEyes = Math.atan2(this.y - p.y, this.x - p.x);
    const facing = Math.abs(angDiff(p.facing, toEyes)) < 0.75;
    const sameRoom = rectContains(this.room.rect, p.x, p.y);
    this.beingLooked = facing && sameRoom;
    if (this.beingLooked) {
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.45;
        p.damage(10, game, 'eyes');
        game.audio.play('zap', { vol: 0.7 });
        game._fxFlash([110, 40, 170], 0.3);
      }
    } else this.tickT = 0.15;
  }

  draw(ctx, time, game) {
    ctx.save();
    ctx.translate(this.x, this.y);
    for (const e of this.eyes) {
      const blink = clamp(Math.sin(time * 2 + e.ph) * 1.5 + 0.8, 0.15, 1);
      ctx.fillStyle = '#f4f0ff';
      ctx.beginPath(); ctx.ellipse(e.ox, e.oy, e.s, e.s * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b2a8f';
      ctx.beginPath(); ctx.arc(e.ox, e.oy, e.s * 0.45 * blink, 0, TAU); ctx.fill();
    }
    ctx.restore();
    game.pendingGlows.push({ x: this.x, y: this.y, r: 190, color: glowColor(140, 80, 220), a: 0.4 });
    game.pendingGlows.push({ x: this.x, y: this.y, r: 60, color: glowColor(220, 190, 255), a: 0.5 });
  }
}

// ---------------------------------------------------------------- HALT

export class Halt {
  constructor(room, game) {
    this.type = 'halt';
    this.room = room;
    this.done = false;
    this.state = 'wait';
    this.timer = 1.2;
    this.x = 0; this.y = 0;
    this.alpha = 0;
    this.cycles = 0;
    this.maxCycles = 3 + ((game.rng.next() * 2) | 0);
  }

  // corridor axis helpers
  axisInfo() {
    const r = this.room.rect;
    const horiz = r.w > r.h;
    const exit = this.room.doors.find(d => d.kind === 'next');
    const sign = horiz ? Math.sign(exit.cx - (r.x + r.w / 2)) || 1 : Math.sign(exit.cy - (r.y + r.h / 2)) || 1;
    return { horiz, sign, r };
  }

  update(dt, game) {
    const p = game.player;
    const { horiz, sign, r } = this.axisInfo();
    this.timer -= dt;

    if (this.state === 'wait') {
      if (this.timer <= 0) {
        // materialize ahead of the player (toward exit)
        this.cycles++;
        if (this.cycles > this.maxCycles) { this.done = true; return; }
        const ahead = 330;
        this.x = horiz ? clamp(p.x + sign * ahead, r.x + 60, r.x + r.w - 60) : r.x + r.w / 2;
        this.y = horiz ? r.y + r.h / 2 : clamp(p.y + sign * ahead, r.y + 60, r.y + r.h - 60);
        this.state = 'attack';
        this.alpha = 0;
        this.timer = 3.1;
        game.audio.play('haltWhoosh');
        game.ui.showHaltWarning();
        game.roomFlicker(this.room, 0.9);
        game._fxFlash([40, 90, 200], 0.6);
        game._fxShake(0.8);
        game._fxNoise(0.3);
      }
    } else if (this.state === 'attack') {
      this.alpha = Math.min(1, this.alpha + dt * 5);
      // drift toward player
      const spd = 210;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.x += dx / d * spd * dt;
      this.y += dy / d * spd * dt;
      if (d < 30 && !p.dead) {
        p.damage(55, game, 'halt');
        this.state = 'wait';
        this.timer = 1.4;
      }
      if (this.timer <= 0) {
        this.state = 'wait';
        this.timer = 1.2 + Math.random();
      }
    }

    // leaving the corridor ends halt
    if (!rectContains({ x: r.x - 40, y: r.y - 40, w: r.w + 80, h: r.h + 80 }, p.x, p.y)) this.done = true;
  }

  draw(ctx, time, game) {
    if (this.state !== 'attack') return;
    const jx = (Math.random() - 0.5) * 6;
    ctx.save();
    ctx.globalAlpha = this.alpha * (0.75 + Math.random() * 0.25);
    ctx.translate(this.x + jx, this.y);
    // gangly blue phantom
    ctx.fillStyle = '#0d1526';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 30, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9fc4ff';
    ctx.beginPath(); ctx.arc(-7, -8, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -8, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#060a14';
    ctx.beginPath(); ctx.arc(-7, -8, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -8, 2, 0, TAU); ctx.fill();
    // jagged mouth
    ctx.strokeStyle = '#9fc4ff'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -8; i <= 8; i += 4) {
      ctx.lineTo(i, 8 + (Math.abs(i) % 8 === 0 ? 4 : 0));
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    game.pendingGlows.push({ x: this.x, y: this.y, r: 260, color: glowColor(70, 120, 255), a: 0.5 * this.alpha });
  }
}

// ---------------------------------------------------------------- SCREECH

export class Screech {
  constructor(room, rng) {
    this.type = 'screech';
    this.room = room;
    this.done = false;
    this.state = 'lurk';
    this.timer = rng.range(3.5, 7);
    this.x = 0; this.y = 0;
    this.window = 0;
  }

  update(dt, game) {
    const p = game.player;
    const inRoom = rectContains(this.room.rect, p.x, p.y);
    if (!inRoom || p.hidden) { if (this.state === 'psst') this.state = 'lurk'; return; }
    // a lit player is safe-ish: timer only advances in darkness
    this.timer -= dt * (this.room.lightsBroken || this.room.darkRoom ? 1 : 0.25);

    if (this.state === 'lurk') {
      if (this.timer <= 0) {
        const a = Math.random() * TAU;
        this.x = p.x + Math.cos(a) * 90;
        this.y = p.y + Math.sin(a) * 90;
        this.state = 'psst';
        this.window = 1.5;
        game.audio.playAt('psst', this.x, this.y);
        game._fxNoise(0.5);            // static swells as it whispers
      }
    } else if (this.state === 'psst') {
      this.window -= dt;
      const toMe = Math.atan2(this.y - p.y, this.x - p.x);
      if (Math.abs(angDiff(p.facing, toMe)) < 0.62) {
        // spotted! it shrieks and flees
        game.audio.play('screechShriek', { vol: 0.8 });
        game.particles.burst(this.x, this.y, 16, { color: '30,30,38', speed: 160, life: 0.5, size: 6 });
        game.camera.shake(5, 0.25);
        game._fxFlash([200, 200, 220], 0.4);
        this.state = 'lurk';
        this.timer = 8 + Math.random() * 5;
      } else if (this.window <= 0) {
        p.damage(40, game, 'screech');
        game.ui.jumpscare('screech', 0.7);
        game.audio.play('bite');
        game._fxFlash([180, 20, 20], 0.8);
        game._fxNoise(0.7);
        game._fxShake(1);
        this.state = 'lurk';
        this.timer = 9 + Math.random() * 5;
      }
    }
  }

  draw(ctx, time, game) {
    if (this.state !== 'psst') return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const wob = Math.sin(time * 9) * 2;
    ctx.fillStyle = 'rgba(12,12,18,0.92)';
    ctx.beginPath(); ctx.ellipse(0, wob, 14, 17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dfe3ee';
    ctx.beginPath(); ctx.arc(0, -3 + wob, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(0, -3 + wob, 1.8, 0, TAU); ctx.fill();
    // little teeth
    ctx.fillStyle = '#dfe3ee';
    for (let i = -6; i <= 6; i += 3) {
      ctx.beginPath();
      ctx.moveTo(i, 6 + wob); ctx.lineTo(i + 1.5, 10 + wob); ctx.lineTo(i + 3, 6 + wob);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- SHADOW (rare apparition)

export class Shadow {
  constructor(room, rng) {
    this.type = 'shadow';
    this.room = room;
    this.x = room.rect.x + room.rect.w * rng.range(0.3, 0.7);
    this.y = room.rect.y + room.rect.h * rng.range(0.3, 0.7);
    this.life = 1.6;
    this.done = false;
    this.announced = false;
  }

  update(dt, game) {
    if (!this.announced) {
      this.announced = true;
      game.audio.play('shadowBoom', { vol: 0.9 });
      game.camera.shake(6, 0.5);
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.done = true;
      game.particles.burst(this.x, this.y, 20, { color: '15,15,22', speed: 120, life: 0.7, size: 7 });
    }
  }

  draw(ctx, time, game) {
    const a = clamp(this.life, 0, 1) * 0.85;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#08080c';
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 26, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -30, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(200,60,60,0.9)';
    ctx.beginPath(); ctx.arc(-4, -31, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -31, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- GUIDING LIGHT advice

export const GUIDING_ADVICE = {
  rush: "That was Rush. When the lights flicker and the room goes quiet — don't run for the next door. Find a wardrobe and wait for it to pass.",
  ambush: "Ambush doesn't leave after one pass. Listen: when its glow fades, step out of the wardrobe, breathe, and get back in before it returns.",
  eyes: "Eyes only hurts you when you look at it. Keep your gaze on the floor and walk around it. Curiosity is what it feeds on.",
  halt: "Halt lives in the blue corridor. When it appears in front of you — turn around and run. It cannot hold a straight line for long.",
  screech: "Screech hates being seen. When you hear 'psst' in the dark, face it immediately and it will flee. Carry a light in dark rooms.",
  hide: "The wardrobes belong to something too. Hide only as long as you must — when the red pressure starts, get out.",
  figure: "The Figure has no eyes. It hears footsteps, drawers, doors. Crouch, move slowly, and hold your breath when it's close.",
  seek: "You can't outfight Seek — only outrun it. Follow my glow through the corridors, dodge what falls, and don't stop.",
  dupe: "Dupe hides behind doors with borrowed numbers. The true door keeps a warm lamp above its frame. Trust the light.",
  timothy: "That little bite was Timothy. He's more startle than harm — but check drawers with a steady hand.",
  jack: "Jack just wants the wardrobe for himself. No harm done. Pick another one.",
  glitch: "Reality slipped for a moment. I put you back where you belong.",
  halt_corridor: "Keep moving. It flickers behind and ahead — trust your own feet.",
  fall: "Watch the gaps in the world.",
};
