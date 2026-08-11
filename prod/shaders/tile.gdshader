shader_type spatial;
// Procedural ceramic wall tile with grout lines. Shaded, so it lights normally.
// UV in metres from the surface basis; tiles are a fixed real-world size.

uniform vec3 s_origin;
uniform vec3 s_u;
uniform vec3 s_v;
uniform float tile_size = 0.34;
uniform float grout_width = 0.05;
uniform vec3 tile_color : source_color = vec3(0.87, 0.87, 0.84);
uniform vec3 grout_color : source_color = vec3(0.60, 0.58, 0.54);

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	vec3 d = wpos - s_origin;
	vec2 uv = vec2(dot(d, s_u), dot(d, s_v)) / tile_size;
	vec2 cell = fract(uv);
	vec2 id = floor(uv);

	// grout mask with a soft edge (antialiased-ish)
	float g = grout_width;
	float ex = smoothstep(0.0, g, cell.x) * smoothstep(0.0, g, 1.0 - cell.x);
	float ey = smoothstep(0.0, g, cell.y) * smoothstep(0.0, g, 1.0 - cell.y);
	float tile = ex * ey;            // 1 on tile face, 0 in grout
	float grout = 1.0 - tile;

	float tv = hash(id);             // per-tile tint/gloss variation
	vec3 tcol = tile_color * (0.95 + 0.07 * tv);
	vec3 col = mix(grout_color, tcol, tile);

	ALBEDO = col;
	ROUGHNESS = mix(0.85, 0.12 + 0.06 * tv, tile); // matte grout, glossy tile
	METALLIC = 0.0;
	SPECULAR = 0.6;
}
