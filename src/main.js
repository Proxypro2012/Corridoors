// main.js — the game director: state, main loop, rendering, procedural hotel
// generation, entity director, cutscenes, interactions, and every callback the
// other modules reach for on `game`.
//
// CORRIDOORS — a fan-made top-down tribute to DOORS (the Hotel).
// Written by GLM 5.2.

import { RNG, clamp, lerp, dist, TAU, rectContains, rectsOverlap, DIRS } from './engine/math.js';
import { Input } from './engine/input.js';
import { Camera } from './engine/camera.js';
import { Lighting, glowColor } from './engine/lighting.js';
import { Particles } from './engine/particles.js';
import { AudioSys } from './engine/audio.js';
import {
  makeLobby, makeRoom, makeHaltCorridor, makeLibrary, makeBreather,
  makeShop, makeCourtyard, makeGreenhouse, makeElectrical, WALL_T,
} from './game/mapgen.js';
import { drawRoom, drawDoor } from './game/render.js';
import { Inventory } from './game/items.js';
import { Player } from './game/player.js';
import { Rush, Eyes, Halt, Screech, Shadow, GUIDING_ADVICE } from './game/entities.js';
import { Figure, LibraryPuzzle, BreakerPuzzle } from './game/figure.js';
import { SeekChase } from './game/seek.js';
import { UI } from './game/ui.js';

const $ = id => document.getElementById(id);

// entity sources the crucifix can banish
const BANISHABLE = new Set(['rush', 'ambush', 'screech', 'halt', 'eyes']);
// sources that get a fullscreen scare face on death
const LETHAL_FACES = new Set(['rush', 'ambush', 'figure', 'seek', 'halt', 'screech', 'glitch']);

export class Game {
  constructor() {
    this.canvas = $('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.input = new Input(this.canvas);
    this.camera = new Camera();
    this.lighting = new Lighting();
    this.particles = new Particles();
    this.audio = new AudioSys();
    this.ui = new UI();
    this.rng = new RNG();
    this.time = 0;
    this.state = 'menu';            // menu | playing | paused | dead | win
    this._dev = false; // Written by GPT Codex.
    this._devPanel = null; // Written by GPT Codex.
    this._gameZoom = 1.62; // Written by GPT Codex.

    this.rooms = [];
    this.roomChain = [];            // connected recent rooms — Rush's path
    this.entities = [];
    this.pendingGlows = [];
    this.timers = [];               // {t, fn} deferred events
    this.cutscene = null;
    this.player = null;
    this.currentRoom = null;
    this.figure = null;
    this.figureNear = null;
    this.seekChase = null;
    this.powerOn = false;
    this.lightning = 0;
    this.lightningT = 6;
    this.lastEvent = { rush: -99, ambush: -99, eyes: -99, screech: -99 };
    this.hinted = new Set();
    this.furthestDoor = 0;
    this.idleT = 0;
    this._ambient = 0.7;
    // full-screen horror FX state — flashes, vignettes, static, edge tints
    this._fx = { flash: 0, flashCol: [255,255,255], darken: 0, noise: 0, edge: 0, edgeCol: [0,0,0], shake: 0 };

    this.bestRun = +(localStorage.getItem('corridoors_best') || 0);
    this.ui.setBestRun(this.bestRun);

    this._bindUI();
    this._setupDevPanel(); // Written by GPT Codex.
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('contextmenu', e => e.preventDefault());

    this.lastT = performance.now();
    requestAnimationFrame(t => this._loop(t));
  }

  // ----------------------------------------------------------------- boot
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this.camera.viewW = w; this.camera.viewH = h;
    this.lighting.resize(w, h);
  }

  _bindUI() {
    $('btn-play').onclick = () => { this.audio.init(); this.startRun(); };
    $('btn-how').onclick = () => this.ui.screen('how');
    $('btn-how-back').onclick = () => this.ui.screen('menu');
    $('btn-mute').onclick = () => {
      const m = !this.audio.muted;
      this.audio.setMuted(m);
      $('btn-mute').textContent = 'SOUND: ' + (m ? 'OFF' : 'ON');
    };
    $('btn-resume').onclick = () => { this.state = 'playing'; this.ui.screen('none'); };
    $('btn-quit').onclick = () => this._toMenu();
    $('btn-retry').onclick = () => { this.audio.init(); this.startRun(); };
    $('btn-death-menu').onclick = () => this._toMenu();
    $('btn-win-menu').onclick = () => this._toMenu();
    $('btn-shop-close').onclick = () => this.ui.closeModals();
    $('btn-padlock-close').onclick = () => this.ui.closeModals();
    $('btn-breaker-close').onclick = () => this.ui.closeModals();
    // hotbar click-to-use / select
    this.ui.el.hotbar.addEventListener('click', e => {
      const slot = e.target.closest('.hotbar-slot'); if (!slot) return;
      const i = [...slot.parentNode.children].indexOf(slot);
      this.inventory.selected = i; this.inventory.dirty = true;
      this._useSelectedItem();
    });
  }

  _setupDevPanel() { // Written by GPT Codex.
    const root = $('game-root'); // Written by GPT Codex.
    const panel = document.createElement('div'); // Written by GPT Codex.
    panel.style.cssText = 'position:absolute;top:10px;right:10px;z-index:90;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font-family:monospace;pointer-events:auto;'; // Written by GPT Codex.
    const toggle = document.createElement('button'); // Written by GPT Codex.
    toggle.textContent = 'DEV'; // Written by GPT Codex.
    toggle.style.cssText = 'background:#06070a;color:#7fff9e;border:1px solid #2e8f4e;border-radius:4px;padding:6px 9px;letter-spacing:2px;cursor:pointer;'; // Written by GPT Codex.
    const controls = document.createElement('div'); // Written by GPT Codex.
    controls.style.cssText = 'display:none;width:250px;background:rgba(5,6,9,.92);border:1px solid #2e8f4e;border-radius:6px;padding:10px;box-shadow:0 16px 40px rgba(0,0,0,.75);color:#cfeedd;'; // Written by GPT Codex.
    const row = document.createElement('div'); // Written by GPT Codex.
    row.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;'; // Written by GPT Codex.
    const doorInput = document.createElement('input'); // Written by GPT Codex.
    doorInput.type = 'number'; // Written by GPT Codex.
    doorInput.min = '0'; // Written by GPT Codex.
    doorInput.max = '100'; // Written by GPT Codex.
    doorInput.value = '1'; // Written by GPT Codex.
    doorInput.style.cssText = 'min-width:0;flex:1;background:#11151a;color:#e8fff1;border:1px solid #31483a;border-radius:4px;padding:6px;'; // Written by GPT Codex.
    const makeButton = (text, fn) => { // Written by GPT Codex.
      const button = document.createElement('button'); // Written by GPT Codex.
      button.textContent = text; // Written by GPT Codex.
      button.style.cssText = 'background:#151a20;color:#e8fff1;border:1px solid #31483a;border-radius:4px;padding:6px;cursor:pointer;text-align:left;'; // Written by GPT Codex.
      button.onclick = fn; // Written by GPT Codex.
      return button; // Written by GPT Codex.
    }; // Written by GPT Codex.
    row.append(doorInput, makeButton('GO', () => this._devSkipToDoor(+doorInput.value || 0))); // Written by GPT Codex.
    const summon = document.createElement('select'); // Written by GPT Codex.
    summon.style.cssText = 'width:100%;margin-bottom:6px;background:#11151a;color:#e8fff1;border:1px solid #31483a;border-radius:4px;padding:6px;'; // Written by GPT Codex.
    for (const name of ['rush', 'ambush', 'eyes', 'screech', 'halt', 'shadow', 'figure', 'seek']) summon.add(new Option(name.toUpperCase(), name)); // Written by GPT Codex.
    controls.append(row, summon); // Written by GPT Codex.
    controls.append(makeButton('SUMMON SEQUENCE', () => this._devSummon(summon.value))); // Written by GPT Codex.
    controls.append(makeButton('+250 GOLD', () => this._devGold(250))); // Written by GPT Codex.
    controls.append(makeButton('ALL TOOLS', () => this._devTools())); // Written by GPT Codex.
    controls.append(makeButton('HEAL / REVIVE', () => this._devHeal())); // Written by GPT Codex.
    controls.append(makeButton('UNLOCK CURRENT DOOR', () => this._devUnlockDoor())); // Written by GPT Codex.
    controls.append(makeButton('POWER ON', () => this._devPowerOn())); // Written by GPT Codex.
    controls.append(makeButton('CLEAR THREATS', () => this._devClearThreats())); // Written by GPT Codex.
    for (const child of controls.children) child.style.marginTop = child === row || child === summon ? child.style.marginTop : '6px'; // Written by GPT Codex.
    toggle.onclick = () => { // Written by GPT Codex.
      if (!this._dev && window.prompt('DEV passcode') !== '2012') return; // Written by GPT Codex.
      this._dev = true; // Written by GPT Codex.
      controls.style.display = controls.style.display === 'none' ? 'block' : 'none'; // Written by GPT Codex.
      toggle.style.boxShadow = '0 0 18px rgba(127,255,158,.45)'; // Written by GPT Codex.
    }; // Written by GPT Codex.
    panel.append(toggle, controls); // Written by GPT Codex.
    root.appendChild(panel); // Written by GPT Codex.
    this._devPanel = { panel, toggle, controls, doorInput, summon }; // Written by GPT Codex.
  } // Written by GPT Codex.

