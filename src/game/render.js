// world rendering: floors, walls, doors, furniture. all art is procedural canvas.

import { WALL_T, DOOR_W } from './mapgen.js';
import { TAU, clamp } from '../engine/math.js';

const PAL = {
  hotel:      { wall: '#3d3129', wallEdge: '#241c15', wood: '#4a3826', wood2: '#41301f', carpet: '#4d2028', carpetEdge: '#672b35', tile: '#33363c' },
  seek:       { wall: '#352a24', wallEdge: '#1e1712', wood: '#42301e', wood2: '#392817', carpet: '#451c24', carpetEdge: '#5c242e', tile: '#2f3238' },
  shop:       { wall: '#453527', wallEdge: '#2a1f14', wood: '#59452c', wood2: '#4e3b23', carpet: '#4d3a20', carpetEdge: '#6b5230', tile: '#3a3a40' },
  courtyard:  { wall: '#3a3f38', wallEdge: '#22261f', wood: '#4a4f42', wood2: '#3f4437', carpet: '#39422f', carpetEdge: '#4c5840', tile: '#464b44' },
  greenhouse: { wall: '#2c3a2e', wallEdge: '#18211a', wood: '#37432f', wood2: '#2d3826', carpet: '#2e4030', carpetEdge: '#3d5540', tile: '#333b33' },
  electrical: { wall: '#2e3033', wallEdge: '#1a1b1e', wood: '#3a3d42', wood2: '#303338', carpet: '#33363b', carpetEdge: '#43464c', tile: '#292b2f' },
};

function pal(room) { return PAL[room.zone] || PAL.hotel; }

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ------------------------------------------------------------------ floor

function drawFloor(ctx, room) {
  const { x, y, w, h } = room.rect;
  const p = pal(room);
  switch (room.floorStyle) {
    case 'wood': {
      ctx.fillStyle = p.wood;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let py = y + 24; py < y + h; py += 24) {
        ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let py = y, i = 0; py < y + h; py += 24, i++) {
        for (let px = x + ((i % 3) * 60); px < x + w; px += 180) {
          ctx.fillRect(px, py, 2, 24);
        }
      }
      break;
    }
    case 'carpet': {
      ctx.fillStyle = p.carpet;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = p.carpetEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 22, y + 22, w - 44, h - 44);
      ctx.setLineDash([2, 10]);
      ctx.strokeRect(x + 34, y + 34, w - 68, h - 68);
      ctx.setLineDash([]);
      break;
    }
    case 'tile': {
      ctx.fillStyle = p.tile;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let px = x; px < x + w; px += 46) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
      for (let py = y; py < y + h; py += 46) { ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
      break;
    }
    case 'stone': {
      ctx.fillStyle = '#3f443d';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let py = y, r = 0; py < y + h; py += 56, r++) {
        for (let px = x + (r % 2) * 38; px < x + w; px += 76) {
          ctx.strokeRect(px, py, 76, 56);
        }
      }
      break;
    }
    case 'moss': {
      ctx.fillStyle = '#2f3d2c';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(70,110,60,0.18)';
      for (let i = 0; i < 24; i++) {
        const mx = x + ((i * 733) % w), my = y + ((i * 389) % h);
        ctx.beginPath(); ctx.arc(mx, my, 14 + (i % 4) * 8, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'concrete': {
      ctx.fillStyle = '#33353a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      for (let px = x + 120; px < x + w; px += 200) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      for (let i = 0; i < 10; i++) {
        ctx.beginPath(); ctx.ellipse(x + ((i * 617) % w), y + ((i * 271) % h), 40, 22, i, 0, TAU); ctx.fill();
      }
      break;
    }
  }
}

// ------------------------------------------------------------------ decor

