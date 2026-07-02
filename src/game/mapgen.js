// procedural hotel generation.
// rooms are axis-aligned rects tiled edge to edge; door N leads into room N.

import { DIRS, leftOf, rightOf, rectsOverlap } from '../engine/math.js';

export const WALL_T = 14;
export const DOOR_W = 68;

let uid = 1;

// ---------------------------------------------------------------- door + room

function makeDoor(cx, cy, dir, num, kind = 'next', opts = {}) {
  return {
    id: uid++,
    cx, cy, dir, num, kind,          // kind: 'next' | 'fake' | 'entry'
    w: DOOR_W,
    locked: opts.locked || false,
    keyId: opts.keyId || null,
    opened: false,
    openT: 0,
    fromRoom: null,
    toRoom: null,
    hasLamp: opts.hasLamp ?? (kind === 'next'),
    plate: opts.plate ?? num,        // number shown on the plate
  };
}

function baseRoom(num, rect) {
  return {
    id: uid++,
    num, rect,
    entryDir: 'e',
    entryDoor: null,
    doors: [],
    walls: [],
    furniture: [],
    decor: [],
    lights: [],
    items: [],          // free-standing pickups {type,x,y,taken,gold?}
    darkRoom: false,
    ambient: 0.78,
    special: null,
    floorStyle: 'wood',
    zone: 'hotel',
    visited: false,
    lightsBroken: false,
    flicker: 0,
  };
}

// carve wall AABBs around the rect, leaving gaps for doors
export function buildWalls(room) {
  const { x, y, w, h } = room.rect;
  const T = WALL_T;
  const gaps = { n: [], s: [], e: [], w: [] };
  const openings = [...room.doors];
  if (room.entryDoor) openings.push(room.entryDoor);
  for (const d of openings) {
    // which side of THIS room the door sits on
    let side;
    if (Math.abs(d.cy - y) < 2) side = 'n';
    else if (Math.abs(d.cy - (y + h)) < 2) side = 's';
    else if (Math.abs(d.cx - x) < 2) side = 'w';
    else if (Math.abs(d.cx - (x + w)) < 2) side = 'e';
    if (side) gaps[side].push(side === 'n' || side === 's' ? d.cx : d.cy);
  }
  const segs = [];
  const addRun = (isH, fixed, from, to, gapList) => {
    const sorted = gapList.slice().sort((a, b) => a - b);
    let cur = from;
    for (const g of sorted) {
      const g0 = g - DOOR_W / 2, g1 = g + DOOR_W / 2;
      if (g0 > cur) segs.push(isH ? { x: cur, y: fixed, w: g0 - cur, h: T } : { x: fixed, y: cur, w: T, h: g0 - cur });
      cur = Math.max(cur, g1);
    }
    if (to > cur) segs.push(isH ? { x: cur, y: fixed, w: to - cur, h: T } : { x: fixed, y: cur, w: T, h: to - cur });
  };
  addRun(true, y, x, x + w, gaps.n);                 // north (inner band)
  addRun(true, y + h - T, x, x + w, gaps.s);
  addRun(false, x, y, y + h, gaps.w);
  addRun(false, x + w - T, y, y + h, gaps.e);
  room.walls = segs;
}

// place a rect for a room entered through door `door` (travel dir door.dir)
function placeRect(door, w, h, off = 0.5) {
  const d = door.dir;
  if (d === 'e') return { x: door.cx, y: door.cy - h * off, w, h };
  if (d === 'w') return { x: door.cx - w, y: door.cy - h * off, w, h };
  if (d === 's') return { x: door.cx - w * off, y: door.cy, w, h };
  return { x: door.cx - w * off, y: door.cy - h, w, h };
}

// clamp entry gap safely inside wall span
function fixEntryOffset(door, rect) {
  const m = DOOR_W / 2 + WALL_T + 26;
  if (door.dir === 'e' || door.dir === 'w') {
    const minY = rect.y + m, maxY = rect.y + rect.h - m;
    door.cy = Math.min(Math.max(door.cy, minY), maxY);
  } else {
    const minX = rect.x + m, maxX = rect.x + rect.w - m;
    door.cx = Math.min(Math.max(door.cx, minX), maxX);
  }
  return rect;
}

