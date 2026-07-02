// math + rng helpers

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

// smallest signed difference between two angles
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeIn = t => t * t * t;

// mulberry32 seeded rng
export class RNG {
  constructor(seed = (Math.random() * 2 ** 31) | 0) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// axis-aligned rect helpers. rects are {x, y, w, h}
export const rectContains = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// resolve a circle against an AABB; returns corrected {x, y} or null if no hit
export function circleVsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const push = (r - d) / d;
  // circle center inside the rect: push out the shortest side
  if (d2 < 0.0001) {
    const l = cx - rect.x, rr = rect.x + rect.w - cx;
    const t = cy - rect.y, bb = rect.y + rect.h - cy;
    const m = Math.min(l, rr, t, bb);
    if (m === l) return { x: rect.x - r, y: cy };
    if (m === rr) return { x: rect.x + rect.w + r, y: cy };
    if (m === t) return { x: cx, y: rect.y - r };
    return { x: cx, y: rect.y + rect.h + r };
  }
  return { x: cx + dx * push, y: cy + dy * push };
}

export const DIRS = {
  n: { dx: 0, dy: -1, opp: 's', ang: -Math.PI / 2 },
  s: { dx: 0, dy: 1, opp: 'n', ang: Math.PI / 2 },
  e: { dx: 1, dy: 0, opp: 'w', ang: 0 },
  w: { dx: -1, dy: 0, opp: 'e', ang: Math.PI },
};
export const leftOf = d => ({ n: 'w', w: 's', s: 'e', e: 'n' })[d];
export const rightOf = d => ({ n: 'e', e: 's', s: 'w', w: 'n' })[d];
