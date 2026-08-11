extends Node3D
## Main controller: builds the world, runs the fixed-step sim, routes pointer input,
## draws the brush cursor and the debug heatmap. Ports scene.ts + main.ts.

const CURSOR_SHADER := preload("res://shaders/cursor.gdshader")
const OVERLAY_SHADER := preload("res://shaders/liquid.gdshader")
const MARBLE_SHADER := preload("res://shaders/marble.gdshader")
const TILE_SHADER := preload("res://shaders/tile.gdshader")
const SPONGE_SHADER := preload("res://shaders/sponge.gdshader")

const SURFACE_COLORS := [Color8(0xcd, 0xbf, 0xa6), Color8(0xe6, 0xdc, 0xc7), Color8(0xd8, 0xcb, 0xb2)]
const TOOL_TINTS := {
	"cloth": Color8(0x5f, 0xb2, 0xff),
	"spray": Color8(0x8b, 0xe0, 0x4a),
	"broom": Color8(0xff, 0xc8, 0x5a),
}
const VIEW_SIZE := 7.2

var layout: Dictionary
var field: Field
var messes: MessSystem
var ants: Ants
var tools: ToolManager
var interactions: Interactions

var camera: Camera3D
var surfaces: Array          # Array[Surface]
var cursor_meshes: Array[MeshInstance3D] = []
var sponge: Node3D           # 3D sponge shown for the cloth tool
var _sponge_angle := 0.0     # heading (rad, in surface u/v) the sponge points along
var spray_bottle: Node3D     # held spray bottle, drawn in an on-top overlay world
var foam: CPUParticles3D     # white foam puff from the nozzle while spraying
var _spray_vp: SubViewport   # overlay viewport so the bottle never clips the scene
var _spray_overlay: SubViewportContainer
var _bottle_rot: Basis       # FIXED bottle orientation (never rotates with the cursor)
var _spraying := false
var heat_meshes: Array[MeshInstance3D] = []
var heat_tex: Array[ImageTexture] = []
var heat_data: Array[PackedByteArray] = []
var heatmap_on := false

var hud: Hud

# input state
var _active := false
var _has_last := false
var _last_si := 0
var _last_cx := 0.0
var _last_cy := 0.0
var _last_world := Vector3.ZERO
var _last_time := 0.0

func _ready() -> void:
	randomize()
	layout = Geom.build_layout()
	surfaces = layout["surfaces"]

	field = Field.new(layout)
	messes = MessSystem.new(layout, self)
	ants = Ants.new(layout, self)
	tools = ToolManager.new()
	interactions = Interactions.new(layout, field, messes, ants)

	_build_environment()
	_build_lights()
	_build_decor()
	_build_surfaces()
	_build_cursor()
	_build_sponge()
	_build_spray_bottle()

	hud = Hud.new(tools)
	add_child(hud)

# ---------------------------------------------------------------- world build

func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color8(0x14, 0x11, 0x0e)
	# soft, single-colour ambient fill so shadowed sides stay readable
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.92, 0.90, 0.85)
	env.ambient_light_energy = 0.32
	# SSAO for contact darkening in the corner (half-res / low quality — cheap at 4K)
	env.ssao_enabled = true
	env.ssao_radius = 0.5
	env.ssao_intensity = 2.2
	env.ssao_power = 1.5
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = VIEW_SIZE * 2.0
	camera.near = 0.1
	camera.far = 100.0
	add_child(camera)
	camera.position = Vector3(-6, 12, -8.5)
	camera.look_at(Vector3(0.4, 0.6, 0.6), Vector3.UP)

func _build_lights() -> void:
	# one sun at a ~45° tilt from the camera side, casting clear soft shadows
	var sun := DirectionalLight3D.new()
	sun.light_energy = 0.95
	sun.light_color = Color(1.0, 0.97, 0.9)
	sun.shadow_enabled = true
	sun.light_angular_distance = 0.0   # hard shadow — cheap at high res (no PCSS taps)
	sun.shadow_bias = 0.1
	sun.shadow_normal_bias = 2.0
	add_child(sun)
	sun.look_at_from_position(Vector3(-9, 12, -3), Vector3(1, 0, 1), Vector3.UP)

func _add_box(sizev: Vector3, color: Color, pos: Vector3) -> void:
	var m := BoxMesh.new()
	m.size = sizev
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 1.0
	m.material = mat
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.position = pos
	add_child(mi)

