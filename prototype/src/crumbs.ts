import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Field } from './field';

const ON_COUNTER = 0;
const AIRBORNE = 1;

// Crumbs are real particles living on the countertop (a horizontal plane). The
// broom imparts an IMPULSE, not a teleport — they slide with friction, tumble,
// and pile up. Swept past the edge they go airborne, fall under gravity, and
// land on the floor. They only ever spawn on the counter (surface 0).
export class CrumbSystem {
  private cap: number;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private spin: Float32Array; private spinV: Float32Array;
  private size: Float32Array;
  private friMul: Float32Array; // per-crumb friction multiplier — no two settle alike
  state: Uint8Array;
  alive: Uint8Array;
  count = 0;
  private free: number[] = [];

  mesh: THREE.InstancedMesh;
  private counter: number;
  private minX = 0; private maxX = 0; private minZ = 0; private maxZ = 0; private topY = 0;
  private dummy = new THREE.Object3D();
  private q = new THREE.Quaternion();
  private tiltAxis = new THREE.Vector3();

  constructor(private layout: Layout, scene: THREE.Scene, counterIndex = 0) {
    this.counter = counterIndex;
    this.cap = config.mess.crumbMaxTotal;
    this.px = new Float32Array(this.cap); this.py = new Float32Array(this.cap); this.pz = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap); this.vy = new Float32Array(this.cap); this.vz = new Float32Array(this.cap);
    this.spin = new Float32Array(this.cap); this.spinV = new Float32Array(this.cap);
    this.size = new Float32Array(this.cap);
    this.friMul = new Float32Array(this.cap);
    this.state = new Uint8Array(this.cap);
    this.alive = new Uint8Array(this.cap);

    const geo = new THREE.BoxGeometry(1, 0.55, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcaa15e, roughness: 1, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // world bounds of the counter (crumbs go airborne once past these)
    const c = this.layout.surfaces[this.counter];
    const corners = [c.toWorld(0, 0), c.toWorld(c.gW, 0), c.toWorld(0, c.gH), c.toWorld(c.gW, c.gH)];
    this.minX = Math.min(...corners.map((v) => v.x)); this.maxX = Math.max(...corners.map((v) => v.x));
    this.minZ = Math.min(...corners.map((v) => v.z)); this.maxZ = Math.max(...corners.map((v) => v.z));
    this.topY = c.origin.y;
  }

  private alloc(): number {
    if (this.free.length) return this.free.pop()!;
    if (this.count < this.cap) return this.count++;
    return -1;
  }
  private kill(i: number): void { if (this.alive[i]) { this.alive[i] = 0; this.free.push(i); } }

