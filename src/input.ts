import type { Touch, TouchEvent } from './platform';
import type { FirstRun } from './model';

export interface Button { x: number; y: number; w: number; h: number; action: string }
export const inside = (x: number, y: number, b: Button) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export class TouchInput {
  movement = { x: 0, z: 0 };
  joystick?: { id: number; x: number; y: number; dx: number; dy: number };
  private presses = new Map<number, { action: string; x: number; y: number; version: number; moved: boolean }>();
  constructor(private model: FirstRun, private size: () => { width: number; height: number },
    private buttons: () => readonly Button[], private action: (id: string) => void) {}
  private point(touch: Touch) {
    const size = this.size();
    return { x: touch.clientX * 960 / size.width, y: touch.clientY * 960 / size.width };
  }
  start = (event: TouchEvent) => {
    for (const touch of event.changedTouches) {
      const p = this.point(touch), button = this.buttons().find(b => inside(p.x, p.y, b));
      if (button) this.presses.set(touch.identifier, { action: button.action, ...p, version: this.model.version, moved: false });
      else if (this.model.mode === 'playing' && p.x < 480 && !this.joystick) {
        this.joystick = { id: touch.identifier, ...p, dx: 0, dy: 0 };
      }
    }
  };
  move = (event: TouchEvent) => {
    for (const touch of event.changedTouches) {
      const p = this.point(touch), press = this.presses.get(touch.identifier);
      if (press && Math.hypot(p.x - press.x, p.y - press.y) > 14) press.moved = true;
      if (this.joystick?.id !== touch.identifier) continue;
      let dx = p.x - this.joystick.x, dy = p.y - this.joystick.y;
      const length = Math.hypot(dx, dy), scale = Math.max(1, length / 48);
      this.joystick.dx = dx / scale; this.joystick.dy = dy / scale;
      const force = Math.max(0, Math.min(1, (length / 48 - .14) / .86));
      this.movement.x = length > 0 ? dx / length * force : 0;
      // The world camera has no horizontal rotation; compensate its XZ tilt.
      this.movement.z = length > 0 ? dy / length * force : 0;
    }
  };
  end = (event: TouchEvent) => {
    for (const touch of event.changedTouches) {
      if (this.joystick?.id === touch.identifier) { this.joystick = undefined; this.movement.x = this.movement.z = 0; }
      const press = this.presses.get(touch.identifier); this.presses.delete(touch.identifier);
      if (!press || press.moved || press.version !== this.model.version) continue;
      const p = this.point(touch);
      if (Math.hypot(p.x - press.x, p.y - press.y) > 14) continue;
      const button = this.buttons().find(b => b.action === press.action && inside(p.x, p.y, b));
      if (button) this.action(button.action);
    }
  };
  cancel = (event: TouchEvent) => {
    for (const touch of event.changedTouches) {
      this.presses.delete(touch.identifier);
      if (this.joystick?.id === touch.identifier) { this.joystick = undefined; this.movement.x = this.movement.z = 0; }
    }
  };
  reset() { this.presses.clear(); this.joystick = undefined; this.movement.x = this.movement.z = 0; }
}
