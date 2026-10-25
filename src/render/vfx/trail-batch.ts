import { PixelBatch } from './pixel-batch';
import { PROJECTILE_RECIPES, PROJECTILE_DECORATION, type ProjectileDetail } from '../../content/projectile-recipes';
import { presentedProjectile } from '../../core/projectile-presentation';
import type { Projectile } from '../../core/combat';
import { PathHistory, PATH_POINTS } from './path-history';

/** Six actual fixed-step positions per pool slot. Reuse never connects two different shots. */
export class TrailBatch {
  readonly batch: PixelBatch;
  private history: PathHistory;
  private births: Float64Array;
  private roots: Float64Array;
  private generations: Float64Array;
  private ages: Float64Array;
  constructor(private capacity: number) {
    this.batch = new PixelBatch(capacity * (PATH_POINTS - 1), 3);
    this.history = new PathHistory(capacity);
    this.births = new Float64Array(capacity); this.roots = new Float64Array(capacity);
    this.generations = new Float64Array(capacity); this.ages = new Float64Array(capacity);
  }
  reset() { this.history.reset(); this.batch.begin(); }
  sample(shots: readonly Projectile[], time: number) {
    for (let slot = 0; slot < this.capacity; slot++) {
      const shot = shots[slot];
      if (!shot?.active || !presentedProjectile(shot)) { this.history.clear(slot); continue; }
      const birth = shot.bornTick ?? -1, root = shot.relicSource?.rootId ?? -1, generation = shot.generation ?? 0, age = shot.age ?? 0;
      if (!this.history.count(slot) || birth !== this.births[slot] || root !== this.roots[slot]
        || generation !== this.generations[slot] || age < this.ages[slot]) {
        this.history.clear(slot);
        this.history.add(slot, shot.previousX, shot.previousZ, time - 1 / 60);
      }
      this.births[slot] = birth; this.roots[slot] = root; this.generations[slot] = generation; this.ages[slot] = age;
      this.history.add(slot, shot.x, shot.z, time);
    }
  }
  begin() { this.batch.begin(); }
  put(shots: readonly Projectile[], time: number, detail: ProjectileDetail, radius: (shot: Projectile) => number) {
    for (let slot = 0; slot < this.capacity; slot++) {
      const shot = shots[slot], attack = shot && presentedProjectile(shot);
      if (!shot?.active || !attack || this.history.count(slot) < 2) continue;
      const recipe = PROJECTILE_RECIPES[attack], spec = recipe.trail;
      const scale = Math.max(.25, radius(shot) / .2), maxSegments = PROJECTILE_DECORATION[detail].trailSegments;
      let distance = 0;
      for (let segment = 0; segment < Math.min(this.history.count(slot) - 1, maxSegments); segment++) {
        const ax = this.history.x(slot, segment), az = this.history.z(slot, segment);
        const bx = this.history.x(slot, segment + 1), bz = this.history.z(slot, segment + 1);
        const age = Math.max(0, time - this.history.time(slot, segment + 1));
        if (age >= spec.duration) break;
        const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
        if (length < .001) continue;
        // Never fabricate a tail beyond a teleport or a reused slot.
        if (length > spec.length * scale || distance + length > spec.length * scale) break;
        distance += length;
        const fade = (1 - age / spec.duration) * (1 - segment / PATH_POINTS);
        this.batch.put('streak', (ax + bx) / 2, recipe.height - .015,
          (az + bz) / 2, length * 1.08, spec.width * scale * fade,
          spec.color, spec.opacity * fade, -Math.atan2(dz, dx));
      }
    }
  }
  finish() { this.batch.finish(); }
}
