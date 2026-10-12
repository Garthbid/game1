# Holdout

An endless browser arena shooter that plays on phones and desktops. Survive wave after wave, pick an upgrade after each one, chase your best score.
Built with Three.js and TypeScript; every model is a primitive shape and every sound is synthesized, so there are no asset files.

## Play right now

- **On a phone or any device:** open the GitHub Pages build (deployed from `main` by `.github/workflows/pages.yml`). Add it to your home screen for a fullscreen app.
- **Offline, desktop:** double-click **`Holdout.html`**. It's the whole game in one file.

### Touch controls

| Gesture | Action |
| --- | --- |
| Left thumb, anywhere on the left half | Floating joystick: move |
| Right thumb, drag | Look |
| FIRE (hold) | Shoot. Auto-fire is on by default: the rifle also fires on its own whenever the crosshair is on an enemy |
| DASH | Short dodge with a brief immunity window; the button fills back up as it recharges |
| JUMP, RELOAD | What they say |
| ⏸ (top left) | Pause |

Touch aiming gets a little help: the view slows down while an enemy is near the crosshair. Mouse aiming gets none.
Auto-fire and look sensitivity are on the start screen and are remembered.

### Keyboard and mouse

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Left click (hold) | Fire |
| Shift | Dash |
| Space | Jump |
| R | Reload (an empty magazine also reloads on its own) |
| Esc or P | Pause |
| ` (backtick) | Debug overlay: fps, frame time, enemies, draw calls |

## The game

- **Waves are endless.** Wave *n* brings 2 + 2*n* Grunts (capped at 14), Rushers from wave 2, Shooters from wave 3, Brutes from wave 4. Enemies gain 7% health and 1.5% speed per wave. Your best score and wave are saved in the browser.
- **After every wave you pick one of three upgrades:** damage, fire rate, bigger magazine, faster reload, tighter spread, speed, vampire healing, max health, piercing rounds, explosive rounds, double tap, second wind. Most stack. Two health pickups drop during the break.
- **Headshots** do double damage. Each enemy has a head height; aim high.
- **Combo:** kills within 2.4 s of each other build a streak. The multiplier climbs ×1.5, ×2, ×2.5, ×3 and applies to every kill's points.
- **Dash** (Shift / DASH): 0.17 s burst with 0.3 s of immunity, 1.1 s cooldown. Dash through orbs and out of Brute swings.

### Enemies

- **Grunt** (red capsule): 50 HP, runs at you, winds up visibly (visor glows, body rears back) before a 10-damage hit.
- **Rusher** (yellow, spiked, from wave 2): 25 HP, fast and weaving, blinks faster as it closes, explodes on contact for 20 damage plus a shove. The blast also hurts enemies near it.
- **Shooter** (purple box, from wave 3): 75 HP, keeps 10–15 m away and fires slow glowing orbs (15 damage) when it can see you. Cover blocks them.
- **Brute** (big dark red, from wave 4): 320 HP, slow, long arm-raise wind-up, 25 damage and a big knockback. Headshots matter.

### Score

100 per Grunt, 75 per Rusher, 150 per Shooter, 400 per Brute, all times the combo multiplier. 500 per wave cleared.

## Work on the code

Requires Node.js 18 or newer.

```bash
npm install
npm run dev            # dev server with hot reload, opens the browser
npm run build          # typecheck + production build into dist/
npm run build:single   # build, then bundle everything into Holdout.html
```

To test the touch layout on a desktop, open the dev server in Chrome DevTools device mode (any phone preset); touch detection keys off `(pointer: coarse)` and the first touch event.

### Tuning

Every number lives in **`src/config.ts`**: speeds, damage, fire rate, enemy health, wave composition and scaling, combo tiers, dash, aim assist, the arena's cover layout, audio volume. Change a value and save; the dev server reloads instantly. Run `npm run build:single` afterwards to refresh `Holdout.html`.

Upgrades live in **`src/game/Upgrades.ts`**: each is a name, a description, how many times it can be taken, and a function that edits the run's stats.

To move or add cover, edit `CONFIG.arena.cover`. Each entry is `[centre x, centre z, width, depth, height]` in metres.

### Layout

```
src/
  main.ts             boot
  config.ts           every tuning number
  core/Game.ts        state machine, fixed 60 Hz update loop, combat wiring, upgrades flow
  core/Input.ts       keyboard, mouse, pointer lock and virtual controls merged into one view
  core/Touch.ts       on-screen joystick, look surface and buttons
  core/device.ts      touch detection, saved settings and best score
  core/Audio.ts       synthesized sounds (Web Audio API)
  game/Upgrades.ts    run stats and the upgrade pool
  world/Arena.ts      floor, walls, cover, lights
  world/collision.ts  circle-vs-box collision
  player/Player.ts    movement, dash, jumping, health, camera
  player/Weapon.ts    rifle, hitscan, headshots, piercing, reload, view model
  enemies/            Enemy base, Grunt, Rusher, Shooter, Brute, pooled orbs, WaveManager
  fx/Effects.ts       tracers, sparks, death bursts, blast rings, camera shake
  fx/Popups.ts        floating damage numbers and kill labels
  ui/                 HUD and menu screens
```

Game logic runs at a fixed 60 steps per second, independent of frame rate. Kills freeze time for a few hundredths of a second; clearing a wave runs in slow motion for a moment before the upgrade screen. The gun is drawn in a second render pass so it never clips into walls.

### Testing tip

Add `?nolock` to the URL (for example `http://localhost:5173/?nolock`) to play with a mouse but without pointer lock. Useful for automated tests or debugging in the console, where the game is available as `window.__game`. Setting `__game.input.touchFire = true` holds the trigger; `__game.player.yaw` and `.pitch` aim.

## Ideas for v2

More weapons with pickups, a boss every ten waves, smarter pathfinding, real models and audio, more maps, online leaderboard, haptics on supported phones.
