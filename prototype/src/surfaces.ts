import * as THREE from 'three';
import { config } from './config';

// A surface is a flat plane in 3D that carries its own 2D pheromone grid.
// Ants live in continuous CELL coordinates (cx in [0,gW], cy in [0,gH]) and get
// projected to 3D for drawing. Logic stays 2D and cheap; the picture is 3D.
export class Surface {
  readonly index: number;
  readonly origin: THREE.Vector3;
  readonly u: THREE.Vector3; // unit, cx axis
  readonly v: THREE.Vector3; // unit, cy axis
  readonly normal: THREE.Vector3;
  readonly width: number;
  readonly height: number;
  readonly gW: number;
  readonly gH: number;
  mesh!: THREE.Mesh;

  constructor(
    index: number,
    origin: THREE.Vector3,
    u: THREE.Vector3,
    v: THREE.Vector3,
    width: number,
    height: number,
    normalOverride?: THREE.Vector3,
  ) {
    const cs = config.world.cellSize;
    this.index = index;
    this.origin = origin.clone();
    this.u = u.clone().normalize();
    this.v = v.clone().normalize();
    // normal points INTO the room (up for the counter) so ants/messes/cursor sit
    // on the visible side. u×v alone points out of the L-corner, hence the override.
    this.normal = normalOverride
      ? normalOverride.clone().normalize()
      : new THREE.Vector3().crossVectors(this.u, this.v).normalize();
    this.width = width;
    this.height = height;
    this.gW = Math.round(width / cs);
    this.gH = Math.round(height / cs);
  }

  // cell coords -> world position (linear, also valid slightly out of bounds)
  toWorld(cx: number, cy: number, out = new THREE.Vector3()): THREE.Vector3 {
    const cs = config.world.cellSize;
    out.copy(this.origin)
      .addScaledVector(this.u, cx * cs)
      .addScaledVector(this.v, cy * cs);
    return out;
  }

  // world point -> cell coords on this surface's plane (no bounds check)
  fromWorld(p: THREE.Vector3): { cx: number; cy: number } {
    const cs = config.world.cellSize;
    const dx = p.x - this.origin.x, dy = p.y - this.origin.y, dz = p.z - this.origin.z;
    const du = dx * this.u.x + dy * this.u.y + dz * this.u.z;
    const dv = dx * this.v.x + dy * this.v.y + dz * this.v.z;
    return { cx: du / cs, cy: dv / cs };
  }
}

export type Edge = 'x0' | 'x1' | 'y0' | 'y1';

// A seam glues an edge of surface A to an edge of surface B. Shared edges have
// matching cell counts (guaranteed by cellSize), so the along-edge coordinate
// maps 1:1. This is what lets trails climb from the counter up the wall.
export interface Seam {
  a: number; ea: Edge;
  b: number; eb: Edge;
  // true when the along-edge axis runs opposite directions on the two surfaces
  flip: boolean;
}

export interface Layout {
  surfaces: Surface[];
  seams: Seam[];
}

// Counter (horizontal) + back wall (vertical) + right wall (vertical) forming an
// L-corner. Enough to check that vertical routes read to the eye.
export function buildLayout(): Layout {
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const nX = new THREE.Vector3(-1, 0, 0);
  const nZ = new THREE.Vector3(0, 0, -1);

  // Right-handed bases chosen so u×v points INTO the room. No overrides, no
  // mirroring — every transform stays a proper rotation.
  // Counter: u=+X, v=-Z  -> normal +Y (up). cx:0..gW = X -4..+4, cy:0..gH = Z +2..-2.
  const counter = new Surface(0, new THREE.Vector3(-4, 0, 2), X, nZ, 8, 4);
  // Back wall (Z=2): u=-X, v=+Y -> normal -Z (faces room). cx: X +4..-4, cy: Y 0..4.
  const backWall = new Surface(1, new THREE.Vector3(4, 0, 2), nX, Y, 8, 4);
  // Right wall (X=4): u=+Z, v=+Y -> normal -X (faces room). cx: Z -2..+2, cy: Y 0..4.
  const rightWall = new Surface(2, new THREE.Vector3(4, 0, -2), Z, Y, 4, 4);

  const seams: Seam[] = [
    // counter back edge (cy=0, Z=+2) <-> back wall bottom (cy=0). X axis is reversed.
    { a: 0, ea: 'y0', b: 1, eb: 'y0', flip: true },
    // counter right edge (cx=gW, X=+4) <-> right wall bottom (cy=0). Z axis reversed.
    { a: 0, ea: 'x1', b: 2, eb: 'y0', flip: true },
    // vertical corner: back wall left edge (cx=0, X=+4) <-> right wall far edge
    // (cx=gW, Z=+2). Both run along +Y, same direction. Lets a spill/ant cross
    // straight from one wall to the other (needed at the 3-way corner).
    { a: 1, ea: 'x0', b: 2, eb: 'x1', flip: false },
  ];

  return { surfaces: [counter, backWall, rightWall], seams };
}
