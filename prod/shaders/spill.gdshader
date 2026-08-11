shader_type spatial;
// Wet spill overlay. SHADED + glossy so it reads as real liquid: a specular
// highlight from the sun, a meniscus rim and ripples from perturbing the normal
// by the wetness gradient. Fields come from the CPU (R=wet/1.6, G=spray sheen);
// noise breaks up the edge. Dry pixels discard before lighting, so cost scales
// with the wet area, not the whole surface.
render_mode blend_mix, depth_draw_never, cull_disabled, specular_schlick_ggx;

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

	vec2 fld = texture(field_tex, uv).rg;
	// cheap early-out over dry marble: skip the blur/lighting where there's nothing
	if (fld.r < 0.02 && fld.g < 0.02) discard;

	// 3x3 gaussian blur of the wet field so the alpha edge follows a smooth curve
	// instead of the coarse grid's bilinear facets (the "pixelated" erase edge).
	vec2 texel = 1.0 / vec2(textureSize(field_tex, 0));
	float b = 1.3;
	float wl  = texture(field_tex, uv + vec2(-texel.x, 0.0) * b).r;
	float wr  = texture(field_tex, uv + vec2( texel.x, 0.0) * b).r;
	float wdn = texture(field_tex, uv + vec2(0.0, -texel.y) * b).r;
	float wup = texture(field_tex, uv + vec2(0.0,  texel.y) * b).r;
	float wdl = texture(field_tex, uv + vec2(-texel.x, -texel.y) * b).r;
	float wdr = texture(field_tex, uv + vec2( texel.x, -texel.y) * b).r;
	float wul = texture(field_tex, uv + vec2(-texel.x,  texel.y) * b).r;
	float wur = texture(field_tex, uv + vec2( texel.x,  texel.y) * b).r;
	float wet_blur = (fld.r * 4.0 + (wl + wr + wdn + wup) * 2.0 + (wdl + wdr + wul + wur)) / 16.0;

	float wetv = wet_blur * 1.6;
	float sprv = fld.g;
	float nz = (texture(noise_tex, uv).r * 2.0 - 1.0) * 0.16;
	float wv = wetv + nz;

	float a_wet = smoothstep(0.30, 0.40, wv);
	float a_spr = smoothstep(0.35, 0.5, sprv + nz) * 0.35;
	float alpha = clamp(a_wet * 0.9 + a_spr, 0.0, 0.94);
	if (alpha < 0.01) discard;

	// meniscus/ripple gradients reuse the blur taps (smooth, no grid steps)
	vec2 grad = vec2(wr - wl, wup - wdn);
	float nl = texture(noise_tex, uv - vec2(texel.x, 0.0)).r;
	float nr = texture(noise_tex, uv + vec2(texel.x, 0.0)).r;
	float ndn = texture(noise_tex, uv - vec2(0.0, texel.y)).r;
	float nup2 = texture(noise_tex, uv + vec2(0.0, texel.y)).r;
	vec2 ngrad = vec2(nr - nl, nup2 - ndn);

	// meniscus (surface slopes down toward dry) + gentle ripple across the pool,
	// strong enough that facets catch the sun as glints (the key "wet" cue under
	// an ortho camera, where a flat pool would never mirror the light to us)
	vec2 tilt = -grad * 10.0 - ngrad * 2.6;
	vec3 base_n = normalize(cross(s_u, s_v));
	vec3 wn = normalize(base_n + tilt.x * s_u + tilt.y * s_v);
	NORMAL = (VIEW_MATRIX * vec4(wn, 0.0)).xyz;

	// deeper liquid = darker; glossy. spray sheen is a mid-rough teal film.
	vec3 wet_col = mix(vec3(0.15, 0.09, 0.05), vec3(0.04, 0.025, 0.015), clamp(wetv, 0.0, 1.0));
	vec3 spray_col = vec3(0.20, 0.34, 0.30);
	float wet_mix = (a_wet * 0.9) / (a_wet * 0.9 + a_spr + 1e-4);

	ALBEDO = mix(spray_col, wet_col, wet_mix);
	ROUGHNESS = mix(0.4, 0.22, wet_mix);   // soft glossy sheen; spray a touch rougher
	METALLIC = 0.0;
	SPECULAR = 0.6;

	// fresnel: wet surfaces brighten a little at the grazing pool rim
	float fres = pow(1.0 - clamp(dot(normalize(NORMAL), VIEW), 0.0, 1.0), 4.0);
	EMISSION = vec3(0.34, 0.32, 0.28) * fres * wet_mix * 0.14;
	ALPHA = alpha;
}