func _build_decor() -> void:
	# floor
	var fm := PlaneMesh.new()
	fm.size = Vector2(24, 20)
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color8(0x1b, 0x16, 0x10)
	fm.material = fmat
	var floor := MeshInstance3D.new()
	floor.mesh = fm
	floor.position = Vector3(0, -0.62, 2)
	add_child(floor)
	# countertop slab + wall backings. Backings sit a hair BEHIND the wall planes
	# (front face at z=2.06 / x=4.06, walls at 2.0 / 4.0) to avoid Z-fighting.
	_add_box(Vector3(8.3, 0.5, 4.3), Color8(0x8a, 0x7a, 0x5c), Vector3(0, -0.29, 0))
	_add_box(Vector3(8.3, 4.1, 0.16), Color8(0xad, 0xa5, 0x92), Vector3(0, 2.0, 2.14))
	_add_box(Vector3(0.16, 4.1, 4.3), Color8(0x9c, 0x94, 0x7f), Vector3(4.14, 2.0, 0))

func _surface_basis(s: Surface) -> Basis:
	return Basis(s.u, s.v, s.normal)

func _build_surfaces() -> void:
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var pm := PlaneMesh.new()
		pm.orientation = PlaneMesh.FACE_Z
		pm.size = Vector2(s.width, s.height)
		# counter = marble, walls = ceramic tile (procedural, shaded)
		var mat := ShaderMaterial.new()
		mat.shader = MARBLE_SHADER if si == 0 else TILE_SHADER
		mat.set_shader_parameter("s_origin", s.origin)
		mat.set_shader_parameter("s_u", s.u)
		mat.set_shader_parameter("s_v", s.v)
		var mi := MeshInstance3D.new()
		mi.mesh = pm
		mi.material_override = mat
		# thin play planes don't cast (self-shadow acne); decor boxes + crumbs do
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.transform = Transform3D(_surface_basis(s), s.to_world(s.gW / 2.0, s.gH / 2.0))
		add_child(mi)

		# heatmap overlay (hidden until toggled)
		var n := s.gW * s.gH
		var bytes := PackedByteArray(); bytes.resize(n * 4)
		heat_data.append(bytes)
		var img := Image.create_from_data(s.gW, s.gH, false, Image.FORMAT_RGBA8, bytes)
		var tex := ImageTexture.create_from_image(img)
		heat_tex.append(tex)
		var hmat := ShaderMaterial.new()
		hmat.shader = OVERLAY_SHADER
		hmat.render_priority = 1
		hmat.set_shader_parameter("field_tex", tex)
		hmat.set_shader_parameter("s_origin", s.origin)
		hmat.set_shader_parameter("s_u", s.u)
		hmat.set_shader_parameter("s_v", s.v)
		hmat.set_shader_parameter("s_w", s.width)
		hmat.set_shader_parameter("s_h", s.height)
		var hpm := PlaneMesh.new()
		hpm.orientation = PlaneMesh.FACE_Z
		hpm.size = Vector2(s.width, s.height)
		var hmi := MeshInstance3D.new()
		hmi.mesh = hpm
		hmi.material_override = hmat
		hmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		hmi.transform = Transform3D(_surface_basis(s), s.to_world(s.gW / 2.0, s.gH / 2.0) + s.normal * 0.01)
		hmi.visible = false
		add_child(hmi)
		heat_meshes.append(hmi)

func _build_sponge() -> void:
	# two stacked layers: soft yellow foam + coarse green scour pad (see reference)
	sponge = Node3D.new()
	var L := 1.25
	var W := 0.66
	var fh := 0.20   # foam thickness
	var ph := 0.09   # pad thickness

	var fm := BoxMesh.new()
	fm.size = Vector3(L, fh, W)
	var fmat := ShaderMaterial.new()
	fmat.shader = SPONGE_SHADER
	fmat.set_shader_parameter("base_color", Color(0.93, 0.80, 0.15))
	fmat.set_shader_parameter("pore_scale", 17.0)
	fmat.set_shader_parameter("roughness_v", 0.93)
	fmat.set_shader_parameter("bump", 0.7)
	fmat.set_shader_parameter("pore_depth", 0.5)
	var fmi := MeshInstance3D.new()
	fmi.mesh = fm
	fmi.material_override = fmat
	fmi.position = Vector3(0, fh * 0.5, 0)
	sponge.add_child(fmi)

	var pm := BoxMesh.new()
	pm.size = Vector3(L * 0.94, ph, W * 0.94)
	var pmat := ShaderMaterial.new()
	pmat.shader = SPONGE_SHADER
	pmat.set_shader_parameter("base_color", Color(0.15, 0.30, 0.14))
	pmat.set_shader_parameter("pore_scale", 42.0)
	pmat.set_shader_parameter("roughness_v", 0.98)
	pmat.set_shader_parameter("bump", 1.0)
	pmat.set_shader_parameter("pore_depth", 0.35)
	var pmi := MeshInstance3D.new()
	pmi.mesh = pm
	pmi.material_override = pmat
	pmi.position = Vector3(0, fh + ph * 0.5, 0)
	sponge.add_child(pmi)

	sponge.visible = false
	add_child(sponge)

