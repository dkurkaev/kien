import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Field, mapAcross } from './field';
import { MessSystem } from './messes';

// Ants are the environment, not targets. No A*, no pathfinding: each ant reads
// the pheromone gradient under its antennae, steers toward it, and drops a little
// pheromone of its own. Trails emerge. Movement is per-surface 2D; drawing is 3D.
export class Ants {
  private cap: number;
  surface: Int32Array;
  cx: Float32Array;
  cy: Float32Array;
  heading: Float32Array;
  alive: Uint8Array;
  count = 0;
  private free: number[] = [];
  private influxAcc = 0;
  private live = 0; // current alive count, kept in sync (soft-capped by config.ants.target)

  mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();
  private right = new THREE.Vector3();
  private pos = new THREE.Vector3();

  constructor(private layout: Layout, scene: THREE.Scene) {
    this.cap = config.ants.max;
    this.surface = new Int32Array(this.cap);
    this.cx = new Float32Array(this.cap);
    this.cy = new Float32Array(this.cap);
    this.heading = new Float32Array(this.cap);
    this.alive = new Uint8Array(this.cap);

    const geo = new THREE.BoxGeometry(0.08, 0.035, 0.2);
    // Ants are the hero element — always drawn on top of crumbs AND the transparent
    // liquid. depthTest:false beats tall crumbs; transparent + high renderOrder puts
    // them last in the transparent pass (after the liquid overlay), so nothing buries
    // them. opacity stays 1 (fully solid), we only use the transparent queue ordering.
    const mat = new THREE.MeshBasicMaterial({ color: 0x140f0b, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = this.cap;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  private alloc(): number {
    if (this.free.length) return this.free.pop()!;
    if (this.count < this.cap) return this.count++;
    return -1;
  }

  private kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.live--;
    this.free.push(i);
  }

  aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) n += this.alive[i];
    return n;
  }

  private spawnOnEdge(si: number): void {
    if (this.live >= config.ants.target) return; // soft population cap (tunable)
    const i = this.alloc();
    if (i < 0) return;
    const s = this.layout.surfaces[si];
    const r = this.layout.surfaces.length ? Math.random() : 0; // side pick
    const along = Math.random();
    let cx: number, cy: number, h: number;
    if (r < 0.25) { cx = along * s.gW; cy = 0; h = Math.PI / 2; }
    else if (r < 0.5) { cx = along * s.gW; cy = s.gH; h = -Math.PI / 2; }
    else if (r < 0.75) { cx = 0; cy = along * s.gH; h = 0; }
    else { cx = s.gW; cy = along * s.gH; h = Math.PI; }
    this.surface[i] = si;
    this.cx[i] = cx;
    this.cy[i] = cy;
    this.heading[i] = h + (Math.random() - 0.5) * 0.6;
    this.alive[i] = 1;
    this.live++;
  }

  // Ants trickle in: the rate scales with active food but is CAPPED, so a pile of
  // uncleaned mess can't summon a swarm, and killing ants only lets them return at
  // the capped rate (no instant flood). Both knobs are in the tuning panel.
  private influx(dt: number, messes: MessSystem): void {
    if (this.live >= config.ants.target) return;
    const rate = Math.min(config.ants.maxInfluxRate, messes.activeFoodCount() * config.ants.influxPerFood);
    this.influxAcc = Math.min(3, this.influxAcc + rate * dt); // clamp so it can't burst
    while (this.influxAcc >= 1) {
      this.influxAcc -= 1;
      const si = messes.randomFoodSurface();
      if (si === null) break;
      this.spawnOnEdge(si);
    }
  }

  private senseValue(field: Field, si: number, x: number, y: number): number {
    let v = field.sample(si, x, y);
    if (field.noFoodAt(si, x, y)) v -= 40; // sprayed patches repel
    return v;
  }

