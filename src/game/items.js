// item definitions + inventory

import { rr } from './render.js';
import { TAU } from '../engine/math.js';

export const ITEMS = {
  flashlight: {
    name: 'Flashlight', stack: 1, price: 60,
    desc: 'a strong beam. mouse aims it.',
    icon(c) {
      c.fillStyle = '#c4b25a'; rr(c, 6, 16, 18, 8, 3); c.fill();
      c.fillStyle = '#8a7d3a'; rr(c, 22, 14, 8, 12, 2); c.fill();
      c.fillStyle = 'rgba(255,240,170,0.7)';
      c.beginPath(); c.moveTo(30, 20); c.lineTo(39, 13); c.lineTo(39, 27); c.closePath(); c.fill();
    },
  },
  lighter: {
    name: 'Lighter', stack: 1, price: 25,
    desc: 'a small, warm glow around you.',
    icon(c) {
      c.fillStyle = '#a5652f'; rr(c, 12, 16, 12, 16, 2); c.fill();
      c.fillStyle = '#ffb84a';
      c.beginPath(); c.ellipse(18, 12, 4, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff3c4';
      c.beginPath(); c.ellipse(18, 13, 2, 4, 0, 0, TAU); c.fill();
    },
  },
  key: {
    name: 'Room Key', stack: 8, price: 0,
    desc: 'opens a specific lock.',
    icon(c) {
      c.strokeStyle = '#e6c860'; c.lineWidth = 3;
      c.beginPath(); c.arc(13, 20, 6, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(19, 20); c.lineTo(32, 20); c.stroke();
      c.beginPath(); c.moveTo(27, 20); c.lineTo(27, 25); c.moveTo(32, 20); c.lineTo(32, 25); c.stroke();
    },
  },
  lockpick: {
    name: 'Lockpick', stack: 4, price: 50,
    desc: 'forces any lock. single use.',
    icon(c) {
      c.strokeStyle = '#9aa5b5'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(8, 28); c.lineTo(24, 12); c.stroke();
      c.beginPath(); c.arc(27, 10, 4, 0, TAU); c.stroke();
      c.strokeStyle = '#6a7585';
      c.beginPath(); c.moveTo(12, 30); c.lineTo(20, 30); c.stroke();
    },
  },
  vitamins: {
    name: 'Vitamins', stack: 3, price: 40,
    desc: 'brief burst of speed.',
    icon(c) {
      c.fillStyle = '#cc7832'; rr(c, 10, 12, 16, 20, 4); c.fill();
      c.fillStyle = '#f2e2c8'; rr(c, 10, 12, 16, 7, 3); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(18, 25, 4, 2.5, 0.5, 0, TAU); c.fill();
    },
  },
  bandage: {
    name: 'Bandage', stack: 3, price: 30,
    desc: 'heals 40 health.',
    icon(c) {
      c.fillStyle = '#d5d5d5'; c.beginPath(); c.arc(18, 20, 11, 0, TAU); c.fill();
      c.strokeStyle = '#a8a8a8'; c.lineWidth = 2;
      c.beginPath(); c.arc(18, 20, 11, 0, TAU); c.stroke();
      c.beginPath(); c.arc(18, 20, 5, 0, TAU); c.stroke();
    },
  },
  crucifix: {
    name: 'Crucifix', stack: 1, price: 100,
    desc: 'banishes the next entity that touches you.',
    icon(c) {
      c.fillStyle = '#d8b45a';
      rr(c, 16, 8, 5, 26, 2); c.fill();
      rr(c, 9, 14, 19, 5, 2); c.fill();
    },
  },
  fuse: {
    name: 'Fuse', stack: 3, price: 0,
    desc: 'for the breaker box.',
    icon(c) {
      c.fillStyle = '#8a2f2f'; rr(c, 13, 8, 11, 24, 3); c.fill();
      c.fillStyle = '#d8d8e0'; c.fillRect(13, 15, 11, 3); c.fillRect(13, 22, 11, 3);
    },
  },
  scrap: {
    name: 'Code Scrap', stack: 5, price: 0,
    desc: 'a symbol and a number.',
    icon(c) {
      c.fillStyle = '#e8dfc8';
      c.save(); c.translate(18, 20); c.rotate(0.12);
      c.fillRect(-9, -12, 18, 24);
      c.fillStyle = '#2a2a30'; c.font = '10px Georgia'; c.textAlign = 'center';
      c.fillText('◆', 0, -2); c.fillText('7', 0, 9);
      c.restore();
    },
  },
};

export class Inventory {
  constructor() {
    this.slots = [];       // {id, count, keyId?, meta?}
    this.max = 5;
    this.selected = 0;
    this.gold = 0;
    this.dirty = true;
  }

  has(id) { return this.slots.some(s => s.id === id && s.count > 0); }
  count(id) { return this.slots.filter(s => s.id === id).reduce((a, s) => a + s.count, 0); }
  hasKey(keyId) { return this.slots.some(s => s.id === 'key' && s.keys && s.keys.includes(keyId)); }

  add(id, meta = {}) {
    this.dirty = true;
    if (id === 'gold') { this.gold += meta.amount || 1; return true; }
    if (id === 'key') {
      let slot = this.slots.find(s => s.id === 'key');
      if (!slot) {
        if (this.slots.length >= this.max) return false;
        slot = { id: 'key', count: 0, keys: [] };
        this.slots.push(slot);
      }
      slot.keys.push(meta.keyId);
      slot.count = slot.keys.length;
      return true;
    }
    const def = ITEMS[id];
    const existing = this.slots.find(s => s.id === id && s.count < def.stack);
    if (existing) { existing.count++; return true; }
    if (this.slots.length >= this.max) return false;
    this.slots.push({ id, count: 1, ...meta });
    return true;
  }

  consume(id, keyId = null) {
    this.dirty = true;
    if (id === 'key' && keyId) {
      const slot = this.slots.find(s => s.id === 'key');
      if (!slot) return false;
      const i = slot.keys.indexOf(keyId);
      if (i < 0) return false;
      slot.keys.splice(i, 1);
      slot.count = slot.keys.length;
      if (!slot.count) this.slots.splice(this.slots.indexOf(slot), 1);
      return true;
    }
    const slot = this.slots.find(s => s.id === id && s.count > 0);
    if (!slot) return false;
    slot.count--;
    if (!slot.count) {
      const idx = this.slots.indexOf(slot);
      this.slots.splice(idx, 1);
      if (this.selected >= this.slots.length) this.selected = Math.max(0, this.slots.length - 1);
    }
    return true;
  }

  get selectedItem() { return this.slots[this.selected] || null; }
}
