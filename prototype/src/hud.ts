import { TOOLS, ToolManager, ToolId } from './tools';

// Minimal on-screen tool switch. No score, no menus — just which tool is in hand
// and whether the hand is mid-swap.
export class Hud {
  private buttons = new Map<ToolId, HTMLElement>();

  constructor(private tools: ToolManager) {
    const hud = document.getElementById('hud')!;
    for (const t of TOOLS) {
      const el = document.createElement('div');
      el.className = 'tool';
      el.innerHTML = `${t.key} · ${t.name}<small>${t.hint}</small>`;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); tools.select(t.id); });
      hud.appendChild(el);
      this.buttons.set(t.id, el);
    }
  }

  update(): void {
    for (const [id, el] of this.buttons) {
      el.classList.toggle('active', id === this.tools.current);
      el.classList.toggle('switching', this.tools.busy);
    }
  }
}
