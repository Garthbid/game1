import * as THREE from 'three';
import { CONFIG } from '../config';
import { Enemy, enemyMaterial, type EnemyContext, type Scaling } from './Enemy';

const bodyGeo = new THREE.BoxGeometry(0.9, 1.6, 0.9);
const eyeGeo = new THREE.SphereGeometry(0.16, 12, 8);
const EYE_HEIGHT = 1.35;

/** Keeps its distance and fires slow orbs when it can see the player. */
export class Shooter extends Enemy {
  readonly kind = 'shooter';
  readonly score = CONFIG.shooter.score;
  readonly headY = CONFIG.shooter.headY;
  readonly color = CONFIG.shooter.color;
  private fireTimer = 1 + Math.random();
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(x: number, z: number, scale: Scaling) {
    const S = CONFIG.shooter;
    super(S.radius, S.speed * scale.speed, Math.round(S.health * scale.hp), x, z);
    const body = new THREE.Mesh(bodyGeo, enemyMaterial(S.color));
    body.position.y = 0.8;
    this.addMesh(body);
    const eye = new THREE.Mesh(eyeGeo, enemyMaterial(0xb8f7ff, 0x5fe8ff, 2));
    eye.position.set(0, EYE_HEIGHT, 0.42);
    this.addMesh(eye);
  }

  protected think(dt: number, ctx: EnemyContext) {
    const S = CONFIG.shooter;
    const p = ctx.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.face(p.x, p.z);

    this.eye.set(this.position.x, EYE_HEIGHT, this.position.z);
    ctx.player.chest(this.target);
    const canSee = ctx.hasLineOfSight(this.eye, this.target);

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = 1.5 + Math.random() * 1.5;
    }

    if (!canSee || dist > S.maxRange) {
      this.move(dx, dz, this.speed, dt, ctx); // close in / find a sight line
    } else if (dist < S.minRange) {
      this.move(-dx, -dz, this.speed, dt, ctx); // back off
    } else {
      this.move(-dz * this.strafeDir, dx * this.strafeDir, this.speed * 0.6, dt, ctx); // strafe
    }

    this.fireTimer -= dt;
    if (canSee && this.fireTimer <= 0 && dist < S.maxRange + 8) {
      // Start the orb just in front of the eye
      const inv = 1 / Math.max(dist, 0.001);
      this.eye.x += dx * inv * 0.6;
      this.eye.z += dz * inv * 0.6;
      ctx.fireOrb(this.eye, this.target);
      this.fireTimer = S.fireInterval;
    }
  }
}
