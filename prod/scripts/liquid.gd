class_name Liquid
extends RefCounted
## Spills + spray as high-res per-surface fields. The CPU only maintains the raw
## fields and uploads them as an RG8 texture (repacking just the changed rect); the
## smoothstep/noise/colour compositing runs in spill.gdshader on the GPU. Ports
## liquid.ts (but GPU-composited for performance).

const LIQ: int = 3
const SPILL_SHADER := preload("res://shaders/spill.gdshader")
const SPRAY_FADE_EVERY: int = 4   # only fade/repack the spray sheen every N frames

var layout: Dictionary
var wet: Array[PackedFloat32Array] = []
var spray: Array[PackedFloat32Array] = []
var fgW: Array[int] = []
var fgH: Array[int] = []
var _data: Array[PackedByteArray] = []     # RG8, uploaded to field_tex
var _tex: Array[ImageTexture] = []
var _spray_active: Array[bool] = []
var _spray_frame: int = 0
# dirty rect (fine cells, inclusive) per surface; x1 < x0 means empty
var _dx0: Array[int] = []
var _dy0: Array[int] = []
var _dx1: Array[int] = []
var _dy1: Array[int] = []
# spray bounding box (fine cells) — the only region that needs per-frame decay
var _sx0: Array[int] = []
var _sy0: Array[int] = []
var _sx1: Array[int] = []
var _sy1: Array[int] = []

func _init(_layout: Dictionary, parent: Node3D) -> void:
	layout = _layout
	for s in layout["surfaces"]:
		var fw: int = s.gW * LIQ
		var fh: int = s.gH * LIQ
		var n: int = fw * fh
		fgW.append(fw); fgH.append(fh)
		var w := PackedFloat32Array(); w.resize(n); wet.append(w)
		var sp := PackedFloat32Array(); sp.resize(n); spray.append(sp)
		var bytes := PackedByteArray(); bytes.resize(n * 2); _data.append(bytes)
		_spray_active.append(false)
		_dx0.append(1 << 30); _dy0.append(1 << 30); _dx1.append(-1); _dy1.append(-1)
		_sx0.append(1 << 30); _sy0.append(1 << 30); _sx1.append(-1); _sy1.append(-1)

		var img := Image.create_from_data(fw, fh, false, Image.FORMAT_RG8, bytes)
		var tex := ImageTexture.create_from_image(img)
		_tex.append(tex)
		var ntex := _build_noise_texture(fw, fh)

		var mat := ShaderMaterial.new()
		mat.shader = SPILL_SHADER
		mat.render_priority = 0
		mat.set_shader_parameter("field_tex", tex)
		mat.set_shader_parameter("noise_tex", ntex)
		mat.set_shader_parameter("s_origin", s.origin)
		mat.set_shader_parameter("s_u", s.u)
		mat.set_shader_parameter("s_v", s.v)
		mat.set_shader_parameter("s_w", s.width)
		mat.set_shader_parameter("s_h", s.height)

		var pm := PlaneMesh.new()
		pm.orientation = PlaneMesh.FACE_Z
		pm.size = Vector2(s.width, s.height)
		var mi := MeshInstance3D.new()
		mi.mesh = pm
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.transform = Transform3D(Basis(s.u, s.v, s.normal), s.to_world(s.gW / 2.0, s.gH / 2.0) + s.normal * 0.008)
		parent.add_child(mi)

static func _build_noise_texture(fw: int, fh: int) -> ImageTexture:
	var cw: int = maxi(3, int(round(float(fw) / 9.0)))
	var ch: int = maxi(3, int(round(float(fh) / 9.0)))
	var coarse := PackedFloat32Array(); coarse.resize(cw * ch)
	for i in coarse.size():
		coarse[i] = randf() * 2.0 - 1.0
	var bytes := PackedByteArray(); bytes.resize(fw * fh)
	for y in fh:
		var gy: float = (float(y) / fh) * (ch - 1)
		var y0: int = int(floor(gy)); var fy: float = gy - y0
		var y1: int = mini(ch - 1, y0 + 1)
		for x in fw:
			var gx: float = (float(x) / fw) * (cw - 1)
			var x0: int = int(floor(gx)); var fx: float = gx - x0
			var x1: int = mini(cw - 1, x0 + 1)
			var a: float = coarse[y0 * cw + x0]
			var b: float = coarse[y0 * cw + x1]
			var c: float = coarse[y1 * cw + x0]
			var d: float = coarse[y1 * cw + x1]
			var top: float = a + (b - a) * fx
			var bot: float = c + (d - c) * fx
			var nval: float = top + (bot - top) * fy
			bytes[y * fw + x] = clampi(int((nval * 0.5 + 0.5) * 255.0), 0, 255)
	var img := Image.create_from_data(fw, fh, false, Image.FORMAT_R8, bytes)
	return ImageTexture.create_from_image(img)

