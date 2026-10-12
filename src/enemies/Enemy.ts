import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Player } from '../player/Player';
import { resolveCircle, type Box } from '../world/collision';

export type EnemyKind = 'grunt' | 'rusher' | 'shooter' | 'brute';

export interface EnemyContext {
  player: Player;
  boxes: Box[];
  enemies: Enemy[];
  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean;
  /** Hurt the player. `from` is where the hit came from, for the damage direction indicator. */
  damagePlayer(amount: number, from: THREE.Vector3): void;
  fireOrb(from: THREE.Vector3, target: THREE.Vector3): void;
  /** An area blast that hurts the player and other enemies and leaves a particle burst. */
  explode(at: THREE.Vector3, radius: number, playerDamage: number, enemyDamage: number, knockback: number, color: number): void;
}

/** Per-wave scaling applied at spawn. */
export interface Scaling {
  hp: number;
  speed: number;
}

const tmp = new THREE.Vector3();

/** Shared enemy behaviour: health, hit flash, death shrink, movement with wall sliding and unsticking. */
export abstract class Enemy {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  health: number;
  readonly maxHealth: number;
  dead = false;
  removed = false;
  abstract readonly kind: EnemyKind;
  abstract readonly score: number;
  /** Hits this far above the feet count as headshots. */
  abstract readonly headY: number;
  /** Particle colour on death. */
  abstract readonly color: number;

  protected flashLeft = 0;
  private dyingLeft = 0;
  private readonly mats: THREE.MeshStandardMaterial[] = [];

  // Unstick: if an enemy barely moves while trying to, it sidesteps for a moment
  private progressTimer = 0;
  private progressFrom = new THREE.Vector3();
  private sidestep = 0;
  private sidestepDir = 1;

  constructor(
    readonly radius: number,
    readonly speed: number,
    maxHealth: number,
    x: number,
    z: number,
  ) {
    this.health = maxHealth;
    this.maxHealth = maxHealth;
    this.group.position.set(x, 0, z);
    this.position = this.group.position;
    this.group.userData.enemy = this;
    this.progressFrom.copy(this.position);
  }

  /** Subclasses register their meshes so the hit flash can tint them. */
  protected addMesh(mesh: THREE.Mesh) {
    mesh.castShadow = true;
    const m = mesh.material as THREE.MeshStandardMaterial;
    this.mats.push(m);
    this.group.add(mesh);
  }

  /** Returns true if this damage killed it. */
  hit(damage: number): boolean {
    if (this.dead) return false;
    this.health -= damage;
    this.flashLeft = CONFIG.fx.hitFlashTime;
    if (this.health <= 0) {
      this.dead = true;
      this.dyingLeft = CONFIG.fx.deathTime;
      return true;
    }
    return false;
  }

  step(dt: number, ctx: EnemyContext) {
    // Hit flash
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      const on = this.flashLeft > 0;
      for (const m of this.mats) m.emissiveIntensity = on ? 1 : (m.userData.baseEmissive as number);
      for (const m of this.mats) m.emissive.setHex(on ? 0xffffff : (m.userData.baseEmissiveColor as number));
    }
    if (this.dead) {
      this.dyingLeft -= dt;
      const s = Math.max(0.001, this.dyingLeft / CONFIG.fx.deathTime);
      this.group.scale.setScalar(s);
      if (this.dyingLeft <= 0) this.removed = true;
      return;
    }
    this.think(dt, ctx);
  }

  protected abstract think(dt: number, ctx: EnemyContext): void;

  /** Move toward a direction on the ground plane; slides on walls, separates from other enemies. */
  protected move(dirX: number, dirZ: number, speed: number, dt: number, ctx: EnemyContext) {
    const len = Math.hypot(dirX, dirZ);
    let mx = 0;
    let mz = 0;
    if (len > 1e-4) {
      mx = dirX / len;
      mz = dirZ / len;
      if (this.sidestep > 0) {
        // Rotate the intended direction 90° to work around an obstacle
        const sx = -mz * this.sidestepDir;
        const sz = mx * this.sidestepDir;
        mx = mx * 0.3 + sx;
        mz = mz * 0.3 + sz;
        const l2 = Math.hypot(mx, mz);
        mx /= l2;
        mz /= l2;
        this.sidestep -= dt;
      }
    }
    this.position.x += mx * speed * dt;
    this.position.z += mz * speed * dt;

    // Keep a little space from other enemies
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const min = this.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }

    // Never stand inside the player
    const p = ctx.player.position;
    const pdx = this.position.x - p.x;
    const pdz = this.position.z - p.z;
    const pmin = this.radius + CONFIG.player.radius;
    const pd2 = pdx * pdx + pdz * pdz;
    if (pd2 < pmin * pmin && pd2 > 1e-6 && p.y < 1.8) {
      const d = Math.sqrt(pd2);
      this.position.x += (pdx / d) * (pmin - d);
      this.position.z += (pdz / d) * (pmin - d);
    }

    resolveCircle(this.position, this.radius, 0, ctx.boxes);

    // Stuck check every half second while trying to move
    this.progressTimer += dt;
    if (this.progressTimer >= 0.5) {
      const moved = tmp.copy(this.position).sub(this.progressFrom).length();
      if (len > 1e-4 && speed > 0 && moved < speed * 0.5 * 0.25 && this.sidestep <= 0) {
        this.sidestep = 0.8 + Math.random() * 0.6;
        this.sidestepDir = Math.random() < 0.5 ? -1 : 1;
      }
      this.progressFrom.copy(this.position);
      this.progressTimer = 0;
    }
  }

  protected face(x: number, z: number) {
    this.group.rotation.y = Math.atan2(x - this.position.x, z - this.position.z);
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

/** Builds a per-enemy material that remembers its base emissive for the hit flash. */
export function enemyMaterial(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive, emissiveIntensity });
  m.userData.baseEmissive = emissiveIntensity;
  m.userData.baseEmissiveColor = emissive;
  return m;
}
