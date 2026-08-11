class_name CrumbSystem
extends RefCounted
## Crumb particles on the countertop with real physics: broom imparts momentum
## (coupled, not teleport), friction + static stop, sideways fan, gravity off the
## open edges, vanish below the table. Drawn with a MultiMesh. Ports crumbs.ts.

const ON_COUNTER: int = 0
const AIRBORNE: int = 1

var layout: Dictionary
var counter: int
var cap: int
var px: PackedFloat32Array
var py: PackedFloat32Array
var pz: PackedFloat32Array
var vx: PackedFloat32Array
var vy: PackedFloat32Array
var vz: PackedFloat32Array
var spin: PackedFloat32Array
var spin_v: PackedFloat32Array
var size: PackedFloat32Array
var fri_mul: PackedFloat32Array
var state: PackedByteArray
var alive: PackedByteArray
var count: int = 0
var _free: Array[int] = []

var mm: MultiMesh
var _minX: float
var _maxX: float
var _minZ: float
var _maxZ: float
var _topY: float

func _init(_layout: Dictionary, parent: Node3D, counter_index: int = 0) -> void:
	layout = _layout
	counter = counter_index
	cap = Config.crumb_max_total
	px = PackedFloat32Array(); px.resize(cap)
	py = PackedFloat32Array(); py.resize(cap)
	pz = PackedFloat32Array(); pz.resize(cap)
	vx = PackedFloat32Array(); vx.resize(cap)
	vy = PackedFloat32Array(); vy.resize(cap)
	vz = PackedFloat32Array(); vz.resize(cap)
	spin = PackedFloat32Array(); spin.resize(cap)
	spin_v = PackedFloat32Array(); spin_v.resize(cap)
	size = PackedFloat32Array(); size.resize(cap)
	fri_mul = PackedFloat32Array(); fri_mul.resize(cap)
	state = PackedByteArray(); state.resize(cap)
	alive = PackedByteArray(); alive.resize(cap)

	var box := BoxMesh.new()
	box.size = Vector3(1, 0.55, 0.8)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color8(0xca, 0xa1, 0x5e)
	mat.roughness = 1.0
	mat.metallic = 0.0
	box.material = mat

	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = box
	mm.instance_count = cap
	mm.visible_instance_count = 0   # MultiMesh renders ALL instances otherwise
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	parent.add_child(mmi)

	var c: Surface = layout["surfaces"][counter]
	var corners := [c.to_world(0, 0), c.to_world(c.gW, 0), c.to_world(0, c.gH), c.to_world(c.gW, c.gH)]
	_minX = INF; _maxX = -INF; _minZ = INF; _maxZ = -INF
	for v in corners:
		_minX = minf(_minX, v.x); _maxX = maxf(_maxX, v.x)
		_minZ = minf(_minZ, v.z); _maxZ = maxf(_maxZ, v.z)
	_topY = c.origin.y

func _alloc() -> int:
	if _free.size() > 0:
		return _free.pop_back()
	if count < cap:
		var i := count
		count += 1
		return i
	return -1

func _kill(i: int) -> void:
	if alive[i] == 1:
		alive[i] = 0
		_free.append(i)

func alive_count() -> int:
	var n := 0
	for i in count:
		n += alive[i]
	return n

func food_amount() -> float:
	var n := 0
	for i in count:
		if alive[i] == 1 and state[i] == ON_COUNTER:
			n += 1
	return n * 0.06

func state_counts() -> Dictionary:
	var r := {"counter": 0, "air": 0}
	for i in count:
		if alive[i] == 0:
			continue
		if state[i] == ON_COUNTER:
			r["counter"] += 1
		else:
			r["air"] += 1
	return r