func _mark(si: int, x0: int, y0: int, x1: int, y1: int) -> void:
	_dx0[si] = mini(_dx0[si], x0); _dy0[si] = mini(_dy0[si], y0)
	_dx1[si] = maxi(_dx1[si], x1); _dy1[si] = maxi(_dy1[si], y1)

func wet_at(si: int, cx: float, cy: float) -> float:
	var fw: int = fgW[si]; var fh: int = fgH[si]
	var gx: int = int(floor(cx * LIQ)); var gy: int = int(floor(cy * LIQ))
	if gx < 0 or gx >= fw or gy < 0 or gy >= fh:
		return 0.0
	return wet[si][gy * fw + gx]

func stamp(si: int, cx: float, cy: float, radius_world: float, amount: float) -> void:
	var fw: int = fgW[si]; var fh: int = fgH[si]
	var g: PackedFloat32Array = wet[si]
	var fcx: float = cx * LIQ; var fcy: float = cy * LIQ
	var R: float = radius_world / (Config.world_cell_size / LIQ)
	var mnx: int = fw; var mny: int = fh; var mxx: int = 0; var mxy: int = 0
	var lobes: int = 4 + randi() % 4
	for _l in lobes:
		var la: float = randf() * TAU
		var ld: float = randf() * R * 0.6
		var lx: float = fcx + cos(la) * ld
		var ly: float = fcy + sin(la) * ld
		var lr: float = R * (0.45 + 0.4 * randf())
		var r2: float = lr * lr
		var x0: int = maxi(0, int(floor(lx - lr))); var x1: int = mini(fw - 1, int(ceil(lx + lr)))
		var y0: int = maxi(0, int(floor(ly - lr))); var y1: int = mini(fh - 1, int(ceil(ly + lr)))
		for y in range(y0, y1 + 1):
			for x in range(x0, x1 + 1):
				var dx: float = x - lx; var dy: float = y - ly
				var d2: float = dx * dx + dy * dy
				if d2 > r2:
					continue
				var i: int = y * fw + x
				g[i] = minf(1.6, g[i] + amount * (1.0 - d2 / r2))
		mnx = mini(mnx, x0); mny = mini(mny, y0); mxx = maxi(mxx, x1); mxy = maxi(mxy, y1)
	wet[si] = g
	_mark(si, mnx, mny, mxx, mxy)

func stamp_spray(si: int, cx: float, cy: float, radius_cells: float) -> void:
	var fw: int = fgW[si]; var fh: int = fgH[si]
	var g: PackedFloat32Array = spray[si]
	var fcx: float = cx * LIQ; var fcy: float = cy * LIQ
	var R: float = radius_cells * LIQ; var r2: float = R * R
	var x0: int = maxi(0, int(floor(fcx - R))); var x1: int = mini(fw - 1, int(ceil(fcx + R)))
	var y0: int = maxi(0, int(floor(fcy - R))); var y1: int = mini(fh - 1, int(ceil(fcy + R)))
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			var dx: float = x - fcx; var dy: float = y - fcy
			if dx * dx + dy * dy > r2:
				continue
			g[y * fw + x] = 1.0
	spray[si] = g
	_spray_active[si] = true
	_sx0[si] = mini(_sx0[si], x0); _sy0[si] = mini(_sy0[si], y0)
	_sx1[si] = maxi(_sx1[si], x1); _sy1[si] = maxi(_sy1[si], y1)
	_mark(si, x0, y0, x1, y1)

func erase(si: int, cx: float, cy: float, radius_cells: float, strength: float) -> void:
	var fw: int = fgW[si]; var fh: int = fgH[si]
	var g: PackedFloat32Array = wet[si]
	var fcx: float = cx * LIQ; var fcy: float = cy * LIQ
	var R: float = radius_cells * LIQ; var r2: float = R * R
	var x0: int = maxi(0, int(floor(fcx - R))); var x1: int = mini(fw - 1, int(ceil(fcx + R)))
	var y0: int = maxi(0, int(floor(fcy - R))); var y1: int = mini(fh - 1, int(ceil(fcy + R)))
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			var dx: float = x - fcx; var dy: float = y - fcy
			var d2: float = dx * dx + dy * dy
			if d2 > r2:
				continue
			var falloff: float = 1.0 - sqrt(d2) / R
			var i: int = y * fw + x
			g[i] = maxf(0.0, g[i] - strength * (0.35 + 0.65 * falloff))
	wet[si] = g
	_mark(si, x0, y0, x1, y1)

