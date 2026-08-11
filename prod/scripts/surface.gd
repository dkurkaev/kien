class_name Surface
extends RefCounted
## A flat plane in 3D that carries its own 2D grid. Ants/messes live in continuous
## CELL coordinates (cx in [0,gW], cy in [0,gH]) and get projected to 3D.

var index: int
var origin: Vector3
var u: Vector3    # unit, cx axis
var v: Vector3    # unit, cy axis
var normal: Vector3
var width: float
var height: float
var gW: int
var gH: int

func _init(_index: int, _origin: Vector3, _u: Vector3, _v: Vector3, _width: float, _height: float) -> void:
	var cs: float = Config.world_cell_size
	index = _index
	origin = _origin
	u = _u.normalized()
	v = _v.normalized()
	# right-handed bases are chosen so u x v already points INTO the room
	normal = u.cross(v).normalized()
	width = _width
	height = _height
	gW = int(round(_width / cs))
	gH = int(round(_height / cs))

# cell coords -> world (linear, also valid slightly out of bounds)
func to_world(cx: float, cy: float) -> Vector3:
	var cs: float = Config.world_cell_size
	return origin + u * (cx * cs) + v * (cy * cs)

# world point -> cell coords on this plane (no bounds check)
func from_world(p: Vector3) -> Vector2:
	var cs: float = Config.world_cell_size
	var d: Vector3 = p - origin
	return Vector2(d.dot(u) / cs, d.dot(v) / cs)