// overlap test with a small tolerance so rooms that merely share a wall
// (floating-point touching) are not treated as colliding
function overlapTol(a, b, tol = 3) {
  return a.x < b.x + b.w - tol && a.x + a.w > b.x + tol &&
         a.y < b.y + b.h - tol && a.y + a.h > b.y + tol;
}

// place a rect extending from `door` in its travel direction, retrying offsets
// so the new room never overlaps existing geometry
function placeSafe(rng, door, w, h, existingRooms) {
  for (let i = 0; i < 14; i++) {
    const off = i === 0 ? 0.5 : rng.range(0.12, 0.88);
    const rect = fixEntryOffset(door, placeRect(door, w, h, off));
    if (!existingRooms.some(r => overlapTol(rect, r.rect))) return rect;
  }
  // last resort: a short straight stub extending away from the door
  const along = door.dir === 'e' || door.dir === 'w';
  const sw = along ? 460 : 220, sh = along ? 220 : 460;
  return fixEntryOffset(door, placeRect(door, sw, sh, 0.5));
}

// estimate the next room's rect if the exit is on `side` — used to stop turns
// from pointing the chain back into already-built rooms
function _exitProbe(room, side, w, h) {
  const { x, y, w: rw, h: rh } = room.rect;
  const m = DOOR_W / 2 + WALL_T + 20;
  let cx, cy;
  if (side === 'n') { cx = x + m + (rw - m * 2) * 0.5; cy = y; }
  else if (side === 's') { cx = x + m + (rw - m * 2) * 0.5; cy = y + rh; }
  else if (side === 'w') { cx = x; cy = y + m + (rh - m * 2) * 0.5; }
  else { cx = x + rw; cy = y + m + (rh - m * 2) * 0.5; }
  const d = side;
  if (d === 'e') return { x: cx, y: cy - h * 0.5, w, h };
  if (d === 'w') return { x: cx - w, y: cy - h * 0.5, w, h };
  if (d === 's') return { x: cx - w * 0.5, y: cy, w, h };
  return { x: cx - w * 0.5, y: cy - h, w, h };
}

// prefer straight ahead; allow a turn only if its probe doesn't hit anything
function _pickSafeExit(rng, room, travel, exitSides, existingRooms) {
  if (exitSides) return rng.pick(exitSides);
  const turns = [leftOf(travel), rightOf(travel)];
  const order = [travel, travel, travel, ...rng.shuffle(turns)];
  for (const side of order) {
    const probe = _exitProbe(room, side, 520, 440);
    const hit = overlapTol(probe, room.rect) || existingRooms.some(r => overlapTol(probe, r.rect));
    if (!hit) return side;
  }
  return travel;
}

// put an exit door centered on a wall side, at offset frac (0..1 along wall)
function addExit(room, side, frac, num, kind = 'next', opts = {}) {
  const { x, y, w, h } = room.rect;
  const m = DOOR_W / 2 + WALL_T + 20;
  let cx, cy;
  if (side === 'n') { cx = x + m + (w - m * 2) * frac; cy = y; }
  else if (side === 's') { cx = x + m + (w - m * 2) * frac; cy = y + h; }
  else if (side === 'w') { cx = x; cy = y + m + (h - m * 2) * frac; }
  else { cx = x + w; cy = y + m + (h - m * 2) * frac; }
  const door = makeDoor(cx, cy, side, num, kind, opts);
  door.fromRoom = room;
  room.doors.push(door);
  return door;
}

// ---------------------------------------------------------------- furniture

function furn(type, x, y, w, h, extra = {}) {
  return { id: uid++, type, x, y, w, h, solid: true, ...extra };
}

// place furniture flush against a wall side at frac along it, avoiding openings
function wallSpot(room, side, frac, fw, fh) {
  const { x, y, w, h } = room.rect;
  const T = WALL_T + 2;
  if (side === 'n') return { x: x + T + (w - fw - T * 2) * frac, y: y + T, w: fw, h: fh };
  if (side === 's') return { x: x + T + (w - fw - T * 2) * frac, y: y + h - T - fh, w: fw, h: fh };
  if (side === 'w') return { x: x + T, y: y + T + (h - fh - T * 2) * frac, w: fw, h: fh };
  return { x: x + w - T - fw, y: y + T + (h - fh - T * 2) * frac, w: fw, h: fh };
}

