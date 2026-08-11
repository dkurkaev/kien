class_name MessSystem
extends RefCounted
## Owns both mess kinds and the spawn schedule. Ports messes.ts.

var layout: Dictionary
var liquid: Liquid
var crumbs: CrumbSystem
var _spawn_timer: float = 1.0

func _init(_layout: Dictionary, parent: Node3D) -> void:
	layout = _layout
	liquid = Liquid.new(_layout, parent)
	crumbs = CrumbSystem.new(_layout, parent, 0)

func _spawn_scheduled() -> void:
	if randf() < Config.mess_spill_share:
		var roll: float = randf()
		var si: int = 0 if roll < 0.7 else (1 if roll < 0.85 else 2)
		var s: Surface = layout["surfaces"][si]
		var margin: float = 6.0
		var cx: float = margin + randf() * (s.gW - 2.0 * margin)
		var cy: float = margin + randf() * (s.gH - 2.0 * margin)
		var r: float = Config.spill_min_radius + randf() * (Config.spill_max_radius - Config.spill_min_radius)
		liquid.stamp(si, cx, cy, r, Config.spill_amount)
	else:
		var c: Surface = layout["surfaces"][0]
		var margin: float = 6.0
		var cx: float = margin + randf() * (c.gW - 2.0 * margin)
		var cy: float = margin + randf() * (c.gH - 2.0 * margin)
		var n: int = int(round(Config.crumb_min_count + randf() * (Config.crumb_max_count - Config.crumb_min_count)))
		crumbs.spawn_cluster(cx, cy, n, Config.crumb_spread / Config.world_cell_size)

func active_food_count() -> float:
	return liquid.food_amount() * 1.5 + crumbs.food_amount()

func random_food_surface() -> int:
	var wet: Array = liquid.wet_surfaces()
	if crumbs.food_amount() > 0.0:
		wet.append(0)
	if wet.is_empty():
		return -1
	return wet[randi() % wet.size()]

func update(dt: float, field: Field) -> void:
	_spawn_timer -= dt
	if _spawn_timer <= 0.0:
		_spawn_timer += Config.mess_spawn_interval
		_spawn_scheduled()
	liquid.update(dt, field)
	crumbs.update(dt, field)

func sync_instances() -> void:
	crumbs.sync_instances()
