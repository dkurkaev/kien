import * as THREE from 'three';
import { config } from './config';
import { Layout } from './surfaces';
import { Interactions, Stroke, newStroke } from './interact';
import { ToolManager, ToolId } from './tools';

interface Sample {
  si: number;
  cx: number;
  cy: number;
  world: THREE.Vector3;
  time: number;
}

// what the input needs from the stage to draw the brush cursor
export interface CursorTarget {
  showCursor(si: number, cx: number, cy: number, tool: ToolId): void;
  hideCursor(): void;
}

// Pointer -> raycast onto a surface -> a wipe with start / direction / length /
// speed. Works for both mouse and finger (pointer events).
export class InputController {
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private active = false;
  private stroke: Stroke = newStroke();
  private last: Sample | null = null;

  constructor(
    dom: HTMLElement,
    private camera: THREE.Camera,
    private surfaceMeshes: THREE.Mesh[],
    private layout: Layout,
    private tools: ToolManager,
    private interactions: Interactions,
    private cursor: CursorTarget,
  ) {
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('pointerleave', () => this.cursor.hideCursor());
  }

  private pick(e: PointerEvent): Sample | null {
    this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.surfaceMeshes, false);
    if (!hits.length) return null;
    const si = hits[0].object.userData.surfaceIndex as number;
    const { cx, cy } = this.layout.surfaces[si].fromWorld(hits[0].point);
    return { si, cx, cy, world: hits[0].point.clone(), time: performance.now() };
  }

  private onDown = (e: PointerEvent) => {
    this.active = true;
    this.stroke = newStroke();
    this.last = this.pick(e);
    if (!this.last) return;
    this.cursor.showCursor(this.last.si, this.last.cx, this.last.cy, this.tools.current);
    // a plain click is a zero-length stroke — sprays a puff, dabs the cloth, etc.
    if (!this.tools.busy) {
      const s = this.last;
      this.interactions.applySegment(this.stroke, this.tools.current, s.si, s.cx, s.cy, s.cx, s.cy, false, 0);
    }
  };

  private onMove = (e: PointerEvent) => {
    const cur = this.pick(e);
    // cursor tracks the pointer whether or not a wipe is in progress
    if (cur) this.cursor.showCursor(cur.si, cur.cx, cur.cy, this.tools.current);
    else this.cursor.hideCursor();

    if (!this.active) return;
    if (!cur) { this.last = null; return; }
    const prev = this.last;
    this.last = cur;
    if (!prev || prev.si !== cur.si) return; // new surface -> start a fresh segment
    if (this.tools.busy) return; // mid-swap, the hand is changing tools

    const dt = Math.max(1e-3, (cur.time - prev.time) / 1000);
    const worldDist = cur.world.distanceTo(prev.world);
    const speed = worldDist / dt;
    const fast = speed > config.swipe.fastThreshold;

    this.interactions.applySegment(this.stroke, this.tools.current, cur.si, prev.cx, prev.cy, cur.cx, cur.cy, fast, speed);
  };

  private onUp = () => {
    this.active = false;
    this.last = null;
  };
}