func _show_sponge(si: int, cx: float, cy: float) -> void:
	var s: Surface = surfaces[si]
	var a: float = _sponge_angle
	# long axis follows the wipe heading; short axis and up complete the basis
	var uu: Vector3 = s.u * cos(a) + s.v * sin(a)
	var vv: Vector3 = -s.u * sin(a) + s.v * cos(a)
	sponge.transform = Transform3D(Basis(uu, s.normal, vv), s.to_world(cx, cy) + s.normal * 0.006)
	sponge.visible = true

func _bottle_part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3,
		rx := 0.0, ry := 0.0, rz := 0.0, scl := Vector3.ONE) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var b := Basis.from_euler(Vector3(deg_to_rad(rx), deg_to_rad(ry), deg_to_rad(rz))).scaled(scl)
	mi.transform = Transform3D(b, pos)
	parent.add_child(mi)

func _build_spray_bottle() -> void:
	# The bottle lives in a separate overlay viewport drawn ON TOP of the scene, so
	# it is never occluded by walls/floor — it is "outside" the kitchen space but
	# still tracks the cursor (its camera is a clone of the main one).
	_spray_overlay = SubViewportContainer.new()
	_spray_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_spray_overlay.stretch = true
	_spray_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spray_overlay.visible = false      # only rendered while the spray tool is active
	add_child(_spray_overlay)
	_spray_vp = SubViewport.new()
	_spray_vp.transparent_bg = true
	_spray_vp.own_world_3d = true       # isolated world: only the bottle + its lights
	_spray_vp.handle_input_locally = false
	_spray_vp.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	_spray_overlay.add_child(_spray_vp)
	var oc := Camera3D.new()
	oc.projection = camera.projection
	oc.size = camera.size
	oc.near = camera.near
	oc.far = camera.far
	oc.keep_aspect = camera.keep_aspect
	oc.transform = camera.transform
	_spray_vp.add_child(oc)
	# two lights (no environment, so the viewport stays transparent) light the bottle
	var key := DirectionalLight3D.new()
	key.light_energy = 1.05
	key.shadow_enabled = false
	_spray_vp.add_child(key)
	key.look_at_from_position(Vector3(-9, 12, -3), Vector3(1, 0, 1), Vector3.UP)
	var fill := DirectionalLight3D.new()
	fill.light_energy = 0.5
	fill.light_color = Color(0.85, 0.9, 1.0)
	fill.shadow_enabled = false
	_spray_vp.add_child(fill)
	fill.look_at_from_position(Vector3(6, 6, -10), Vector3(0, 0, 1), Vector3.UP)

	var white := StandardMaterial3D.new()
	white.albedo_color = Color(0.95, 0.95, 0.96); white.roughness = 0.3; white.metallic = 0.0
	var red := StandardMaterial3D.new()
	red.albedo_color = Color(0.86, 0.12, 0.10); red.roughness = 0.28
	var yellow := StandardMaterial3D.new()
	yellow.albedo_color = Color(0.98, 0.82, 0.13); yellow.roughness = 0.45
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.14, 0.14, 0.16); dark.roughness = 0.5

	var b := Node3D.new()
	var flat := Vector3(1.0, 1.0, 0.62)   # squash the round meshes into an oval bottle

	var body := CylinderMesh.new()
	body.top_radius = 0.82; body.bottom_radius = 0.92; body.height = 3.4; body.radial_segments = 28
	_bottle_part(b, body, white, Vector3(0, 1.7, 0), 0, 0, 0, flat)
	var lab := CylinderMesh.new()
	lab.top_radius = 0.9; lab.bottom_radius = 0.97; lab.height = 1.15; lab.radial_segments = 28
	_bottle_part(b, lab, yellow, Vector3(0, 0.95, 0), 0, 0, 0, Vector3(1.02, 1.0, 0.64))
	var shoulder := CylinderMesh.new()
	shoulder.top_radius = 0.4; shoulder.bottom_radius = 0.82; shoulder.height = 0.7; shoulder.radial_segments = 28
	_bottle_part(b, shoulder, white, Vector3(0, 3.75, 0), 0, 0, 0, flat)
	var neck := CylinderMesh.new()
	neck.top_radius = 0.4; neck.bottom_radius = 0.4; neck.height = 0.45; neck.radial_segments = 20
	_bottle_part(b, neck, white, Vector3(0, 4.25, 0))
	var collar := CylinderMesh.new()
	collar.top_radius = 0.52; collar.bottom_radius = 0.54; collar.height = 0.42; collar.radial_segments = 24
	_bottle_part(b, collar, red, Vector3(0, 4.4, 0))

	# trigger sprayer head (front = +Z)
	var grip := BoxMesh.new(); grip.size = Vector3(0.72, 0.5, 1.05)
	_bottle_part(b, grip, red, Vector3(0, 4.98, -0.35), 12, 0, 0)
	var housing := BoxMesh.new(); housing.size = Vector3(0.86, 0.62, 1.5)
	_bottle_part(b, housing, red, Vector3(0, 5.02, 0.5), -8, 0, 0)
	var nozzle := CylinderMesh.new()
	nozzle.top_radius = 0.12; nozzle.bottom_radius = 0.17; nozzle.height = 0.34; nozzle.radial_segments = 16
	_bottle_part(b, nozzle, dark, Vector3(0, 5.06, 1.38), 90, 0, 0)   # axis Y -> +Z
	var trigger := BoxMesh.new(); trigger.size = Vector3(0.44, 0.78, 0.22)
	_bottle_part(b, trigger, red, Vector3(0, 4.5, 0.74), 24, 0, 0)

	# white foam puff sprayed from the nozzle (+Z)
	foam = CPUParticles3D.new()
	foam.emitting = false
	foam.amount = 60
	foam.lifetime = 0.55
	foam.local_coords = false
	foam.amount = 46
	foam.lifetime = 0.5
	foam.direction = Vector3(0, 0, 1)
	foam.spread = 44.0                 # cone tuned to fill the action disc, not overflow
	foam.initial_velocity_min = 3.0
	foam.initial_velocity_max = 5.0
	foam.gravity = Vector3(0, -5.0, 0)   # foam actually reaches the surface, not floating above
	foam.scale_amount_min = 0.5
	foam.scale_amount_max = 1.1
	foam.damping_min = 1.5
	foam.damping_max = 3.5
	var puff := SphereMesh.new()
	puff.radius = 0.22; puff.height = 0.44; puff.radial_segments = 8; puff.rings = 4
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(1.0, 1.0, 1.0)
	fmat.roughness = 1.0
	fmat.emission_enabled = true
	fmat.emission = Color(0.9, 0.95, 1.0)
	fmat.emission_energy_multiplier = 0.25
	puff.material = fmat
	foam.mesh = puff
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 0.95))
	ramp.set_color(1, Color(1, 1, 1, 0.0))
	foam.color_ramp = ramp
	fmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_spray_vp.add_child(foam)   # in the overlay world; aimed straight down into the disc

	# one fixed pose (never changes, never clips): body upright with the cap on top,
	# tilted forward so the nozzle (+Z) sprays down-into-the-scene. Camera is static.
	var camh: Vector3 = Vector3(camera.global_position.x, 0.0, camera.global_position.z)
	camh = camh.normalized() if camh.length() > 1e-3 else Vector3(0, 0, 1)
	var into: Vector3 = -camh   # away from the camera, into the scene
	var zc: Vector3 = (Vector3.DOWN * 0.72 + into * 0.6).normalized()   # nozzle: down + forward
	var yc: Vector3 = (Vector3.UP - zc * Vector3.UP.dot(zc)).normalized()  # body up, cap on top
	var xc: Vector3 = yc.cross(zc).normalized()
	_bottle_rot = Basis(xc, yc, zc)

	spray_bottle = b
	spray_bottle.visible = false
	_spray_vp.add_child(spray_bottle)   # positioned over the cursor in _show_spray_bottle

