import { config } from './config';
import { Layout, Surface, Edge } from './surfaces';

export interface CrossResult {
  s: number;
  cx: number;
  cy: number;
  inward: number; // heading (radians, cell space) pointing into the new surface
}

export interface Footprint {
  s: number;
  cx: number; // disc centre in this surface's cell space (may sit just past an edge)
  cy: number;
}

// A disc of `range` cells centred at (ax,ay) on surface `si`, plus — for every
// seam the disc spills over — the SAME disc re-centred on the neighbour via a
// virtual centre just past the shared edge. This unfolds the footprint around a
// corner without ever needing a two-edge (3-way) hop: each neighbour is reached
// through its own seam independently, so the 3-surface corner is just two spills.
export function discFootprints(layout: Layout, si: number, ax: number, ay: number, range: number): Footprint[] {
  const out: Footprint[] = [{ s: si, cx: ax, cy: ay }];
  const s = layout.surfaces[si];
  for (const seam of layout.seams) {
    let E: Edge, nb: number, Eb: Edge;
    if (seam.a === si) { E = seam.ea; nb = seam.b; Eb = seam.eb; }
    else if (seam.b === si) { E = seam.eb; nb = seam.a; Eb = seam.ea; }
    else continue;

    let p: number, t: number, freeLen: number;
    if (E === 'y0') { p = ay; t = ax; freeLen = s.gW; }
    else if (E === 'y1') { p = s.gH - ay; t = ax; freeLen = s.gW; }
    else if (E === 'x0') { p = ax; t = ay; freeLen = s.gH; }
    else { p = s.gW - ax; t = ay; freeLen = s.gH; }
    if (p >= range) continue; // the disc never reaches this edge

    const a = seam.flip ? freeLen - t : t;
    const nbS = layout.surfaces[nb];
    let vcx: number, vcy: number;
    if (Eb === 'y0') { vcx = a; vcy = -p; }
    else if (Eb === 'y1') { vcx = a; vcy = nbS.gH + p; }
    else if (Eb === 'x0') { vcx = -p; vcy = a; }
    else { vcx = nbS.gW + p; vcy = a; }
    out.push({ s: nb, cx: vcx, cy: vcy });
  }
  return out;
}

// If (cx,cy) is just outside a surface across a seam, map it onto the neighbour.
// Returns null if the overflow edge has no seam. Shared edges have equal cell
// counts, so the along-edge coordinate maps 1:1 (this "unfolds" the corner).
export function mapAcross(
  layout: Layout,
  surfIdx: number,
  cx: number,
  cy: number,
): CrossResult | null {
  const s = layout.surfaces[surfIdx];

  // pick the edge with the largest overflow (handles corners gracefully)
  let edge: Edge | null = null;
  let along = 0;
  let over = 0;
  const overs: [Edge, number, number][] = [
    ['y1', cy - s.gH, cx],
    ['y0', -cy, cx],
    ['x1', cx - s.gW, cy],
    ['x0', -cx, cy],
  ];
  for (const [e, o, a] of overs) {
    if (o > over) { over = o; edge = e; along = a; }
  }
  if (!edge) return null;

  // length of the edge we are leaving, in cells (along runs 0..freeLen)
  const freeLen = edge === 'y0' || edge === 'y1' ? s.gW : s.gH;

  for (const seam of layout.seams) {
    let nb: Surface | null = null;
    let ne: Edge | null = null;
    if (seam.a === surfIdx && seam.ea === edge) { nb = layout.surfaces[seam.b]; ne = seam.eb; }
    else if (seam.b === surfIdx && seam.eb === edge) { nb = layout.surfaces[seam.a]; ne = seam.ea; }
    if (!nb || !ne) continue;

    const a = seam.flip ? freeLen - along : along;
    switch (ne) {
      case 'y0': return { s: nb.index, cx: a, cy: over, inward: Math.PI / 2 };
      case 'y1': return { s: nb.index, cx: a, cy: nb.gH - over, inward: -Math.PI / 2 };
      case 'x0': return { s: nb.index, cx: over, cy: a, inward: 0 };
      case 'x1': return { s: nb.index, cx: nb.gW - over, cy: a, inward: Math.PI };
    }
  }
  return null;
}

// Pheromone + no-food state for every surface, plus seam-aware sampling.
export class Field {
  readonly grids: Float32Array[] = [];
  readonly noFood: Float32Array[] = []; // seconds remaining a cell repels ants
  private readonly tmp: Float32Array[] = [];

