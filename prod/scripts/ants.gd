class_name Ants
extends RefCounted
## Pheromone-following ants (no pathfinding): sense the gradient, steer, deposit.
## Seam-crossing, soft population cap + rate-limited influx, spray/wipe culling.
## Drawn with a MultiMesh, always on top. Ports ants.ts.

var layout: Dictionary
var cap: int
var surface: PackedInt32Array
var cx: PackedFloat32Array
var cy: PackedFloat32Array
var heading: PackedFloat32Array
var alive: PackedByteArray
var count: int = 0
var _free: Array[int] = []
var _influx_acc: float = 0.0
var _live: int = 0

var mm: MultiMesh

func _init(_layout: Dictionary, parent: Node3D) -> void:
	layout = _layout
	cap = Config.ant_max
	surface = PackedInt32Array(); surface.resize(cap)
	cx = PackedFloat32Array(); cx.resize(cap)
	cy = PackedFloat32Array(); cy.resize(cap)
	heading = PackedFloat32Array(); heading.resize(cap)
	alive = PackedByteArray(); alive.resize(cap)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color8(0x2b, 0x17, 0x0d)   # dark reddish-brown, lit
	mat.roughness = 0.5
	mat.metallic = 0.0
	var ant_mesh := _build_ant_mesh()
	ant_mesh.surface_set_material(0, mat)

	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = ant_mesh
	mm.instance_count = cap
	mm.visible_instance_count = 0   # MultiMesh renders ALL instances otherwise
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mmi)

# A small ant built from 3 body ellipsoids + 6 fanned legs + 2 antennae, merged
# into one mesh. Local axes: +Z forward (head), +Y up (surface normal), +X right.
func _build_ant_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	# low-poly on purpose: ants are ~15 px on screen, so sub-pixel triangles are
	# pure fill-rate waste. Coarse spheres + single-segment legs keep the silhouette.
	var sph := SphereMesh.new()
	sph.radius = 1.0
	sph.height = 2.0
	sph.radial_segments = 5
	sph.rings = 3
	var ubox := BoxMesh.new()
	ubox.size = Vector3(1, 1, 1)

	var by: float = 0.03   # body height above the feet
	# gaster (rear, largest), thorax (mid), head (front)
	st.append_from(sph, 0, Transform3D(Basis.from_scale(Vector3(0.033, 0.030, 0.052)), Vector3(0, by, -0.062)))
	st.append_from(sph, 0, Transform3D(Basis.from_scale(Vector3(0.020, 0.020, 0.032)), Vector3(0, by, 0.0)))
	st.append_from(sph, 0, Transform3D(Basis.from_scale(Vector3(0.028, 0.026, 0.028)), Vector3(0, by + 0.002, 0.056)))

	# 6 legs (3 per side), fanned front/mid/back, one segment each
	var rows := [Vector2(0.028, 0.075), Vector2(0.0, 0.0), Vector2(-0.024, -0.066)]
	for side in [-1.0, 1.0]:
		for r in rows:
			var attach := Vector3(side * 0.015, by - 0.003, r.x)
			var foot := Vector3(side * 0.07, 0.0, r.y)
			_bar(st, ubox, attach, foot, 0.005)
	# antennae from the head, forward and up
	for side in [-1.0, 1.0]:
		_bar(st, ubox, Vector3(side * 0.008, by + 0.012, 0.072), Vector3(side * 0.03, by + 0.03, 0.115), 0.004)

	st.generate_normals()
	return st.commit()

# append a thin box spanning `from`..`to` with square cross-section `th`
func _bar(st: SurfaceTool, ubox: BoxMesh, from: Vector3, to: Vector3, th: float) -> void:
	var dir := to - from
	var l := dir.length()
	if l < 1e-5:
		return
	dir /= l
	var up := Vector3.UP
	if absf(dir.dot(up)) > 0.95:
		up = Vector3.RIGHT
	var p1 := dir.cross(up).normalized()
	var p2 := dir.cross(p1).normalized()
	var b := Basis(dir * l, p1 * th, p2 * th)
	st.append_from(ubox, 0, Transform3D(b, (from + to) * 0.5))

func _alloc() -> int:
	if _free.size() > 0:
		return _free.pop_back()
	if count < cap:
		var i := count
		count += 1
		return i
	return -1

func _kill(i: int) -> void:
	if alive[i] == 0:
		return
	alive[i] = 0
	_live -= 1
	_free.append(i)

func alive_count() -> int:
	var n := 0
	for i in count:
		n += alive[i]
	return n

func _spawn_on_edge(si: int) -> void:
	if _live >= Config.ant_target:
		return
	var i := _alloc()
	if i < 0:
		return
	var s: Surface = layout["surfaces"][si]
	var r: float = randf()
	var along: float = randf()
	var ncx: float; var ncy: float; var h: float
	if r < 0.25:
		ncx = along * s.gW; ncy = 0; h = PI / 2.0
	elif r < 0.5:
		ncx = along * s.gW; ncy = s.gH; h = -PI / 2.0
	elif r < 0.75:
		ncx = 0; ncy = along * s.gH; h = 0.0
	else:
		ncx = s.gW; ncy = along * s.gH; h = PI
	surface[i] = si
	cx[i] = ncx
	cy[i] = ncy
	heading[i] = h + (randf() - 0.5) * 0.6
	alive[i] = 1
	_live += 1

