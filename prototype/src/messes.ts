import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Field } from './field';
import { Liquid } from './liquid';
import { CrumbSystem } from './crumbs';

// Owns both mess kinds and the spawn schedule. Spills are a wetness field; crumbs
// are particles confined to the countertop.
export class MessSystem {
  readonly liquid: Liquid;
  readonly crumbs: CrumbSystem;
  private spawnTimer = 1.0;

  constructor(private layout: Layout, scene: THREE.Scene) {
    this.liquid = new Liquid(layout, scene);
    this.crumbs = new CrumbSystem(layout, scene, 0);
  }

  private spawnScheduled(): void {
    if (Math.random() < config.mess.spillShare) {
      // spills can land on the counter or a wall (a splash) — weighted to counter
      const roll = Math.random();
      const si = roll < 0.7 ? 0 : roll < 0.85 ? 1 : 2;
      const s = this.layout.surfaces[si];
      const margin = 6;
      const cx = margin + Math.random() * (s.gW - 2 * margin);
      const cy = margin + Math.random() * (s.gH - 2 * margin);
      const r = config.mess.spillMinRadius + Math.random() * (config.mess.spillMaxRadius - config.mess.spillMinRadius);
      this.liquid.stamp(si, cx, cy, r, config.mess.spillAmount);
    } else {
      // crumbs only ever land on the countertop
      const c = this.layout.surfaces[0];
      const margin = 6;
      const cx = margin + Math.random() * (c.gW - 2 * margin);
      const cy = margin + Math.random() * (c.gH - 2 * margin);
      const n = Math.round(config.mess.crumbMinCount + Math.random() * (config.mess.crumbMaxCount - config.mess.crumbMinCount));
      this.crumbs.spawnCluster(cx, cy, n, config.mess.crumbSpread / config.world.cellSize);
    }
  }

  activeFoodCount(): number {
    return this.liquid.foodAmount() * 1.5 + this.crumbs.foodAmount();
  }

  randomFoodSurface(): number | null {
    const wet: number[] = [];
    this.liquid.wetSurfaces(wet);
    if (this.crumbs.foodAmount() > 0) wet.push(0);
    if (!wet.length) return null;
    return wet[Math.floor(Math.random() * wet.length)];
  }

  update(dt: number, field: Field): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer += config.mess.spawnInterval;
      this.spawnScheduled();
    }
    this.liquid.update(dt, field);
    this.crumbs.update(dt, field);
  }

  syncInstances(): void {
    this.crumbs.syncInstances();
  }
}