function overlapsAny(r, list, pad = 8) {
  const rr = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  return list.some(f => rectsOverlap(rr, f));
}

function nearOpening(r, room, pad = 46) {
  const openings = [...room.doors];
  if (room.entryDoor) openings.push(room.entryDoor);
  return openings.some(d => {
    const dz = { x: d.cx - DOOR_W / 2 - pad, y: d.cy - DOOR_W / 2 - pad, w: DOOR_W + pad * 2, h: DOOR_W + pad * 2 };
    return rectsOverlap(dz, r);
  });
}

function tryWallFurn(rng, room, type, fw, fh, extra = {}, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const side = rng.pick(['n', 's', 'e', 'w']);
    const vert = side === 'w' || side === 'e';
    const spot = wallSpot(room, side, rng.next(), vert ? fh : fw, vert ? fw : fh);
    if (overlapsAny(spot, room.furniture) || nearOpening(spot, room)) continue;
    const f = furn(type, spot.x, spot.y, spot.w, spot.h, { side, ...extra });
    room.furniture.push(f);
    return f;
  }
  return null;
}

function makeDrawers(rng, f, loot) {
  const n = Math.max(1, Math.round(Math.max(f.w, f.h) / 46));
  f.drawers = [];
  for (let i = 0; i < n; i++) {
    f.drawers.push({ open: false, loot: loot ? loot(i) : null, looted: false });
  }
}

// standard drawer loot table
function lootRoll(rng, num) {
  const r = rng.next();
  if (r < 0.34) return { type: 'gold', amount: rng.int(4, 18 + Math.floor(num / 4)) };
  if (r < 0.44) return { type: 'bandage' };
  if (r < 0.50) return { type: 'vitamins' };
  if (r < 0.53) return { type: 'lockpick' };
  if (r < 0.545) return { type: 'crucifix' };
  return null;
}

// ---------------------------------------------------------------- decorate