  _devSkipToDoor(rawTarget) { // Written by GPT Codex.
    if (!this.player || !this.currentRoom) return; // Written by GPT Codex.
    const target = clamp(Math.floor(rawTarget), 0, 100); // Written by GPT Codex.
    this.cutscene = null; // Written by GPT Codex.
    this.player.freeze = false; // Written by GPT Codex.
    this._rushImminent = false; // Written by GPT Codex.
    this.entities = []; // Written by GPT Codex.
    if (target < this.currentRoom.num) this.currentRoom = this.rooms[0]; // Written by GPT Codex.
    let guard = 0; // Written by GPT Codex.
    while (this.currentRoom.num < target && guard++ < 140) { // Written by GPT Codex.
      const door = this.currentRoom.doors.find(d => d.kind === 'next'); // Written by GPT Codex.
      if (!door) break; // Written by GPT Codex.
      door.locked = false; // Written by GPT Codex.
      door.padlocked = false; // Written by GPT Codex.
      if (!door.toRoom) this._generateRoom(door.num, door); // Written by GPT Codex.
      door.opened = true; // Written by GPT Codex.
      this.currentRoom = door.toRoom; // Written by GPT Codex.
      if (this.currentRoom.num < target) this.currentRoom.visited = true; // Written by GPT Codex.
    } // Written by GPT Codex.
    const room = this.rooms.find(r => r.num === target) || this.currentRoom; // Written by GPT Codex.
    if (!room) return; // Written by GPT Codex.
    this.seekChase = room.special === 'seek' ? this.seekChase : null; // Written by GPT Codex.
    // revive out of any terminal state so the jump always lands playable
    this.state = 'playing';
    this.ui.screen('none');
    this.ui.showHUD(true);
    this.ui.setHealthVignette(1);
    this.player.dead = false; // Written by GPT Codex.
    this.player.health = this.player.maxHealth; // Written by GPT Codex.
    this.player.hiddenIn = null; // Written by GPT Codex.
    this.player.x = room.rect.x + room.rect.w / 2; // Written by GPT Codex.
    this.player.y = room.rect.y + room.rect.h / 2; // Written by GPT Codex.
    this.player.floor = 0;
    this.currentRoom = room; // Written by GPT Codex.
    room.visited = false; // Written by GPT Codex.
    this._onEnterRoom(room); // Written by GPT Codex.
    this.camera.snapTo(this.player.x, this.player.y, this._gameZoom); // Written by GPT Codex.
    this.camera.follow = this.player; // Written by GPT Codex.
    this.ui.subtitle(`DEV: jumped to door ${String(room.num).padStart(3, '0')}`, 1.8); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devSummon(type) { // Written by GPT Codex.
    if (!this.currentRoom) return; // Written by GPT Codex.
    if (type === 'rush' || type === 'ambush') { this.triggerRush(type); return; } // Written by GPT Codex.
    if (type === 'eyes') this.entities.push(new Eyes(this.currentRoom, this.rng)); // Written by GPT Codex.
    else if (type === 'screech') this.entities.push(new Screech(this.currentRoom, this.rng)); // Written by GPT Codex.
    else if (type === 'halt') this.entities.push(new Halt(this.currentRoom, this)); // Written by GPT Codex.
    else if (type === 'shadow') this.entities.push(new Shadow(this.currentRoom, this.rng)); // Written by GPT Codex.
    else if (type === 'figure') { this.figure = new Figure(this.currentRoom, this); this.entities.push(this.figure); } // Written by GPT Codex.
    else if (type === 'seek') { // Written by GPT Codex.
      const door = this.currentRoom.doors.find(d => d.kind === 'next'); // Written by GPT Codex.
      if (!door) return; // Written by GPT Codex.
      door.locked = false; // Written by GPT Codex.
      door.padlocked = false; // Written by GPT Codex.
      door.opened = true; // Written by GPT Codex.
      const room = this._beginSeek(door.num, door); // Written by GPT Codex.
      this.player.x = room.entryDoor.cx + DIRS[room.entryDir].dx * 80; // Written by GPT Codex.
      this.player.y = room.entryDoor.cy + DIRS[room.entryDir].dy * 80; // Written by GPT Codex.
      room.visited = false; // Written by GPT Codex.
      this._onEnterRoom(room); // Written by GPT Codex.
      this.currentRoom = room; // Written by GPT Codex.
      this.camera.snapTo(this.player.x, this.player.y, this._gameZoom); // Written by GPT Codex.
    } // Written by GPT Codex.
    this.ui.subtitle(`DEV: summoned ${type}`, 1.8); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devGold(amount) { // Written by GPT Codex.
    if (!this.inventory) return; // Written by GPT Codex.
    this.inventory.add('gold', { amount }); // Written by GPT Codex.
    this.ui.renderHotbar(this.inventory); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devTools() { // Written by GPT Codex.
    if (!this.inventory) return; // Written by GPT Codex.
    this.inventory.max = Math.max(this.inventory.max, 8); // Written by GPT Codex.
    for (const id of ['lighter', 'flashlight', 'lockpick', 'vitamins', 'bandage', 'crucifix']) this.inventory.add(id); // Written by GPT Codex.
    this.ui.renderHotbar(this.inventory); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devHeal() { // Written by GPT Codex.
    if (!this.player) return; // Written by GPT Codex.
    this.player.dead = false; // Written by GPT Codex.
    this.player.health = this.player.maxHealth; // Written by GPT Codex.
    this.state = 'playing'; // Written by GPT Codex.
    this.ui.screen('none'); // Written by GPT Codex.
    this.ui.setHealthVignette(1); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devUnlockDoor() { // Written by GPT Codex.
    const door = this.currentRoom && this.currentRoom.doors.find(d => d.kind === 'next'); // Written by GPT Codex.
    if (!door) return; // Written by GPT Codex.
    door.locked = false; // Written by GPT Codex.
    door.padlocked = false; // Written by GPT Codex.
    this.ui.subtitle('DEV: current door unlocked', 1.5); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devPowerOn() { // Written by GPT Codex.
    this.powerOn = true; // Written by GPT Codex.
    if (this.breakerPuzzle) this.breakerPuzzle.solved = true; // Written by GPT Codex.
    this.ui.setObjective('Reach the elevator.'); // Written by GPT Codex.
  } // Written by GPT Codex.

  _devClearThreats() { // Written by GPT Codex.
    this._rushImminent = false; // Written by GPT Codex.
    this.entities = this.entities.filter(e => e.type === 'figure' && this.currentRoom && e.room === this.currentRoom); // Written by GPT Codex.
    this.ui.subtitle('DEV: threats cleared', 1.5); // Written by GPT Codex.
  } // Written by GPT Codex.

  _toMenu() {
    this.state = 'menu';
    this.audio.setMusic('none');
    this.audio.setRain(false);
    this.audio.setThreatLoop(0);
    this.ui.closeModals();
    this.ui.showHUD(false);
    this.ui.screen('menu');
  }

  startRun() {
    this.rng = new RNG((Math.random() * 2 ** 31) | 0);
    this.firstSeek = this.rng.int(28, 33);
    this.secondSeek = this.rng.int(78, 84);
    this.haltDoor = this.rng.int(40, 46);

    this.rooms = [];
    this.roomChain = [];
    this.entities = [];
    this.pendingGlows = [];
    this.timers = [];
    this.cutscene = null;
    this.figure = null;
    this.figureNear = null;
    this.seekChase = null;
    this.powerOn = false;
    this.lightning = 0;
    this.lightningT = 6; // Written by GPT Codex.
    this.lastEvent = { rush: -99, ambush: -99, eyes: -99, screech: -99 };
    this.libPuzzle = null; // Written by GPT Codex.
    this.breakerPuzzle = null; // Written by GPT Codex.
    this.hinted = new Set();
    this.furthestDoor = 0;
    this.idleT = 0;
    this._lastLockedDoor = 0; // Written by GPT Codex.
    this._interactTarget = null; // Written by GPT Codex.
    this._timothyDone = false;
    this._jackDone = false;
    this._hidePressure = 0;
    this._hbPhase = 0;
    this._hbBeatT = 0;
    this._ambient = 0.7;
    this._fx = { flash: 0, flashCol: [255,255,255], darken: 0, noise: 0, edge: 0, edgeCol: [0,0,0], shake: 0 };
    this._rushImminent = false;
    this._musicDucked = false;
    this._maxWinProx = 0;
    this._lobbyElevOpen = 0;
    this._dev = false;

    this.inventory = new Inventory();

    const lobby = makeLobby();
    this.rooms.push(lobby);
    this.currentRoom = lobby;
    this.roomChain.push(lobby);

    this.player = new Player(0, 60);
    this.player.lightOn = true;
    this.inventory.add('lighter');          // starting light source

    this.camera.snapTo(this.player.x, this.player.y, this._gameZoom);
    this.camera.targetZoom = this._gameZoom;
    this.camera.follow = this.player;

    this.ui.showHUD(true);
    this.ui.closeModals();
    this.ui.screen('none');
    this.ui.setDoor(0);
    this.ui.renderHotbar(this.inventory);
    this.ui.fade(true, true);   // start black for the elevator ride
    this.state = 'playing';
    this._runElevatorIntro();
  }

  // the opening elevator descent — ~10s of rumble, a ding, doors slide open
  _runElevatorIntro() {
    const lobby = this.rooms[0];
    const elev = lobby.decor.find(d => d.type === 'elevator');
    // stand the player inside the elevator shaft
    if (elev) { this.player.x = elev.x + elev.w / 2 + 6; this.player.y = elev.y + elev.h / 2; }
    this.player.freeze = true;
    this.camera.follow = null;
    this.camera.snapTo(this.player.x, this.player.y, 1.9);
    this._lobbyElevOpen = 0;
    this.setMusicSafe('none');
    this.audio.setRainLevel(0.04);
    this.ui.letterbox(true);
    this.ui.subtitle('HOTEL — FLOOR 1', 4);
    this.runCutscene([
      { do: () => { this.audio.play('elevatorRumble'); }, wait: 3.5 },
      { do: () => { this.audio.play('elevatorDing'); this.ui.subtitle('the doors open.', 2); }, wait: 1.6 },
      { do: () => { this._lobbyElevOpen = 1; this.ui.fade(false); }, wait: 0.4 },
      { do: () => { this.audio.play('doorOpen'); }, wait: 1.8 },
      { do: () => { this.camera.tweenTo(0, 0, this._gameZoom, 2.2); }, wait: 2.4 },
      { do: () => {
          this.ui.letterbox(false);
          this.player.freeze = false;
          this.camera.follow = this.player;
          this.camera.targetZoom = this._gameZoom;   // snapTo(1.9) overwrote it
          this.setMusicSafe('lobby');
          this.ui.setObjective('Open the door. Survive the hotel.');
        }, wait: 0 },
    ]);
  }


  // ------------------------------------------------------------- main loop
  _loop(t) {
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.time += dt;
    // deferred timers tick for dead/win too (death-screen reveal, elevator rumble)
    if (this.state !== 'menu' && this.state !== 'paused') this._updateTimers(dt);
    if (this.state === 'playing') this.update(dt);
    this.render(dt);
    this.input.flush();
    requestAnimationFrame(tt => this._loop(tt));
  }

  _updateTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
  }

  update(dt) {
    // deferred timers now run at the loop level; cutscenes advance only in play
    this._updateCutscene(dt);

    const modalOpen = !!this.ui.modalOpen;
    const locked = modalOpen || !!this.cutscene;
    this.player.freeze = locked;
    this.player.update(dt, this);

    this._updateCurrentRoom(dt);
    this._updateNPCs(dt);

    // camera look-ahead toward the mouse aim
    const m = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    this.camera.aimBias = {
      x: clamp((m.x - this.player.x) * 0.10, -60, 60),
      y: clamp((m.y - this.player.y) * 0.10, -60, 60),
    };
    this.camera.update(dt);
    this.audio.setListener(this.player.x, this.player.y);

    // entities
    for (const e of this.entities) e.update(dt, this);
    this.entities = this.entities.filter(e => !e.done);
    if (this.figure && this.figure.done) this.figure = null;
    if (this.figureNear && this.figureNear.done) this.figureNear = null;

    if (this.seekChase) this.seekChase.update(dt);
    this._updateSeekArm();

    this.particles.update(dt);
    this._updateDoors(dt);
    this._updateElevator(dt);
    this._updateLightning(dt);
    this._updateHeartbeat(dt);
    this._updateWindows(dt);
    this._updateGlitch(dt);
    this._updateFX(dt);
    this._updateAudio(dt);

    if (!modalOpen && !this.cutscene) this._updateInteract();
    else this.ui.prompt(null);

    this._updateHide(dt);
    this._updateWin();

    // ambient lerp toward the current room's darkness
    const targetAmb = this.currentRoom ? this.currentRoom.ambient : 0.8;
    this._ambient = lerp(this._ambient, targetAmb, clamp(dt * 3, 0, 1));

    this._updateHUD();
  }

  // --------------------------------------------------------- room tracking
  _updateCurrentRoom(dt) {
    let best = this.currentRoom, bestD = Infinity;
    for (const room of this.rooms) {
      if (rectContains(room.rect, this.player.x, this.player.y)) { best = room; break; }
      const cx = room.rect.x + room.rect.w / 2, cy = room.rect.y + room.rect.h / 2;
      const d = dist(cx, cy, this.player.x, this.player.y);
      if (d < bestD) { bestD = d; best = room; }
    }
    if (best !== this.currentRoom) this._onEnterRoom(best);
    this.currentRoom = best;
    if (best) this.furthestDoor = Math.max(this.furthestDoor, best.num);
    // the grand library reads better a step farther out
    if (!this.cutscene) {
      this.camera.targetZoom = (best && best.special === 'library') ? 1.3 : this._gameZoom;
    }
    // decay light flicker across the hotel
    for (const room of this.rooms) if (room.flicker > 0) room.flicker = Math.max(0, room.flicker - dt);
  }

  _onEnterRoom(room) {
    const first = !room.visited;
    room.visited = true;
    this.currentRoom = room;
    if (!room.platforms) this.player.floor = 0;
    this.ui.hideScrapNote();
    this.roomChain.push(room);
    if (this.roomChain.length > 8) this.roomChain.shift();
    this.ui.setDoor(room.num);
    this._setMusicForRoom(room);
    this.audio.setRain(room.special === 'courtyard');
    // room-bound entities fade when you leave their room
    this.entities = this.entities.filter(e => {
      if (e.type === 'eyes' || e.type === 'screech') return e.room === room;
      return true;
    });
    if (first) this._onFirstEnter(room);
  }

  _onFirstEnter(room) {
    switch (room.special) {
      case 'library': this._setupLibrary(room); break;
      case 'electrical': this._setupElectrical(room); break;
      case 'shop': this.ui.setObjective("Jeff's shop — stock up."); break;
      case 'courtyard': this.ui.setObjective('Cross the courtyard.'); break;
      case 'greenhouse': this._maybeScreech(room, 0.4); this.ui.setObjective('Through the greenhouse.'); break;
      case 'halt': this.entities.push(new Halt(room, this)); this.ui.setObjective("Don't let it catch you."); break;
      case 'seek': break; // the chase script drives itself
      default: this._directNormal(room);
    }
  }

  // -------------------------------------------------- procedural generation
  _generateRoom(num, entryDoor) {
    // seek set-pieces consume a run of door numbers; the entry door must
    // lead into the FIRST corridor of the chain
    if (num === this.firstSeek || num === this.secondSeek) {
      return this._beginSeek(num, entryDoor);
    }
    let room;
    if (num === 50) room = makeLibrary(this.rng, entryDoor, this.rooms);
    else if (num === 51) room = makeBreather(this.rng, num, entryDoor, this.rooms);
    else if (num === 52) room = makeShop(this.rng, entryDoor, this.rooms);
    else if (num === 60) room = makeCourtyard(this.rng, entryDoor, this.rooms);
    else if (num >= 90 && num <= 99) room = makeGreenhouse(this.rng, num, entryDoor, {}, this.rooms);
    else if (num === 100) room = makeElectrical(this.rng, entryDoor, this.rooms);
    else if (num === this.haltDoor) room = makeHaltCorridor(this.rng, num, entryDoor, this.rooms);
    else room = this._makeNormalRoom(num, entryDoor);

    this.rooms.push(room);
    if (room.entryDoor) room.entryDoor.opened = true;
    return room;
  }

  _makeNormalRoom(num, entryDoor) {
    const opts = {};
    const depth = num / 100;
    opts.dark = this.rng.chance(0.16 + depth * 0.18);
    opts.corridor = this.rng.chance(0.42);
    // locked exits every ~8-12 doors
    const lockedGap = num - (this._lastLockedDoor || 0);
    if (num > 6 && lockedGap >= 8 && this.rng.chance(0.5)) {
      opts.locked = true; this._lastLockedDoor = num;
    }
    // dupe fake doors
    if (num > 4 && this.rng.chance(0.3)) opts.fakeDoors = this.rng.int(1, 2);
    // guaranteed loot to keep runs fair
    if (this.rng.chance(0.12)) opts.guaranteedLoot = this.rng.pick(['bandage', 'vitamins', 'lockpick']);
    return makeRoom(this.rng, num, entryDoor, opts, this.rooms);
  }

  _beginSeek(num, entryDoor) {
    const chase = new SeekChase(this, num, entryDoor);
    this.seekChase = chase;
    for (const r of chase.rooms) {
      this.rooms.push(r);
      if (r.entryDoor) r.entryDoor.opened = true;
    }
    // creeping goo-eye atmosphere in the first corridor
    const r0 = chase.rooms[0];
    for (let i = 0; i < 6; i++) {
      r0.decor.push({
        type: 'gooeyes',
        x: r0.rect.x + this.rng.next() * r0.rect.w,
        y: r0.rect.y + this.rng.next() * r0.rect.h,
      });
    }
    // armed — the chase only ignites once the player crosses the halfway
    // mark of the first corridor, so they're committed before Seek wakes
    chase.state = 'armed';
    this.ui.subtitle('the walls are watching… keep moving.', 3);
    return chase.rooms[0];
  }

  // check whether the player has crossed the midpoint of the first seek
  // corridor and, if so, ignite the chase
  _updateSeekArm() {
    const sc = this.seekChase;
    if (!sc || sc.state !== 'armed') return;
    const r0 = sc.rooms[0].rect;
    const horiz = r0.w > r0.h;
    const mid = horiz ? r0.x + r0.w / 2 : r0.y + r0.h / 2;
    const pos = horiz ? this.player.x : this.player.y;
    const dir = sc.rooms[0].entryDir;
    const crossed = (dir === 'e' || dir === 's') ? pos >= mid : pos <= mid;
    if (crossed) sc.begin();
  }

  // ----------------------------------------------------------- set pieces
  _setupLibrary(room) {
    this.figure = new Figure(room, this);
    this.entities.push(this.figure);
    this.libPuzzle = new LibraryPuzzle(room);
    this.ui.setObjective('Find 5 code scraps. Crouch past the Figure.');
    this.ui.subtitle('something is in here with you…', 3);
    this.setMusicSafe('library');
  }

  _setupElectrical(room) {
    this.figure = new Figure(room, this);
    this.entities.push(this.figure);
    this.breakerPuzzle = new BreakerPuzzle(this.rng);
    this.powerOn = false;
    this.ui.setObjective('Find 3 fuses, then restore power at the breaker.');
    this.setMusicSafe('finale');
  }

  // --------------------------------------------------------- entity director
  _directNormal(room) {
    const num = room.num;
    this.ui.setObjective('Find the next door.');

    if (num > 4 && this._canEvent('eyes', 3) && this.rng.chance(0.15)) {
      this.entities.push(new Eyes(room, this.rng));
      this.lastEvent.eyes = num;
      if (!this.hinted.has('eyes')) { this.hinted.add('eyes'); this.ui.guidingHint(GUIDING_ADVICE.eyes); }
      return;
    }
    if (num > 8 && this.rng.chance(0.04)) { this.entities.push(new Shadow(room, this.rng)); return; }

    if (room.darkRoom) this._maybeScreech(room, 0.45);

    if (num > 2 && this._canEvent('rush', 4) && this.rng.chance(0.18 + Math.min(0.12, num * 0.002))) {
      this.triggerRush('rush'); this.lastEvent.rush = num; return;
    }
    if (num > 15 && this._canEvent('ambush', 6) && this.rng.chance(0.07)) {
      this.triggerRush('ambush'); this.lastEvent.ambush = num; return;
    }
  }

  _maybeScreech(room, p) {
    if (!this._canEvent('screech', 2)) return;
    if (this.rng.chance(p)) {
      this.entities.push(new Screech(room, this.rng));
      this.lastEvent.screech = room.num;
      if (!this.hinted.has('screech')) { this.hinted.add('screech'); this.ui.guidingHint(GUIDING_ADVICE.screech); }
    }
  }

  _canEvent(name, gap) {
    const cur = this.currentRoom ? this.currentRoom.num : 0;
    return cur - this.lastEvent[name] >= gap;
  }

  triggerRush(type) {
    const green = type === 'ambush';
    this._rushImminent = true;
    this.ui.subtitle(green ? 'a sickly green glow returns…' : 'the lights flicker and die…', 2.6);
    this.audio.play('flicker');
    this.audio.play('shadowBoom', { vol: 1.0 });   // deep dread boom under the flicker
    for (const r of this.roomChain) this.roomFlicker(r, 1);
    // score cuts out hard — the silence is the warning
    this.audio.fadeMusic(0, 0.4);
    this._musicDucked = true;
    this._fxDarken(1);
    this._fxFlash(green ? [20, 120, 60] : [120, 10, 10], 0.6);
    this._fxNoise(0.4);
    this._fxShake(0.6);
    this.schedule(2.6, () => this._spawnRush(type));
  }

  _spawnRush(type) {
    const green = type === 'ambush';
    this._rushImminent = false;
    const bounces = green ? this.rng.int(2, 4) : 0;
    const r = new Rush(this, { type, bounces, warmup: 0 });
    this.entities.push(r);
    this.audio.play(green ? 'ambushWarble' : 'rushScream', { vol: 1.0 });
    this.audio.play('jumpscare', { vol: 0.7 });
    // full-screen arrival stinger — flash, static, heavy shake, red/green wash
    this._fxFlash(green ? [40, 200, 110] : [220, 30, 30], 1);
    this._fxNoise(0.85);
    this._fxShake(1.5);
    this._fxDarken(0.8);
    if (!this.hinted.has(type)) { this.hinted.add(type); this.ui.guidingHint(GUIDING_ADVICE[type]); }
  }

  // --------------------------------------------------------- interactions
  _updateInteract() {
    const p = this.player;
    let best = null, bestD = 72;
    const consider = (x, y, text, act) => {
      const d = dist(p.x, p.y, x, y);
      if (d < bestD) { bestD = d; best = { text, act }; }
    };
    const room = this.currentRoom;
    if (!room) return;
    const near = this.rooms.filter(r =>
      rectsOverlap(r.rect, { x: room.rect.x - 220, y: room.rect.y - 220, w: room.rect.w + 440, h: room.rect.h + 440 }));

    for (const r of near) {
      const doors = [...r.doors]; if (r.entryDoor) doors.push(r.entryDoor);
      for (const d of doors) {
        if (d.opened && !d.padlocked) continue;
        const rushBlocking = this._rushImminent || this.entities.some(e => e.type === 'rush' || e.type === 'ambush');
        let txt;
        if (d.kind === 'fake') txt = 'Open door';
        else if (d.padlocked) txt = 'Examine padlock';
        else if (d.locked) txt = this.inventory.hasKey(d.keyId) ? 'Unlock (key)' : (this.inventory.has('lockpick') ? 'Pick lock' : 'Locked');
        else if (d.kind === 'next' && rushBlocking) txt = 'Stuck — HIDE!';
        else txt = 'Open door';
        consider(d.cx, d.cy, txt, () => this.openDoor(d));
      }
      for (const f of r.furniture) {
        const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
        if (f.hideable) {
          if (p.hiddenIn === f) consider(cx, cy, 'Leave', () => p.exitHiding(this));
          else if (!p.hidden) consider(cx, cy, 'Hide', () => this._hideIn(f));
        } else if (f.drawers) {
          const unopened = f.drawers.some(dr => !dr.open);
          consider(cx, cy, unopened ? 'Search' : 'Searched', () => this._searchDresser(f));
        } else if (f.breaker) {
          const ready = this.breakerPuzzle && this.breakerPuzzle.fuses >= 3;
          consider(cx, cy, ready ? 'Use breaker' : 'Need fuses', () => this._useBreaker(f));
        } else if (f.shop) {
          consider(cx, cy, 'Shop', () => this.ui.openShop(this));
        }
      }
      for (const it of r.items) {
        if (it.taken) continue;
        consider(it.x, it.y, 'Pick up', () => this._pickup(it));
      }
    }

    this._interactTarget = best;
    if (best) {
      this.ui.prompt(best.text);
      if (this.input.pressed('KeyE')) best.act();
    } else {
      // nothing in reach — with the scraps in hand, E reads them
      const held = this.inventory.selectedItem;
      if (held && held.id === 'scrap') {
        this.ui.prompt('Read scraps');
        if (this.input.pressed('KeyE')) this.ui.toggleScrapNote(this);
      } else this.ui.prompt(null);
    }
  }

  openDoor(door) {
    if (door.kind === 'fake') { this._triggerDupe(door); return; }
    // while Rush/Ambush is bearing down, the next door won't budge — hide.
    if (door.kind === 'next' && !door.seekFinal &&
        (this._rushImminent || this.entities.some(e => e.type === 'rush' || e.type === 'ambush'))) {
      this.audio.play('locked', { vol: 0.6 });
      this.ui.subtitle('the door is stuck — find a wardrobe, NOW!', 1.8);
      this._fxShake(0.4);
      return;
    }
    if (door.padlocked) {
      if (!this.libPuzzle) {
        const lib = this.rooms.find(r => r.special === 'library');
        if (lib) { this.libPuzzle = new LibraryPuzzle(lib); this.figure = this.figure || null; }
      }
      this.audio.play('locked', { vol: 0.4 });
      if (this.libPuzzle) this.ui.openPadlock(this, this.libPuzzle);
      else this.ui.subtitle("the padlock won't budge.", 1.5);
      return;
    }
    if (door.locked) {
      if (this.inventory.hasKey(door.keyId)) {
        this.inventory.consume('key', door.keyId);
        this.audio.play('unlock'); door.locked = false;
        this.ui.subtitle('the key turns.', 1.5);
      } else if (this.inventory.has('lockpick')) {
        this.inventory.consume('lockpick');
        this.audio.play('unlock'); door.locked = false;
        this.ui.renderHotbar(this.inventory);
      } else { this.audio.play('locked'); this.ui.subtitle('locked. find the key.', 1.5); return; }
    }

    if (!door.toRoom) {
      const room = this._generateRoom(door.num, door);
      door.toRoom = room;
    }
    door.opened = true;
    this.audio.play('doorOpen');
    this.ui.setDoor(door.num);
    this.figureHears(0.5);

    // seek finale: shove the player to safety before the door slams
    if (door.seekFinal && door.toRoom) {
      const dir = DIRS[door.dir];
      this.player.x = door.cx + dir.dx * 56;
      this.player.y = door.cy + dir.dy * 56;
    }
  }

  _triggerDupe(door) {
    door.duped = true;
    this.ui.jumpscare('dupe', 0.8);
    this.audio.play('bite');
    this._fxFlash([180, 30, 30], 0.7);
    this._fxNoise(0.5);
    this._fxShake(0.8);
    this.player.damage(35, this, 'dupe');
    this.figureHears(0.8);
    if (!this.hinted.has('dupe')) { this.hinted.add('dupe'); this.ui.guidingHint(GUIDING_ADVICE.dupe); }
  }

  _hideIn(f) {
    this.ui.hideScrapNote();
    if (this.rng.chance(0.04) && !this._jackDone) {
      this._jackDone = true;
      this.ui.jumpscare('jack', 0.6);
      this.audio.play('hide');
      this.ui.subtitle('Jack! Pick another wardrobe.', 2);
      return;
    }
    this.player.enterHiding(f, this);
  }

  _searchDresser(f) {
    const drawer = f.drawers.find(d => !d.open);
    if (!drawer) { this.audio.play('locked', { vol: 0.3 }); return; }
    drawer.open = true;
    if (this.rng.chance(0.05) && !this._timothyDone) {
      this._timothyDone = true;
      this.ui.jumpscare('timothy', 0.5);
      this.audio.play('spider');
      this.player.damage(5, this, 'timothy');
      this.figureHears(0.5);
      return;
    }
    if (drawer.loot && !drawer.looted) {
      drawer.looted = true;
      this._grantLoot(drawer.loot);
    } else {
      this.audio.play('drawer');
    }
    this.figureHears(0.4);
  }

  _grantLoot(loot) {
    if (loot.type === 'gold') { this.inventory.add('gold', { amount: loot.amount }); this.audio.play('coin'); }
    else { this.inventory.add(loot.type, loot); this.audio.play(loot.type === 'key' ? 'key' : 'pickup'); }
    this.ui.renderHotbar(this.inventory);
  }

  _pickup(it) {
    it.taken = true;
    if (it.type === 'gold') { this.inventory.add('gold', { amount: it.amount }); this.audio.play('coin'); }
    else if (it.type === 'scrap') {
      if (this.libPuzzle) this.libPuzzle.collect(it.idx);
      this.inventory.add('scrap', { symbol: it.symbol, digit: it.digit });
      this.audio.play('paper');
      this.ui.subtitle(`scrap: ${it.symbol} = ${it.digit}`, 2.5);
    } else if (it.type === 'fuse') {
      if (this.breakerPuzzle) this.breakerPuzzle.fuses = Math.min(3, this.breakerPuzzle.fuses + 1);
      this.inventory.add('fuse');
      this.audio.play('pickup');
      const got = this.breakerPuzzle ? this.breakerPuzzle.fuses : 0;
      this.ui.subtitle(`fuse collected (${got}/3)`, 2);
    } else if (it.type === 'key') {
      this.inventory.add('key', { keyId: it.keyId });
      this.audio.play('key');
      this.ui.subtitle('picked up a room key.', 2);
    } else { this.inventory.add(it.type); this.audio.play('pickup'); }
    this.ui.renderHotbar(this.inventory);
  }

  _useBreaker() {
    if (!this.breakerPuzzle) return;
    if (this.breakerPuzzle.fuses < 3) {
      this.ui.subtitle('find the 3 fuses first.', 2);
      this.audio.play('locked', { vol: 0.4 });
      return;
    }
    this.ui.openBreaker(this, this.breakerPuzzle);
  }

  _useSelectedItem() {
    const s = this.inventory.selectedItem; if (!s) return;
    if (s.id === 'bandage') {
      this.player.heal(40); this.inventory.consume('bandage');
      this.audio.play('heal'); this.ui.renderHotbar(this.inventory);
    } else if (s.id === 'vitamins') {
      this.player.vitaminT = 8; this.inventory.consume('vitamins');
      this.audio.play('pickup'); this.ui.renderHotbar(this.inventory);
    } else if (s.id === 'crucifix') {
      this.ui.subtitle('the crucifix will smite the next thing that touches you.', 2.5);
    } else if (s.id === 'scrap') {
      this.ui.toggleScrapNote(this);
    }
  }

  _toggleLight() {
    const held = this.inventory.selectedItem;
    if (!held || (held.id !== 'flashlight' && held.id !== 'lighter')) {
      this.ui.subtitle('hold a light in your hand first (1–5).', 1.6);
      return;
    }
    this.player.lightOn = !this.player.lightOn;
    this.audio.play('flashlight');
  }

  // ----------------------------------------------------- world animation
  _updateDoors(dt) {
    for (const room of this.rooms) {
      const doors = [...room.doors]; if (room.entryDoor) doors.push(room.entryDoor);
      for (const d of doors) {
        const tgt = d.opened ? 1 : 0;
        if (Math.abs(d.openT - tgt) > 0.01) d.openT += (tgt - d.openT) * clamp(dt * 8, 0, 1);
        else d.openT = tgt;
      }
    }
  }

  _updateElevator(dt) {
    for (const room of this.rooms) {
      for (const d of room.decor) {
        if (d.type !== 'elevator') continue;
        const tgt = room.special === 'electrical' ? (this.powerOn ? 1 : 0) : this._lobbyElevOpen;
        d.openT = lerp(d.openT || 0, tgt, clamp(dt * 2, 0, 1));
      }
    }
  }

  _updateNPCs(dt) {
    if (!this.currentRoom || this.currentRoom.special !== 'shop') return;
    for (const n of (this.currentRoom.npcs || [])) {
      if (n.type !== 'goblino') continue;
      n.talkT = (n.talkT || 0) - dt;
      if (n.talkT <= 0) { n.talkT = 5 + Math.random() * 6; this.audio.play('goblino', { vol: 0.4 }); }
    }
  }

  _updateWindows(dt) {
    // the Window entity only ever appears inside a lightning flash — handled
    // in _updateLightning; here we just make sure stale silhouettes clear
    const room = this.currentRoom; if (!room) return;
    if (this.lightning <= 0) {
      for (const d of room.decor) if (d.type === 'window' && d.showFigure && !d._figureHold) d.showFigure = false;
    }
  }

  _updateLightning(dt) {
    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt * 2);
    const room = this.currentRoom;
    if (!room) return;
    const windows = room.decor.filter(d => d.type === 'window');
    const outside = room.special === 'courtyard';
    if (!outside && !windows.length) return;
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = outside ? 5 + Math.random() * 8 : 9 + Math.random() * 14;
      this.lightning = 1;
      this.audio.play('thunder', { vol: outside ? 1 : 0.65 });
      this.camera.shake(outside ? 3 : 2, 0.5);
      this._fxFlash([200, 215, 255], outside ? 0.3 : 0.2);
      // rarely, the flash reveals something standing at the glass
      if (windows.length && Math.random() < 0.22) {
        const w = this.rng.pick(windows);
        w.showFigure = true; w._figureHold = true;
        this.schedule(1.1, () => { w.showFigure = false; w._figureHold = false; });
      }
    }
  }

  // ---------------------------------------------------- horror screen FX
  _updateFX(dt) {
    const f = this._fx, t = this.time;
    f.flash = Math.max(0, f.flash - dt * 1.8);
    f.darken = Math.max(0, f.darken - dt * 0.8);
    f.noise = Math.max(0, f.noise - dt * 1.2);
    f.shake = Math.max(0, f.shake - dt * 2);
    if (f.shake > 0) this.camera.shake(f.shake * 14, 0.15);

    // continuous entity-driven edge tint: ramps toward a colour while a
    // threat is active, fades when it leaves
    let tgt = 0, col = [0, 0, 0];
    const rushHere = this.entities.some(e => e.type === 'rush');
    const ambushHere = this.entities.some(e => e.type === 'ambush');
    const eyesHere = this.entities.some(e => e.type === 'eyes');
    const haltAttack = this.entities.some(e => e.type === 'halt' && e.state === 'attack');
    if (this.figure && this.figure.state === 'chase') { tgt = 0.55; col = [150, 20, 30]; }
    else if (this.figureNear) { tgt = 0.3; col = [120, 20, 30]; }
    if (ambushHere) { tgt = Math.max(tgt, 0.55); col = [40, 190, 95]; }
    if (rushHere) { tgt = Math.max(tgt, 0.65); col = [30, 10, 12]; }
    // EYES — heavy purple drowning + static + pulse
    if (eyesHere) { tgt = Math.max(tgt, 0.6); col = [120, 35, 190]; }
    if (haltAttack) { tgt = Math.max(tgt, 0.5); col = [40, 90, 200]; }
    // SEEK — violent red wash at the edges, but the corridor stays readable
    if (this.seekChase && this.seekChase.state === 'chase') { tgt = Math.max(tgt, 0.62); col = [140, 25, 25]; }
    f.edge += (tgt - f.edge) * clamp(dt * 4, 0, 1);
    if (tgt > 0) f.edgeCol = col;

    // continuate the dread: while a rush/ambush is imminent or present, keep
    // pumping noise/darken/shake so the build never relaxes until it's gone
    if (this._rushImminent) {
      f.noise = Math.max(f.noise, 0.45);
      f.darken = Math.max(f.darken, 0.9);
      f.shake = Math.max(f.shake, 0.4);
      if (Math.random() < dt * 6) f.flash = Math.max(f.flash, 0.18);
    }
    if (rushHere || ambushHere) {
      f.noise = Math.max(f.noise, 0.55);
      f.darken = Math.max(f.darken, 0.55);
      f.shake = Math.max(f.shake, 0.7);
    }
    if (eyesHere) {
      f.noise = Math.max(f.noise, 0.3);
      f.darken = Math.max(f.darken, 0.35);
      if (Math.random() < dt * 3) f.flash = Math.max(f.flash, 0.18);
    }
    if (this.seekChase && this.seekChase.state === 'chase') {
      f.noise = Math.max(f.noise, 0.4);
      f.darken = Math.max(f.darken, 0.35);
      f.shake = Math.max(f.shake, 0.6);
      if (Math.random() < dt * 2.5) f.flash = Math.max(f.flash, 0.16);
    }
  }

  _fxFlash(col, intensity) { this._fx.flash = Math.max(this._fx.flash, intensity); this._fx.flashCol = col; }
  _fxDarken(intensity) { this._fx.darken = Math.max(this._fx.darken, intensity); }
  _fxNoise(intensity) { this._fx.noise = Math.max(this._fx.noise, intensity); }
  _fxShake(intensity) { this._fx.shake = Math.max(this._fx.shake, intensity); }

  _renderFX(ctx, W, H) {
    const f = this._fx, t = this.time;
    // pulsing dread vignette + entity edge tint
    if (f.edge > 0.01 || f.darken > 0.01) {
      const pulse = 0.82 + Math.sin(t * (this.figureNear ? 9 : 4)) * 0.18;
      const a = Math.min(0.68, (f.edge * 0.55 + f.darken * 0.35) * pulse);
      const [r, g, b] = f.edgeCol;
      // wide clear center so the action stays readable under the wash
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.8);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.55, `rgba(${r},${g},${b},${(a * 0.45).toFixed(3)})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},${a.toFixed(3)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }
    // hard colour flash (damage / jumpscare / stinger)
    if (f.flash > 0.01) {
      const [r, g, b] = f.flashCol;
      ctx.fillStyle = `rgba(${r},${g},${b},${(f.flash * 0.7).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // TV static noise — screech / glitch / rush arrival
    if (f.noise > 0.01) {
      ctx.globalAlpha = f.noise * 0.35;
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#000';
        ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 1 + Math.random() * 2);
      }
      ctx.globalAlpha = 1;
      // scanline jitter bands
      for (let i = 0; i < 4; i++) {
        const y = Math.random() * H;
        ctx.fillStyle = `rgba(255,255,255,${f.noise * 0.08})`;
        ctx.fillRect(0, y, W, 2 + Math.random() * 6);
      }
    }
  }

  _updateHeartbeat(dt) {
    const p = this.player;
    const show = p.hidden && this.figureNear && this.figure;
    if (show) {
      const speed = 1.2 + this.figure.alert * 1.6;
      this._hbPhase += dt * speed;
      const frac = (Math.sin(this._hbPhase) + 1) / 2;
      const zoneStart = 0.42, zoneW = 0.16;
      this.ui.heartbeatUI(true, frac, zoneStart, zoneW);
      if (this.input.pressed('Space')) {
        if (frac >= zoneStart && frac <= zoneStart + zoneW) {
          this.figure.alert = Math.max(0, this.figure.alert - 0.25);
          this.audio.play('heartbeat', { vol: 0.35 });
        } else {
          this.figureHears(1.2);
          this.audio.play('heartbeat', { vol: 0.6 });
        }
      }
      this._hbBeatT -= dt;
      if (this._hbBeatT <= 0) {
        this._hbBeatT = 0.85 - this.figure.alert * 0.3;
        this.audio.play('heartbeat', { vol: 0.3 });
      }
    } else {
      this.ui.heartbeatUI(false);
    }
  }

  _updateHide(dt) {
    const p = this.player;
    if (!p.hidden) { this.ui.hideWarning(false); this._hidePressure = 0; return; }
    const threat = this.entities.some(e => e.type === 'rush' || e.type === 'ambush');
    if (threat || this.figureNear) { this._hidePressure = 0; return; }
    this._hidePressure += dt;
    if (p.hideTime > 14) {
      this.ui.hideWarning(true);
      if (p.hideTime > 16.5) {
        p.exitHiding(this);
        this.ui.hideWarning(false);
        this.player.damage(10, this, 'hide');
        this.ui.subtitle('something wanted the wardrobe back.', 2);
      }
    }
  }

  _updateGlitch(dt) {
    if (!this.currentRoom) return;
    if (this.currentRoom.num < this.furthestDoor - 3) {
      this.idleT += dt;
      if (this.idleT > 30) {
        this.idleT = 0;
        this.ui.jumpscare('glitch', 0.6);
        this.audio.play('glitch');
        const r = this.currentRoom;
        this.player.x = r.rect.x + r.rect.w / 2;
        this.player.y = r.rect.y + r.rect.h / 2;
        this.ui.subtitle('reality slipped — I put you back.', 2);
      }
    } else this.idleT = 0;
  }

  _updateWin() {
    const room = this.currentRoom;
    if (!room || room.special !== 'electrical' || !this.powerOn) return;
    const ez = room.elevatorZone;
    if (ez && rectContains(ez, this.player.x, this.player.y)) {
      this.state = 'win';
      this.audio.setThreatLoop(0);
      this.audio.fadeMusic(0.55, 1);
      this.setMusicSafe('elevator');
      this.audio.play('elevatorDing');
      this.schedule(0.6, () => this.audio.play('elevatorRumble'));
      if (100 > this.bestRun) { this.bestRun = 100; localStorage.setItem('corridoors_best', 100); this.ui.setBestRun(100); }
      this.ui.showWin(`doors survived: 100  ·  gold: ${this.inventory.gold}`);
    }
  }

  _updateHUD() {
    if (this.inventory.dirty) { this.ui.renderHotbar(this.inventory); this.inventory.dirty = false; }
    for (let i = 0; i < 5; i++) if (this.input.pressed('Digit' + (i + 1))) { this.inventory.selected = i; this.inventory.dirty = true; }
    if (this.input.pressed('KeyR')) this._useSelectedItem();
    if (this.input.pressed('KeyF')) this._toggleLight();
    if (this.input.pressed('Escape')) { this.state = 'paused'; this.ui.screen('pause'); }
  }

  // ------------------------------------------------------------- cutscenes
  runCutscene(steps) {
    this.cutscene = { steps, i: 0, t: 0 };
    this._runCutsceneStep();
  }
  _runCutsceneStep() {
    const c = this.cutscene; if (!c) return;
    if (c.i >= c.steps.length) { this.cutscene = null; return; }
    const s = c.steps[c.i];
    if (s.do) s.do();
    c.t = s.wait || 0;
  }
  _updateCutscene(dt) {
    if (!this.cutscene) return;
    this.cutscene.t -= dt;
    if (this.cutscene.t <= 0) {
      this.cutscene.i++;
      if (this.cutscene.i >= this.cutscene.steps.length) this.cutscene = null;
      else this._runCutsceneStep();
    }
  }

  schedule(delay, fn) { this.timers.push({ t: delay, fn }); }

  // -------------------------------------------------------- music + audio
  setMusicSafe(name) { this.audio.setMusic(name); }
  _setMusicForRoom(room) {
    if (this.cutscene) return;
    let track;
    switch (room.special) {
      case 'shop': track = 'shop'; break;
      case 'library': track = 'library'; break;
      case 'electrical': track = 'finale'; break;
      case 'courtyard': track = 'dread'; break;
      case 'seek': track = 'chase'; break;
      case 'halt': track = 'dread'; break;
      default: track = room.darkRoom ? 'dread' : 'lobby';
    }
    this.setMusicSafe(track);
  }

  roomFlicker(room, intensity = 1) { room.flicker = Math.max(room.flicker || 0, intensity); }

  // ---------------------------------------------- callbacks from entities
  figureHears(loudness) {
    if (this.figure && !this.figure.done) this.figure.hear(this.player.x, this.player.y, loudness, this);
  }

  tryCrucifix(source) {
    if (!BANISHABLE.has(source)) return false;
    if (!this.inventory.has('crucifix')) return false;
    this.inventory.consume('crucifix');
    this.audio.play('crucifix');
    this.ui.subtitle(`the crucifix blazes — ${source} is driven back.`, 3);
    this.particles.burst(this.player.x, this.player.y, 30, {
      color: '230,210,140', speed: 200, life: 0.9, size: 8, additive: true,
    });
    for (const e of this.entities) if (e.type === source) e.done = true;
    this.ui.renderHotbar(this.inventory);
    return true;
  }

  onRushGone(entity) {
    this.ui.subtitle('…it passed.', 2.2);
    this._setMusicForRoom(this.currentRoom);
  }

  onPlayerDeath(source) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.setMusicSafe('guiding');
    this.audio.setThreatLoop(0);
    this.audio.fadeMusic(0.55, 1.5);
    if (LETHAL_FACES.has(source)) this.ui.jumpscare(source, 1.0);
    this.audio.play('jumpscare', { vol: 0.7 });
    // blinding white-out + static + max shake as the screen tears
    this._fxFlash([255, 255, 255], 1);
    this._fxNoise(1);
    this._fxShake(1.6);
    this._fxDarken(1);
    const door = this.currentRoom ? this.currentRoom.num : 0;
    if (door > this.bestRun) { this.bestRun = door; localStorage.setItem('corridoors_best', door); this.ui.setBestRun(door); }
    this.schedule(1.3, () => this.ui.showDeath(source, door));
  }

  onSeekDone() {
    this.seekChase = null;
    this._setMusicForRoom(this.currentRoom);
    this.ui.setObjective('Find the next door.');
  }

  onPadlockSolved() {
    const lib = this.rooms.find(r => r.special === 'library');
    if (lib) for (const d of lib.doors) if (d.padlocked) { d.locked = false; d.padlocked = false; }
    this.ui.subtitle('the padlock falls away.', 2);
    this.ui.setObjective('Open the door. Crouch past the Figure.');
  }

  onBreakerSolved() {
    this.powerOn = true;
    this.audio.play('powerUp');
    this.ui.subtitle('power restored — the elevator hums.', 3);
    this.ui.setObjective('Reach the elevator.');
  }

  // -------------------------------------------------------------- render
  render(dt) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // jumpscare overlay tick
    this.ui.updateJumpscare(dt, this.time);

    if (!this.currentRoom || !this.player) return;

    // ---- world pass ----
    ctx.save();
    this.camera.apply(ctx);
    const view = this.camera.viewRect(180);
    for (const room of this.rooms) {
      if (!rectsOverlap(view, room.rect)) continue;
      drawRoom(ctx, room, this.time, this);
      if (room.entryDoor) drawDoor(ctx, room.entryDoor, this.time, this);
    }
    this._drawNPCs(ctx);
    for (const e of this.entities) e.draw(ctx, this.time, this);
    this.player.draw(ctx, this.time);
    this.particles.draw(ctx);
    ctx.restore();

    // ---- lighting pass ----
    this.lighting.resize(W, H);
    this.lighting.begin(this._ambient);
    this._setupLights();
    for (const g of this.pendingGlows) this.lighting.addGlow(g.x, g.y, g.r, g.color, g.a);
    this.lighting.render(ctx, this.camera);
    this.pendingGlows.length = 0;

    // ---- screen-space fx ----
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(200,215,255,${this.lightning * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
    this._renderFX(ctx, W, H);
  }

  _setupLights() {
    const L = this.lighting, p = this.player;
    const view = this.camera.viewRect(240);
    this._maxWinProx = 0;

    // only the current room and rooms directly connected by an open door are
    // fully lit; everything else is dropped to a faint silhouette so you can
    // tell a room is there but can barely see into it
    const lit = new Set([this.currentRoom]);
    const collect = room => {
      const doors = [...room.doors]; if (room.entryDoor) doors.push(room.entryDoor);
      for (const d of doors) {
        if (d.opened && d.toRoom) lit.add(d.toRoom);
        if (d.opened && d.fromRoom) lit.add(d.fromRoom);
      }
    };
    collect(this.currentRoom);

    for (const room of this.rooms) {
      if (!rectsOverlap(view, room.rect)) continue;
      const factor = lit.has(room) ? 1.0 : 0.1;
      for (const l of room.lights) {
        let i = factor;
        if (i <= 0) continue;
        if (room.lightsBroken) i = 0.04 + Math.random() * 0.06;
        else if (room.flicker > 0) i = factor * (0.3 + Math.random() * 0.7);
        else if (l.flicker) i = factor * (0.55 + Math.random() * 0.45);
        if (l.red) { L.addGlow(l.x, l.y, l.r, glowColor(220, 40, 40), 0.4 * i); continue; }
        if (l.moon) { L.addGlow(l.x, l.y, l.r, glowColor(150, 170, 220), 0.5 * i); L.addLight(l.x, l.y, l.r * 0.8, 0.5 * i); continue; }
        L.addLight(l.x, l.y, l.r, i * 0.9);
        if (l.warm) L.addGlow(l.x, l.y, l.r * 0.5, glowColor(255, 210, 140), 0.18 * i);
      }
      // a warm lamp glow punches through every real (non-Dupe) door, so the
      // true path is readable even from a dim neighbouring room
      const doors = [...room.doors]; if (room.entryDoor) doors.push(room.entryDoor);
      for (const d of doors) {
        if (!d.hasLamp) continue;
        if (d.opened) { L.addLight(d.cx, d.cy, 120, 0.55); L.addGlow(d.cx, d.cy, 70, glowColor(255, 200, 120), 0.3); }
        else { L.addGlow(d.cx, d.cy, 50, glowColor(255, 200, 120), 0.22); }
      }
      // windows: a cold blue sky-spill that strengthens as you approach,
      // and blazes white during a lightning strike (casting shadow edges)
      for (const d of room.decor) {
        if (d.type !== 'window') continue;
        const wx = d.x + d.w / 2, wy = d.y + d.h / 2;
        const prox = clamp(1 - dist(p.x, p.y, wx, wy) / 260, 0, 1);
        if (prox > this._maxWinProx) this._maxWinProx = prox;
        const li = (0.12 + prox * 0.45) * factor;
        L.addGlow(wx, wy, 80 + prox * 130, glowColor(70, 110, 190), li);
        L.addLight(wx, wy, 50 + prox * 70, li * 0.35);
        if (this.lightning > 0) {
          L.addLight(wx, wy, 220, this.lightning * 0.95 * factor);
          L.addGlow(wx, wy, 150, glowColor(205, 220, 255), this.lightning * 0.55 * factor);
        }
      }
    }
    // the player has NO intrinsic light — only what is in their HAND.
    // the selected hotbar slot is the held item; a flashlight or lighter in
    // the bag does nothing until it's actually equipped.
    const held = this.inventory.selectedItem;
    if (p.lightOn && held) {
      if (held.id === 'flashlight') {
        L.addCone(p.x, p.y, p.facing, 0.62, 430, 1.0);
        L.addLight(p.x, p.y, 70, 0.7);
      } else if (held.id === 'lighter') {
        const flick = 0.5 + Math.sin(this.time * 11) * 0.04 + Math.random() * 0.03;
        L.addGlow(p.x, p.y, 175, glowColor(255, 170, 70), flick);
        L.addLight(p.x, p.y, 150, flick);
      }
    }
  }

  // audio ducking + proximity rain. a hostile entity (or an imminent rush)
  // fades the score out so the creature's stinger and the silence read.
  _threatActive() {
    if (this._rushImminent) return true;
    if (this.seekChase && this.seekChase.state === 'chase') return true;
    for (const e of this.entities) {
      if (e.type === 'rush' || e.type === 'ambush' || e.type === 'halt' || e.type === 'screech') return true;
      if (e.type === 'eyes') return true;
      if (e.type === 'figure' && e.state === 'chase') return true;
      if (e.type === 'seek') return true;
    }
    return false;
  }

  _updateAudio(dt) {
    // rain: courtyard base + window-proximity swell
    const base = this.currentRoom && this.currentRoom.special === 'courtyard' ? 0.05 : 0;
    const level = base + (this._maxWinProx || 0) * 0.07;
    this.audio.setRainLevel(level);
    // music duck
    const threat = this._threatActive();
    const target = threat ? 0.04 : 0.55;
    if (threat !== this._musicDucked) { this._musicDucked = threat; this.audio.fadeMusic(target, threat ? 1.2 : 2.5); }

    // the threat riser — one continuous pressure tone driven by whatever is
    // closest to killing you right now. computed centrally every frame so it
    // always decays to silence when the danger is gone.
    let riser = 0;
    if (this.state === 'playing' && this.player && !this.player.dead) {
      if (this._rushImminent) riser = 0.35 + Math.sin(this.time * 6) * 0.06;
      for (const e of this.entities) {
        if (e.type === 'rush' || e.type === 'ambush') {
          const d = dist(e.x, e.y, this.player.x, this.player.y);
          riser = Math.max(riser, clamp(1 - d / 1100, 0, 1));
        } else if (e.type === 'seek' && e.active) {
          const d = dist(e.x, e.y, this.player.x, this.player.y);
          riser = Math.max(riser, clamp(1 - d / 800, 0, 1) * 0.85);
        }
      }
      if (this.figure && this.figure.state === 'chase') {
        const d = dist(this.figure.x, this.figure.y, this.player.x, this.player.y);
        riser = Math.max(riser, clamp(1 - d / 600, 0, 1) * 0.6);
      }
    }
    this.audio.setThreatLoop(riser);
  }

  _drawNPCs(ctx) {
    const view = this.camera.viewRect(60);
    for (const room of this.rooms) {
      if (!room.npcs || !rectsOverlap(view, room.rect)) continue;
      for (const n of room.npcs) {
        const bob = Math.sin(this.time * 2 + n.x) * 2;
        ctx.save();
        ctx.translate(n.x, n.y + bob);
        if (n.type === 'jeff') {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, n.r - 2, n.r, n.r * 0.5, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a4f6a'; ctx.beginPath(); ctx.arc(0, 0, n.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#6b86b0'; ctx.beginPath(); ctx.arc(0, -3, n.r * 0.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1a2030'; ctx.beginPath(); ctx.arc(-6, -4, 2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(6, -4, 2, 0, TAU); ctx.fill();
        } else if (n.type === 'goblino') {
          ctx.fillStyle = '#7a3030'; ctx.beginPath(); ctx.arc(0, 0, n.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8c0a0'; ctx.beginPath(); ctx.arc(0, -2, n.r * 0.55, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a1010'; ctx.beginPath(); ctx.arc(-4, -3, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(4, -3, 1.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#9a2020'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 3, 2); ctx.lineTo(s * 8, 0); ctx.lineTo(s * 3, 4); ctx.fill(); }
        } else if (n.type === 'bob') {
          ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(0, 0, n.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1a1a20'; ctx.beginPath(); ctx.arc(0, -2, n.r * 0.6, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }
  }
}

// boot
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
