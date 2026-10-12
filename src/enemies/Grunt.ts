import * as THREE from 'three';
import { CONFIG } from '../config';
import { Enemy, enemyMaterial, type EnemyContext, type Scaling } from './Enemy';

const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 12);
const visorGeo = new THREE.BoxGeometry(0.5, 0.14, 0.2);

/** Runs straight at the player, winds up visibly, then hits in melee range. */
export class Grunt extends Enemy {
  readonly kind = 'grunt';
  readonly score = CONFIG.grunt.score;
  readonly headY = CONFIG.grunt.headY;
  readonly color = CONFIG.grunt.color;
  private attackCooldown = 0.4;
  private windupLeft = 0;
  private readonly body: THREE.Mesh;
  private readonly visorMat: THREE.MeshStandardMaterial;

  constructor(x: number, z: number, scale: Scaling) {
    const G = CONFIG.grunt;
    super(G.radius, G.speed * scale.speed * (0.9 + Math.random() * 0.2), Math.round(G.health * scale.hp), x, z);
    this.body = new THREE.Mesh(bodyGeo, enemyMaterial(G.color));
    this.body.position.y = 0.9;
    this.addMesh(this.body);
    this.visorMat = enemyMaterial(0xffd0a8, 0xffa060, 0.6);
    const visor = new THREE.Mesh(visorGeo, this.visorMat);
    visor.position.set(0, 1.4, 0.32);
    this.addMesh(visor);
  }

  protected think(dt: number, ctx: EnemyContext) {
    const G = CONFIG.grunt;
    const p = ctx.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.face(p.x, p.z);
    const inReach = dist <= G.attackRange && Math.abs(p.y - this.position.y) < 1.6;

    if (this.windupLeft > 0) {
      // Rear back, then lunge. The visor glows so the player can read the hit coming.
      this.windupLeft -= dt;
      const t = 1 - this.windupLeft / G.windup;
      this.body.rotation.x = t < 0.7 ? -0.35 * (t / 0.7) : 0.5;
      this.visorMat.userData.baseEmissive = 2.5;
      this.visorMat.emissiveIntensity = 2.5;
      this.move(0, 0, 0, dt, ctx);
      if (this.windupLeft <= 0) {
        this.body.rotation.x = 0;
        this.visorMat.userData.baseEmissive = 0.6;
        this.visorMat.emissiveIntensity = 0.6;
        if (inReach) ctx.damagePlayer(G.attackDamage, this.position);
        this.attackCooldown = G.attackInterval;
      }
      return;
    }

    if (dist > G.attackRange * 0.7) this.move(dx, dz, this.speed, dt, ctx);
    else this.move(0, 0, 0, dt, ctx);

    this.attackCooldown -= dt;
    if (inReach && this.attackCooldown <= 0) this.windupLeft = G.windup;
  }
}