function drawDecor(ctx, room, time) {
  for (const d of room.decor) {
    switch (d.type) {
      case 'rug': {
        const tones = [['#5c3a42', '#7a4c56'], ['#3e4a5c', '#54637a'], ['#5c523a', '#7a6d4c']][d.tone || 0];
        ctx.fillStyle = tones[0];
        rr(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 8); ctx.fill();
        ctx.strokeStyle = tones[1]; ctx.lineWidth = 3;
        rr(ctx, d.x - d.w / 2 + 10, d.y - d.h / 2 + 10, d.w - 20, d.h - 20, 6); ctx.stroke();
        break;
      }
      case 'runner': {
        ctx.fillStyle = 'rgba(92,42,52,0.55)';
        rr(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(190,150,90,0.25)'; ctx.lineWidth = 2;
        ctx.strokeRect(d.x - d.w / 2 + 8, d.y - d.h / 2 + 8, d.w - 16, d.h - 16);
        break;
      }
      case 'path': {
        ctx.fillStyle = 'rgba(120,116,100,0.4)';
        rr(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 30); ctx.fill();
        break;
      }
      case 'vines': {
        ctx.strokeStyle = 'rgba(60,105,55,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(d.x, d.y + i * 8);
          ctx.bezierCurveTo(d.x + d.w / 3, d.y + i * 14 - 12, d.x + d.w / 1.5, d.y + i * 10 + 12, d.x + d.w, d.y + i * 6);
        }
        ctx.stroke();
        break;
      }
      case 'cobweb': {
        ctx.strokeStyle = 'rgba(200,200,210,0.13)'; ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath(); ctx.arc(d.x, d.y, i * 12, 0, Math.PI / 2); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 36, d.y + 36); ctx.stroke();
        break;
      }
      case 'gooeyes': {
        // seek warning — an eye growing out of the floor goo
        const blink = (Math.sin(time * 1.3 + d.x) + 1) / 2;
        ctx.fillStyle = 'rgba(10,10,12,0.85)';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 26, 18, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ddd';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 14, 9 * clamp(blink * 1.6, 0.12, 1), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, TAU); ctx.fill();
        break;
      }
    }
  }
}

// wall-mounted decor drawn after walls
function drawWallDecor(ctx, room, time, game) {
  for (const d of room.decor) {
    if (d.type === 'painting') {
      ctx.fillStyle = '#211a12';
      ctx.fillRect(d.x - 2, d.y - 2, d.w + 4, d.h + 8);
      ctx.fillStyle = ['#41505c', '#5c4141', '#44523f', '#3c3550'][d.variant || 0];
      ctx.fillRect(d.x, d.y, d.w, d.h + 4);
      ctx.strokeStyle = '#8a7448'; ctx.lineWidth = 2;
      ctx.strokeRect(d.x - 2, d.y - 2, d.w + 4, d.h + 8);
    } else if (d.type === 'window') {
      ctx.fillStyle = game && game.lightning > 0 ? `rgba(210,225,255,${0.5 + game.lightning * 0.5})` : '#131b2a';
      ctx.fillRect(d.x, d.y, d.w, d.h + 6);
      ctx.strokeStyle = '#4c4436'; ctx.lineWidth = 3;
      ctx.strokeRect(d.x, d.y, d.w, d.h + 6);
      ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, d.y); ctx.lineTo(d.x + d.w / 2, d.y + d.h + 6); ctx.stroke();
      // window entity silhouette
      if (d.showFigure) {
        ctx.fillStyle = 'rgba(5,5,8,0.9)';
        ctx.beginPath(); ctx.arc(d.x + d.w / 2, d.y + d.h / 2, 9, 0, TAU); ctx.fill();
        ctx.fillRect(d.x + d.w / 2 - 12, d.y + d.h / 2 + 4, 24, 10);
      }
    } else if (d.type === 'elevator') {
      const open = d.openT || 0;
      ctx.fillStyle = '#1b1d22';
      ctx.fillRect(d.x - 6, d.y, d.w + 12, d.h);
      ctx.fillStyle = '#c7a94f';
      ctx.fillRect(d.x - 6, d.y - 6, d.w + 12, 5);
      ctx.fillRect(d.x - 6, d.y + d.h + 1, d.w + 12, 5);
      // sliding doors
      ctx.fillStyle = '#6f7480';
      const half = d.h / 2;
      ctx.fillRect(d.x, d.y + open * half * 0.96, d.w, half * (1 - open));
      ctx.fillRect(d.x, d.y + half, d.w, half * (1 - open));
      ctx.strokeStyle = '#2c2e33'; ctx.lineWidth = 2;
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    }
  }
}

