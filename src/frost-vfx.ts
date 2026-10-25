import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat } from './core/combat';
import { FROST_RULES } from './core/frost-combat';
import { ICE_LIMITS } from './core/ice-skills';
import { FROST_PRESENTATION as COLORS, FROST_DECORATION } from './content/frost-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { AreaBatch } from './render/vfx/area-batch';
import { CapsuleBatch } from './render/vfx/capsule-batch';
import { PixelBatch } from './render/vfx/pixel-batch';

/** One owner for chill/freeze/immunity status and the existing glacier patch pool. */
export class FrostVfx {
  readonly group = new THREE.Group();
  private patches = new CapsuleBatch(ICE_LIMITS.trails * 2);
  private patchCrystals = new PixelBatch(ICE_LIMITS.trails * 4, 2);
  private frozenOutlines = new AreaBatch(COMBAT_LIMITS.enemies, 2);
  private statuses = new PixelBatch(COMBAT_LIMITS.enemies * 4, 4);
  private events = new PixelBatch(FROST_RULES.effects * 5, 4);
  private detail: ProjectileDetail = 'full';
  constructor() {
    this.group.add(this.patches.mesh, this.patchCrystals.mesh, this.frozenOutlines.mesh, this.statuses.mesh, this.events.mesh);
  }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() {
    this.patches.begin(); this.patchCrystals.begin(); this.frozenOutlines.begin(); this.statuses.begin(); this.events.begin();
  }
  update(combat: Combat, visible: boolean) {
    this.reset(); this.group.visible = visible;
    if (!visible) return;
    const quality = FROST_DECORATION[this.detail];
    for (const patch of combat.iceSkills.trails) {
      if (!patch.active) continue;
      const fade = Math.min(1, Math.max(0, (patch.duration - patch.age) / .3));
      this.patches.put(patch.x, patch.z, ICE_LIMITS.trailHalfLength, patch.radius, patch.angle,
        COLORS.patch, .025 + .035 * fade, false);
      this.patches.put(patch.x, patch.z, ICE_LIMITS.trailHalfLength, patch.radius, patch.angle,
        COLORS.edge, .3 + .25 * fade, true);
      for (let i = 0; i < quality.patchCrystals; i++) {
        const along = quality.patchCrystals === 1 ? 0 : (i / (quality.patchCrystals - 1) - .5) * ICE_LIMITS.trailHalfLength * 2;
        const across = (i % 2 ? -1 : 1) * patch.radius * .25;
        const c = Math.cos(patch.angle), s = Math.sin(patch.angle);
        this.patchCrystals.put('crystal', patch.x + c * along - s * across, .065, patch.z + s * along + c * across,
          .24, .13, COLORS.shard, .4 * fade, -patch.angle);
      }
    }
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.spawnTime > 0) continue;
      const height = enemy.rank === 'boss' ? 5.1 : enemy.rank === 'elite' ? 3.45 : enemy.kind === 'tank' ? 3 : 2.25;
      if ((enemy.freezeTime ?? 0) > 0) {
        const radius = combat.enemyRadius(enemy) + .12;
        this.frozenOutlines.put(enemy.x, enemy.z, radius, Math.max(0, radius - .06), COLORS.frozen, .55, .09);
        this.statuses.put('snowflake', enemy.x + .16, height, enemy.z, .34, .34, COLORS.frozen, .95);
        // Frozen state remains fully visible at reduced quality; these shards are status, not debris.
        for (let i = 0; i < 3; i++) {
          const angle = i / 3 * Math.PI * 2 + enemy.id;
          this.statuses.put('crystal', enemy.x + Math.cos(angle) * radius * .8, .16,
            enemy.z + Math.sin(angle) * radius * .8, .3, .16, COLORS.frozen, .72, -angle);
        }
      } else {
        if ((enemy.chillTime ?? 0) > 0) this.statuses.put('crystal', enemy.x - .18, height + .12, enemy.z,
          .3, .18, COLORS.chill, .9, Math.PI / 3);
        if ((enemy.freezeImmuneTime ?? 0) > 0) {
          // A crossed gray snowflake means freeze resistance, never a damage shield.
          this.statuses.put('snowflake', enemy.x + .22, height, enemy.z, .24, .24, COLORS.immune, .75);
          this.statuses.put('streak', enemy.x + .22, height + .005, enemy.z, .29, .055, COLORS.immune, .95, -Math.PI / 4);
        }
      }
    }
    for (const event of combat.frost.events) {
      if (!event.active || (event.kind === 'impact' && event.impactSource === 'projectile')) continue;
      const progress = Math.min(1, event.age / FROST_RULES.effectDuration), fade = (1 - progress) ** 2;
      const color = event.kind === 'resist' ? COLORS.immune : COLORS.shard;
      if (event.kind !== 'thaw') this.events.put(event.kind === 'impact' ? 'crystal' : 'snowflake',
        event.x, .3, event.z, .5 + progress * .2, .5 + progress * .2, color, fade);
      for (let i = 0; i < quality.eventPieces; i++) {
        const angle = i / quality.eventPieces * Math.PI * 2 + event.seed * 2.399963;
        const travel = progress * (event.kind === 'impact' ? .35 : .65), size = .22 * (1 - progress * .6);
        this.events.put('crystal', event.x + Math.cos(angle) * travel, .25 + Math.sin(progress * Math.PI) * .13,
          event.z + Math.sin(angle) * travel, size, size * .55, color, fade, angle + progress);
      }
    }
    this.patches.finish(); this.patchCrystals.finish(); this.frozenOutlines.finish(); this.statuses.finish(); this.events.finish();
  }
  inspect() {
    return { detail: this.detail, patchInstances: this.patches.mesh.count, patchDecorationInstances: this.patchCrystals.mesh.count,
      frozenOutlines: this.frozenOutlines.mesh.count, statusInstances: this.statuses.mesh.count, eventInstances: this.events.mesh.count,
      patchCapacity: ICE_LIMITS.trails, statusCapacity: this.statuses.mesh.instanceMatrix.count };
  }
}