function decorate(rng, room, opts) {
  const { rect } = room;
  const area = rect.w * rect.h;
  const isCorridor = Math.min(rect.w, rect.h) < 260;

  // ceiling lights
  if (!room.darkRoom) {
    if (isCorridor) {
      const horiz = rect.w > rect.h;
      const n = Math.max(1, Math.floor((horiz ? rect.w : rect.h) / 300));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        room.lights.push({
          x: horiz ? rect.x + rect.w * t : rect.x + rect.w / 2,
          y: horiz ? rect.y + rect.h / 2 : rect.y + rect.h * t,
          r: 230, warm: true, fixture: 'sconce',
        });
      }
    } else {
      room.lights.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, r: Math.max(rect.w, rect.h) * 0.75, warm: true, fixture: 'chandelier' });
      if (area > 250000) {
        room.lights.push({ x: rect.x + rect.w * 0.25, y: rect.y + rect.h / 2, r: 260, warm: true, fixture: 'lamp' });
      }
    }
  }

  // rug
  if (!isCorridor && rng.chance(0.7)) {
    room.decor.push({ type: 'rug', x: rect.x + rect.w * 0.5, y: rect.y + rect.h * 0.5, w: rect.w * 0.45, h: rect.h * 0.4, tone: rng.int(0, 2) });
  } else if (isCorridor) {
    room.decor.push({ type: 'runner', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: rect.w > rect.h ? rect.w * 0.86 : 90, h: rect.w > rect.h ? 90 : rect.h * 0.86 });
  }

  // paintings + windows on walls
  const nPaint = rng.int(1, 3);
  for (let i = 0; i < nPaint; i++) {
    const side = rng.pick(['n', 's', 'e', 'w']);
    const s = wallSpot(room, side, rng.next(), 60, 8);
    if (!nearOpening(s, room, 30)) room.decor.push({ type: rng.chance(0.75) ? 'painting' : 'window', ...s, side, variant: rng.int(0, 3) });
  }

  // wardrobes — survival essentials
  const nWard = opts.wardrobes ?? (isCorridor ? (rng.chance(0.7) ? 1 : 0) : rng.int(1, 2));
  for (let i = 0; i < nWard; i++) {
    const f = tryWallFurn(rng, room, 'wardrobe', 74, 30, { hideable: true });
    if (f) f.occupied = false;
  }

  // dressers with drawers
  const nDress = isCorridor ? rng.int(0, 1) : rng.int(1, 3);
  for (let i = 0; i < nDress; i++) {
    const f = tryWallFurn(rng, room, 'dresser', 88, 26);
    if (f) makeDrawers(rng, f, () => lootRoll(rng, room.num));
  }

  // big rooms: beds/sofas/tables/plants
  if (!isCorridor) {
    if (rng.chance(0.4)) tryWallFurn(rng, room, 'bed', 90, 130);
    if (rng.chance(0.5)) tryWallFurn(rng, room, 'sofa', 110, 34);
    if (rng.chance(0.55)) {
      const tw = rng.int(80, 130), th = rng.int(60, 90);
      const spot = {
        x: rect.x + rect.w * rng.range(0.3, 0.6) - tw / 2,
        y: rect.y + rect.h * rng.range(0.3, 0.6) - th / 2, w: tw, h: th,
      };
      if (!overlapsAny(spot, room.furniture) && !nearOpening(spot, room)) {
        room.furniture.push(furn('table', spot.x, spot.y, tw, th, { hideUnder: true }));
        if (rng.chance(0.4)) room.items.push({ type: 'gold', x: spot.x + tw / 2, y: spot.y + th / 2, amount: rng.int(3, 12), taken: false });
      }
    }
    for (let i = 0, n = rng.int(0, 2); i < n; i++) tryWallFurn(rng, room, 'plant', 30, 30);
    if (rng.chance(0.35)) {
      const f = tryWallFurn(rng, room, 'lamp', 26, 26);
      if (f && !room.darkRoom) room.lights.push({ x: f.x + f.w / 2, y: f.y + f.h / 2, r: 190, warm: true, fixture: 'floorlamp' });
    }
  }

  // cobwebs in corners
  if (rng.chance(0.5)) room.decor.push({ type: 'cobweb', x: rect.x + WALL_T, y: rect.y + WALL_T, w: 40, h: 40, corner: 0 });
}

// ---------------------------------------------------------------- generators

