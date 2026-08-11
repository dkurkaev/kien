# CLAUDE.md — Kiến (Godot 4 port)

Guidance for AI/coding agents working in this project (`prod/`). Read `docs.md` for
the architecture. This file is about **how to work here** and the conventions the
project owner insists on.

## What this is
"Kiến" — a browser-prototype kitchen-ants game ported to **Godot 4.7 (GDScript)**.
Ants swarm a Vietnamese kitchen counter; the player cleans with three tools
(cloth / spray / broom). The original Three.js prototype lives in `../prototype/`.

## Running & verifying
- Engine: Godot 4.7.x. On this machine: `/Users/dkurkaev/Downloads/Godot.app/Contents/MacOS/Godot`.
- Run the game: `godot --path . ` (main scene is `main.tscn` → `scripts/game.gd`).
- **Always import first after edits:** `godot --headless --import`.
- **Error check (headless):** `godot --headless --quit-after 120` and grep the log
  for `SCRIPT ERROR` / `Invalid`. Note: `get_viewport().get_texture()` is null in
  headless, so screenshot code errors there — that's expected, not a real bug.
- **Visual check (real GPU render, Metal, works without a display):**
  `godot --path . --quit-after N --resolution WxH`, with temporary code that calls
  `get_viewport().get_texture().get_image().save_png("/tmp/x.png")` at a chosen
  frame; then read the PNG. `sips` is available for crop/scale.
- **Thermal caveat:** back-to-back 4K renders thermally throttle the M1 — fps
  readings drift wildly (150 → 20). Cool down (~60–90 s) between fps measurements,
  and compare *relative* numbers within one run, not across runs.
- Target: **120 fps at 2972×1775** (headroom for future detail).

## Hard rules the owner enforces (learned the hard way this session)
- **Remove every `// TEMP-DEBUG` / screenshot / seed block before finishing.** Grep
  for `TEMP-DEBUG` and `_dbg_frame` and confirm `clean`.
- **Verify visually before claiming something works.** Don't hand-wave. Render it.
- **Tool cursors must NEVER leave the scene AND must have NO dead zones.** The
  solution is `_clamp_footprint()` — clamp the tool centre by the model's *actual
  rotated footprint* (angle-dependent, minimal), not a big fixed margin. A big
  fixed margin = a "dead zone" and gets rejected; zero clamp = clipping through
  walls/floor and gets rejected. Use the footprint.
- **No gratuitous animation.** The broom only *rotates* to face the movement
  direction — no swinging/waving. Tools follow the cursor *smoothly* (eased
  position + angle in `_process`), never jittery.
- **Models must be genuinely volumetric / on-style**, not flat cards. Match the
  scene's look (procedural shaded materials, real depth).
- **Heatmap (H) must be smooth gradients, not hard borders.** The pheromone field
  is what ants actually sense; sharp liquid-shaped stamps are wrong. Keep field
  diffusion high enough for a gradient and deposit food as a soft source.
- Backend/data model changes (if any server work appears) must be proposed before
  writing. All the current work is client-side GDScript.

## GDScript gotchas that bit us
- `PackedFloat32Array` / `PackedByteArray` are **copy-on-write value types**.
  Aliasing into a local and mutating does NOT write back — after mutating a local
  `g`, assign it back: `wet[si] = g` / `grids[si] = g`.
- `MultiMeshInstance3D` renders *all* `instance_count` instances — set
  `visible_instance_count`, and hide dead instances with a zero-scale transform.
- `SubViewport` shares the parent `World3D` by default — set `own_world_3d = true`
  or its extra lights leak into (and blow out) the main scene. (The spray bottle
  overlay uses an isolated-world SubViewport drawn on top.)
- Fixed-step sim runs in `_physics_process` (60 Hz); instance sync / heatmap / HUD
  in `_process`; input in `_unhandled_input`.

## Git
Repo: https://github.com/dkurkaev/kien (contains `prototype/` and `prod/`).
Commit + push only when the owner asks. Co-author trailer is already the norm.
