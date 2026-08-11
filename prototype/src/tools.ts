import { config } from './config';

export type ToolId = 'cloth' | 'spray' | 'broom';

export interface ToolDef {
  id: ToolId;
  name: string;
  hint: string;
  key: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'cloth', name: 'Тряпка', hint: 'жидкое · след', key: '1' },
  { id: 'spray', name: 'Спрей', hint: 'муравьи', key: '2' },
  { id: 'broom', name: 'Веник', hint: 'крошки', key: '3' },
];

// Switching tools costs time (with a lockout), so grouping actions under one tool
// is rewarded — and grouping means postponing.
export class ToolManager {
  current: ToolId = 'cloth';
  switching = 0; // seconds of lockout remaining

  select(id: ToolId): void {
    if (id === this.current || this.switching > 0) return;
    this.current = id;
    this.switching = config.tools.switchTime;
  }

  get busy(): boolean {
    return this.switching > 0;
  }

  update(dt: number): void {
    if (this.switching > 0) this.switching = Math.max(0, this.switching - dt);
  }
}
