shader_type spatial;
// Spiral cord wrap for the broom handle: diagonal red/tan stripes over the
// cylinder UV read as a wound binding.
render_mode cull_back;

void fragment() {
	float s = fract(UV.x * 7.0 + UV.y * 9.0);   // diagonal -> spiral around the shaft
	vec3 red = vec3(0.72, 0.12, 0.12);
	vec3 tan = vec3(0.80, 0.63, 0.34);
	ALBEDO = mix(tan, red, step(0.5, s));
	ROUGHNESS = 0.65;
	SPECULAR = 0.3;
}
