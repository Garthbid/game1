import * as THREE from 'three';
import { CONFIG } from '../config';
import { Audio } from './Audio';
import { Input } from './Input';
import { TouchControls } from './Touch';
import { device, loadBest, loadSettings, saveBest, saveSettings, type Settings } from './device';
import { Arena } from '../world/Arena';
import { isFree } from '../world/collision';
import { Player } from '../player/Player';
import { Weapon, type HitInfo } from '../player/Weapon';
import { Effects } from '../fx/Effects';
import { Popups } from '../fx/Popups';
import { Enemy, type EnemyContext, type EnemyKind, type Scaling } from '../enemies/Enemy';
import { Grunt } from '../enemies/Grunt';
import { Rusher } from '../enemies/Rusher';
import { Shooter } from '../enemies/Shooter';
import { Brute } from '../enemies/Brute';
import { Projectiles } from '../enemies/Projectile';
import { WaveManager } from '../enemies/WaveManager';
import { Hud, type HudState } from '../ui/Hud';
import { RunStats, rollUpgrades, takeUpgrade, type Upgrade } from '../game/Upgrades';

export type GameState = 'menu' | 'playing' | 'paused' | 'upgrade' | 'gameover';

interface Pickup {
  mesh: THREE.Group;
  phase: number;
}

const pickupBox = new THREE.BoxGeometry(0.5, 0.16, 0.16);
const pickupMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 0.8 });
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Owns everything: the fixed-step loop, the state machine and the wiring between systems. */
export class Game {
  state: GameState = 'menu';
  score = 0;
  kills = 0;
  streak = 0;
  bestStreak = 0;
  private streakLeft = 0;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly touch: TouchControls;
  readonly audio = new Audio();
  readonly arena: Arena;
  readonly effects: Effects;
  readonly popups: Popups;
  readonly stats = new RunStats();
  readonly player: Player;
  readonly weapon: Weapon;
  readonly projectiles: Projectiles;
  readonly waves: WaveManager;
  readonly hud = new Hud();
  readonly enemies: Enemy[] = [];
  readonly settings: Settings;
  private pickups: Pickup[] = [];

  private readonly noLockParam = new URLSearchParams(location.search).has('nolock');

  /** ?nolock in the URL, or any touch device: play without pointer lock. Live, since touch can be detected late. */
  private get noLock(): boolean {
    return this.noLockParam || device.touch;
  }

  private accumulator = 0;
  private lastTime = 0;
  private time = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private frameMs = 0;
  private hitStopLeft = 0;
  private slowLeft = 0;
  private slowScale = 1;
  private upgradeIn = -1; // real seconds until the upgrade screen opens, after a wave clear
  private fovExtra = 0;
  private pendingPlay = false;