const _BOTTLE_SCALE := 0.46
const _NOZZLE_LOCAL := Vector3(0, 5.06, 1.45)   # nozzle position in the model

func _show_spray_bottle(si: int, cx: float, cy: float) -> void:
	var s: Surface = surfaces[si]
	var p: Vector3 = s.to_world(cx, cy)
	# only the POSITION tracks the cursor; orientation is the fixed pose. The bottle
	# floats up and toward the camera (behind the disc) so the nozzle sprays
	# forward-down into it; it never rotates or clips the scene.
	var camh: Vector3 = Vector3(camera.global_position.x, 0.0, camera.global_position.z).normalized()
	var noz_world: Vector3 = p + Vector3.UP * 1.3 + camh * 1.2
	var noz_off: Vector3 = _bottle_rot * (_NOZZLE_LOCAL * _BOTTLE_SCALE)
	spray_bottle.transform = Transform3D(_bottle_rot.scaled(Vector3(_BOTTLE_SCALE, _BOTTLE_SCALE, _BOTTLE_SCALE)), noz_world - noz_off)
	spray_bottle.visible = true

	# foam sprays from the nozzle straight down onto the cursor point (into the disc)
	var fz: Vector3 = (p - noz_world).normalized()
	var fx: Vector3 = Vector3.UP.cross(fz)
	fx = fx.normalized() if fx.length() > 1e-4 else Vector3.RIGHT
	var fy: Vector3 = fz.cross(fx).normalized()
	foam.global_transform = Transform3D(Basis(fx, fy, fz), noz_world)

