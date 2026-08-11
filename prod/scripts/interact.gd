class_name Interactions
extends RefCounted
## Applies the current tool along a stroke segment (a click is a zero-length one).
## cloth -> liquid only; broom -> crumbs only; spray -> ants + no-food + sheen.
## Ports interact.ts.

var layout: Dictionary
var field: Field
var messes: MessSystem
var ants: Ants

func _init(_layout: Dictionary, _field: Field, _messes: MessSystem, _ants: Ants) -> void:
	layout = _layout
	field = _field
	messes = _messes
	ants = _ants

func apply_segment(tool: String, si: int, ax: float, ay: float, bx: float, by: float, fast: bool, speed: float) -> void:
	var cs: float = Config.world_cell_size
	var w_cells: float = Config.swipe_width / cs
	var w_world: float = Config.swipe_width
	var dx: float = bx - ax
	var dy: float = by - ay
	var seg_len: float = maxf(sqrt(dx * dx + dy * dy), 1e-9)
	if seg_len <= 1e-9:
		seg_len = 1.0
	dx /= seg_len
	dy /= seg_len

	if tool == "spray":
		_spray(si, ax, ay)
		return

	var surf: Surface = layout["surfaces"][si]
	var wdx: float = surf.u.x * dx + surf.v.x * dy
	var wdz: float = surf.u.z * dx + surf.v.z * dy
	var steps: int = maxi(1, int(ceil(seg_len / 2.0)))

	if tool == "cloth":
		for k in range(0, steps + 1):
			var t: float = float(k) / steps
			var cx: float = ax + (bx - ax) * t
			var cy: float = ay + (by - ay) * t
			field.erase(si, cx, cy, Config.swipe_erase_radius / cs)
			ants.scatter(si, cx, cy, Config.swipe_ant_scatter / cs, Config.swipe_ant_kill)
			if fast:
				messes.liquid.smear(si, cx, cy, w_cells, dx, dy, 0.5)
			else:
				messes.liquid.erase(si, cx, cy, w_cells, 0.6)
	else:
		# broom — crumbs only, and only on the counter
		if si != 0:
			return
		var sweep_speed: float = minf(Config.crumb_push, speed)
		for k in range(0, steps + 1):
			var t: float = float(k) / steps
			var cx: float = ax + (bx - ax) * t
			var cy: float = ay + (by - ay) * t
			var wp: Vector3 = surf.to_world(cx, cy)
			messes.crumbs.sweep(wp.x, wp.z, w_world, wdx, wdz, sweep_speed)

func _spray(si: int, ax: float, ay: float) -> void:
	var cs: float = Config.world_cell_size
	var rng: float = Config.spray_range / cs
	for f in Geom.disc_footprints(layout, si, ax, ay, rng):
		var fs: int = f["s"]
		var fcx: float = f["cx"]
		var fcy: float = f["cy"]
		ants.spray_disc(fs, fcx, fcy, rng, Config.spray_kill_prob)
		messes.liquid.stamp_spray(fs, fcx, fcy, rng)
		var r: int = int(ceil(rng))
		var cxr: int = int(round(fcx))
		var cyr: int = int(round(fcy))
		for y in range(cyr - r, cyr + r + 1):
			for x in range(cxr - r, cxr + r + 1):
				var dx: float = x - fcx
				var dy: float = y - fcy
				if dx * dx + dy * dy <= rng * rng:
					field.mark_no_food(fs, x, y, Config.spray_no_food_time)
