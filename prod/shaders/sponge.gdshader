shader_type spatial;
// Procedural kitchen-sponge material: mottled base colour, dark open pores and a
// bumpy surface from value-noise fbm. One shader drives both layers (soft yellow
// foam + coarse green scour pad) through uniforms.
render_mode cull_back;

uniform vec3 base_color : source_color = vec3(0.90, 0.78, 0.16);
uniform float pore_scale = 22.0;   // noise tiling across the UV
uniform float roughness_v = 0.93;
uniform float bump = 0.7;
uniform float pore_depth = 0.45;   // how dark/deep the pores punch

float hash(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 34.5);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float f = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		f += amp * vnoise(p);
		p *= 2.0;
		amp *= 0.5;
	}
	return f;
}

void fragment() {
	vec2 uv = UV * pore_scale;
	float n = fbm(uv);
	// open pores: dark speckles where a second, higher-freq field peaks
	float pore = smoothstep(0.52, 0.72, fbm(uv * 1.9 + 5.0));
	ALBEDO = base_color * (0.72 + 0.5 * n) * (1.0 - pore_depth * pore);
	ROUGHNESS = roughness_v;
	METALLIC = 0.0;
	SPECULAR = 0.15;

	// bumpy tangent-space normal from the noise gradient (foam texture)
	float e = 0.015;
	float nx = fbm(uv + vec2(e, 0.0)) - fbm(uv - vec2(e, 0.0));
	float ny = fbm(uv + vec2(0.0, e)) - fbm(uv - vec2(0.0, e));
	nx += pore * 1.2;   // pores read as little pits
	vec3 tn = normalize(vec3(-nx * bump, -ny * bump, 1.0));
	NORMAL_MAP = tn * 0.5 + 0.5;
}