func spawn_cluster(ccx: float, ccy: float, n_count: int, spread_cells: float) -> void:
	var c: Surface = layout["surfaces"][counter]
	for _k in n_count:
		var i := _alloc()
		if i < 0:
			return
		var r: float = spread_cells * sqrt(randf())
		var a: float = randf() * TAU
		var cx: float = clampf(ccx + cos(a) * r, 0.5, c.gW - 0.5)
		var cy: float = clampf(ccy + sin(a) * r, 0.5, c.gH - 0.5)
		var wp: Vector3 = c.to_world(cx, cy)
		px[i] = wp.x; py[i] = _topY; pz[i] = wp.z
		vx[i] = 0; vy[i] = 0; vz[i] = 0
		spin[i] = randf() * TAU
		spin_v[i] = 0
		size[i] = Config.crumb_size * (0.6 + 0.8 * randf())
		fri_mul[i] = 0.55 + randf() * 1.1
		state[i] = ON_COUNTER
		alive[i] = 1

# broom: crumbs coupled to the broom's real speed; off-axis ones squirt sideways
func sweep(spx: float, spz: float, radius_world: float, dx: float, dz: float, speed: float) -> void:
	if speed <= 0.02:
		return
	var r: float = radius_world
	var r2: float = r * r
	var perpx: float = -dz
	var perpz: float = dx
	var fan: float = Config.crumb_fan
	var k: float = 0.6
	for i in count:
		if alive[i] == 0 or state[i] != ON_COUNTER:
			continue
		var ox: float = px[i] - spx
		var oz: float = pz[i] - spz
		if ox * ox + oz * oz > r2:
			continue
		var latN: float = (ox * perpx + oz * perpz) / r
		var tvx: float = dx * speed + perpx * latN * speed * fan + (randf() - 0.5) * speed * 0.2
		var tvz: float = dz * speed + perpz * latN * speed * fan + (randf() - 0.5) * speed * 0.2
		vx[i] += (tvx - vx[i]) * k
		vz[i] += (tvz - vz[i]) * k
		spin_v[i] += (latN * 2.0 + (randf() - 0.5)) * speed * 4.0

func update(dt: float, field: Field) -> void:
	var base_fr: float = Config.crumb_friction
	var g: float = Config.crumb_gravity
	var c: Surface = layout["surfaces"][counter]
	var cs: float = Config.world_cell_size

	for i in count:
		if alive[i] == 0:
			continue
		if state[i] == ON_COUNTER:
			var fr: float = exp(-base_fr * fri_mul[i] * dt)
			vx[i] *= fr; vz[i] *= fr; spin_v[i] *= fr
			if vx[i] * vx[i] + vz[i] * vz[i] < 0.0009:
				vx[i] = 0; vz[i] = 0; spin_v[i] *= 0.5
			px[i] += vx[i] * dt; pz[i] += vz[i] * dt
			spin[i] += spin_v[i] * dt
			# +X/+Z sides are walls (pile up); -X/-Z are open (tip off & fall)
			if px[i] > _maxX:
				px[i] = _maxX
				if vx[i] > 0: vx[i] = 0
			if pz[i] > _maxZ:
				pz[i] = _maxZ
				if vz[i] > 0: vz[i] = 0
			if px[i] < _minX or pz[i] < _minZ:
				state[i] = AIRBORNE
				vx[i] *= 0.3; vz[i] *= 0.3; vy[i] = -0.3
			else:
				var d: Vector3 = Vector3(px[i], py[i], pz[i]) - c.origin
				var gx: float = d.dot(c.u)
				var gy: float = d.dot(c.v)
				field.deposit(counter, gx / cs, gy / cs, Config.ph_food_strength * 0.2 * dt)
		else:
			vy[i] -= g * dt
			var drag: float = exp(-1.6 * dt)
			vx[i] *= drag; vz[i] *= drag
			px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt
			spin[i] += spin_v[i] * dt
			if py[i] < _topY - 2.2:
				_kill(i)

func sync_instances() -> void:
	for i in count:
		if alive[i] == 0:
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))
			continue
		var b: Basis
		if state[i] == AIRBORNE:
			var axis := Vector3(cos(spin[i]), 0.3, sin(spin[i])).normalized()
			b = Basis(axis, spin[i])
		else:
			b = Basis(Vector3.UP, spin[i])
		b = b.scaled(Vector3(size[i], size[i], size[i]))
		var pos := Vector3(px[i], py[i] + size[i] * 0.4, pz[i])
		mm.set_instance_transform(i, Transform3D(b, pos))
	mm.visible_instance_count = count