  aliveCount(): number { let n = 0; for (let i = 0; i < this.count; i++) n += this.alive[i]; return n; }
  foodAmount(): number { let n = 0; for (let i = 0; i < this.count; i++) if (this.alive[i] && this.state[i] === ON_COUNTER) n++; return n * 0.06; }
  stateCounts(): { counter: number; air: number } {
    const r = { counter: 0, air: 0 };
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      if (this.state[i] === ON_COUNTER) r.counter++; else r.air++;
    }
    return r;
  }

  // spawn a cluster on the counter at cell (ccx,ccy)
  spawnCluster(ccx: number, ccy: number, count: number, spreadCells: number): void {
    const c = this.layout.surfaces[this.counter];
    const tmp = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      const i = this.alloc();
      if (i < 0) return;
      const r = spreadCells * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const cx = Math.min(c.gW - 0.5, Math.max(0.5, ccx + Math.cos(a) * r));
      const cy = Math.min(c.gH - 0.5, Math.max(0.5, ccy + Math.sin(a) * r));
      c.toWorld(cx, cy, tmp);
      this.px[i] = tmp.x; this.py[i] = this.topY; this.pz[i] = tmp.z;
      this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
      this.spin[i] = Math.random() * Math.PI * 2;
      this.spinV[i] = 0;
      this.size[i] = config.mess.crumbSize * (0.6 + 0.8 * Math.random());
      this.friMul[i] = 0.55 + Math.random() * 1.1; // some crumbs grip, some skitter
      this.state[i] = ON_COUNTER;
      this.alive[i] = 1;
    }
  }

  // Broom sweep with real momentum. `speed` is the broom's ACTUAL speed (a hard
  // flick pushes harder), not a fixed value. Crumbs off the brush's centre-line
  // get squirted sideways (the broom's "bow wave"), plus per-crumb jitter — so
  // they fan out instead of gliding in a rigid line. Velocity is coupled (inertia)
  // and bled off by friction in update().
  sweep(px: number, pz: number, radiusWorld: number, dx: number, dz: number, speed: number): void {
    if (speed <= 0.02) return;
    const r = radiusWorld, r2 = r * r;
    const perpx = -dz, perpz = dx; // unit perpendicular to the sweep direction
    const fan = config.mess.crumbFan;
    const k = 0.6; // coupling per touch
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.state[i] !== ON_COUNTER) continue;
      const ox = this.px[i] - px, oz = this.pz[i] - pz;
      if (ox * ox + oz * oz > r2) continue;
      const latN = (ox * perpx + oz * perpz) / r; // signed off-axis position, -1..1
      // forward push + sideways squirt (bigger the further off-axis) + jitter
      const tvx = dx * speed + perpx * latN * speed * fan + (Math.random() - 0.5) * speed * 0.2;
      const tvz = dz * speed + perpz * latN * speed * fan + (Math.random() - 0.5) * speed * 0.2;
      this.vx[i] += (tvx - this.vx[i]) * k;
      this.vz[i] += (tvz - this.vz[i]) * k;
      this.spinV[i] += (latN * 2 + (Math.random() - 0.5)) * speed * 4;
    }
  }

  update(dt: number, field: Field): void {
    const baseFr = config.mess.crumbFriction;
    const g = config.mess.crumbGravity;
    const c = this.layout.surfaces[this.counter];
    const cs = config.world.cellSize;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const st = this.state[i];

      if (st === ON_COUNTER) {
        // per-crumb kinetic friction, then STATIC friction: once slow enough the
        // crumb actually stops (no endless ice-glide)
        const fr = Math.exp(-baseFr * this.friMul[i] * dt);
        this.vx[i] *= fr; this.vz[i] *= fr; this.spinV[i] *= fr;
        if (this.vx[i] * this.vx[i] + this.vz[i] * this.vz[i] < 0.0009) { this.vx[i] = 0; this.vz[i] = 0; this.spinV[i] *= 0.5; }
        this.px[i] += this.vx[i] * dt; this.pz[i] += this.vz[i] * dt;
        this.spin[i] += this.spinV[i] * dt;
        // the +X and +Z sides are against walls (crumbs pile up); the -X and -Z
        // sides are open, so crumbs swept there tip over the edge and fall.
        if (this.px[i] > this.maxX) { this.px[i] = this.maxX; if (this.vx[i] > 0) this.vx[i] = 0; }
        if (this.pz[i] > this.maxZ) { this.pz[i] = this.maxZ; if (this.vz[i] > 0) this.vz[i] = 0; }
        if (this.px[i] < this.minX || this.pz[i] < this.minZ) {
          // tipped over an open edge: keep a little horizontal momentum (inertia)
          // but mostly drop, then fall
          // over the edge: gravity takes over — keep only a little horizontal so it
          // drops down the side, not sails across the room
          this.state[i] = AIRBORNE;
          this.vx[i] *= 0.3; this.vz[i] *= 0.3; this.vy[i] = -0.3;
        } else {
          // each crumb is its own little food source
          const gx = (this.px[i] - c.origin.x) * c.u.x + (this.py[i] - c.origin.y) * c.u.y + (this.pz[i] - c.origin.z) * c.u.z;
          const gy = (this.px[i] - c.origin.x) * c.v.x + (this.py[i] - c.origin.y) * c.v.y + (this.pz[i] - c.origin.z) * c.v.z;
          field.deposit(this.counter, gx / cs, gy / cs, config.pheromone.foodStrength * 0.2 * dt);
        }
      } else {
        // AIRBORNE: gravity dominates; light air drag bleeds any horizontal drift so
        // crumbs plummet down the side of the counter rather than flying off.
        this.vy[i] -= g * dt;
        const drag = Math.exp(-1.6 * dt);
        this.vx[i] *= drag; this.vz[i] *= drag;
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        this.spin[i] += this.spinV[i] * dt;
        if (this.py[i] < this.topY - 2.2) this.kill(i); // fell well below the table — gone
      }
    }
  }

  syncInstances(): void {
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) {
        this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix); continue;
      }
      // lie flat on the ground with a yaw spin; airborne crumbs tumble on a tilted axis
      if (this.state[i] === AIRBORNE) {
        this.tiltAxis.set(Math.cos(this.spin[i]), 0.3, Math.sin(this.spin[i])).normalize();
        this.q.setFromAxisAngle(this.tiltAxis, this.spin[i]);
      } else {
        this.q.setFromAxisAngle(up, this.spin[i]);
      }
      this.dummy.position.set(this.px[i], this.py[i] + this.size[i] * 0.4, this.pz[i]);
      this.dummy.quaternion.copy(this.q);
      this.dummy.scale.setScalar(this.size[i]);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