  private readonly targetList: THREE.Object3D[] = [];
  private readonly losRay = new THREE.Raycaster();
  private readonly losDir = new THREE.Vector3();
  private readonly ctx: EnemyContext;
  private readonly hudState: HudState = {
    health: 0,
    maxHealth: 100,
    ammo: 0,
    magazine: 30,
    reloading: false,
    wave: 0,
    enemiesLeft: 0,
    score: 0,
    streak: 0,
    mult: 1,
    comboFrac: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, device.touch ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = device.touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.autoClear = false; // two passes per frame: world, then the gun
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false; // count both passes in the debug overlay

    this.camera = new THREE.PerspectiveCamera(this.baseFov(), window.innerWidth / window.innerHeight, 0.05, 200);
    this.scene.add(this.camera); // the gun is parented to the camera

    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.allowUnlockedMouse = this.noLockParam;
    this.touch = new TouchControls(this.input);
    this.arena = new Arena(this.scene);
    this.effects = new Effects(this.scene);
    this.popups = new Popups(document.getElementById('popups')!);
    this.player = new Player(this.camera, this.stats);
    this.weapon = new Weapon(this.camera, this.player, this.stats, { list: () => this.buildTargets() }, this.effects, this.audio);
    this.projectiles = new Projectiles(this.scene);
    this.waves = new WaveManager({
      spawn: (k, x, z, s) => this.spawn(k, x, z, s),
      aliveCount: () => this.aliveCount(),
      onCountdown: (n) => this.onCountdown(n),
      onWaveStart: (n) => this.onWaveStart(n),
      onWaveCleared: (n) => this.onWaveCleared(n),
    });

    this.ctx = {
      player: this.player,
      boxes: this.arena.boxes,
      enemies: this.enemies,
      hasLineOfSight: (a, b) => this.hasLineOfSight(a, b),
      damagePlayer: (n, from) => this.damagePlayer(n, from),
      fireOrb: (from, to) => {
        if (this.projectiles.fire(from, to)) this.audio.orbFire();
      },
      explode: (at, r, pd, ed, kb, color) => this.explode(at, r, pd, ed, kb, color),
    };

    this.weapon.onEnemyHit = (hit) => this.onEnemyHit(hit);
    this.weapon.onShot = () => this.effects.shake(CONFIG.fx.shotShake);
    this.player.onDash = () => this.audio.dash();
    this.projectiles.onPlayerHit = (at) => this.damagePlayer(CONFIG.orb.damage, at);
    this.projectiles.onBreak = (p) => this.effects.sparksAt(p, null, 0x8ff3ff, 5);

    this.wireUi(canvas);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));

    this.hud.show('start');
    const best = loadBest();
    this.hud.setBest(best.score, best.wave);
    this.player.syncCamera();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- State machine ----------

  private wireUi(canvas: HTMLCanvasElement) {
    const btn = (id: string, fn: () => void) => document.getElementById(id)!.addEventListener('click', fn);
    btn('btn-start', () => this.startGame());
    btn('btn-resume', () => this.resume());
    btn('btn-restart', () => this.startGame());
    btn('btn-over-restart', () => this.startGame());
    btn('btn-pause', () => this.pause());

    // Settings
    const auto = document.getElementById('opt-autofire') as HTMLInputElement;
    const sens = document.getElementById('opt-sens') as HTMLInputElement;
    auto.checked = this.settings.autoFire;
    sens.value = String(this.settings.sensitivity);
    auto.addEventListener('change', () => {
      this.settings.autoFire = auto.checked;
      saveSettings(this.settings);
    });
    sens.addEventListener('input', () => {
      this.settings.sensitivity = Number(sens.value) || 1;
      this.input.sensitivity = this.settings.sensitivity;
      saveSettings(this.settings);
    });

    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.noLock) this.input.requestLock();
    });
    this.input.onGesture = () => this.audio.init();

    this.input.onLockChange = (locked) => {
      if (locked && (this.state === 'paused' || this.pendingPlay)) {
        this.pendingPlay = false;
        this.setState('playing');
      } else if (!locked && this.state === 'playing') {
        this.setState('paused');
      }
    };
    document.addEventListener('pointerlockerror', () => {
      this.pendingPlay = false;
      if (this.state === 'upgrade') this.setState('paused');
      const hint = document.getElementById('lock-hint');
      if (hint) hint.classList.add('visible');
    });

    this.input.onAction = (action, code) => {
      if (action === 'debug') this.hud.debugOn = !this.hud.debugOn;
      if (action !== 'pause') return;
      // Under pointer lock the browser handles Esc itself (it releases the lock, which pauses us)
      if (code === 'Escape' && this.input.locked) return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' && code === 'KeyP') this.resume();
    };

    // Switching apps on a phone, or tabs on a desktop, pauses the fight
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  private setState(s: GameState) {
    this.state = s;
    this.accumulator = 0;
    this.input.reset();
    this.touch.setActive(s === 'playing');
    const hint = document.getElementById('lock-hint');
    if (hint) hint.classList.remove('visible');
    if (s === 'playing') this.hud.show(null);
    else if (s === 'paused') this.hud.show('pause');
    else if (s === 'upgrade') this.hud.show('upgrade');
    else if (s === 'gameover') this.hud.show('over');
    else this.hud.show('start');
  }

  /** Enter play: immediately without pointer lock, otherwise once the browser grants the lock. */
  private enterPlay() {
    if (this.noLock) {
      this.setState('playing');
      return;
    }
    this.pendingPlay = true;
    this.input.requestLock();
  }

  startGame() {
    this.audio.init();
    this.goFullscreen();
    this.resetWorld();
    this.enterPlay();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.input.exitLock();
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.init();
    this.enterPlay();
  }

  /** Phones: fullscreen and landscape when the browser allows it. Everything here is best-effort. */
  private goFullscreen() {
    if (!device.touch) return;
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen?.({ navigationUI: 'hide' });
      if (p && typeof p.catch === 'function') {
        p.then(() => {
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          o.lock?.('landscape').catch(() => {});
        }).catch(() => {});
      }
    } catch {
      /* iOS Safari has no fullscreen API for pages */
    }
  }

  private resetWorld() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const p of this.pickups) p.mesh.removeFromParent();
    this.pickups = [];
    this.projectiles.clear();
    this.effects.clear();
    this.popups.clear();
    this.stats.reset();
    this.player.reset();
    this.weapon.reset();
    this.score = 0;
    this.kills = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.streakLeft = 0;
    this.hitStopLeft = 0;
    this.slowLeft = 0;
    this.slowScale = 1;
    this.upgradeIn = -1;
    this.hud.clearTransient();
    this.waves.reset();
  }

  private endGame() {
    this.input.exitLock();
    // Enemies mid-death would freeze on screen once the simulation stops; clear them now
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }
    const best = loadBest();
    const newBest = this.score > best.score;
    if (newBest || this.waves.wave > best.wave) {
      saveBest({ score: Math.max(best.score, this.score), wave: Math.max(best.wave, this.waves.wave) });
    }
    const after = loadBest();
    this.hud.setBest(after.score, after.wave);
    this.hud.setFinal(this.score, this.waves.wave, this.kills, this.bestStreak, newBest);
    this.audio.gameOver();
    this.setState('gameover');
  }

  // ---------- Wave callbacks ----------

  private onCountdown(next: number) {
    if (next === 1) this.hud.showBanner('GET READY', '', CONFIG.waves.firstWaveDelay);
    else this.hud.showBanner(`WAVE ${next}`, 'incoming', CONFIG.waves.breakTime);
  }

  private onWaveStart(n: number) {
    const W = CONFIG.waves;
    let sub = '';
    if (n === W.rushersFromWave) sub = 'Rushers explode on contact. Shoot them early.';
    else if (n === W.shootersFromWave) sub = 'Shooters incoming. Dash through the orbs.';
    else if (n === W.brutesFromWave) sub = 'A Brute. Aim for the head.';
    else if (n % W.milestone === 0) sub = `Wave ${n}. Still standing.`;
    this.hud.showBanner(`WAVE ${n}`, sub, sub ? 2.4 : 1.6);
    this.audio.waveStart();
  }

  private onWaveCleared(n: number) {
    this.score += CONFIG.waves.waveClearBonus;
    this.audio.waveClear();
    this.hud.showBanner(`WAVE ${n} CLEARED`, `+${CONFIG.waves.waveClearBonus}`, CONFIG.fx.waveClearSlowTime + 0.3);
    this.slowScale = CONFIG.fx.waveClearSlowMo;
    this.slowLeft = CONFIG.fx.waveClearSlowTime;
    this.upgradeIn = CONFIG.fx.waveClearSlowTime;
  }

  private openUpgrades() {
    this.input.exitLock();
    const options = rollUpgrades(this.stats);
    this.hud.showUpgrades(this.waves.wave, options, this.stats.taken, (u) => this.pickUpgrade(u));
    this.setState('upgrade');
  }

  private pickUpgrade(u: Upgrade) {
    if (this.state !== 'upgrade') return;
    this.audio.init();
    takeUpgrade(this.stats, u);
    if (u.id === 'juggernaut') this.player.heal(30);
    this.weapon.refreshStats();
    this.audio.upgrade();
    for (let i = 0; i < CONFIG.waves.pickupsPerBreak; i++) this.spawnPickup();
    this.waves.startBreak();
    this.enterPlay();
  }

  private spawn(kind: EnemyKind, x: number, z: number, scale: Scaling) {
    let e: Enemy;
    if (kind === 'grunt') e = new Grunt(x, z, scale);
    else if (kind === 'rusher') e = new Rusher(x, z, scale);
    else if (kind === 'shooter') e = new Shooter(x, z, scale);
    else e = new Brute(x, z, scale);
    this.enemies.push(e);
    this.scene.add(e.group);
  }

  private aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  private spawnPickup() {
    const half = CONFIG.arena.size / 2 - 3;
    for (let tries = 0; tries < 40; tries++) {
      const x = (Math.random() * 2 - 1) * half;
      const z = (Math.random() * 2 - 1) * half;
      if (!isFree(x, z, 1.2, this.arena.boxes)) continue;
      if (Math.hypot(x - this.player.position.x, z - this.player.position.z) < 4) continue;
      const g = new THREE.Group();
      const a = new THREE.Mesh(pickupBox, pickupMat);
      const b = new THREE.Mesh(pickupBox, pickupMat);
      b.rotation.z = Math.PI / 2;
      g.add(a, b);
      g.position.set(x, 0.8, z);
      this.scene.add(g);
      this.pickups.push({ mesh: g, phase: Math.random() * 6 });
      return;
    }
  }

  // ---------- Combat ----------

  private onEnemyHit(hit: HitInfo) {
    this.hud.hitMarker(hit.killed, hit.headshot);
    this.popups.damage(hit.point, hit.damage, hit.headshot, hit.enemy);
    if (hit.headshot) this.audio.headshot();
    if (hit.killed) this.onKill(hit.enemy, hit.point);
    else this.audio.enemyHit();
  }

  /** Every enemy death that counts for the player goes through here, however it happened. */
  private onKill(enemy: Enemy, at: THREE.Vector3) {
    this.kills++;
    this.streak = this.streakLeft > 0 ? this.streak + 1 : 1;
    this.streakLeft = CONFIG.combo.window;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const prevMult = this.multiplier(this.streak - 1);
    const mult = this.multiplier(this.streak);
    if (mult > prevMult) this.audio.comboUp(mult);
    const points = Math.round(enemy.score * mult);
    this.score += points;
    this.popups.kill(at, points, mult);
    tmpA.copy(enemy.position);
    tmpA.y += enemy.headY * 0.6;
    this.effects.deathBurst(tmpA, enemy.color, enemy.kind === 'brute');
    this.audio.enemyDeath(this.streak);
    this.hitStopLeft = Math.max(this.hitStopLeft, CONFIG.fx.killHitStop);
    if (this.stats.vampire > 0) this.player.heal(this.stats.vampire);
    if (this.stats.explosive) this.explode(tmpA, 3, 0, 40, 0, 0xffa040);
  }

  private multiplier(streak: number): number {
    const t = CONFIG.combo.tiers;
    return t[Math.max(0, Math.min(streak, t.length - 1))];
  }

  private explode(at: THREE.Vector3, radius: number, playerDamage: number, enemyDamage: number, knockback: number, color: number) {
    // Blasts can chain (explosive rounds, rusher caught in a blast), so keep the centre in locals, not shared scratch
    const cx = at.x;
    const cy = at.y;
    const cz = at.z;
    const centre = new THREE.Vector3(cx, cy, cz);
    this.effects.ring(centre, color, radius);
    this.effects.sparksAt(centre, null, color, 18, 7, 0.45, 2);
    this.audio.explosion();
    this.effects.shake(0.25);
    if (playerDamage > 0) {
      const p = this.player.position;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < radius + CONFIG.player.radius && Math.abs(p.y - cy) < 2.5 && this.player.invulnLeft <= 0) {
        if (knockback > 0) this.player.knockback(cx, cz, knockback);
        this.damagePlayer(playerDamage, centre);
      }
    }
    if (enemyDamage > 0) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.position.x - cx, e.position.z - cz);
        if (d >= radius + e.radius) continue;
        const killed = e.hit(enemyDamage);
        const hitAt = new THREE.Vector3(e.position.x, e.position.y + e.headY * 0.7, e.position.z);
        this.popups.damage(hitAt, enemyDamage, false, e);
        if (killed) this.onKill(e, hitAt);
      }
    }
  }

  private damagePlayer(amount: number, from: THREE.Vector3) {
    if (this.state !== 'playing') return;
    if (this.player.invulnLeft > 0) return;

    // Direction indicator: angle of the attacker relative to where the player faces, clockwise
    const p = this.player.position;
    const dx = from.x - p.x;
    const dz = from.z - p.z;
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    const rx = Math.cos(this.player.yaw);
    const rz = -Math.sin(this.player.yaw);
    this.hud.damageFrom(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz));

    let died = this.player.damage(amount);
    if (died && this.stats.secondWind) {
      this.stats.secondWind = false;
      this.player.health = 35;
      this.player.invulnLeft = 1.2;
      this.hud.showBanner('SECOND WIND', 'one more chance', 1.6);
      this.hud.healFlash();
      this.audio.secondWind();
      died = false;
    }
    this.hud.hurtFlash();
    this.effects.shake(CONFIG.fx.hurtShake);
    this.audio.playerHurt();
    if (died) this.endGame();
  }

  // ---------- Simulation ----------

  private buildTargets(): THREE.Object3D[] {
    const list = this.targetList;
    list.length = 0;
    for (const m of this.arena.meshes) list.push(m);
    for (const e of this.enemies) {
      if (e.dead) continue;
      // Enemies move in fixed steps between renders; refresh their matrices so the ray hits where they are now
      e.group.updateMatrixWorld();
      list.push(e.group);
    }
    return list;
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    this.losDir.copy(to).sub(from);
    const dist = this.losDir.length();
    this.losDir.divideScalar(dist);
    this.losRay.set(from, this.losDir);
    this.losRay.far = dist;
    return this.losRay.intersectObjects(this.arena.meshes, false).length === 0;
  }

  /** Touch aim help: the view turns more slowly while an enemy sits near the crosshair. */
  private updateAimAssist() {
    if (!device.touch) {
      this.input.assist = 1;
      return;
    }
    this.camera.getWorldDirection(tmpA);
    let closest = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      tmpB.set(e.position.x, e.position.y + e.headY * 0.7, e.position.z).sub(this.camera.position);
      const d = tmpB.length();
      if (d < 0.5) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, tmpB.dot(tmpA) / d)));
      if (ang < closest) closest = ang;
    }
    this.input.assist = closest < CONFIG.assist.frictionAngle ? CONFIG.assist.friction : 1;
  }

  private fixedStep(dt: number) {
    const input = this.input;
    this.player.step(dt, input, this.arena.boxes);
    const autoFire = this.settings.autoFire && !this.weapon.reloading && this.weapon.ammo > 0 && this.weapon.aimingAtEnemy(this.camera);
    this.weapon.step(dt, input.fireHeld || autoFire, input.wasPressed('reload'), this.camera);
    if (this.state !== 'playing') return; // explosive rounds can chain into a rusher blast that kills the player

    for (const e of this.enemies) e.step(dt, this.ctx);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removed) {
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }
    if (this.state !== 'playing') return; // an enemy may have killed the player this step

    this.projectiles.step(dt, this.player, this.arena.boxes);
    if (this.state !== 'playing') return;

    // Pickups
    const pp = this.player.position;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.phase += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.8 + Math.sin(p.phase * 3) * 0.12;
      const d = Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z);
      if (d < CONFIG.pickup.radius && pp.y < 2 && this.player.health < this.player.maxHealth) {
        this.player.heal(CONFIG.pickup.heal);
        this.popups.text(p.mesh.position, `+${CONFIG.pickup.heal} HEALTH`);
        p.mesh.removeFromParent();
        this.pickups.splice(i, 1);
        this.hud.healFlash();
        this.audio.pickup();
      }
    }

    if (this.streakLeft > 0) {
      this.streakLeft -= dt;
      if (this.streakLeft <= 0) this.streak = 0;
    }

    this.waves.step(dt);
    this.effects.update(dt);
    input.clearPressed();
  }

  private baseFov(): number {
    return window.innerWidth < window.innerHeight ? CONFIG.player.portraitFov : CONFIG.player.fov;
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.frameMs = this.frameMs * 0.9 + dt * 1000 * 0.1;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Time scale: a near-freeze on kills, slow motion when a wave ends
    let scale = 1;
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= dt;
      scale = 0.08;
    } else if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      scale = this.slowScale;
    }
    const simDt = dt * scale;

    if (this.state === 'playing') {
      this.time += simDt;
      this.updateAimAssist();
      const m = this.input.consumeLook();
      this.player.look(m.x, m.y);
      this.player.syncCamera(); // so shots fired this frame use the current view, not last frame's

      const step = 1 / CONFIG.loop.stepHz;
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= step && steps < CONFIG.loop.maxStepsPerFrame) {
        this.fixedStep(step);
        this.accumulator -= step;
        steps++;
        if (this.state !== 'playing') break;
      }
      if (steps >= CONFIG.loop.maxStepsPerFrame) this.accumulator = 0;

      if (this.waves.phase === 'countdown' && this.state === 'playing') {
        const left = Math.ceil(this.waves.countdownLeft);
        this.hud.setBannerSub(left > 0 ? `in ${left}` : '');
      }
      if (this.upgradeIn >= 0 && this.state === 'playing') {
        this.upgradeIn -= dt;
        if (this.upgradeIn < 0) this.openUpgrades();
      }
      this.hud.tick(dt);
      this.touch.setDashCooldown(
        this.player.dashCooldown / (CONFIG.player.dash.cooldown * this.stats.dashCooldownMul),
      );
    }

    // Dash FOV kick, eased in and out
    const wantFov = this.player.dashing ? CONFIG.player.dash.fovKick : 0;
    this.fovExtra += (wantFov - this.fovExtra) * (1 - Math.exp(-14 * dt));
    const fov = this.baseFov() + this.fovExtra;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.player.syncCamera();
    this.effects.applyShake(this.camera, this.time);
    this.weapon.animate(this.time);

    const h = this.hudState;
    h.health = this.player.health;
    h.maxHealth = this.player.maxHealth;
    h.ammo = this.weapon.ammo;
    h.magazine = this.weapon.magazine;
    h.reloading = this.weapon.reloading;
    h.wave = this.waves.wave;
    h.enemiesLeft = this.waves.remaining();
    h.score = this.score;
    h.streak = this.streak;
    h.mult = this.multiplier(this.streak);
    h.comboFrac = this.streakLeft / CONFIG.combo.window;
    this.hud.update(h);
    this.hud.setDebug(
      `${this.fps.toFixed(0)} fps  ${this.frameMs.toFixed(1)} ms\n` +
        `enemies ${this.aliveCount()}  orbs ${this.projectiles.activeCount}\n` +
        `draw calls ${this.renderer.info.render.calls}\n` +
        `touch ${device.touch}  assist ${this.input.assist}`,
    );
    this.render();
    // After render: the renderer has refreshed the camera's inverse matrix that projection needs
    this.popups.update(dt, this.camera, window.innerWidth, window.innerHeight);
  }

  /** World first, then the gun on top with a fresh depth buffer. */
  private render() {
    const r = this.renderer;
    r.info.reset();
    r.shadowMap.needsUpdate = true;
    r.clear();
    this.camera.layers.set(0);
    r.render(this.scene, this.camera);
    r.clearDepth();
    // A colour background makes three.js clear the screen; hide it so the world stays under the gun
    const bg = this.scene.background;
    this.scene.background = null;
    this.camera.layers.set(1);
    r.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.background = bg;
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = this.baseFov() + this.fovExtra;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