// ------------------------------------------------------------------ furniture

function drawFurniture(ctx, room, time, game) {
  for (const f of room.furniture) {
    switch (f.type) {
      case 'wardrobe': {
        ctx.fillStyle = f.locker ? '#3d4450' : '#33241a';
        rr(ctx, f.x, f.y, f.w, f.h, 3); ctx.fill();
        ctx.strokeStyle = f.locker ? '#59637a' : '#4f3826'; ctx.lineWidth = 2;
        rr(ctx, f.x + 2, f.y + 2, f.w - 4, f.h - 4, 2); ctx.stroke();
        // double doors + handles (long axis)
        const vert = f.h > f.w;
        ctx.beginPath();
        if (vert) { ctx.moveTo(f.x + 2, f.y + f.h / 2); ctx.lineTo(f.x + f.w - 2, f.y + f.h / 2); }
        else { ctx.moveTo(f.x + f.w / 2, f.y + 2); ctx.lineTo(f.x + f.w / 2, f.y + f.h - 2); }
        ctx.stroke();
        ctx.fillStyle = '#c7a94f';
        if (vert) { ctx.fillRect(f.x + f.w / 2 - 2, f.y + f.h / 2 - 8, 4, 6); ctx.fillRect(f.x + f.w / 2 - 2, f.y + f.h / 2 + 2, 4, 6); }
        else { ctx.fillRect(f.x + f.w / 2 - 8, f.y + f.h / 2 - 2, 6, 4); ctx.fillRect(f.x + f.w / 2 + 2, f.y + f.h / 2 - 2, 6, 4); }
        if (f.occupied) {
          ctx.fillStyle = 'rgba(240,220,170,0.10)';
          rr(ctx, f.x + 3, f.y + 3, f.w - 6, f.h - 6, 2); ctx.fill();
        }
        break;
      }
      case 'dresser': {
        ctx.fillStyle = '#3c2c1e';
        rr(ctx, f.x, f.y, f.w, f.h, 3); ctx.fill();
        const n = f.drawers ? f.drawers.length : 2;
        const vert = f.h > f.w;
        for (let i = 0; i < n; i++) {
          const dx = vert ? f.x + 3 : f.x + 4 + i * ((f.w - 8) / n);
          const dy = vert ? f.y + 4 + i * ((f.h - 8) / n) : f.y + 3;
          const dw = vert ? f.w - 6 : (f.w - 8) / n - 3;
          const dh = vert ? (f.h - 8) / n - 3 : f.h - 6;
          const open = f.drawers && f.drawers[i].open;
          ctx.fillStyle = open ? '#241a10' : '#54402c';
          ctx.fillRect(dx, dy, dw, dh);
          ctx.fillStyle = '#c7a94f';
          ctx.fillRect(dx + dw / 2 - 3, dy + dh / 2 - 1, 6, 3);
        }
        break;
      }
      case 'bed': {
        ctx.fillStyle = '#2e2418';
        rr(ctx, f.x, f.y, f.w, f.h, 4); ctx.fill();
        ctx.fillStyle = '#5b3844';
        rr(ctx, f.x + 4, f.y + 4, f.w - 8, f.h - 8, 3); ctx.fill();
        ctx.fillStyle = '#d8d2c2';
        rr(ctx, f.x + 8, f.y + 8, f.w - 16, Math.min(34, f.h * 0.3), 4); ctx.fill();
        break;
      }
      case 'sofa': {
        ctx.fillStyle = '#4a3040';
        rr(ctx, f.x, f.y, f.w, f.h, 8); ctx.fill();
        ctx.fillStyle = '#5d3d50';
        const vert = f.h > f.w;
        if (vert) { rr(ctx, f.x + 4, f.y + 6, f.w - 12, f.h - 12, 6); } else { rr(ctx, f.x + 6, f.y + 4, f.w - 12, f.h - 12, 6); }
        ctx.fill();
        break;
      }
      case 'table': {
        ctx.fillStyle = '#513c26';
        rr(ctx, f.x, f.y, f.w, f.h, 6); ctx.fill();
        ctx.strokeStyle = '#39280f'; ctx.lineWidth = 3;
        rr(ctx, f.x + 5, f.y + 5, f.w - 10, f.h - 10, 4); ctx.stroke();
        break;
      }
      case 'plant': {
        ctx.fillStyle = '#5a4632';
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, f.y + f.h / 2, f.w / 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3d6136';
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * TAU + f.x;
          ctx.beginPath();
          ctx.ellipse(f.x + f.w / 2 + Math.cos(a) * 6, f.y + f.h / 2 + Math.sin(a) * 6, 9, 4, a, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'lamp': {
        ctx.fillStyle = '#2c2118';
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, f.y + f.h / 2, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8d9a0';
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, f.y + f.h / 2, 5, 0, TAU); ctx.fill();
        break;
      }
      case 'bookshelf': {
        ctx.fillStyle = '#332618';
        ctx.fillRect(f.x, f.y, f.w, f.h);
        const cols = ['#7a3b3b', '#3b5a7a', '#7a6a3b', '#4a7a3b', '#5d3b7a'];
        let bx = f.x + 4;
        let i = 0;
        while (bx < f.x + f.w - 8) {
          const bw = 6 + ((i * 7) % 8);
          ctx.fillStyle = cols[(i + ((f.x | 0) % 5)) % 5];
          ctx.fillRect(bx, f.y + 4, bw, f.h - 8);
          bx += bw + 2; i++;
        }
        break;
      }
      case 'counter': {
        ctx.fillStyle = '#4c3a24';
        rr(ctx, f.x, f.y, f.w, f.h, 4); ctx.fill();
        ctx.fillStyle = '#6b5433';
        ctx.fillRect(f.x + 3, f.y + 3, f.w - 6, 8);
        break;
      }
      case 'crate': {
        ctx.fillStyle = '#54452c';
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.strokeStyle = '#39301c'; ctx.lineWidth = 2;
        ctx.strokeRect(f.x + 3, f.y + 3, f.w - 6, f.h - 6);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + f.w, f.y + f.h); ctx.stroke();
        break;
      }
      case 'hedge': case 'planter': {
        ctx.fillStyle = f.type === 'hedge' ? '#2c4a28' : '#4a3a28';
        rr(ctx, f.x, f.y, f.w, f.h, 8); ctx.fill();
        ctx.fillStyle = f.type === 'hedge' ? '#38622f' : '#3f6a35';
        for (let i = 0; i < f.w / 14; i++) {
          ctx.beginPath();
          ctx.arc(f.x + 8 + i * 14, f.y + f.h / 2, 7, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'fountain': {
        const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
        ctx.fillStyle = '#565b54';
        ctx.beginPath(); ctx.arc(cx, cy, f.w / 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#24374a';
        ctx.beginPath(); ctx.arc(cx, cy, f.w / 2 - 10, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(150,190,220,0.35)';
        const rip = (time * 30) % 22;
        ctx.beginPath(); ctx.arc(cx, cy, 8 + rip, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#565b54';
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, TAU); ctx.fill();
        break;
      }
      case 'generator': {
        ctx.fillStyle = '#3a3f47';
        rr(ctx, f.x, f.y, f.w, f.h, 4); ctx.fill();
        ctx.fillStyle = '#2b2f36';
        for (let i = 0; i < f.w / 18; i++) ctx.fillRect(f.x + 6 + i * 18, f.y + 6, 10, f.h - 12);
        ctx.fillStyle = game && game.powerOn ? '#7fff9e' : '#812626';
        ctx.beginPath(); ctx.arc(f.x + f.w - 8, f.y + 8, 3, 0, TAU); ctx.fill();
        break;
      }
      case 'breakerbox': {
        ctx.fillStyle = '#5a5f68';
        rr(ctx, f.x, f.y, f.w, f.h, 3); ctx.fill();
        ctx.fillStyle = '#2f333a';
        ctx.fillRect(f.x + 4, f.y + 6, f.w - 8, f.h - 12);
        ctx.fillStyle = game && game.powerOn ? '#7fff9e' : '#c9b458';
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, f.y + f.h - 8, 3, 0, TAU); ctx.fill();
        break;
      }
      case 'debris': {
        // fallen chandelier
        ctx.strokeStyle = '#6b5b2e'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, f.y + f.h / 2, f.w / 2 - 6, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(220,220,240,0.5)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU;
          ctx.beginPath();
          ctx.moveTo(f.x + f.w / 2, f.y + f.h / 2);
          ctx.lineTo(f.x + f.w / 2 + Math.cos(a) * (f.w / 2 - 4), f.y + f.h / 2 + Math.sin(a) * (f.h / 2 - 4));
          ctx.stroke();
        }
        break;
      }
      case 'firejet': {
        ctx.fillStyle = '#26282c';
        rr(ctx, f.x, f.y, f.w, f.h, 4); ctx.fill();
        ctx.strokeStyle = '#0e0f11'; ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(f.x + (f.w / 4) * i, f.y + 4); ctx.lineTo(f.x + (f.w / 4) * i, f.y + f.h - 4); ctx.stroke();
        }
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ items

function drawItems(ctx, room, time) {
  for (const it of room.items) {
    if (it.taken) continue;
    const bob = Math.sin(time * 3 + it.x) * 2;
    switch (it.type) {
      case 'key': {
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(0.6);
        ctx.strokeStyle = '#e6c860'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(-5, 0, 5, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8, 4); ctx.moveTo(12, 0); ctx.lineTo(12, 4); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'gold': {
        ctx.fillStyle = '#c9a445';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(it.x + (i % 2) * 8 - 4, it.y + ((i / 2) | 0) * 5 - 3, 6, 4, 0, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#ecd27c';
        ctx.beginPath(); ctx.ellipse(it.x, it.y - 4, 6, 4, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'scrap': {
        ctx.save();
        ctx.translate(it.x, it.y + bob);
        ctx.rotate(0.15);
        ctx.fillStyle = '#e8dfc8';
        ctx.fillRect(-9, -11, 18, 22);
        ctx.fillStyle = '#2a2a30';
        ctx.font = '11px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(it.symbol, 0, 4);
        ctx.restore();
        break;
      }
      case 'fuse': {
        ctx.fillStyle = '#8a2f2f';
        rr(ctx, it.x - 6, it.y - 10 + bob, 12, 20, 3); ctx.fill();
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(it.x - 6, it.y - 4 + bob, 12, 3);
        ctx.fillRect(it.x - 6, it.y + 3 + bob, 12, 3);
        break;
      }
      default: {
        // generic pickup box (bandage / vitamins / lockpick / crucifix / flashlight)
        ctx.fillStyle = { bandage: '#c9c9c9', vitamins: '#cc7832', lockpick: '#9aa5b5', crucifix: '#d8b45a', flashlight: '#c4b25a', lighter: '#a5652f' }[it.type] || '#999';
        rr(ctx, it.x - 8, it.y - 6 + bob, 16, 12, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        rr(ctx, it.x - 8, it.y - 6 + bob, 16, 12, 3); ctx.stroke();
      }
    }
  }
}

// ------------------------------------------------------------------ doors

export function drawDoor(ctx, door, time, game) {
  const horizWall = door.dir === 'n' || door.dir === 's';
  const T = WALL_T;
  // frame — dupes use a colder, slightly-off frame so they read as "wrong"
  ctx.fillStyle = door.kind === 'fake' ? '#1a1410' : '#241c15';
  if (horizWall) ctx.fillRect(door.cx - door.w / 2 - 6, door.cy - T / 2 - 2, door.w + 12, T + 4);
  else ctx.fillRect(door.cx - T / 2 - 2, door.cy - door.w / 2 - 6, T + 4, door.w + 12);

  // swing panel
  const open = door.openT;
  ctx.save();
  ctx.translate(
    horizWall ? door.cx - door.w / 2 : door.cx,
    horizWall ? door.cy : door.cy - door.w / 2
  );
  ctx.rotate((horizWall ? 0 : Math.PI / 2) + open * 1.9);
  const grad = ctx.createLinearGradient(0, -5, door.w, 5);
  grad.addColorStop(0, door.kind === 'fake' ? '#3a2a1a' : '#553d25');
  grad.addColorStop(1, door.kind === 'fake' ? '#241810' : '#3f2d1b');
  ctx.fillStyle = grad;
  rr(ctx, 0, -5, door.w, 10, 3); ctx.fill();
  ctx.fillStyle = '#c7a94f';
  ctx.beginPath(); ctx.arc(door.w - 12, 0, 3, 0, TAU); ctx.fill();
  ctx.restore();

  // the true door keeps a warm lamp above its frame — the reliable tell
  // against Dupe. dupes have no lamp and sit dark.
  if (door.hasLamp && door.kind !== 'entry') {
    const lx = door.cx, ly = door.cy;
    const glow = 0.7 + Math.sin(time * 3 + door.cx) * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 34);
    g.addColorStop(0, `rgba(255,225,150,${0.9 * glow})`);
    g.addColorStop(0.5, `rgba(255,190,90,${0.4 * glow})`);
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(lx, ly, 34, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, TAU); ctx.fill();
  }

  // number plate
  if (door.num > 0 && door.kind !== 'entry') {
    ctx.save();
    ctx.translate(door.cx, door.cy);
    const off = 26;
    const px = door.dir === 'w' ? -off : door.dir === 'e' ? off : 0;
    const py = door.dir === 'n' ? -off : door.dir === 's' ? off : 0;
    ctx.fillStyle = 'rgba(20,16,10,0.85)';
    rr(ctx, px - 20, py - 11, 40, 22, 4); ctx.fill();
    ctx.strokeStyle = door.kind === 'fake' ? '#5a4a3a' : '#8a7448'; ctx.lineWidth = 1.5;
    rr(ctx, px - 20, py - 11, 40, 22, 4); ctx.stroke();
    ctx.fillStyle = door.kind === 'fake' ? '#9a8e74' : '#e0d5b0';
    ctx.font = 'bold 13px Georgia';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(door.plate).padStart(2, '0'), px, py + 1);
    // padlock icon
    if (door.locked || door.padlocked) {
      ctx.fillStyle = '#c9b458';
      rr(ctx, px + 14, py - 4, 9, 8, 2); ctx.fill();
      ctx.strokeStyle = '#c9b458'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + 18.5, py - 5, 3.5, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ room

export function drawRoom(ctx, room, time, game) {
  drawFloor(ctx, room);
  drawDecor(ctx, room, time);
  drawFurniture(ctx, room, time, game);
  drawItems(ctx, room, time);

  // walls
  const p = pal(room);
  for (const wl of room.walls) {
    ctx.fillStyle = p.wall;
    ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.fillStyle = p.wallEdge;
    ctx.fillRect(wl.x, wl.y, wl.w, Math.min(4, wl.h));
  }

  drawWallDecor(ctx, room, time, game);

  for (const d of room.doors) drawDoor(ctx, d, time, game);

  // light fixture markers (visual anchor for ceiling lights)
  for (const l of room.lights) {
    if (l.fixture === 'chandelier') {
      ctx.strokeStyle = 'rgba(200,170,90,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(l.x, l.y, 16, 0, TAU); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + time * 0.1;
        ctx.fillStyle = room.lightsBroken ? '#333' : '#ffe9b0';
        ctx.beginPath(); ctx.arc(l.x + Math.cos(a) * 16, l.y + Math.sin(a) * 16, 3, 0, TAU); ctx.fill();
      }
    } else if (l.fixture === 'candle') {
      ctx.fillStyle = '#d8cfa8';
      ctx.fillRect(l.x - 2, l.y - 5, 4, 10);
    }
  }
}
