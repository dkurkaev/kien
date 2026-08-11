import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Field, discFootprints } from './field';
import { MessSystem } from './messes';
import { Ants } from './ants';
import { ToolId } from './tools';

// Per-stroke state (reserved for once-per-stroke effects; kept for the input API).
export interface Stroke {
  touched: Set<number>;
}

export function newStroke(): Stroke {
  return { touched: new Set() };
}

export class Interactions {
  private scratch = new THREE.Vector3();

  constructor(
    private layout: Layout,
    private field: Field,
    private messes: MessSystem,
    private ants: Ants,
  ) {}

  // Apply the current tool along one stroke segment (a single click is a zero-
  // length segment). fast = quick wipe → SMEARS instead of cleaning.
  applySegment(
    _stroke: Stroke,
    tool: ToolId,
    si: number,
    ax: number, ay: number,
    bx: number, by: number,
    fast: boolean,
    speed: number,
  ): void {
    const cs = config.world.cellSize;
    const wCells = config.swipe.width / cs;
    const wWorld = config.swipe.width;
    let dx = bx - ax, dy = by - ay;
    const segLen = Math.hypot(dx, dy) || 1;
    dx /= segLen; dy /= segLen;

    if (tool === 'spray') {
      this.spray(si, ax, ay); // works on a plain click too
      return;
    }

    const surf = this.layout.surfaces[si];
    // stroke direction in world (in the surface plane)
    const wdx = surf.u.x * dx + surf.v.x * dy;
    const wdz = surf.u.z * dx + surf.v.z * dy;

    const steps = Math.max(1, Math.ceil(segLen / 2));
    const sample = (fn: (cx: number, cy: number, wx: number, wz: number) => void) => {
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
        surf.toWorld(cx, cy, this.scratch);
        fn(cx, cy, this.scratch.x, this.scratch.z);
      }
    };

    if (tool === 'cloth') {
      // cloth is for LIQUID only — it never moves crumbs
      sample((cx, cy) => {
        this.field.erase(si, cx, cy, config.swipe.eraseRadius / cs);
        this.ants.scatter(si, cx, cy, config.swipe.antScatter / cs, config.swipe.antKill);
        if (fast) this.messes.liquid.smear(si, cx, cy, wCells, dx, dy, 0.5); // fast = drag it
        else this.messes.liquid.erase(si, cx, cy, wCells, 0.6);              // slow = wipe it up
      });
    } else {
      // broom is for CRUMBS only — it never touches the liquid. Crumbs move at the
      // broom's own speed (clamped) so they follow wherever you sweep.
      if (si !== 0) return; // crumbs only live on the counter
      const sweepSpeed = Math.min(config.mess.crumbPush, speed);
      sample((_cx, _cy, wx, wz) => this.messes.crumbs.sweep(wx, wz, wWorld, wdx, wdz, sweepSpeed));
    }
  }

  // The spray cone is in the air; where it lands it's a DISC. If aimed near a
  // seam it wraps the corner and lands on every surface it reaches (up to 3).
  private spray(si: number, ax: number, ay: number): void {
    const cs = config.world.cellSize;
    const range = config.spray.range / cs;
    for (const f of discFootprints(this.layout, si, ax, ay, range)) {
      this.ants.sprayDisc(f.s, f.cx, f.cy, range, config.spray.killProb);
      this.messes.liquid.stampSpray(f.s, f.cx, f.cy, range); // crisp visible sheen
      const r = Math.ceil(range);
      for (let y = Math.round(f.cy) - r; y <= Math.round(f.cy) + r; y++) {
        for (let x = Math.round(f.cx) - r; x <= Math.round(f.cx) + r; x++) {
          const dx = x - f.cx, dy = y - f.cy;
          if (dx * dx + dy * dy <= range * range) {
            this.field.markNoFood(f.s, x, y, config.spray.noFoodTime); // gameplay zone (coarse)
          }
        }
      }
    }
  }
}
