class_name ToolManager
extends RefCounted
## Tool selection with a switch lockout. Ports tools.ts.
## Tool ids: "cloth", "spray", "broom".

var current: String = "cloth"
var switching: float = 0.0   # seconds of lockout remaining

func select(id: String) -> void:
	if id == current or switching > 0.0:
		return
	current = id
	switching = Config.tool_switch_time

func is_busy() -> bool:
	return switching > 0.0

func update(dt: float) -> void:
	if switching > 0.0:
		switching = maxf(0.0, switching - dt)
