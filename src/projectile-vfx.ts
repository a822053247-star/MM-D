import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat, type Projectile } from './core/combat';
import { presentedProjectile, PROJECTILE_VISUAL_CAPACITY } from './core/projectile-presentation';
import { PROJECTILE_RECIPES, PROJECTILE_DECORATION, type ProjectileDetail } from './content/projectile-recipes';
import { EFFECT_ATLASES } from './content/effect-recipes';
import type { EffectAssets } from './assets/effect-assets';
import { AtlasBatch } from './render/vfx/atlas-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { TrailBatch } from './render/vfx/trail-batch';

/** Draws essential bodies first. Decoration capacity/quality can never hide a live body. */
export class ProjectileVfx {
  readonly group = new THREE.Group();
  private bodies = new PixelBatch(COMBAT_LIMITS.projectiles * 2, 5);
  private darts = new AtlasBatch(EFFECT_ATLASES['dream-dart'], COMBAT_LIMITS.projectiles, 'dart');
  private trails = new TrailBatch(COMBAT_LIMITS.projectiles);
  private particles = new PixelBatch(PROJECTILE_VISUAL_CAPACITY * 6, 4);
  private epoch = -1;
  private lastSample = -1;
  private detail: ProjectileDetail = 'full';
  constructor(private assets: EffectAssets) {
    this.group.add(this.trails.batch.mesh, this.bodies.mesh, this.darts.mesh, this.particles.mesh);
  }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() {
    this.trails.reset(); this.bodies.begin(); this.darts.begin(); this.particles.begin(); this.lastSample = -1;
  }
  sample(combat: Combat) {
    if (this.epoch !== combat.projectilePresentation.epoch) {
      this.reset(); this.epoch = combat.projectilePresentation.epoch;
    }
    if (this.lastSample === combat.elapsed) return;
    this.lastSample = combat.elapsed; this.trails.sample(combat.projectiles, combat.elapsed);
  }
  owns(shot: Projectile) { return !!presentedProjectile(shot); }
  update(combat: Combat, visible: boolean) {
    this.sample(combat);
    this.group.visible = visible;
    this.bodies.begin(); this.darts.begin(); this.trails.begin(); this.particles.begin();
    this.darts.setTexture(this.assets.texture('dream-dart'));
    if (!visible) return;
    for (const shot of combat.projectiles) {
      const attack = presentedProjectile(shot);
      if (!shot.active || !attack) continue;
      const recipe = PROJECTILE_RECIPES[attack], scale = Math.max(.25, combat.projectileRadius(shot) / .2);
      const age = shot.age ?? 0;
      const angle = -Math.atan2(shot.vz, shot.vx) + (attack === 'leaf' ? Math.sin(age * 18) * .08 : 0);
      const flicker = attack === 'spark' ? 1 + (Math.floor(age * 12) % 4 - 1.5) * .035 : 1;
      if (recipe.body === 'dream-atlas' && this.darts.loaded) {
        this.darts.put(Math.floor(age * 10) % 4, shot.x, recipe.height, shot.z,
          recipe.width * scale, recipe.depth * scale, .96, angle);
      } else {
        const shape = recipe.body === 'dream-atlas' ? 'star' : recipe.body;
        this.bodies.put(shape, shot.x, recipe.height, shot.z, recipe.width * scale * flicker, recipe.depth * scale, recipe.color, 1, angle);
        // The core is part of the silhouette and is retained at reduced detail.
        const bubble = attack === 'bubble';
        this.bodies.put(bubble ? 'star' : shape, shot.x + (bubble ? .12 * scale : 0), recipe.height + .006,
          shot.z - (bubble ? .1 * scale : 0), recipe.width * scale * (bubble ? .18 : .48),
          recipe.depth * scale * (bubble ? .18 : .44), recipe.core, .96, angle);
      }
    }
    this.trails.put(combat.projectiles, combat.elapsed, this.detail, shot => combat.projectileRadius(shot));
    this.feedback(combat);
    this.bodies.finish(); this.darts.finish(); this.trails.finish(); this.particles.finish();
  }
  private feedback(combat: Combat) {
    const quality = PROJECTILE_DECORATION[this.detail];
    for (const event of combat.projectilePresentation.events) {
      if (!event.serial) continue;
      const recipe = PROJECTILE_RECIPES[event.attack], impact = event.kind === 'impact';
      const duration = impact ? recipe.impact.duration : recipe.expire.duration;
      const age = Math.max(0, combat.elapsed - event.at), progress = age / duration;
      if (progress >= 1) continue;
      const scale = Math.max(.4, event.radius / .2), fade = (1 - progress) ** 2;
      const direction = -Math.atan2(event.vz, event.vx);
      if (!impact) {
        const size = recipe.expire.size * scale * (1 - progress * .6);
        this.particles.put(recipe.expire.shape, event.x, recipe.height, event.z,
          size, size, recipe.trail.color, fade * .7, direction + progress * .4);
        continue;
      }
      const pieces = Math.min(recipe.impact.pieces, quality.impactPieces);
      for (let i = 0; i < pieces; i++) {
        const angle = i / pieces * Math.PI * 2 + event.serial * 2.399963;
        const travel = recipe.impact.spread * scale * progress;
        const size = (.19 + (i % 2) * .045) * scale * (1 - progress * .65);
        this.particles.put(recipe.impact.shape, event.x + Math.cos(angle) * travel,
          recipe.height + Math.sin(progress * Math.PI) * .14, event.z + Math.sin(angle) * travel,
          size * (event.attack === 'leaf' ? 1.8 : 1), size, recipe.impact.color, fade, angle + progress * 1.4);
      }
      if (quality.halo) this.particles.put(recipe.impact.flash, event.x, recipe.height + .01, event.z,
        .5 * scale * (1 + progress), .5 * scale * (1 + progress), recipe.core, fade * .6, direction);
    }
  }
  inspect() {
    return { detail: this.detail, bodyInstances: this.bodies.mesh.count, dartInstances: this.darts.mesh.count,
      trailInstances: this.trails.batch.mesh.count, feedbackInstances: this.particles.mesh.count,
      feedbackCapacity: PROJECTILE_VISUAL_CAPACITY };
  }
}
