shader_type spatial;
// Brush cursor: a unit quad per surface. Draws a filled disc + ring from the UV
// distance, and CLIPS to the owning surface's rectangle (world-space bounds) so a
// footprint that spills past a seam only shows the arc that lands on the surface.
// Drawn over everything (no depth test), so it reads on top of ants/crumbs/liquid.
render_mode unshaded, cull_disabled, depth_draw_never, depth_test_disabled, blend_mix;

uniform vec3 s_origin;
uniform vec3 s_u;
uniform vec3 s_v;
uniform float s_w;
uniform float s_h;
uniform vec4 tint : source_color = vec4(1.0);

varying vec3 world_pos;
varying vec2 uvc;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	uvc = UV * 2.0 - 1.0; // -1..1 across the quad
}

void fragment() {
	vec3 d = world_pos - s_origin;
	float du = dot(d, s_u);
	float dv = dot(d, s_v);
	if (du < 0.0 || du > s_w || dv < 0.0 || dv > s_h) discard;

	float r = length(uvc);
	if (r > 1.0) discard;
	float ring = (smoothstep(0.85, 0.87, r) - smoothstep(0.99, 1.0, r)) * 0.95;
	float fill = (r < 0.86) ? 0.16 : 0.0;
	float a = clamp(ring + fill, 0.0, 0.95) * tint.a;
	if (a < 0.003) discard;

	ALBEDO = tint.rgb;
	ALPHA = a;
}
