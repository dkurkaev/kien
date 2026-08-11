class_name Field
extends RefCounted
## Pheromone + no-food state per surface, with seam-aware sampling. Ports field.ts.

var layout: Dictionary
var grids: Array[PackedFloat32Array] = []
var no_food: Array[PackedFloat32Array] = []   # seconds a cell repels ants
var _tmp: Array[PackedFloat32Array] = []

func _init(_layout: Dictionary) -> void:
	layout = _layout
	for s in layout["surfaces"]:
		var n: int = s.gW * s.gH
		var g := PackedFloat32Array(); g.resize(n); grids.append(g)
		var nf := PackedFloat32Array(); nf.resize(n); no_food.append(nf)
		var t := PackedFloat32Array(); t.resize(n); _tmp.append(t)

func idx(s: Surface, cx: float, cy: float) -> int:
	var gx: int = clampi(int(floor(cx)), 0, s.gW - 1)
	var gy: int = clampi(int(floor(cy)), 0, s.gH - 1)
	return gy * s.gW + gx

# seam-aware read so gradients (and trails) stay continuous across corners
func sample(surf_idx: int, cx: float, cy: float) -> float:
	var s: Surface = layout["surfaces"][surf_idx]
	if cx >= 0 and cx < s.gW and cy >= 0 and cy < s.gH:
		return grids[surf_idx][idx(s, cx, cy)]
	var c: Dictionary = Geom.map_across(layout, surf_idx, cx, cy)
	if c.is_empty():
		return 0.0
	var ns: Surface = layout["surfaces"][c["s"]]
	if c["cx"] < 0 or c["cx"] >= ns.gW or c["cy"] < 0 or c["cy"] >= ns.gH:
		return 0.0
	return grids[c["s"]][idx(ns, c["cx"], c["cy"])]

func deposit(surf_idx: int, cx: float, cy: float, amount: float) -> void:
	var s: Surface = layout["surfaces"][surf_idx]
	if cx < 0 or cx >= s.gW or cy < 0 or cy >= s.gH:
		return
	var i: int = idx(s, cx, cy)
	grids[surf_idx][i] = minf(Config.ph_max, grids[surf_idx][i] + amount)

func no_food_at(surf_idx: int, cx: float, cy: float) -> bool:
	var s: Surface = layout["surfaces"][surf_idx]
	if cx < 0 or cx >= s.gW or cy < 0 or cy >= s.gH:
		return false
	return no_food[surf_idx][idx(s, cx, cy)] > 0.0

func mark_no_food(surf_idx: int, cx: float, cy: float, seconds: float) -> void:
	var s: Surface = layout["surfaces"][surf_idx]
	if cx < 0 or cx >= s.gW or cy < 0 or cy >= s.gH:
		return
	var i: int = idx(s, cx, cy)
	no_food[surf_idx][i] = maxf(no_food[surf_idx][i], seconds)

# erase pheromone in a world-radius disc (wet cloth zeroing the trail)
func erase(surf_idx: int, cx: float, cy: float, radius_cells: float) -> void:
	var s: Surface = layout["surfaces"][surf_idx]
	var g: PackedFloat32Array = grids[surf_idx]
	var r: int = int(ceil(radius_cells))
	var gx: int = int(round(cx))
	var gy: int = int(round(cy))
	var r2: float = radius_cells * radius_cells
	for y in range(gy - r, gy + r + 1):
		if y < 0 or y >= s.gH:
			continue
		for x in range(gx - r, gx + r + 1):
			if x < 0 or x >= s.gW:
				continue
			var dx: float = x - cx
			var dy: float = y - cy
			if dx * dx + dy * dy <= r2:
				g[y * s.gW + x] = 0.0
	grids[surf_idx] = g   # write COW local back into the array

func step(dt: float) -> void:
	var evap: float = exp(-Config.ph_evaporation * dt)
	var diff: float = Config.ph_diffusion
	var surfaces: Array = layout["surfaces"]
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var g: PackedFloat32Array = grids[si]
		var nf: PackedFloat32Array = no_food[si]
		var t: PackedFloat32Array = _tmp[si]
		var gW: int = s.gW
		var gH: int = s.gH

		for i in g.size():
			g[i] *= evap
			if nf[i] > 0.0:
				nf[i] = maxf(0.0, nf[i] - dt)

		if diff > 0.0:
			for y in gH:
				for x in gW:
					var i: int = y * gW + x
					var l: float = g[i - 1] if x > 0 else g[i]
					var rr: float = g[i + 1] if x < gW - 1 else g[i]
					var up: float = g[i - gW] if y > 0 else g[i]
					var dn: float = g[i + gW] if y < gH - 1 else g[i]
					t[i] = g[i] + diff * ((l + rr + up + dn) * 0.25 - g[i])
			for i in g.size():
				g[i] = t[i]

		# write the COW locals back into the arrays
		grids[si] = g
		no_food[si] = nf