func smear(si: int, cx: float, cy: float, radius_cells: float, dx: float, dy: float, strength: float) -> void:
	var fw: int = fgW[si]; var fh: int = fgH[si]
	var g: PackedFloat32Array = wet[si]
	var sx: int = int(round(dx * LIQ)); var sy: int = int(round(dy * LIQ))
	var fcx: float = cx * LIQ; var fcy: float = cy * LIQ
	var R: float = radius_cells * LIQ; var r2: float = R * R
	var x0: int = maxi(0, int(floor(fcx - R))); var x1: int = mini(fw - 1, int(ceil(fcx + R)))
	var y0: int = maxi(0, int(floor(fcy - R))); var y1: int = mini(fh - 1, int(ceil(fcy + R)))
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			var ox: float = x - fcx; var oy: float = y - fcy
			if ox * ox + oy * oy > r2:
				continue
			var tx: int = x + sx; var ty: int = y + sy
			if tx < 0 or tx >= fw or ty < 0 or ty >= fh:
				continue
			var i: int = y * fw + x
			var moved: float = g[i] * strength
			g[i] -= moved
			g[ty * fw + tx] = minf(1.6, g[ty * fw + tx] + moved)
	wet[si] = g
	_mark(si, mini(x0, x0 + sx), mini(y0, y0 + sy), maxi(x1, x1 + sx), maxi(y1, y1 + sy))

# sampled at the COARSE resolution (called every frame by the ant influx)
func food_amount() -> float:
	var total: float = 0.0
	var half: int = LIQ / 2
	var surfaces: Array = layout["surfaces"]
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var fw: int = fgW[si]
		var w: PackedFloat32Array = wet[si]
		for gy in s.gH:
			var base: int = (gy * LIQ + half) * fw + half
			for gx in s.gW:
				total += w[base + gx * LIQ]
	return total * Config.world_cell_size * Config.world_cell_size

func wet_cell_counts() -> Array:
	var out: Array = []
	for g in wet:
		var n: int = 0
		for i in g.size():
			if g[i] > 0.1:
				n += 1
		out.append(int(round(float(n) / (LIQ * LIQ))))
	return out

func wet_surfaces() -> Array:
	var out: Array = []
	var half: int = LIQ / 2
	var surfaces: Array = layout["surfaces"]
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var fw: int = fgW[si]
		var w: PackedFloat32Array = wet[si]
		var found: bool = false
		for gy in s.gH:
			var base: int = (gy * LIQ + half) * fw + half
			for gx in s.gW:
				if w[base + gx * LIQ] > 0.1:
					found = true
					break
			if found:
				break
		if found:
			out.append(si)
	return out

func update(dt: float, field: Field) -> void:
	_spray_frame += 1
	# the sheen fades over ~20 s, so updating it every N frames is imperceptible but
	# saves a per-frame decay + repack + texture upload for the whole 20 s window
	var fade_spray: bool = (_spray_frame % SPRAY_FADE_EVERY) == 0
	var spray_decay: float = dt * SPRAY_FADE_EVERY / maxf(0.5, Config.spray_no_food_time)
	var surfaces: Array = layout["surfaces"]
	for si in surfaces.size():
		var s: Surface = surfaces[si]
		var fw: int = fgW[si]

		# decay spray only inside its bounding box; mark that region dirty
		if fade_spray and _spray_active[si] and _sx1[si] >= _sx0[si]:
			var spr: PackedFloat32Array = spray[si]
			var any_left: bool = false
			for y in range(_sy0[si], _sy1[si] + 1):
				for x in range(_sx0[si], _sx1[si] + 1):
					var i: int = y * fw + x
					if spr[i] > 0.0:
						spr[i] = maxf(0.0, spr[i] - spray_decay)
						if spr[i] > 0.0:
							any_left = true
			spray[si] = spr
			_mark(si, _sx0[si], _sy0[si], _sx1[si], _sy1[si])
			if not any_left:
				_spray_active[si] = false
				_sx0[si] = 1 << 30; _sy0[si] = 1 << 30; _sx1[si] = -1; _sy1[si] = -1

		# repack only the dirty rect into the RG texture, then upload
		if _dx1[si] >= _dx0[si]:
			var data: PackedByteArray = _data[si]
			var w: PackedFloat32Array = wet[si]
			var spr2: PackedFloat32Array = spray[si]
			var rx0: int = maxi(0, _dx0[si]); var rx1: int = mini(fw - 1, _dx1[si])
			var ry0: int = maxi(0, _dy0[si]); var ry1: int = mini(fgH[si] - 1, _dy1[si])
			for y in range(ry0, ry1 + 1):
				var base: int = y * fw
				for x in range(rx0, rx1 + 1):
					var i: int = base + x
					data[i * 2] = clampi(int(w[i] / 1.6 * 255.0), 0, 255)
					data[i * 2 + 1] = clampi(int(spr2[i] * 255.0), 0, 255)
			_data[si] = data
			_dx0[si] = 1 << 30; _dy0[si] = 1 << 30; _dx1[si] = -1; _dy1[si] = -1
			var img := Image.create_from_data(fw, fgH[si], false, Image.FORMAT_RG8, data)
			_tex[si].update(img)

		# food radiates from wet cells (coarse sim resolution)
		var wf: PackedFloat32Array = wet[si]
		var half: int = LIQ / 2
		for gy in s.gH:
			for gx in s.gW:
				var v: float = wf[(gy * LIQ + half) * fw + (gx * LIQ + half)]
				if v > 0.05 and not field.no_food_at(si, gx, gy):
					field.deposit(si, gx, gy, Config.ph_food_strength * minf(1.0, v) * 0.05 * dt)
