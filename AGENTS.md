# AGENTS.md — CORRIDOORS

A fan-made, top-down browser tribute to **DOORS** (the Hotel floor). Original
code, art (procedural canvas), and music (synthesized live via Web Audio). No
runtime dependencies, no build step — vanilla ES modules + Canvas 2D + Web Audio.

> Written by GLM 5.2.

## Run

It's a static site. Serve the repo root over HTTP (modules need http(s), not file://):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Audio unlocks on the first user gesture (the ENTER THE HOTEL button).

## Verify (browser smoke test)

No test framework is checked in. To smoke-test in a headless browser:

```bash
npm install playwright      # dev-only; the game itself needs no deps
node -e "import('playwright').then(async({chromium})=>{const b=await chromium.launch({headless:true});const p=await b.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));await p.goto('http://localhost:8000',{waitUntil:'networkidle'});await p.click('#btn-play');await p.waitForTimeout(1000);console.log('errors:',e.length);await b.close();})"
```

`node --input-type=module --check < file.js` parses every module for syntax.

## Architecture

Entry: `index.html` → `src/main.js` (the **Game** director). Everything hangs off
the `Game` instance on `window.game`.

### Engine (`src/engine/`)
- `math.js` — RNG (mulberry32), vec/rect/circle-vs-AABB collision, easing, DIRS.
- `input.js` — keyboard + mouse, `justPressed`/`down`/`flush` per frame.
- `camera.js` — smooth follow, look-ahead, screen-shake, cutscene `tweenTo`.
- `lighting.js` — darkness layer with punched-out lights/cones + additive glow.
- `particles.js` — pooled particles, additive or alpha, gravity/drag/spin.
- `audio.js` — fully procedural SFX library + 8 generative music tracks (lobby/dread/chase/shop/library/finale/guiding/elevator). Positional `playAt`.

### Game (`src/game/`)
- `mapgen.js` — procedural hotel: lobby, generic rooms/corridors, locked+key rooms, Dupe fake doors, Seek chase chain, Halt corridor, Library (50), Breather (51), Jeff's Shop (52), Courtyard (60), Greenhouse (90–99), Electrical (100). Builds wall AABBs leaving door gaps.
- `render.js` — all art is canvas primitives: 6 floor styles, furniture, decor, doors, items, fixtures. Zone palettes.
- `items.js` — item defs (procedural icons) + `Inventory` (stacks, keys, gold).
- `player.js` — movement (walk/run/crouch), noise, hide, collide, health, draw.
- `entities.js` — **Rush/Ambush**, **Eyes**, **Halt**, **Screech**, **Shadow** + Guiding-Light advice table.
- `figure.js` — **Figure** (blind, hunts by sound; patrol→investigate→chase) + **LibraryPuzzle** (door 50 padlock) + **BreakerPuzzle** (door 100).
- `seek.js` — **SeekChase** set piece: formation cutscene, snaking corridor sprint, fire/debris obstacles, Guiding-Light path, door-slam finale.
- `ui.js` — DOM HUD, hotbar, modals (shop/padlock/breaker), jumpscare overlay renderer (9 scare faces), screens, letterbox, heartbeat UI.

### Director (`src/main.js`)
- Main loop (fixed-cap dt), state machine (menu/playing/paused/dead/win).
- Lazy room generation as the player opens "next" doors; special rooms at fixed numbers; Seek at `firstSeek`(~29) & `secondSeek`(~80); Halt at `haltDoor`(~42).
- Entity director: per-room probability rolls for Rush/Ambush/Eyes/Screech/Shadow with cooldowns.
- Cutscene queue (`runCutscene`), deferred `schedule`, interaction system (E to open/search/hide/pickup/shop/breaker/padlock), door/lock/key/lockpick, Dupe/Timothy/Jack event scares, Hide eviction, Glitch teleport.
- Lighting pass: per-room fixture lights (broken/flicker), player halo, flashlight cone / lighter glow, entity glows (staged in `pendingGlows`).
- Heartbeat minigame (hide near Figure → SPACE on the beat).
- Win = restore power (3 fuses → breaker order) → reach the elevator in the Electrical room.

## Controls

`WASD` move · mouse aims light · `Shift` sprint (loud) · `C` crouch (quiet) ·
`E` interact · `F` toggle light · `1–5`/click hotbar · `R` use selected item ·
`Space` heartbeat (when hiding near the Figure) · `Esc` pause.

## Conventions

- No comments in game logic except the top-of-file authorship marker and section headers (matches existing style).
- All art + audio is generated at runtime — there are **no asset files** to add.
- ES module imports only; no bundler. Keep files framework-free.

## Status

Complete and verified in headless Chromium: 0 console/page errors; door
progression, room generation, Rush pathing + kill, wardrobe-hide survival, death
flow, music switching, and player/avatar rendering all confirmed working.