// generic room / corridor
export function makeRoom(rng, num, entryDoor, opts = {}, existingRooms = []) {
  const isCorridor = opts.corridor ?? rng.chance(0.4);
  let w, h, rect;
  const along = entryDoor.dir === 'e' || entryDoor.dir === 'w';

  // place with overlap avoidance — retry a few times, then fall back to a
  // short straight corridor so the hotel never folds back on itself
  let placed = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (isCorridor) {
      const len = rng.int(520, 760), wid = rng.int(200, 250);
      w = along ? len : wid; h = along ? wid : len;
    } else {
      w = rng.int(400, 620); h = rng.int(360, 560);
    }
    rect = fixEntryOffset(entryDoor, placeRect(entryDoor, w, h, rng.range(0.3, 0.7)));
    if (!existingRooms.some(r => overlapTol(rect, r.rect))) { placed = true; break; }
  }
  if (!placed) {
    // last resort: delegate to placeSafe which shrinks to a straight stub
    rect = placeSafe(rng, entryDoor, w || (along ? 460 : 220), h || (along ? 220 : 460), existingRooms);
  }

  const room = baseRoom(num, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.darkRoom = !!opts.dark;
  room.ambient = opts.dark ? 0.94 : 0.8;
  room.zone = opts.zone || 'hotel';
  room.floorStyle = isCorridor ? 'carpet' : (rng.chance(0.6) ? 'wood' : 'carpet');

  // choose exit side — strongly prefer straight ahead; a turn is allowed only
  // when it won't immediately point the next room back into existing geometry
  const travel = entryDoor.dir;
  const side = opts.exitSide || _pickSafeExit(rng, room, travel, opts.exitSides, existingRooms);
  const exitOpts = { locked: !!opts.locked, keyId: opts.locked ? `key${num + 1}` : null };
  const exit = addExit(room, side, rng.range(0.25, 0.75), num + 1, 'next', exitOpts);

  // dupe fake doors
  const nFakes = opts.fakeDoors || 0;
  const freeSides = ['n', 's', 'e', 'w'].filter(s => s !== side && s !== DIRS[travel].opp);
  for (let i = 0; i < nFakes && i < freeSides.length; i++) {
    addExit(room, freeSides[i], rng.range(0.3, 0.7), num + 1, 'fake', { hasLamp: false, plate: num + 1 });
  }

  decorate(rng, room, opts);

  // key for a locked exit hides in this room
  if (opts.locked) {
    const dressers = room.furniture.filter(f => f.drawers);
    if (dressers.length && rng.chance(0.65)) {
      const d = rng.pick(dressers);
      d.drawers[rng.int(0, d.drawers.length - 1)].loot = { type: 'key', keyId: `key${num + 1}` };
    } else {
      // visible on the floor / a table
      const t = room.furniture.find(f => f.type === 'table');
      room.items.push({
        type: 'key', keyId: `key${num + 1}`, taken: false,
        x: t ? t.x + t.w / 2 : rect.x + rect.w * rng.range(0.3, 0.7),
        y: t ? t.y + t.h / 2 : rect.y + rect.h * rng.range(0.3, 0.7),
      });
    }
  }

  if (opts.guaranteedLoot) {
    room.items.push({ type: opts.guaranteedLoot, x: rect.x + rect.w / 2 + 40, y: rect.y + rect.h / 2 + 30, taken: false });
  }

  buildWalls(room);
  return room;
}

// the lobby — run start
export function makeLobby() {
  const rect = { x: -300, y: -260, w: 600, h: 520 };
  const room = baseRoom(0, rect);
  room.special = 'lobby';
  room.floorStyle = 'carpet';
  room.ambient = 0.68;
  room.entryDir = 'e';
  const exit = addExit(room, 'e', 0.5, 1, 'next');
  room.lights.push({ x: 0, y: 0, r: 560, warm: true, fixture: 'chandelier' });
  room.decor.push({ type: 'rug', x: 0, y: 0, w: 320, h: 260, tone: 0 });
  room.decor.push({ type: 'elevator', x: rect.x + 6, y: -70, w: WALL_T + 10, h: 140, side: 'w' });
  room.furniture.push(furn('sofa', -240, -220, 120, 36, { side: 'n' }));
  room.furniture.push(furn('plant', -285, -100, 30, 30));
  room.furniture.push(furn('plant', -285, 80, 30, 30));
  room.furniture.push(furn('counter', 60, -240, 170, 40));
  room.decor.push({ type: 'painting', x: -80, y: rect.y + 4, w: 70, h: 10, side: 'n', variant: 1 });
  buildWalls(room);
  return room;
}

