// Seek: the chase set piece. goo eye warnings, formation cutscene,
// snaking corridor sprint, door-slam finale.

import { TAU, dist, clamp, angleTo, rectContains } from '../engine/math.js';
import { makeSeekChain } from './mapgen.js';
import { glowColor } from '../engine/lighting.js';

export class SeekEntity {
  constructor(x, y) {
    this.type = 'seek';
    this.x = x; this.y = y;
    this.speed = 0;
    this.maxSpeed = 252;      // just under player sprint
    this.done = false;
    this.tendrils = [];
    for (let i = 0; i < 7; i++) this.tendrils.push(Math.random() * TAU);
    this.active = false;
    this.trailT = 0;
  }

  update(dt, game) {
    if (!this.active) return;
    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    // rubber-band: menacing when close, faster when the player pulls away,
    // but always beatable at a sprint (player run > 300)
    const want = d > 650 ? 340 : d < 180 ? 238 : this.maxSpeed;
    this.speed = Math.min(want, this.speed + dt * 200);
    const a = angleTo(this.x, this.y, p.x, p.y);
    this.x += Math.cos(a) * this.speed * dt;
    this.y += Math.sin(a) * this.speed * dt;

    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.028;
      // black goo wake + flicking droplets
      game.particles.spawn({
        x: this.x + (Math.random() - 0.5) * 40, y: this.y + (Math.random() - 0.5) * 40,
        life: 1.5, size: 16, sizeEnd: 3, color: '10,10,14', drag: 0.9,
      });
      game.particles.spawn({
        x: this.x, y: this.y,
        vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180,
        life: 0.5, size: 5, sizeEnd: 0, color: '35,70,55', additive: true, drag: 0.92,
      });
    }
    if (d < 500) game.camera.shake(clamp((500 - d) / 90, 0, 7), 0.12);
    if (d < 44 && !p.dead) p.damage(999, game, 'seek');
  }

  draw(ctx, time, game) {
    const p = game.player;
    const lookA = Math.atan2(p.y - this.y, p.x - this.x);
    // motion streaks behind the mass while at speed
    if (this.active && this.speed > 60) {
      ctx.strokeStyle = 'rgba(15,15,22,0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 14;
        ctx.beginPath();
        ctx.moveTo(this.x - Math.cos(lookA) * 40 + Math.sin(lookA) * off, this.y - Math.sin(lookA) * 40 - Math.cos(lookA) * off);
        ctx.lineTo(this.x - Math.cos(lookA) * (95 + Math.random() * 40) + Math.sin(lookA) * off, this.y - Math.sin(lookA) * (95 + Math.random() * 40) - Math.cos(lookA) * off);
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    const breathe = 1 + Math.sin(time * 7) * 0.06;
    ctx.scale(breathe, breathe);
    // writhing goo mass — bigger, angrier
    ctx.fillStyle = '#0b0b10';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * TAU;
      const r = 38 + Math.sin(a * 3 + time * 8) * 9 + Math.sin(a * 7 - time * 5) * 4;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // tendrils whipping toward the player
    ctx.strokeStyle = '#0b0b10'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    for (let i = 0; i < this.tendrils.length; i++) {
      const a = this.tendrils[i] + Math.sin(time * 5 + i * 1.7) * 0.8;
      const reach = 58 + Math.sin(time * 9 + i * 2.3) * 18;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * 34, Math.sin(a) * 34, Math.cos(a) * reach, Math.sin(a) * reach + Math.sin(time * 8 + i) * 10);
      ctx.stroke();
    }
    // ring of lesser eyes blinking around the mass
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + time * 0.6;
      const blink = Math.max(0.1, Math.sin(time * 3 + i * 2.1));
      ctx.fillStyle = '#cfd8d6';
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 26, Math.sin(a) * 26, 4, 4 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a0f0c';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 26, Math.sin(a) * 26, 1.6 * blink, 0, TAU); ctx.fill();
    }
    // the one great eye — locked onto the player
    ctx.fillStyle = '#e8f0f2';
    ctx.beginPath(); ctx.ellipse(0, 0, 17, 21, 0, 0, TAU); ctx.fill();
    const px2 = Math.cos(lookA) * 5, py2 = Math.sin(lookA) * 5;
    ctx.fillStyle = '#274a3a';
    ctx.beginPath(); ctx.arc(px2, py2, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#060a08';
    ctx.beginPath(); ctx.arc(px2, py2, 5, 0, TAU); ctx.fill();
    ctx.restore();
    game.pendingGlows.push({ x: this.x, y: this.y, r: 220, color: glowColor(40, 90, 70), a: 0.45 });
    game.pendingGlows.push({ x: this.x, y: this.y, r: 70, color: glowColor(120, 200, 160), a: 0.35 });
  }
}

