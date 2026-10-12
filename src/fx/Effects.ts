import * as THREE from 'three';
import { CONFIG } from '../config';

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
}

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  size: number;
}

const TRACER_LIFE = 0.06;
const SPARK_LIFE = 0.25;
const RING_LIFE = 0.35;

/** Pooled visual effects: tracers, impact sparks, death bursts, blast rings and camera shake. */
export class Effects {
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private nextTracer = 0;
  private nextSpark = 0;
  private nextRing = 0;
  trauma = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, mat, life: 0 });
    }
    const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < 96; i++) {
      const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: SPARK_LIFE, size: 1 });
    }
    const ringGeo = new THREE.RingGeometry(0.8, 1, 32);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, mat, life: 0, size: 1 });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const t = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % this.tracers.length;
    const attr = t.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.life = TRACER_LIFE;
    t.line.visible = true;
  }

  sparksAt(point: THREE.Vector3, normal: THREE.Vector3 | null, color: number, count = 6, speed = 5, life = SPARK_LIFE, size = 1) {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % this.sparks.length;
      s.mesh.position.copy(point);
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      s.vel.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(speed);
      if (normal) s.vel.addScaledVector(normal, 2.5);
      s.life = life;
      s.maxLife = life;
      s.size = size;
      s.mesh.scale.setScalar(size);
      s.mesh.visible = true;
    }
  }

  /** A chunky burst where an enemy died, in its own colour. */
  deathBurst(point: THREE.Vector3, color: number, big = false) {
    this.sparksAt(point, null, color, big ? 26 : 14, big ? 7 : 5.5, 0.5, big ? 2.2 : 1.6);
  }

  /** A flat expanding ring on the floor, for blasts. */
  ring(point: THREE.Vector3, color: number, size: number) {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    r.mesh.position.set(point.x, 0.05, point.z);
    r.mat.color.setHex(color);
    r.life = RING_LIFE;
    r.size = size;
    r.mesh.visible = true;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.03) {
        s.mesh.position.y = 0.03;
        s.vel.y = Math.abs(s.vel.y) * 0.3;
        s.vel.x *= 0.7;
        s.vel.z *= 0.7;
      }
      s.mesh.scale.setScalar(Math.max(0.01, s.life / s.maxLife) * s.size);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / RING_LIFE);
      r.mesh.scale.setScalar(0.2 + t * r.size);
      r.mat.opacity = (1 - t) * 0.8;
      if (r.life <= 0) r.mesh.visible = false;
    }
    this.trauma = Math.max(0, this.trauma - CONFIG.fx.shakeDecay * dt);
  }

  /** Adds shake on top of the camera's base rotation; call after the player sets it. */
  applyShake(camera: THREE.Camera, time: number) {
    if (this.trauma <= 0) return;
    const a = this.trauma * this.trauma * CONFIG.fx.shakeMaxAngle;
    camera.rotation.x += a * Math.sin(time * 37.1);
    camera.rotation.y += a * Math.sin(time * 41.7 + 1.3);
    camera.rotation.z += a * Math.sin(time * 29.3 + 2.1);
  }

  clear() {
    for (const t of this.tracers) {
      t.life = 0;
      t.line.visible = false;
    }
    for (const s of this.sparks) {
      s.life = 0;
      s.mesh.visible = false;
    }
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
    this.trauma = 0;
  }
}
