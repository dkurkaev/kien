import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Field } from './field';

// Render resolution multiplier over the simulation grid. The sim (pheromone/ants)
// stays at 0.125 m cells, but spills/spray are drawn on a grid this many times
// finer so the edges are crisp, not blocky.
const LIQ = 4;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Coherent value-noise field (~-1..1): random at a coarse lattice, bilinearly
// upsampled — smooth wobble used to make spill/wipe edges irregular, not perfect.
function buildNoise(fw: number, fh: number): Float32Array {
  const cw = Math.max(3, Math.round(fw / 9)), ch = Math.max(3, Math.round(fh / 9));
  const coarse = new Float32Array(cw * ch);
  for (let i = 0; i < coarse.length; i++) coarse[i] = Math.random() * 2 - 1;
  const out = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    const gy = (y / fh) * (ch - 1), y0 = Math.floor(gy), fy = gy - y0, y1 = Math.min(ch - 1, y0 + 1);
    for (let x = 0; x < fw; x++) {
      const gx = (x / fw) * (cw - 1), x0 = Math.floor(gx), fx = gx - x0, x1 = Math.min(cw - 1, x0 + 1);
      const a = coarse[y0 * cw + x0], b = coarse[y0 * cw + x1], c = coarse[y1 * cw + x0], d = coarse[y1 * cw + x1];
      const top = a + (b - a) * fx, bot = c + (d - c) * fx;
      out[y * fw + x] = top + (bot - top) * fy;
    }
  }
  return out;
}

// Spills + spray sheen as high-res per-surface FIELDS. The cloth erases/advects
// the wet field where it passes; spray stamps a repellent sheen that fades. Both
// render as a DataTexture on the surface plane (clipped to bounds, crisp edges).
export class Liquid {
  private wet: Float32Array[] = [];   // fine grid, spills
  private spray: Float32Array[] = []; // fine grid, sprayed sheen (fades)
  private noise: Float32Array[] = []; // static coherent noise, breaks up edges
  private tex: THREE.DataTexture[] = [];
  private data: Uint8Array[] = [];
  private fgW: number[] = [];
  private fgH: number[] = [];
  private scratch = new THREE.Vector3();

