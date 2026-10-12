// Hand-written collision. Everything solid in the arena is an axis-aligned box standing on the floor,
// so players and enemies are circles on the ground plane pushed out of box footprints.

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number; // height of the box's top face
}

export interface Pos2 {
  x: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Push a circle out of every box that is taller than its feet.
 * Boxes whose top is at or below the feet are ignored, so you can stand on them.
 * Returns true when anything was hit.
 */
export function resolveCircle(pos: Pos2, radius: number, feetY: number, boxes: Box[]): boolean {
  let hit = false;
  // Two passes handle corners where two boxes push in different directions.
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (b.top <= feetY + 0.01) continue;
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Centre is inside the box: leave by the nearest face.
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const front = pos.z - b.minZ;
        const back = b.maxZ - pos.z;
        const m = Math.min(left, right, front, back);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === front) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
  return hit;
}

/** Highest surface under a circle that is at or below `feetY` (the floor is 0). */
export function groundAt(pos: Pos2, radius: number, feetY: number, boxes: Box[]): number {
  let ground = 0;
  for (const b of boxes) {
    if (b.top > feetY + 0.05) continue;
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    if (dx * dx + dz * dz < radius * radius * 0.5 && b.top > ground) ground = b.top;
  }
  return ground;
}

/** True when a point is inside any box. */
export function pointInBoxes(x: number, y: number, z: number, boxes: Box[]): boolean {
  for (const b of boxes) {
    if (y <= b.top && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

/** True when a circle at this spot overlaps no box. */
export function isFree(x: number, z: number, radius: number, boxes: Box[]): boolean {
  for (const b of boxes) {
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}
