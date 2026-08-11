import * as THREE from 'three';
import { Layout } from './surfaces';
import { Field, discFootprints } from './field';
import { Surface } from './surfaces';
import { config } from './config';
import { ToolId } from './tools';

const SURFACE_COLORS = [0xcdbfa6, 0xe6dcc7, 0xd8cbb2]; // counter, back wall, right wall
const TOOL_TINT: Record<ToolId, number> = {
  cloth: 0x5fb2ff, // wet blue
  spray: 0x8be04a, // green
  broom: 0xffc85a, // straw
};

// Fixed ortho camera with a slight tilt — the 2.5D look from the spec.
export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  surfaceMeshes: THREE.Mesh[] = [];

  private viewSize = 7.2;
  private heatMeshes: THREE.Mesh[] = [];
  private heatTex: THREE.DataTexture[] = [];
  private heatData: Uint8Array[] = [];
  heatmapOn = false;

  // per surface: a filled disc + ring outline, both clipped to that surface.
  // A spray footprint lights up 1..3 of them.
  private cursorFills: THREE.Mesh[] = [];
  private cursorRings: THREE.Mesh[] = [];
  private cursorScratch = new THREE.Vector3();

  constructor(container: HTMLElement, private layout: Layout) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.localClippingEnabled = true; // cursor discs clip to each surface
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x14110e);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // inside the room, looking at the far corner: walls sit BEHIND the counter
    this.camera.position.set(-6, 12, -8.5);
    this.camera.lookAt(0.4, 0.6, 0.6);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-5, 11, -6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe8c0, 0.35);
    fill.position.set(4, 5, 2);
    this.scene.add(fill);

    this.buildDecor();
    this.buildSurfaces();
    this.buildCursor();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Four world-space planes bounding a surface's rectangle. A disc drawn in the
  // surface plane is clipped to exactly this rectangle — so a footprint that
  // spills past a seam shows only the arc that truly lands on the surface.
  private edgePlanes(s: Surface): THREE.Plane[] {
    const ou = s.origin.dot(s.u), ov = s.origin.dot(s.v);
    return [
      new THREE.Plane(s.u.clone(), -ou),                       // (P-origin)·u >= 0
      new THREE.Plane(s.u.clone().negate(), ou + s.width),     // (P-origin)·u <= width
      new THREE.Plane(s.v.clone(), -ov),                       // (P-origin)·v >= 0
      new THREE.Plane(s.v.clone().negate(), ov + s.height),    // (P-origin)·v <= height
    ];
  }

  // per surface: filled disc + ring outline, oriented to the surface and clipped
  private buildCursor(): void {
    const fillGeo = new THREE.CircleGeometry(1.0, 56);
    const ringGeo = new THREE.RingGeometry(0.86, 1.0, 56);
    for (const s of this.layout.surfaces) {
      const planes = this.edgePlanes(s);
      const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(s.u, s.v, s.normal));
      const mk = (geo: THREE.BufferGeometry, opacity: number) => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity,
          depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          clippingPlanes: planes, clipIntersection: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.quaternion.copy(quat);
        m.renderOrder = 999;
        m.frustumCulled = false;
        m.visible = false;
        this.scene.add(m);
        return m;
      };
      this.cursorFills.push(mk(fillGeo, 0.16));
      this.cursorRings.push(mk(ringGeo, 0.95));
    }
  }

  showCursor(si: number, cx: number, cy: number, tool: ToolId): void {
    const worldR = tool === 'spray' ? config.spray.range : config.swipe.width;
    const rangeCells = worldR / config.world.cellSize;
    const tint = TOOL_TINT[tool];
    this.hideCursor();

    for (const f of discFootprints(this.layout, si, cx, cy, rangeCells)) {
      const s = this.layout.surfaces[f.s];
      s.toWorld(f.cx, f.cy, this.cursorScratch).addScaledVector(s.normal, 0.03);
      for (const arr of [this.cursorFills, this.cursorRings]) {
        const m = arr[f.s];
        m.position.copy(this.cursorScratch);
        m.scale.setScalar(worldR);
        (m.material as THREE.MeshBasicMaterial).color.setHex(tint);
        m.visible = true;
      }
    }
  }

  hideCursor(): void {
    for (const m of this.cursorFills) m.visible = false;
    for (const m of this.cursorRings) m.visible = false;
  }

  private orient(mesh: THREE.Mesh, si: number): void {
    const s = this.layout.surfaces[si];
    const basis = new THREE.Matrix4().makeBasis(s.u, s.v, s.normal);
    mesh.quaternion.setFromRotationMatrix(basis);
    // PlaneGeometry is centered; our surface origin is a corner
    mesh.position.copy(s.origin)
      .addScaledVector(s.u, s.width / 2)
      .addScaledVector(s.v, s.height / 2);
  }

  // Purely cosmetic geometry so the corner reads as a kitchen, not folded paper.
  // None of this is in surfaceMeshes, so it never affects gameplay or picking.
  private buildDecor(): void {
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      return mesh;
    };

    // floor to ground the scene
    const floor = add(new THREE.PlaneGeometry(24, 20), 0x1b1610, 0, -0.62, 2);
    floor.rotation.x = -Math.PI / 2;

    // countertop slab: gives the play surface real thickness and a visible edge
    add(new THREE.BoxGeometry(8.3, 0.5, 4.3), 0x8a7a5c, 0, -0.27, 0);

    // solid backing on the OUTSIDE of the walls (away from the camera) for thickness
    add(new THREE.BoxGeometry(8.3, 4.1, 0.16), 0xada592, 0, 2.0, 2.08); // back wall
    add(new THREE.BoxGeometry(0.16, 4.1, 4.3), 0x9c947f, 4.08, 2.0, 0);  // right wall
  }

  private buildSurfaces(): void {
    this.layout.surfaces.forEach((s, si) => {
      const geo = new THREE.PlaneGeometry(s.width, s.height);
      const mat = new THREE.MeshStandardMaterial({
        color: SURFACE_COLORS[si % SURFACE_COLORS.length],
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide, // never cull a surface just because it faces away
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.surfaceIndex = si;
      this.orient(mesh, si);
      this.scene.add(mesh);
      this.surfaceMeshes.push(mesh);

      // heatmap overlay (hidden until toggled)
      const data = new Uint8Array(s.gW * s.gH * 4);
      const tex = new THREE.DataTexture(data, s.gW, s.gH, THREE.RGBAFormat);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const hmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false });
      const hmesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), hmat);
      this.orient(hmesh, si);
      hmesh.position.addScaledVector(s.normal, 0.01);
      hmesh.visible = false;
      this.scene.add(hmesh);
      this.heatMeshes.push(hmesh);
      this.heatTex.push(tex);
      this.heatData.push(data);
    });
  }

  toggleHeatmap(): void {
    this.heatmapOn = !this.heatmapOn;
    config.debug.heatmap = this.heatmapOn;
    this.heatMeshes.forEach((m) => (m.visible = this.heatmapOn));
  }

  updateHeatmap(field: Field): void {
    if (!this.heatmapOn) return;
    for (let si = 0; si < this.layout.surfaces.length; si++) {
      const g = field.grids[si];
      const nf = field.noFood[si];
      const data = this.heatData[si];
      const max = config.pheromone.max;
      for (let i = 0; i < g.length; i++) {
        const v = Math.min(1, g[i] / max);
        // black -> red -> yellow ramp; sprayed cells tinted blue
        data[i * 4 + 0] = Math.floor(255 * Math.min(1, v * 1.6));
        data[i * 4 + 1] = Math.floor(255 * Math.max(0, v * 1.6 - 0.6));
        data[i * 4 + 2] = nf[i] > 0 ? 120 : 0;
        data[i * 4 + 3] = Math.floor(255 * Math.min(1, v * 2 + (nf[i] > 0 ? 0.35 : 0)));
      }
      this.heatTex[si].needsUpdate = true;
    }
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const vs = this.viewSize;
    this.camera.left = -vs * aspect;
    this.camera.right = vs * aspect;
    this.camera.top = vs;
    this.camera.bottom = -vs;
    this.camera.updateProjectionMatrix();
  }

  cursorInfo(): unknown {
    return this.cursorRings.map((m) => ({
      vis: m.visible,
      pos: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)],
    }));
  }

  projectToScreen(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
