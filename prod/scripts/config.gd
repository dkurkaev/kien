extends Node
## Single tunable config (autoload singleton "Config"). Mirrors the prototype's
## config object; the tuning panel binds sliders straight to these properties.
## Flat, snake_case names so the panel can bind by property name.

# --- world ---
var world_cell_size: float = 0.125    # world size of one pheromone cell
var world_fixed_step: float = 1.0 / 60.0
var world_floor_y: float = -0.62      # crumbs swept off the edge vanish below this

# --- pheromone ---
var ph_evaporation: float = 0.55      # per-second decay
var ph_diffusion: float = 0.22        # blur per step -> gradient halo around sources
var ph_ant_deposit: float = 6.0
var ph_food_strength: float = 90.0
var ph_max: float = 100.0

# --- ants ---
var ant_max: int = 500                # hard buffer (instances) — not the live count
var ant_target: int = 220             # soft population cap
var ant_max_influx_rate: float = 3.0  # arrivals/sec ceiling
var ant_speed: float = 1.1
var ant_noise: float = 0.5
var ant_turn_rate: float = 7.0
var ant_sensor_dist: float = 2.5
var ant_sensor_angle: float = 0.7
var ant_influx_per_food: float = 1.6
var ant_leave_chance: float = 0.4

# --- mess / spills / crumbs ---
var mess_spawn_interval: float = 3.2
var mess_spill_share: float = 0.5
var spill_min_radius: float = 0.3
var spill_max_radius: float = 0.8
var spill_amount: float = 1.1
var crumb_min_count: int = 8
var crumb_max_count: int = 34
var crumb_spread: float = 0.5
var crumb_size: float = 0.055
var crumb_max_total: int = 700
var crumb_friction: float = 6.0
var crumb_push: float = 7.0           # max sweep speed cap
var crumb_fan: float = 0.3            # sideways spread
var crumb_gravity: float = 14.0

# --- swipe (cloth/broom stroke) ---
var swipe_width: float = 0.55
var swipe_fast_threshold: float = 5.5
var swipe_clean_per_sec: float = 3.5
var swipe_erase_radius: float = 0.7
var swipe_smear_spawn: int = 2
var swipe_push_dist: float = 0.9
var swipe_ant_scatter: float = 0.9
var swipe_ant_kill: float = 0.55

# --- tools ---
var tool_switch_time: float = 0.4

# --- spray ---
var spray_range: float = 1.6
var spray_kill_prob: float = 0.85
var spray_no_food_time: float = 20.0