// orchestrates the whole chase
export class SeekChase {
  constructor(game, startNum, entryDoor) {
    this.game = game;
    this.state = 'cutscene';
    this.rooms = makeSeekChain(game.rng, startNum, entryDoor, 6, game.rooms);
    this.finalDoor = this.rooms[this.rooms.length - 1].doors.find(d => d.seekFinal);
    this.seek = null;
    this.fireT = 0;
    this.done = false;

    // seek forms at the start of the first corridor
    const r0 = this.rooms[0].rect;
    const horiz = r0.w > r0.h;
    this.spawnPos = {
      x: horiz ? (this.rooms[0].entryDir === 'e' ? r0.x + 70 : r0.x + r0.w - 70) : r0.x + r0.w / 2,
      y: horiz ? r0.y + r0.h / 2 : (this.rooms[0].entryDir === 's' ? r0.y + 70 : r0.y + r0.h - 70),
    };
  }

  begin() {
    // guard: main arms the chase and pings this every frame once the player
    // crosses the corridor midpoint — only the first call may run, or the
    // cutscene restarts forever and Seek piles up frozen at its spawn
    if (this.state !== 'armed' && this.state !== 'cutscene') return;
    this.state = 'forming';
    const g = this.game;
    // the corridor belongs to Seek — any inbound Rush/Ambush yields the stage
    g.entities = g.entities.filter(e => e.type !== 'rush' && e.type !== 'ambush');
    g._rushImminent = false;
    this.seek = new SeekEntity(this.spawnPos.x, this.spawnPos.y);
    g.entities.push(this.seek);
    g.audio.play('seekGoo');
    g.setMusicSafe('dread');
    // formation cutscene: pan to the goo, then back, then RUN
    g.runCutscene([
      { do: () => { g.ui.letterbox(true); g.player.freeze = true; g._fxDarken(0.8); }, wait: 0.1 },
      { do: () => g.camera.tweenTo(this.spawnPos.x, this.spawnPos.y, 1.35, 1.4), wait: 1.6 },
      { do: () => {
          g.particles.burst(this.spawnPos.x, this.spawnPos.y, 40, { color: '10,10,14', speed: 200, life: 1, size: 10 });
          g.camera.shake(10, 0.8); g.audio.play('figureRoar', { vol: 0.7 });
          g._fxFlash([120, 20, 20], 0.9); g._fxNoise(0.6); g._fxShake(1.2);
        }, wait: 1.2 },
      { do: () => g.camera.tweenTo(g.player.x, g.player.y, 1.0, 0.9), wait: 1.0 },
      {
        do: () => {
          g.ui.letterbox(false);
          g.player.freeze = false;
          g.camera.follow = g.player;
          this.seek.active = true;
          this.state = 'chase';
          g.setMusicSafe('chase');
          g.ui.setObjective('RUN. follow the blue glow.');
          g._fxFlash([255, 60, 40], 1); g._fxShake(1.4);
        }, wait: 0,
      },
    ]);
  }

