import * as THREE from 'three';
import { CONFIG } from '../config';
import { Enemy, enemyMaterial, type EnemyContext, type Scaling } from './Enemy';

const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 10);
const spikeGeo = new THREE.ConeGeometry(0.12, 0.3, 6);

/** Small, fast and suicidal: weaves toward the player and blows up on contact. Kill it at range. */
export class Rusher extends Enemy {
  readonly kind = 'rusher';
  readonly score = CONFIG.rusher.score;
  readonly headY = CONFIG.rusher.headY;
  readonly color = CONFIG.rusher.color;
  private phase = Math.random() * 10;
  private readonly bodyMat: THREE.MeshStandardMaterial;

  constructor(x: number, z: number, scale: Scaling) {
    const R = CONFIG.rusher;
    super(R.radius, R.speed * scale.speed, Math.round(R.health * scale.hp), x, z);
    this.bodyMat = enemyMaterial(R.color, R.color, 0.25);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.position.y = 0.6;
    this.addMesh(body);
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(spikeGeo, enemyMaterial(0x2b2b2b));
      const a = (i / 3) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3);
      spike.rotation.z = -Math.cos(a) * 1.1;
      spike.rotation.x = Math.sin(a) * 1.1;
      this.addMesh(spike);
    }
  }

  protected think(dt: number, ctx: EnemyContext) {
    const R = CONFIG.rusher;
    const p = ctx.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.face(p.x, p.z);
    this.phase += dt;

    // Weave: the approach direction plus a sideways wobble that fades out near the target
    const wob = Math.sin(this.phase * 7) * Math.min(1, dist / 6) * 0.9;
    const inv = 1 / Math.max(dist, 0.001);
    const mx = dx * inv - dz * inv * wob;
    const mz = dz * inv + dx * inv * wob;
    this.move(mx, mz, this.speed, dt, ctx);

    // Blink faster as it closes in
    const blink = 0.25 + 0.75 * Math.max(0, Math.sin(this.phase * (4 + 30 / Math.max(dist, 1))));
    this.bodyMat.userData.baseEmissive = blink;
    if (this.flashLeft <= 0) this.bodyMat.emissiveIntensity = blink;

    if (dist < this.radius + CONFIG.player.radius + 0.35 && Math.abs(p.y - this.position.y) < 1.5) {
      this.dead = true;
      this.removed = true;
      ctx.explode(this.position, R.blastRadius, R.damage, R.blastEnemyDamage, R.knockback, R.color);
    }
  }
}