func _influx(dt: float, messes) -> void:
	if _live >= Config.ant_target:
		return
	var rate: float = minf(Config.ant_max_influx_rate, messes.active_food_count() * Config.ant_influx_per_food)
	_influx_acc = minf(3.0, _influx_acc + rate * dt)
	while _influx_acc >= 1.0:
		_influx_acc -= 1.0
		var si: int = messes.random_food_surface()
		if si < 0:
			break
		_spawn_on_edge(si)

func _sense(field: Field, si: int, x: float, y: float) -> float:
	var v: float = field.sample(si, x, y)
	if field.no_food_at(si, x, y):
		v -= 40.0
	return v

func update(dt: float, field: Field, messes) -> void:
	_influx(dt, messes)
	var speed_cells: float = Config.ant_speed / Config.world_cell_size
	var sd: float = Config.ant_sensor_dist
	var sa: float = Config.ant_sensor_angle
	var noise: float = Config.ant_noise
	var turn: float = Config.ant_turn_rate

	for i in count:
		if alive[i] == 0:
			continue
		var si: int = surface[i]
		var h: float = heading[i]
		var x: float = cx[i]
		var y: float = cy[i]

		var F: float = _sense(field, si, x + cos(h) * sd, y + sin(h) * sd)
		var L: float = _sense(field, si, x + cos(h + sa) * sd, y + sin(h + sa) * sd)
		var R: float = _sense(field, si, x + cos(h - sa) * sd, y + sin(h - sa) * sd)

		var nh: float = h
		if F >= L and F >= R:
			pass
		elif L > R:
			nh += turn * dt
		else:
			nh -= turn * dt
		nh += (randf() - 0.5) * noise
		heading[i] = nh

		var ncx: float = x + cos(nh) * speed_cells * dt
		var ncy: float = y + sin(nh) * speed_cells * dt
		var s: Surface = layout["surfaces"][si]

		if ncx < 0 or ncx >= s.gW or ncy < 0 or ncy >= s.gH:
			var c: Dictionary = Geom.map_across(layout, si, ncx, ncy)
			if not c.is_empty():
				var ns: Surface = layout["surfaces"][c["s"]]
				surface[i] = c["s"]
				cx[i] = clampf(c["cx"], 0.0, ns.gW - 0.01)
				cy[i] = clampf(c["cy"], 0.0, ns.gH - 0.01)
				heading[i] = c["inward"] + (randf() - 0.5) * 0.5
			elif randf() < Config.ant_leave_chance * dt:
				_kill(i)
				continue
			else:
				heading[i] = nh + PI
				cx[i] = clampf(ncx, 0.0, s.gW - 0.01)
				cy[i] = clampf(ncy, 0.0, s.gH - 0.01)
		else:
			cx[i] = ncx
			cy[i] = ncy

		field.deposit(surface[i], cx[i], cy[i], Config.ph_ant_deposit * dt)

# wipe scatter: kill a fraction, push survivors away from the stroke
func scatter(si: int, ax: float, ay: float, radius_cells: float, kill_frac: float) -> void:
	var r2: float = radius_cells * radius_cells
	for i in count:
		if alive[i] == 0 or surface[i] != si:
			continue
		var dx: float = cx[i] - ax
		var dy: float = cy[i] - ay
		if dx * dx + dy * dy > r2:
			continue
		if randf() < kill_frac:
			_kill(i)
			continue
		heading[i] = atan2(dy, dx)

# spray disc: kill ants inside, scatter survivors outward
func spray_disc(si: int, ax: float, ay: float, radius_cells: float, kill_prob: float) -> void:
	var r2: float = radius_cells * radius_cells
	for i in count:
		if alive[i] == 0 or surface[i] != si:
			continue
		var dx: float = cx[i] - ax
		var dy: float = cy[i] - ay
		var d2: float = dx * dx + dy * dy
		if d2 > r2 or d2 < 1e-6:
			continue
		if randf() < kill_prob:
			_kill(i)
		else:
			heading[i] = atan2(dy, dx)

func sync_instances() -> void:
	for i in count:
		if alive[i] == 0:
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))
			continue
		var s: Surface = layout["surfaces"][surface[i]]
		var h: float = heading[i]
		var fwd: Vector3 = (s.u * cos(h) + s.v * sin(h)).normalized()
		var up: Vector3 = s.normal
		var right: Vector3 = up.cross(fwd).normalized()
		var pos: Vector3 = s.to_world(cx[i], cy[i]) + s.normal * 0.015
		mm.set_instance_transform(i, Transform3D(Basis(right, up, fwd), pos))
	mm.visible_instance_count = count