  constructor(private layout: Layout, scene: THREE.Scene) {
    for (const s of layout.surfaces) {
      const fw = s.gW * LIQ, fh = s.gH * LIQ;
      const n = fw * fh;
      this.fgW.push(fw); this.fgH.push(fh);
      this.wet.push(new Float32Array(n));
      this.spray.push(new Float32Array(n));
      this.noise.push(buildNoise(fw, fh));
      const data = new Uint8Array(n * 4);
      const tex = new THREE.DataTexture(data, fw, fh, THREE.RGBAFormat);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), mat);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.u, s.v, s.normal));
      s.toWorld(s.gW / 2, s.gH / 2, this.scratch).addScaledVector(s.normal, 0.008);
      mesh.position.copy(this.scratch);
      scene.add(mesh);
      this.tex.push(tex);
      this.data.push(data);
    }
  }

  wetAt(si: number, cx: number, cy: number): number {
    const fw = this.fgW[si], fh = this.fgH[si];
    const gx = Math.floor(cx * LIQ), gy = Math.floor(cy * LIQ);
    if (gx < 0 || gx >= fw || gy < 0 || gy >= fh) return 0;
    return this.wet[si][gy * fw + gx];
  }

  // organic spill: overlapping gaussian lobes at the fine resolution
  stamp(si: number, cx: number, cy: number, radiusWorld: number, amount: number): void {
    const fw = this.fgW[si], fh = this.fgH[si];
    const g = this.wet[si];
    const fcx = cx * LIQ, fcy = cy * LIQ;
    const R = radiusWorld / (config.world.cellSize / LIQ); // fine cells
    const lobes = 4 + Math.floor(Math.random() * 4);
    for (let l = 0; l < lobes; l++) {
      const la = Math.random() * Math.PI * 2;
      const ld = Math.random() * R * 0.6;
      const lx = fcx + Math.cos(la) * ld, ly = fcy + Math.sin(la) * ld;
      const lr = R * (0.45 + 0.4 * Math.random());
      const r2 = lr * lr;
      const x0 = Math.max(0, Math.floor(lx - lr)), x1 = Math.min(fw - 1, Math.ceil(lx + lr));
      const y0 = Math.max(0, Math.floor(ly - lr)), y1 = Math.min(fh - 1, Math.ceil(ly + lr));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - lx, dy = y - ly;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const i = y * fw + x;
          g[i] = Math.min(1.6, g[i] + amount * (1 - d2 / r2));
        }
      }
    }
  }

  // spray sheen (fine) — purely visual; fades over noFoodTime
  stampSpray(si: number, cx: number, cy: number, radiusCells: number): void {
    const fw = this.fgW[si], fh = this.fgH[si];
    const g = this.spray[si];
    const fcx = cx * LIQ, fcy = cy * LIQ;
    const R = radiusCells * LIQ, r2 = R * R;
    const x0 = Math.max(0, Math.floor(fcx - R)), x1 = Math.min(fw - 1, Math.ceil(fcx + R));
    const y0 = Math.max(0, Math.floor(fcy - R)), y1 = Math.min(fh - 1, Math.ceil(fcy + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - fcx, dy = y - fcy;
        if (dx * dx + dy * dy > r2) continue;
        g[y * fw + x] = 1;
      }
    }
  }

  private discCells(si: number, cx: number, cy: number, radiusCells: number, fn: (i: number) => void): void {
    const fw = this.fgW[si], fh = this.fgH[si];
    const fcx = cx * LIQ, fcy = cy * LIQ, R = radiusCells * LIQ, r2 = R * R;
    const x0 = Math.max(0, Math.floor(fcx - R)), x1 = Math.min(fw - 1, Math.ceil(fcx + R));
    const y0 = Math.max(0, Math.floor(fcy - R)), y1 = Math.min(fh - 1, Math.ceil(fcy + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - fcx, dy = y - fcy;
        if (dx * dx + dy * dy <= r2) fn(y * fw + x);
      }
    }
  }

  // cloth wiping the liquid away — subtract with a radial falloff (strong in the
  // middle of the cloth, feathered at its edge) so the cleaned region blends out
  // instead of biting a hard circle.
  erase(si: number, cx: number, cy: number, radiusCells: number, strength: number): void {
    const fw = this.fgW[si], fh = this.fgH[si], g = this.wet[si];
    const fcx = cx * LIQ, fcy = cy * LIQ, R = radiusCells * LIQ, r2 = R * R;
    const x0 = Math.max(0, Math.floor(fcx - R)), x1 = Math.min(fw - 1, Math.ceil(fcx + R));
    const y0 = Math.max(0, Math.floor(fcy - R)), y1 = Math.min(fh - 1, Math.ceil(fcy + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - fcx, dy = y - fcy, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / R; // 1 centre → 0 rim
        const i = y * fw + x;
        g[i] = Math.max(0, g[i] - strength * (0.35 + 0.65 * falloff));
      }
    }
  }

  // fast wipe: drag wetness in the stroke direction (advection = smear streaks)
  smear(si: number, cx: number, cy: number, radiusCells: number, dx: number, dy: number, strength: number): void {
    const fw = this.fgW[si], fh = this.fgH[si];
    const g = this.wet[si];
    const sx = Math.round(dx * LIQ), sy = Math.round(dy * LIQ);
    this.discCells(si, cx, cy, radiusCells, (i) => {
      const tx = (i % fw) + sx, ty = ((i / fw) | 0) + sy;
      if (tx < 0 || tx >= fw || ty < 0 || ty >= fh) return;
      const moved = g[i] * strength;
      g[i] -= moved;
      const j = ty * fw + tx;
      g[j] = Math.min(1.6, g[j] + moved);
    });
  }

  foodAmount(): number {
    let n = 0;
    const cellArea = (config.world.cellSize / LIQ) * (config.world.cellSize / LIQ);
    for (const g of this.wet) for (let i = 0; i < g.length; i++) n += g[i];
    return n * cellArea;
  }

  wetCellCounts(): number[] {
    return this.wet.map((g) => { let n = 0; for (let i = 0; i < g.length; i++) if (g[i] > 0.1) n++; return Math.round(n / (LIQ * LIQ)); });
  }

  wetSurfaces(out: number[]): void {
    for (let si = 0; si < this.wet.length; si++) {
      const g = this.wet[si];
      for (let i = 0; i < g.length; i++) if (g[i] > 0.1) { out.push(si); break; }
    }
  }

  update(dt: number, field: Field): void {
    const sprayDecay = dt / Math.max(0.5, config.spray.noFoodTime);
    for (let si = 0; si < this.layout.surfaces.length; si++) {
      const s = this.layout.surfaces[si];
      const wet = this.wet[si], spr = this.spray[si], noise = this.noise[si];
      const data = this.data[si];
      const fw = this.fgW[si];

      // render pass (fine grid): decay spray + composite the texture. A NARROW
      // alpha threshold (crisp, not soapy) is jittered per-cell by the noise field
      // so both the spill outline and any wiped hole read as an irregular wet edge.
      for (let i = 0; i < wet.length; i++) {
        if (spr[i] > 0) spr[i] = Math.max(0, spr[i] - sprayDecay);
        const nz = noise[i] * 0.16;
        const wv = wet[i] + nz;
        const aWet = smoothstep(0.30, 0.40, wv) * 0.95;          // crisp edge
        // a slightly darker meniscus rim right at the boundary
        const rim = (smoothstep(0.28, 0.36, wv) - smoothstep(0.40, 0.5, wv)) * 0.5;
        const aSpr = smoothstep(0.35, 0.5, spr[i] + nz) * 0.26;
        const a = Math.min(0.97, aWet + aSpr);
        const wetMix = aWet / (aWet + aSpr + 1e-4);
        const rimF = 1 - rim;
        data[i * 4 + 0] = Math.round((42 * rimF) * wetMix + 52 * (1 - wetMix));
        data[i * 4 + 1] = Math.round((28 * rimF) * wetMix + 92 * (1 - wetMix));
        data[i * 4 + 2] = Math.round((16 * rimF) * wetMix + 84 * (1 - wetMix));
        data[i * 4 + 3] = Math.round(a * 255);
      }
      this.tex[si].needsUpdate = true;

      // food radiates from wet cells — sampled at the coarse (sim) resolution
      const half = (LIQ / 2) | 0;
      for (let gy = 0; gy < s.gH; gy++) {
        for (let gx = 0; gx < s.gW; gx++) {
          const fx = gx * LIQ + half, fy = gy * LIQ + half;
          const v = wet[fy * fw + fx];
          if (v > 0.05 && !field.noFoodAt(si, gx, gy)) {
            field.deposit(si, gx, gy, config.pheromone.foodStrength * Math.min(1, v) * 0.05 * dt);
          }
        }
      }
    }
  }
}