func _build_cursor() -> void:
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var q := QuadMesh.new()
		q.size = Vector2(2, 2)
		var mat := ShaderMaterial.new()
		mat.shader = CURSOR_SHADER
		mat.render_priority = 20
		mat.set_shader_parameter("s_origin", s.origin)
		mat.set_shader_parameter("s_u", s.u)
		mat.set_shader_parameter("s_v", s.v)
		mat.set_shader_parameter("s_w", s.width)
		mat.set_shader_parameter("s_h", s.height)
		mat.set_shader_parameter("tint", Color.WHITE)
		var mi := MeshInstance3D.new()
		mi.mesh = q
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visible = false
		add_child(mi)
		cursor_meshes.append(mi)

# ---------------------------------------------------------------- cursor

func show_cursor(si: int, cx: float, cy: float, tool: String) -> void:
	hide_cursor()
	# cloth shows the 3D sponge instead of the flat brush disc
	if tool == "cloth":
		_show_sponge(si, cx, cy)
		return
	var world_r: float = Config.spray_range if tool == "spray" else Config.swipe_width
	var range_cells: float = world_r / Config.world_cell_size
	var tint: Color = TOOL_TINTS[tool]
	for f in Geom.disc_footprints(layout, si, cx, cy, range_cells):
		var fs: int = f["s"]
		var s: Surface = surfaces[fs]
		var pos: Vector3 = s.to_world(f["cx"], f["cy"]) + s.normal * 0.03
		var mi: MeshInstance3D = cursor_meshes[fs]
		mi.transform = Transform3D(_surface_basis(s).scaled(Vector3(world_r, world_r, world_r)), pos)
		(mi.material_override as ShaderMaterial).set_shader_parameter("tint", tint)
		mi.visible = true
	# spray also floats the held bottle above the target (disc projection stays)
	if tool == "spray" and spray_bottle:
		_show_spray_bottle(si, cx, cy)

func hide_cursor() -> void:
	for mi in cursor_meshes:
		mi.visible = false
	if sponge:
		sponge.visible = false
	if spray_bottle:
		spray_bottle.visible = false

# ---------------------------------------------------------------- heatmap

func toggle_heatmap() -> void:
	heatmap_on = not heatmap_on
	for mi in heat_meshes:
		mi.visible = heatmap_on

func _update_heatmap() -> void:
	if not heatmap_on:
		return
	var mx: float = Config.ph_max
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var g: PackedFloat32Array = field.grids[si]
		var nf: PackedFloat32Array = field.no_food[si]
		var data: PackedByteArray = heat_data[si]
		for i in g.size():
			var v: float = minf(1.0, g[i] / mx)
			var b: int = i * 4
			data[b + 0] = int(255.0 * minf(1.0, v * 1.6))
			data[b + 1] = int(255.0 * maxf(0.0, v * 1.6 - 0.6))
			data[b + 2] = 120 if nf[i] > 0.0 else 0
			data[b + 3] = int(255.0 * minf(1.0, v * 2.0 + (0.35 if nf[i] > 0.0 else 0.0)))
		var img := Image.create_from_data(s.gW, s.gH, false, Image.FORMAT_RGBA8, data)
		heat_tex[si].update(img)

