shader_type spatial;
// Procedural white marble for the countertop. Lit by the scene (shaded), so it
// picks up the sun, ambient and SSAO normally. UV in metres from the surface basis.

uniform vec3 s_origin;
uniform vec3 s_u;
uniform vec3 s_v;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int k = 0; k < 4; k++) {
		s += a * vnoise(p);
		p *= 2.0;
		a *= 0.5;
	}
	return s;
}

void fragment() {
	vec3 d = wpos - s_origin;
	vec2 uv = vec2(dot(d, s_u), dot(d, s_v)); // metres

	// one fbm, reused for the vein warp and the mottling (cheap at 4K)
	float turb = fbm(uv * 1.2);
	float m = sin((uv.x * 1.6 + uv.y * 0.8 + turb * 2.8) * 3.14159265);
	float vein = smoothstep(0.86, 1.0, abs(m));

	vec3 white = vec3(0.94, 0.94, 0.92);
	vec3 grey = vec3(0.62, 0.63, 0.66);
	vec3 col = mix(white, grey, vein * 0.6);
	col *= 0.98 + 0.02 * turb; // faint mottling from the same noise

	ALBEDO = col;
	ROUGHNESS = 0.22;   // polished
	METALLIC = 0.0;
	SPECULAR = 0.55;
}
