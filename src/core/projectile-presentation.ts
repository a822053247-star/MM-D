import type { Projectile } from './combat';

export type PresentedProjectile = 'spark' | 'leaf' | 'dream-dart' | 'bubble' | 'frost-crystal' | 'resonance-seed';
export function presentedProjectile(shot: Readonly<Projectile>): PresentedProjectile | undefined {
  if (shot.attackRules?.pairId || shot.vfxPresetId || shot.fusionIds?.length) return undefined;
  const attack = shot.attackId ?? 'spark';
  return attack === 'spark' || attack === 'leaf' || attack === 'dream-dart' || attack === 'bubble'
    || attack === 'frost-crystal' || attack === 'resonance-seed' ? attack : undefined;
}
export interface ProjectileVisualEvent {
  serial: number; attack: PresentedProjectile; kind: 'impact' | 'wall' | 'expire';
  x: number; z: number; at: number; vx: number; vz: number; radius: number;
}
export const PROJECTILE_VISUAL_CAPACITY = 96;

/** Bounded read-only presentation output; never participates in damage or randomness. */
export class ProjectilePresentation {
  private slots: ProjectileVisualEvent[] = Array.from({ length: PROJECTILE_VISUAL_CAPACITY }, () => ({
    serial: 0, attack: 'spark', kind: 'expire', x: 0, z: 0, at: 0, vx: 0, vz: 0, radius: .2,
  }));
  readonly events: readonly Readonly<ProjectileVisualEvent>[] = this.slots;
  private version = 0;
  get epoch() { return this.version; }
  private serial = 0;
  record(shot: Readonly<Projectile>, kind: ProjectileVisualEvent['kind'], x: number, z: number, at: number, radius: number) {
    const attack = presentedProjectile(shot);
    if (!attack) return false;
    const event = this.slots[this.serial % this.slots.length];
    event.serial = ++this.serial; event.attack = attack; event.kind = kind;
    event.x = x; event.z = z; event.at = at; event.vx = shot.vx; event.vz = shot.vz; event.radius = radius;
    return true;
  }
  clear() { this.version++; this.serial = 0; for (const event of this.slots) event.serial = 0; }
}
