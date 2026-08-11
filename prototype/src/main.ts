import { config } from './config';
import { buildLayout } from './surfaces';
import { Field } from './field';
import { MessSystem } from './messes';
import { Ants } from './ants';
import { ToolManager, TOOLS } from './tools';
import { Interactions } from './interact';
import { InputController } from './input';
import { Stage } from './scene';
import { Hud } from './hud';
import { Debug } from './debug';

const container = document.getElementById('app')!;
const layout = buildLayout();

const stage = new Stage(container, layout);
const field = new Field(layout);
const messes = new MessSystem(layout, stage.scene);
const ants = new Ants(layout, stage.scene);
const tools = new ToolManager();
const interactions = new Interactions(layout, field, messes, ants);
new InputController(container, stage.camera, stage.surfaceMeshes, layout, tools, interactions, stage);
const hud = new Hud(tools);
const debug = new Debug();

// keyboard: tool select, heatmap, tuning panel
window.addEventListener('keydown', (e) => {
  const tool = TOOLS.find((t) => t.key === e.key);
  if (tool) tools.select(tool.id);
  else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') stage.toggleHeatmap();
  else if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') debug.toggle();
});

// fixed-timestep sim, decoupled from render
const step = config.world.fixedStep;
let last = performance.now();
let acc = 0;
let fps = 60;

function stepSim(dt: number): void {
  tools.update(dt);
  messes.update(dt, field);
  ants.update(dt, field, messes);
  field.step(dt);
}

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  fps = fps * 0.9 + (1 / Math.max(1e-3, dt)) * 0.1;

  acc += Math.min(0.1, dt); // clamp to avoid spiral-of-death after a stall
  let guard = 0;
  while (acc >= step && guard++ < 8) {
    stepSim(step);
    acc -= step;
  }

  ants.syncInstances();
  messes.syncInstances();
  stage.updateHeatmap(field);
  hud.update();
  debug.setStats(ants.aliveCount(), messes.crumbs.aliveCount(), fps);
  stage.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// debug hooks (used by scripts/, harmless in the browser)
interface DiagWindow extends Window {
  __diag?: () => unknown;
  __forceMess?: (si: number) => void;
  __project?: (x: number, y: number, z: number) => [number, number];
}
const w = window as DiagWindow;
w.__project = (x, y, z) => stage.projectToScreen(x, y, z);
(w as unknown as { __cursor?: () => unknown }).__cursor = () => stage.cursorInfo();
w.__diag = () => {
  const per = [0, 0, 0];
  for (let i = 0; i < ants.count; i++) if (ants.alive[i]) per[ants.surface[i]]++;
  const nf = field.noFood.map((g) => { let n = 0; for (let i = 0; i < g.length; i++) if (g[i] > 0) n++; return n; });
  return {
    antsPerSurface: per,
    wetCellsPerSurface: messes.liquid.wetCellCounts(),
    crumbs: messes.crumbs.stateCounts(),
    alive: ants.aliveCount(),
    noFoodPerSurface: nf,
  };
};
w.__forceMess = (si: number) => {
  const s = layout.surfaces[si];
  messes.liquid.stamp(si, s.gW / 2, s.gH / 2, 0.6, config.mess.spillAmount);
};
(w as unknown as { __spawnCrumbs?: () => void }).__spawnCrumbs = () => {
  const c = layout.surfaces[0];
  messes.crumbs.spawnCluster(c.gW / 2, c.gH / 2, 25, config.mess.crumbSpread / config.world.cellSize);
};
(w as unknown as { __airStats?: () => unknown }).__airStats = () => {
  const cr = messes.crumbs;
  let n = 0, minPy = 1e9, maxPy = -1e9, maxHoriz = 0;
  for (let i = 0; i < cr.count; i++) {
    if (!cr.alive[i] || cr.state[i] !== 1) continue;
    n++;
    minPy = Math.min(minPy, cr.py[i]); maxPy = Math.max(maxPy, cr.py[i]);
    // horizontal distance outside the counter footprint (X in [-4,4], Z in [-2,2])
    const hx = Math.max(0, Math.abs(cr.px[i]) - 4), hz = Math.max(0, Math.abs(cr.pz[i]) - 2);
    maxHoriz = Math.max(maxHoriz, Math.hypot(hx, hz));
  }
  return n ? { n, minPy: +minPy.toFixed(2), maxPy: +maxPy.toFixed(2), maxHorizOutside: +maxHoriz.toFixed(2) } : { n: 0 };
};
(w as unknown as { __crumbBox?: () => unknown }).__crumbBox = () => {
  const cr = messes.crumbs;
  let n = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < cr.count; i++) {
    if (!cr.alive[i] || cr.state[i] !== 0) continue;
    n++;
    minX = Math.min(minX, cr.px[i]); maxX = Math.max(maxX, cr.px[i]);
    minZ = Math.min(minZ, cr.pz[i]); maxZ = Math.max(maxZ, cr.pz[i]);
  }
  return { n, w: +(maxX - minX).toFixed(2), d: +(maxZ - minZ).toFixed(2), cx: +((minX + maxX) / 2).toFixed(2) };
};