// halt's blue corridor — very long, exit at far end
export function makeHaltCorridor(rng, num, entryDoor, existingRooms = []) {
  const along = entryDoor.dir === 'e' || entryDoor.dir === 'w';
  const len = 1500, wid = 190;
  const rect = placeSafe(rng, entryDoor, along ? len : wid, along ? wid : len, existingRooms);
  const room = baseRoom(num, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.special = 'halt';
  room.darkRoom = true;
  room.ambient = 0.93;
  room.floorStyle = 'tile';
  addExit(room, entryDoor.dir, 0.5, num + 1, 'next', { hasLamp: false });
  room.decor.push({ type: 'runner', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: along ? rect.w * 0.9 : 80, h: along ? 80 : rect.h * 0.9 });
  buildWalls(room);
  return room;
}

// seek chase: chain of corridor segments, obstacles + wrong side doors
export function makeSeekChain(rng, startNum, entryDoor, segments = 6, existingRooms = []) {
  const rooms = [];
  const avoid = existingRooms.slice();   // grows with each placed segment
  let door = entryDoor;
  for (let s = 0; s < segments; s++) {
    const num = startNum + s;
    const along = door.dir === 'e' || door.dir === 'w';
    const len = rng.int(700, 950), wid = 230;
    let rect = fixEntryOffset(door, placeRect(door, along ? len : wid, along ? wid : len, 0.5));
    // if this segment would collide, shorten it until it clears
    for (let tries = 0; tries < 6 && avoid.some(r => overlapTol(rect, r.rect)); tries++) {
      const nlen = Math.max(420, len - tries * 90);
      rect = fixEntryOffset(door, placeRect(door, along ? nlen : wid, along ? wid : nlen, 0.5));
    }
    const room = baseRoom(num, rect);
    avoid.push(room);
    room.entryDir = door.dir;
    room.entryDoor = door;
    door.toRoom = room;
    room.special = 'seek';
    room.ambient = 0.84;
    room.floorStyle = 'carpet';
    room.zone = 'seek';

    // pick turn: keep the chase snaking, but never pick a side whose probe
    // would run straight back into existing geometry
    const travel = door.dir;
    const isLast = s === segments - 1;
    let side;
    if (isLast) {
      side = travel;
    } else {
      const cands = [travel, travel, leftOf(travel), rightOf(travel)].filter(c => {
        const p = _exitProbe(room, c, 520, 440);
        return !overlapTol(p, room.rect) && !avoid.some(r => overlapTol(p, r.rect));
      });
      side = cands.length ? rng.pick(cands) : travel;
    }
    const exit = addExit(room, side, 0.5, num + 1, 'next', { hasLamp: false });
    exit.seekCorrect = true;
    if (isLast) exit.seekFinal = true;

    // decoy locked doors
    for (const fs of ['n', 's', 'e', 'w']) {
      if (fs === side || fs === DIRS[travel].opp) continue;
      if (rng.chance(0.5)) {
        const fd = addExit(room, fs, rng.next(), num + 1, 'fake', { hasLamp: false, plate: '?' });
        fd.seekDecoy = true;
      }
    }

    // obstacles: fallen chandeliers (slow) + fire jets (damage)
    const nObs = rng.int(1, 3);
    for (let i = 0; i < nObs; i++) {
      const t = 0.25 + 0.5 * rng.next();
      const ox = along ? rect.x + rect.w * t : rect.x + rect.w / 2 + rng.range(-40, 40);
      const oy = along ? rect.y + rect.h / 2 + rng.range(-40, 40) : rect.y + rect.h * t;
      if (rng.chance(0.55)) {
        room.furniture.push(furn('debris', ox - 40, oy - 40, 80, 80, { solid: false, slow: true }));
      } else {
        room.furniture.push(furn('firejet', ox - 22, oy - 22, 44, 44, { solid: false, fire: true, phase: rng.next() * 6 }));
      }
    }
    // flicker sconces
    const horiz = rect.w > rect.h;
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      room.lights.push({
        x: horiz ? rect.x + rect.w * t : rect.x + rect.w / 2,
        y: horiz ? rect.y + rect.h / 2 : rect.y + rect.h * t,
        r: 210, warm: true, flicker: true, fixture: 'sconce',
      });
    }
    room.decor.push({ type: 'runner', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: horiz ? rect.w * 0.9 : 90, h: horiz ? 90 : rect.h * 0.9 });
    buildWalls(room);
    rooms.push(room);
    door = exit;
  }
  return rooms;
}

