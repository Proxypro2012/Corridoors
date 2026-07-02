// DOM HUD + modal management + jumpscare overlay renderer

import { ITEMS } from './items.js';
import { GUIDING_ADVICE } from './entities.js';
import { TAU, clamp } from '../engine/math.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), doorNum: $('door-num'), objective: $('objective'),
      subtitle: $('subtitle'), prompt: $('interact-prompt'), promptText: $('interact-text'),
      hotbar: $('hotbar'), gold: $('gold-amount'),
      vignette: $('damage-vignette'), hideWarn: $('hide-warning'),
      jump: $('jumpscare'), jumpCanvas: $('jumpscare-canvas'),
      fade: $('fade-overlay'),
      menu: $('menu-screen'), how: $('how-screen'), pause: $('pause-screen'),
      death: $('death-screen'), win: $('win-screen'),
      deathTitle: $('death-title'), deathDoor: $('death-door'), deathAdvice: $('death-advice'),
      winStats: $('win-stats'), bestRun: $('best-run'),
      shop: $('shop-modal'), shopItems: $('shop-items'),
      padlock: $('padlock-modal'), plSymbols: $('padlock-symbols'), plDigits: $('padlock-digits'),
      breaker: $('breaker-modal'), brDisplay: $('breaker-display'), brSwitches: $('breaker-switches'),
      heartbeat: $('heartbeat-ui'), hbMarker: $('hb-marker'), hbZone: $('hb-zone'),
      guidingHint: $('guiding-hint'),
      lbTop: $('letterbox-top'), lbBottom: $('letterbox-bottom'),
    };
    this.subtitleT = 0;
    this.jumpT = 0;
    this.jumpType = null;
    this.modalOpen = null;   // 'shop' | 'padlock' | 'breaker'
  }

  // ---------- basic hud ----------
  showHUD(on) { this.el.hud.classList.toggle('hidden', !on); }
  setDoor(n) { this.el.doorNum.textContent = String(n).padStart(3, '0'); }
  setObjective(t) { this.el.objective.textContent = t; }

  subtitle(text, dur = 3, speaker = null) {
    this.el.subtitle.innerHTML = speaker
      ? `<span class="speaker">${speaker}:</span> ${text}`
      : text;
    this.subtitleT = dur;
  }

  prompt(text) {
    if (text) {
      this.el.prompt.classList.remove('hidden');
      this.el.promptText.textContent = text;
    } else this.el.prompt.classList.add('hidden');
  }

  guidingHint(text) {
    if (text) {
      this.el.guidingHint.textContent = '✦ ' + text;
      this.el.guidingHint.classList.remove('hidden');
    } else this.el.guidingHint.classList.add('hidden');
  }

  letterbox(on) {
    this.el.lbTop.classList.toggle('on', on);
    this.el.lbBottom.classList.toggle('on', on);
  }

  fade(toBlack, instant = false) {
    this.el.fade.style.transition = instant ? 'none' : 'opacity 1s';
    this.el.fade.style.opacity = toBlack ? '1' : '0';
  }

  // ---------- health / damage ----------
  flashDamage(healthFrac) {
    const base = (1 - healthFrac) * 90;
    this.el.vignette.style.boxShadow = `inset 0 0 180px ${60 + base}px rgba(160,10,20,0.75)`;
    clearTimeout(this._vt);
    this._vt = setTimeout(() => this.setHealthVignette(healthFrac), 380);
  }

  setHealthVignette(healthFrac) {
    const a = (1 - healthFrac) * 0.65;
    const spread = 30 + (1 - healthFrac) * 80;
    this.el.vignette.style.boxShadow = `inset 0 0 180px ${spread}px rgba(160,10,20,${a})`;
  }

  hideWarning(on) { this.el.hideWarn.classList.toggle('hidden', !on); }

  // ---------- hotbar ----------
  renderHotbar(inv) {
    const bar = this.el.hotbar;
    bar.innerHTML = '';
    for (let i = 0; i < inv.max; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === inv.selected ? ' selected' : '');
      const num = document.createElement('span');
      num.className = 'slot-num'; num.textContent = i + 1;
      slot.appendChild(num);
      const s = inv.slots[i];
      if (s) {
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 40;
        const c = cv.getContext('2d');
        ITEMS[s.id].icon(c);
        slot.appendChild(cv);
        if (s.count > 1) {
          const ct = document.createElement('span');
          ct.className = 'slot-count'; ct.textContent = s.count;
          slot.appendChild(ct);
        }
        slot.title = ITEMS[s.id].name;
      }
      bar.appendChild(slot);
    }
    this.el.gold.textContent = inv.gold;
  }

  // ---------- heartbeat minigame ----------
  heartbeatUI(on, markerFrac = 0, zoneStart = 0.42, zoneW = 0.16) {
    this.el.heartbeat.classList.toggle('hidden', !on);
    if (on) {
      this.el.hbMarker.style.left = `${markerFrac * 100}%`;
      this.el.hbZone.style.left = `${zoneStart * 100}%`;
      this.el.hbZone.style.width = `${zoneW * 100}%`;
    }
  }

  showHaltWarning() {
    this.subtitle('<b style="color:#9fc4ff;letter-spacing:6px">TURN AROUND</b>', 1.4);
  }

  // ---------- jumpscare overlay ----------
  jumpscare(type, dur = 0.9) {
    this.jumpType = type;
    this.jumpT = dur;
    this.el.jump.classList.remove('hidden');
  }

  updateJumpscare(dt, time) {
    if (this.subtitleT > 0) {
      this.subtitleT -= dt;
      if (this.subtitleT <= 0) this.el.subtitle.innerHTML = '';
    }
    if (this.jumpT <= 0) return;
    this.jumpT -= dt;
    if (this.jumpT <= 0) { this.el.jump.classList.add('hidden'); return; }
    const c = this.el.jumpCanvas.getContext('2d');
    drawScareFace(c, this.jumpType, 900, 600, time);
  }

  // ---------- screens ----------
  screen(name) {
    for (const s of ['menu', 'how', 'pause', 'death', 'win']) {
      this.el[s].classList.toggle('hidden', s !== name);
    }
  }

  showDeath(source, door) {
    this.el.deathDoor.textContent = `you made it to door ${String(door).padStart(3, '0')}`;
    this.el.deathAdvice.textContent = GUIDING_ADVICE[source] || 'The hotel is patient. Try again.';
    this.screen('death');
  }

  showWin(stats) {
    this.el.winStats.textContent = stats;
    this.screen('win');
  }

  setBestRun(n) {
    this.el.bestRun.textContent = n > 0 ? `✦ furthest door reached: ${String(n).padStart(3, '0')}` : '';
  }

  // ---------- modals ----------
  closeModals() {
    this.el.shop.classList.add('hidden');
    this.el.padlock.classList.add('hidden');
    this.el.breaker.classList.add('hidden');
    this.modalOpen = null;
  }

  openShop(game) {
    this.modalOpen = 'shop';
    this.el.shop.classList.remove('hidden');
    const wrap = this.el.shopItems;
    wrap.innerHTML = '';
    const stock = ['flashlight', 'lighter', 'lockpick', 'vitamins', 'bandage', 'crucifix'];
    for (const id of stock) {
      const def = ITEMS[id];
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      const cv = document.createElement('canvas');
      cv.width = 44; cv.height = 44;
      def.icon(cv.getContext('2d'));
      const info = document.createElement('div');
      info.innerHTML = `<div class="si-name">${def.name}</div><div class="si-desc">${def.desc}</div>`;
      const price = document.createElement('div');
      price.className = 'si-price';
      price.textContent = `🪙 ${def.price}`;
      btn.append(cv, info, price);
      btn.disabled = game.inventory.gold < def.price;
      btn.onclick = () => {
        if (game.inventory.gold >= def.price && game.inventory.add(id)) {
          game.inventory.gold -= def.price;
          game.audio.play('coin');
          game.ui.renderHotbar(game.inventory);
          this.openShop(game); // refresh
        } else game.audio.play('locked', { vol: 0.5 });
      };
      wrap.appendChild(btn);
    }
  }

  openPadlock(game, puzzle) {
    this.modalOpen = 'padlock';
    this.el.padlock.classList.remove('hidden');
    const syms = this.el.plSymbols, digs = this.el.plDigits;
    syms.innerHTML = ''; digs.innerHTML = '';
    puzzle.symbols.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'pl-symbol';
      d.textContent = s;
      syms.appendChild(d);
    });
    puzzle.entered.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'pl-digit' + (puzzle.found[i] ? ' known' : '');
      b.textContent = v === null ? '·' : v;
      b.onclick = () => {
        const cur = puzzle.entered[i] === null ? -1 : puzzle.entered[i];
        const solved = puzzle.tryDigit(i, (cur + 1) % 10);
        game.audio.play('breaker', { vol: 0.4 });
        this.openPadlock(game, puzzle);
        if (solved) {
          puzzle.solved = true;
          game.audio.play('unlock');
          this.closeModals();
          game.onPadlockSolved();
        }
      };
      digs.appendChild(b);
    });
  }

  openBreaker(game, puzzle) {
    this.modalOpen = 'breaker';
    this.el.breaker.classList.remove('hidden');
    this.el.brDisplay.textContent = puzzle.displayText();
    const wrap = this.el.brSwitches;
    wrap.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const b = document.createElement('button');
      b.className = 'breaker-sw' + (puzzle.on[i] ? ' on' : '');
      b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span><span class="sw-lever"></span>`;
      b.onclick = () => {
        const res = puzzle.flip(i, game);
        game.figureHears(1.0);            // flipping is loud
        if (res === 'bad') game.figureHears(2.2);
        this.openBreaker(game, puzzle);
        if (res === 'solved') {
          this.closeModals();
          game.onBreakerSolved();
        }
      };
      wrap.appendChild(b);
    }
  }
}

// fullscreen scare face renderer — shared by all quick jumpscares
export function drawScareFace(c, type, W, H, time) {
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const jx = (Math.random() - 0.5) * 26, jy = (Math.random() - 0.5) * 26;
  const sc = 1 + Math.random() * 0.12;
  c.save();
  c.translate(cx + jx, cy + jy);
  c.scale(sc, sc);

  switch (type) {
    case 'rush': case 'ambush': {
      const col = type === 'ambush' ? '#89e8a0' : '#e8e8f0';
      c.fillStyle = col;
      c.beginPath(); c.ellipse(-90, -60, 55, 85 + Math.random() * 20, 0.35, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(90, -60, 55, 85 + Math.random() * 20, -0.35, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, 110, 120, 70 + Math.random() * 30, 0, 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(-90, -60, 22, 34, 0.3, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(90, -60, 22, 34, -0.3, 0, TAU); c.fill();
      for (let i = -100; i <= 100; i += 25) {
        c.beginPath(); c.moveTo(i, 70); c.lineTo(i + 12, 130); c.lineTo(i + 25, 70); c.fill();
      }
      break;
    }
    case 'screech': {
      c.fillStyle = '#14141c';
      c.beginPath(); c.ellipse(0, 0, 180, 210, 0, 0, TAU); c.fill();
      c.fillStyle = '#e8ecf5';
      c.beginPath(); c.arc(0, -50, 55, 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(0, -50, 26, 0, TAU); c.fill();
      c.fillStyle = '#e8ecf5';
      for (let i = -110; i <= 110; i += 22) {
        c.beginPath(); c.moveTo(i, 80); c.lineTo(i + 11, 150 + Math.random() * 20); c.lineTo(i + 22, 80); c.fill();
      }
      break;
    }
    case 'dupe': {
      c.fillStyle = '#2a2318';
      c.fillRect(-160, -220, 320, 440);
      c.fillStyle = '#0c0a06';
      c.fillRect(-140, -200, 280, 400);
      c.fillStyle = '#d8cfa8';
      c.beginPath(); c.ellipse(-60, -40, 20, 30, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(60, -40, 20, 30, 0, 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(-60, -40, 9, 0, TAU); c.fill();
      c.beginPath(); c.arc(60, -40, 9, 0, TAU); c.fill();
      c.fillStyle = '#d8cfa8';
      for (let i = -80; i <= 80; i += 20) {
        c.beginPath(); c.moveTo(i, 60); c.lineTo(i + 10, 96); c.lineTo(i + 20, 60); c.fill();
      }
      break;
    }
    case 'jack': {
      c.fillStyle = '#dfe4ee';
      c.beginPath(); c.ellipse(0, 0, 150, 190, 0, 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(-55, -50, 32, 46, 0.2, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(55, -50, 32, 46, -0.2, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, 90, 60, 80, 0, 0, TAU); c.fill();
      break;
    }
    case 'timothy': {
      c.fillStyle = '#1c1410';
      c.beginPath(); c.ellipse(0, 20, 70, 55, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(0, -50, 40, 0, TAU); c.fill();
      c.strokeStyle = '#1c1410'; c.lineWidth = 12; c.lineCap = 'round';
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(s * 40, -10 + i * 20);
          c.quadraticCurveTo(s * 130, -40 + i * 26, s * 190, 10 + i * 30);
          c.stroke();
        }
      }
      c.fillStyle = '#c22';
      for (const [ex, ey] of [[-18, -60], [18, -60], [-32, -45], [32, -45], [-10, -38], [10, -38]]) {
        c.beginPath(); c.arc(ex, ey, 7, 0, TAU); c.fill();
      }
      break;
    }
    case 'figure': {
      c.fillStyle = '#231a1e';
      c.beginPath(); c.ellipse(0, 40, 170, 240, 0, 0, TAU); c.fill();
      c.fillStyle = '#2e2126';
      c.beginPath(); c.arc(0, -110, 90, 0, TAU); c.fill();
      c.fillStyle = '#6e1420';
      c.beginPath(); c.ellipse(0, -85, 62, 85, 0, 0, TAU); c.fill();
      c.fillStyle = '#e8dfd0';
      for (let i = -50; i <= 50; i += 14) {
        c.beginPath(); c.moveTo(i, -150); c.lineTo(i + 7, -95 + Math.random() * 14); c.lineTo(i + 14, -150); c.fill();
        c.beginPath(); c.moveTo(i, -20); c.lineTo(i + 7, -70 - Math.random() * 14); c.lineTo(i + 14, -20); c.fill();
      }
      break;
    }
    case 'seek': {
      c.fillStyle = '#0b0b10';
      c.beginPath(); c.ellipse(0, 0, 220, 250, 0, 0, TAU); c.fill();
      c.fillStyle = '#e8f0f2';
      c.beginPath(); c.ellipse(0, -20, 90, 110, 0, 0, TAU); c.fill();
      c.fillStyle = '#274a3a';
      c.beginPath(); c.arc(0, -20, 48, 0, TAU); c.fill();
      c.fillStyle = '#060a08';
      c.beginPath(); c.arc(0, -20, 26, 0, TAU); c.fill();
      break;
    }
    case 'glitch': {
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `hsl(${Math.random() * 360},80%,60%)`;
        c.fillRect(-W / 2 + Math.random() * W, -H / 2 + Math.random() * H, Math.random() * 120, 4 + Math.random() * 10);
      }
      c.fillStyle = '#fff';
      c.font = 'bold 90px monospace';
      c.textAlign = 'center';
      c.fillText('G̷L̷I̸T̶C̵H̸', 0, 20);
      break;
    }
    case 'halt': {
      c.fillStyle = '#0d1526';
      c.beginPath(); c.ellipse(0, 0, 160, 230, 0, 0, TAU); c.fill();
      c.fillStyle = '#9fc4ff';
      c.beginPath(); c.arc(-55, -60, 38, 0, TAU); c.fill();
      c.beginPath(); c.arc(55, -60, 38, 0, TAU); c.fill();
      c.fillStyle = '#060a14';
      c.beginPath(); c.arc(-55, -60, 15, 0, TAU); c.fill();
      c.beginPath(); c.arc(55, -60, 15, 0, TAU); c.fill();
      c.strokeStyle = '#9fc4ff'; c.lineWidth = 8;
      c.beginPath();
      for (let i = -90; i <= 90; i += 30) c.lineTo(i, 90 + (Math.abs(i / 30) % 2) * 30);
      c.stroke();
      break;
    }
  }
  c.restore();

  // static noise
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.14})`;
    c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}
