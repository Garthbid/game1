import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { RunStats } from '../game/Upgrades';
import { groundAt, resolveCircle, type Box } from '../world/collision';

/** First-person movement, dashing, jumping, health and the camera's base orientation. */
export class Player {
  readonly position = new THREE.Vector3(); // feet
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  recoil = 0; // extra upward pitch from firing, settles back to 0
  health: number = CONFIG.player.maxHealth;
  grounded = true;
  moving = false;
  dashLeft = 0;
  dashCooldown = 0;
  invulnLeft = 0;
  private readonly dashDir = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly axis = { x: 0, z: 0 };

  onDash: () => void = () => {};

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly stats: RunStats,
  ) {
    this.reset();
  }

  get maxHealth(): number {
    return this.stats.maxHealth;
  }

  get dashing(): boolean {
    return this.dashLeft > 0;
  }

  reset() {
    const [x, z] = CONFIG.arena.playerStart;
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.health = this.stats.maxHealth;
    this.grounded = true;
    this.dashLeft = 0;
    this.dashCooldown = 0;
    this.invulnLeft = 0;
    this.syncCamera();
  }

  /** Look runs every frame for responsiveness. Deltas are already in radians. */
  look(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch -= dy;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  step(dt: number, input: Input, boxes: Box[]) {
    const P = CONFIG.player;
    const D = P.dash;

    input.moveAxis(this.axis);
    const fx = this.axis.x;
    const fz = this.axis.z;
    const speed = P.walkSpeed * this.stats.speedMul;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.wish.set((fx * cos + fz * sin) * speed, 0, (-fx * sin + fz * cos) * speed);

    // Dash: a short burst in the move direction (or straight ahead), with a brief immunity
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.wasPressed('dash') && this.dashCooldown <= 0) {
      if (fx !== 0 || fz !== 0) this.dashDir.set(fx * cos + fz * sin, 0, -fx * sin + fz * cos).normalize();
      else this.dashDir.set(-sin, 0, -cos);
      this.dashLeft = D.time;
      this.dashCooldown = D.cooldown * this.stats.dashCooldownMul;
      this.invulnLeft = Math.max(this.invulnLeft, D.invuln);
      this.onDash();
    }
    this.invulnLeft = Math.max(0, this.invulnLeft - dt);

    if (this.dashLeft > 0) {
      this.dashLeft -= dt;
      this.velocity.x = this.dashDir.x * D.speed;
      this.velocity.z = this.dashDir.z * D.speed;
    } else {
      // Ease horizontal velocity toward the wish velocity (frame-rate independent)
      const accel = this.grounded ? P.groundAccel : P.airAccel;
      const k = 1 - Math.exp(-accel * dt);
      this.velocity.x += (this.wish.x - this.velocity.x) * k;
      this.velocity.z += (this.wish.z - this.velocity.z) * k;
    }

    // Jump
    if (this.grounded && input.isHeld('jump')) {
      this.velocity.y = Math.sqrt(2 * P.gravity * P.jumpHeight);
      this.grounded = false;
    }

    // Horizontal move + collision
    const prevY = this.position.y;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    resolveCircle(this.position, P.radius, prevY, boxes);

    // Vertical move + landing
    // Average of old and new velocity, so jump height matches config exactly
    const vy0 = this.velocity.y;
    this.velocity.y -= P.gravity * dt;
    this.position.y += (vy0 + this.velocity.y) * 0.5 * dt;
    const ground = groundAt(this.position, P.radius, prevY, boxes);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.5 || !this.grounded;

    // Recoil settles back
    this.recoil *= Math.exp(-CONFIG.weapon.recoilRecover * dt);
  }

  syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + CONFIG.player.eyeHeight, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(Math.min(this.pitch + this.recoil, Math.PI / 2 - 0.01), this.yaw, 0);
  }

  /** World position of the chest, where enemy orbs aim. */
  chest(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + 1.2, this.position.z);
  }

  /** Shove the player away from a point (brute swings, rusher blasts). */
  knockback(fromX: number, fromZ: number, speed: number) {
    let dx = this.position.x - fromX;
    let dz = this.position.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      dx = -Math.sin(this.yaw);
      dz = -Math.cos(this.yaw);
    } else {
      dx /= d;
      dz /= d;
    }
    this.velocity.x += dx * speed;
    this.velocity.z += dz * speed;
    this.dashLeft = 0;
  }

  heal(n: number) {
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  /** Returns true if this damage killed the player. Second Wind is handled by the game. */
  damage(n: number): boolean {
    this.health = Math.max(0, this.health - n);
    return this.health <= 0;
  }
}