  update(dt) {
    const g = this.game;
    if (this.state !== 'chase') return;

    // continuate 10x chase dread — relentless red strobe, static, shake
    const d = dist(this.seek.x, this.seek.y, g.player.x, g.player.y);
    const near = clamp(1 - d / 700, 0, 1);
    g._fxShake(0.8 + near * 0.8);
    g._fxNoise(0.6 + near * 0.3);
    g._fxDarken(0.7 + near * 0.25);
    if (Math.random() < dt * (10 + near * 14)) g._fxFlash([200 + Math.random() * 55, 20, 20], 0.5 + Math.random() * 0.4);
    g.camera.shake(3 + near * 6, 0.12);
    // keep the score silent through the whole chase
    g._musicDucked = true;

    // fire jets pulse; debris slows; handled here for chase rooms
    this.fireT += dt;
    const p = g.player;
    for (const room of this.rooms) {
      for (const f of room.furniture) {
        if (f.fire) {
          const on = Math.sin(this.fireT * 2.4 + f.phase) > 0.15;
          f.fireOn = on;
          if (on && rectContains({ x: f.x - 6, y: f.y - 6, w: f.w + 12, h: f.h + 12 }, p.x, p.y)) {
            if (!p.dead && p.hurtT <= 0) p.damage(20, g, 'seek');
          }
          if (on && Math.random() < dt * 30) {
            g.particles.spawn({
              x: f.x + Math.random() * f.w, y: f.y + Math.random() * f.h,
              vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 60,
              life: 0.5, size: 8, sizeEnd: 1, color: Math.random() < 0.5 ? '255,140,40' : '255,210,80',
              additive: true, drag: 0.97,
            });
          }
        }
        if (f.slow) {
          f.slowing = rectContains({ x: f.x, y: f.y, w: f.w, h: f.h }, p.x, p.y);
          if (f.slowing) { p.vx *= 0.94; p.vy *= 0.94; }
        }
      }
    }

    // guiding light marks the true path — a strong blue beacon on the door
    const room = g.currentRoom;
    if (room && room.special === 'seek') {
      const exit = room.doors.find(d => d.seekCorrect && !d.opened);
      if (exit) {
        const pulse = 0.45 + Math.sin(g.time * 5) * 0.2;
        g.pendingGlows.push({ x: exit.cx, y: exit.cy, r: 170, color: glowColor(90, 150, 255), a: pulse });
        g.pendingGlows.push({ x: exit.cx, y: exit.cy, r: 60, color: glowColor(190, 220, 255), a: 0.55 });
        if (Math.random() < dt * 26) {
          g.particles.spawn({
            x: exit.cx + (Math.random() - 0.5) * 46, y: exit.cy + (Math.random() - 0.5) * 46,
            vx: 0, vy: -18, life: 0.9, size: 4.5, sizeEnd: 0,
            color: '140,190,255', additive: true,
          });
        }
      }
    }

    // reached the final door?
    if (this.finalDoor.opened && this.state === 'chase') {
      this.state = 'escape';
      this.finish();
    }
  }

  finish() {
    const g = this.game;
    const d = this.finalDoor;
    // slam-the-door cutscene
    g.runCutscene([
      { do: () => { g.ui.letterbox(true); g.player.freeze = true; g.camera.tweenTo(d.cx, d.cy, 1.3, 0.7); }, wait: 0.8 },
      {
        do: () => {
          d.opened = false; d.openT = 0; d.sealed = true;
          g.audio.play('doorSlam');
          g.camera.shake(12, 0.6);
          g._fxFlash([255, 255, 255], 0.8);
          g._fxNoise(0.6);
          g._fxShake(1.5);
          if (this.seek) { this.seek.done = true; this.seek.active = false; }
          g.particles.burst(d.cx, d.cy, 24, { color: '12,12,16', speed: 170, life: 0.8, size: 8 });
        }, wait: 1.4,
      },
      {
        do: () => {
          g.ui.letterbox(false);
          g.player.freeze = false;
          g.camera.follow = g.player;
          g.setMusicSafe('dread');
          g.ui.setObjective('');
          g.ui.subtitle('… it\'s gone. keep moving.', 3);
          this.done = true;
          g.onSeekDone();
        }, wait: 0,
      },
    ]);
  }
}
