# Kiến — Architecture & Systems (Godot 4 port)

A kitchen-ants simulation. Ants swarm a counter, drawn to food (spills) and to each
other's pheromone trails; the player cleans with a cloth, a spray, and a broom.
Everything is client-side GDScript + procedural shaders. Entry: `main.tscn` →
`scripts/game.gd`.

## Scene & coordinate model
- **Surfaces** (`scripts/surface.gd`): flat planes that each carry a 2D grid.
  `si == 0` is the **counter/floor**; `si == 1,2` are the two **walls**. A surface
  has `origin, u, v, normal, width, height, gW, gH` and converts continuous **cell
  coords** `(cx∈[0,gW], cy∈[0,gH])` ↔ world via `to_world()` / `from_world()`.
- **Geometry** (`scripts/geom.gd`): `build_layout()` creates the surfaces;
  `disc_footprints()` projects a brush disc across surface seams (corners);
  `map_across()` maps cell coords across an edge to the neighbouring surface so
  gradients/trails stay continuous.
- **Config** (`scripts/config.gd`): autoload singleton `Config`, a flat bag of
  tunables (`world_cell_size`, `ph_*`, `ant_*`, `spill_*`, `crumb_*`, `swipe_*`,
  `spray_*`). The tuning panel binds sliders to these by property name.

## Controller — `scripts/game.gd`
Builds the world (environment, sun, decor, surfaces, tool cursors) and runs the loop:
- `_physics_process` (60 Hz): `tools.update`, `messes.update`, `ants.update`,
  `field.step`.
- `_process`: sync MultiMesh instances, update heatmap, drive the tool-cursor
  follow, HUD stats.
- Ortho camera; mouse-wheel zoom scales `camera.size` (`_zoom`, clamped 5..30).

## Pheromone field — `scripts/field.gd`
One scalar field per surface (`grids`) plus a `no_food` timer field (sprayed cells
that repel ants / suppress food). Per step:
- **evaporate**: `g *= exp(-ph_evaporation*dt)`,
- **diffuse**: one Jacobi blend `g += ph_diffusion*(avg4 - g)` — this is what turns
  point/area sources into the **gradients** ants follow. `ph_diffusion` is kept high
  enough (0.22) that food/liquid reads as a soft gradient, not a hard stamp.
- `deposit/sample` are seam-aware across surface edges.

## Ants — `scripts/ants.gd`
`MultiMeshInstance3D` of a procedurally-built ant mesh (SurfaceTool: ellipsoid body
segments + boxed legs/antennae). Ants sense the field gradient, steer toward it,
deposit trail pheromone, and are born/removed by the population/influx model driven
by available food.

## Messes — `scripts/messes.gd`
Container for the two mess types:
- **Liquid** (`scripts/liquid.gd`): spills + spray sheen as high-res per-surface
  fields (`wet`, `spray` at `LIQ=3` sub-cells). The CPU keeps the raw fields and
  uploads a dirty-rect **RG8 texture**; the smoothstep/noise/colour compositing +
  meniscus/ripple lighting runs in `shaders/spill.gdshader` (shaded, glossy). Key ops:
  `stamp` (organic lobed spill), `stamp_spray`, `erase` (cloth clean),
  `smear` (**forward-scatter advection with bilinear splat** — drags liquid into a
  smooth streak, no grid-cell jumps). Wet cells radiate **food** into the pheromone
  field as a *soft* source (fine-cell average per coarse cell → smooth edge).
- **Crumbs** (`scripts/crumbs.gd`): bread crumbs with real physics (gravity,
  friction, broom sweep with inertia), on the counter; fall off the edge and vanish.

## Tools & interaction
- **Tool manager** (`scripts/tools.gd`): `current` ∈ {cloth, spray, broom} with a
  short switch lockout.
- **Interactions** (`scripts/interact.gd`): `apply_segment(tool, si, a→b, fast, speed)`.
  - *cloth*: liquid only. Smooth speed blend — fast strokes **smear** (drag), slow
    strokes **erase** (clean); also scatters ants.
  - *spray*: kills/repels ants in a disc, marks `no_food`, lays spray sheen.
  - *broom*: crumbs only, counter only; sweeps with broom inertia.

### Tool cursors (in `game.gd`)
Each tool shows a 3D model that follows the pointer:
- **cloth → sponge**: two-layer procedural sponge (`shaders/sponge.gdshader`), lies
  flat on the surface, long axis rotates to the wipe heading.
- **spray → bottle**: a trigger spray bottle built from primitives, rendered in an
  **isolated-world `SubViewport` composited on top** so it never clips the scene;
  it tracks the cursor with a **fixed** upright pose, and `CPUParticles3D` **foam**
  sprays down into the action disc while held. The flat projection disc stays.
- **broom → bamboo brush**: flat bamboo paddle + light bristles
  (`shaders/broom_wrap.gdshader` for the handle wrap), stands **vertically** on the
  counter, only rotates to face the sweep direction (no swing), counter-only.

Shared cursor logic:
- `_pick_for_cursor()`: like `_pick()` but **never empty** — projects onto the
  nearest valid surface and clamps to its bounds, so a tool never disappears when
  the pointer leaves the scene (broom restricted to the counter).
- `_clamp_footprint()`: clamps the tool centre by the model's **actual rotated
  footprint** so the whole model stays on-surface (no clipping through walls/floor)
  with a minimal, angle-dependent margin (no dead zone).
- Smoothed follow: `_tool_*` targets eased toward the cursor in `_process` (no
  jitter); model re-shown immediately on a tool switch (`_prev_tool` / `_last_screen`).

## Rendering / shaders (`shaders/`)
- `marble.gdshader`, `tile.gdshader` — procedural shaded counter (white marble) and
  ceramic-tile walls.
- `spill.gdshader` — glossy wet-liquid overlay (meniscus/ripple normal, fresnel,
  sun glint, 3×3 field blur so edges are smooth curves, not grid facets).
- `sponge.gdshader`, `broom_wrap.gdshader` — tool materials.
- `liquid.gdshader` — the **heatmap** overlay: straight RGBA from the field texture
  with a 3×3 blur. `cursor.gdshader` — the flat brush/spray disc.
- Environment: single `DirectionalLight3D` sun, half-res SSAO, filmic tonemap.

## Debug / visualisation
- **H** — toggle the pheromone **heatmap** (vivid green→yellow→red trail strength,
  smooth alpha, blurred; the sprayed `no_food` field is intentionally *not* shown).
- **G** — toggle the tuning panel (`scripts/hud.gd`).
- **1 / 2 / 3** — select cloth / spray / broom. **Mouse wheel** — zoom.
- LMB (hold + drag) applies the current tool.

## Layout
```
prod/
  main.tscn            entry scene
  project.godot        Config autoload, rendering settings
  scripts/             config, surface, geom, field, ants, messes,
                       liquid, crumbs, tools, interact, hud, game
  shaders/             marble, tile, spill, sponge, broom_wrap, liquid, cursor
```
