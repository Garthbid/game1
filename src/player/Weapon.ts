import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Audio } from '../core/Audio';
import type { Effects } from '../fx/Effects';
import type { Enemy } from '../enemies/Enemy';
import type { RunStats } from '../game/Upgrades';
import type { Player } from './Player';

export interface ShotTargets {
  /** Arena meshes plus every live enemy's group, in one list. */
  list(): THREE.Object3D[];
}

export interface HitInfo {
  enemy: Enemy;
  damage: number;
  headshot: boolean;
  killed: boolean;
  point: THREE.Vector3;
}

const DEG = Math.PI / 180;

/** The rifle: hitscan, fire rate, spread, recoil, magazine and reload, plus its view model. */
export class Weapon {
  ammo: number = CONFIG.weapon.magazine;
  reloading = false;
  private reloadLeft = 0;
  private cooldown = 0;
  private flashLeft = 0;
  private kick = 0; // view-model kick back, visual only
  private wasDown = false;

  private readonly model = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;
  private readonly ray = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly muzzlePos = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly hitInfo: HitInfo = { enemy: null!, damage: 0, headshot: false, killed: false, point: new THREE.Vector3() };

  onEnemyHit: (hit: HitInfo) => void = () => {};
  onShot: () => void = () => {};

  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly player: Player,
    private readonly stats: RunStats,
    private readonly targets: ShotTargets,
    private readonly effects: Effects,
    private readonly audio: Audio,
  ) {
    // View model built from boxes, parented to the camera
    const dark = new THREE.MeshStandardMaterial({ color: 0x484f59, roughness: 0.55, metalness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x4a7dbd, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.3), dark);
    barrel.position.set(0, 0.02, -0.38);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), accent);
    mag.position.set(0, -0.1, -0.06);
    mag.rotation.x = 0.2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark);
    grip.position.set(0, -0.09, 0.14);
    grip.rotation.x = -0.3;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.06), accent);
    sight.position.set(0, 0.07, -0.05);
    this.model.add(body, barrel, mag, grip, sight);
    this.muzzle.position.set(0, 0.02, -0.55);
    this.model.add(this.muzzle);

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    this.flash.position.copy(this.muzzle.position);
    this.flash.scale.set(1, 1, 2);
    this.flash.visible = false;
    this.model.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc56b, 0, 6, 2);
    this.flashLight.position.copy(this.muzzle.position);
    this.model.add(this.flashLight);

    this.model.scale.setScalar(0.5);
    this.model.traverse((o) => {
      // The gun lives on layer 1, which Game renders in a second pass on top of the world,
      // so it never clips into walls.
      o.layers.set(1);
      o.castShadow = false;
    });
    this.flashLight.layers.enableAll(); // the muzzle flash also lights the world
    camera.add(this.model);
    this.ray.far = CONFIG.weapon.range;
  }

  get magazine(): number {
    return this.stats.magazine;
  }

  reset() {
    this.ammo = this.stats.magazine;
    this.reloading = false;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.flashLeft = 0;
    this.kick = 0;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
  }

  /** After an upgrade: a bigger magazine tops up immediately so the reward is felt. */
  refreshStats() {
    if (!this.reloading && this.ammo > this.stats.magazine) this.ammo = this.stats.magazine;
  }

  startReload() {
    if (this.reloading || this.ammo === this.stats.magazine) return;
    this.reloading = true;
    this.reloadLeft = this.stats.reloadTime;
    this.audio.reload(this.stats.reloadTime);
  }

  /** True when the crosshair ray hits a live enemy within auto-fire range. */
  aimingAtEnemy(camera: THREE.PerspectiveCamera): boolean {
    camera.updateMatrixWorld();
    this.dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.getWorldPosition(this.origin);
    this.ray.set(this.origin, this.dir);
    this.ray.far = CONFIG.assist.autoFireRange;
    const hits = this.ray.intersectObjects(this.targets.list(), true);
    this.ray.far = CONFIG.weapon.range;
    if (hits.length === 0) return false;
    const e = this.enemyOf(hits[0].object);
    return e !== null && !e.dead;
  }

  step(dt: number, triggerDown: boolean, reloadPressed: boolean, camera: THREE.PerspectiveCamera) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (reloadPressed) this.startReload();
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloading = false;
        this.ammo = this.stats.magazine;
      }
    }

    if (triggerDown && !this.reloading && this.cooldown <= 0 && this.ammo > 0) {
      this.fire(camera);
      if (this.stats.doubleTap > 0 && Math.random() < this.stats.doubleTap) {
        this.ammo++; // the extra bullet is free
        this.fire(camera);
      }
      this.cooldown += 1 / this.stats.fireRate;
    }
    // An empty magazine reloads on its own once the last shot's cooldown has passed
    if (this.ammo === 0 && !this.reloading && this.cooldown <= 0) {
      if (triggerDown && !this.wasDown) this.audio.dryFire();
      this.startReload();
    }
    this.wasDown = triggerDown;

    this.flashLeft -= dt;
    const on = this.flashLeft > 0;
    this.flash.visible = on;
    this.flashLight.intensity = on ? 6 : 0;
    if (on) this.flash.rotation.z = Math.random() * Math.PI;
    this.kick *= Math.exp(-18 * dt);
  }

  /** Per-frame view-model sway, reload dip and kick. */
  animate(time: number) {
    const p = this.player;
    const bob = p.moving && p.grounded ? Math.sin(time * 9) * 0.012 : 0;
    const dip = this.reloading ? 0.07 : 0;
    const dash = p.dashing ? 0.05 : 0;
    this.model.position.set(0.16 + bob * 0.5, -0.15 + Math.abs(bob) - dip - dash, -0.36 + this.kick + dash);
    this.model.rotation.x = this.reloading ? -0.6 : this.kick * 2;
  }

  private enemyOf(obj: THREE.Object3D | null): Enemy | null {
    while (obj) {
      if (obj.userData.enemy) return obj.userData.enemy as Enemy;
      obj = obj.parent;
    }
    return null;
  }

  private fire(camera: THREE.PerspectiveCamera) {
    const W = CONFIG.weapon;
    this.ammo--;
    this.flashLeft = W.muzzleFlashTime;
    this.kick = 0.03;
    this.player.recoil += W.recoilKick;
    this.audio.shoot();
    this.onShot();

    // Ray from the camera centre with random spread inside a cone
    camera.updateMatrixWorld();
    const spread = (this.player.moving ? W.moveSpreadDeg : W.spreadDeg) * DEG * this.stats.spreadMul;
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * Math.tan(spread);
    this.dir.set(Math.cos(ang) * r, Math.sin(ang) * r, -1).normalize().applyQuaternion(camera.quaternion);
    camera.getWorldPosition(this.origin);
    this.ray.set(this.origin, this.dir);

    const hits = this.ray.intersectObjects(this.targets.list(), true);
    this.muzzle.getWorldPosition(this.muzzlePos);

    if (hits.length === 0) {
      this.end.copy(this.origin).addScaledVector(this.dir, W.range);
      this.effects.tracer(this.muzzlePos, this.end);
      return;
    }

    // Walk the hits in order: enemies take damage (one, or two with piercing); the first
    // wall or already-hit enemy stops the bullet.
    let enemiesLeft = this.stats.pierce ? 2 : 1;
    let last: Enemy | null = null;
    let stopped = false;
    for (const hit of hits) {
      const enemy = this.enemyOf(hit.object);
      if (!enemy) {
        this.end.copy(hit.point);
        let n: THREE.Vector3 | null = null;
        if (hit.face) {
          this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          n = this.normal.copy(hit.face.normal).applyMatrix3(this.normalMatrix).normalize();
        }
        this.effects.sparksAt(hit.point, n, 0xffd27a, 6);
        stopped = true;
        break;
      }
      if (enemy.dead || enemy === last) continue; // the capsule's back face, or a corpse
      last = enemy;
      this.end.copy(hit.point);
      const headshot = hit.point.y - enemy.position.y >= enemy.headY;
      const damage = this.stats.damage * (headshot ? W.headshotMul : 1);
      const killed = enemy.hit(damage);
      this.effects.sparksAt(hit.point, null, headshot ? 0xffd27a : 0xff6b6b, headshot ? 8 : 5);
      const info = this.hitInfo;
      info.enemy = enemy;
      info.damage = damage;
      info.headshot = headshot;
      info.killed = killed;
      info.point.copy(hit.point);
      this.onEnemyHit(info);
      if (--enemiesLeft <= 0) {
        stopped = true;
        break;
      }
    }
    if (!stopped) this.end.copy(this.origin).addScaledVector(this.dir, W.range);
    this.effects.tracer(this.muzzlePos, this.end);
  }
}
