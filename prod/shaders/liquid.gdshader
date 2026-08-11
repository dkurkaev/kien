shader_type spatial;
// Field overlay (spills / heatmap). Computes the sample UV from WORLD position and
// the owning surface's basis, so the texture maps to (cx,cy) exactly regardless of
// the mesh's own UV convention. Straight RGBA from the texture.
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;

uniform sampler2D field_tex : filter_linear, source_color;
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
	// 3x3 gaussian blur so the coarse field reads as smooth gradients, not hard cells
	vec2 tx = 1.3 / vec2(textureSize(field_tex, 0));
	vec4 c = texture(field_tex, uv) * 4.0;
	c += (texture(field_tex, uv + vec2(tx.x, 0.0)) + texture(field_tex, uv - vec2(tx.x, 0.0))
		+ texture(field_tex, uv + vec2(0.0, tx.y)) + texture(field_tex, uv - vec2(0.0, tx.y))) * 2.0;
	c += texture(field_tex, uv + tx) + texture(field_tex, uv - tx)
		+ texture(field_tex, uv + vec2(tx.x, -tx.y)) + texture(field_tex, uv + vec2(-tx.x, tx.y));
	c /= 16.0;
	ALBEDO = c.rgb;
	ALPHA = c.a;
}
