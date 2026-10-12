import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Box } from './collision';
import { device } from '../core/device';

/** Floor, walls, cover, lights and fog. Exposes boxes for collision and meshes for raycasts. */
export class Arena {
  readonly boxes: Box[] = [];
  readonly meshes: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    const { size, wallHeight, cover } = CONFIG.arena;
    const half = size / 2;

    scene.background = new THREE.Color(0x9fb4c8);
    scene.fog = new THREE.Fog(0x9fb4c8, 25, 75);

    // Lights
    const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x4a4238, 1.1);
    hemi.layers.enableAll(); // also light the gun's render layer
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(device.touch ? 1024 : 2048, device.touch ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -half - 2;
    sc.right = half + 2;
    sc.top = half + 2;
    sc.bottom = -half - 2;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0005;
    sun.layers.enableAll();
    scene.add(sun);

    // Floor with a grid texture drawn on a canvas, so no image files are needed
    const floorTex = this.makeGridTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(size / 4, size / 4);
    floorTex.anisotropy = 8;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    scene.add(floor);
    this.meshes.push(floor);

    // Walls: four tall boxes around the edge
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 0.9 });
    const t = 1; // wall thickness
    this.addBox(scene, 0, -half - t / 2, size + 2 * t, t, wallHeight, wallMat);
    this.addBox(scene, 0, half + t / 2, size + 2 * t, t, wallHeight, wallMat);
    this.addBox(scene, -half - t / 2, 0, t, size, wallHeight, wallMat);
    this.addBox(scene, half + t / 2, 0, t, size, wallHeight, wallMat);

    // Cover
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 });
    const lowWallMat = new THREE.MeshStandardMaterial({ color: 0x8c9399, roughness: 0.9 });
    for (const [x, z, w, d, h] of cover) {
      this.addBox(scene, x, z, w, d, h, h <= 1.2 ? crateMat : lowWallMat);
    }
  }

  private addBox(
    scene: THREE.Scene,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.meshes.push(mesh);
    this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: h });
  }

  private makeGridTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#7d8a6e';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#6a765c';
    g.lineWidth = 4;
    g.strokeRect(0, 0, 256, 256);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
