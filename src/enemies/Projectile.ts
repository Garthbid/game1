import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Player } from '../player/Player';
import { pointInBoxes, type Box } from '../world/collision';

interface Orb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

const tmp = new THREE.Vector3();

/** Pooled glowing orbs fired by Shooters. They hit the player or break on cover. */
export class Projectiles {
  private readonly orbs: Orb[] = [];

  onPlayerHit: (at: THREE.Vector3) => void = () => {};
  onBreak: (at: THREE.Vector3) => void = () => {};

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(CONFIG.orb.radius, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8ff3ff });
    const glowGeo = new THREE.SphereGeometry(CONFIG.orb.radius * 2.2, 12, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x5fe8ff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    for (let i = 0; i < CONFIG.orb.poolSize; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.add(new THREE.Mesh(glowGeo, glowMat));
      mesh.visible = false;
      scene.add(mesh);
      this.orbs.push({ mesh, vel: new THREE.Vector3(), life: 0, active: false });
    }
  }

  fire(from: THREE.Vector3, target: THREE.Vector3): boolean {
    const orb = this.orbs.find((o) => !o.active);
    if (!orb) return false;
    orb.mesh.position.copy(from);
    orb.vel.copy(target).sub(from).normalize().multiplyScalar(CONFIG.orb.speed);
    orb.life = CONFIG.orb.lifetime;
    orb.active = true;
    orb.mesh.visible = true;
    return true;
  }

  step(dt: number, player: Player, boxes: Box[]) {
    const half = CONFIG.arena.size / 2;
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.mesh.position.addScaledVector(o.vel, dt);
      o.life -= dt;
      const p = o.mesh.position;

      // Player body is treated as a vertical capsule from feet to head
      const pp = player.position;
      const cy = Math.max(pp.y + 0.3, Math.min(pp.y + CONFIG.player.eyeHeight, p.y));
      tmp.set(pp.x, cy, pp.z);
      if (tmp.distanceToSquared(p) < (CONFIG.player.radius + CONFIG.orb.radius) ** 2) {
        this.kill(o);
        this.onPlayerHit(p);
        continue;
      }
      const outside = Math.abs(p.x) > half || Math.abs(p.z) > half || p.y < 0;
      if (outside || pointInBoxes(p.x, p.y, p.z, boxes)) {
        this.onBreak(p);
        this.kill(o);
        continue;
      }
      if (o.life <= 0) this.kill(o);
    }
  }

  private kill(o: Orb) {
    o.active = false;
    o.mesh.visible = false;
  }

  clear() {
    for (const o of this.orbs) this.kill(o);
  }

  get activeCount(): number {
    let n = 0;
    for (const o of this.orbs) if (o.active) n++;
    return n;
  }
}
