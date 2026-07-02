// the player: movement, noise, hiding, health

import { clamp, circleVsRect, TAU, rectContains } from '../engine/math.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 13;
    this.facing = 0;
    this.vx = 0; this.vy = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.speedWalk = 195;
    this.speedRun = 305;
    this.speedCrouch = 100;
    this.crouching = false;
    this.running = false;
    this.moving = false;
    this.noise = 0;          // 0..1 how loud we are right now
    this.hiddenIn = null;    // furniture ref (wardrobe / table)
    this.hideTime = 0;
    this.lightOn = true;
    this.stepT = 0;
    this.hurtT = 0;
    this.vitaminT = 0;
    this.dead = false;
    this.walkCycle = 0;
    this.freeze = false;     // cutscene lock
  }

  get hidden() { return !!this.hiddenIn; }

  update(dt, game) {
    const input = game.input;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.vitaminT = Math.max(0, this.vitaminT - dt);

    if (this.freeze || this.dead) { this.noise = 0; return; }

    if (this.hidden) {
      this.hideTime += dt;
      this.noise = 0;
      // stay snapped inside the hiding spot
      const f = this.hiddenIn;
      this.x = f.x + f.w / 2;
      this.y = f.y + f.h / 2;
      return;
    }
    this.hideTime = 0;

    // movement input
    let mx = 0, my = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) my -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) my += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const mag = Math.hypot(mx, my);
    this.moving = mag > 0;
    this.crouching = input.down('KeyC') || input.down('ControlLeft');
    this.running = (input.down('ShiftLeft') || input.down('ShiftRight')) && !this.crouching;

    let speed = this.crouching ? this.speedCrouch : this.running ? this.speedRun : this.speedWalk;
    if (this.vitaminT > 0) speed *= 1.35;

    if (mag > 0) { mx /= mag; my /= mag; }
    const accel = 14;
    this.vx += (mx * speed - this.vx) * clamp(accel * dt, 0, 1);
    this.vy += (my * speed - this.vy) * clamp(accel * dt, 0, 1);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // collide against nearby rooms' walls + solid furniture
    for (const room of game.rooms) {
      const pad = 60;
      const R = room.rect;
      if (this.x < R.x - pad || this.x > R.x + R.w + pad || this.y < R.y - pad || this.y > R.y + R.h + pad) continue;
      for (const wl of room.walls) {
        const fix = circleVsRect(this.x, this.y, this.r, wl);
        if (fix) { this.x = fix.x; this.y = fix.y; }
      }
      for (const f of room.furniture) {
        if (!f.solid) continue;
        const fix = circleVsRect(this.x, this.y, this.r, f);
        if (fix) { this.x = fix.x; this.y = fix.y; }
      }
      // closed doors block their gap
      const doors = [...room.doors];
      if (room.entryDoor) doors.push(room.entryDoor);
      for (const d of doors) {
        if (d.opened) continue;
        const horiz = d.dir === 'n' || d.dir === 's';
        const block = horiz
          ? { x: d.cx - d.w / 2, y: d.cy - 9, w: d.w, h: 18 }
          : { x: d.cx - 9, y: d.cy - d.w / 2, w: 18, h: d.w };
        const fix = circleVsRect(this.x, this.y, this.r, block);
        if (fix) { this.x = fix.x; this.y = fix.y; }
      }
    }

    // aim at mouse
    const m = game.camera.screenToWorld(input.mouse.x, input.mouse.y);
    this.facing = Math.atan2(m.y - this.y, m.x - this.x);

    // noise: crouch quiet, walk medium, run loud
    const moveNoise = this.moving ? (this.crouching ? 0.12 : this.running ? 1 : 0.45) : 0;
    this.noise += (moveNoise - this.noise) * clamp(6 * dt, 0, 1);

    // footsteps
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 30) {
      this.walkCycle += dt * spd * 0.05;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.running ? 0.28 : this.crouching ? 0.65 : 0.42;
        game.audio.play('step', { vol: this.crouching ? 0.3 : this.running ? 1.2 : 0.7 });
      }
    }
  }

  damage(amount, game, source = '?') {
    if (this.dead) return;
    // crucifix intercepts entity damage
    if (amount >= 25 && game.inventory.has('crucifix') && game.tryCrucifix(source)) return;
    this.health -= amount;
    this.hurtT = 0.6;
    game.ui.flashDamage(this.health / this.maxHealth);
    game.camera.shake(Math.min(14, amount * 0.35), 0.4);
    // a hurt sting on the screen — sharper the harder you're hit
    if (typeof game._fxFlash === 'function') {
      game._fxFlash([160, 10, 15], Math.min(0.7, amount / 60 + 0.15));
      game._fxNoise(Math.min(0.5, amount / 80));
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.onPlayerDeath(source);
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  enterHiding(f, game) {
    this.hiddenIn = f;
    f.occupied = true;
    this.hideTime = 0;
    game.audio.play('hide');
  }

  exitHiding(game) {
    if (!this.hiddenIn) return;
    const f = this.hiddenIn;
    f.occupied = false;
    // step out in front of the furniture
    const side = f.side || 'n';
    const off = 30;
    if (side === 'n') { this.y = f.y + f.h + off; this.x = f.x + f.w / 2; }
    else if (side === 's') { this.y = f.y - off; this.x = f.x + f.w / 2; }
    else if (side === 'w') { this.x = f.x + f.w + off; this.y = f.y + f.h / 2; }
    else { this.x = f.x - off; this.y = f.y + f.h / 2; }
    this.hiddenIn = null;
    this.hideTime = 0;
    game.audio.play('hide', { vol: 0.7 });
  }

  draw(ctx, time) {
    if (this.hidden) return;
    const bob = Math.sin(this.walkCycle * 2.2) * (this.moving ? 2 : 0);

    ctx.save();
    ctx.translate(this.x, this.y);

    // soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 4, this.r + 3, this.r - 2, 0, 0, TAU); ctx.fill();

    ctx.rotate(this.facing + Math.PI / 2);
    const squish = this.crouching ? 0.85 : 1;
    ctx.scale(squish, squish);

    // arms (swing while moving)
    const armSwing = Math.sin(this.walkCycle * 2.2) * (this.moving ? 5 : 0);
    ctx.fillStyle = '#caa76b';
    ctx.beginPath(); ctx.arc(-11, -2 + armSwing, 4.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -2 - armSwing, 4.5, 0, TAU); ctx.fill();

    // torso — blocky avatar seen from above
    ctx.fillStyle = this.hurtT > 0 ? '#8f3b3b' : '#3e6ea5';
    ctx.beginPath(); ctx.roundRect(-10, -8 + bob * 0.3, 20, 16, 6); ctx.fill();

    // head
    ctx.fillStyle = '#e2bd7f';
    ctx.beginPath(); ctx.arc(0, -1 + bob * 0.2, 8, 0, TAU); ctx.fill();
    // hair tuft
    ctx.fillStyle = '#3a2c1c';
    ctx.beginPath(); ctx.arc(0, -4 + bob * 0.2, 6, Math.PI, TAU); ctx.fill();

    ctx.restore();
  }
}
