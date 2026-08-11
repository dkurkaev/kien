class_name Hud
extends CanvasLayer
## Tool bar + live tuning panel (toggle G). Sliders bind straight to the Config
## autoload by property name. Ports hud.ts + debug.ts (the lil-gui panel).

var tools: ToolManager
var _tool_buttons := {}          # id -> Button
var _stats: Label
var _panel: PanelContainer

# Section header rows start with "#". Param rows: [prop, label, min, max, step, is_int]
const PARAMS := [
	["#", "Феромон"],
	["ph_evaporation", "испарение", 0.0, 2.0, 0.01, false],
	["ph_diffusion", "диффузия", 0.0, 0.5, 0.01, false],
	["ph_ant_deposit", "вклад муравья", 0.0, 20.0, 0.5, false],
	["ph_food_strength", "сила еды", 0.0, 200.0, 1.0, false],
	["#", "Муравьи"],
	["ant_target", "лимит популяции", 0.0, 500.0, 10.0, true],
	["ant_max_influx_rate", "макс приток /сек", 0.0, 20.0, 0.5, false],
	["ant_influx_per_food", "приток / еда", 0.0, 6.0, 0.1, false],
	["ant_speed", "скорость", 0.0, 4.0, 0.05, false],
	["ant_noise", "шум", 0.0, 2.0, 0.02, false],
	["ant_sensor_dist", "антенны, дист", 0.5, 8.0, 0.1, false],
	["ant_sensor_angle", "антенны, угол", 0.1, 1.5, 0.02, false],
	["#", "Пятна"],
	["mess_spawn_interval", "интервал", 0.5, 10.0, 0.1, false],
	["mess_spill_share", "доля пятен", 0.0, 1.0, 0.05, false],
	["spill_min_radius", "мин радиус", 0.1, 1.5, 0.05, false],
	["spill_max_radius", "макс радиус", 0.1, 1.5, 0.05, false],
	["spill_amount", "насыщенность", 0.3, 1.6, 0.05, false],
	["#", "Крошки"],
	["crumb_min_count", "мин кол-во", 1.0, 80.0, 1.0, true],
	["crumb_max_count", "макс кол-во", 1.0, 120.0, 1.0, true],
	["crumb_spread", "разброс", 0.1, 2.0, 0.05, false],
	["crumb_size", "размер", 0.02, 0.2, 0.005, false],
	["crumb_friction", "трение", 1.0, 20.0, 0.5, false],
	["crumb_push", "макс сила флика", 2.0, 30.0, 0.5, false],
	["crumb_fan", "боковой разлёт", 0.0, 2.0, 0.05, false],
	["crumb_gravity", "гравитация", 1.0, 25.0, 0.5, false],
	["#", "Мазок"],
	["swipe_width", "ширина", 0.1, 1.5, 0.05, false],
	["swipe_fast_threshold", "порог быстро", 1.0, 15.0, 0.1, false],
	["swipe_clean_per_sec", "сила очистки", 0.2, 8.0, 0.1, false],
	["swipe_push_dist", "толчок веником", 0.0, 3.0, 0.05, false],
	["#", "Спрей"],
	["spray_range", "радиус", 0.5, 5.0, 0.1, false],
	["spray_kill_prob", "сила поражения", 0.0, 1.0, 0.05, false],
	["spray_no_food_time", "время возврата", 0.0, 60.0, 1.0, false],
]

func _init(_tools: ToolManager) -> void:
	tools = _tools

func _ready() -> void:
	_build_hint()
	_build_stats()
	_build_tool_bar()
	_build_panel()

func _build_hint() -> void:
	var l := Label.new()
	l.text = "1 тряпка · 2 спрей · 3 веник · H карта · G тюнинг"
	l.position = Vector2(12, 10)
	l.modulate = Color(1, 1, 1, 0.6)
	add_child(l)

func _build_stats() -> void:
	_stats = Label.new()
	_stats.position = Vector2(12, 34)
	_stats.modulate = Color(1, 1, 1, 0.85)
	add_child(_stats)

func _build_tool_bar() -> void:
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 10)
	bar.alignment = BoxContainer.ALIGNMENT_CENTER
	# a fixed-size strip pinned to the bottom-centre, so buttons always fit on screen
	bar.anchor_left = 0.5
	bar.anchor_right = 0.5
	bar.anchor_top = 1.0
	bar.anchor_bottom = 1.0
	bar.offset_left = -210
	bar.offset_right = 210
	bar.offset_top = -56
	bar.offset_bottom = -12
	add_child(bar)
	var defs := [["cloth", "1 · Тряпка"], ["spray", "2 · Спрей"], ["broom", "3 · Веник"]]
	for d in defs:
		var b := Button.new()
		b.text = d[1]
		b.custom_minimum_size = Vector2(120, 40)
		var id: String = d[0]
		b.pressed.connect(func(): tools.select(id))
		bar.add_child(b)
		_tool_buttons[id] = b

func _build_panel() -> void:
	_panel = PanelContainer.new()
	_panel.anchor_left = 1.0
	_panel.anchor_right = 1.0
	_panel.anchor_top = 0.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = -340
	_panel.offset_right = -8
	_panel.offset_top = 8
	_panel.offset_bottom = -8
	_panel.visible = false
	add_child(_panel)

	var scroll := ScrollContainer.new()
	_panel.add_child(scroll)
	var vb := VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(vb)

	var title := Label.new()
	title.text = "Тюнинг"
	vb.add_child(title)

	for row in PARAMS:
		if row[0] == "#":
			var h := Label.new()
			h.text = "— " + str(row[1])
			h.modulate = Color(1, 0.9, 0.6)
			vb.add_child(h)
			continue
		_add_slider(vb, row[0], row[1], row[2], row[3], row[4], row[5])

func _add_slider(container: Node, prop: String, label_text: String, minv: float, maxv: float, step: float, is_int: bool) -> void:
	var rowbox := HBoxContainer.new()
	rowbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var name_label := Label.new()
	name_label.text = label_text
	name_label.custom_minimum_size = Vector2(150, 0)
	rowbox.add_child(name_label)

	var slider := HSlider.new()
	slider.min_value = minv
	slider.max_value = maxv
	slider.step = step
	slider.value = float(Config.get(prop))
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.custom_minimum_size = Vector2(90, 0)
	rowbox.add_child(slider)

	var val_label := Label.new()
	val_label.custom_minimum_size = Vector2(48, 0)
	val_label.text = _fmt(slider.value, is_int)
	rowbox.add_child(val_label)

	slider.value_changed.connect(func(v: float):
		var out: Variant = int(round(v)) if is_int else v
		Config.set(prop, out)
		val_label.text = _fmt(v, is_int)
	)

	container.add_child(rowbox)

func _fmt(v: float, is_int: bool) -> String:
	return str(int(round(v))) if is_int else String.num(v, 2)

func toggle_panel() -> void:
	_panel.visible = not _panel.visible

func set_stats(ants: int, crumbs: int, fps: float) -> void:
	if _stats:
		_stats.text = "муравьи %d · крошки %d · fps %d" % [ants, crumbs, int(fps)]

func _process(_delta: float) -> void:
	for id in _tool_buttons:
		var b: Button = _tool_buttons[id]
		var active: bool = (id == tools.current)
		b.modulate = Color(1, 1, 1, 1) if active else Color(1, 1, 1, 0.55)
		b.disabled = tools.is_busy() and not active
