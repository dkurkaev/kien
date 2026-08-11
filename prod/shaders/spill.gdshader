shader_type spatial;
// Spill/spray compositing on the GPU. The CPU only uploads the raw fields:
//   field_tex.r = wet / 1.6   (0..1)
//   field_tex.g = spray       (0..1)
//   noise_tex.r = (noise+1)/2 (static)
// UV is derived from world position + surface basis so it maps to (cx,cy) exactly.
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;

uniform sampler2D field_tex : filter_linear;
uniform sampler2D noise_tex : filter_linear;
uniform vec3 s_origin;
uniform vec3 s_u;
uniform vec3 s_v;
uniform float s_w;
uniform float s_h;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 d = world_pos - s_origin;
	vec2 uv = vec2(dot(d, s_u) / s_w, dot(d, s_v) / s_h);
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

	vec2 f = texture(field_tex, uv).rg;
	float wetv = f.r * 1.6;
	float sprv = f.g;
	float nz = (texture(noise_tex, uv).r * 2.0 - 1.0) * 0.16;

	float wv = wetv + nz;
	float a_wet = smoothstep(0.30, 0.40, wv) * 0.95;
	float rim = (smoothstep(0.28, 0.36, wv) - smoothstep(0.40, 0.5, wv)) * 0.5;
	float a_spr = smoothstep(0.35, 0.5, sprv + nz) * 0.26;
	float a = min(0.97, a_wet + a_spr);
	if (a < 0.003) discard;

	float wet_mix = a_wet / (a_wet + a_spr + 1e-4);
	float rim_f = 1.0 - rim;
	vec3 col = vec3(
		(42.0 * rim_f) * wet_mix + 52.0 * (1.0 - wet_mix),
		(28.0 * rim_f) * wet_mix + 92.0 * (1.0 - wet_mix),
		(16.0 * rim_f) * wet_mix + 84.0 * (1.0 - wet_mix)) / 255.0;

	ALBEDO = col;
	ALPHA = a;
}
