import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat } from './core/combat';
import { WATER_LIMITS, type WaterCast } from './core/water-aoe';
import { WATER_PRESENTATION, WATER_DECORATION } from './content/water-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { AreaBatch } from './render/vfx/area-batch';
import { PixelBatch } from './render/vfx/pixel-batch';

/** Presentation reads cast positions, actual wave radii and real enemy timers. */
export class WaterVfx {
  readonly group = new THREE.Group();
  private areas = new AreaBatch(32);
  private splashes = new PixelBatch(WATER_LIMITS.impacts * 3 + 64, 2);
  private statuses = new PixelBatch(COMBAT_LIMITS.enemies * 2, 4);
  private detail: ProjectileDetail = 'full';
  constructor() { this.group.add(this.areas.mesh, this.splashes.mesh, this.statuses.mesh); }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() { this.areas.begin(); this.splashes.begin(); this.statuses.begin(); }
  update(combat: Combat, visible: boolean) {
    this.reset(); this.group.visible = visible;
    if (!visible) return;
    for (const cast of combat.waterAoe.casts) if (cast.active) this.cast(cast);
    for (const impact of combat.waterAoe.impacts) {
      if (!impact.active) continue;
      const progress = Math.min(1, impact.age / .28), fade = (1 - progress) ** 2;
      const count = WATER_DECORATION[this.detail].splashPieces;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 + impact.seed * 2.399963;
        const travel = progress * .48, size = .21 * (1 - progress * .5);
        this.splashes.put('droplet', impact.x + Math.cos(angle) * travel, .25 + Math.sin(progress * Math.PI) * .18,
          impact.z + Math.sin(angle) * travel, size, size * 1.3,
          WATER_PRESENTATION[impact.kind].edge, fade, angle);
      }
    }
    // Status markers are essential and do not disappear at reduced detail.
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.spawnTime > 0) continue;
      const radius = combat.enemyRadius(enemy);
      const height = enemy.rank === 'boss' ? 5.1 : enemy.rank === 'elite' ? 3.45 : enemy.kind === 'tank' ? 3 : 2.25;
      if ((enemy.wetTime ?? 0) > 0) this.statuses.put('droplet', enemy.x - .16, height, enemy.z,
        .24, .32, '#8fe5ff', .9);
      if ((enemy.slowTime ?? 0) > 0) this.statuses.put('streak', enemy.x, .1, enemy.z,
        Math.max(.5, radius * 1.8), .16, '#86ebda', .65);
    }
    this.areas.finish(); this.splashes.finish(); this.statuses.finish();
  }
  private cast(cast: WaterCast) {
    const spec = WATER_PRESENTATION[cast.kind];
    const remaining = Math.min(1, Math.max(0, (cast.duration - cast.age) / .18));
    if (cast.kind === 'azure-burst') {
      const progress = Math.max(0, (cast.age - .16) / Math.max(.01, cast.duration - .16));
      this.areas.put(cast.x, cast.z, cast.radius, 0, spec.color,
        cast.detonated ? spec.fill * (1 - progress) : .035, spec.height);
      this.edge(cast, cast.radius, cast.detonated ? .42 * (1 - progress) : .65, spec.edge);
      if (cast.detonated) this.areas.put(cast.x, cast.z, cast.radius * Math.min(1, progress * 2.8),
        Math.max(0, cast.radius * Math.min(1, progress * 2.8) - .13), spec.edge, .55 * (1 - progress), spec.height + .005);
      else this.splashes.put('star', cast.x, .12, cast.z, .6, .6, spec.edge, .85, cast.age * 4);
    } else if (cast.kind === 'star-tide') {
      for (let i = 0; i < cast.waveCount; i++) {
        const radius = cast.waves[i].radius;
        if (radius <= 0) continue;
        const fade = Math.max(.05, 1 - Math.max(0, cast.age - i * .22 - .75) / .2);
        this.areas.put(cast.x, cast.z, radius + .25, Math.max(0, radius - .25), spec.edge, .62 * fade, spec.height);
      }
    } else {
      const tickPhase = (cast.age % WATER_LIMITS.tick) / WATER_LIMITS.tick;
      this.areas.put(cast.x, cast.z, cast.radius, 0, spec.color, spec.fill * remaining, spec.height);
      this.edge(cast, cast.radius, .58 * remaining, spec.edge);
      if (this.detail === 'full') {
        const radius = cast.radius * (.25 + tickPhase * .65);
        this.areas.put(cast.x, cast.z, radius, Math.max(0, radius - .06), spec.color, .18 * remaining, spec.height + .004);
      }
      const count = WATER_DECORATION[this.detail].markers;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 + (cast.kind === 'returning-ring' ? cast.age * .45 : 0);
        const radius = cast.radius * .88;
        this.splashes.put('droplet', cast.x + Math.cos(angle) * radius, .08, cast.z + Math.sin(angle) * radius,
          .18, .25, spec.edge, .45 * remaining, angle);
      }
    }
  }
  private edge(cast: WaterCast, radius: number, alpha: number, color: string) {
    this.areas.put(cast.x, cast.z, radius, Math.max(0, radius - .07), color, alpha,
      WATER_PRESENTATION[cast.kind].height + .006);
  }
  inspect() {
    return { detail: this.detail, areaInstances: this.areas.mesh.count,
      splashInstances: this.splashes.mesh.count, statusInstances: this.statuses.mesh.count,
      splashCapacity: this.splashes.mesh.instanceMatrix.count };
  }
}
