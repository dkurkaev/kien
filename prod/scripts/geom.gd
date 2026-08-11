class_name Geom
extends RefCounted
## Layout (surfaces + seams) and the seam maths: map_across (ant/sample crossing)
## and disc_footprints (spray/cursor unfolding around a corner). Ports field.ts.
##
## A "layout" is a Dictionary: { surfaces: Array[Surface], seams: Array[Dictionary] }
## A "seam" is: { a:int, ea:String, b:int, eb:String, flip:bool }  (edges: x0/x1/y0/y1)

static func build_layout() -> Dictionary:
	var X := Vector3(1, 0, 0)
	var Y := Vector3(0, 1, 0)
	var Z := Vector3(0, 0, 1)
	var nX := Vector3(-1, 0, 0)
	var nZ := Vector3(0, 0, -1)

	# Counter: u=+X, v=-Z -> normal +Y (up). Back wall: u=-X, v=+Y -> -Z.
	# Right wall: u=+Z, v=+Y -> -X. All right-handed, facing into the room.
	var counter := Surface.new(0, Vector3(-4, 0, 2), X, nZ, 8.0, 4.0)
	var back_wall := Surface.new(1, Vector3(4, 0, 2), nX, Y, 8.0, 4.0)
	var right_wall := Surface.new(2, Vector3(4, 0, -2), Z, Y, 4.0, 4.0)

	var seams: Array = [
		{"a": 0, "ea": "y0", "b": 1, "eb": "y0", "flip": true},   # counter back <-> back wall bottom
		{"a": 0, "ea": "x1", "b": 2, "eb": "y0", "flip": true},   # counter right <-> right wall bottom
		{"a": 1, "ea": "x0", "b": 2, "eb": "x1", "flip": false},  # wall <-> wall vertical corner
	]
	return {"surfaces": [counter, back_wall, right_wall], "seams": seams}


# A disc of `rng` cells at (ax,ay) on surface si, plus a re-centred copy on every
# neighbour the disc spills onto. Returns Array of { s, cx, cy }.
static func disc_footprints(layout: Dictionary, si: int, ax: float, ay: float, rng: float) -> Array:
	var surfaces: Array = layout["surfaces"]
	var out: Array = [{"s": si, "cx": ax, "cy": ay}]
	var s: Surface = surfaces[si]
	for seam in layout["seams"]:
		var E: String
		var nb: int
		var Eb: String
		if seam["a"] == si:
			E = seam["ea"]; nb = seam["b"]; Eb = seam["eb"]
		elif seam["b"] == si:
			E = seam["eb"]; nb = seam["a"]; Eb = seam["ea"]
		else:
			continue

		var p: float
		var t: float
		var free_len: float
		if E == "y0":
			p = ay; t = ax; free_len = s.gW
		elif E == "y1":
			p = s.gH - ay; t = ax; free_len = s.gW
		elif E == "x0":
			p = ax; t = ay; free_len = s.gH
		else:
			p = s.gW - ax; t = ay; free_len = s.gH
		if p >= rng:
			continue

		var a: float = (free_len - t) if seam["flip"] else t
		var nbS: Surface = surfaces[nb]
		var vcx: float
		var vcy: float
		if Eb == "y0":
			vcx = a; vcy = -p
		elif Eb == "y1":
			vcx = a; vcy = nbS.gH + p
		elif Eb == "x0":
			vcx = -p; vcy = a
		else:
			vcx = nbS.gW + p; vcy = a
		out.append({"s": nb, "cx": vcx, "cy": vcy})
	return out


# If (cx,cy) is just outside a surface across a seam, map it onto the neighbour.
# Returns { s, cx, cy, inward } or an empty Dictionary if no seam on that edge.
static func map_across(layout: Dictionary, surf_idx: int, cx: float, cy: float) -> Dictionary:
	var surfaces: Array = layout["surfaces"]
	var s: Surface = surfaces[surf_idx]

	var edge: String = ""
	var along: float = 0.0
	var over: float = 0.0
	var overs: Array = [
		["y1", cy - s.gH, cx],
		["y0", -cy, cx],
		["x1", cx - s.gW, cy],
		["x0", -cx, cy],
	]
	for o in overs:
		if o[1] > over:
			over = o[1]; edge = o[0]; along = o[2]
	if edge == "":
		return {}

	var free_len: float = s.gW if (edge == "y0" or edge == "y1") else s.gH

	for seam in layout["seams"]:
		var nb: Surface = null
		var ne: String = ""
		if seam["a"] == surf_idx and seam["ea"] == edge:
			nb = surfaces[seam["b"]]; ne = seam["eb"]
		elif seam["b"] == surf_idx and seam["eb"] == edge:
			nb = surfaces[seam["a"]]; ne = seam["ea"]
		if nb == null or ne == "":
			continue

		var a: float = (free_len - along) if seam["flip"] else along
		match ne:
			"y0": return {"s": nb.index, "cx": a, "cy": over, "inward": PI / 2.0}
			"y1": return {"s": nb.index, "cx": a, "cy": nb.gH - over, "inward": -PI / 2.0}
			"x0": return {"s": nb.index, "cx": over, "cy": a, "inward": 0.0}
			"x1": return {"s": nb.index, "cx": nb.gW - over, "cy": a, "inward": PI}
	return {}