// door 50 — the library
export function makeLibrary(rng, entryDoor, existingRooms = []) {
  const w = 1050, h = 820;
  const rect = placeSafe(rng, entryDoor, w, h, existingRooms);
  const room = baseRoom(50, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.special = 'library';
  room.ambient = 0.9;
  room.darkRoom = true;
  room.floorStyle = 'wood';
  const exit = addExit(room, entryDoor.dir, 0.5, 51, 'next', { hasLamp: false });
  exit.padlocked = true;
  exit.locked = true;

  // bookshelf rows forming aisles
  const rows = 4;
  const shelves = [];
  for (let r = 0; r < rows; r++) {
    const sy = rect.y + 130 + r * ((h - 260) / (rows - 1)) - 16;
    let sx = rect.x + 110;
    while (sx < rect.x + w - 210) {
      const sw = rng.int(120, 200);
      if (rng.chance(0.8)) {
        const f = furn('bookshelf', sx, sy, sw, 34);
        room.furniture.push(f);
        shelves.push(f);
      }
      sx += sw + rng.int(60, 130);
    }
  }
  // reading tables to hide under
  for (let i = 0; i < 3; i++) {
    const spot = { x: rect.x + 160 + i * 300 + rng.range(-30, 30), y: rect.y + h * rng.range(0.3, 0.6), w: 110, h: 76 };
    if (!overlapsAny(spot, room.furniture)) room.furniture.push(furn('table', spot.x, spot.y, spot.w, spot.h, { hideUnder: true }));
  }
  // candles for mood
  for (let i = 0; i < 5; i++) {
    room.lights.push({ x: rect.x + 120 + rng.next() * (w - 240), y: rect.y + 90 + rng.next() * (h - 180), r: 120, warm: true, fixture: 'candle', flicker: true });
  }

  // padlock code scraps hidden across shelves
  const symbols = ['◆', '✶', '☾', '▲', '⬟'];
  const code = [];
  for (let i = 0; i < 5; i++) code.push(rng.int(0, 9));
  room.libCode = code;
  room.libSymbols = symbols;
  const spots = rng.shuffle(shelves).slice(0, 5);
  spots.forEach((s, i) => {
    room.items.push({
      type: 'scrap', idx: i, symbol: symbols[i], digit: code[i], taken: false,
      x: s.x + s.w / 2, y: s.y + s.h / 2 + 30,
    });
  });

  buildWalls(room);
  return room;
}

// door 51 — breather corridor between library and shop
export function makeBreather(rng, num, entryDoor, existingRooms = []) {
  return makeRoom(rng, num, entryDoor, { corridor: true, exitSide: entryDoor.dir, wardrobes: 1 }, existingRooms);
}

// door 52 — jeff's shop
export function makeShop(rng, entryDoor, existingRooms = []) {
  const along = entryDoor.dir === 'e' || entryDoor.dir === 'w';
  const w = along ? 640 : 480, h = along ? 480 : 640;
  const rect = placeSafe(rng, entryDoor, w, h, existingRooms);
  const room = baseRoom(52, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.special = 'shop';
  room.ambient = 0.6;
  room.floorStyle = 'wood';
  room.zone = 'shop';
  addExit(room, entryDoor.dir, 0.5, 53, 'next');

  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  room.lights.push({ x: cx, y: cy, r: 520, warm: true, fixture: 'chandelier' });
  room.furniture.push(furn('counter', cx - 130, cy - 40, 200, 46, { shop: true }));
  room.npcs = [
    { type: 'jeff', x: cx - 30, y: cy - 70, r: 22 },
    { type: 'goblino', x: cx + 150, y: cy + 80, r: 16, talkT: 0 },
    { type: 'bob', x: cx - 200, y: cy + 110, r: 14 },
  ];
  room.decor.push({ type: 'rug', x: cx, y: cy + 60, w: 240, h: 160, tone: 1 });
  room.furniture.push(furn('crate', cx + 90, cy - 130, 50, 50));
  room.furniture.push(furn('crate', cx + 150, cy - 110, 44, 44));
  room.furniture.push(furn('plant', rect.x + WALL_T + 6, rect.y + WALL_T + 6, 30, 30));
  buildWalls(room);
  return room;
}

// door 60 — the courtyard
export function makeCourtyard(rng, entryDoor, existingRooms = []) {
  const w = 760, h = 640;
  const rect = placeSafe(rng, entryDoor, w, h, existingRooms);
  const room = baseRoom(60, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.special = 'courtyard';
  room.ambient = 0.84;
  room.moonlit = true;
  room.floorStyle = 'stone';
  room.zone = 'courtyard';
  addExit(room, entryDoor.dir, 0.5, 61, 'next');

  const cx = rect.x + w / 2, cy = rect.y + h / 2;
  room.furniture.push(furn('fountain', cx - 60, cy - 60, 120, 120));
  room.lights.push({ x: cx, y: cy, r: 420, moon: true, fixture: 'moon' });
  for (let i = 0; i < 7; i++) tryWallFurn(rng, room, 'hedge', rng.int(70, 130), 34);
  for (let i = 0; i < 4; i++) tryWallFurn(rng, room, 'plant', 34, 34);
  room.decor.push({ type: 'path', x: cx, y: cy, w: w * 0.8, h: 70 });
  buildWalls(room);
  return room;
}

// greenhouse wing, doors 90..99 (dark, overgrown; 99's exit is locked)
export function makeGreenhouse(rng, num, entryDoor, opts = {}, existingRooms = []) {
  const room = makeRoom(rng, num, entryDoor, {
    ...opts,
    dark: true,
    zone: 'greenhouse',
    corridor: num % 2 === 1,
  }, existingRooms);
  room.special = 'greenhouse';
  room.floorStyle = 'moss';
  room.ambient = 0.93;
  // vines + planters
  for (let i = 0; i < 4; i++) tryWallFurn(rng, room, 'planter', rng.int(60, 110), 30);
  for (let i = 0; i < 3; i++) {
    room.decor.push({
      type: 'vines',
      x: room.rect.x + rng.next() * room.rect.w, y: room.rect.y + rng.next() * room.rect.h,
      w: rng.int(60, 140), h: rng.int(60, 140),
    });
  }
  return room;
}

// door 100 — the electrical room
export function makeElectrical(rng, entryDoor, existingRooms = []) {
  const w = 1100, h = 860;
  const rect = placeSafe(rng, entryDoor, w, h, existingRooms);
  const room = baseRoom(100, rect);
  room.entryDir = entryDoor.dir;
  room.entryDoor = entryDoor;
  entryDoor.toRoom = room;
  room.special = 'electrical';
  room.darkRoom = true;
  room.ambient = 0.95;
  room.floorStyle = 'concrete';
  room.zone = 'electrical';

  const cx = rect.x + w / 2, cy = rect.y + h / 2;

  // generator blocks + pipes as maze-ish cover
  const blocks = [
    [0.2, 0.25, 140, 90], [0.55, 0.2, 110, 110], [0.8, 0.35, 90, 140],
    [0.25, 0.6, 100, 120], [0.5, 0.55, 150, 80], [0.75, 0.7, 130, 90],
    [0.15, 0.82, 120, 70], [0.6, 0.85, 100, 60],
  ];
  for (const [fx, fy, bw, bh] of blocks) {
    room.furniture.push(furn('generator', rect.x + w * fx - bw / 2, rect.y + h * fy - bh / 2, bw, bh, { hum: true }));
  }
  // hide lockers
  room.furniture.push(furn('wardrobe', rect.x + w * 0.35 - 36, rect.y + WALL_T + 2, 72, 30, { hideable: true, side: 'n', locker: true }));
  room.furniture.push(furn('wardrobe', rect.x + w * 0.7 - 36, rect.y + h - WALL_T - 32, 72, 30, { hideable: true, side: 's', locker: true }));

  // breaker box on far wall
  const bx = rect.x + w - WALL_T - 30, by = cy - 40;
  room.furniture.push(furn('breakerbox', bx, by, 26, 80, { breaker: true }));

  // elevator on the far end (locked until power)
  room.decor.push({ type: 'elevator', x: rect.x + w - WALL_T - 8, y: cy + 190, w: WALL_T + 12, h: 150, side: 'e', final: true });
  room.elevatorZone = { x: rect.x + w - 150, y: cy + 150, w: 130, h: 230 };

  // fuses scattered
  const fuseSpots = [[0.2, 0.2], [0.45, 0.75], [0.75, 0.25]];
  fuseSpots.forEach(([fx, fy], i) => {
    room.items.push({ type: 'fuse', idx: i, x: rect.x + w * fx + 20, y: rect.y + h * fy + 20, taken: false });
  });

  // faint red emergency lights
  for (let i = 0; i < 3; i++) {
    room.lights.push({ x: rect.x + w * (0.25 + i * 0.25), y: rect.y + 60, r: 150, red: true, fixture: 'emergency' });
  }
  buildWalls(room);
  return room;
}