# ---------------------------------------------------------------- loop

func _physics_process(delta: float) -> void:
	tools.update(delta)
	messes.update(delta, field)
	ants.update(delta, field, messes)
	field.step(delta)

func _process(_delta: float) -> void:
	ants.sync_instances()
	messes.sync_instances()
	_update_heatmap()
	# the on-top bottle overlay only renders for the spray tool; foam while spraying
	if _spray_overlay:
		_spray_overlay.visible = tools.current == "spray"
	if foam:
		foam.emitting = _spraying and tools.current == "spray"
	if hud:
		hud.set_stats(ants.alive_count(), messes.crumbs.alive_count(), Engine.get_frames_per_second())

# ---------------------------------------------------------------- picking / input

func _pick(screen_pos: Vector2) -> Dictionary:
	var ro: Vector3 = camera.project_ray_origin(screen_pos)
	var rd: Vector3 = camera.project_ray_normal(screen_pos)
	var best := {}
	var best_d: float = INF
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var pl := Plane(s.normal, s.normal.dot(s.origin))
		var hit = pl.intersects_ray(ro, rd)
		if hit == null:
			continue
		var cc: Vector2 = s.from_world(hit)
		if cc.x < 0 or cc.x > s.gW or cc.y < 0 or cc.y > s.gH:
			continue
		var d: float = ro.distance_to(hit)
		if d < best_d:
			best_d = d
			best = {"si": si, "cx": cc.x, "cy": cc.y, "world": hit}
	return best

func _now() -> float:
	return Time.get_ticks_msec() / 1000.0

func _on_down(screen_pos: Vector2) -> void:
	_active = true
	_spraying = tools.current == "spray"
	var p := _pick(screen_pos)
	if p.is_empty():
		_has_last = false
		return
	_set_last(p)
	show_cursor(p["si"], p["cx"], p["cy"], tools.current)
	if not tools.is_busy():
		interactions.apply_segment(tools.current, p["si"], p["cx"], p["cy"], p["cx"], p["cy"], false, 0.0)

func _on_move(screen_pos: Vector2) -> void:
	var cur := _pick(screen_pos)
	if cur.is_empty():
		hide_cursor()
	else:
		show_cursor(cur["si"], cur["cx"], cur["cy"], tools.current)

	if not _active:
		return
	if cur.is_empty():
		_has_last = false
		return
	var had_last := _has_last
	var prev_si := _last_si
	var prev_cx := _last_cx
	var prev_cy := _last_cy
	var prev_world := _last_world
	var prev_time := _last_time
	_set_last(cur)
	if not had_last or prev_si != cur["si"]:
		return
	if tools.is_busy():
		return
	var dt: float = maxf(1e-3, _now() - prev_time)
	var world_dist: float = prev_world.distance_to(cur["world"])
	var speed: float = world_dist / dt
	var fast: bool = speed > Config.swipe_fast_threshold
	# turn the sponge to face the wipe direction (in this surface's cell space)
	var mdx: float = cur["cx"] - prev_cx
	var mdy: float = cur["cy"] - prev_cy
	if mdx * mdx + mdy * mdy > 0.02:
		_sponge_angle = atan2(mdy, mdx)
		if tools.current == "cloth":
			show_cursor(cur["si"], cur["cx"], cur["cy"], "cloth")
	interactions.apply_segment(tools.current, cur["si"], prev_cx, prev_cy, cur["cx"], cur["cy"], fast, speed)

func _set_last(p: Dictionary) -> void:
	_has_last = true
	_last_si = p["si"]
	_last_cx = p["cx"]
	_last_cy = p["cy"]
	_last_world = p["world"]
	_last_time = _now()

func _on_up() -> void:
	_active = false
	_has_last = false
	_spraying = false

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_on_down(event.position)
			else:
				_on_up()
	elif event is InputEventMouseMotion:
		_on_move(event.position)
	elif event is InputEventScreenTouch:
		if event.pressed:
			_on_down(event.position)
		else:
			_on_up()
	elif event is InputEventScreenDrag:
		_on_move(event.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_1:
				tools.select("cloth")
			KEY_2:
				tools.select("spray")
			KEY_3:
				tools.select("broom")
			KEY_H:
				toggle_heatmap()
			KEY_G:
				if hud:
					hud.toggle_panel()
