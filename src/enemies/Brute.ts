import * as THREE from 'three';
import { CONFIG } from '../config';
import { Enemy, enemyMaterial, type EnemyContext, type Scaling } from './Enemy';

const torsoGeo = new THREE.BoxGeometry(1.3, 1.5, 1.0);
const headGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
const armGeo = new THREE.BoxGeometry(0.4, 1.3, 0.4);
const legGeo = new THREE.BoxGeometry(0.45, 0.9, 0.45);

/** A slow wall of health with a long, well-telegraphed swing that sends the player flying. */
export class Brute extends Enemy {
  readonly kind = 'brute';
  readonly score = CONFIG.brute.score;
  readonly headY = CONFIG.brute.headY;
  readonly color = CONFIG.brute.color;
  private attackCooldown = 0.8;
  private windupLeft = 0;
  private stride = 0;
  private readonly arms: THREE.Mesh[] = [];
  private readonly headMat: THREE.MeshStandardMaterial;

  constructor(x: number, z: number, scale: Scaling) {
    const B = CONFIG.brute;
    super(B.radius, B.speed * scale.speed, Math.round(B.health * scale.hp), x, z);
    const torso = new THREE.Mesh(torsoGeo, enemyMaterial(B.color));
    torso.position.y = 1.4;
    this.addMesh(torso);
    this.headMat = enemyMaterial(0x3a1c1c, 0xff4020, 0.5);
    const head = new THREE.Mesh(headGeo, this.headMat);
    head.position.set(0, 2.35, 0.1);
    this.addMesh(head);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, enemyMaterial(0x4a2424));
      arm.position.set(side * 0.9, 1.35, 0);
      this.addMesh(arm);
      this.arms.push(arm);
      const leg = new THREE.Mesh(legGeo, enemyMaterial(0x3a1c1c));
      leg.position.set(side * 0.35, 0.45, 0);
      this.addMesh(leg);
    }
  }

  protected think(dt: number, ctx: EnemyContext) {
    const B = CONFIG.brute;
    const p = ctx.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.face(p.x, p.z);
    const inReach = dist <= B.attackRange && Math.abs(p.y - this.position.y) < 2;

    if (this.windupLeft > 0) {
      this.windupLeft -= dt;
      const t = 1 - this.windupLeft / B.windup;
      // Arms rise during the wind-up and slam down on the last fifth
      const lift = t < 0.8 ? (t / 0.8) * -2.2 : -2.2 + ((t - 0.8) / 0.2) * 3.2;
      for (const a of this.arms) a.rotation.x = lift;
      this.headMat.userData.baseEmissive = 3;
      this.headMat.emissiveIntensity = 3;
      this.move(0, 0, 0, dt, ctx);
      if (this.windupLeft <= 0) {
        for (const a of this.arms) a.rotation.x = 0;
        this.headMat.userData.baseEmissive = 0.5;
        this.headMat.emissiveIntensity = 0.5;
        if (inReach && ctx.player.invulnLeft <= 0) {
          ctx.player.knockback(this.position.x, this.position.z, B.knockback);
          ctx.damagePlayer(B.attackDamage, this.position);
        }
        this.attackCooldown = B.attackInterval;
      }
      return;
    }

    // Heavy stomp: arms swing with the stride
    this.stride += dt * 4;
    const stride = Math.sin(this.stride) * 0.35;
    this.arms[0].rotation.x = stride;
    this.arms[1].rotation.x = -stride;

    if (dist > B.attackRange * 0.75) this.move(dx, dz, this.speed, dt, ctx);
    else this.move(0, 0, 0, dt, ctx);

    this.attackCooldown -= dt;
    if (inReach && this.attackCooldown <= 0) this.windupLeft = B.windup;
  }
}
