import * as THREE from 'three';
import type { Combat } from './core/combat';
import { POSITION_LIMITS, type PositionCast } from './core/position-aoe';
import { POSITION_PRESENTATION as STYLES, POSITION_DECORATION } from './content/position-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { AreaBatch } from './render/vfx/area-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { StripBatch } from './render/vfx/strip-batch';

const CAST_CAPACITY = POSITION_LIMITS.vortex + POSITION_LIMITS.radiance + POSITION_LIMITS.trails + POSITION_LIMITS.recall;

/** Four distinct spell geometries. All ranges, centers and active phases come from PositionAoe. */
export class PositionVfx {
  readonly group = new THREE.Group();
  private areas = new AreaBatch(64);
  private rays = new StripBatch(POSITION_LIMITS.radiance * POSITION_LIMITS.beams * 2);
  private motes = new PixelBatch(CAST_CAPACITY * 8, 2);
  private feedback = new PixelBatch(POSITION_LIMITS.feedback * 4, 4);
  private detail: ProjectileDetail = 'full';
  private beamCount = 0;
  constructor() { this.group.add(this.areas.mesh, this.rays.mesh, this.motes.mesh, this.feedback.mesh); }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() { this.areas.begin(); this.rays.begin(); this.motes.begin(); this.feedback.begin(); this.beamCount = 0; }
  update(combat: Combat, visible: boolean) {
    this.reset(); this.group.visible = visible;
    if (!visible) return;
    for (const cast of combat.positionAoe.casts) {
      if (!cast.active) continue;
      if (cast.kind === 'ice-radiance' && cast.mode === 'rays') this.radiance(cast);
      else if (cast.kind === 'ice-radiance' || cast.kind === 'tidal-recall') this.wave(cast);
      else this.field(cast);
    }
    const quality = POSITION_DECORATION[this.detail];
    for (const event of combat.positionAoe.feedback) {
      if (!event.active) continue;
      const progress = Math.min(1, event.age / POSITION_LIMITS.feedbackDuration), fade = (1 - progress) ** 2;
      const style = STYLES[event.kind], pull = event.type === 'orb-pull';
      const color = pull ? '#f4eda5' : style.edge;
      this.feedback.put(pull ? 'star' : event.kind === 'spore-trail' ? 'leaf' : 'star',
        event.x, .3, event.z, .36 * (1 - progress * .4), .36 * (1 - progress * .4), color, fade);
      for (let i = 0; i < quality.feedbackPieces; i++) {
        const angle = i / quality.feedbackPieces * Math.PI * 2 + event.seed * 2.399963;
        const radius = pull ? .35 * (1 - progress) : .48 * progress;
        const shape = event.kind === 'spore-trail' ? 'leaf' : event.kind === 'ice-radiance' ? 'crystal' : 'droplet';
        this.feedback.put(pull ? 'star' : shape, event.x + Math.cos(angle) * radius,
          .25 + Math.sin(progress * Math.PI) * .12, event.z + Math.sin(angle) * radius,
          .16, .2, color, fade, angle);
      }
    }
    this.areas.finish(); this.rays.finish(); this.motes.finish(); this.feedback.finish();
  }
  private field(cast: PositionCast) {
    const style = STYLES[cast.kind], quality = POSITION_DECORATION[this.detail];
    const remaining = Math.min(1, Math.max(0, (cast.duration - cast.age) / .25));
    // Keep active field boundaries visible through their last damaging tick.
    this.areas.put(cast.x, cast.z, cast.radius, 0, style.color, style.fill * (.5 + remaining * .5), style.height);
    this.areas.put(cast.x, cast.z, cast.radius, Math.max(0, cast.radius - .07), style.edge,
      .3 + .2 * remaining, style.height + .006);
    if (cast.kind === 'abyss-vortex') {
      if (quality.innerRipples) for (let i = 0; i < 2; i++) {
        const phase = (cast.age * .55 + i * .5) % 1, radius = cast.radius * (1 - phase);
        this.areas.put(cast.x, cast.z, radius, Math.max(0, radius - .06), style.color, .3 * phase, style.height + .004);
      }
      for (let i = 0; i < quality.motes; i++) {
        const phase = (cast.age * .6 + i / quality.motes) % 1, angle = i / quality.motes * Math.PI * 2 + cast.age * .8;
        const radius = cast.radius * (1 - phase) * .85;
        this.motes.put('droplet', cast.x + Math.cos(angle) * radius, .12, cast.z + Math.sin(angle) * radius,
          .2, .29, style.edge, .5 * remaining, -angle);
      }
    } else {
      for (let i = 0; i < quality.motes; i++) {
        const angle = i / quality.motes * Math.PI * 2 + cast.castId, radius = cast.radius * .58;
        const flicker = .9 + Math.sin(cast.age * 12 + i) * .1;
        this.motes.put('flame', cast.x + Math.cos(angle) * radius, .09, cast.z + Math.sin(angle) * radius,
          .28 * flicker, .2, style.edge, .55 * remaining, -angle);
      }
    }
  }
  private radiance(cast: PositionCast) {
    const style = STYLES[cast.kind], quality = POSITION_DECORATION[this.detail];
    const flash = Math.max(0, 1 - Math.max(0, cast.age - POSITION_LIMITS.rayWarning) / .35);
    const remaining = Math.min(1, Math.max(0, (cast.duration - cast.age) / .2));
    for (let i = 0; i < cast.beams; i++) {
      const angle = cast.angle + i / cast.beams * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      const ax = cast.x + c * POSITION_LIMITS.rayStart, az = cast.z + s * POSITION_LIMITS.rayStart;
      const bx = cast.x + c * cast.radius, bz = cast.z + s * cast.radius;
      this.rays.put(ax, az, bx, bz, POSITION_LIMITS.rayHalfWidth * 2, style.color,
        (cast.fired ? .05 + flash * .5 : .32) * remaining, style.height, !cast.fired);
      if (cast.fired && quality.beamCore) this.rays.put(ax, az, bx, bz, .08, style.edge,
        flash * .7 * remaining, style.height + .005);
      this.beamCount++;
    }
    this.motes.put('snowflake', cast.x, .14, cast.z, .42, .42, style.edge, .7 * remaining, -cast.angle);
  }
  private wave(cast: PositionCast) {
    const style = STYLES[cast.kind], recall = cast.kind === 'tidal-recall';
    const returning = recall && cast.age > cast.duration / 2;
    if (!recall && cast.age <= POSITION_LIMITS.ringWarning) {
      this.areas.put(cast.x, cast.z, cast.radius, Math.max(0, cast.radius - .045), style.color, .24, style.height);
      this.motes.put('snowflake', cast.x, .14, cast.z, .42, .42, style.edge, .8); return;
    }
    const radius = cast.ringRadius, band = POSITION_LIMITS.ringBand;
    this.areas.put(cast.x, cast.z, radius + band, Math.max(0, radius - band), returning ? style.edge : style.color, .6, style.height);
    this.motes.put(returning ? 'star' : 'droplet', cast.x, .12, cast.z, .2, .26,
      returning ? style.edge : style.color, .55);
  }
  inspect() {
    return { detail: this.detail, areaInstances: this.areas.mesh.count, beams: this.beamCount,
      beamInstances: this.rays.mesh.count, moteInstances: this.motes.mesh.count, feedbackInstances: this.feedback.mesh.count,
      castCapacity: CAST_CAPACITY, feedbackCapacity: POSITION_LIMITS.feedback };
  }
}