  update(dt: number, field: Field, messes: MessSystem): void {
    this.influx(dt, messes);

    const speedCells = config.ants.speed / config.world.cellSize;
    const sd = config.ants.sensorDist;
    const sa = config.ants.sensorAngle;
    const noise = config.ants.noise;
    const turn = config.ants.turnRate;

    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const si = this.surface[i];
      const h = this.heading[i];
      const x = this.cx[i], y = this.cy[i];

      // three antennae
      const F = this.senseValue(field, si, x + Math.cos(h) * sd, y + Math.sin(h) * sd);
      const L = this.senseValue(field, si, x + Math.cos(h + sa) * sd, y + Math.sin(h + sa) * sd);
      const R = this.senseValue(field, si, x + Math.cos(h - sa) * sd, y + Math.sin(h - sa) * sd);

      let nh = h;
      if (F >= L && F >= R) {
        // keep heading
      } else if (L > R) {
        nh += turn * dt;
      } else {
        nh -= turn * dt;
      }
      nh += (Math.random() - 0.5) * noise;
      this.heading[i] = nh;

      let ncx = x + Math.cos(nh) * speedCells * dt;
      let ncy = y + Math.sin(nh) * speedCells * dt;
      const s = this.layout.surfaces[si];

      if (ncx < 0 || ncx >= s.gW || ncy < 0 || ncy >= s.gH) {
        const c = mapAcross(this.layout, si, ncx, ncy);
        if (c) {
          this.surface[i] = c.s;
          this.cx[i] = Math.min(this.layout.surfaces[c.s].gW - 0.01, Math.max(0, c.cx));
          this.cy[i] = Math.min(this.layout.surfaces[c.s].gH - 0.01, Math.max(0, c.cy));
          this.heading[i] = c.inward + (Math.random() - 0.5) * 0.5;
        } else if (Math.random() < config.ants.leaveChance * dt) {
          this.kill(i); // starving ant wanders off the edge
          continue;
        } else {
          // bounce back inside
          this.heading[i] = nh + Math.PI;
          this.cx[i] = Math.min(s.gW - 0.01, Math.max(0, ncx));
          this.cy[i] = Math.min(s.gH - 0.01, Math.max(0, ncy));
        }
      } else {
        this.cx[i] = ncx;
        this.cy[i] = ncy;
      }

      field.deposit(this.surface[i], this.cx[i], this.cy[i], config.pheromone.antDeposit * dt);
    }
  }

  // wipe scatter: kill a fraction, push the survivors away from the stroke
  scatter(si: number, cx: number, cy: number, radiusCells: number, killFrac: number): void {
    const r2 = radiusCells * radiusCells;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.surface[i] !== si) continue;
      const dx = this.cx[i] - cx, dy = this.cy[i] - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (Math.random() < killFrac) { this.kill(i); continue; }
      this.heading[i] = Math.atan2(dy, dx); // flee the cloth
    }
  }

  // spray lands as a disc on the surface: kill ants inside, scatter the survivors
  sprayDisc(si: number, ax: number, ay: number, rangeCells: number, killProb: number): void {
    const r2 = rangeCells * rangeCells;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.surface[i] !== si) continue;
      const dx = this.cx[i] - ax, dy = this.cy[i] - ay;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1e-6) continue;
      if (Math.random() < killProb) this.kill(i);
      else this.heading[i] = Math.atan2(dy, dx); // flee outward
    }
  }

  syncInstances(): void {
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) {
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const s = this.layout.surfaces[this.surface[i]];
      const h = this.heading[i];
      this.fwd.copy(s.u).multiplyScalar(Math.cos(h)).addScaledVector(s.v, Math.sin(h)).normalize();
      this.up.copy(s.normal);
      s.toWorld(this.cx[i], this.cy[i], this.pos).addScaledVector(s.normal, 0.06); // above crumbs

      this.dummy.position.copy(this.pos);
      this.dummy.scale.setScalar(1);
      const m = this.dummy.matrix;
      this.right.crossVectors(this.up, this.fwd).normalize();
      m.makeBasis(this.right, this.up, this.fwd);
      m.setPosition(this.pos);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