  constructor(private layout: Layout) {
    for (const s of layout.surfaces) {
      const n = s.gW * s.gH;
      this.grids.push(new Float32Array(n));
      this.noFood.push(new Float32Array(n));
      this.tmp.push(new Float32Array(n));
    }
  }

  idx(s: Surface, cx: number, cy: number): number {
    const gx = Math.min(s.gW - 1, Math.max(0, Math.floor(cx)));
    const gy = Math.min(s.gH - 1, Math.max(0, Math.floor(cy)));
    return gy * s.gW + gx;
  }

  // seam-aware read: samples the neighbour surface when the point sits just past
  // an edge, so gradients (and therefore trails) are continuous across corners.
  sample(surfIdx: number, cx: number, cy: number): number {
    const s = this.layout.surfaces[surfIdx];
    if (cx >= 0 && cx < s.gW && cy >= 0 && cy < s.gH) {
      return this.grids[surfIdx][this.idx(s, cx, cy)];
    }
    const c = mapAcross(this.layout, surfIdx, cx, cy);
    if (!c) return 0;
    const ns = this.layout.surfaces[c.s];
    if (c.cx < 0 || c.cx >= ns.gW || c.cy < 0 || c.cy >= ns.gH) return 0;
    return this.grids[c.s][this.idx(ns, c.cx, c.cy)];
  }

  deposit(surfIdx: number, cx: number, cy: number, amount: number): void {
    const s = this.layout.surfaces[surfIdx];
    if (cx < 0 || cx >= s.gW || cy < 0 || cy >= s.gH) return;
    const i = this.idx(s, cx, cy);
    this.grids[surfIdx][i] = Math.min(config.pheromone.max, this.grids[surfIdx][i] + amount);
  }

  noFoodAt(surfIdx: number, cx: number, cy: number): boolean {
    const s = this.layout.surfaces[surfIdx];
    if (cx < 0 || cx >= s.gW || cy < 0 || cy >= s.gH) return false;
    return this.noFood[surfIdx][this.idx(s, cx, cy)] > 0;
  }

  markNoFood(surfIdx: number, cx: number, cy: number, seconds: number): void {
    const s = this.layout.surfaces[surfIdx];
    if (cx < 0 || cx >= s.gW || cy < 0 || cy >= s.gH) return;
    const i = this.idx(s, cx, cy);
    this.noFood[surfIdx][i] = Math.max(this.noFood[surfIdx][i], seconds);
  }

  // erase pheromone in a world-radius disc (the wet cloth "обнуляет участок массива")
  erase(surfIdx: number, cx: number, cy: number, radiusCells: number): void {
    const s = this.layout.surfaces[surfIdx];
    const r = Math.ceil(radiusCells);
    const gx = Math.round(cx), gy = Math.round(cy);
    for (let y = gy - r; y <= gy + r; y++) {
      if (y < 0 || y >= s.gH) continue;
      for (let x = gx - r; x <= gx + r; x++) {
        if (x < 0 || x >= s.gW) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= radiusCells * radiusCells) this.grids[surfIdx][y * s.gW + x] = 0;
      }
    }
  }

  step(dt: number): void {
    const evap = Math.exp(-config.pheromone.evaporation * dt);
    const diff = config.pheromone.diffusion;
    for (let si = 0; si < this.layout.surfaces.length; si++) {
      const s = this.layout.surfaces[si];
      const g = this.grids[si];
      const nf = this.noFood[si];
      const t = this.tmp[si];
      const gW = s.gW, gH = s.gH;

      // decay pheromone + tick down no-food timers
      for (let i = 0; i < g.length; i++) {
        g[i] *= evap;
        if (nf[i] > 0) nf[i] = Math.max(0, nf[i] - dt);
      }

      // light 4-neighbour diffusion so trails gain width (into tmp, then swap)
      if (diff > 0) {
        for (let y = 0; y < gH; y++) {
          for (let x = 0; x < gW; x++) {
            const i = y * gW + x;
            const l = x > 0 ? g[i - 1] : g[i];
            const r = x < gW - 1 ? g[i + 1] : g[i];
            const u = y > 0 ? g[i - gW] : g[i];
            const d = y < gH - 1 ? g[i + gW] : g[i];
            t[i] = g[i] + diff * ((l + r + u + d) * 0.25 - g[i]);
          }
        }
        g.set(t);
      }
    }
  }
}
